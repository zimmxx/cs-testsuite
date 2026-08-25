import { getDatasetPresentation } from "../lib/datasetPresentation";
import {
  DATASET_ALIGNMENT_MODE_OPTIONS,
  DATASET_BUILDING_BLOCK_OPTIONS,
  DATASET_MEASUREMENT_TYPE_OPTIONS,
  DATASET_OPTICAL_MODE_OPTIONS,
  DATASET_PLATFORM_OPTIONS,
  isValidProcessStep,
  validateCanonicalDatasetIdentity
} from "../lib/githubLibrary";

function ControlledSelect({ label, field, value, options, onChange, disabled = false }) {
  return (
    <label className="mapping-field">
      <span>{label}</span>
      <select required value={value || ""} onChange={(event) => onChange(field, event.target.value)} disabled={disabled}>
        <option value="">Select {label.toLowerCase()}...</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TableDetail({ label, value }) {
  return (
    <div className="dataset-table-detail">
      <span>{label}</span>
      <strong>{value || "--"}</strong>
    </div>
  );
}

function DatasetDetailGroup({ title, children }) {
  return (
    <div className="dataset-detail-group">
      <div className="dataset-detail-group-title">{title}</div>
      {children}
    </div>
  );
}

function GitHubStatusBadge({ status }) {
  if (!status) return <span className="dataset-status-chip">Local only</span>;
  const tone = status === "published" ? "success" : status === "publishing" ? "progress" : status === "failed" ? "danger" : "muted";
  const label = status === "published" ? "Saved to GitHub" : status === "publishing" ? "Publishing..." : status === "failed" ? "Publish failed" : "Local only";
  return <span className={`dataset-status-chip ${tone}`}>{label}</span>;
}

function compactSavedDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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
    fullLabel: display.label || dataset.label || display.shortLabel || "Dataset snapshot",
    measurementMode: display.measurementMode || presented.measurementMode || dataset.sourceMeta?.type || "Measurement",
    measurementType: display.measurementType || presented.measurementType || "MeasurementTypeUndefined",
    projectName: display.projectName || presented.projectDisplayName || dataset.projectName || "--",
    slot: display.slot || presented.slot || "SlotUndefined",
    processStep: dataset.namingOverrides?.processStep || dataset.processStep || display.processStep || "StepXX",
    measurementDate: dataset.namingOverrides?.measurementDate || dataset.measurementDate || dataset.selectedDate || "",
    waveguideType: display.waveguideType || presented.waveguideType || "WaveguideUndefined",
    waferName: display.waferName || presented.waferDisplayName || dataset.waferName || "--",
    sourceLabel: display.sourceLabel || `${rawSourceCount} file${rawSourceCount === 1 ? "" : "s"}`,
    platformLabel: display.platformLabel || dataset.platformLabel || presented.platformDisplayName || "--",
    buildingBlockLabel: display.buildingBlockLabel || dataset.buildingBlockLabel || "--",
    opticalMode: display.opticalMode || dataset.opticalMode || "--",
    alignmentMode: display.alignmentMode || dataset.alignmentMode || "--",
    fileText: Number(display.sourceCount) || rawSourceCount || Number(dataset.traceCount) || "--",
    rowText: Number.isFinite(summaryRows)
      ? summaryRows.toLocaleString()
      : Number.isFinite(displayRows)
        ? displayRows.toLocaleString()
        : "--",
    savedDisplay: compactSavedDate(dataset.savedAt || dataset.savedDisplay),
    githubStatus: dataset.githubSync?.status || "local"
  };
}

export default function DatasetLibraryPanel({
  sourceMeta,
  currentDatasetMeta,
  currentDatasetNamingDraft,
  onCurrentDatasetNamingChange,
  onResetCurrentDatasetNaming,
  onApplyCurrentNamingToLoadedSnapshot,
  canApplyCurrentNamingToLoadedSnapshot,
  statusMessage,
  githubConfig,
  onGithubConfigChange,
  onSaveGithubConfig,
  onRefreshLibrary,
  remoteLibraryStatus,
  remoteDatasets,
  selectedPublishedDataset,
  publishedDatasetDraft,
  onSelectPublishedDataset,
  onPublishedDatasetDraftChange,
  onSavePublishedDatasetMetadata,
  isSavingPublishedDataset,
  onDeletePublishedDataset,
  deletingPublishedDatasetId,
  loadedGithubDataset,
  currentPublishedDatasetReview,
  canSaveCurrentReviewToPublishedDataset,
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
  const activeDeleteId = String(deletingPublishedDatasetId || "");

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Dataset Snapshots and GitHub Publish</h2>
            <p>Use this flow for uploaded measurement files: save a local dataset snapshot, review or rewrite the naming, then publish that snapshot to the GitHub measurement-data library when it looks correct.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={() => onSaveCurrentDataset(false)} disabled={!currentDatasetMeta?.rowCount}>Save Dataset Snapshot</button>
            <button type="button" className="ghost-action" onClick={onRefreshLibrary}>Refresh GitHub Library</button>
            <button type="button" className="ghost-action" onClick={onClearWorkspace}>Clear Workspace</button>
          </div>
        </div>

        <div className="translator-metrics github-library-metrics">
          <div><strong>{currentDatasetMeta?.label || currentDatasetMeta?.shortLabel || "No dataset"}</strong><span>Current dataset</span></div>
          <div><strong>{currentDatasetMeta?.measurementMode || sourceMeta?.type || "Measurement"}</strong><span>Measurement mode</span></div>
          <div><strong>{safeRemoteDatasets.length}</strong><span>GitHub library sets</span></div>
          <div><strong>Snapshot to Review to Publish</strong><span>Recommended workflow</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Current Publish Preview</h2>
            <p>This naming now stays editable before you save a local snapshot or push that snapshot to GitHub.</p>
          </div>
          <div className="library-action-row">
            <button type="button" className="ghost-action" onClick={onResetCurrentDatasetNaming} disabled={!currentDatasetMeta?.rowCount}>Reset Detected Naming</button>
            <button type="button" className="secondary-action" onClick={onApplyCurrentNamingToLoadedSnapshot} disabled={!canApplyCurrentNamingToLoadedSnapshot}>Apply to Loaded Snapshot</button>
          </div>
        </div>
        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>Dataset label</span>
            <input value={currentDatasetNamingDraft?.label || ""} onChange={(event) => onCurrentDatasetNamingChange("label", event.target.value)} disabled={!currentDatasetMeta?.rowCount} />
          </label>
          <label className="mapping-field">
            <span>GitHub folder name</span>
            <input value={currentDatasetNamingDraft?.folderName || ""} placeholder="Complete the identity fields below" readOnly disabled={!currentDatasetMeta?.rowCount} />
          </label>
          <label className="mapping-field">
            <span>Project / MPW</span>
            <input required pattern="(?:MPW[0-9]+(?:_[A-Za-z0-9]+)*|DEV_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*|BSPK_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)" title="Use MPW47, MPW47_Rerun_DTU, DEV_MIT, or BSPK_Duality" value={currentDatasetNamingDraft?.projectName || ""} onChange={(event) => onCurrentDatasetNamingChange("projectName", event.target.value)} disabled={!currentDatasetMeta?.rowCount} />
          </label>
          <label className="mapping-field">
            <span>Slot</span>
            <input required pattern="Slot[0-9]+" title="Use Slot5 without zero-padding" value={currentDatasetNamingDraft?.slot || ""} onChange={(event) => onCurrentDatasetNamingChange("slot", event.target.value)} disabled={!currentDatasetMeta?.rowCount} />
          </label>
          <label className="mapping-field">
            <span>Process step</span>
            <input required pattern="Step(?:XX|[0-9]+[A-Z]?)" title="Use Step36, Step84A, or StepXX" aria-invalid={currentDatasetMeta?.rowCount && !isValidProcessStep(currentDatasetNamingDraft?.processStep) ? "true" : "false"} value={currentDatasetNamingDraft?.processStep || ""} onChange={(event) => onCurrentDatasetNamingChange("processStep", event.target.value)} disabled={!currentDatasetMeta?.rowCount} />
          </label>
          <label className="mapping-field">
            <span>Measurement date</span>
            <input type="date" required value={currentDatasetNamingDraft?.measurementDate || ""} onChange={(event) => onCurrentDatasetNamingChange("measurementDate", event.target.value)} disabled={!currentDatasetMeta?.rowCount} />
          </label>
          <ControlledSelect label="Platform" field="platformLabel" value={currentDatasetNamingDraft?.platformLabel} options={DATASET_PLATFORM_OPTIONS} onChange={onCurrentDatasetNamingChange} disabled={!currentDatasetMeta?.rowCount} />
          <ControlledSelect label="Optical mode" field="opticalMode" value={currentDatasetNamingDraft?.opticalMode} options={DATASET_OPTICAL_MODE_OPTIONS} onChange={onCurrentDatasetNamingChange} disabled={!currentDatasetMeta?.rowCount} />
          <ControlledSelect label="Building block" field="buildingBlockLabel" value={currentDatasetNamingDraft?.buildingBlockLabel} options={DATASET_BUILDING_BLOCK_OPTIONS} onChange={onCurrentDatasetNamingChange} disabled={!currentDatasetMeta?.rowCount} />
          <ControlledSelect label="Measurement type" field="measurementType" value={currentDatasetNamingDraft?.measurementType} options={DATASET_MEASUREMENT_TYPE_OPTIONS} onChange={onCurrentDatasetNamingChange} disabled={!currentDatasetMeta?.rowCount} />
          <ControlledSelect label="Alignment mode" field="alignmentMode" value={currentDatasetNamingDraft?.alignmentMode} options={DATASET_ALIGNMENT_MODE_OPTIONS} onChange={onCurrentDatasetNamingChange} disabled={!currentDatasetMeta?.rowCount} />
        </div>
        <div className="translator-metrics github-library-metrics">
          <div><strong>{currentDatasetMeta?.label || "No dataset loaded"}</strong><span>Dataset label</span></div>
          <div><strong>{currentDatasetNamingDraft?.folderName || "Complete all naming fields"}</strong><span>GitHub folder name</span></div>
          <div><strong>{currentDatasetNamingDraft?.projectName || "--"}</strong><span>Project / MPW</span></div>
          <div><strong>{currentDatasetNamingDraft?.slot || "--"}</strong><span>Slot</span></div>
          <div><strong>{currentDatasetNamingDraft?.processStep || "Required before publishing"}</strong><span>Process step</span></div>
          <div><strong>{currentDatasetNamingDraft?.measurementDate || "Required before publishing"}</strong><span>Measurement date</span></div>
          <div><strong>{currentDatasetNamingDraft?.platformLabel || "Required before publishing"}</strong><span>Platform</span></div>
          <div><strong>{currentDatasetNamingDraft?.opticalMode || "Required before publishing"}</strong><span>Optical mode</span></div>
          <div><strong>{currentDatasetNamingDraft?.buildingBlockLabel || "Required before publishing"}</strong><span>Building block</span></div>
          <div><strong>{currentDatasetNamingDraft?.measurementType || "Required before publishing"}</strong><span>Measurement type</span></div>
          <div><strong>{currentDatasetNamingDraft?.alignmentMode || "Required before publishing"}</strong><span>Alignment mode</span></div>
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
        <div className="dashboard-table-wrap dataset-library-wide-table">
          <table className="dataset-library-compact-table published-dataset-table">
            <colgroup>
              <col className="dataset-col-name" />
              <col className="dataset-col-details" />
              <col className="dataset-col-volume" />
              <col className="dataset-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Details</th>
                <th>Data</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeRemoteDatasets.length ? safeRemoteDatasets.map((dataset) => (
                <tr key={`remote-${dataset.id || dataset.label}`}>
                  <td>
                    <strong>{dataset.label || "Measurement dataset"}</strong>
                    <div className="dataset-subcopy">{dataset.folder || `${dataset.mpw || "--"} - ${dataset.slot || "--"} - ${dataset.waveguideType || "--"}`}</div>
                  </td>
                  <td>
                    <div className="dataset-details-grid">
                      <DatasetDetailGroup title="Run">
                        <TableDetail label="Project" value={dataset.projectDisplayName || dataset.projectName} />
                        <TableDetail label="Slot" value={dataset.slot || "SlotUndefined"} />
                        <TableDetail label="Step" value={dataset.processStep || "StepXX"} />
                      </DatasetDetailGroup>
                      <DatasetDetailGroup title="Measurement">
                        <TableDetail label="Type" value={dataset.measurementType || "MeasurementTypeUndefined"} />
                        <TableDetail label="Optical" value={dataset.opticalMode} />
                        <TableDetail label="Alignment" value={dataset.alignmentMode} />
                        <TableDetail label="Source" value={dataset.measurementMode || dataset.sourceType} />
                      </DatasetDetailGroup>
                      <DatasetDetailGroup title="Device">
                        <TableDetail label="Platform" value={dataset.platformLabel || dataset.platformDisplayName} />
                        <TableDetail label="Block" value={dataset.buildingBlockLabel} />
                        <TableDetail label="Waveguide" value={dataset.waveguideType || "WaveguideUndefined"} />
                      </DatasetDetailGroup>
                    </div>
                  </td>
                  <td>
                    <TableDetail label="Files" value={dataset.traceCount ?? dataset.files?.length ?? "--"} />
                    <TableDetail label="Rows" value={dataset.rowCount ? Number(dataset.rowCount).toLocaleString() : `${dataset.traceCount ?? 0} raw traces`} />
                  </td>
                    <td className="library-table-actions">
                      <button type="button" className="secondary-action" onClick={() => onSelectPublishedDataset(dataset)}>Edit</button>
                      <button type="button" className="danger-action" onClick={() => onDeletePublishedDataset(dataset)} disabled={Boolean(activeDeleteId)}>
                        {activeDeleteId === String(dataset.id || "") ? "Deleting..." : "Delete"}
                      </button>
                      <button type="button" onClick={() => onLoadRemoteDataset(dataset)} disabled={loadingBundledId === dataset.id}>{loadingBundledId === dataset.id ? "Loading..." : "Load"}</button>
                    </td>
                  </tr>
              )) : (
                <tr>
                  <td colSpan="4"><div className="chart-empty compact">No GitHub library datasets found yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Published Dataset Editor</h2>
            <p>Edit the naming metadata for an already published GitHub dataset, then save the corrected label, project details, and reviewed analytics back to the repository manifest and metadata file.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={() => onSavePublishedDatasetMetadata(selectedPublishedDataset)} disabled={!selectedPublishedDataset || isSavingPublishedDataset}>
              {isSavingPublishedDataset ? "Saving..." : canSaveCurrentReviewToPublishedDataset ? "Save Metadata + Current Review to GitHub" : "Save Metadata to GitHub"}
            </button>
            <button type="button" className="danger-action" onClick={() => onDeletePublishedDataset(selectedPublishedDataset)} disabled={!selectedPublishedDataset || Boolean(activeDeleteId)}>
              {activeDeleteId === String(selectedPublishedDataset?.id || "") ? "Deleting..." : "Delete Published Dataset"}
            </button>
          </div>
        </div>
        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>Dataset label</span>
            <input value={publishedDatasetDraft?.label || ""} onChange={(event) => onPublishedDatasetDraftChange("label", event.target.value)} disabled={!selectedPublishedDataset} />
          </label>
          <label className="mapping-field">
            <span>Project / MPW</span>
            <input value={publishedDatasetDraft?.projectName || ""} onChange={(event) => onPublishedDatasetDraftChange("projectName", event.target.value)} disabled={!selectedPublishedDataset} />
          </label>
          <label className="mapping-field">
            <span>Slot</span>
            <input value={publishedDatasetDraft?.slot || ""} onChange={(event) => onPublishedDatasetDraftChange("slot", event.target.value)} disabled={!selectedPublishedDataset} />
          </label>
          <label className="mapping-field">
            <span>Process step</span>
            <input pattern="Step(?:XX|[0-9]+[A-Z]?)" title="Use Step36, Step84A, or StepXX" value={publishedDatasetDraft?.processStep || ""} onChange={(event) => onPublishedDatasetDraftChange("processStep", event.target.value)} disabled={!selectedPublishedDataset} />
          </label>
          <label className="mapping-field">
            <span>Measurement date</span>
            <input type="date" value={publishedDatasetDraft?.measurementDate || ""} onChange={(event) => onPublishedDatasetDraftChange("measurementDate", event.target.value)} disabled={!selectedPublishedDataset} />
          </label>
          <ControlledSelect label="Platform" field="platformLabel" value={publishedDatasetDraft?.platformLabel} options={DATASET_PLATFORM_OPTIONS} onChange={onPublishedDatasetDraftChange} disabled={!selectedPublishedDataset} />
          <ControlledSelect label="Optical mode" field="opticalMode" value={publishedDatasetDraft?.opticalMode} options={DATASET_OPTICAL_MODE_OPTIONS} onChange={onPublishedDatasetDraftChange} disabled={!selectedPublishedDataset} />
          <ControlledSelect label="Building block" field="buildingBlockLabel" value={publishedDatasetDraft?.buildingBlockLabel} options={DATASET_BUILDING_BLOCK_OPTIONS} onChange={onPublishedDatasetDraftChange} disabled={!selectedPublishedDataset} />
          <ControlledSelect label="Measurement type" field="measurementType" value={publishedDatasetDraft?.measurementType} options={DATASET_MEASUREMENT_TYPE_OPTIONS} onChange={onPublishedDatasetDraftChange} disabled={!selectedPublishedDataset} />
          <ControlledSelect label="Alignment mode" field="alignmentMode" value={publishedDatasetDraft?.alignmentMode} options={DATASET_ALIGNMENT_MODE_OPTIONS} onChange={onPublishedDatasetDraftChange} disabled={!selectedPublishedDataset} />
          <label className="mapping-field">
            <span>Published folder</span>
            <input value={selectedPublishedDataset?.folder || ""} disabled />
          </label>
        </div>
        <div className="translator-metrics github-library-metrics">
          <div><strong>{selectedPublishedDataset?.label || "No published dataset selected"}</strong><span>Selected dataset</span></div>
          <div><strong>{selectedPublishedDataset?.projectName || "--"}</strong><span>Current project</span></div>
          <div><strong>{selectedPublishedDataset?.analyticsSummary?.propagationAverage ?? "--"}</strong><span>Saved avg propagation</span></div>
          <div><strong>{selectedPublishedDataset?.analyticsSummary?.yield ?? "--"}</strong><span>Saved yield</span></div>
        </div>
        <div className="chart-empty compact">
          {selectedPublishedDataset
            ? canSaveCurrentReviewToPublishedDataset
              ? `The loaded workspace matches this published dataset. Saving now will also store the current reviewed analytics, including ${currentPublishedDatasetReview?.analyticsReview?.excludedChipIds?.length || 0} excluded chips and the current propagation settings.`
              : loadedGithubDataset
                ? `The workspace currently has ${loadedGithubDataset.label} loaded. To save reviewed analytics for this dataset, load ${selectedPublishedDataset.label} first and then exclude or include chips as needed.`
                : "Load a published GitHub dataset into the workspace if you want to save reviewed analytics such as excluded chips and the final average propagation/yield."
            : "Select a published dataset to edit its naming metadata or save reviewed analytics."}
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Saved Dataset Snapshots</h2>
            <p>These are local browser snapshots. Load one if you want to revise its naming, then apply the current naming before publishing to GitHub.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap dataset-library-wide-table">
          <table className="dataset-library-compact-table saved-dataset-table">
            <colgroup>
              <col className="dataset-col-name" />
              <col className="dataset-col-details" />
              <col className="dataset-col-volume" />
              <col className="dataset-col-status" />
              <col className="dataset-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Details</th>
                <th>Data</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeLocalDatasets.length ? safeLocalDatasets.map((dataset) => {
                const info = safeDatasetDisplay(dataset);
                const publishValidation = validateCanonicalDatasetIdentity(info);
                return (
                  <tr key={dataset.id || info.fullLabel}>
                    <td>
                      <strong>{info.shortLabel}</strong>
                      {info.fullLabel !== info.shortLabel ? <div className="dataset-subcopy">{info.fullLabel}</div> : null}
                    </td>
                    <td>
                      <div className="dataset-details-grid">
                        <DatasetDetailGroup title="Run">
                          <TableDetail label="Project" value={info.projectName} />
                          <TableDetail label="Slot" value={info.slot} />
                          <TableDetail label="Step" value={isValidProcessStep(info.processStep) ? info.processStep : "Required"} />
                          <TableDetail label="Measured" value={info.measurementDate || "Required"} />
                        </DatasetDetailGroup>
                        <DatasetDetailGroup title="Measurement">
                          <TableDetail label="Type" value={info.measurementType} />
                          <TableDetail label="Optical" value={info.opticalMode} />
                          <TableDetail label="Alignment" value={info.alignmentMode} />
                          <TableDetail label="Source" value={info.measurementMode} />
                        </DatasetDetailGroup>
                        <DatasetDetailGroup title="Device">
                          <TableDetail label="Platform" value={info.platformLabel} />
                          <TableDetail label="Block" value={info.buildingBlockLabel} />
                          <TableDetail label="Waveguide" value={info.waveguideType} />
                        </DatasetDetailGroup>
                      </div>
                    </td>
                    <td>
                      <TableDetail label="Files" value={info.fileText} />
                      <TableDetail label="Rows" value={info.rowText} />
                    </td>
                    <td>
                      <TableDetail label="Saved" value={info.savedDisplay} />
                      <div className="dataset-table-status"><GitHubStatusBadge status={info.githubStatus} /></div>
                    </td>
                    <td className="library-table-actions">
                      <button type="button" onClick={() => onLoadLocalDataset(dataset)}>Load</button>
                      <button type="button" className="secondary-action" onClick={() => onPublishLocalDataset(dataset)} disabled={publishingDatasetId === dataset.id || !info.measurementDate || !publishValidation.valid} title={!info.measurementDate ? "Add a measurement date to this snapshot before publishing" : !publishValidation.valid ? `Complete: ${publishValidation.missing.join(", ")}` : "Publish this dataset to GitHub"}>{publishingDatasetId === dataset.id ? "Publishing..." : "Save to GitHub"}</button>
                      <button type="button" className="danger-action" onClick={() => onDeleteLocalDataset(dataset.id)}>Delete</button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="5"><div className="chart-empty compact">No local dataset snapshots are available yet.</div></td>
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

