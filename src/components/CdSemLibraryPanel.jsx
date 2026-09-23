import { useMemo, useRef, useState } from "react";
import { readFileRows } from "../lib/parsers";
import { getWaferTemplateLayout } from "../lib/waferTemplates";
import { buildWaferMapFigureModel, resolveWaferColorRange, waferColorForValue } from "../lib/wafermapFigure";
import { buildCdSemDataset, correlateCdSemWithPropagation, summarizeCdSemDataset } from "../lib/cdsem";

function formatNumber(value, digits = 2, suffix = "") {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Number(value).toFixed(digits)}${suffix}`;
}

function metadataNumber(rows, names) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = new Set(names.map(normalize));
  const row = rows?.[0] || {};
  const key = Object.keys(row).find((candidate) => aliases.has(normalize(candidate)));
  const value = key ? Number(String(row[key]).replace(/,/g, ".")) : NaN;
  return Number.isFinite(value) ? value : null;
}

function PropagationWaferMap({ cells, waferTemplate, selectedChip, displayMode, setDisplayMode, overlayMode, setOverlayMode, scale, setScale, resetScale }) {
  const measuredByChip = new Map(cells.map((cell) => [cell.chipId, cell]));
  const mapCells = getWaferTemplateLayout(waferTemplate).map((slot) => {
    const measurement = measuredByChip.get(slot.chipId);
    const measured = measurement?.value !== null && measurement?.value !== undefined;
    const passes = measurement?.passMse === true;
    return { ...slot, value: measurement?.value ?? null, hasMeasurement: measured, isVisible: true, isActiveInView: displayMode === "all" || (displayMode === "measured" ? measured : displayMode === "passing" ? passes : displayMode === "failed" ? measured && !passes : false), detail: measurement?.detail || "No propagation-loss measurement" };
  });
  const figure = buildWaferMapFigureModel({ cells: mapCells, metricKey: "propagation", overlayMode, selectedChip, colorScaleMin: scale.min, colorScaleMid: scale.mid, colorScaleMax: scale.max });
  figure.cells = figure.cells.map(cell => ({ ...cell, label: cell.isActiveInView ? cell.label : "" }));

  return (
    <div className="wafer-card-layout cdsem-propagation-map">
      <div className="wafer-outline-shell">
        <svg viewBox={`0 0 ${figure.svgWidth} ${figure.svgHeight}`} className="wafermap-svg" role="img" aria-label="Propagation loss wafermap">
          <circle cx={figure.waferCenterX} cy={figure.waferCenterY} r={figure.waferRadius} className="wafermap-circle" />
          <path d={`M ${figure.waferCenterX - 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32} A 2.16 2.16 0 0 1 ${figure.waferCenterX + 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32}`} className="wafermap-notch-stroke" />
          {figure.colValues.map((column) => <text key={`prop-col-${column}`} x={figure.mapLeft + (column - figure.colValues[0]) * figure.stepX + figure.stepX / 2} y="10.8" textAnchor="middle" className="wafermap-axis-label">{column}</text>)}
          {figure.rowValues.map((row) => <text key={`prop-row-${row}`} x="5" y={figure.mapTop + (figure.rowValues[0] - row) * figure.stepY + figure.stepY / 2 + 0.4} textAnchor="middle" className="wafermap-axis-label">{row}</text>)}
          {figure.cells.map((cell) => <g key={cell.chipId} className={cell.selected ? "wafermap-slot-group selected" : "wafermap-slot-group"}>
            <rect x={cell.x} y={cell.y} width={figure.cellWidth} height={figure.cellHeight} rx="0.35" className={cell.interactive ? "wafermap-slot active" : "wafermap-slot"} style={cell.fill ? { fill: cell.fill } : undefined}>
              <title>{`${cell.chipId}: ${cell.detail}`}</title>
            </rect>
            {cell.label ? <text x={cell.x + figure.cellWidth / 2} y={cell.y + figure.cellHeight / 2 + figure.labelFontSize * 0.32} textAnchor="middle" className={cell.interactive ? "wafermap-slot-label" : "wafermap-slot-label muted"} style={{ fontSize: `${figure.labelFontSize}px` }}>{cell.label}</text> : null}
          </g>)}
        </svg>
      </div>
      <div className="wafer-side-scale" aria-label="Propagation loss colour scale">
        <span className="wafer-scale-title">Scale</span>
        <div className="wafer-scale-bar" aria-hidden="true"><i className="wafer-scale-tick high" /><i className="wafer-scale-tick medium" /><i className="wafer-scale-tick low" /></div>
        <div className="wafer-scale-labels">
          <span className="high"><strong>{figure.range ? formatNumber(figure.range.max) : "--"}</strong><small>High</small></span>
          <span className="medium"><strong>{figure.range ? formatNumber(figure.range.mid) : "--"}</strong><small>Mid</small></span>
          <span className="low"><strong>{figure.range ? formatNumber(figure.range.min) : "--"}</strong><small>Low</small></span>
        </div>
        <span className="wafer-scale-unit">dB/cm</span>
      </div>
      <div className="wafer-control-rail">
        <div className="cdsem-display-controls"><label>Show <select value={displayMode} onChange={e => setDisplayMode(e.target.value)}><option value="all">All chips</option><option value="measured">Measured chips</option><option value="passing">Passed chips</option><option value="failed">Failed chips</option></select></label><label>Overlay <select value={overlayMode} onChange={e => setOverlayMode(e.target.value)}><option value="chip">Chip ID</option><option value="value">Metric value</option><option value="none">None</option></select></label></div>
        <div className="wafer-footer-bar">{["min", "mid", "max"].map(key => <label className="wafer-scale-control" key={key}><span>Scale {key}</span><input type="number" step="any" value={scale[key]} onChange={e => setScale(key, e.target.value)} /></label>)}</div>
        <button type="button" className="secondary-button" onClick={resetScale}>Reset Scale</button>
      </div>
    </div>
  );
}

function downloadText(text, fileName, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildCsv(entries = [], parameterColumns = []) {
  const header = ["chip_id", "column", "row", ...parameterColumns];
  const lines = entries.map((entry) =>
    header.map((column) => {
      const value = column === "chip_id"
        ? entry.chipId
        : column === "column"
          ? entry.dieX
          : column === "row"
            ? entry.dieY
            : entry.values?.[column] ?? "";
      return String(value ?? "");
    }).join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function CdSemWaferMap({ cells, waferTemplate, selectedChip, onSelect, selectedParameter, colorScale, onColorScaleChange, onResetColorScale, svgRef, displayMode, setDisplayMode, overlayMode, setOverlayMode, designWidth, passTolerance, setPassTolerance }) {
  if (!cells.length) {
    return <div className="chart-empty">Upload a CD-SEM table to render the wafermap.</div>;
  }

  const measuredByChip = new Map(cells.map((cell) => [cell.chipId, cell]));
  const isWaveguideMid = /waveguide.?mid/i.test(selectedParameter || "");
  const deviationRangeCells = [];
  const mapCells = getWaferTemplateLayout(waferTemplate).map((slot) => {
    const measurement = measuredByChip.get(slot.chipId);
    const value = measurement?.values?.[selectedParameter] ?? null;
    const deviation = isWaveguideMid && Number.isFinite(designWidth) && value !== null ? Math.abs(Number(value) - designWidth) : value;
    const hasMeasurement = value !== null && value !== undefined;
    const passRule = isWaveguideMid && Number.isFinite(designWidth) && Number.isFinite(passTolerance) && passTolerance >= 0;
    const passed = passRule && deviation <= passTolerance;
    const active = displayMode === "all" || (displayMode === "measured" ? hasMeasurement : passRule && (displayMode === "passing" ? passed : displayMode === "failed" ? !passed && hasMeasurement : false));
    if (hasMeasurement) deviationRangeCells.push({ ...slot, value: deviation, hasMeasurement: true, isVisible: active });
    return {
      ...slot,
      value,
      deviation,
      hasMeasurement,
      isVisible: true,
      isActiveInView: active,
      detail: selectedParameter ? `${selectedParameter}: ${value ?? "No measurement"}${isWaveguideMid && value !== null ? `; design ${designWidth} nm; deviation ${formatNumber(deviation, 2)} nm` : ""}` : "No measurement"
    };
  });
  const colorCells = isWaveguideMid ? deviationRangeCells : mapCells;
  const figure = buildWaferMapFigureModel({
    cells: mapCells,
    metricKey: "cdsem",
    overlayMode,
    selectedChip,
    colorScaleMin: colorScale.min,
    colorScaleMid: colorScale.mid,
    colorScaleMax: colorScale.max
  });
  const effectiveRange = resolveWaferColorRange(colorCells, colorScale.min, colorScale.mid, colorScale.max);
  figure.cells = figure.cells.map(cell => ({
    ...cell,
    label: cell.isActiveInView ? cell.label : "",
    ...(isWaveguideMid ? { fill: cell.visibleValue !== null && cell.visibleValue !== undefined ? waferColorForValue(cell.deviation, effectiveRange) : undefined } : {})
  }));

  return (
    <div className="wafer-map-workspace cdsem-wafer-workspace">
      <div className="wafer-card-layout">
      <div className="wafer-outline-shell">
        <svg ref={svgRef} viewBox={`0 0 ${figure.svgWidth} ${figure.svgHeight}`} className="wafermap-svg" role="img" aria-label="CD-SEM wafermap">
          <circle cx={figure.waferCenterX} cy={figure.waferCenterY} r={figure.waferRadius} className="wafermap-circle" />
          <path d={`M ${figure.waferCenterX - 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32} A 2.16 2.16 0 0 1 ${figure.waferCenterX + 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32}`} className="wafermap-notch-stroke" />
          {figure.colValues.map((column) => (
            <text
              key={`col-${column}`}
              x={figure.mapLeft + (column - figure.colValues[0]) * figure.stepX + figure.stepX / 2}
              y={10.8}
              textAnchor="middle"
              className="wafermap-axis-label"
            >
              {column}
            </text>
          ))}
          {figure.rowValues.map((row) => (
            <text
              key={`row-${row}`}
              x={5}
              y={figure.mapTop + (figure.rowValues[0] - row) * figure.stepY + figure.stepY / 2 + 0.4}
              textAnchor="middle"
              className="wafermap-axis-label"
            >
              {row}
            </text>
          ))}
          {figure.cells.map((cell) => {
            return (
              <g key={cell.chipId} className={cell.selected ? "wafermap-slot-group selected" : "wafermap-slot-group"} onClick={() => cell.interactive && onSelect(cell.chipId)}>
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={figure.cellWidth}
                  height={figure.cellHeight}
                  rx="0.35"
                  className={cell.interactive ? "wafermap-slot active" : "wafermap-slot"}
                  style={cell.fill ? { fill: cell.fill } : undefined}
                >
                  <title>{`${cell.chipId}: ${cell.detail || (cell.value === null ? "No value" : cell.value)}`}</title>
                </rect>
                {cell.label ? <text x={cell.x + figure.cellWidth / 2} y={cell.y + figure.cellHeight / 2 + figure.labelFontSize * 0.32} textAnchor="middle" className={cell.interactive ? "wafermap-slot-label" : "wafermap-slot-label muted"} style={{ fontSize: `${figure.labelFontSize}px` }}>{cell.label}</text> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="wafer-side-scale" aria-label="CD-SEM colour scale">
        <span className="wafer-scale-title">{isWaveguideMid ? "Error" : "Scale"}</span>
        <div className="wafer-scale-bar" aria-hidden="true"><i className="wafer-scale-tick high" /><i className="wafer-scale-tick medium" /><i className="wafer-scale-tick low" /></div>
        <div className="wafer-scale-labels">
          <span className="high"><strong>{effectiveRange ? formatNumber(effectiveRange.max) : "--"}</strong><small>High</small></span>
          <span className="medium"><strong>{effectiveRange ? formatNumber(effectiveRange.mid) : "--"}</strong><small>Mid</small></span>
          <span className="low"><strong>{effectiveRange ? formatNumber(effectiveRange.min) : "--"}</strong><small>Low</small></span>
        </div>
        <span className="wafer-scale-unit">{isWaveguideMid ? "|mid − design| nm" : "nm"}</span>
      </div>
      </div>
      <aside className="wafer-control-rail" aria-label="CD-SEM wafermap display controls">
        <div className="cdsem-display-controls"><label>Show <select value={displayMode} onChange={e => setDisplayMode(e.target.value)}><option value="all">All chips</option><option value="measured">Measured chips</option><option value="passing" disabled={!isWaveguideMid || !Number.isFinite(passTolerance)}>Passed chips</option><option value="failed" disabled={!isWaveguideMid || !Number.isFinite(passTolerance)}>Failed chips</option></select></label><label>Overlay <select value={overlayMode} onChange={e => setOverlayMode(e.target.value)}><option value="chip">Chip ID</option><option value="value">Metric value</option><option value="none">None</option></select></label>{isWaveguideMid ? <label>Pass tolerance (nm)<input type="number" min="0" step="any" value={Number.isFinite(passTolerance) ? passTolerance : ""} onChange={e => setPassTolerance(e.target.value)} placeholder="Set to enable pass/fail" /></label> : null}</div>
        <div className="wafer-footer-bar">
          <label className="wafer-scale-control low"><span><i aria-hidden="true" />Scale Min</span><input type="number" step="any" value={colorScale.min} placeholder={effectiveRange ? formatNumber(effectiveRange.min) : "Auto"} onChange={(event) => onColorScaleChange("min", event.target.value)} /></label>
          <label className="wafer-scale-control medium"><span><i aria-hidden="true" />Scale Midpoint</span><input type="number" step="any" value={colorScale.mid} placeholder={effectiveRange ? formatNumber(effectiveRange.mid) : "Auto"} onChange={(event) => onColorScaleChange("mid", event.target.value)} /></label>
          <label className="wafer-scale-control high"><span><i aria-hidden="true" />Scale Max</span><input type="number" step="any" value={colorScale.max} placeholder={effectiveRange ? formatNumber(effectiveRange.max) : "Auto"} onChange={(event) => onColorScaleChange("max", event.target.value)} /></label>
        </div>
        <div className="wafer-scale-actions"><p className="wafer-scale-hint">{isWaveguideMid ? "Colour shows absolute difference from design width: closest is green; furthest is red." : "Low values are green, midpoint is amber, and high values are red."}</p><button type="button" className="secondary-button wafer-scale-reset" onClick={onResetColorScale} disabled={colorScale.min === "" && colorScale.mid === "" && colorScale.max === ""}>Reset Scale</button></div>
      </aside>
    </div>
  );
}

export default function CdSemLibraryPanel({
  waferTemplate,
  propagationCells = [],
  currentDatasetMeta,
  sourceMeta
}) {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedParameter, setSelectedParameter] = useState("");
  const [colorScale, setColorScale] = useState({ min: "", mid: "", max: "" });
  const [displayMode, setDisplayMode] = useState("all");
  const [overlayMode, setOverlayMode] = useState("chip");
  const [propDisplayMode, setPropDisplayMode] = useState("all");
  const [propOverlayMode, setPropOverlayMode] = useState("chip");
  const [propColorScale, setPropColorScale] = useState({ min: "", mid: "", max: "" });
  const [passTolerance, setPassTolerance] = useState("");
  const [comparisonParameter, setComparisonParameter] = useState("");
  const [statusMessage, setStatusMessage] = useState("Upload a `.txt`, `.csv`, `.xlsx`, or `.xls` CD-SEM table with chip coordinates to map it onto the wafer.");
  const [metaDraft, setMetaDraft] = useState(() => ({
    projectName: currentDatasetMeta?.projectName || "",
    slot: currentDatasetMeta?.slot || "",
    platformLabel: currentDatasetMeta?.platformLabel || "",
    waveguideType: currentDatasetMeta?.waveguideType || sourceMeta?.waveguideType || ""
  }));
  const [selectedChip, setSelectedChip] = useState("");
  const waferSvgRef = useRef(null);

  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[runs.length - 1] || null;
  const rawRows = selectedRun?.rows || [];
  const designWidth = metadataNumber(rawRows, ["design_width_nm", "design width (nm)", "designwidthnm"]);
  const dose = metadataNumber(rawRows, ["dose_mj", "dose (mj)", "dosemj"]);
  const numericTolerance = passTolerance === "" ? NaN : Number(passTolerance);
  const comparisonOptions = Array.from(new Set(runs.flatMap(run => run.parameterColumns)));
  const dataset = useMemo(() => buildCdSemDataset(rawRows, { selectedParameter, waferTemplate }), [rawRows, selectedParameter, waferTemplate]);

  const effectiveParameter = dataset.selectedParameter || selectedParameter || "";
  const summary = useMemo(
    () => summarizeCdSemDataset(dataset.entries, effectiveParameter),
    [dataset.entries, effectiveParameter]
  );
  const overlap = useMemo(
    () => correlateCdSemWithPropagation(dataset.entries, propagationCells),
    [dataset.entries, propagationCells]
  );
  const selectedEntry = dataset.entries.find((entry) => entry.chipId === selectedChip) || dataset.entries[0] || null;

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const loadedRuns = await Promise.all(files.map(async (file, index) => {
        const rows = await readFileRows(file);
        const nextDataset = buildCdSemDataset(rows, { waferTemplate });
        return { id: `${Date.now()}-${index}-${file.name}`, name: file.name, rows, selectedParameter: nextDataset.selectedParameter || "", parameterColumns: nextDataset.parameterColumns, pointCount: nextDataset.entries.length };
      }));
      const nextRun = loadedRuns[loadedRuns.length - 1];
      setRuns((previous) => [...previous, ...loadedRuns]);
      setComparisonParameter(previous => previous || nextRun.selectedParameter || nextRun.parameterColumns[0] || "");
      setSelectedRunId(nextRun.id);
      setSelectedParameter(nextRun.selectedParameter);
      setSelectedChip(buildCdSemDataset(nextRun.rows, { waferTemplate }).entries[0]?.chipId || "");
      setStatusMessage(`Loaded ${loadedRuns.length} CD-SEM file(s). ${nextRun.pointCount} coordinate-mapped point(s) in the selected run.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CD-SEM import failed.");
    } finally {
      if (event.target) event.target.value = "";
    }
  }

  function selectRun(runId) {
    const run = runs.find((item) => item.id === runId);
    if (!run) return;
    setSelectedRunId(runId);
    setSelectedParameter(run.selectedParameter || run.parameterColumns[0] || "");
    setSelectedChip(buildCdSemDataset(run.rows, { waferTemplate }).entries[0]?.chipId || "");
  }

  function selectParameter(parameter) {
    setSelectedParameter(parameter);
    setRuns((previous) => previous.map((run) => run.id === selectedRun?.id ? { ...run, selectedParameter: parameter } : run));
  }

  function exportMappedCsv() {
    downloadText(
      buildCsv(dataset.entries, dataset.parameterColumns),
      `${metaDraft.projectName || "cdsem"}-${metaDraft.slot || "dataset"}-mapped.csv`,
      "text/csv;charset=utf-8"
    );
  }

  function exportWafermapSvg() {
    if (!waferSvgRef.current) return;
    const serialized = new XMLSerializer().serializeToString(waferSvgRef.current);
    downloadText(serialized, `${metaDraft.projectName || "cdsem"}-${metaDraft.slot || "wafermap"}.svg`, "image/svg+xml;charset=utf-8");
  }

  function updateColorScale(field, value) {
    setColorScale((previous) => ({ ...previous, [field]: value }));
  }

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>CD-SEM Data</h2>
            <p>Import coordinate-based CD-SEM results, map them onto the active wafer template, and inspect how they overlap with propagation-loss measurements for the same chips.</p>
          </div>
          <div className="library-action-row">
            <label className="upload-measurement-button secondary-upload">
              <input type="file" accept=".txt,.csv,.xlsx,.xls" multiple onChange={handleUpload} />
              <span>Import CD-SEM File(s)</span>
            </label>
            <button type="button" className="secondary-action" onClick={exportMappedCsv} disabled={!dataset.entries.length}>Export mapped CSV</button>
            <button type="button" className="ghost-action" onClick={exportWafermapSvg} disabled={!dataset.entries.length}>Export wafermap SVG</button>
          </div>
        </div>

        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field">
            <span>Project / MPW</span>
            <input value={metaDraft.projectName} onChange={(event) => setMetaDraft((previous) => ({ ...previous, projectName: event.target.value }))} />
          </label>
          <label className="mapping-field">
            <span>Slot</span>
            <input value={metaDraft.slot} onChange={(event) => setMetaDraft((previous) => ({ ...previous, slot: event.target.value }))} />
          </label>
          <label className="mapping-field">
            <span>Platform</span>
            <input value={metaDraft.platformLabel} onChange={(event) => setMetaDraft((previous) => ({ ...previous, platformLabel: event.target.value }))} />
          </label>
          <label className="mapping-field">
            <span>Waveguide</span>
            <input value={metaDraft.waveguideType} onChange={(event) => setMetaDraft((previous) => ({ ...previous, waveguideType: event.target.value }))} />
          </label>
          <label className="mapping-field">
            <span>Active etch run</span>
            <select value={selectedRun?.id || ""} onChange={(event) => selectRun(event.target.value)} disabled={!runs.length}>
              {runs.length ? runs.map((run) => <option key={run.id} value={run.id}>{run.name} ({run.pointCount} points)</option>) : <option value="">No files imported</option>}
            </select>
          </label>
          <label className="mapping-field">
            <span>CD-SEM parameter</span>
            <select value={effectiveParameter} onChange={(event) => selectParameter(event.target.value)} disabled={!dataset.parameterColumns.length}>
              {dataset.parameterColumns.length
                ? dataset.parameterColumns.map((column) => <option key={column} value={column}>{column}</option>)
                : <option value="">No numeric parameter detected</option>}
            </select>
          </label>
          <label className="mapping-field">
            <span>Source file</span>
            <input value={selectedRun?.name || ""} readOnly />
          </label>
          <label className="mapping-field"><span>Design width (nm)</span><input value={designWidth ?? "Not in file"} readOnly /></label>
          <label className="mapping-field"><span>Dose (mJ)</span><input value={dose ?? "Not in file"} readOnly /></label>
        </div>

        <div className="translator-metrics github-library-metrics">
          <div><strong>{summary.measuredChips}</strong><span>Mapped chips</span></div>
          <div><strong>{formatNumber(summary.average)}</strong><span>Average {effectiveParameter || "value"}</span></div>
          <div><strong>{overlap.overlap.length}</strong><span>Overlap with propagation</span></div>
          <div><strong>{formatNumber(overlap.correlation, 3)}</strong><span>Correlation vs propagation</span></div>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Wafermap View</h2>
            <p>{statusMessage}</p>
          </div>
        </div>
        <div className="cdsem-comparison-maps">
          <section className="cdsem-map-panel">
            <h3>CD-SEM — {selectedRun?.name || "Selected run"}</h3>
            <CdSemWaferMap cells={dataset.entries} waferTemplate={waferTemplate} selectedChip={selectedChip} onSelect={setSelectedChip} selectedParameter={effectiveParameter} colorScale={colorScale} onColorScaleChange={updateColorScale} onResetColorScale={() => setColorScale({ min: "", mid: "", max: "" })} svgRef={waferSvgRef} displayMode={displayMode} setDisplayMode={setDisplayMode} overlayMode={overlayMode} setOverlayMode={setOverlayMode} designWidth={designWidth} passTolerance={numericTolerance} setPassTolerance={value => setPassTolerance(value === "" ? "" : Number(value))} />
          </section>
          <section className="cdsem-map-panel">
            <h3>Propagation loss</h3>
            <p className="cdsem-map-caption">Mapped from the current propagation-loss dataset on the same wafer template.</p>
            {propagationCells.length
              ? <PropagationWaferMap cells={propagationCells} waferTemplate={waferTemplate} selectedChip={selectedChip} displayMode={propDisplayMode} setDisplayMode={setPropDisplayMode} overlayMode={propOverlayMode} setOverlayMode={setPropOverlayMode} scale={propColorScale} setScale={(key, value) => setPropColorScale(previous => ({ ...previous, [key]: value }))} resetScale={() => setPropColorScale({ min: "", mid: "", max: "" })} />
              : <div className="chart-empty compact">Load propagation-loss measurements to compare their wafer trend here.</div>}
          </section>
        </div>
      </article>

      {runs.length > 1 && selectedEntry ? (
        <article className="analysis-card">
          <div className="analysis-card-head"><div><h2>Etch Run Comparison at {selectedEntry.chipId}</h2><p>Compare a parameter across imported runs at this site, including runs where that measurement is unavailable.</p></div><label className="mapping-field"><span>Comparison parameter</span><select value={comparisonParameter} onChange={e => setComparisonParameter(e.target.value)}>{comparisonOptions.map(parameter => <option key={parameter} value={parameter}>{parameter}</option>)}</select></label></div>
          <div className="dashboard-table-wrap"><table>
            <thead><tr><th>Etch run</th><th>Mapped points</th><th>{comparisonParameter || "CD-SEM value"}</th></tr></thead>
            <tbody>{runs.map((run) => {
              const runDataset = run.parameterColumns.includes(comparisonParameter) ? buildCdSemDataset(run.rows, { selectedParameter: comparisonParameter, waferTemplate }) : null;
              const entry = runDataset?.entries.find((item) => item.chipId === selectedEntry.chipId);
              const hasParameter = run.parameterColumns.includes(comparisonParameter);
              return <tr key={`run-${run.id}`}><td>{run.name}</td><td>{run.pointCount}</td><td>{!hasParameter ? "Parameter unavailable in this run" : entry && entry.values[comparisonParameter] !== null && entry.values[comparisonParameter] !== undefined ? formatNumber(entry.values[comparisonParameter]) : "Site not measured"}</td></tr>;
            })}</tbody>
          </table></div>
        </article>
      ) : null}

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Selected Chip Detail</h2>
            <p>Use this to inspect the raw coordinate mapping and compare against propagation-loss coverage.</p>
          </div>
        </div>
        {selectedEntry ? (
          <div className="dashboard-table-wrap">
            <table>
              <tbody>
                <tr><th>Chip</th><td>{selectedEntry.chipId}</td></tr>
                <tr><th>Column / Row</th><td>{selectedEntry.dieX}, {selectedEntry.dieY}</td></tr>
                <tr><th>{effectiveParameter || "Selected value"}</th><td>{formatNumber(selectedEntry.value)}</td></tr>
                <tr><th>Propagation overlap</th><td>{overlap.overlap.some((item) => item.chipId === selectedEntry.chipId) ? "Yes" : "No"}</td></tr>
              </tbody>
            </table>
          </div>
        ) : <div className="chart-empty compact">No CD-SEM chip is selected yet.</div>}
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Overlap Table</h2>
            <p>These chips currently have both CD-SEM and propagation-loss data, which is the safest starting point for correlation checks.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chip</th>
                <th>{effectiveParameter || "CD-SEM"}</th>
                <th>Propagation loss</th>
              </tr>
            </thead>
            <tbody>
              {overlap.overlap.length ? overlap.overlap.map((item) => (
                <tr key={`overlap-${item.chipId}`}>
                  <td>{item.chipId}</td>
                  <td>{formatNumber(item.cdsemValue)}</td>
                  <td>{formatNumber(item.propagationLossDbPerCm, 2, " dB/cm")}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3"><div className="chart-empty compact">No overlapping propagation-loss chips are available yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
