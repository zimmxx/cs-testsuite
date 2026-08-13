import { useMemo, useRef, useState } from "react";
import { readFileRows } from "../lib/parsers";
import { shortChipLabel } from "../lib/waferTemplates";
import { buildCdSemDataset, correlateCdSemWithPropagation, summarizeCdSemDataset } from "../lib/cdsem";

function formatNumber(value, digits = 2, suffix = "") {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Number(value).toFixed(digits)}${suffix}`;
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

function CdSemWaferMap({ cells, selectedChip, onSelect, svgRef }) {
  if (!cells.length) {
    return <div className="chart-empty">Upload a CD-SEM table to render the wafermap.</div>;
  }

  const cols = Array.from(new Set(cells.map((cell) => cell.dieX))).sort((a, b) => a - b);
  const rows = Array.from(new Set(cells.map((cell) => cell.dieY))).sort((a, b) => b - a);
  const minCol = cols[0];
  const maxCol = cols[cols.length - 1];
  const minRow = rows[rows.length - 1];
  const maxRow = rows[0];
  const colCount = Math.max(maxCol - minCol + 1, 1);
  const rowCount = Math.max(maxRow - minRow + 1, 1);
  const values = cells.map((cell) => cell.value).filter((value) => value !== null);
  const minValue = values.length ? Math.min(...values) : null;
  const maxValue = values.length ? Math.max(...values) : null;
  const svgWidth = 100;
  const svgHeight = 108;
  const waferCenterX = 52;
  const waferCenterY = 58.5;
  const waferRadius = 43.8;
  const mapWidth = 73.2;
  const mapHeight = 73.2;
  const stepX = mapWidth / colCount;
  const stepY = mapHeight / rowCount;
  const cellWidth = Math.min(stepX * 1.08, 5.64);
  const cellHeight = Math.min(stepY * 1.08, 5.64);
  const mapLeft = waferCenterX - mapWidth / 2;
  const mapTop = waferCenterY - mapHeight / 2;

  const colorFor = (value) => {
    if (value === null || minValue === null || maxValue === null) return "#eef2f4";
    const ratio = maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue);
    const hue = 175 - ratio * 140;
    const lightness = 86 - ratio * 32;
    return `hsl(${hue} 72% ${lightness}%)`;
  };

  return (
    <div className="wafer-card-layout">
      <div className="wafer-outline-shell">
        <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="wafermap-svg" role="img" aria-label="CD-SEM wafermap">
          <circle cx={waferCenterX} cy={waferCenterY} r={waferRadius} className="wafermap-circle" />
          <path d={`M ${waferCenterX - 2.16} ${waferCenterY + waferRadius - 1.32} A 2.16 2.16 0 0 1 ${waferCenterX + 2.16} ${waferCenterY + waferRadius - 1.32}`} className="wafermap-notch-stroke" />
          {cols.map((column) => (
            <text
              key={`col-${column}`}
              x={mapLeft + (column - minCol) * stepX + stepX / 2}
              y={10.8}
              textAnchor="middle"
              className="wafermap-axis-label"
            >
              {column}
            </text>
          ))}
          {rows.map((row) => (
            <text
              key={`row-${row}`}
              x={5}
              y={mapTop + (maxRow - row) * stepY + stepY / 2 + 0.4}
              textAnchor="middle"
              className="wafermap-axis-label"
            >
              {row}
            </text>
          ))}
          {cells.map((cell) => {
            const x = mapLeft + (cell.dieX - minCol) * stepX + (stepX - cellWidth) / 2;
            const y = mapTop + (maxRow - cell.dieY) * stepY + (stepY - cellHeight) / 2;
            const active = selectedChip === cell.chipId;
            return (
              <g key={cell.chipId} className={active ? "wafermap-slot-group selected" : "wafermap-slot-group"} onClick={() => onSelect(cell.chipId)}>
                <rect
                  x={x}
                  y={y}
                  width={cellWidth}
                  height={cellHeight}
                  rx="0.35"
                  className="wafermap-slot active"
                  style={{ fill: colorFor(cell.value) }}
                >
                  <title>{`${cell.chipId}: ${cell.value === null ? "No value" : cell.value}`}</title>
                </rect>
                <text
                  x={x + cellWidth / 2}
                  y={y + cellHeight / 2 + 0.9}
                  textAnchor="middle"
                  className="wafermap-slot-label"
                  style={{ fontSize: "2.1px" }}
                >
                  {shortChipLabel(cell.chipId)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="wafer-side-scale">
        <span className="wafer-scale-caption high">High</span>
        <div className="wafer-scale-bar" />
        <div className="wafer-scale-labels">
          <span>{formatNumber(maxValue)}</span>
          <span>{formatNumber(minValue)}</span>
        </div>
      </div>
    </div>
  );
}

export default function CdSemLibraryPanel({
  waferTemplate,
  propagationCells = [],
  currentDatasetMeta,
  sourceMeta
}) {
  const [rawRows, setRawRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [selectedParameter, setSelectedParameter] = useState("");
  const [statusMessage, setStatusMessage] = useState("Upload a `.txt`, `.csv`, `.xlsx`, or `.xls` CD-SEM table with chip coordinates to map it onto the wafer.");
  const [metaDraft, setMetaDraft] = useState(() => ({
    projectName: currentDatasetMeta?.projectName || "",
    slot: currentDatasetMeta?.slot || "",
    platformLabel: currentDatasetMeta?.platformLabel || "",
    waveguideType: currentDatasetMeta?.waveguideType || sourceMeta?.waveguideType || ""
  }));
  const [selectedChip, setSelectedChip] = useState("");
  const waferSvgRef = useRef(null);

  const dataset = useMemo(
    () => buildCdSemDataset(rawRows, { selectedParameter, waferTemplate }),
    [rawRows, selectedParameter, waferTemplate]
  );

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
    const [file] = Array.from(event.target.files || []);
    if (!file) return;
    try {
      const rows = await readFileRows(file);
      const nextDataset = buildCdSemDataset(rows, { waferTemplate });
      setRawRows(rows);
      setFileName(file.name);
      setSelectedParameter(nextDataset.selectedParameter || "");
      setSelectedChip(nextDataset.entries[0]?.chipId || "");
      setStatusMessage(`Loaded ${file.name}. ${nextDataset.entries.length} coordinate-mapped CD-SEM point(s) are available.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CD-SEM import failed.");
    } finally {
      if (event.target) event.target.value = "";
    }
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
              <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleUpload} />
              <span>Import CD-SEM File</span>
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
            <span>CD-SEM parameter</span>
            <select value={effectiveParameter} onChange={(event) => setSelectedParameter(event.target.value)} disabled={!dataset.parameterColumns.length}>
              {dataset.parameterColumns.length
                ? dataset.parameterColumns.map((column) => <option key={column} value={column}>{column}</option>)
                : <option value="">No numeric parameter detected</option>}
            </select>
          </label>
          <label className="mapping-field">
            <span>Source file</span>
            <input value={fileName} readOnly />
          </label>
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
        <CdSemWaferMap cells={dataset.entries} selectedChip={selectedChip} onSelect={setSelectedChip} svgRef={waferSvgRef} />
      </article>

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
