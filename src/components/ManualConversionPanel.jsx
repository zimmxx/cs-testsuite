import { useMemo, useRef, useState } from "react";
import {
  buildManualConversionArchiveName,
  buildManualConversionManifestCsv,
  buildStoredZip,
  convertManualMeasurementFiles
} from "../lib/manualConversion";

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

export default function ManualConversionPanel({ defaultLaunchPowerDbm = 10 }) {
  const folderInputRef = useRef(null);
  const [launchPowerDbm, setLaunchPowerDbm] = useState(defaultLaunchPowerDbm);
  const [outputFormat, setOutputFormat] = useState("txt");
  const [converting, setConverting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Upload a manual-measurement folder to convert WG*.xlsx files into WST-compatible text traces.");
  const [convertedEntries, setConvertedEntries] = useState([]);
  const [failedEntries, setFailedEntries] = useState([]);
  const [ignoredPaths, setIgnoredPaths] = useState([]);

  const summary = useMemo(() => ({
    converted: convertedEntries.length,
    failed: failedEntries.length,
    ignored: ignoredPaths.length,
    rows: convertedEntries.reduce((sum, entry) => sum + entry.rowCount, 0)
  }), [convertedEntries, failedEntries, ignoredPaths]);

  const archiveBaseName = useMemo(() => buildManualConversionArchiveName(convertedEntries), [convertedEntries]);

  async function handleSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setConverting(true);
    setStatusMessage(`Converting ${files.length} selected file(s) using SheetJS Community Edition...`);
    try {
      const result = await convertManualMeasurementFiles(files, { launchPowerDbm, outputFormat });
      setConvertedEntries(result.converted);
      setFailedEntries(result.failed);
      setIgnoredPaths(result.ignored);
      setStatusMessage(`Converted ${result.converted.length} workbook(s). Ignored ${result.ignored.length} non-WG/manual files and found ${result.failed.length} conversion issue(s).`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Manual conversion failed.");
    } finally {
      setConverting(false);
      if (event.target) event.target.value = "";
    }
  }

  function exportZip() {
    if (!convertedEntries.length) return;
    const zip = buildStoredZip(convertedEntries, { rootFolderName: archiveBaseName });
    downloadBlob(zip, `${archiveBaseName}.zip`);
  }

  function exportManifest() {
    if (!convertedEntries.length) return;
    downloadText(buildManualConversionManifestCsv(convertedEntries), `${archiveBaseName}_manifest.csv`, "text/csv;charset=utf-8");
  }

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card manual-conversion-card">
        <div className="analysis-card-head">
          <div>
            <h2>Manual Measurement - Conversion</h2>
            <p>Convert nested manual-measurement Excel folders such as <code>MPW30/Slot11/.../Chip2/WG1.xlsx</code> into WST-compatible propagation traces. This uses the free open-source <strong>SheetJS Community Edition</strong> <code>xlsx</code> parser directly in the browser.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={exportZip} disabled={!convertedEntries.length}>Download ZIP</button>
            <button type="button" className="ghost-action" onClick={exportManifest} disabled={!convertedEntries.length}>Download Manifest</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
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
            <span>Input mode</span>
            <p>Upload the folder directly from Edge/Chrome so the app can read subfolders. The exported archive now uses the standardized dataset name so the converted folder is ready for GitHub library storage.</p>
          </div>
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
            {convertedEntries.length ? (
              <div className="dashboard-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Output</th>
                      <th>Source</th>
                      <th>Chip</th>
                      <th>WG</th>
                      <th>Rows</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convertedEntries.map((entry) => (
                      <tr key={entry.outputFileName}>
                        <td>{entry.outputFileName}</td>
                        <td>{entry.sourcePath}</td>
                        <td>{entry.chipId || "--"}</td>
                        <td>{entry.waveguideId || "--"}</td>
                        <td>{entry.rowCount}</td>
                        <td className="library-table-actions">
                          <button type="button" onClick={() => downloadText(entry.content, entry.outputFileName, entry.outputFormat === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8")}>Download</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="chart-empty">No converted manual-measurement outputs yet.</div>
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
