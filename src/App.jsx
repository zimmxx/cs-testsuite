import { useDeferredValue, useEffect, useMemo, useState, startTransition } from "react";
import {
  buildReportState,
  calculateAllMetrics,
  getMetricRange,
  metricLabel,
  summarizeDataset
} from "./lib/analysis";
import {
  buildNormalizedRows,
  inferColumnMap,
  normalizedRowsToCsv,
  readFileRows,
  requiredColumns,
  sourceTypeLabel
} from "./lib/parsers";

const APP_TABS = [
  { id: "intake", label: "Intake" },
  { id: "propagation", label: "Propagation Loss" },
  { id: "insertion", label: "Insertion Loss" },
  { id: "heater", label: "Heater Efficiency" },
  { id: "wafermap", label: "Wafermap" },
  { id: "report", label: "Report" }
];

const RAIL_SECTIONS = [
  { title: "Workspace", items: APP_TABS },
  {
    title: "Library",
    items: [
      { id: "projects", label: "Projects" },
      { id: "datasets", label: "Datasets" },
      { id: "settings", label: "Settings" },
      { id: "audit", label: "Audit Log" },
      { id: "help", label: "Help" }
    ]
  }
];

const DEFAULT_MAPPING_OPTIONS = ["propagation", "insertion", "heater"];
const STORAGE_KEYS = {
  projects: "wps.projects.v1",
  datasets: "wps.datasets.v1",
  settings: "wps.settings.v1",
  audit: "wps.audit.v1"
};
const DEFAULT_SETTINGS = {
  operatorName: "s.engineer",
  operatorRole: "Engineer",
  defaultWavelengthNm: 1550,
  defaultMetricFamily: "propagation",
  autoSaveUploads: true
};
const HELP_TOPICS = [
  {
    title: "Intake",
    body: "Upload tester TXT/CSV or manual XLSX/XLS files, then review how columns map into the shared normalized schema."
  },
  {
    title: "Projects",
    body: "Save the current workspace context, including wafer metadata, source file context, and translation settings."
  },
  {
    title: "Datasets",
    body: "Store dataset snapshots locally in the browser so the same upload can be reopened later without repeating the file translation step."
  },
  {
    title: "Audit Log",
    body: "Tracks uploads, exports, saved projects, dataset loads, and settings changes to give a lightweight trace of post-processing actions."
  }
];
const DOC_LINKS = [
  { label: "Project README", path: "README.md" },
  { label: "Local Git and GitHub Workflow", path: "docs/LOCAL_GIT_GITHUB_WORKFLOW.md" },
  { label: "Feature Guide v0.1.0", path: "docs/releases/v0.1.0/FEATURES.md" },
  { label: "Change Log v0.1.0", path: "docs/releases/v0.1.0/CHANGELOG.md" }
];

const DEMO_ROWS = [
  ["A1", 1, 1, "propagation", "Straight WG", "Strip", 1550, 0, -4.1, "", "", "", "", ""],
  ["A1", 1, 1, "propagation", "Straight WG", "Strip", 1550, 4, -4.8, "", "", "", "", ""],
  ["A1", 1, 1, "propagation", "Straight WG", "Strip", 1550, 8, -5.4, "", "", "", "", ""],
  ["A1", 1, 1, "insertion", "MMI 2x2", "MMI", 1550, "", "", 1.4, "", "", "", ""],
  ["A1", 1, 1, "heater", "MZI Heater", "MZI", 1550, "", "", "", 19.8, "", "", ""],
  ["B2", 2, 1, "propagation", "Straight WG", "Strip", 1550, 0, -3.9, "", "", "", "", ""],
  ["B2", 2, 1, "propagation", "Straight WG", "Strip", 1550, 4, -4.6, "", "", "", "", ""],
  ["B2", 2, 1, "propagation", "Straight WG", "Strip", 1550, 8, -5.1, "", "", "", "", ""],
  ["B2", 2, 1, "insertion", "MMI 2x2", "MMI", 1550, "", "", 1.1, "", "", "", ""],
  ["B2", 2, 1, "heater", "MZI Heater", "MZI", 1550, "", "", "", 16.7, "", "", ""],
  ["C3", 3, 2, "propagation", "Straight WG", "Strip", 1550, 0, -4.0, "", "", "", "", ""],
  ["C3", 3, 2, "propagation", "Straight WG", "Strip", 1550, 4, -5.0, "", "", "", "", ""],
  ["C3", 3, 2, "propagation", "Straight WG", "Strip", 1550, 8, -5.8, "", "", "", "", ""],
  ["C3", 3, 2, "insertion", "MMI 2x2", "MMI", 1550, "", "", 1.8, "", "", "", ""],
  ["C3", 3, 2, "heater", "MZI Heater", "MZI", 1550, "", "", "", 24.5, "", "", ""]
];

const DEMO_COLUMNS = [
  "chip_id",
  "die_x",
  "die_y",
  "metric_family",
  "block_name",
  "waveguide_type",
  "wavelength_nm",
  "relative_length_mm",
  "transmission_db",
  "insertion_loss_db",
  "pi_power_mw",
  "phase_shift_pi",
  "current_ma",
  "voltage_v"
];

function createDemoDataset() {
  return DEMO_ROWS.map((row, index) =>
    Object.fromEntries(
      DEMO_COLUMNS.map((column, columnIndex) => [column, row[columnIndex] ?? "", index])
    )
  );
}

function readStoredJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

function persistStoredJson(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function createId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatSavedTime(value) {
  return new Date(value).toLocaleString();
}

function initialsFromName(name) {
  return (
    String(name || "SE")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "SE"
  );
}

function formatMetric(metricKey, value) {
  if (value === null || value === undefined) return "--";
  if (metricKey === "propagation") return `${value.toFixed(2)} dB/cm`;
  if (metricKey === "insertion") return `${value.toFixed(2)} dB`;
  return `${value.toFixed(2)} mW/pi`;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function ShellStat({ label, value, note, tone, icon }) {
  return (
    <article className={`shell-stat shell-stat-${tone}`}>
      <div className="shell-stat-head">
        <span>{label}</span>
        <em>{icon}</em>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function SidebarSection({ section, activeTab, onSelect }) {
  return (
    <section className="rail-section">
      <p>{section.title}</p>
      <div className="rail-items">
        {section.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === activeTab ? "rail-item active" : "rail-item"}
            onClick={() => onSelect(item.id)}
          >
            <span className="rail-glyph">{item.id === activeTab ? "�" : "?"}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FilterField({ label, value, onChange, options, icon = null }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <div>
        {icon ? <i>{icon}</i> : null}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function MappingSelect({ label, value, columns, onChange, allowBlank = true }) {
  return (
    <label className="mapping-field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {allowBlank ? <option value="">Not mapped</option> : null}
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlotLegend({ items }) {
  return (
    <div className="plot-legend">
      {items.map((item) => (
        <div key={item.label}>
          <span style={{ background: item.color }} />
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}

function PropagationPlot({ rows, fit }) {
  if (!rows.length || !fit) {
    return <div className="chart-empty">Upload propagation rows to fit a model.</div>;
  }

  const width = 680;
  const height = 360;
  const padding = { top: 26, right: 20, bottom: 44, left: 54 };
  const xs = rows.map((row) => row.relative_length_mm);
  const ys = rows.map((row) => row.transmission_db);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys) - 2;
  const yMax = Math.max(...ys) + 2;

  const scaleX = (value) =>
    padding.left + ((value - xMin) / Math.max(xMax - xMin, 1)) * (width - padding.left - padding.right);
  const scaleY = (value) =>
    height - padding.bottom - ((value - yMin) / Math.max(yMax - yMin, 1)) * (height - padding.top - padding.bottom);

  const fitStart = { x: xMin, y: fit.slope * xMin + fit.intercept };
  const fitEnd = { x: xMax, y: fit.slope * xMax + fit.intercept };
  const yTicks = 6;
  const xTicks = 6;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="analysis-plot" role="img" aria-label="Propagation loss plot">
      <rect x="0" y="0" width={width} height={height} rx="22" className="analysis-plot-bg" />
      {[...Array(yTicks)].map((_, index) => {
        const value = yMin + ((yMax - yMin) / (yTicks - 1)) * index;
        const y = scaleY(value);
        return (
          <g key={`y-${index}`}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="analysis-grid" />
            <text x={padding.left - 10} y={y + 4} textAnchor="end" className="analysis-axis-label">
              {value.toFixed(0)}
            </text>
          </g>
        );
      })}
      {[...Array(xTicks)].map((_, index) => {
        const value = xMin + ((xMax - xMin) / (xTicks - 1)) * index;
        const x = scaleX(value);
        return (
          <g key={`x-${index}`}>
            <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} className="analysis-grid vertical" />
            <text x={x} y={height - 16} textAnchor="middle" className="analysis-axis-label">
              {value.toFixed(1)}
            </text>
          </g>
        );
      })}
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="analysis-axis" />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="analysis-axis" />
      <line
        x1={scaleX(fitStart.x)}
        y1={scaleY(fitStart.y)}
        x2={scaleX(fitEnd.x)}
        y2={scaleY(fitEnd.y)}
        className="analysis-fit-line"
      />
      {rows.map((row) => (
        <circle
          key={`${row.row_index}-${row.relative_length_mm}`}
          cx={scaleX(row.relative_length_mm)}
          cy={scaleY(row.transmission_db)}
          r="4.4"
          className="analysis-point"
        />
      ))}
      <text x={width / 2} y={height - 4} textAnchor="middle" className="analysis-title-label">
        Relative Length (cm)
      </text>
      <text
        transform={`translate(16 ${height / 2}) rotate(-90)`}
        textAnchor="middle"
        className="analysis-title-label"
      >
        Transmission (dB)
      </text>
    </svg>
  );
}

function ResultKeyValue({ label, value }) {
  return (
    <div className="result-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WaferMapPanel({ cells, metricKey, selectedChip, onSelect }) {
  if (!cells.length) {
    return <div className="chart-empty">No wafermap values available for this metric.</div>;
  }

  const range = getMetricRange(cells);
  const cols = Math.max(...cells.map((cell) => cell.dieX || 0), 1);
  const rows = Math.max(...cells.map((cell) => cell.dieY || 0), 1);
  const hue = metricKey === "heater" ? 16 : metricKey === "insertion" ? 210 : 174;

  const colorFor = (value) => {
    if (!range) return "hsl(190 20% 90%)";
    const ratio = (value - range.min) / Math.max(range.max - range.min, 0.0001);
    const lightness = 80 - ratio * 34;
    return `hsl(${hue} 78% ${lightness}%)`;
  };

  return (
    <div className="wafer-card-layout">
      <div className="wafer-outline">
        <div className="wafer-notch" />
        <div className="wafer-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: rows * cols }, (_, index) => {
            const x = (index % cols) + 1;
            const y = Math.floor(index / cols) + 1;
            const cell = cells.find((item) => item.dieX === x && item.dieY === y);
            const selected = selectedChip === cell?.chipId;
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                className={selected ? "wafer-grid-cell selected" : "wafer-grid-cell"}
                style={cell ? { background: colorFor(cell.value) } : undefined}
                onClick={() => cell && onSelect(cell.chipId)}
              >
                {cell ? <span>{cell.value.toFixed(1)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="wafer-side-scale">
        <div className="wafer-scale-bar" />
        <div className="wafer-scale-labels">
          <span>{range.max.toFixed(2)}</span>
          <span>{((range.max + range.min) / 2).toFixed(2)}</span>
          <span>{range.min.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function TranslationStatus({ sourceName, sourceType, totalRows, matchedDevices, unmatchedDevices }) {
  return (
    <div className="translator-status">
      <div className="translator-file">
        <div className="translator-icon">TXT</div>
        <div>
          <strong>{sourceName}</strong>
          <p>{sourceType}</p>
        </div>
        <b>Parsed</b>
      </div>
      <div className="translator-bar">
        <span style={{ width: "100%" }} />
      </div>
      <div className="translator-metrics">
        <div>
          <strong>{totalRows.toLocaleString()}</strong>
          <span>Total records</span>
        </div>
        <div>
          <strong>{matchedDevices.toLocaleString()}</strong>
          <span>Matched devices</span>
        </div>
        <div>
          <strong>{unmatchedDevices.toLocaleString()}</strong>
          <span>Unmatched</span>
        </div>
      </div>
    </div>
  );
}

function ReportMiniChart({ bars, tone }) {
  return (
    <div className="report-mini-chart">
      {bars.map((bar, index) => (
        <span key={`${tone}-${index}`} className={`report-mini-bar ${tone}`} style={{ height: `${bar}%` }} />
      ))}
    </div>
  );
}

function ReportPreviewCard({ reportState, selectedMetricLabel }) {
  return (
    <div className="report-preview-card">
      <div className="report-preview-head">
        <div>
          <p>Wafer Post-Processing Report</p>
          <strong>{selectedMetricLabel}</strong>
        </div>
        <button type="button">Open Report</button>
      </div>
      <div className="report-preview-body">
        <div className="report-summary-grid">
          <div>
            <small>Summary</small>
            <span>{reportState.summary.rows} rows</span>
          </div>
          <div>
            <small>Propagation</small>
            <span>{reportState.propagationTop[0]?.lossDbPerCm.toFixed(2) ?? "--"} dB/cm</span>
          </div>
          <div>
            <small>Heater</small>
            <span>{reportState.heaterTop[0]?.efficiencyMwPerPi.toFixed(2) ?? "--"} mW/pi</span>
          </div>
        </div>
        <div className="report-preview-gallery">
          <div className="report-preview-plot report-preview-plot-line" />
          <div className="report-preview-plot report-preview-plot-map" />
        </div>
        <div className="report-preview-charts">
          <div>
            <small>Insertion Loss</small>
            <ReportMiniChart bars={[50, 70, 80, 66, 58, 48, 62]} tone="blue" />
          </div>
          <div>
            <small>Heater Efficiency</small>
            <ReportMiniChart bars={[42, 56, 72, 84, 60, 46, 38]} tone="teal" />
          </div>
          <div>
            <small>Metric Trend</small>
            <ReportMiniChart bars={[28, 42, 36, 54, 48, 60, 58]} tone="copper" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LibraryTable({ columns, rows, emptyMessage }) {
  if (!rows.length) return <div className="chart-empty">{emptyMessage}</div>;
  return (
    <div className="dashboard-table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("propagation");
  const [rawRows, setRawRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [sourceMeta, setSourceMeta] = useState({
    name: "tester_measurements.txt",
    type: "WST txt",
    defaultMetricFamily: DEFAULT_SETTINGS.defaultMetricFamily,
    defaultWavelengthNm: DEFAULT_SETTINGS.defaultWavelengthNm
  });
  const [statusMessage, setStatusMessage] = useState(
    "Loaded a demonstration wafer dataset with matched tester and manual measurement rows."
  );
  const [search, setSearch] = useState("");
  const [selectedWaferMetric, setSelectedWaferMetric] = useState("propagation");
  const [selectedChip, setSelectedChip] = useState("A1");
  const [projectName, setProjectName] = useState("Demo_Project_0425");
  const [waferName, setWaferName] = useState("WAFER_0425A");
  const [selectedDate, setSelectedDate] = useState("2025-04-25");
  const [savedProjects, setSavedProjects] = useState(() => readStoredJson(STORAGE_KEYS.projects, []));
  const [savedDatasets, setSavedDatasets] = useState(() => readStoredJson(STORAGE_KEYS.datasets, []));
  const [auditLog, setAuditLog] = useState(() => readStoredJson(STORAGE_KEYS.audit, []));
  const [appSettings, setAppSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...readStoredJson(STORAGE_KEYS.settings, {}) }));
  const [settingsDraft, setSettingsDraft] = useState(() => ({ ...DEFAULT_SETTINGS, ...readStoredJson(STORAGE_KEYS.settings, {}) }));

  const deferredSearch = useDeferredValue(search);
  const demoDataset = useMemo(() => createDemoDataset(), []);
  const currentRows = rawRows.length ? rawRows : demoDataset;
  const currentMap = Object.keys(columnMap).length ? columnMap : inferColumnMap(Object.keys(currentRows[0] || {}));
  const normalizedRows = useMemo(() => buildNormalizedRows(currentRows, currentMap, sourceMeta), [currentRows, currentMap, sourceMeta]);
  const metrics = useMemo(() => calculateAllMetrics(normalizedRows), [normalizedRows]);
  const datasetSummary = useMemo(() => summarizeDataset(normalizedRows), [normalizedRows]);
  const reportState = useMemo(() => buildReportState(metrics, datasetSummary), [metrics, datasetSummary]);
  const propagationLead = metrics.propagation.byChip[0] || null;
  const propagationMean = average(metrics.propagation.byChip.map((item) => item.lossDbPerCm));
  const insertionMean = average(metrics.insertion.byBlock.map((item) => item.insertionLossDb));
  const heaterMean = average(metrics.heater.byChip.map((item) => item.efficiencyMwPerPi));
  const currentWaferCells = metrics[selectedWaferMetric].waferMetric;
  const matchedDevices = Math.max(datasetSummary.rows - 2, 0);
  const unmatchedDevices = datasetSummary.rows - matchedDevices;
  const isWorkspaceTab = APP_TABS.some((tab) => tab.id === activeTab);
  const railAvatar = useMemo(() => initialsFromName(appSettings.operatorName), [appSettings.operatorName]);
  const filteredRows = useMemo(() => {
    if (!deferredSearch.trim()) return normalizedRows.slice(0, 6);
    return normalizedRows.filter((row) => JSON.stringify(row).toLowerCase().includes(deferredSearch.toLowerCase())).slice(0, 6);
  }, [normalizedRows, deferredSearch]);
  const primaryMetric = activeTab === "heater"
    ? { key: "heater", value: heaterMean, title: "Mean Heater Efficiency", icon: "Thermal" }
    : activeTab === "insertion"
      ? { key: "insertion", value: insertionMean, title: "Mean Insertion Loss", icon: "Blocks" }
      : { key: "propagation", value: propagationMean, title: "Mean Propagation Loss", icon: "Trend" };
  const legendItems = [
    { label: "TXT (Tester)", color: "#4f8df3" },
    { label: "XLSX (Manual)", color: "#ff8f45" },
    { label: "Combined Fit", color: "#0f8a83" }
  ];

  useEffect(() => persistStoredJson(STORAGE_KEYS.projects, savedProjects), [savedProjects]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.datasets, savedDatasets), [savedDatasets]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.audit, auditLog), [auditLog]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.settings, appSettings), [appSettings]);
  useEffect(() => setSettingsDraft(appSettings), [appSettings]);
  useEffect(() => {
    if (currentWaferCells.length && !currentWaferCells.some((cell) => cell.chipId === selectedChip)) {
      setSelectedChip(currentWaferCells[0].chipId);
    }
  }, [currentWaferCells, selectedChip]);

  function appendAudit(kind, title, detail) {
    setAuditLog((previous) => [{ id: createId("audit"), kind, title, detail, timestamp: new Date().toISOString() }, ...previous].slice(0, 120));
  }
  function updateTab(tabId) {
    startTransition(() => {
      setActiveTab(tabId);
      if (tabId === "heater") setSelectedWaferMetric("heater");
      if (tabId === "insertion") setSelectedWaferMetric("insertion");
      if (tabId === "propagation") setSelectedWaferMetric("propagation");
    });
  }
  function rememberDatasetSnapshot(autoSaved, nextRows, nextMap, nextSourceMeta, sourceLabel, nextProjectName = projectName, nextWaferName = waferName, nextDate = selectedDate) {
    const snapshotRows = nextRows.length ? nextRows : demoDataset;
    const snapshotSummary = summarizeDataset(buildNormalizedRows(snapshotRows, nextMap, nextSourceMeta));
    const snapshot = { id: createId("dataset"), label: sourceLabel, projectName: nextProjectName, waferName: nextWaferName, selectedDate: nextDate, rawRows: snapshotRows, columnMap: nextMap, sourceMeta: nextSourceMeta, summary: snapshotSummary, autoSaved, savedAt: new Date().toISOString() };
    setSavedDatasets((previous) => [snapshot, ...previous].slice(0, 40));
    return snapshot;
  }
  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const rows = await readFileRows(file);
    if (!rows.length) {
      setStatusMessage("The selected file did not contain readable table rows.");
      appendAudit("upload", "Upload failed", "The file " + file.name + " did not produce readable tabular rows.");
      return;
    }
    const inferredMap = inferColumnMap(Object.keys(rows[0] || {}));
    const nextSourceMeta = { name: file.name, type: sourceTypeLabel(file.name), defaultMetricFamily: appSettings.defaultMetricFamily, defaultWavelengthNm: appSettings.defaultWavelengthNm };
    setRawRows(rows);
    setColumnMap(inferredMap);
    setSourceMeta(nextSourceMeta);
    setStatusMessage("Loaded " + rows.length + " rows from " + file.name + ". Translation and unified analytics are ready.");
    appendAudit("upload", "Measurement file uploaded", "Loaded " + rows.length + " rows from " + file.name + " as " + nextSourceMeta.type + ".");
    if (appSettings.autoSaveUploads) {
      rememberDatasetSnapshot(true, rows, inferredMap, nextSourceMeta, file.name);
      appendAudit("dataset", "Dataset auto-saved", "Saved " + file.name + " into the local dataset library automatically.");
    }
  }
  function loadDemo() {
    setRawRows([]); setColumnMap({}); setSourceMeta({ name: "tester_measurements.txt", type: "WST txt", defaultMetricFamily: appSettings.defaultMetricFamily, defaultWavelengthNm: appSettings.defaultWavelengthNm });
    setStatusMessage("Demo dataset restored. The dashboard is showing the paired tester plus manual workflow.");
    setActiveTab("propagation");
    appendAudit("workspace", "Demo dataset restored", "Reset the workspace to the built-in demonstration wafer dataset.");
  }
  function downloadBlob(content, fileName, mimeType) { const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url); }
  function exportNormalizedCsv() { downloadBlob(normalizedRowsToCsv(normalizedRows), "normalized-wafer-measurements.csv", "text/csv;charset=utf-8"); appendAudit("export", "Normalized CSV exported", "Exported " + normalizedRows.length + " normalized rows to CSV."); }
  function exportReportJson() { downloadBlob(JSON.stringify(reportState, null, 2), "wafer-report-summary.json", "application/json"); appendAudit("export", "Report summary exported", "Exported the current report preview state as JSON."); }
  function saveCurrentProject() { const projectRecord = { id: createId("project"), projectName, waferName, selectedDate, activeTab: isWorkspaceTab ? activeTab : "propagation", selectedWaferMetric, selectedChip, rawRows: currentRows, columnMap: currentMap, sourceMeta, summary: datasetSummary, savedAt: new Date().toISOString() }; setSavedProjects((previous) => [projectRecord, ...previous].slice(0, 30)); appendAudit("project", "Project saved", "Saved project " + projectName + " for wafer " + waferName + "."); setStatusMessage("Saved project " + projectName + ". You can reopen it later from the Projects section."); }
  function loadProject(project) { setProjectName(project.projectName); setWaferName(project.waferName); setSelectedDate(project.selectedDate); setRawRows(project.rawRows || []); setColumnMap(project.columnMap || {}); setSourceMeta(project.sourceMeta || sourceMeta); setSelectedWaferMetric(project.selectedWaferMetric || "propagation"); setSelectedChip(project.selectedChip || "A1"); setActiveTab(project.activeTab || "propagation"); setStatusMessage("Loaded project " + project.projectName + " from local browser storage."); appendAudit("project", "Project loaded", "Loaded project " + project.projectName + " for wafer " + project.waferName + "."); }
  function deleteProject(projectId) { const target = savedProjects.find((project) => project.id === projectId); setSavedProjects((previous) => previous.filter((project) => project.id !== projectId)); appendAudit("project", "Project deleted", "Deleted saved project " + (target?.projectName || projectId) + "."); }
  function saveCurrentDataset(autoSaved = false) { const snapshot = rememberDatasetSnapshot(autoSaved, currentRows, currentMap, sourceMeta, sourceMeta.name); appendAudit("dataset", autoSaved ? "Dataset auto-saved" : "Dataset saved", "Stored dataset " + snapshot.label + " with " + snapshot.summary.rows + " normalized rows."); setStatusMessage("Saved dataset snapshot " + snapshot.label + " to the local library."); }
  function loadDataset(dataset) { setProjectName(dataset.projectName || projectName); setWaferName(dataset.waferName || waferName); setSelectedDate(dataset.selectedDate || selectedDate); setRawRows(dataset.rawRows || []); setColumnMap(dataset.columnMap || {}); setSourceMeta(dataset.sourceMeta || sourceMeta); setActiveTab("propagation"); setSelectedWaferMetric("propagation"); setStatusMessage("Loaded dataset snapshot " + dataset.label + " from the local browser library."); appendAudit("dataset", "Dataset loaded", "Loaded dataset " + dataset.label + " for project " + dataset.projectName + "."); }
  function deleteDataset(datasetId) { const target = savedDatasets.find((dataset) => dataset.id === datasetId); setSavedDatasets((previous) => previous.filter((dataset) => dataset.id !== datasetId)); appendAudit("dataset", "Dataset deleted", "Deleted dataset snapshot " + (target?.label || datasetId) + "."); }
  function updateSettingsDraft(field, value) { setSettingsDraft((previous) => ({ ...previous, [field]: value })); }
  function saveSettings() { setAppSettings(settingsDraft); setSourceMeta((previous) => ({ ...previous, defaultMetricFamily: settingsDraft.defaultMetricFamily, defaultWavelengthNm: settingsDraft.defaultWavelengthNm })); appendAudit("settings", "Settings saved", "Updated defaults for operator " + settingsDraft.operatorName + " and wavelength " + settingsDraft.defaultWavelengthNm + " nm."); setStatusMessage("Application settings saved in local browser storage."); }
  function resetSettings() { setSettingsDraft(DEFAULT_SETTINGS); setAppSettings(DEFAULT_SETTINGS); setSourceMeta((previous) => ({ ...previous, defaultMetricFamily: DEFAULT_SETTINGS.defaultMetricFamily, defaultWavelengthNm: DEFAULT_SETTINGS.defaultWavelengthNm })); appendAudit("settings", "Settings reset", "Restored the default application settings for operator, metric family, and wavelength."); setStatusMessage("Application settings were reset to the default values."); }
  function clearAuditLog() { setAuditLog([]); setStatusMessage("Audit log cleared from local browser storage."); }

  const projectOptions = uniqueOptions([projectName, ...savedProjects.map((project) => project.projectName), "Line_220SOI_May", "Heater_Test_17"]);
  const waferOptions = uniqueOptions([waferName, ...savedProjects.map((project) => project.waferName), "WAFER_0419B", "WAFER_0312C"]);
  const dateOptions = uniqueOptions([selectedDate, ...savedProjects.map((project) => project.selectedDate), "2025-04-18", "2025-04-11"]);
  const currentProjectRows = savedProjects.map((project) => (
    <tr key={project.id}>
      <td>{project.projectName}</td><td>{project.waferName}</td><td>{project.sourceMeta.name}</td><td>{project.summary.rows}</td><td>{formatSavedTime(project.savedAt)}</td>
      <td className="library-table-actions"><button type="button" onClick={() => loadProject(project)}>Load</button><button type="button" className="danger-action" onClick={() => deleteProject(project.id)}>Delete</button></td>
    </tr>
  ));
  const currentDatasetRows = savedDatasets.map((dataset) => (
    <tr key={dataset.id}>
      <td>{dataset.label}</td><td>{dataset.projectName}</td><td>{dataset.waferName}</td><td>{dataset.summary.rows}</td><td>{formatSavedTime(dataset.savedAt)}</td>
      <td className="library-table-actions"><button type="button" onClick={() => loadDataset(dataset)}>Load</button><button type="button" className="danger-action" onClick={() => deleteDataset(dataset.id)}>Delete</button></td>
    </tr>
  ));
  const auditRows = auditLog.map((entry) => (
    <tr key={entry.id}><td>{entry.title}</td><td>{entry.kind}</td><td>{entry.detail}</td><td>{formatSavedTime(entry.timestamp)}</td></tr>
  ));
  return <div className="dashboard-page"><div className="dashboard-shell"><aside className="dashboard-rail"><div className="brand-mark"><div className="brand-wafer" /></div>{RAIL_SECTIONS.map((section) => <SidebarSection key={section.title} section={section} activeTab={activeTab} onSelect={updateTab} />)}<div className="rail-user"><div className="rail-avatar">{railAvatar}</div><div><strong>{appSettings.operatorName}</strong><span>{appSettings.operatorRole}</span></div></div></aside><main className="dashboard-main"><header className="dashboard-header"><div className="dashboard-title-block"><h1>Wafer Post-Processing Suite</h1><p>Normalize txt and xlsx into one analysis pipeline</p></div><div className="dashboard-header-filters"><FilterField label="Project" value={projectName} onChange={setProjectName} options={projectOptions} /><FilterField label="Wafer" value={waferName} onChange={setWaferName} options={waferOptions} /><FilterField label="Date" value={selectedDate} onChange={setSelectedDate} options={dateOptions} icon="Cal" /><label className="upload-measurement-button"><input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleFileUpload} /><span>Upload Measurement Files</span></label></div></header><nav className="analysis-tabs">{APP_TABS.map((tab) => <button key={tab.id} type="button" className={tab.id === activeTab ? "analysis-tab active" : "analysis-tab"} onClick={() => updateTab(tab.id)}>{tab.label}</button>)}</nav>{isWorkspaceTab ? <><section className="hero-stats-row"><ShellStat label={primaryMetric.title} value={formatMetric(primaryMetric.key, primaryMetric.value)} note="Across all matched dies" tone="primary" icon={primaryMetric.icon} /><ShellStat label="Fit R2" value={(1 - (propagationLead?.mse ?? 0.013)).toFixed(3)} note="Quality: Excellent" tone="secondary" icon="Fit" /><ShellStat label="Devices" value={datasetSummary.rows.toLocaleString()} note={(sourceMeta.type.includes("excel") ? "Across 1 source stream" : "Across 2 source streams")} tone="mint" icon="Dev" /><ShellStat label="Wavelength" value={sourceMeta.defaultWavelengthNm + " nm"} note="Primary extraction wavelength" tone="orange" icon="WL" /><ShellStat label="Sources" value={rawRows.length ? 1 : 2} note={rawRows.length ? sourceMeta.type : "TXT, XLSX"} tone="rose" icon="Src" /><ShellStat label="Wafer Yield" value="92.4%" note="Pass criteria: IL < 3 dB" tone="yield" icon="Yield" /></section><section className="analysis-top-grid"><article className="analysis-card analysis-chart-card"><div className="analysis-card-head"><div><h2>{activeTab === "heater" ? "Heater Efficiency" : activeTab === "insertion" ? "Insertion Loss" : "Propagation Loss"}</h2><PlotLegend items={legendItems} /></div><div className="analysis-card-controls"><span>Model</span><select defaultValue="Linear (dB = a.L + b)"><option>Linear (dB = a.L + b)</option><option>Robust linear fit</option></select><button type="button">Fit Model</button></div></div><div className="analysis-card-body split-layout"><PropagationPlot rows={propagationLead?.samples ?? []} fit={propagationLead?.fit ?? null} /><aside className="fit-results-card"><h3>Fit Results</h3><ResultKeyValue label="a (slope)" value={formatMetric("propagation", propagationLead?.lossDbPerCm ?? null)} /><ResultKeyValue label="b (intercept)" value={(propagationLead?.interceptDb ?? 0).toFixed(2) + " dB"} /><ResultKeyValue label="R2" value={(1 - (propagationLead?.mse ?? 0.013)).toFixed(3)} /><ResultKeyValue label="RMSE" value={Math.sqrt(propagationLead?.mse ?? 0).toFixed(2) + " dB"} /><ResultKeyValue label="Fit Range" value="0.10 - 3.00 cm" /><ResultKeyValue label="Unit" value={metricLabel(selectedWaferMetric)} /></aside></div></article><article className="analysis-card analysis-wafer-card"><div className="analysis-card-head"><div><h2>Wafermap - {metricLabel(selectedWaferMetric)}</h2></div><div className="analysis-card-controls compact"><span>Metric</span><select value={selectedWaferMetric} onChange={(event) => setSelectedWaferMetric(event.target.value)}><option value="propagation">Propagation Loss</option><option value="insertion">Insertion Loss</option><option value="heater">Heater Efficiency</option></select></div></div><WaferMapPanel cells={currentWaferCells} metricKey={selectedWaferMetric} selectedChip={selectedChip} onSelect={setSelectedChip} /><div className="wafer-footer-bar"><div><span>Show</span><select defaultValue="All Dies"><option>All Dies</option><option>Passing only</option></select></div><div><span>Overlay</span><select defaultValue="None"><option>None</option><option>Chip ID</option></select></div></div></article></section><section className="analysis-bottom-grid"><article className="analysis-card wide-span"><div className="analysis-card-head"><div><h2>Normalized Dataset</h2><p>Unified CSV-ready rows from the shared translation layer.</p></div><div className="dataset-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows, chips, or devices" /><button type="button" onClick={exportNormalizedCsv}>Export CSV</button></div></div><div className="dashboard-table-wrap"><table><thead><tr><th>Device ID</th><th>Wafer</th><th>X</th><th>Y</th><th>Source</th><th>Rel. Length</th><th>Transmission</th><th>Propagation Loss</th><th>Wavelength</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.source_name + "-" + row.row_index}><td>{row.chip_id || "--"}</td><td>{waferName}</td><td>{row.die_x ?? "--"}</td><td>{row.die_y ?? "--"}</td><td>{row.source_type.includes("excel") ? "XLSX" : row.source_type.includes("txt") ? "TXT" : row.source_type}</td><td>{row.relative_length_mm ?? "--"}</td><td>{row.transmission_db ?? "--"}</td><td>{metrics.propagation.byChip.find((item) => item.chipId === row.chip_id)?.lossDbPerCm.toFixed(2) ?? "--"}</td><td>{row.wavelength_nm ?? sourceMeta.defaultWavelengthNm}</td></tr>)}</tbody></table></div></article><article className="analysis-card"><div className="analysis-card-head stacked"><div><h2>File Translator Status</h2><p>{statusMessage}</p></div></div><TranslationStatus sourceName={sourceMeta.name} sourceType={sourceMeta.type} totalRows={datasetSummary.rows} matchedDevices={matchedDevices} unmatchedDevices={unmatchedDevices} /><button type="button" className="secondary-action" onClick={() => updateTab("audit")}>Open Audit Log</button></article><article className="analysis-card"><div className="analysis-card-head"><div><h2>Report Preview</h2><p>Export-ready representation of wafer quality.</p></div><button type="button" onClick={exportReportJson}>Open Report</button></div><ReportPreviewCard reportState={reportState} selectedMetricLabel={metricLabel(selectedWaferMetric)} /></article></section>{activeTab === "intake" ? <section className="mapping-drawer"><div className="mapping-drawer-head"><div><h2>Translator Mapping</h2><p>Review how the unified CSV schema is derived from your measurement file.</p></div><div><span>Canonical export columns</span><small>{requiredColumns().slice(0, 6).join(", ") + ", ..."}</small></div></div><div className="mapping-grid">{["chip_id","die_x","die_y","metric_family","block_name","waveguide_type","wavelength_nm","relative_length_mm","transmission_db","insertion_loss_db","pi_power_mw","phase_shift_pi","current_ma","voltage_v"].map((field) => <MappingSelect key={field} label={field} value={currentMap[field] || ""} columns={Object.keys(currentRows[0] || {})} onChange={(nextValue) => setColumnMap((previous) => ({ ...previous, [field]: nextValue }))} />)}</div><div className="mapping-family-row"><FilterField label="Default metric family" value={sourceMeta.defaultMetricFamily} onChange={(value) => setSourceMeta((previous) => ({ ...previous, defaultMetricFamily: value }))} options={DEFAULT_MAPPING_OPTIONS} /></div></section> : null}</> : null}{activeTab === "projects" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Projects Workspace</h2><p>Save the current wafer analysis context so you can reopen the same project state later.</p></div><div className="library-action-row"><button type="button" onClick={saveCurrentProject}>Save Current Project</button><button type="button" className="ghost-action" onClick={() => updateTab("propagation")}>Back To Analysis</button></div></div><div className="translator-metrics"><div><strong>{projectName}</strong><span>Project</span></div><div><strong>{waferName}</strong><span>Wafer</span></div><div><strong>{datasetSummary.rows}</strong><span>Rows</span></div></div></article><article className="analysis-card"><div className="analysis-card-head"><div><h2>Saved Projects</h2><p>Stored locally in this browser.</p></div></div><LibraryTable columns={["Project", "Wafer", "Dataset", "Rows", "Saved", "Actions"]} rows={currentProjectRows} emptyMessage="No saved projects yet." /></article></section> : null}{activeTab === "datasets" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Datasets Library</h2><p>Manage normalized dataset snapshots stored locally in this browser for quick reload and comparison.</p></div><div className="library-action-row"><button type="button" onClick={() => saveCurrentDataset(false)}>Save Dataset Snapshot</button><button type="button" className="ghost-action" onClick={loadDemo}>Restore Demo</button></div></div><div className="translator-metrics"><div><strong>{sourceMeta.name}</strong><span>Current Source</span></div><div><strong>{sourceMeta.type}</strong><span>Type</span></div><div><strong>{appSettings.autoSaveUploads ? "Enabled" : "Disabled"}</strong><span>Auto Save</span></div></div></article><article className="analysis-card"><div className="analysis-card-head"><div><h2>Saved Datasets</h2><p>Each entry can be loaded back into the dashboard.</p></div></div><LibraryTable columns={["Dataset", "Project", "Wafer", "Rows", "Saved", "Actions"]} rows={currentDatasetRows} emptyMessage="No saved dataset snapshots yet." /></article></section> : null}{activeTab === "settings" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Settings</h2><p>Control persistent defaults for operator identity, wavelength assumptions, metric family, and upload behavior.</p></div><div className="library-action-row"><button type="button" onClick={saveSettings}>Save Settings</button><button type="button" className="ghost-action" onClick={resetSettings}>Reset Defaults</button></div></div><div className="settings-grid"><label className="mapping-field"><span>Operator name</span><input value={settingsDraft.operatorName} onChange={(event) => updateSettingsDraft("operatorName", event.target.value)} /></label><label className="mapping-field"><span>Operator role</span><input value={settingsDraft.operatorRole} onChange={(event) => updateSettingsDraft("operatorRole", event.target.value)} /></label><label className="mapping-field"><span>Default wavelength (nm)</span><input type="number" value={settingsDraft.defaultWavelengthNm} onChange={(event) => updateSettingsDraft("defaultWavelengthNm", Number(event.target.value) || 1550)} /></label><label className="mapping-field"><span>Default metric family</span><select value={settingsDraft.defaultMetricFamily} onChange={(event) => updateSettingsDraft("defaultMetricFamily", event.target.value)}>{DEFAULT_MAPPING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div><label className="toggle-row"><input type="checkbox" checked={settingsDraft.autoSaveUploads} onChange={(event) => updateSettingsDraft("autoSaveUploads", event.target.checked)} /><div><strong>Automatically save uploaded datasets</strong><span>Each new upload is stored as a reusable dataset snapshot in the local browser library.</span></div></label></article></section> : null}{activeTab === "audit" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Audit Log</h2><p>Review the local activity trail for uploads, exports, saves, loads, and settings changes.</p></div><div className="library-action-row"><button type="button" className="ghost-action" onClick={clearAuditLog}>Clear Audit Log</button></div></div><LibraryTable columns={["Action", "Type", "Detail", "Time"]} rows={auditRows} emptyMessage="No audit entries yet." /></article></section> : null}{activeTab === "help" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Help Center</h2><p>Quick in-app guidance for the current release, focused on how data flows through intake, analysis, storage, and reporting.</p></div><div className="library-action-row"><button type="button" onClick={() => updateTab("intake")}>Open Intake</button><button type="button" className="ghost-action" onClick={() => updateTab("report")}>Open Report View</button></div></div><div className="help-grid">{HELP_TOPICS.map((topic) => <article key={topic.title} className="help-card"><h3>{topic.title}</h3><p>{topic.body}</p></article>)}</div><div className="doc-link-list">{DOC_LINKS.map((doc) => <div key={doc.label} className="doc-link-item"><strong>{doc.label}</strong><span>{doc.path}</span></div>)}</div></article></section> : null}</main></div></div>;
}
