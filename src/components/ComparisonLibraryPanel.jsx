import { useMemo, useState } from "react";
import { buildNormalizedRows, inferColumnMap, readNamedTextRows } from "../lib/parsers";
import { calculateAllMetrics, summarizeDataset, getMetricRange, metricLabel } from "../lib/analysis";
import { getWaferTemplateLayout, shortChipLabel } from "../lib/waferTemplates";

function bundledAssetUrl(relativePath) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${base}${String(relativePath || "").replace(/^\/+/, "")}`;
}

function formatValue(value, digits = 2, suffix = "") {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Number(value).toFixed(digits)}${suffix}`;
}

function ComparisonSummaryCards({ results }) {
  const datasets = results.length;
  const propagationValues = results.map((result) => result.metrics.propagation.summaryStats.avgPropagationLossDbPerCm).filter((value) => value !== null);
  const insertionValues = results.map((result) => result.metrics.propagation.summaryStats.avgInsertionLossDb).filter((value) => value !== null);
  const heaterValues = results.map((result) => result.metrics.heater.byChip.length ? result.metrics.heater.byChip.reduce((sum, item) => sum + item.efficiencyMwPerPi, 0) / result.metrics.heater.byChip.length : null).filter((value) => value !== null);

  return (
    <div className="translator-metrics comparison-summary-grid">
      <div><strong>{datasets}</strong><span>Compared datasets</span></div>
      <div><strong>{formatValue(propagationValues.reduce((sum, value) => sum + value, 0) / Math.max(propagationValues.length, 1), 2, " dB/cm")}</strong><span>Mean propagation loss</span></div>
      <div><strong>{formatValue(insertionValues.reduce((sum, value) => sum + value, 0) / Math.max(insertionValues.length, 1), 2, " dB")}</strong><span>Mean insertion loss</span></div>
      <div><strong>{formatValue(heaterValues.reduce((sum, value) => sum + value, 0) / Math.max(heaterValues.length, 1), 2, " mW/pi")}</strong><span>Mean heater efficiency</span></div>
    </div>
  );
}

function ComparisonBars({ results, metric }) {
  const values = results
    .map((result) => ({
      id: result.dataset.id,
      label: result.dataset.projectName || result.dataset.label,
      value: metric === "propagation"
        ? result.metrics.propagation.summaryStats.avgPropagationLossDbPerCm
        : metric === "insertion"
          ? result.metrics.propagation.summaryStats.avgInsertionLossDb
          : result.metrics.heater.byChip.length
            ? result.metrics.heater.byChip.reduce((sum, item) => sum + item.efficiencyMwPerPi, 0) / result.metrics.heater.byChip.length
            : null
    }))
    .filter((item) => item.value !== null && item.value !== undefined);

  if (!values.length) return <div className="chart-empty compact">No comparison values available for {metricLabel(metric).toLowerCase()}.</div>;
  const min = Math.min(...values.map((item) => item.value));
  const max = Math.max(...values.map((item) => item.value));

  return (
    <div className="comparison-bar-list">
      {values.map((item) => {
        const ratio = max === min ? 0.72 : 0.2 + ((item.value - min) / Math.max(max - min, 0.0001)) * 0.8;
        return (
          <div key={`${metric}-${item.id}`} className="comparison-bar-item">
            <div className="comparison-bar-copy">
              <strong>{item.label}</strong>
              <span>{formatValue(item.value, metric === "heater" ? 1 : 2)}</span>
            </div>
            <div className="comparison-bar-track">
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniWaferMap({ cells, metricKey, template, sharedRange }) {
  const templateLayout = getWaferTemplateLayout(template || []);
  const cols = Math.max(...templateLayout.map((cell) => cell.dieX || 0), 1);
  const rowValues = Array.from(new Set(templateLayout.map((cell) => cell.dieY))).sort((a, b) => b - a);
  const hue = metricKey === "heater" ? 16 : metricKey === "insertion" ? 210 : 174;
  const lookup = new Map(cells.map((cell) => [cell.chipId, cell]));
  const colorFor = (value) => {
    if (!sharedRange || value === null || value === undefined) return "#eef2f4";
    const ratio = Math.min(Math.max((value - sharedRange.min) / Math.max(sharedRange.max - sharedRange.min, 0.0001), 0), 1);
    return `hsl(${hue} 72% ${82 - ratio * 34}%)`;
  };

  return (
    <div className="comparison-wafer-shell">
      <div className="comparison-wafer-outline">
        <div className="wafer-notch notch-south" />
        <div className="comparison-wafer-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {rowValues.flatMap((row) =>
            Array.from({ length: cols }, (_, index) => {
              const dieX = index + 1;
              const slot = templateLayout.find((item) => item.dieX === dieX && item.dieY === row);
              const cell = slot ? lookup.get(slot.chipId) : null;
              return (
                <div
                  key={`${row}-${dieX}`}
                  className={cell ? "comparison-wafer-cell active" : "comparison-wafer-cell"}
                  style={cell ? { background: colorFor(cell.value) } : undefined}
                  title={cell ? `${cell.chipId}: ${formatValue(cell.value, metricKey === "heater" ? 1 : 2)}` : `No chip (${dieX}, ${row})`}
                >
                  {slot ? shortChipLabel(slot.chipId) : ""}
                </div>
              );
            })
          )}
        </div>
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
    name: dataset.label || dataset.projectName || "Measurement dataset",
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
      setStatusMessage(`Compared ${nextResults.length} dataset(s). Review the wafermaps and wafer-level metrics below to inspect process variation across slots, MPW runs, and waveguide types.`);
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
                <th>Mode</th>
                <th>Project</th>
                <th>Wafer</th>
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
                  <td>{dataset.measurementMode || dataset.sourceType || dataset.sourceMeta?.type || "--"}</td>
                  <td>{dataset.projectName || "--"}</td>
                  <td>{dataset.waferName || "--"}</td>
                  <td>{dataset.traceCount ?? dataset.files?.length ?? dataset.display?.sourceLabel ?? "--"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6"><div className="chart-empty compact">No datasets are available for comparison yet.</div></td>
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
                        <strong>{result.dataset.projectName || result.dataset.label}</strong>
                        <div className="dataset-subcopy">{result.dataset.waferName || "--"}</div>
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

          <article className="analysis-card comparison-grid-card">
            <div className="comparison-grid-two">
              <div>
                <h2>Metric Comparison</h2>
                <ComparisonBars results={results} metric={waferMetric} />
              </div>
              <div>
                <h2>Wafermaps</h2>
                <div className="comparison-wafer-grid-list">
                  {results.map((result) => (
                    <article key={`wafer-${result.dataset.id}`} className="comparison-wafer-card">
                      <header>
                        <strong>{result.dataset.projectName || result.dataset.label}</strong>
                        <span>{result.dataset.waferName || "--"}</span>
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
              </div>
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}
