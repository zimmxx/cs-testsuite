import { useMemo, useRef, useState } from "react";
import {
  buildGithubReadyManualDatasetPackage,
  convertManualMeasurementFiles,
  validateManualDatasetPackage
} from "../lib/manualConversion";
import { normalizeStandardMetadata } from "../lib/filenameStandardization";
import {
  DATASET_ALIGNMENT_MODE_OPTIONS,
  DATASET_OPTICAL_MODE_OPTIONS,
  DATASET_PLATFORM_OPTIONS
} from "../lib/githubLibrary";

const PROPAGATION_BUILDING_BLOCKS = ["RIB_Waveguide", "STRIP_Waveguide"];
const DATASET_FIELD_KEYS = ["projectName", "platformLabel", "slot", "processStep", "opticalMode", "buildingBlockLabel", "measurementType", "alignmentMode", "measurementDate", "notes"];

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

function createInitialDatasetFields() {
  return {
    projectName: "",
    platformLabel: "SOI220nmPassive",
    slot: "",
    processStep: "StepXX",
    opticalMode: "1550nm_TE",
    buildingBlockLabel: "STRIP_Waveguide",
    measurementType: "PropagationLoss",
    alignmentMode: "OperatorAlign",
    measurementDate: "",
    notes: ""
  };
}

function normalizeConvertedEntry(entry) {
  return { ...entry, detectedMeta: entry.parsedSegments || entry.standardMeta || {}, metaOverrides: {} };
}

function matchesTargetSubfolder(entry, targetSubfolder) {
  const token = String(targetSubfolder || "").trim().toLowerCase();
  if (!token) return true;
  return String(entry?.sourcePath || "").split(/[\\/]/).filter(Boolean).some((part) => part.toLowerCase() === token);
}

function traceMeta(entry) {
  return normalizeStandardMetadata({
    chipId: entry.metaOverrides?.chipId || entry.chipId || entry.standardMeta?.chipId,
    waveguideId: entry.metaOverrides?.waveguideId || entry.waveguideId || entry.standardMeta?.waveguideId,
    extension: "txt"
  });
}

function routeNumber(route) {
  return Number(String(route || "").replace(/\D/g, ""));
}

export default function ManualConversionPanel({ defaultLaunchPowerDbm = 10, advanced = false }) {
  const folderInputRef = useRef(null);
  const [launchPowerDbm, setLaunchPowerDbm] = useState(defaultLaunchPowerDbm);
  const [converting, setConverting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Upload WG*.xlsx files, confirm the canonical dataset identity and WG lengths, then download one library-ready folder.");
  const [convertedEntries, setConvertedEntries] = useState([]);
  const [failedEntries, setFailedEntries] = useState([]);
  const [ignoredPaths, setIgnoredPaths] = useState([]);
  const [datasetFields, setDatasetFields] = useState(() => createInitialDatasetFields());
  const [datasetFieldsDraft, setDatasetFieldsDraft] = useState(() => createInitialDatasetFields());
  const [routeLengths, setRouteLengths] = useState({});
  const [routeLengthsConfirmed, setRouteLengthsConfirmed] = useState(false);
  const [targetSubfolder, setTargetSubfolder] = useState("");
  const [targetSubfolderDraft, setTargetSubfolderDraft] = useState("");

  const filteredConvertedEntries = useMemo(
    () => advanced ? convertedEntries.filter((entry) => matchesTargetSubfolder(entry, targetSubfolder)) : convertedEntries,
    [advanced, convertedEntries, targetSubfolder]
  );

  const readyEntries = useMemo(
    () => filteredConvertedEntries.map((entry) => {
      const standardMeta = traceMeta(entry);
      return {
        ...entry,
        standardMeta,
        datasetFields,
        outputFormat: "txt",
        outputFileName: standardMeta.chipId && standardMeta.waveguideId
          ? `${standardMeta.chipId}_${standardMeta.waveguideId}.txt`
          : "Trace_identity_incomplete.txt"
      };
    }),
    [datasetFields, filteredConvertedEntries]
  );

  const validation = useMemo(
    () => validateManualDatasetPackage(readyEntries, datasetFields, routeLengths, routeLengthsConfirmed),
    [datasetFields, readyEntries, routeLengths, routeLengthsConfirmed]
  );

  const summary = useMemo(() => ({
    converted: readyEntries.length,
    failed: failedEntries.length,
    ignored: ignoredPaths.length,
    rows: readyEntries.reduce((sum, entry) => sum + entry.rowCount, 0)
  }), [failedEntries, ignoredPaths, readyEntries]);

  const hasPendingDatasetChanges = useMemo(
    () => DATASET_FIELD_KEYS.some((field) => datasetFieldsDraft[field] !== datasetFields[field]),
    [datasetFields, datasetFieldsDraft]
  );
  const hasPendingTargetSubfolderChange = advanced && targetSubfolderDraft !== targetSubfolder;

  function updateDatasetField(field, value) {
    setDatasetFieldsDraft((previous) => ({ ...previous, [field]: value }));
  }

  function applyDatasetFields() {
    setDatasetFields({ ...datasetFieldsDraft });
    if (advanced) setTargetSubfolder(targetSubfolderDraft.trim());
    setRouteLengthsConfirmed(false);
    setStatusMessage("Applied the canonical dataset fields. Review the folder preview, trace identities and WG lengths before confirming the package.");
  }

  function updateEntryOverride(sourcePath, field, value) {
    setConvertedEntries((previous) => previous.map((entry) => entry.sourcePath !== sourcePath ? entry : {
      ...entry,
      metaOverrides: { ...(entry.metaOverrides || {}), [field]: value }
    }));
    setRouteLengthsConfirmed(false);
  }

  function updateRouteLength(route, value) {
    setRouteLengths((previous) => ({ ...previous, [route]: value }));
    setRouteLengthsConfirmed(false);
  }

  async function handleSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setConverting(true);
    setStatusMessage(`Converting ${files.length} selected file(s) to headerless, tab-delimited TXT traces...`);
    try {
      const result = await convertManualMeasurementFiles(files, { launchPowerDbm, outputFormat: "txt" });
      const normalizedEntries = result.converted.map(normalizeConvertedEntry);
      setConvertedEntries(normalizedEntries);
      setFailedEntries(result.failed);
      setIgnoredPaths(result.ignored);

      const firstMeta = normalizedEntries[0]?.standardMeta || {};
      const detectedProject = firstMeta.mpw && firstMeta.mpw !== "MPWUNDEFINED" ? firstMeta.mpw : "";
      const detectedSlot = firstMeta.slot && firstMeta.slot !== "SlotUndefined" ? firstMeta.slot : "";
      const detectedBuildingBlock = /rib/i.test(firstMeta.waveguideDescriptor || "")
        ? "RIB_Waveguide"
        : /strip/i.test(firstMeta.waveguideDescriptor || "")
          ? "STRIP_Waveguide"
          : datasetFieldsDraft.buildingBlockLabel;
      const nextFields = {
        ...datasetFieldsDraft,
        projectName: detectedProject || datasetFieldsDraft.projectName,
        slot: detectedSlot || datasetFieldsDraft.slot,
        buildingBlockLabel: detectedBuildingBlock
      };
      setDatasetFields(nextFields);
      setDatasetFieldsDraft(nextFields);

      const detectedRoutes = [...new Set(normalizedEntries.map((entry) => entry.waveguideId).filter(Boolean))]
        .sort((left, right) => routeNumber(left) - routeNumber(right));
      setRouteLengths(Object.fromEntries(detectedRoutes.map((route) => [route, (routeNumber(route) - 1) * 4])));
      setRouteLengthsConfirmed(false);

      if (advanced && !targetSubfolderDraft.trim()) {
        const detectedTarget = normalizedEntries[0]?.flavor || "";
        setTargetSubfolder(detectedTarget);
        setTargetSubfolderDraft(detectedTarget);
      }
      setStatusMessage(`Converted ${result.converted.length} workbook(s). The common 0, 4, 8... mm route pattern was prefilled; verify it against this test structure before confirming.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Manual conversion failed.");
    } finally {
      setConverting(false);
      if (event.target) event.target.value = "";
    }
  }

  function buildPackage() {
    return buildGithubReadyManualDatasetPackage({ entries: readyEntries, datasetFields, routeLengths, routeLengthsConfirmed, launchPowerDbm });
  }

  function exportZip() {
    try {
      const datasetPackage = buildPackage();
      downloadBlob(datasetPackage.zip, `${datasetPackage.folderName}.zip`);
      setStatusMessage(`Created ${datasetPackage.folderName}.zip with ${datasetPackage.traceFiles.length} traces and all required supporting files.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Dataset package generation failed.");
    }
  }

  function exportManifest() {
    try {
      const datasetPackage = buildPackage();
      downloadText(datasetPackage.filenameManifest, `${datasetPackage.folderName}_filename-manifest.csv`, "text/csv;charset=utf-8");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Manifest generation failed.");
    }
  }

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card manual-conversion-card">
        <div className="analysis-card-head">
          <div>
            <h2>{advanced ? "Manual Measurement - Conversion (Advanced)" : "Manual Measurement - Conversion"}</h2>
            <p>Convert WG*.xlsx workbooks into the exact dataset structure used by the measurement library. The ZIP contains one canonical folder, short <code>Chip#_WG#.txt</code> traces, README, metadata, route configuration, legacy waveguide configuration and a checksum manifest.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={exportZip} disabled={!validation.valid}>Download Library-Ready ZIP</button>
            <button type="button" className="ghost-action" onClick={exportManifest} disabled={!validation.valid}>Download Manifest</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field"><span>Project</span><input value={datasetFieldsDraft.projectName} onChange={(event) => updateDatasetField("projectName", event.target.value)} placeholder="MPW48, DEV_MIT or BSPK_Duality" /></label>
          <label className="mapping-field"><span>Platform</span><select value={datasetFieldsDraft.platformLabel} onChange={(event) => updateDatasetField("platformLabel", event.target.value)}>{DATASET_PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="mapping-field"><span>Slot</span><input value={datasetFieldsDraft.slot} onChange={(event) => updateDatasetField("slot", event.target.value)} placeholder="Slot5" /></label>
          <label className="mapping-field"><span>Process step</span><input value={datasetFieldsDraft.processStep} onChange={(event) => updateDatasetField("processStep", event.target.value)} placeholder="Step36 or StepXX" /></label>
          <label className="mapping-field"><span>Optical mode</span><select value={datasetFieldsDraft.opticalMode} onChange={(event) => updateDatasetField("opticalMode", event.target.value)}>{DATASET_OPTICAL_MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="mapping-field"><span>Building block</span><select value={datasetFieldsDraft.buildingBlockLabel} onChange={(event) => updateDatasetField("buildingBlockLabel", event.target.value)}>{PROPAGATION_BUILDING_BLOCKS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="mapping-field"><span>Measurement type</span><input value="PropagationLoss" disabled /></label>
          <label className="mapping-field"><span>Alignment mode</span><select value={datasetFieldsDraft.alignmentMode} onChange={(event) => updateDatasetField("alignmentMode", event.target.value)}>{DATASET_ALIGNMENT_MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="mapping-field"><span>Measurement date</span><input type="date" value={datasetFieldsDraft.measurementDate} onInput={(event) => updateDatasetField("measurementDate", event.currentTarget.value)} /></label>
          <label className="mapping-field"><span>Laser output power (dBm)</span><input type="number" value={launchPowerDbm} onChange={(event) => setLaunchPowerDbm(Number(event.target.value) || 0)} /></label>
          {advanced ? <label className="mapping-field"><span>Target source subfolder</span><input value={targetSubfolderDraft} onChange={(event) => setTargetSubfolderDraft(event.target.value)} placeholder="Rib or Strip" /></label> : null}
          <label className="mapping-field mapping-field-wide"><span>Notes</span><input value={datasetFieldsDraft.notes} onChange={(event) => updateDatasetField("notes", event.target.value)} placeholder="Optional measurement notes" /></label>
        </div>
        <div className="library-action-row"><button type="button" onClick={applyDatasetFields} disabled={!hasPendingDatasetChanges && !hasPendingTargetSubfolderChange}>Apply Dataset Fields</button></div>

        <div className="manual-conversion-upload-row">
          <label className="upload-measurement-button manual-conversion-upload"><input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" onChange={handleSelection} /><span>{converting ? "Converting..." : "Upload Manual Folder"}</span></label>
          <label className="upload-measurement-button manual-conversion-upload secondary-upload"><input type="file" multiple accept=".xlsx,.xls" onChange={handleSelection} /><span>{converting ? "Converting..." : "Upload Excel Files"}</span></label>
        </div>

        <div className="translator-metrics manual-conversion-summary">
          <div><strong>{summary.converted}</strong><span>Converted traces</span></div>
          <div><strong>{summary.rows.toLocaleString()}</strong><span>Trace rows</span></div>
          <div><strong>{validation.missing.length}</strong><span>Required checks remaining</span></div>
          <div><strong>{validation.folderName || "Dataset identity incomplete"}</strong><span>Canonical folder name</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head stacked"><div><h2>Package Readiness</h2><p>{statusMessage}</p></div></div>
        {validation.missing.length ? <div className="manual-conversion-list-card"><strong>Complete before download</strong><ul>{validation.missing.map((item) => <li key={item}>{item}</li>)}</ul></div> : <div className="chart-empty compact">Package checks passed. The ZIP is ready to download.</div>}

        {validation.routes.length ? (
          <div className="manual-route-config-card">
            <div><h3>Propagation route lengths</h3><p>Lengths are prefilled as 0, 4, 8... mm. Check them against the actual test structure; these values control the propagation-loss fit.</p></div>
            <div className="settings-grid settings-grid-extended">
              {validation.routes.map((route) => <label key={route} className="mapping-field"><span>{route} length (mm)</span><input type="number" step="any" value={routeLengths[route] ?? ""} onChange={(event) => updateRouteLength(route, event.target.value)} /></label>)}
            </div>
            <label className="checkbox-row manual-route-confirmation"><input type="checkbox" checked={routeLengthsConfirmed} onChange={(event) => setRouteLengthsConfirmed(event.target.checked)} /><span>I confirmed every WG length for this dataset.</span></label>
          </div>
        ) : null}
      </article>

      <article className="analysis-card">
        <div className="manual-conversion-grid">
          <div className="manual-conversion-pane">
            <h3>Converted Outputs</h3>
            {readyEntries.length ? (
              <div className="dashboard-table-wrap"><table><thead><tr><th>Source</th><th>Chip</th><th>WG</th><th>Library filename</th><th>Rows</th><th>Actions</th></tr></thead><tbody>
                {readyEntries.map((entry) => <tr key={entry.sourcePath}><td>{entry.sourcePath}</td><td><input className="table-inline-input table-inline-input-wide" value={entry.metaOverrides?.chipId || entry.standardMeta?.chipId || ""} onChange={(event) => updateEntryOverride(entry.sourcePath, "chipId", event.target.value)} placeholder="Chip2" /></td><td><input className="table-inline-input table-inline-input-wide" value={entry.metaOverrides?.waveguideId || entry.standardMeta?.waveguideId || ""} onChange={(event) => updateEntryOverride(entry.sourcePath, "waveguideId", event.target.value)} placeholder="WG1" /></td><td className="filename-preview-cell"><strong>{entry.outputFileName}</strong></td><td>{entry.rowCount}</td><td className="library-table-actions"><button type="button" onClick={() => downloadText(entry.content, entry.outputFileName)}>Download</button></td></tr>)}
              </tbody></table></div>
            ) : <div className="chart-empty">{advanced && targetSubfolder ? `No converted outputs matched "${targetSubfolder}".` : "No converted outputs yet."}</div>}
          </div>

          <div className="manual-conversion-pane">
            <h3>Ignored / Failed</h3>
            <div className="manual-conversion-list-card"><strong>Ignored files</strong>{ignoredPaths.length ? <ul>{ignoredPaths.slice(0, 20).map((item) => <li key={item}>{item}</li>)}</ul> : <p>No ignored files.</p>}</div>
            <div className="manual-conversion-list-card"><strong>Failed conversions</strong>{failedEntries.length ? <ul>{failedEntries.map((item) => <li key={item.sourcePath}>{item.sourcePath}: {item.message}</li>)}</ul> : <p>No failed conversions.</p>}</div>
          </div>
        </div>
      </article>
    </section>
  );
}
