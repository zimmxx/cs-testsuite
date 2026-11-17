import { useMemo, useState } from "react";
import {
  INSERTION_FILE_TYPES, INSERTION_VALUE_TYPES, buildInsertionArchive, buildInsertionPackages,
  convertInsertionTrace, inspectInsertionFile, insertionPathMatches, orientInsertionRows,
  suggestInsertionIdentity, suggestInsertionMapping
} from "../lib/insertionConversion";
import {
  DATASET_ALIGNMENT_MODE_OPTIONS, DATASET_BUILDING_BLOCK_OPTIONS, DATASET_OPTICAL_MODE_OPTIONS,
  DATASET_PLATFORM_OPTIONS, validateCanonicalDatasetIdentity, normalizeMeasurementDate
} from "../lib/githubLibrary";

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function columnName(index) {
  let result = "";
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function createMapping(source, sheetName, transpose = false) {
  const sheet = source.sheets.find((item) => item.name === sheetName) || source.sheets[0];
  return { ...suggestInsertionMapping(orientInsertionRows(sheet.rows, transpose)), ...suggestInsertionIdentity(source.sourcePath), sheetName: sheet.name, transpose, included: true };
}

function SelectField({ label, value, options, onChange }) {
  return <label className="mapping-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => {
    const [key, text] = Array.isArray(option) ? option : [option, option];
    return <option key={key} value={key}>{text}</option>;
  })}</select></label>;
}

function ColumnField({ label, value, options, columnCount, onChange }) {
  if (columnCount <= 256) return <SelectField label={label} value={String(value)} options={options} onChange={(next) => onChange(Number(next))} />;
  return <label className="mapping-field"><span>{label} (number, 1–{columnCount})</span><input type="number" min="1" max={columnCount} value={Number(value) + 1} onChange={(event) => onChange(Number(event.target.value) - 1)} /></label>;
}

function TraceMapping({ trace, index, result, onChange, onDuplicate, onRemove }) {
  const { source, mapping } = trace;
  const rows = useMemo(() => orientInsertionRows(source.sheets.find((item) => item.name === mapping.sheetName)?.rows || [], mapping.transpose), [source, mapping.sheetName, mapping.transpose]);
  const columnCount = useMemo(() => rows.reduce((max, row) => Math.max(max, row.length), 0), [rows]);
  const header = rows[Number(mapping.headerRow) - 1] || [];
  const previewIndices = [...new Set([...Array.from({ length: Math.min(columnCount, 12) }, (_, col) => col), Number(mapping.wavelengthColumn), Number(mapping.valueColumn)])].filter((col) => col >= 0 && col < columnCount).sort((left, right) => left - right);
  const columns = (columnCount <= 256 ? Array.from({ length: columnCount }, (_, col) => col) : previewIndices).map((col) => [String(col), `${columnName(col)}${header[col] != null ? ` — ${String(header[col]).slice(0, 80)}` : ""}`]);
  const previewColumns = columns.filter(([col]) => previewIndices.includes(Number(col)));
  const previewStart = Math.max(0, Number(mapping.startRow) - 1);
  const patch = (field, value) => onChange({ ...mapping, [field]: value });
  return <article className="analysis-card insertion-trace-card">
    <div className="analysis-card-head">
      <div><h3>Trace {index + 1}: {source.name}</h3><p>{source.sourcePath}</p></div>
      <div className="library-action-row"><button type="button" className="ghost-action" onClick={onDuplicate}>Add another trace from this file</button><button type="button" className="ghost-action" onClick={onRemove}>Remove trace</button></div>
    </div>
    <label className="checkbox-row"><input type="checkbox" checked={mapping.included} onChange={(event) => patch("included", event.target.checked)} /><span>Include trace {index + 1} in conversion</span></label>
    <div className="settings-grid settings-grid-extended">
      <SelectField label={`Worksheet for trace ${index + 1}`} value={mapping.sheetName} options={source.sheets.map((item) => item.name)} onChange={(value) => onChange({ ...mapping, ...createMapping(source, value, mapping.transpose), chipId: mapping.chipId, deviceLabel: mapping.deviceLabel, buildingBlockLabel: mapping.buildingBlockLabel })} />
      <label className="mapping-field"><span>Header row (0 = none)</span><input type="number" min="0" max={rows.length} value={mapping.headerRow} onChange={(event) => patch("headerRow", event.target.value)} /></label>
      <label className="mapping-field"><span>First data row</span><input type="number" min="1" max={rows.length} value={mapping.startRow} onChange={(event) => patch("startRow", event.target.value)} /></label>
      <label className="mapping-field"><span>Last data row (blank = end)</span><input type="number" min="1" max={rows.length} value={mapping.endRow} onChange={(event) => patch("endRow", event.target.value)} /></label>
      <ColumnField label={`Wavelength column for trace ${index + 1}`} value={mapping.wavelengthColumn} options={columns} columnCount={columnCount} onChange={(value) => patch("wavelengthColumn", value)} />
      <ColumnField label={`Value column for trace ${index + 1}`} value={mapping.valueColumn} options={columns} columnCount={columnCount} onChange={(value) => patch("valueColumn", value)} />
      <SelectField label="Wavelength unit" value={mapping.wavelengthUnit} options={[["nm", "Nanometres (nm)"], ["m", "Metres (m)"], ["um", "Micrometres (µm)"], ["pm", "Picometres (pm)"]]} onChange={(value) => patch("wavelengthUnit", value)} />
      <SelectField label="Value meaning / unit" value={mapping.valueType} options={INSERTION_VALUE_TYPES} onChange={(value) => patch("valueType", value)} />
      <label className="mapping-field"><span>Chip identifier</span><input value={mapping.chipId} placeholder="Chip67" onChange={(event) => patch("chipId", event.target.value)} /></label>
      <label className="mapping-field"><span>Device / reference label</span><input value={mapping.deviceLabel} onChange={(event) => patch("deviceLabel", event.target.value)} /></label>
      <SelectField label="Trace building block" value={mapping.buildingBlockLabel} options={DATASET_BUILDING_BLOCK_OPTIONS} onChange={(value) => patch("buildingBlockLabel", value)} />
    </div>
    <label className="checkbox-row"><input type="checkbox" checked={mapping.transpose} onChange={(event) => onChange({ ...mapping, ...suggestInsertionMapping(orientInsertionRows(source.sheets.find((item) => item.name === mapping.sheetName).rows, event.target.checked)), transpose: event.target.checked })} /><span>Data runs across rows — transpose before mapping</span></label>
    <p className="insertion-preview-caption">Source preview: first six rows from the selected data range; first twelve columns plus the selected columns. Column letters and row numbers refer to the transposed table when enabled.</p>
    <div className="dashboard-table-wrap insertion-source-preview"><table><thead><tr><th>Row</th>{previewColumns.map(([col, label]) => <th key={col}>{label}</th>)}</tr></thead><tbody>{rows.slice(previewStart, previewStart + 6).map((row, i) => <tr key={i}><td>{previewStart + i + 1}</td>{previewColumns.map(([col]) => <td key={col}>{String(row[Number(col)] ?? "")}</td>)}</tr>)}</tbody></table></div>
    {mapping.included ? result.error ? <p role="alert" className="insertion-conversion-error">{result.error}</p> : <div className="insertion-conversion-result"><p><strong>{result.entry.rowCount.toLocaleString()} valid points</strong> · {result.entry.wavelengthMinNm.toFixed(2)}–{result.entry.wavelengthMaxNm.toFixed(2)} nm · {result.entry.skippedRows} skipped rows</p><p>First converted point: {result.entry.convertedRows[0].wavelengthNm.toFixed(3)} nm, {result.entry.convertedRows[0].ilDb.toFixed(3)} dB insertion loss.</p></div> : <p>Excluded from conversion.</p>}
  </article>;
}

export default function InsertionConversionPanel({ defaultLaunchPowerDbm = 10 }) {
  const [fields, setFields] = useState({ projectName: "", platformLabel: "SOI340nm", slot: "", processStep: "StepXX", opticalMode: "1550nm_TE", alignmentMode: "OperatorAlign", measurementDate: "", notes: "" });
  const [launchPower, setLaunchPower] = useState(String(defaultLaunchPowerDbm));
  const [targetFolder, setTargetFolder] = useState("");
  const [traces, setTraces] = useState([]);
  const [notices, setNotices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose files or a parent folder, then review each trace mapping. Source files are read only.");
  const [confirmed, setConfirmed] = useState(false);
  const [exported, setExported] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pastedName, setPastedName] = useState("Pasted trace.csv");

  const results = useMemo(() => traces.map((trace) => {
    if (!trace.mapping.included) return {};
    try { return { entry: convertInsertionTrace(trace.source, trace.mapping, launchPower) }; }
    catch (error) { return { error: error.message }; }
  }), [traces, launchPower]);
  const selected = results.flatMap((result) => result.entry ? [result.entry] : []);
  const missing = useMemo(() => {
    const required = [];
    if (!selected.length) required.push("Include at least one readable trace.");
    if (results.some((item) => item.error)) required.push("Resolve the included trace mapping errors, or exclude those traces.");
    if (selected.some((item) => !/^Chip\d+$/.test(item.chipId))) required.push("Assign a Chip number to each included trace (for example Chip67).");
    if (selected.some((item) => !item.deviceLabel)) required.push("Give every included trace a device / reference label.");
    const keys = selected.map((item) => JSON.stringify([item.buildingBlockLabel, item.chipId, item.deviceLabel]));
    if (new Set(keys).size !== keys.length) required.push("Use unique device labels within each chip and building block.");
    const sources = selected.map((item) => JSON.stringify([item.buildingBlockLabel, item.sourcePath]));
    if (new Set(sources).size !== sources.length) required.push("Duplicated traces must use a different worksheet, value column or row range.");
    const validation = validateCanonicalDatasetIdentity({ ...fields, buildingBlockLabel: "RIB_Waveguide", measurementType: "InsertionLoss" });
    required.push(...validation.missing.map((item) => `Complete ${item}.`));
    if (!normalizeMeasurementDate(fields.measurementDate)) required.push("Enter the measurement date.");
    if (!confirmed) required.push("Confirm the mappings and converted preview.");
    return required;
  }, [fields, results, confirmed]);
  const blocks = [...new Set(selected.map((entry) => entry.buildingBlockLabel))];

  function invalidate() { setConfirmed(false); setExported(false); }
  function updateField(key, value) { setFields((previous) => ({ ...previous, [key]: value })); invalidate(); }
  function updateTrace(id, mapping) { setTraces((previous) => previous.map((trace) => trace.id === id ? { ...trace, mapping } : trace)); invalidate(); }

  async function selectFiles(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    setBusy(true); invalidate();
    const next = [];
    const messages = [];
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      if (!INSERTION_FILE_TYPES.test(file.name)) { messages.push(`${path}: skipped unsupported format.`); continue; }
      if (file.webkitRelativePath && !insertionPathMatches(path, targetFolder)) { messages.push(`${path}: outside target subfolder.`); continue; }
      try {
        const source = await inspectInsertionFile(file);
        const sheetName = source.sheets.find((sheet) => /^il$|insertion.loss/i.test(sheet.name))?.name || source.sheets[0].name;
        next.push({ id: crypto.randomUUID(), source, mapping: createMapping(source, sheetName) });
      } catch (error) { messages.push(`${path}: ${error.message}`); }
    }
    setTraces(next); setNotices(messages);
    const path = next[0]?.source.sourcePath || "";
    const project = path.match(/(?:^|[\\/])(MPW\d+)(?=[_\\/])/i)?.[1];
    const slot = path.match(/Slot\d+/i)?.[0];
    setFields((previous) => ({ ...previous, projectName: previous.projectName || project?.toUpperCase() || "", slot: previous.slot || slot || "" }));
    setStatus(`${next.length} files ready for mapping. ${messages.length} skipped or unreadable. ${files.some((file) => !file.webkitRelativePath) && targetFolder.trim() ? "Individual file selection has no parent path; explicitly selected files are included regardless of the folder filter." : ""}`);
    setBusy(false); input.value = "";
  }

  function exportArchive() {
    try {
      const packages = buildInsertionPackages(selected, fields, Number(launchPower));
      saveBlob(buildInsertionArchive(packages), `${fields.projectName}_${fields.slot}_InsertionLoss.zip`);
      setStatus(`Created ${packages.length} insertion-loss dataset folder(s) with ${selected.length} traces. Extract the ZIP, then upload one folder's TXT files together with its metadata.json and route-config.json.`);
      setExported(true);
    } catch (error) { setStatus(error.message); setExported(false); }
  }

  async function addPastedTrace() {
    try {
      const name = /\.(csv|tsv|txt)$/i.test(pastedName) ? pastedName : `${pastedName || "Pasted trace"}.csv`;
      const source = await inspectInsertionFile({ name, text: async () => pastedText });
      setTraces((previous) => [...previous, { id: crypto.randomUUID(), source, mapping: createMapping(source, source.sheets[0].name) }]);
      invalidate(); setStatus("Pasted table added. Review its columns, units and chip identifier before exporting.");
    } catch (error) { setStatus(error.message); }
  }

  return <section className="library-stack workspace-fit-view">
    <article className="analysis-card manual-conversion-card">
      <div className="analysis-card-head"><div><h2>Manual Conversion (Advanced Insertion Loss)</h2><p>Convert Excel, CSV, TSV or TXT spectra with any filename. Select the worksheet, rows, columns and units for each trace, including data arranged across rows. No propagation lengths are required.</p></div><div className="library-action-row"><button type="button" disabled={busy || missing.length > 0} onClick={exportArchive}>Download Insertion-Loss ZIP</button></div></div>
      <div className="settings-grid settings-grid-extended">
        <label className="mapping-field"><span>Project</span><input value={fields.projectName} placeholder="MPW49" onChange={(event) => updateField("projectName", event.target.value)} /></label>
        <SelectField label="Platform" value={fields.platformLabel} options={DATASET_PLATFORM_OPTIONS} onChange={(value) => updateField("platformLabel", value)} />
        <label className="mapping-field"><span>Slot</span><input value={fields.slot} placeholder="Slot9" onChange={(event) => updateField("slot", event.target.value)} /></label>
        <label className="mapping-field"><span>Process step</span><input value={fields.processStep} onChange={(event) => updateField("processStep", event.target.value)} /></label>
        <SelectField label="Optical mode" value={fields.opticalMode} options={DATASET_OPTICAL_MODE_OPTIONS} onChange={(value) => updateField("opticalMode", value)} />
        <SelectField label="Alignment mode" value={fields.alignmentMode} options={DATASET_ALIGNMENT_MODE_OPTIONS} onChange={(value) => updateField("alignmentMode", value)} />
        <label className="mapping-field"><span>Measurement type</span><input value="InsertionLoss" readOnly /></label>
        <label className="mapping-field"><span>Measurement date</span><input type="date" value={fields.measurementDate} onInput={(event) => updateField("measurementDate", event.currentTarget.value)} /></label>
        <label className="mapping-field"><span>Laser output power (dBm)</span><input type="number" step="any" value={launchPower} onChange={(event) => { setLaunchPower(event.target.value); invalidate(); }} /></label>
        <label className="mapping-field"><span>Target source subfolder (optional)</span><input value={targetFolder} placeholder="BORDER" onChange={(event) => setTargetFolder(event.target.value)} /></label>
        <label className="mapping-field mapping-field-wide"><span>Notes</span><input value={fields.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
      </div>
      <p>The subfolder filter applies when choosing a folder. For example, BORDER includes both Rib_Ref.xlsx and Strip_Ref.xlsx across all selected chips. Change the filter before selecting the folder again. Selecting individual files includes them directly.</p>
      <div className="manual-conversion-upload-row">
        <label className="upload-measurement-button manual-conversion-upload"><input type="file" aria-label="Choose insertion-loss folder" multiple webkitdirectory="" directory="" disabled={busy} onChange={selectFiles} /><span>{busy ? "Reading files…" : "Choose Source Folder"}</span></label>
        <label className="upload-measurement-button manual-conversion-upload secondary-upload"><input type="file" aria-label="Choose insertion-loss files" multiple accept=".xlsx,.xls,.csv,.tsv,.txt" disabled={busy} onChange={selectFiles} /><span>Choose Insertion-Loss Files</span></label>
      </div>
      <p role="status">{status}</p>
      <details className="insertion-paste"><summary>Or paste a table</summary><div className="settings-grid"><label className="mapping-field"><span>Pasted source name</span><input value={pastedName} onChange={(event) => setPastedName(event.target.value)} /></label><label className="mapping-field mapping-field-wide"><span>Paste CSV or tab-separated data</span><textarea rows="5" value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder={"wavelength_nm,loss_db\n1540,20\n1550,18"} /></label></div><div className="library-action-row"><button type="button" disabled={busy || !pastedText.trim()} onClick={addPastedTrace}>Add Pasted Trace</button></div></details>
      {notices.length ? <details><summary>{notices.length} skipped / unreadable files</summary><ul>{notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></details> : null}
    </article>
    {traces.map((trace, index) => <TraceMapping key={trace.id} trace={trace} index={index} result={results[index]} onChange={(mapping) => updateTrace(trace.id, mapping)} onRemove={() => { setTraces((previous) => previous.filter((item) => item.id !== trace.id)); invalidate(); }} onDuplicate={() => { setTraces((previous) => [...previous, { ...trace, id: crypto.randomUUID(), mapping: { ...trace.mapping, deviceLabel: `${trace.mapping.deviceLabel}_copy` } }]); invalidate(); }} />)}
    <article className="analysis-card">
      <h2>Package review</h2><p>{selected.length} included traces · {selected.reduce((sum, entry) => sum + entry.rowCount, 0).toLocaleString()} points · {blocks.length} building-block folders</p>
      <p>Rib and strip traces are packaged separately. Each device label receives a stable WG identifier for compatibility with the library; it is a trace identifier and has no physical length. Original source names and device labels stay in metadata and the checksum manifest.</p>
      {selected.length ? <div className="dashboard-table-wrap"><table><thead><tr><th>Chip</th><th>Device / reference</th><th>Building block</th><th>Points</th><th>Skipped</th></tr></thead><tbody>{selected.map((entry, index) => <tr key={index}><td>{entry.chipId || "Assign chip"}</td><td>{entry.deviceLabel}</td><td>{entry.buildingBlockLabel}</td><td>{entry.rowCount}</td><td>{entry.skippedRows}</td></tr>)}</tbody></table></div> : null}
      <label className="checkbox-row manual-route-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I verified the chip identities, device labels, units, skipped rows and converted previews.</span></label>
      {missing.length ? <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Ready to download. Extract the ZIP and upload one dataset folder at a time, including metadata.json and route-config.json alongside all TXT traces.</p>}
      <div className="library-action-row"><button type="button" disabled={busy || missing.length > 0} onClick={exportArchive}>Download Insertion-Loss ZIP</button></div>
      {exported ? <p>Conversion downloaded. Your original source files were not modified.</p> : null}
    </article>
  </section>;
}
