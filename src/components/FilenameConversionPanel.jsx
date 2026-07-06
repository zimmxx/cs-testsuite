import { useMemo, useRef, useState } from "react";
import {
  PLATFORM_OPTIONS,
  WAVEGUIDE_TYPE_OPTIONS,
  MEASUREMENT_MODE_OPTIONS,
  buildConvertedArchiveName,
  buildFilenameConversionManifest,
  buildStandardMeasurementFileName,
  detectStandardFilenameMetadata,
  mergeBatchStandardMetadata,
  normalizeStandardMetadata
} from "../lib/filenameStandardization";
import { buildStoredZip } from "../lib/manualConversion";

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(content, fileName, mimeType = "text/plain;charset=utf-8") {
  downloadBlob(new Blob([content], { type: mimeType }), fileName);
}

function measurementLabel(value) {
  return {
    PropagationLoss: "Propagation Loss",
    InsertionLoss: "Insertion Loss",
    HeaterEfficiency: "Heater Efficiency"
  }[value] || value;
}

export default function FilenameConversionPanel() {
  const folderInputRef = useRef(null);
  const [entries, setEntries] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Upload measurement folders or files to preview standardized filenames before saving them into GitHub datasets.");
  const [batchMeta, setBatchMeta] = useState(() =>
    normalizeStandardMetadata({
      mpw: "MPWUNDEFINED",
      platform: "220nmSOI",
      slot: "SlotUndefined",
      waveguideDescriptor: "StripWaveguide",
      measurementType: "PropagationLoss",
      mode: "Manual",
      extension: "txt"
    })
  );

  const readyEntries = useMemo(
    () => entries.map((entry) => {
      const standardMeta = normalizeStandardMetadata({
        ...batchMeta,
        chipId: entry.chipId || batchMeta.chipId,
        waveguideId: entry.waveguideId || batchMeta.waveguideId,
        extension: entry.extension
      });
      return {
        ...entry,
        standardMeta,
        outputFileName: buildStandardMeasurementFileName(standardMeta)
      };
    }),
    [batchMeta, entries]
  );

  const archiveBaseName = useMemo(() => buildConvertedArchiveName(batchMeta), [batchMeta]);

  async function handleSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const supportedFiles = files.filter((file) => !/\.omr$/i.test(file.name));
    const ignoredCount = files.length - supportedFiles.length;
    const nextEntries = supportedFiles.map((file, index) => {
      const sourcePath = String(file.webkitRelativePath || file.name);
      const detected = detectStandardFilenameMetadata(sourcePath, {
        extension: file.name.split(".").pop() || "txt"
      });
      return {
        id: `${sourcePath}-${index}`,
        file,
        sourcePath,
        chipId: detected.chipId,
        waveguideId: detected.waveguideId,
        extension: detected.extension,
        detected
      };
    });

    const merged = mergeBatchStandardMetadata(nextEntries, {
      extension: nextEntries[0]?.extension || batchMeta.extension,
      platform: batchMeta.platform === "220nmSOI" ? undefined : batchMeta.platform,
      waveguideDescriptor: batchMeta.waveguideDescriptor,
      measurementType: batchMeta.measurementType,
      mode: batchMeta.mode
    });

    setEntries(nextEntries);
    setBatchMeta((previous) => normalizeStandardMetadata({
      ...merged,
      platform: merged.platform || previous.platform,
      waveguideDescriptor: merged.waveguideDescriptor || previous.waveguideDescriptor,
      measurementType: previous.measurementType || merged.measurementType,
      mode: merged.mode || previous.mode
    }));
    setStatusMessage(`Prepared ${nextEntries.length} file name${nextEntries.length === 1 ? "" : "s"} for standardized renaming. ${ignoredCount ? `${ignoredCount} unsupported file(s) were ignored. ` : ""}Review the extracted MPW, slot, waveguide type, and chip/WG labels before exporting.`);
    if (event.target) event.target.value = "";
  }

  function updateBatchMeta(field, value) {
    setBatchMeta((previous) => normalizeStandardMetadata({ ...previous, [field]: value }));
  }

  function updateEntry(entryId, field, value) {
    setEntries((previous) => previous.map((entry) => entry.id === entryId ? { ...entry, [field]: value } : entry));
  }

  async function exportZip() {
    if (!readyEntries.length) return;
    const preparedEntries = await Promise.all(readyEntries.map(async (entry) => ({
      outputFileName: entry.outputFileName,
      contentBytes: new Uint8Array(await entry.file.arrayBuffer())
    })));
    const zip = buildStoredZip(preparedEntries, { rootFolderName: archiveBaseName });
    downloadBlob(zip, `${archiveBaseName}.zip`);
  }

  function exportManifest() {
    if (!readyEntries.length) return;
    downloadText(
      buildFilenameConversionManifest(readyEntries),
      `${archiveBaseName}_manifest.csv`,
      "text/csv;charset=utf-8"
    );
  }

  return (
    <section className="library-stack">
      <article className="analysis-card manual-conversion-card">
        <div className="analysis-card-head">
          <div>
            <h2>Filename Conversion</h2>
            <p>Standardize wafer-measurement filenames before publishing them to the GitHub library. The converter detects keywords such as <code>MPW</code>, <code>Slot</code>, <code>Chip</code>, and <code>WG</code>, then lets you correct missing metadata before downloading a renamed archive.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={exportZip} disabled={!readyEntries.length}>Download ZIP</button>
            <button type="button" className="ghost-action" onClick={exportManifest} disabled={!readyEntries.length}>Download Manifest</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>MPW batch</span>
            <input value={batchMeta.mpw} onChange={(event) => updateBatchMeta("mpw", event.target.value)} placeholder="MPW46" />
          </label>
          <label className="mapping-field">
            <span>Platform</span>
            <select value={batchMeta.platform} onChange={(event) => updateBatchMeta("platform", event.target.value)}>
              {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="mapping-field">
            <span>Slot</span>
            <input value={batchMeta.slot} onChange={(event) => updateBatchMeta("slot", event.target.value)} placeholder="Slot5" />
          </label>
          <label className="mapping-field">
            <span>Waveguide type</span>
            <select value={batchMeta.waveguideDescriptor} onChange={(event) => updateBatchMeta("waveguideDescriptor", event.target.value)}>
              {WAVEGUIDE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="mapping-field">
            <span>Measurement type</span>
            <select value={batchMeta.measurementType} onChange={(event) => updateBatchMeta("measurementType", event.target.value)}>
              <option value="PropagationLoss">PropagationLoss</option>
              <option value="InsertionLoss">InsertionLoss</option>
              <option value="HeaterEfficiency">HeaterEfficiency</option>
            </select>
          </label>
          <label className="mapping-field">
            <span>Measurement mode</span>
            <select value={batchMeta.mode} onChange={(event) => updateBatchMeta("mode", event.target.value)}>
              {MEASUREMENT_MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>

        <div className="manual-conversion-upload-row">
          <label className="upload-measurement-button manual-conversion-upload">
            <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" onChange={handleSelection} />
            <span>Upload Folder</span>
          </label>
          <label className="upload-measurement-button manual-conversion-upload secondary-upload">
            <input type="file" multiple onChange={handleSelection} />
            <span>Upload Files</span>
          </label>
        </div>

        <div className="translator-metrics manual-conversion-summary filename-summary-grid">
          <div><strong>{readyEntries.length}</strong><span>Files prepared</span></div>
          <div><strong>{measurementLabel(batchMeta.measurementType)}</strong><span>Detected measurement</span></div>
          <div className="archive-name-card"><strong>{archiveBaseName}</strong><span>Archive base name</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Filename Preview</h2>
            <p>{statusMessage}</p>
          </div>
        </div>

        {readyEntries.length ? (
          <div className="dashboard-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source path</th>
                  <th>Chip</th>
                  <th>WG</th>
                  <th>New filename</th>
                </tr>
              </thead>
              <tbody>
                {readyEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.sourcePath}</td>
                    <td>
                      <input
                        className="table-inline-input table-inline-input-wide"
                        value={entry.chipId}
                        onChange={(event) => updateEntry(entry.id, "chipId", event.target.value)}
                        placeholder="Chip3"
                      />
                    </td>
                    <td>
                      <input
                        className="table-inline-input table-inline-input-wide"
                        value={entry.waveguideId}
                        onChange={(event) => updateEntry(entry.id, "waveguideId", event.target.value)}
                        placeholder="WG1"
                      />
                    </td>
                    <td className="filename-preview-cell">
                      <strong>{entry.outputFileName}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-empty">No files loaded for filename standardization yet.</div>
        )}
      </article>
    </section>
  );
}
