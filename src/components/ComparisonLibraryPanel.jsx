import { useMemo, useState } from "react";
import { buildNormalizedRows, inferColumnMap, readNamedTextRows } from "../lib/parsers";
import { calculateAllMetrics, getMetricRange, summarizeDataset } from "../lib/analysis";
import { getWaferTemplateLayout, shortChipLabel } from "../lib/waferTemplates";
import { getDatasetPresentation } from "../lib/datasetPresentation";

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

function MiniWaferMap({ cells, metricKey, template, sharedRange }) {
  const templateLayout = getWaferTemplateLayout(template || []);
  const lookup = new Map(cells.map((cell) => [cell.chipId, cell]));
  const measuredSlots = templateLayout.filter((slot) => lookup.has(slot.chipId));
  const xValues = templateLayout.map((slot) => slot.dieX);
  const yValues = templateLayout.map((slot) => slot.dieY);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const colCount = Math.max(maxX - minX + 1, 1);
  const rowCount = Math.max(maxY - minY + 1, 1);
  const waferRadius = 44;
  const waferCenter = 50;
  const mapLeft = 23;
  const mapTop = 20;
  const mapWidth = 54;
  const mapHeight = 60;
  const stepX = mapWidth / colCount;
  const stepY = mapHeight / rowCount;
  const cellWidth = Math.min(stepX * 0.86, 5.4);
  const cellHeight = Math.min(stepY * 0.86, 5.4);
  const hue = metricKey === "heater" ? 16 : metricKey === "insertion" ? 210 : 174;
  const labelSize = measuredSlots.length > 14 ? 1.7 : measuredSlots.length > 8 ? 2.1 : 2.4;

  const colorFor = (value) => {
    if (!sharedRange || value === null || value === undefined) return "#eef3f5";
    const ratio = Math.min(Math.max((value - sharedRange.min) / Math.max(sharedRange.max - sharedRange.min, 0.0001), 0), 1);
    return `hsl(${hue} 74% ${84 - ratio * 38}%)`;
  };

  const positionedSlots = templateLayout.map((slot) => {
    const cell = lookup.get(slot.chipId) || null;
    const x = mapLeft + (slot.dieX - minX) * stepX + (stepX - cellWidth) / 2;
    const y = mapTop + (maxY - slot.dieY) * stepY + (stepY - cellHeight) / 2;
    return {
      ...slot,
      cell,
      x,
      y,
      active: Boolean(cell)
    };
  });

  return (
    <div className="comparison-wafer-shell">
      <svg viewBox="0 0 100 100" className="comparison-wafer-svg" role="img" aria-label="Comparison wafermap">
        <defs>
          <filter id="wafer-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#d8e3e6" floodOpacity="0.6" />
          </filter>
        </defs>
        <circle cx={waferCenter} cy={waferCenter} r={waferRadius} className="comparison-wafer-circle" filter="url(#wafer-shadow)" />
        <path d="M 46 94 A 4 4 0 0 0 54 94" className="comparison-wafer-notch-stroke" />
        <path d="M 46 94 A 4 4 0 0 0 54 94 L 54 99 L 46 99 Z" className="comparison-wafer-notch-fill" />
        {positionedSlots.map((slot) => (
          <g key={slot.chipId}>
            <rect
              x={slot.x}
              y={slot.y}
              width={cellWidth}
              height={cellHeight}
              rx="0.7"
              className={slot.active ? "comparison-wafer-slot active" : "comparison-wafer-slot"}
              style={slot.active ? { fill: colorFor(slot.cell?.value) } : undefined}
            >
              <title>
                {slot.active
                  ? `${slot.chipId}: ${formatValue(slot.cell?.value, metricKey === "heater" ? 1 : 2)}`
                  : `${slot.chipId}: no measurement`}
              </title>
            </rect>
            {slot.active ? (
              <text
                x={slot.x + cellWidth / 2}
                y={slot.y + cellHeight / 2 + labelSize * 0.35}
                textAnchor="middle"
                className="comparison-wafer-label"
                style={{ fontSize: `${labelSize}px` }}
              >
                {shortChipLabel(slot.chipId)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="comparison-wafer-meta-row">
        <span>{measuredSlots.length} measured chips</span>
        <span>{sharedRange ? `${formatValue(sharedRange.min, metricKey === "heater" ? 1 : 2)} to ${formatValue(sharedRange.max, metricKey === "heater" ? 1 : 2)}` : "No metric range"}</span>
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
  const [analysisMetric, setAnalysisMetric] = useState("propagation");
  const [referenceDatasetId, setReferenceDatasetId] = useState("");

  const datasetOptions = useMemo(
    () => [
      ...remoteDatasets.map((dataset) => ({ ...dataset, scope: "remote" })),
      ...localDatasets.map((dataset) => ({ ...dataset, scope: "local" }))
    ],
    [localDatasets, remoteDatasets]
  );

  const sharedRange = useMemo(() => {
    const allCells = results.flatMap((result) => result.metrics[waferMetric]?.waferMetric || []);
    return getMetricRange(allCells);
  }, [results, waferMetric]);

  const waferGridStyle = useMemo(() => {
    const count = results.length || 1;
    if (count === 1) return { gridTemplateColumns: "minmax(0, 1fr)" };
    if (count === 2) return { gridTemplateColumns: "repeat(2, minmax(360px, 1fr))" };
    if (count === 3) return { gridTemplateColumns: "repeat(2, minmax(320px, 1fr))" };
    return { gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" };
  }, [results.length]);

  function toggleDataset(datasetId) {
    setSelectedIds((previous) => previous.includes(datasetId) ? previous.filter((id) => id !== datasetId) : [...previous, datasetId].slice(-4));
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
            <span>Wafermap comparison metric</span>
            <select value={waferMetric} onChange={(event) => setWaferMetric(event.target.value)}>
              <option value="propagation">Propagation Loss</option>
              <option value="insertion">Insertion Loss</option>
              <option value="heater">Heater Efficiency</option>
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
              {datasetOptions.length ? datasetOptions.map((dataset) => (
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
                  <td colSpan="8"><div className="chart-empty compact">No datasets are available for comparison yet.</div></td>
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
                <p>Shared colour scaling is applied to the selected wafer metric so you can inspect chip-level spatial variation across wafers more fairly.</p>
              </div>
            </div>
            <div className="comparison-wafer-grid-list comparison-wafer-grid-wide" style={waferGridStyle}>
              {results.map((result) => (
                <article key={`wafer-${result.dataset.id}`} className="comparison-wafer-card">
                  <header>
                    <strong>{getDatasetPresentation(result.dataset).projectDisplayName || result.dataset.projectName || result.dataset.label}</strong>
                    <span>{getDatasetPresentation(result.dataset).waferDisplayName || result.dataset.waferName || "--"}</span>
                  </header>
                  <MiniWaferMap
                    cells={result.metrics[waferMetric]?.waferMetric || []}
                    metricKey={waferMetric}
                    template={waferTemplate}
                    sharedRange={sharedRange}
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
