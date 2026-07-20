import { getDatasetPresentation } from "../lib/datasetPresentation";

function GitHubStatusBadge({ status }) {
  if (!status) return <span className="dataset-status-chip">Local only</span>;
  const tone = status === "published" ? "success" : status === "publishing" ? "progress" : status === "failed" ? "danger" : "muted";
  const label = status === "published" ? "Saved to GitHub" : status === "publishing" ? "Publishing..." : status === "failed" ? "Publish failed" : "Local only";
  return <span className={`dataset-status-chip ${tone}`}>{label}</span>;
}

function safeDatasetDisplay(dataset = {}) {
  const display = dataset.display || {};
  const summaryRows = Number(dataset.summary?.rows);
  const displayRows = Number(display.rowCount);
  const rawSourceCount = Array.isArray(dataset.rawRows)
    ? new Set(dataset.rawRows.map((row) => row?.source_name).filter(Boolean)).size
    : 0;

  const presented = getDatasetPresentation(dataset);

  return {
    shortLabel: display.shortLabel || dataset.label || "Dataset snapshot",
    fullLabel: dataset.label || display.label || display.shortLabel || "Dataset snapshot",
        measurementMode: presented.measurementMode || display.measurementMode || dataset.sourceMeta?.type || "Measurement",
    measurementType: presented.measurementType || display.measurementType || "MeasurementTypeUndefined",
    projectName: presented.projectDisplayName || dataset.projectName || display.projectName || "--",
    slot: presented.slot || "SlotUndefined",
    waveguideType: presented.waveguideType || "WaveguideUndefined",
    waferName: presented.waferDisplayName || dataset.waferName || display.waferName || "--",
    sourceLabel: display.sourceLabel || `${rawSourceCount} file${rawSourceCount === 1 ? "" : "s"}`,
    rowText: Number.isFinite(summaryRows)
      ? summaryRows.toLocaleString()
      : Number.isFinite(displayRows)
        ? displayRows.toLocaleString()
        : "--",
    savedDisplay: dataset.savedDisplay || (dataset.savedAt ? new Date(dataset.savedAt).toLocaleString() : "--"),
    githubStatus: dataset.githubSync?.status || "local"
  };
}

export default function DatasetLibraryPanel({
  sourceMeta,
  appSettings,
  currentDatasetMeta,
  statusMessage,
  githubConfig,
  onGithubConfigChange,
  onSaveGithubConfig,
  onRefreshLibrary,
  remoteLibraryStatus,
  remoteDatasets,
  localDatasets,
  onSaveCurrentDataset,
  onClearWorkspace,
  onLoadRemoteDataset,
  onLoadLocalDataset,
  onDeleteLocalDataset,
  onPublishLocalDataset,
  loadingBundledId,
  publishingDatasetId
}) {
  const safeRemoteDatasets = Array.isArray(remoteDatasets) ? remoteDatasets : [];
  const safeLocalDatasets = Array.isArray(localDatasets) ? localDatasets : [];
  const safeGithubConfig = {
    owner: githubConfig?.owner || "",
    repo: githubConfig?.repo || "",
    branch: githubConfig?.branch || "main",
    token: githubConfig?.token || ""
  };

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Dataset Snapshots and GitHub Publish</h2>
            <p>Use this flow for uploaded measurement files: save a local dataset snapshot, review the generated naming, then publish that snapshot to the GitHub measurement-data library when it looks correct.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={() => onSaveCurrentDataset(false)} disabled={!currentDatasetMeta?.rowCount}>Save Dataset Snapshot</button>
            <button type="button" className="ghost-action" onClick={onRefreshLibrary}>Refresh GitHub Library</button>
            <button type="button" className="ghost-action" onClick={onClearWorkspace}>Clear Workspace</button>
          </div>
        </div>

        <div className="translator-metrics github-library-metrics">
          <div><strong>{currentDatasetMeta?.shortLabel || "No dataset"}</strong><span>Current dataset</span></div>
          <div><strong>{currentDatasetMeta?.measurementMode || sourceMeta?.type || "Measurement"}</strong><span>Measurement mode</span></div>
          <div><strong>{safeRemoteDatasets.length}</strong><span>GitHub library sets</span></div>
          <div><strong>Snapshot to Review to Publish</strong><span>Recommended workflow</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Current Publish Preview</h2>
            <p>This is the naming that will carry through your local dataset snapshot and the GitHub publish package for the current workspace dataset.</p>
          </div>
        </div>
        <div className="translator-metrics github-library-metrics">
          <div><strong>{currentDatasetMeta?.label || "No dataset loaded"}</strong><span>Dataset label</span></div>
          <div><strong>{currentDatasetMeta?.folderName || "--"}</strong><span>GitHub folder name</span></div>
          <div><strong>{currentDatasetMeta?.projectName || "--"}</strong><span>Project / MPW</span></div>
          <div><strong>{currentDatasetMeta?.slot || "--"}</strong><span>Detected slot</span></div>
        </div>
      </article>

      <article className="analysis-card github-sync-card"> 
        <div className="analysis-card-head stacked">
          <div>
            <h2>GitHub Measurement Data Sync</h2>
            <p>{remoteLibraryStatus}</p>
          </div>
        </div>
        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>Repository owner</span>
            <input value={safeGithubConfig.owner} onChange={(event) => onGithubConfigChange("owner", event.target.value)} />
          </label>
          <label className="mapping-field">
            <span>Repository</span>
            <input value={safeGithubConfig.repo} onChange={(event) => onGithubConfigChange("repo", event.target.value)} />
          </label>
          <label className="mapping-field">
            <span>Branch</span>
            <input value={safeGithubConfig.branch} onChange={(event) => onGithubConfigChange("branch", event.target.value)} />
          </label>
          <label className="mapping-field">
            <span>GitHub token</span>
            <input type="password" value={safeGithubConfig.token} placeholder="Fine-grained PAT with repo access + Contents read/write" onChange={(event) => onGithubConfigChange("token", event.target.value)} />
          </label>
        </div>
        <div className="github-sync-actions">
          <button type="button" onClick={onSaveGithubConfig}>Save GitHub Settings</button>
          <p>The token is stored only in this browser. Use a fine-grained PAT that includes this repository and grants <strong>Contents: Read and Write</strong> access if you want the app to commit datasets directly to GitHub.</p>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Measurement Data Library</h2>
            <p>These are datasets that are already published to GitHub and available for loading or comparison.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                                <th>Dataset</th>
                <th>Project</th>
                <th>Slot</th>
                <th>Waveguide Type</th>
                <th>Measurement Mode</th>
                <th>Measurement Type</th>
                <th>Files</th>
                <th>Rows</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeRemoteDatasets.length ? safeRemoteDatasets.map((dataset) => (
                <tr key={`remote-${dataset.id || dataset.label}`}>
                  <td>
                    <strong>{dataset.label || "Measurement dataset"}</strong>
                    <div className="dataset-subcopy">{dataset.mpw || "--"} - {dataset.slot || "--"} - {dataset.waveguideType || "--"}</div>
                  </td>
                                    <td>{dataset.projectDisplayName || dataset.projectName || "--"}</td>
                  <td>{dataset.slot || "SlotUndefined"}</td>
                  <td>{dataset.waveguideType || "WaveguideUndefined"}</td>
                  <td>{dataset.measurementMode || dataset.sourceType || "--"}</td>
                  <td>{dataset.measurementType || "MeasurementTypeUndefined"}</td>
                  <td>{dataset.traceCount ?? dataset.files?.length ?? "--"}</td>
                  <td>{dataset.rowCount ? Number(dataset.rowCount).toLocaleString() : `${dataset.traceCount ?? 0} raw traces`}</td>
                  <td className="library-table-actions">
                    <button type="button" onClick={() => onLoadRemoteDataset(dataset)} disabled={loadingBundledId === dataset.id}>{loadingBundledId === dataset.id ? "Loading..." : "Load"}</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="9"><div className="chart-empty compact">No GitHub library datasets found yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Saved Dataset Snapshots</h2>
            <p>These are local browser snapshots. Review the naming here first, then click <strong>Save to GitHub</strong> on the snapshot you want to publish into the shared library.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                                <th>Dataset</th>
                <th>Project</th>
                <th>Slot</th>
                <th>Waveguide Type</th>
                <th>Measurement Mode</th>
                <th>Measurement Type</th>
                <th>Files</th>
                <th>Rows</th>
                <th>Saved</th>
                <th>GitHub</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeLocalDatasets.length ? safeLocalDatasets.map((dataset) => {
                const info = safeDatasetDisplay(dataset);
                return (
                  <tr key={dataset.id || info.fullLabel}>
                    <td>
                      <strong>{info.shortLabel}</strong>
                      <div className="dataset-subcopy">{info.fullLabel}</div>
                    </td>
                                        <td>{info.projectName}</td>
                    <td>{info.slot}</td>
                    <td>{info.waveguideType}</td>
                    <td>{info.measurementMode}</td>
                    <td>{info.measurementType}</td>
                    <td>{info.sourceLabel}</td>
                    <td>{info.rowText}</td>
                    <td>{info.savedDisplay}</td>
                    <td><GitHubStatusBadge status={info.githubStatus} /></td>
                    <td className="library-table-actions">
                      <button type="button" onClick={() => onLoadLocalDataset(dataset)}>Load</button>
                      <button type="button" className="secondary-action" onClick={() => onPublishLocalDataset(dataset)} disabled={publishingDatasetId === dataset.id}>{publishingDatasetId === dataset.id ? "Publishing..." : "Save to GitHub"}</button>
                      <button type="button" className="danger-action" onClick={() => onDeleteLocalDataset(dataset.id)}>Delete</button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="11"><div className="chart-empty compact">No local dataset snapshots are available yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Dataset Activity</h2>
            <p>{statusMessage}</p>
          </div>
        </div>
      </article>
    </section>
  );
}

