import { useMemo, useState } from "react";
import { buildNormalizedRows, inferColumnMap, readNamedTextRows } from "../lib/parsers";
import { calculateAllMetrics, getMetricRange, metricLabel, summarizeDataset } from "../lib/analysis";
import { getWaferTemplateLayout } from "../lib/waferTemplates";
import { getDatasetPresentation } from "../lib/datasetPresentation";
import { buildWaferMapFigureModel } from "../lib/wafermapFigure";

function bundledAssetUrl(relativePath) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${base}${String(relativePath || "").replace(/^\/+/, "")}`;
}

function formatValue(value, digits = 2, suffix = "") {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Number(value).toFixed(digits)}${suffix}`;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

function rangeStats(values) {
  if (!values.length) {
    return { mean: null, std: null, min: null, max: null, range: null };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    mean: mean(values),
    std: standardDeviation(values),
    min,
    max,
    range: max - min
  };
}

function datasetMetricValue(result, metricKey) {
  if (metricKey === "yield") return result.metrics.propagation.passRate;
  if (metricKey === "measuredChips") return result.metrics.propagation.summaryStats.measuredChips;
  if (metricKey === "propagation") return result.metrics.propagation.summaryStats.avgPropagationLossDbPerCm;
  if (metricKey === "insertion") return result.metrics.propagation.summaryStats.avgInsertionLossDb;
  if (metricKey === "peak") return result.metrics.propagation.summaryStats.avgPeakWavelengthNm;
  if (metricKey === "bandwidth") return result.metrics.propagation.summaryStats.avgBandwidth3dBNm;
  return null;
}

function metricConfig(metricKey) {
  return {
    yield: { label: "Yield", digits: 1, suffix: "%" },
    measuredChips: { label: "Measured chips", digits: 0, suffix: "" },
    propagation: { label: "Avg propagation loss", digits: 2, suffix: " dB/cm" },
    insertion: { label: "Avg insertion loss", digits: 2, suffix: " dB" },
    peak: { label: "Avg peak wavelength", digits: 1, suffix: " nm" },
    bandwidth: { label: "Avg 3 dB bandwidth", digits: 1, suffix: " nm" }
  }[metricKey];
}

function ComparisonSummaryCards({ results }) {
  const measuredChips = results.map((result) => datasetMetricValue(result, "measuredChips")).filter((value) => value !== null);
  const yieldValues = results.map((result) => datasetMetricValue(result, "yield")).filter((value) => value !== null);
  const propagationValues = results.map((result) => datasetMetricValue(result, "propagation")).filter((value) => value !== null);
  const peakValues = results.map((result) => datasetMetricValue(result, "peak")).filter((value) => value !== null);

  const yieldStats = rangeStats(yieldValues);
  const propagationStats = rangeStats(propagationValues);
  const peakStats = rangeStats(peakValues);

  return (
    <div className="translator-metrics comparison-summary-grid">
      <div><strong>{results.length}</strong><span>Compared datasets</span></div>
      <div><strong>{formatValue(mean(measuredChips), 0)}</strong><span>Average measured chips</span></div>
      <div><strong>{formatValue(yieldStats.range, 1, "%")}</strong><span>Yield spread</span></div>
      <div><strong>{formatValue(propagationStats.range, 2, " dB/cm")}</strong><span>Propagation spread</span></div>
      <div><strong>{formatValue(peakStats.range, 1, " nm")}</strong><span>Peak wavelength spread</span></div>
    </div>
  );
}

function ComparisonAnalytics({ results, selectedMetric, onMetricChange, referenceDatasetId, onReferenceChange }) {
  const config = metricConfig(selectedMetric);
  const values = results
    .map((result) => ({
      id: result.dataset.id,
      label: getDatasetPresentation(result.dataset).projectDisplayName || result.dataset.projectName || result.dataset.label,
      value: datasetMetricValue(result, selectedMetric)
    }))
    .filter((item) => item.value !== null && item.value !== undefined && !Number.isNaN(item.value));

  const stats = rangeStats(values.map((item) => item.value));
  const reference = values.find((item) => item.id === referenceDatasetId) || values[0] || null;

  return (
    <article className="analysis-card">
      <div className="analysis-card-head">
        <div>
          <h2>Comparison Analytics</h2>
          <p>Use the metric selector to inspect dataset-to-dataset spread, standard deviation, and delta against a chosen reference wafer.</p>
        </div>
      </div>
      <div className="comparison-controls-grid settings-grid settings-grid-extended">
        <label className="mapping-field">
          <span>Analysis metric</span>
          <select value={selectedMetric} onChange={(event) => onMetricChange(event.target.value)}>
            <option value="yield">Yield</option>
            <option value="measuredChips">Measured chips</option>
            <option value="propagation">Average propagation loss</option>
            <option value="insertion">Average insertion loss</option>
            <option value="peak">Average peak wavelength</option>
            <option value="bandwidth">Average 3 dB bandwidth</option>
          </select>
        </label>
        <label className="mapping-field">
          <span>Reference dataset</span>
          <select value={reference?.id || ""} onChange={(event) => onReferenceChange(event.target.value)}>
            {values.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="comparison-analytics-grid">
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Statistic</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>{config.label} mean</td><td>{formatValue(stats.mean, config.digits, config.suffix)}</td></tr>
              <tr><td>{config.label} std. dev.</td><td>{formatValue(stats.std, config.digits, config.suffix)}</td></tr>
              <tr><td>{config.label} minimum</td><td>{formatValue(stats.min, config.digits, config.suffix)}</td></tr>
              <tr><td>{config.label} maximum</td><td>{formatValue(stats.max, config.digits, config.suffix)}</td></tr>
              <tr><td>{config.label} range</td><td>{formatValue(stats.range, config.digits, config.suffix)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>{config.label}</th>
                <th>Delta vs reference</th>
              </tr>
            </thead>
            <tbody>
              {values.map((item) => (
                <tr key={`delta-${item.id}`}>
                  <td>{item.label}</td>
                  <td>{formatValue(item.value, config.digits, config.suffix)}</td>
                  <td>{reference ? formatValue(item.value - reference.value, config.digits, config.suffix) : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

function metricCellsForComparison(result, metricKey) {
  if (metricKey !== "chip") return result.metrics[metricKey]?.waferMetric || [];
  return result.metrics.propagation?.waferMetric?.length
    ? result.metrics.propagation.waferMetric
    : result.metrics.insertion?.waferMetric?.length
      ? result.metrics.insertion.waferMetric
      : result.metrics.heater?.waferMetric || [];
}

function MiniWaferMap({ cells, metricKey, template, colorRange, overlayMode, displayMode, propagationByChip, scaleMode }) {
  const templateLayout = getWaferTemplateLayout(template || []);
  const lookup = new Map(cells.map((cell) => [cell.chipId, cell]));
  const statusLookup = new Map((propagationByChip || []).map((item) => [
    item.chipId,
    item.passMse ? "passing" : item.mse !== null && item.mse !== undefined ? "failed" : "unfitted"
  ]));
  const layout = templateLayout.length ? templateLayout : cells;
  const mapCells = layout.map((slot) => {
    const measured = lookup.get(slot.chipId) || null;
    const hasMetricValue = measured?.value !== null && measured?.value !== undefined;
    const propagationStatus = statusLookup.get(slot.chipId) || "unmeasured";
    const isActiveInView = displayMode === "all"
      || (displayMode === "measured" && Boolean(measured))
      || displayMode === propagationStatus;
    return {
      ...slot,
      value: measured?.value ?? null,
      detail: measured?.detail || (measured ? formatValue(measured.value, metricKey === "heater" ? 1 : 2) : "No measurement loaded"),
      hasMeasurement: metricKey === "chip" ? true : hasMetricValue,
      isActiveInView,
      isVisible: true
    };
  });
  const figure = buildWaferMapFigureModel({
    cells: mapCells,
    metricKey,
    overlayMode: metricKey === "chip" ? "chip" : overlayMode,
    colorScaleMin: colorRange?.min,
    colorScaleMid: colorRange?.mid,
    colorScaleMax: colorRange?.max
  });
  const scaleUnit = metricKey === "propagation" ? "dB/cm" : metricKey === "heater" ? "mW/π" : "dB";
  const measuredCount = layout.filter((slot) => lookup.has(slot.chipId)).length;
  const scaleCaption = colorRange ? (scaleMode === "shared" ? "Shared scale" : "Custom scale") : "Per-wafer scale";

  return (
    <div className="comparison-wafer-shell">
      <div className={`wafer-card-layout comparison-wafer-layout${metricKey === "chip" ? " comparison-wafer-layout-no-scale" : ""}`}>
        <div className="wafer-outline-shell">
          <svg viewBox={`0 0 ${figure.svgWidth} ${figure.svgHeight}`} className="wafermap-svg" role="img" aria-label={`Comparison wafermap for ${metricLabel(metricKey)}`}>
            <circle cx={figure.waferCenterX} cy={figure.waferCenterY} r={figure.waferRadius} className="wafermap-circle" />
            <path d={`M ${figure.waferCenterX - 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32} A 2.16 2.16 0 0 1 ${figure.waferCenterX + 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32}`} className="wafermap-notch-stroke" />
            {figure.colValues.map((column) => (
              <text
                key={`comparison-column-${column}`}
                x={figure.mapLeft + (column - figure.colValues[0]) * figure.stepX + figure.stepX / 2}
                y={10.8}
                textAnchor="middle"
                className="wafermap-axis-label"
              >
                {column}
              </text>
            ))}
            {figure.rowValues.map((row) => (
              <text
                key={`comparison-row-${row}`}
                x={5}
                y={figure.mapTop + (figure.rowValues[0] - row) * figure.stepY + figure.stepY / 2 + 0.4}
                textAnchor="middle"
                className="wafermap-axis-label"
              >
                {row}
              </text>
            ))}
            {figure.cells.map((cell) => (
              <g key={cell.chipId} className="wafermap-slot-group">
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={figure.cellWidth}
                  height={figure.cellHeight}
                  rx="0.35"
                  className={cell.interactive ? "wafermap-slot active" : "wafermap-slot"}
                  style={cell.fill ? { fill: cell.fill } : undefined}
                >
                  <title>{`${cell.chipId}: ${cell.detail || "No measurement loaded"}`}</title>
                </rect>
                {cell.label ? (
                  <text
                    x={cell.x + figure.cellWidth / 2}
                    y={cell.y + figure.cellHeight / 2 + figure.labelFontSize * 0.32}
                    textAnchor="middle"
                    className={cell.interactive ? "wafermap-slot-label" : "wafermap-slot-label muted"}
                    style={{ fontSize: `${figure.labelFontSize}px` }}
                  >
                    {cell.label}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </div>
        {metricKey !== "chip" ? (
          <div className="wafer-side-scale" aria-label={`${metricLabel(metricKey)} colour scale`}>
            <span className="wafer-scale-title">{scaleCaption}</span>
            <div className="wafer-scale-bar" aria-hidden="true" />
            <div className="wafer-scale-labels">
              <span><strong>{figure.range ? figure.range.max.toFixed(2) : "--"}</strong><small>High</small></span>
              <span><strong>{figure.range ? figure.range.mid.toFixed(2) : "--"}</strong><small>Mid</small></span>
              <span><strong>{figure.range ? figure.range.min.toFixed(2) : "--"}</strong><small>Low</small></span>
            </div>
            <span className="wafer-scale-unit">{scaleUnit}</span>
          </div>
        ) : null}
      </div>
      <div className="comparison-wafer-meta-row">
        <span>{measuredCount} measured chips</span>
        <span>{metricKey === "chip" ? "Chip-number view" : scaleMode === "shared" ? "Shared colour scale" : scaleMode === "custom" ? "Custom colour scale" : "Scale calculated for this wafer"}</span>
      </div>
    </div>
  );
}

async function loadRemoteDatasetRows(dataset, sourceMeta) {
  const files = Array.isArray(dataset.files) ? dataset.files : [];
  const loaded = await Promise.all(files.map(async (fileName) => {
    const response = await fetch(bundledAssetUrl(`${dataset.folder}/${fileName}`), { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to fetch ${fileName} (${response.status}).`);
    const text = await response.text();
    return readNamedTextRows(fileName, text, {
      launchPowerDbm: sourceMeta.launchPowerDbm,
      defaultMetricFamily: sourceMeta.defaultMetricFamily,
      defaultWavelengthNm: sourceMeta.defaultWavelengthNm
    });
  }));
  return loaded.flat();
}

function buildComparisonSourceMeta(dataset, sourceMeta) {
  return {
    ...sourceMeta,
    name: dataset.label || getDatasetPresentation(dataset).projectDisplayName || dataset.projectName || "Measurement dataset",
    type: dataset.measurementMode || dataset.sourceType || "Measurement"
  };
}

export default function ComparisonLibraryPanel({
  remoteDatasets = [],
  localDatasets = [],
  sourceMeta,
  waferTemplate
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [results, setResults] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Select two or more datasets from the GitHub library or your saved local snapshots, then click Compare.");
  const [isComparing, setIsComparing] = useState(false);
  const [waferMetric, setWaferMetric] = useState("propagation");
  const [waferScaleMode, setWaferScaleMode] = useState("shared");
  const [waferOverlayMode, setWaferOverlayMode] = useState("chip");
  const [waferDisplayMode, setWaferDisplayMode] = useState("all");
  const [waferScaleDraft, setWaferScaleDraft] = useState({ min: "", mid: "", max: "" });
  const [analysisMetric, setAnalysisMetric] = useState("propagation");
  const [referenceDatasetId, setReferenceDatasetId] = useState("");
  const [selectedProject, setSelectedProject] = useState("all");

  const datasetOptions = useMemo(
    () => [
      ...remoteDatasets.map((dataset) => ({ ...dataset, scope: "remote" })),
      ...localDatasets.map((dataset) => ({ ...dataset, scope: "local" }))
    ],
    [localDatasets, remoteDatasets]
  );

  const projectOptions = useMemo(
    () => Array.from(new Set(datasetOptions.map((dataset) => getDatasetPresentation(dataset).projectDisplayName).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })),
    [datasetOptions]
  );

  const filteredDatasetOptions = useMemo(
    () => selectedProject === "all"
      ? datasetOptions
      : datasetOptions.filter((dataset) => getDatasetPresentation(dataset).projectDisplayName === selectedProject),
    [datasetOptions, selectedProject]
  );

  const sharedRange = useMemo(() => {
    if (waferMetric === "chip") return null;
    const allCells = results.flatMap((result) => metricCellsForComparison(result, waferMetric));
    return getMetricRange(allCells);
  }, [results, waferMetric]);

  const customRange = useMemo(() => {
    const min = Number(waferScaleDraft.min);
    const max = Number(waferScaleDraft.max);
    if (waferScaleDraft.min === "" || waferScaleDraft.max === "" || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    const requestedMid = Number(waferScaleDraft.mid);
    const mid = waferScaleDraft.mid !== "" && Number.isFinite(requestedMid) && requestedMid > min && requestedMid < max
      ? requestedMid
      : (min + max) / 2;
    return { min, mid, max };
  }, [waferScaleDraft]);

  const comparisonColorRange = customRange || (waferScaleMode === "shared" ? sharedRange : null);

  function toggleDataset(datasetId) {
    setSelectedIds((previous) => previous.includes(datasetId) ? previous.filter((id) => id !== datasetId) : [...previous, datasetId]);
  }

  function updateScaleDraft(field, value) {
    setWaferScaleDraft((previous) => ({ ...previous, [field]: value }));
  }

  function changeWaferMetric(nextMetric) {
    setWaferMetric(nextMetric);
    setWaferScaleDraft({ min: "", mid: "", max: "" });
  }

  function changeWaferScaleMode(nextMode) {
    setWaferScaleMode(nextMode);
    setWaferScaleDraft({ min: "", mid: "", max: "" });
  }

  function resetWaferScale() {
    setWaferScaleDraft({ min: "", mid: "", max: "" });
  }

  function changeProjectFilter(nextProject) {
    setSelectedProject(nextProject);
    if (nextProject === "all") return;
    const visibleIds = new Set(datasetOptions
      .filter((dataset) => getDatasetPresentation(dataset).projectDisplayName === nextProject)
      .map((dataset) => dataset.id));
    setSelectedIds((previous) => previous.filter((id) => visibleIds.has(id)));
  }

  async function compareSelected() {
    if (selectedIds.length < 2) {
      setStatusMessage("Choose at least two datasets before comparing.");
      return;
    }

    setIsComparing(true);
    setStatusMessage(`Loading ${selectedIds.length} dataset(s) for comparison...`);
    try {
      const nextResults = [];
      for (const datasetId of selectedIds) {
        const dataset = datasetOptions.find((item) => item.id === datasetId);
        if (!dataset) continue;
        const nextSourceMeta = buildComparisonSourceMeta(dataset, sourceMeta);
        const rawRows = dataset.scope === "remote"
          ? await loadRemoteDatasetRows(dataset, nextSourceMeta)
          : (dataset.rawRows || []);
        const columnMap = dataset.scope === "local" && dataset.columnMap
          ? dataset.columnMap
          : inferColumnMap(Object.keys(rawRows[0] || {}));
        const normalizedRows = buildNormalizedRows(rawRows, columnMap, nextSourceMeta);
        const metrics = calculateAllMetrics(normalizedRows, {
          propagation: {
            targetWavelengthNm: nextSourceMeta.propagationTargetWavelengthNm,
            windowNm: nextSourceMeta.propagationWindowNm,
            spectralStepNm: nextSourceMeta.propagationSpectralStepNm,
            mseThreshold: nextSourceMeta.propagationMseThreshold
          }
        });
        nextResults.push({
          dataset,
          metrics,
          datasetSummary: summarizeDataset(normalizedRows)
        });
      }
      setResults(nextResults);
      setReferenceDatasetId(nextResults[0]?.dataset.id || "");
      setStatusMessage(`Compared ${nextResults.length} dataset(s). Review the wafermaps, range statistics, and deltas versus a reference wafer to inspect process variation across slots, MPW runs, and waveguide types.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Dataset comparison failed.");
    } finally {
      setIsComparing(false);
    }
  }

  return (
    <section className="library-stack">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Comparison</h2>
            <p>Compare two or more uploaded wafer datasets across propagation loss, insertion loss, heater efficiency, wafer yield, and chip-level wafermaps. This is designed to help track slot-to-slot, rib-vs-strip, and MPW-to-MPW cleanroom variation.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={compareSelected} disabled={isComparing || selectedIds.length < 2}>{isComparing ? "Comparing..." : "Compare Selected"}</button>
            <button type="button" className="ghost-action" onClick={() => setSelectedIds([])}>Clear Selection</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>Project filter</span>
            <select value={selectedProject} onChange={(event) => changeProjectFilter(event.target.value)}>
              <option value="all">All projects</option>
              {projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}
            </select>
          </label>
        </div>

        <div className="dashboard-table-wrap comparison-selector-table">
          <table>
            <thead>
              <tr>
                                <th>Select</th>
                <th>Dataset</th>
                <th>Project</th>
                <th>Slot</th>
                <th>Waveguide Type</th>
                <th>Measurement Mode</th>
                <th>Measurement Type</th>
                <th>Files</th>
              </tr>
            </thead>
            <tbody>
              {filteredDatasetOptions.length ? filteredDatasetOptions.map((dataset) => (
                <tr key={`comparison-${dataset.scope}-${dataset.id}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(dataset.id)}
                      onChange={() => toggleDataset(dataset.id)}
                    />
                  </td>
                  <td>
                    <strong>{dataset.label || dataset.projectName || "Measurement dataset"}</strong>
                    <div className="dataset-subcopy">{dataset.scope === "remote" ? "GitHub library" : "Local snapshot"}</div>
                  </td>
                                    <td>{getDatasetPresentation(dataset).projectDisplayName || dataset.projectName || "--"}</td>
                  <td>{getDatasetPresentation(dataset).slot || "SlotUndefined"}</td>
                  <td>{getDatasetPresentation(dataset).waveguideType || "WaveguideUndefined"}</td>
                  <td>{getDatasetPresentation(dataset).measurementMode || dataset.sourceType || dataset.sourceMeta?.type || "--"}</td>
                  <td>{getDatasetPresentation(dataset).measurementType || "MeasurementTypeUndefined"}</td>
                  <td>{dataset.traceCount ?? dataset.files?.length ?? dataset.display?.sourceLabel ?? "--"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8"><div className="chart-empty compact">No datasets are available for the selected project.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Comparison Status</h2>
            <p>{statusMessage}</p>
          </div>
        </div>
        {results.length ? <ComparisonSummaryCards results={results} /> : <div className="chart-empty compact">Comparison results will appear here after you load at least two datasets.</div>}
      </article>

      {results.length ? (
        <>
          <article className="analysis-card">
            <div className="analysis-card-head">
              <div>
                <h2>Comparison Table</h2>
                <p>Wafer-level summary metrics for the selected datasets.</p>
              </div>
            </div>
            <div className="dashboard-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Measured chips</th>
                    <th>Yield</th>
                    <th>Avg propagation</th>
                    <th>Avg insertion</th>
                    <th>Avg peak WL</th>
                    <th>Avg 3 dB BW</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={`summary-${result.dataset.id}`}>
                      <td>
                        <strong>{getDatasetPresentation(result.dataset).projectDisplayName || result.dataset.projectName || result.dataset.label}</strong>
                        <div className="dataset-subcopy">{getDatasetPresentation(result.dataset).waferDisplayName || result.dataset.waferName || "--"}</div>
                      </td>
                      <td>{result.metrics.propagation.summaryStats.measuredChips}</td>
                      <td>{formatValue(result.metrics.propagation.passRate, 1, "%")}</td>
                      <td>{formatValue(result.metrics.propagation.summaryStats.avgPropagationLossDbPerCm, 2, " dB/cm")}</td>
                      <td>{formatValue(result.metrics.propagation.summaryStats.avgInsertionLossDb, 2, " dB")}</td>
                      <td>{formatValue(result.metrics.propagation.summaryStats.avgPeakWavelengthNm, 1, " nm")}</td>
                      <td>{formatValue(result.metrics.propagation.summaryStats.avgBandwidth3dBNm, 1, " nm")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <ComparisonAnalytics
            results={results}
            selectedMetric={analysisMetric}
            onMetricChange={setAnalysisMetric}
            referenceDatasetId={referenceDatasetId}
            onReferenceChange={setReferenceDatasetId}
          />

          <article className="analysis-card comparison-grid-card">
            <div className="analysis-card-head">
              <div>
                <h2>Wafermaps</h2>
                <p>Use the same display and scale controls as the workspace. Shared scaling supports direct colour comparison; per-wafer scaling reveals the spatial pattern within each wafer.</p>
              </div>
            </div>
            <div className="comparison-wafer-controls" aria-label="Comparison wafermap settings">
              <label><span>Wafermap mode</span><select value={waferMetric} onChange={(event) => changeWaferMetric(event.target.value)}><option value="chip">Chip Numbers</option><option value="propagation">Propagation Loss</option><option value="insertion">Insertion Loss</option><option value="heater">Heater Efficiency</option></select></label>
              <label><span>Scale basis</span><select value={waferScaleMode} onChange={(event) => changeWaferScaleMode(event.target.value)} disabled={waferMetric === "chip"}><option value="shared">Shared across wafers</option><option value="individual">Each wafer independently</option></select></label>
              <label><span>Show</span><select value={waferDisplayMode} onChange={(event) => setWaferDisplayMode(event.target.value)} disabled={waferMetric === "chip"}><option value="all">All Chips</option><option value="passing">Passed Chips</option><option value="failed">Failed Chips</option><option value="measured">Measured Chips</option></select></label>
              <label><span>Overlay</span><select value={waferMetric === "chip" ? "chip" : waferOverlayMode} onChange={(event) => setWaferOverlayMode(event.target.value)} disabled={waferMetric === "chip"}><option value="none">None</option><option value="chip">Chip ID</option><option value="value">Metric value</option></select></label>
              <label className="wafer-scale-control low"><span><i aria-hidden="true" />Scale Min</span><input type="number" step="any" value={waferScaleDraft.min} placeholder={sharedRange ? sharedRange.min.toFixed(2) : "Auto"} onChange={(event) => updateScaleDraft("min", event.target.value)} disabled={waferMetric === "chip"} /></label>
              <label className="wafer-scale-control medium"><span><i aria-hidden="true" />Scale Midpoint</span><input type="number" step="any" value={waferScaleDraft.mid} placeholder={sharedRange ? ((sharedRange.min + sharedRange.max) / 2).toFixed(2) : "Auto"} onChange={(event) => updateScaleDraft("mid", event.target.value)} disabled={waferMetric === "chip"} /></label>
              <label className="wafer-scale-control high"><span><i aria-hidden="true" />Scale Max</span><input type="number" step="any" value={waferScaleDraft.max} placeholder={sharedRange ? sharedRange.max.toFixed(2) : "Auto"} onChange={(event) => updateScaleDraft("max", event.target.value)} disabled={waferMetric === "chip"} /></label>
              <div className="comparison-wafer-scale-actions">
                <span>{customRange ? "Custom scale active for every wafer." : waferScaleMode === "shared" ? "Automatic shared scale." : "Automatic scale for each wafer."}</span>
                <button type="button" className="secondary-button wafer-scale-reset" onClick={resetWaferScale} disabled={!customRange}>Reset Scale</button>
              </div>
            </div>
            <div className="comparison-wafer-grid-list comparison-wafer-grid-wide">
              {results.map((result) => (
                <article key={`wafer-${result.dataset.id}`} className="comparison-wafer-card">
                  <header>
                    <strong>{getDatasetPresentation(result.dataset).projectDisplayName || result.dataset.projectName || result.dataset.label}</strong>
                    <span>{getDatasetPresentation(result.dataset).waferDisplayName || result.dataset.waferName || "--"}</span>
                  </header>
                  <MiniWaferMap
                    cells={metricCellsForComparison(result, waferMetric)}
                    metricKey={waferMetric}
                    template={waferTemplate}
                    colorRange={comparisonColorRange}
                    overlayMode={waferOverlayMode}
                    displayMode={waferDisplayMode}
                    propagationByChip={result.metrics.propagation?.byChip || []}
                    scaleMode={customRange ? "custom" : waferScaleMode}
                  />
                </article>
              ))}
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}
