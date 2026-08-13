import { useMemo, useRef, useState } from "react";
import {
  buildManualConversionManifestCsv,
  buildStoredZip,
  convertManualMeasurementFiles
} from "../lib/manualConversion";
import {
  buildConvertedArchiveName,
  MEASUREMENT_MODE_OPTIONS,
  PLATFORM_OPTIONS,
  WAVEGUIDE_TYPE_OPTIONS,
  buildStandardMeasurementFileName,
  mergeBatchStandardMetadata,
  normalizeStandardMetadata
} from "../lib/filenameStandardization";

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

function createInitialBatchMeta() {
  return normalizeStandardMetadata({
    mpw: "MPWUNDEFINED",
    platform: "220nmSOIPassive",
    slot: "SlotUndefined",
    waveguideDescriptor: "StripWaveguide",
    measurementType: "PropagationLoss",
    mode: "Manual",
    extension: "txt"
  });
}

function normalizeConvertedEntry(entry) {
  return {
    ...entry,
    detectedMeta: entry.parsedSegments || entry.standardMeta || {},
    metaOverrides: {}
  };
}

function matchesTargetSubfolder(entry, targetSubfolder) {
  const token = String(targetSubfolder || "").trim().toLowerCase();
  if (!token) return true;
  const parts = String(entry?.sourcePath || "").split(/[\\/]/).filter(Boolean).map((part) => part.toLowerCase());
  return parts.includes(token);
}

function buildEntryStandardMeta(entry, batchMeta, outputFormat) {
  const detectedMeta = entry.detectedMeta || entry.standardMeta || {};
  const overrides = entry.metaOverrides || {};
  return normalizeStandardMetadata({
    ...detectedMeta,
    mpw: overrides.mpw || batchMeta.mpw,
    platform: overrides.platform || batchMeta.platform,
    slot: overrides.slot || batchMeta.slot,
    waveguideDescriptor: overrides.waveguideDescriptor || batchMeta.waveguideDescriptor,
    measurementType: "PropagationLoss",
    mode: overrides.mode || batchMeta.mode,
    chipId: overrides.chipId || entry.chipId || detectedMeta.chipId || "",
    waveguideId: overrides.waveguideId || entry.waveguideId || detectedMeta.waveguideId || "",
    extension: entry.outputFormat || outputFormat
  });
}

export default function ManualConversionPanel({ defaultLaunchPowerDbm = 10, advanced = false }) {
  const folderInputRef = useRef(null);
  const [launchPowerDbm, setLaunchPowerDbm] = useState(defaultLaunchPowerDbm);
  const [outputFormat, setOutputFormat] = useState("txt");
  const [converting, setConverting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    advanced
      ? "Upload a manual-measurement folder to convert WG*.xlsx files, inspect the detected path parts, and standardize the output filenames without breaking the post-processing format."
      : "Upload a manual-measurement folder to convert WG*.xlsx files into WST-compatible traces and standardize the output filenames in one step."
  );
  const [convertedEntries, setConvertedEntries] = useState([]);
  const [failedEntries, setFailedEntries] = useState([]);
  const [ignoredPaths, setIgnoredPaths] = useState([]);
  const [batchMeta, setBatchMeta] = useState(() => createInitialBatchMeta());
  const [batchMetaDraft, setBatchMetaDraft] = useState(() => createInitialBatchMeta());
  const [targetSubfolder, setTargetSubfolder] = useState("");
  const [targetSubfolderDraft, setTargetSubfolderDraft] = useState("");

  const filteredConvertedEntries = useMemo(
    () => advanced
      ? convertedEntries.filter((entry) => matchesTargetSubfolder(entry, targetSubfolder))
      : convertedEntries,
    [advanced, convertedEntries, targetSubfolder]
  );

  const readyEntries = useMemo(
    () => filteredConvertedEntries.map((entry) => {
      const standardMeta = buildEntryStandardMeta(entry, batchMeta, outputFormat);
      return {
        ...entry,
        standardMeta,
        outputFileName: buildStandardMeasurementFileName(standardMeta)
      };
    }),
    [batchMeta, filteredConvertedEntries, outputFormat]
  );

  const summary = useMemo(() => ({
    converted: readyEntries.length,
    failed: failedEntries.length,
    ignored: ignoredPaths.length,
    rows: readyEntries.reduce((sum, entry) => sum + entry.rowCount, 0)
  }), [failedEntries, ignoredPaths, readyEntries]);

  const archiveBaseName = useMemo(
    () => buildConvertedArchiveName({
      ...batchMeta,
      measurementType: "PropagationLoss",
      extension: outputFormat
    }),
    [batchMeta, outputFormat]
  );

  const incompleteNamingCount = useMemo(
    () => readyEntries.filter((entry) => (
      entry.standardMeta.mpw === "MPWUNDEFINED"
      || entry.standardMeta.slot === "SlotUndefined"
      || !entry.standardMeta.waveguideDescriptor
      || !entry.standardMeta.chipId
      || !entry.standardMeta.waveguideId
    )).length,
    [readyEntries]
  );

  const hasPendingBatchMetaChanges = useMemo(
    () => ["mpw", "platform", "slot", "waveguideDescriptor", "mode"].some((field) => batchMetaDraft[field] !== batchMeta[field]),
    [batchMeta, batchMetaDraft]
  );
  const hasPendingTargetSubfolderChange = advanced && targetSubfolderDraft !== targetSubfolder;
  const basicWaveguideOptions = useMemo(
    () => WAVEGUIDE_TYPE_OPTIONS.filter((option) => option !== "SlotWaveguide"),
    []
  );

  function updateBatchMeta(field, value) {
    setBatchMetaDraft((previous) => normalizeStandardMetadata({
      ...previous,
      [field]: value,
      measurementType: "PropagationLoss",
      mode: field === "mode" ? value : previous.mode,
      extension: outputFormat
    }));
  }

  function applyBatchMeta() {
    setBatchMeta((previous) => normalizeStandardMetadata({
      ...previous,
      ...batchMetaDraft,
      measurementType: "PropagationLoss",
      mode: batchMetaDraft.mode,
      extension: outputFormat
    }));
    if (advanced) setTargetSubfolder(targetSubfolderDraft.trim());
    setStatusMessage("Applied the batch naming metadata. The archive name and standardized output filenames have been refreshed.");
  }

  function updateEntryOverride(entryIndex, field, value) {
    setConvertedEntries((previous) => previous.map((entry, currentIndex) => {
      if (currentIndex !== entryIndex) return entry;
      return {
        ...entry,
        ...(field === "chipId" ? { chipId: value } : {}),
        metaOverrides: {
          ...(entry.metaOverrides || {}),
          [field]: value
        }
      };
    }));
  }

  async function handleSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setConverting(true);
    setStatusMessage(`Converting ${files.length} selected file(s) using SheetJS Community Edition...`);
    try {
      const result = await convertManualMeasurementFiles(files, { launchPowerDbm, outputFormat });
      const normalizedEntries = result.converted.map(normalizeConvertedEntry);
      setConvertedEntries(normalizedEntries);
      setFailedEntries(result.failed);
      setIgnoredPaths(result.ignored);

      const mergedMeta = mergeBatchStandardMetadata(normalizedEntries, {
        measurementType: "PropagationLoss",
        mode: batchMetaDraft.mode,
        extension: outputFormat
      });
      const nextBatchMeta = normalizeStandardMetadata({
        ...batchMetaDraft,
        mpw: mergedMeta.mpw !== "MPWUNDEFINED" ? mergedMeta.mpw : batchMetaDraft.mpw,
        slot: mergedMeta.slot !== "SlotUndefined" ? mergedMeta.slot : batchMetaDraft.slot,
        platform: mergedMeta.platform || batchMetaDraft.platform,
        waveguideDescriptor: mergedMeta.waveguideDescriptor || batchMetaDraft.waveguideDescriptor,
        measurementType: "PropagationLoss",
        mode: batchMetaDraft.mode,
        extension: outputFormat
      });
      setBatchMeta(nextBatchMeta);
      setBatchMetaDraft(nextBatchMeta);
      if (advanced && !targetSubfolderDraft.trim()) {
        const detectedTarget = normalizedEntries[0]?.detectedMeta?.waveguideDescriptor || "";
        setTargetSubfolder(detectedTarget);
        setTargetSubfolderDraft(detectedTarget);
      }
      setStatusMessage(
        advanced
          ? `Converted ${result.converted.length} workbook(s). Review the detected path metadata, choose the target subfolder if needed, change any MPW, slot, waveguide, chip, or WG fields you need, then click Apply Naming.`
          : `Converted ${result.converted.length} workbook(s). Review the batch metadata and any missing Chip/WG labels before downloading the standardized ZIP or manifest.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Manual conversion failed.");
    } finally {
      setConverting(false);
      if (event.target) event.target.value = "";
    }
  }

  function exportZip() {
    if (!readyEntries.length) return;
    const zip = buildStoredZip(readyEntries, { rootFolderName: archiveBaseName });
    downloadBlob(zip, `${archiveBaseName}.zip`);
  }

  function exportManifest() {
    if (!readyEntries.length) return;
    downloadText(buildManualConversionManifestCsv(readyEntries), `${archiveBaseName}_manifest.csv`, "text/csv;charset=utf-8");
  }

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card manual-conversion-card">
        <div className="analysis-card-head">
          <div>
            <h2>{advanced ? "Manual Measurement - Conversion (Advanced)" : "Manual Measurement - Conversion"}</h2>
            <p>
              {advanced
                ? <>Convert nested manual-measurement Excel folders such as <code>MPW48/Slot8/CTE450/Chip2/WG1.xlsx</code> into WST-compatible propagation traces, inspect the detected path tokens, then override any naming fields while preserving the post-processing-safe filename structure.</>
                : <>Convert nested manual-measurement Excel folders such as <code>MPW30/Slot11/Strip/Chip2/WG1.xlsx</code> into WST-compatible propagation traces, then standardize the output filenames before download.</>}
              {" "}This uses the free open-source <strong>SheetJS Community Edition</strong> <code>xlsx</code> parser directly in the browser.
            </p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={exportZip} disabled={!readyEntries.length}>Download ZIP</button>
            <button type="button" className="ghost-action" onClick={exportManifest} disabled={!readyEntries.length}>Download Manifest</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>MPW batch</span>
            <input value={batchMetaDraft.mpw} onChange={(event) => updateBatchMeta("mpw", event.target.value)} placeholder="MPW48" />
          </label>
          <label className="mapping-field">
            <span>Platform / PDK tab</span>
            <select value={batchMetaDraft.platform} onChange={(event) => updateBatchMeta("platform", event.target.value)}>
              {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="mapping-field">
            <span>Slot</span>
            <input value={batchMetaDraft.slot} onChange={(event) => updateBatchMeta("slot", event.target.value)} placeholder="Slot8" />
          </label>
          {advanced ? (
            <label className="mapping-field">
              <span>Target subfolder</span>
              <input value={targetSubfolderDraft} onChange={(event) => setTargetSubfolderDraft(event.target.value)} placeholder="CTE450 or Strip2" />
            </label>
          ) : null}
          {advanced ? (
            <label className="mapping-field">
              <span>Waveguide type name</span>
              <input value={batchMetaDraft.waveguideDescriptor} onChange={(event) => updateBatchMeta("waveguideDescriptor", event.target.value)} placeholder="CTE450 or Strip2" />
            </label>
          ) : (
            <label className="mapping-field">
              <span>Propagation waveguide</span>
              <select value={batchMetaDraft.waveguideDescriptor} onChange={(event) => updateBatchMeta("waveguideDescriptor", event.target.value)}>
                {basicWaveguideOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}
          <label className="mapping-field">
            <span>Measurement mode</span>
            <select value={batchMetaDraft.mode} onChange={(event) => updateBatchMeta("mode", event.target.value)}>
              {MEASUREMENT_MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="mapping-field">
            <span>Laser output power (dBm)</span>
            <input type="number" value={launchPowerDbm} onChange={(event) => setLaunchPowerDbm(Number(event.target.value) || 0)} />
          </label>
          <label className="mapping-field">
            <span>Converted output format</span>
            <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
              <option value="txt">TXT (recommended)</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <div className="mapping-field manual-conversion-note">
            <span>User guidance</span>
            <p>
              {advanced
                ? <>Upload the folder directly from Edge or Chrome so the app can read subfolders. The advanced view shows the detected MPW, slot, waveguide folder name, chip, and WG tokens for each file. Use <strong>Target subfolder</strong> to focus on one folder name such as <code>CTE450</code>, then edit the structured fields and click <strong>Apply Naming</strong> to refresh the archive folder name and standardized filenames without breaking the post-processing format.</>
                : <>Upload the folder directly from Edge or Chrome so the app can read subfolders. Best results come from paths like <code>MPW30/Slot11/Strip/Chip2/WG1.xlsx</code>. Edit the naming fields, then click <strong>Apply Naming</strong> to refresh the exported filename format and archive folder name, for example <code>MPW30_220nmSOIPassive_Slot11_StripWaveguide_PropagationLoss_Manual_Chip2_WG1.txt</code>.</>}
            </p>
          </div>
        </div>
        <div className="library-action-row">
          <button type="button" onClick={applyBatchMeta} disabled={!hasPendingBatchMetaChanges && !hasPendingTargetSubfolderChange}>Apply Naming</button>
        </div>

        <div className="manual-conversion-upload-row">
          <label className="upload-measurement-button manual-conversion-upload">
            <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" onChange={handleSelection} />
            <span>{converting ? "Converting..." : "Upload Manual Folder"}</span>
          </label>
          <label className="upload-measurement-button manual-conversion-upload secondary-upload">
            <input type="file" multiple accept=".xlsx,.xls" onChange={handleSelection} />
            <span>{converting ? "Converting..." : "Upload Excel Files"}</span>
          </label>
        </div>

        <div className="translator-metrics manual-conversion-summary">
          <div><strong>{summary.converted}</strong><span>Converted workbooks</span></div>
          <div><strong>{summary.rows.toLocaleString()}</strong><span>Trace rows generated</span></div>
          <div><strong>{incompleteNamingCount}</strong><span>Files needing metadata checks</span></div>
          <div><strong>{archiveBaseName}</strong><span>Archive base name</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked">
          <div>
            <h2>Conversion Status</h2>
            <p>{statusMessage}</p>
          </div>
        </div>
        <div className="manual-conversion-grid">
          <div className="manual-conversion-pane">
            <h3>Converted Outputs</h3>
            {readyEntries.length ? (
              <div className="dashboard-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      {advanced ? <th>Detected Path</th> : null}
                      {advanced ? <th>MPW</th> : null}
                      {advanced ? <th>Slot</th> : null}
                      {advanced ? <th>Waveguide</th> : null}
                      <th>Chip</th>
                      <th>WG</th>
                      <th>New filename</th>
                      <th>Rows</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyEntries.map((entry, index) => (
                      <tr key={`${entry.sourcePath}-${index}`}>
                        <td>{entry.sourcePath}</td>
                        {advanced ? <td>{`${entry.detectedMeta?.mpw || "MPWUNDEFINED"} | ${entry.detectedMeta?.slot || "SlotUndefined"} | ${entry.detectedMeta?.waveguideDescriptor || "--"}`}</td> : null}
                        {advanced ? (
                          <td>
                            <input
                              className="table-inline-input table-inline-input-wide"
                              value={entry.metaOverrides?.mpw || batchMeta.mpw}
                              onChange={(event) => updateEntryOverride(index, "mpw", event.target.value)}
                              placeholder="MPW48"
                            />
                          </td>
                        ) : null}
                        {advanced ? (
                          <td>
                            <input
                              className="table-inline-input table-inline-input-wide"
                              value={entry.metaOverrides?.slot || batchMeta.slot}
                              onChange={(event) => updateEntryOverride(index, "slot", event.target.value)}
                              placeholder="Slot8"
                            />
                          </td>
                        ) : null}
                        {advanced ? (
                          <td>
                            <input
                              className="table-inline-input table-inline-input-wide"
                              value={entry.metaOverrides?.waveguideDescriptor || batchMeta.waveguideDescriptor}
                              onChange={(event) => updateEntryOverride(index, "waveguideDescriptor", event.target.value)}
                              placeholder="CTE450"
                            />
                          </td>
                        ) : null}
                        <td>
                          <input
                            className="table-inline-input table-inline-input-wide"
                            value={entry.metaOverrides?.chipId || entry.standardMeta?.chipId || ""}
                            onChange={(event) => updateEntryOverride(index, "chipId", event.target.value)}
                            placeholder="Chip2"
                          />
                        </td>
                        <td>
                          <input
                            className="table-inline-input table-inline-input-wide"
                            value={entry.metaOverrides?.waveguideId || entry.standardMeta?.waveguideId || ""}
                            onChange={(event) => updateEntryOverride(index, "waveguideId", event.target.value)}
                            placeholder="WG1"
                          />
                        </td>
                        <td className="filename-preview-cell"><strong>{entry.outputFileName}</strong></td>
                        <td>{entry.rowCount}</td>
                        <td className="library-table-actions">
                          <button
                            type="button"
                            onClick={() => downloadText(entry.content, entry.outputFileName, entry.outputFormat === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8")}
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="chart-empty">{advanced && targetSubfolder ? `No converted outputs matched the target subfolder "${targetSubfolder}".` : "No converted manual-measurement outputs yet."}</div>
            )}
          </div>

          <div className="manual-conversion-pane">
            <h3>Ignored / Failed</h3>
            <div className="manual-conversion-list-card">
              <strong>Ignored files</strong>
              {ignoredPaths.length ? <ul>{ignoredPaths.slice(0, 20).map((item) => <li key={item}>{item}</li>)}</ul> : <p>No ignored files.</p>}
            </div>
            <div className="manual-conversion-list-card">
              <strong>Failed conversions</strong>
              {failedEntries.length ? <ul>{failedEntries.map((item) => <li key={item.sourcePath}>{item.sourcePath}: {item.message}</li>)}</ul> : <p>No failed conversions.</p>}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
