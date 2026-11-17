import { useEffect, useMemo, useRef, useState } from "react";
import { PlotlyFigure } from "./InteractivePlots";
import ElectricalDeviceTable from "./ElectricalDeviceTable";
import { getWaferTemplateLayout } from "../lib/waferTemplates";
import { analyzeElectricalTrace, createElectricalProject, electricalPointsCsv, electricalSummaryCsv, mergeElectricalTraces, parseElectricalFile, readElectricalProject } from "../lib/electricalAnalysis";
import { filterElectricalDevices, normalizeElectricalView, selectElectricalCurves } from "../lib/electricalView";

const DEFAULT_SETTINGS = { minVoltageV: "", maxVoltageV: "", throughOrigin: false };
const traceColor = (trace) => `hsl(${(Number(trace.chipId.replace(/\D/g, "")) * 137 + Number(trace.deviceId.replace(/\D/g, "")) * 51) % 360}, 65%, 42%)`;
// Plotly uses trace UIDs in CSS selectors; encode identities as CSS-safe hex.
const traceUid = (key) => `e${Array.from(key, (character) => character.codePointAt(0).toString(16).padStart(6, "0")).join("")}`;
const format = (value, digits = 2) => value == null || !Number.isFinite(value) ? "—" : Number(value).toFixed(digits);
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ElectricalPlot({ title, traces, field, yTitle, selectedKey, showFit = false, showMarkers = false, fitRangeOnly = false }) {
  const data = useMemo(() => {
    const items = traces.map((trace) => {
      const points = fitRangeOnly ? trace.points.filter((point) => point.inFit) : trace.points;
      return {
      type: "scatter", uid: traceUid(trace.key), mode: showMarkers ? "lines+markers" : "lines", name: `${trace.chipId} / ${trace.deviceId}`,
      x: points.map((point) => point.voltageV), y: points.map((point) => point[field]),
      marker: { size: 4 }, line: { color: traceColor(trace), width: trace.key === selectedKey ? 2.8 : 1.5 },
      connectgaps: false,
      hovertemplate: `${trace.chipId} / ${trace.deviceId}<br>V: %{x:.4g} V<br>${yTitle}: %{y:.5g}<extra></extra>`
    }; });
    if (showFit) {
      const selected = traces.find((trace) => trace.key === selectedKey);
      if (selected?.fit) {
        const { fit } = selected;
        const x = [fit.minVoltageV, fit.maxVoltageV];
        items.push({ type: "scatter", uid: `${traceUid(selected.key)}fit`, mode: "lines", name: `${selected.deviceId} fit`, x, y: x.map((v) => (fit.interceptA + fit.conductanceS * v) * 1000), line: { color: "#172554", dash: "dash", width: 2 } });
      }
    }
    return items;
  }, [traces, field, yTitle, selectedKey, showFit, showMarkers, fitRangeOnly]);
  const layout = useMemo(() => ({
    margin: { l: 68, r: 20, t: 25, b: 60 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "#fbfcfc",
    xaxis: { title: "Applied voltage (V)", zeroline: true, gridcolor: "#e3ecef" },
    yaxis: { title: yTitle, zeroline: true, gridcolor: "#e3ecef", autorange: true },
    legend: {
      orientation: traces.length > 8 ? "v" : "h",
      x: traces.length > 8 ? 1.02 : 0,
      y: traces.length > 8 ? 1 : 1.14,
      yanchor: traces.length > 8 ? "top" : "bottom",
      itemclick: "toggle", itemdoubleclick: "toggleothers",
      uirevision: traces.map((trace) => trace.key).join("|")
    }, showlegend: true, hovermode: "closest",
    font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" }
  }), [yTitle, traces]);
  const config = useMemo(() => ({ responsive: true, displaylogo: false, scrollZoom: true }), []);
  return <article className="analysis-card electrical-plot-card"><div className="analysis-card-head"><h3>{title}</h3></div>
    <p className="electrical-legend-note">Click a legend entry to hide/show its curve; double-click to isolate it. {traces.length > 8 ? "Scroll the side legend for more devices. " : ""}Legend changes affect this figure only, not the fitted results.</p>
    <PlotlyFigure data={data} layout={layout} config={config} emptyMessage="Upload electrical sweeps to see this graph." windowTitle={title} height={350} />
  </article>;
}

export default function ElectricalAnalysisPanel({ active, waferTemplate, waferTemplates, onTemplateChange, renderWaferMap, loadSaved, saveSaved }) {
  const [traces, setTraces] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selection, setSelection] = useState({ runId: "", chipId: "", deviceId: "" });
  const [view, setView] = useState(() => normalizeElectricalView());
  const [filters, setFilters] = useState({ search: "", deviceId: "all", review: "all" });
  const [fitScope, setFitScope] = useState("device");
  const [fitOverrides, setFitOverrides] = useState({});
  const [exportScope, setExportScope] = useState("shown");
  const [tablePage, setTablePage] = useState(0);
  const [mapMetric, setMapMetric] = useState("resistance");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Upload two-column voltage (V) and current (A) sweeps to begin.");
  const [busy, setBusy] = useState(true);
  const inputRef = useRef(null);
  const folderRef = useRef(null);
  const projectRef = useRef(null);
  const chooserRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  function restore(project) {
    const restored = readElectricalProject(project);
    setTraces(restored.traces); setSettings(restored.settings); setSelection(restored.selection); setNotes(restored.notes);
    setView(normalizeElectricalView(restored.view)); setFitOverrides(restored.fitOverrides);
  }
  useEffect(() => {
    let cancelled = false;
    loadSaved().then((saved) => {
      if (!cancelled && saved) { restore(saved); setStatus("Restored your locally saved electrical workspace."); }
    }).catch((error) => { if (!cancelled) setStatus(`Saved workspace could not be restored: ${error.message}`); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  const analyses = useMemo(() => traces.map((trace) => analyzeElectricalTrace(trace, fitOverrides[trace.key] || settings)), [traces, settings, fitOverrides]);
  const runs = useMemo(() => [...new Set(traces.map((trace) => trace.runId))].sort(natural), [traces]);
  const runId = runs.includes(selection.runId) ? selection.runId : runs[0] || "";
  const runAnalyses = useMemo(() => filterElectricalDevices(analyses.filter((trace) => trace.runId === runId)), [analyses, runId]);
  const chips = useMemo(() => [...new Set(runAnalyses.map((trace) => trace.chipId))].sort(natural), [runAnalyses]);
  const chipId = chips.includes(selection.chipId) ? selection.chipId : chips[0] || "";
  const chipAnalyses = useMemo(() => runAnalyses.filter((trace) => trace.chipId === chipId), [runAnalyses, chipId]);
  const selected = chipAnalyses.find((trace) => trace.deviceId === selection.deviceId) || chipAnalyses[0];
  const plotTraces = useMemo(() => selectElectricalCurves(runAnalyses, view, selected), [view, selected, runAnalyses]);
  const filteredDevices = useMemo(() => filterElectricalDevices(runAnalyses, filters), [runAnalyses, filters]);
  const deviceIds = useMemo(() => [...new Set(runAnalyses.map((trace) => trace.deviceId))].sort(natural), [runAnalyses]);
  const fitSettings = fitScope === "all" ? settings : fitOverrides[selected?.key] || settings;
  const exportAnalyses = exportScope === "all" ? analyses : exportScope === "filtered" ? filteredDevices : plotTraces;
  const pageCount = Math.max(1, Math.ceil(filteredDevices.length / 12));
  const page = Math.min(tablePage, pageCount - 1);
  const tableDevices = filteredDevices.slice(page * 12, (page + 1) * 12);
  function updateFit(field, value) {
    if (fitScope === "all") { setSettings((previous) => ({ ...previous, [field]: value })); setFitOverrides({}); }
    else if (selected) setFitOverrides((previous) => ({ ...previous, [selected.key]: { ...(previous[selected.key] || settings), [field]: value } }));
  }
  function toggleComparison(key, checked) {
    setView((previous) => ({ ...previous, scope: "custom", comparisonKeys: checked ? [...new Set([...previous.comparisonKeys, key])] : previous.comparisonKeys.filter((value) => value !== key) }));
  }
  function updateFilter(field, value) { setFilters((previous) => ({ ...previous, [field]: value })); setTablePage(0); }
  function setViewFlag(field, value) { setView((previous) => ({ ...previous, [field]: value })); }
  const selectedOnly = useMemo(() => selected ? [selected] : [], [selected]);
  const layout = useMemo(() => getWaferTemplateLayout(waferTemplate), [waferTemplate]);
  const mapCells = useMemo(() => {
    const byChip = new Map(runAnalyses.filter((trace) => trace.deviceId === selected?.deviceId).map((trace) => [trace.chipId, trace]));
    return layout.map((slot) => {
      const trace = byChip.get(slot.chipId);
      const value = mapMetric === "resistance" ? trace?.fit?.resistanceOhm : trace?.peakPowerPoint?.powerMw;
      return { ...slot, value: value ?? null, hasMeasurement: Boolean(trace), isVisible: true, isActiveInView: value != null, detail: trace ? `${trace.deviceId}: ${format(value)} ${mapMetric === "resistance" ? "Ω fitted" : "mW peak"}` : "No electrical trace for this device" };
    });
  }, [runAnalyses, selected?.deviceId, layout, mapMetric]);
  const unmapped = chips.filter((id) => !layout.some((slot) => slot.chipId === id));
  const project = () => createElectricalProject(traces, settings, { runId, chipId, deviceId: selected?.deviceId || "" }, notes, { view, fitOverrides });

  async function upload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const incoming = []; const failures = [];
    try {
      for (const file of files) {
        try { incoming.push(parseElectricalFile(file.name, await file.text())); }
        catch (error) { failures.push(error.message); }
      }
      if (incoming.length) {
        const replaced = incoming.filter((item) => traces.some((previous) => previous.key === item.key)).length;
        setTraces((previous) => mergeElectricalTraces(previous, incoming));
        setSelection({ runId: incoming[0].runId, chipId: incoming[0].chipId, deviceId: incoming[0].deviceId });
        setStatus(`Loaded ${incoming.length} electrical file(s)${replaced ? `; replaced ${replaced} existing device sweep(s)` : ""}. ${failures.length ? `Skipped ${failures.length}: ${failures.join(" ")}` : "Original acquisition order retained."}`);
      } else setStatus(`No files loaded. ${failures.join(" ")}`);
    } finally { setBusy(false); }
  }

  async function importProject(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true);
    try { restore(JSON.parse(await file.text())); setStatus(`Restored electrical project ${file.name}.`); }
    catch (error) { setStatus(`Import failed: ${error.message}`); }
    finally { setBusy(false); }
  }

  async function saveLocal() {
    setBusy(true);
    try { await saveSaved(project()); setStatus("Electrical workspace saved locally, including raw sweeps, fit settings and notes."); }
    catch (error) { setStatus(`Local save failed: ${error.message}. Export project JSON to keep a portable copy.`); }
    finally { setBusy(false); }
  }

  return <section className="library-stack electrical-workspace" aria-label="Electrical Analysis workspace">
    <article className="analysis-card">
      <div className="analysis-card-head"><div><h2>Electrical Analysis</h2><p>DC heater sweeps · Applied voltage in V, measured current in A. Filename: <code>WaferThox_Wafer1_test1_Chip4_D1.txt</code>.</p></div>
        <div className="library-action-row">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>Upload Electrical Files</button>
          <button type="button" className="ghost-action" disabled={busy} onClick={() => folderRef.current?.click()}>Upload Electrical Folder</button>
        </div>
      </div>
      <input ref={inputRef} aria-label="Electrical measurement files" type="file" hidden multiple accept=".txt,.csv" onChange={upload} />
      <input ref={folderRef} aria-label="Electrical measurement folder" type="file" hidden multiple webkitdirectory="" directory="" onChange={upload} />
      <input ref={projectRef} aria-label="Electrical project JSON" type="file" hidden accept=".json" onChange={importProject} />
      <p className="electrical-status" role="status">{busy ? "Reading electrical workspace…" : status}</p>
      <div className="library-action-row electrical-actions">
        <button type="button" className="secondary-action" disabled={!traces.length || busy} onClick={saveLocal}>Save electrical workspace locally</button>
        <button type="button" className="ghost-action" disabled={!traces.length} onClick={() => download(JSON.stringify(project(), null, 2), "electrical-project.json", "application/json")}>Export project JSON</button>
        <button type="button" className="ghost-action" disabled={busy} onClick={() => projectRef.current?.click()}>Import project JSON</button>
        <button type="button" className="ghost-action" disabled={!traces.length || busy} onClick={() => { setTraces([]); setSelection({}); setStatus("Imported electrical data cleared. Your saved local copy is unchanged."); }}>Clear electrical data</button>
      </div>
    </article>

    <div className="translator-metrics electrical-stats">
      <div><strong>{chips.length}</strong><span>Chips in selected run</span></div>
      <div><strong>{runAnalyses.length}</strong><span>Device sweeps in selected run</span></div>
      <div><strong>{selected?.points.length || 0}</strong><span>Points · selected device</span></div>
      <div><strong>{format(selected?.fit?.resistanceOhm)} Ω</strong><span>Fitted two-terminal resistance</span></div>
      <div><strong>{format(selected?.peakPowerPoint?.powerMw)} mW</strong><span>Peak measured power · selected device</span></div>
    </div>

    <article className="analysis-card">
      <div className="analysis-card-head"><div><h3>Device selection & fit</h3><p>Run names are taken from the filename prefix. Devices from different runs are kept separate.</p></div></div>
      <div className="electrical-control-grid">
        <label className="mapping-field"><span>Electrical run</span><select aria-label="Electrical run" value={runId} onChange={(event) => setSelection({ runId: event.target.value })} disabled={!runs.length}>{!runs.length ? <option value="">No data</option> : runs.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="mapping-field"><span>Electrical chip</span><select aria-label="Electrical chip" value={chipId} disabled={!chips.length} onChange={(event) => setSelection((previous) => ({ ...previous, chipId: event.target.value }))}>{!chips.length ? <option value="">No data</option> : chips.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="mapping-field"><span>Electrical device</span><select aria-label="Electrical device" value={selected?.deviceId || ""} disabled={!chipAnalyses.length} onChange={(event) => setSelection((previous) => ({ ...previous, deviceId: event.target.value }))}>{!chipAnalyses.length ? <option value="">No data</option> : chipAnalyses.map((value) => <option key={value.key}>{value.deviceId}</option>)}</select></label>
        <label className="mapping-field"><span>Curve comparison</span><select aria-label="Curve comparison" value={view.scope} onChange={(event) => setViewFlag("scope", event.target.value)}><option value="chip">Devices on selected chip</option><option value="device">Selected device only</option><option value="custom">My chosen curves</option><option value="run">All devices in selected run</option></select></label>
      </div>
      <details className="electrical-fit-settings"><summary>Fit settings · {fitSettings.throughOrigin ? "I = G × V" : "I = I₀ + G × V"} · {fitSettings.minVoltageV === "" ? "minimum" : `${fitSettings.minVoltageV} V`} to {fitSettings.maxVoltageV === "" ? "maximum" : `${fitSettings.maxVoltageV} V`}</summary>
        <p>Choose which devices receive fit edits. Display filters and curve selection do not delete measurements or change their fits.</p>
        <div className="electrical-control-grid"><label className="mapping-field"><span>Apply fit edits to</span><select aria-label="Apply fit edits to" value={fitScope} onChange={(event) => setFitScope(event.target.value)}><option value="device">Selected device only</option><option value="all">All loaded devices (replaces individual overrides)</option></select></label>
          <label className="mapping-field"><span>Fit minimum voltage (V)</span><input type="number" step="any" placeholder="All voltages" value={fitSettings.minVoltageV} onChange={(event) => updateFit("minVoltageV", event.target.value)} /></label>
          <label className="mapping-field"><span>Fit maximum voltage (V)</span><input type="number" step="any" placeholder="All voltages" value={fitSettings.maxVoltageV} onChange={(event) => updateFit("maxVoltageV", event.target.value)} /></label>
          <label className="mapping-field"><span>Linear fit model</span><select aria-label="Linear fit model" value={fitSettings.throughOrigin ? "origin" : "offset"} onChange={(event) => updateFit("throughOrigin", event.target.value === "origin")}><option value="offset">Fit current offset: I = I₀ + G × V</option><option value="origin">Force through zero: I = G × V</option></select></label>
          <button type="button" className="ghost-action" onClick={() => { if (fitScope === "all") { setSettings(DEFAULT_SETTINGS); setFitOverrides({}); } else if (selected) setFitOverrides((previous) => ({ ...previous, [selected.key]: DEFAULT_SETTINGS })); }}>Reset electrical fit settings</button>
        </div>
      </details>
      <p className="electrical-method-note">Rfit = 1/G; point resistance = V/I; electrical power = V × I. This two-terminal measurement includes heater, contact, probe and lead resistance. A linear fit is descriptive; no device acceptance limits or current-compliance settings have been supplied.</p>
    </article>

    <article className="analysis-card electrical-display-controls">
      <div className="analysis-card-head"><div><h3>Choose what to show</h3><p><strong>{plotTraces.length} of {runAnalyses.length} curves shown</strong> · Viewing {chipId || "no chip"} / {selected?.deviceId || "no device"}. Curve selection changes display and export scope, not raw data.</p></div>
        <div className="library-action-row"><button type="button" className="ghost-action" onClick={() => setViewFlag("scope", "device")}>Focus selected device</button><button type="button" className="ghost-action" onClick={() => setViewFlag("scope", "chip")}>Compare this chip</button></div>
      </div>
      <fieldset className="electrical-toggle-group"><legend>Graphs</legend>{[["iv", "I–V"], ["resistance", "Resistance"], ["power", "Power"], ["residuals", "Fit residuals"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={view.graphs[key]} onChange={(event) => setView((previous) => ({ ...previous, graphs: { ...previous.graphs, [key]: event.target.checked } }))} />{label}</label>)}</fieldset>
      <fieldset className="electrical-toggle-group"><legend>Display options</legend>{[["showFit", "Show fitted line"], ["showMarkers", "Show sample markers"], ["fitRangeOnly", "Show fitted voltage range only"], ["showDetails", "Show device details"], ["showMap", "Show wafermap"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={view[key]} onChange={(event) => setViewFlag(key, event.target.checked)} />{label}</label>)}</fieldset>
      <details ref={chooserRef} className="electrical-curve-chooser"><summary>Choose individual curves · {view.comparisonKeys.filter((key) => runAnalyses.some((trace) => trace.key === key)).length} chosen in this run</summary>
        <p>Search and filter below, then tick the chips/devices to compare. Tick boxes switch to My chosen curves. The same filters also narrow the summary table.</p>
        <div className="electrical-control-grid">
          <label className="mapping-field"><span>Find chips or devices</span><input type="search" aria-label="Find electrical curves" placeholder="e.g. 4, 34, 52 or Chip60" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} /></label>
          <label className="mapping-field"><span>Device ID filter</span><select aria-label="Device ID filter" value={filters.deviceId} onChange={(event) => updateFilter("deviceId", event.target.value)}><option value="all">All device IDs</option>{deviceIds.map((id) => <option key={id}>{id}</option>)}</select></label>
          <label className="mapping-field"><span>Review filter</span><select aria-label="Electrical review filter" value={filters.review} onChange={(event) => updateFilter("review", event.target.value)}><option value="all">All devices</option><option value="unavailable">No positive fitted resistance</option><option value="flagged">With review flags</option><option value="clear">Without review flags</option></select></label>
          <button type="button" className="ghost-action" onClick={() => { setFilters({ search: "", deviceId: "all", review: "all" }); setTablePage(0); }}>Reset device filters</button>
        </div>
        <div className="library-action-row electrical-chooser-actions">
          <button type="button" className="ghost-action" disabled={!filteredDevices.length} onClick={() => setView((previous) => ({ ...previous, scope: "custom", comparisonKeys: [...new Set([...previous.comparisonKeys, ...filteredDevices.map((trace) => trace.key)])] }))}>Add matching curves ({filteredDevices.length})</button>
          <button type="button" className="ghost-action" onClick={() => setView((previous) => ({ ...previous, scope: "custom", comparisonKeys: [] }))}>Clear chosen curves</button>
          <button type="button" className="ghost-action" onClick={() => setView((previous) => ({ ...previous, scope: "custom", comparisonKeys: runAnalyses.filter((trace) => trace.deviceId === selected?.deviceId).map((trace) => trace.key) }))}>Compare {selected?.deviceId || "device ID"} across chips</button>
        </div>
        <div className="electrical-curve-list">{filteredDevices.map((trace) => <label key={trace.key} className={view.comparisonKeys.includes(trace.key) ? "electrical-curve-choice chosen" : "electrical-curve-choice"}><input type="checkbox" aria-label={`Compare ${trace.chipId} ${trace.deviceId}`} checked={view.comparisonKeys.includes(trace.key)} onChange={(event) => toggleComparison(trace.key, event.target.checked)} /><span><strong>{trace.chipId} / {trace.deviceId}</strong><small>{format(trace.fit?.resistanceOhm)} Ω · R² {format(trace.fit?.rSquared, 3)}</small></span></label>)}</div>
        {!filteredDevices.length ? <p>No devices match these filters. Reset the filters to show the complete run.</p> : null}
      </details>
    </article>
    {!Object.values(view.graphs).some(Boolean) ? <p className="electrical-method-note">All graphs are hidden. Enable a graph above to display curves.</p> : null}
    {view.scope === "custom" && !plotTraces.length ? <p className="electrical-method-note" role="status">No curves chosen. Open Choose individual curves or use Compare this chip.</p> : null}
    <section className="electrical-plots-grid" aria-label="Electrical curves">
      {view.graphs.iv ? <ElectricalPlot title="I–V curve" traces={plotTraces} field="currentMa" yTitle="Current (mA)" selectedKey={selected?.key} showFit={view.showFit} showMarkers={view.showMarkers} fitRangeOnly={view.fitRangeOnly} /> : null}
      {view.graphs.resistance ? <ElectricalPlot title="Resistance vs voltage" traces={plotTraces} field="resistanceOhm" yTitle="V/I resistance (Ω)" selectedKey={selected?.key} showMarkers={view.showMarkers} fitRangeOnly={view.fitRangeOnly} /> : null}
      {view.graphs.power ? <ElectricalPlot title="Power vs voltage" traces={plotTraces} field="powerMw" yTitle="Electrical power (mW)" selectedKey={selected?.key} showMarkers={view.showMarkers} fitRangeOnly={view.fitRangeOnly} /> : null}
      {view.graphs.residuals ? <ElectricalPlot title="Selected device fit residuals" traces={selectedOnly} field="residualMa" yTitle="Measured − fitted current (mA)" selectedKey={selected?.key} showMarkers={view.showMarkers} fitRangeOnly={view.fitRangeOnly} /> : null}
    </section>

    <section className="electrical-detail-grid">
      {view.showDetails ? <article className="analysis-card"><div className="analysis-card-head"><h3>Selected device · {chipId || "—"} / {selected?.deviceId || "—"}</h3></div>
        <dl className="electrical-device-details">
          <div><dt>Source file</dt><dd>{selected?.fileName || "—"}</dd></div>
          <div><dt>Voltage range</dt><dd>{format(selected?.minVoltageV, 3)} to {format(selected?.maxVoltageV, 3)} V</dd></div>
          <div><dt>Fitted resistance</dt><dd>{format(selected?.fit?.resistanceOhm)} Ω</dd></div>
          <div><dt>Median V/I (full sweep)</dt><dd>{format(selected?.medianResistanceOhm)} Ω</dd></div>
          <div><dt>Fitted current offset I₀</dt><dd>{format(selected?.fit ? selected.fit.interceptA * 1000 : null, 4)} mA</dd></div>
          <div><dt>Centred R² / fit points</dt><dd>{format(selected?.fit?.rSquared, 5)} / {selected?.fit?.count ?? 0}</dd></div>
          <div><dt>Fit RMSE</dt><dd>{format(selected?.fit ? selected.fit.rmseA * 1000 : null, 4)} mA</dd></div>
          <div><dt>Peak measured power</dt><dd>{format(selected?.peakPowerPoint?.powerMw)} mW at {format(selected?.peakPowerPoint?.voltageV, 3)} V</dd></div>
        </dl>
        <div className="electrical-review-notes"><h4>Measurement review</h4>{selected?.warnings.length ? <ul>{selected.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>{selected ? "No parsing or sweep-step flags detected. This is not a device pass/fail verdict." : "Upload data to inspect sweep quality."}</p>}<p>Nonlinearity or current discontinuities may involve contact changes, compliance, heating or device behaviour; the sweep alone cannot identify the cause.</p></div>
      </article> : null}
      {view.showMap ? <article className="analysis-card"><div className="analysis-card-head"><div><h3>Electrical wafermap · {selected?.deviceId || "Device"}</h3><p>One device ID per map across the complete run; click a measured chip to inspect its sweep. Curve filters do not exclude devices from this map.</p></div></div>
        <div className="electrical-control-grid">
          <label className="mapping-field"><span>Electrical map metric</span><select aria-label="Electrical map metric" value={mapMetric} onChange={(event) => setMapMetric(event.target.value)}><option value="resistance">Fitted resistance (Ω)</option><option value="power">Peak power (mW)</option></select></label>
          <label className="mapping-field"><span>Electrical wafer template</span><select aria-label="Electrical wafer template" value={waferTemplate?.id || ""} onChange={(event) => onTemplateChange(event.target.value)}>{waferTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
        </div>
        {renderWaferMap({ cells: mapCells, selectedChip: chipId, onSelect: (id) => setSelection((previous) => ({ ...previous, chipId: id, deviceId: selected?.deviceId })), unit: mapMetric === "resistance" ? "Ω" : "mW", metricTitle: mapMetric === "resistance" ? "Electrical fitted resistance" : "Electrical peak power" })}
        {unmapped.length ? <p className="electrical-method-note">Not in this wafer template: {unmapped.join(", ")}. These chips remain available in the table and chip selector.</p> : null}
      </article> : null}
    </section>

    <article className="analysis-card"><div className="analysis-card-head"><div><h3>Electrical device summary</h3><p>{filteredDevices.length} of {runAnalyses.length} devices match the filters · {runId || "No data"}. Inspect focuses a device; Plot adds it to your comparison.</p></div></div>
      <div className="electrical-table-toolbar">
        <button type="button" className="ghost-action" onClick={() => { chooserRef.current.open = true; chooserRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Search & filter devices</button>
        <label><input type="checkbox" checked={view.expandedColumns} onChange={(event) => setViewFlag("expandedColumns", event.target.checked)} />Show additional columns</label>
        <label className="mapping-field"><span>CSV export scope</span><select aria-label="CSV export scope" value={exportScope} onChange={(event) => setExportScope(event.target.value)}><option value="shown">Comparison curves ({plotTraces.length})</option><option value="filtered">All matching devices ({filteredDevices.length})</option><option value="all">All loaded devices ({analyses.length})</option></select></label>
        <button type="button" disabled={!exportAnalyses.length} onClick={() => download(electricalSummaryCsv(exportAnalyses), "electrical-device-summary.csv", "text/csv;charset=utf-8")}>Export electrical summary CSV</button>
        <button type="button" className="ghost-action" disabled={!exportAnalyses.length} onClick={() => download(electricalPointsCsv(exportAnalyses), "electrical-sweep-points.csv", "text/csv;charset=utf-8")}>Export electrical points CSV</button>
      </div>
      <ElectricalDeviceTable devices={tableDevices} selectedKey={selected?.key} layout={layout} expanded={view.expandedColumns} comparisonKeys={view.comparisonKeys} onCompare={toggleComparison} onInspect={(trace) => { setSelection({ runId: trace.runId, chipId: trace.chipId, deviceId: trace.deviceId }); setView((previous) => ({ ...previous, scope: "device", showDetails: true })); }} />
      <div className="electrical-table-pagination"><span>Page {page + 1} of {pageCount} · {filteredDevices.length} matching devices</span><button type="button" className="ghost-action" disabled={page === 0} onClick={() => setTablePage(page - 1)}>Previous devices</button><button type="button" className="ghost-action" disabled={page === pageCount - 1} onClick={() => setTablePage(page + 1)}>Next devices</button></div>
      <details className="electrical-point-table"><summary>Raw & derived points · {selected?.deviceId || "No device"}</summary><p>Acquisition order retained. Near-zero voltage or |I| ≤ 10⁻¹² A gives no V/I value. Fit residuals outside the fit range are extrapolations.</p><div className="dashboard-table-wrap"><table><thead><tr><th>Sample</th><th>V (V)</th><th>I (A)</th><th>I (mA)</th><th>V/I (Ω)</th><th>P (mW)</th><th>In fit</th></tr></thead><tbody>{selected?.points.map((point) => <tr key={point.index}><td>{point.index}</td><td>{format(point.voltageV, 4)}</td><td>{point.currentA.toExponential(6)}</td><td>{format(point.currentMa, 4)}</td><td>{format(point.resistanceOhm)}</td><td>{format(point.powerMw, 4)}</td><td>{point.inFit ? "Yes" : "No"}</td></tr>)}</tbody></table></div></details>
      <label className="mapping-field electrical-notes"><span>Electrical measurement notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record probe contact, compliance settings, sweep direction or follow-up measurements." /></label>
    </article>
  </section>;
}
