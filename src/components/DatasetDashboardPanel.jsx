import { useMemo, useState } from "react";
import { getDatasetPresentation } from "../lib/datasetPresentation";

function formatNumber(value, digits = 1, suffix = "") {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Number(value).toFixed(digits)}${suffix}`;
}

function groupCount(items, keyFn) {
  const counts = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || "Undefined";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function sum(items, valueFn) {
  return items.reduce((total, item) => total + (Number(valueFn(item)) || 0), 0);
}

function DonutChart({ data = [], title }) {
  const total = data.reduce((value, item) => value + item.value, 0);
  let offset = 0;

  return (
    <article className="analysis-card">
      <div className="analysis-card-head">
        <div>
          <h2>{title}</h2>
          <p>Dataset counts grouped from the published measurement library manifest.</p>
        </div>
      </div>
      {total ? (
        <div className="comparison-wafer-grid-list" style={{ gridTemplateColumns: "220px minmax(0, 1fr)", alignItems: "center" }}>
          <svg viewBox="0 0 120 120" className="comparison-wafer-svg" role="img" aria-label={title}>
            <circle cx="60" cy="60" r="34" fill="none" stroke="#e8eef0" strokeWidth="18" />
            {data.map((item, index) => {
              const fraction = item.value / total;
              const length = fraction * 214;
              const dashOffset = -offset;
              offset += length;
              return (
                <circle
                  key={`${item.label}-${index}`}
                  cx="60"
                  cy="60"
                  r="34"
                  fill="none"
                  stroke={`hsl(${175 - index * 28} 66% 48%)`}
                  strokeWidth="18"
                  strokeDasharray={`${length} 214`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 60 60)"
                />
              );
            })}
            <text x="60" y="56" textAnchor="middle" className="wafermap-axis-label" style={{ fontSize: "8px" }}>Datasets</text>
            <text x="60" y="67" textAnchor="middle" className="wafermap-slot-label" style={{ fontSize: "12px" }}>{total}</text>
          </svg>
          <div className="dashboard-table-wrap">
            <table>
              <tbody>
                {data.map((item, index) => (
                  <tr key={`legend-${item.label}`}>
                    <th><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: `hsl(${175 - index * 28} 66% 48%)`, marginRight: 8 }} />{item.label}</th>
                    <td>{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <div className="chart-empty compact">No manifest data is available yet.</div>}
    </article>
  );
}

function BarChart({ data = [], title, formatter = (value) => value }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <article className="analysis-card">
      <div className="analysis-card-head">
        <div>
          <h2>{title}</h2>
          <p>Filter the dashboard to compare which MPW runs and platforms are most represented.</p>
        </div>
      </div>
      {data.length ? (
        <div className="comparison-wafer-grid-list" style={{ gridTemplateColumns: "1fr" }}>
          {data.map((item, index) => (
            <div key={`${item.label}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr) 90px", gap: 12, alignItems: "center" }}>
              <strong>{item.label}</strong>
              <div style={{ height: 10, borderRadius: 999, background: "#e9eff1", overflow: "hidden" }}>
                <div style={{ width: `${(item.value / max) * 100}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, hsl(${185 - index * 10} 64% 42%), hsl(${154 - index * 8} 68% 54%))` }} />
              </div>
              <span>{formatter(item.value)}</span>
            </div>
          ))}
        </div>
      ) : <div className="chart-empty compact">No data matches the active filter.</div>}
    </article>
  );
}

export default function DatasetDashboardPanel({
  remoteDatasets = [],
  onAnalyzeDataset,
  onLoadDataset
}) {
  const [platformFilter, setPlatformFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState("The dashboard reads the GitHub measurement manifest immediately and can calculate slot-level propagation summaries on demand.");
  const [analyticsById, setAnalyticsById] = useState({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const platforms = useMemo(
    () => ["all", ...new Set(remoteDatasets.map((dataset) => dataset.platformLabel || dataset.platformDisplayName || "Platform Undefined"))],
    [remoteDatasets]
  );
  const projects = useMemo(
    () => ["all", ...new Set(remoteDatasets.map((dataset) => getDatasetPresentation(dataset).projectDisplayName || dataset.projectName || dataset.label))],
    [remoteDatasets]
  );

  const filteredDatasets = useMemo(
    () => remoteDatasets.filter((dataset) => {
      const platform = dataset.platformLabel || dataset.platformDisplayName || "Platform Undefined";
      const project = getDatasetPresentation(dataset).projectDisplayName || dataset.projectName || dataset.label;
      return (platformFilter === "all" || platform === platformFilter)
        && (projectFilter === "all" || project === projectFilter);
    }),
    [platformFilter, projectFilter, remoteDatasets]
  );

  const platformCounts = useMemo(
    () => groupCount(filteredDatasets, (dataset) => dataset.platformLabel || dataset.platformDisplayName || "Platform Undefined"),
    [filteredDatasets]
  );
  const mpwCounts = useMemo(
    () => groupCount(filteredDatasets, (dataset) => getDatasetPresentation(dataset).projectDisplayName || dataset.projectName || dataset.label),
    [filteredDatasets]
  );
  const measurementTypeCounts = useMemo(
    () => groupCount(filteredDatasets, (dataset) => dataset.measurementType || getDatasetPresentation(dataset).measurementType || "MeasurementTypeUndefined"),
    [filteredDatasets]
  );
  const analyticsRows = useMemo(
    () => filteredDatasets
      .map((dataset) => ({
        dataset,
        analytics: analyticsById[dataset.id] || null
      }))
      .sort((a, b) => {
        const aValue = a.analytics?.propagationAverage ?? Number.POSITIVE_INFINITY;
        const bValue = b.analytics?.propagationAverage ?? Number.POSITIVE_INFINITY;
        return aValue - bValue;
      }),
    [analyticsById, filteredDatasets]
  );

  async function analyzeFiltered() {
    const targets = filteredDatasets.filter((dataset) => !analyticsById[dataset.id]);
    if (!targets.length) {
      setStatusMessage("Filtered datasets are already analysed.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const nextEntries = {};
      for (const dataset of targets) {
        setStatusMessage(`Analysing ${dataset.label}...`);
        nextEntries[dataset.id] = await onAnalyzeDataset(dataset);
      }
      setAnalyticsById((previous) => ({ ...previous, ...nextEntries }));
      setStatusMessage(`Analysed ${targets.length} dataset(s). The dashboard now includes average propagation loss and yield for the filtered library view.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Dataset analytics failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Dashboard</h2>
            <p>Review everything currently published in the GitHub measurement library, filter by platform or MPW, and calculate wafer-level propagation summaries from the saved datasets.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={analyzeFiltered} disabled={isAnalyzing || !filteredDatasets.length}>{isAnalyzing ? "Analysing..." : "Analyse Filtered Datasets"}</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>Platform</span>
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
              {platforms.map((platform) => <option key={platform} value={platform}>{platform === "all" ? "All platforms" : platform}</option>)}
            </select>
          </label>
          <label className="mapping-field">
            <span>Project / MPW</span>
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              {projects.map((project) => <option key={project} value={project}>{project === "all" ? "All MPWs" : project}</option>)}
            </select>
          </label>
        </div>

        <div className="translator-metrics github-library-metrics">
          <div><strong>{filteredDatasets.length}</strong><span>Published datasets</span></div>
          <div><strong>{platformCounts.length}</strong><span>Platforms</span></div>
          <div><strong>{mpwCounts.length}</strong><span>MPW runs</span></div>
          <div><strong>{sum(filteredDatasets, (dataset) => dataset.traceCount || 0)}</strong><span>Saved traces</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Dashboard Status</h2>
            <p>{statusMessage}</p>
          </div>
        </div>
      </article>

      <DonutChart data={platformCounts.slice(0, 6)} title="Platform Coverage" />
      <BarChart data={mpwCounts.slice(0, 8)} title="Most Active MPW Runs" formatter={(value) => `${value} dataset${value === 1 ? "" : "s"}`} />
      <BarChart data={measurementTypeCounts} title="Measurement Types" formatter={(value) => `${value}`} />

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Published Library Table</h2>
            <p>Rows with analytics loaded include average propagation loss and yield computed from the raw traces behind the manifest.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Platform</th>
                <th>Slot</th>
                <th>Waveguide</th>
                <th>Files</th>
                <th>Avg propagation</th>
                <th>Yield</th>
                <th>Measured chips</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {analyticsRows.length ? analyticsRows.map(({ dataset, analytics }) => {
                const presentation = getDatasetPresentation(dataset);
                return (
                  <tr key={`dashboard-${dataset.id}`}>
                    <td>
                      <strong>{dataset.label}</strong>
                      <div className="dataset-subcopy">{presentation.projectDisplayName || dataset.projectName || "--"}</div>
                    </td>
                    <td>{dataset.platformLabel || dataset.platformDisplayName || "--"}</td>
                    <td>{presentation.slot || dataset.slot || "--"}</td>
                    <td>{presentation.waveguideType || dataset.waveguideType || "--"}</td>
                    <td>{dataset.traceCount ?? dataset.files?.length ?? "--"}</td>
                    <td>{formatNumber(analytics?.propagationAverage, 2, " dB/cm")}</td>
                    <td>{formatNumber(analytics?.yield, 1, "%")}</td>
                    <td>{analytics?.measuredChips ?? dataset.chipCount ?? "--"}</td>
                    <td className="library-table-actions">
                      <button type="button" onClick={() => onLoadDataset(dataset)}>Load</button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="9"><div className="chart-empty compact">No GitHub datasets match the active filters.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
