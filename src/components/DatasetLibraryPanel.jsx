function GitHubStatusBadge({ status }) {
  if (!status) return <span className="dataset-status-chip">Local only</span>;
  const tone = status === "published" ? "success" : status === "publishing" ? "progress" : status === "failed" ? "danger" : "muted";
  const label = status === "published" ? "Saved to GitHub" : status === "publishing" ? "Publishing..." : status === "failed" ? "Publish failed" : "Local only";
  return <span className={`dataset-status-chip ${tone}`}>{label}</span>;
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
  return (
    <section className="library-stack">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Datasets Library</h2>
            <p>Fetch measurement sets from the GitHub measurement-data library, save local snapshots with cleaner naming, and optionally publish selected datasets back into the repository.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={() => onSaveCurrentDataset(false)} disabled={!currentDatasetMeta?.rowCount}>Save Dataset Snapshot</button>
            <button type="button" className="ghost-action" onClick={onRefreshLibrary}>Refresh GitHub Library</button>
            <button type="button" className="ghost-action" onClick={onClearWorkspace}>Clear Workspace</button>
          </div>
        </div>

        <div className="translator-metrics github-library-metrics">
          <div><strong>{currentDatasetMeta?.shortLabel || "No dataset"}</strong><span>Current dataset</span></div>
          <div><strong>{currentDatasetMeta?.measurementMode || sourceMeta.type}</strong><span>Measurement mode</span></div>
          <div><strong>{remoteDatasets.length}</strong><span>GitHub library sets</span></div>
          <div><strong>{appSettings.autoSaveUploads ? "Enabled" : "Disabled"}</strong><span>Auto save</span></div>
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
            <input value={githubConfig.owner} onChange={(event) => onGithubConfigChange("owner", event.target.value)} />
          </label>
          <label className="mapping-field">
            <span>Repository</span>
            <input value={githubConfig.repo} onChange={(event) => onGithubConfigChange("repo", event.target.value)} />
          </label>
          <label className="mapping-field">
            <span>Branch</span>
            <input value={githubConfig.branch} onChange={(event) => onGithubConfigChange("branch", event.target.value)} />
          </label>
          <label className="mapping-field">
            <span>GitHub token</span>
            <input type="password" value={githubConfig.token} placeholder="Fine-grained PAT with Contents: write" onChange={(event) => onGithubConfigChange("token", event.target.value)} />
          </label>
        </div>
        <div className="github-sync-actions">
          <button type="button" onClick={onSaveGithubConfig}>Save GitHub Settings</button>
          <p>The token is stored only in this browser. Use a fine-grained PAT with repository <strong>Contents</strong> write access if you want the app to commit datasets directly to GitHub.</p>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Measurement Data Library</h2>
            <p>These sets are fetched from the GitHub-hosted manifest and can be loaded for comparison across MPW runs, slots, and waveguide types.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Mode</th>
                <th>Project</th>
                <th>Wafer</th>
                <th>Files</th>
                <th>Rows</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {remoteDatasets.length ? remoteDatasets.map((dataset) => (
                <tr key={`remote-${dataset.id}`}>
                  <td>
                    <strong>{dataset.label}</strong>
                    <div className="dataset-subcopy">{dataset.mpw || "--"} • {dataset.slot || "--"} • {dataset.waveguideType || "--"}</div>
                  </td>
                  <td>{dataset.measurementMode || dataset.sourceType || "--"}</td>
                  <td>{dataset.projectName}</td>
                  <td>{dataset.waferName}</td>
                  <td>{dataset.traceCount ?? dataset.files?.length ?? "--"}</td>
                  <td>{dataset.rowCount ? dataset.rowCount.toLocaleString() : `${dataset.traceCount ?? 0} raw traces`}</td>
                  <td className="library-table-actions">
                    <button type="button" onClick={() => onLoadRemoteDataset(dataset)} disabled={loadingBundledId === dataset.id}>{loadingBundledId === dataset.id ? "Loading..." : "Load"}</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7"><div className="chart-empty compact">No GitHub library datasets found yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Saved Datasets</h2>
            <p>Local browser snapshots with richer naming. Publish selected ones to GitHub when you want them to appear in the shared measurement-data library.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Mode</th>
                <th>Wafer</th>
                <th>Files</th>
                <th>Rows</th>
                <th>Saved</th>
                <th>GitHub</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {localDatasets.length ? localDatasets.map((dataset) => (
                <tr key={dataset.id}>
                  <td>
                    <strong>{dataset.display.shortLabel}</strong>
                    <div className="dataset-subcopy">{dataset.label}</div>
                  </td>
                  <td>{dataset.display.measurementMode}</td>
                  <td>{dataset.waferName || dataset.display.waferName}</td>
                  <td>{dataset.display.sourceLabel}</td>
                  <td>{dataset.summary?.rows?.toLocaleString?.() ?? dataset.display.rowCount?.toLocaleString?.() ?? "--"}</td>
                  <td>{dataset.savedDisplay}</td>
                  <td><GitHubStatusBadge status={dataset.githubSync?.status} /></td>
                  <td className="library-table-actions">
                    <button type="button" onClick={() => onLoadLocalDataset(dataset)}>Load</button>
                    <button type="button" className="secondary-action" onClick={() => onPublishLocalDataset(dataset)} disabled={publishingDatasetId === dataset.id}>{publishingDatasetId === dataset.id ? "Publishing..." : "Save to GitHub"}</button>
                    <button type="button" className="danger-action" onClick={() => onDeleteLocalDataset(dataset.id)}>Delete</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8"><div className="chart-empty compact">No local dataset snapshots are available yet.</div></td>
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
