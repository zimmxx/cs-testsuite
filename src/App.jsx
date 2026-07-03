import { useDeferredValue, useEffect, useMemo, useState, startTransition } from "react";
import {
  buildHtmlReport,
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
  readNamedTextRows,
  requiredColumns,
  sourceTypeLabel
} from "./lib/parsers";
import { createCenterFilledWaferTemplate, defaultWaferTemplateId, getBuiltInWaferTemplates, getWaferTemplateLayout, shortChipLabel } from "./lib/waferTemplates";
import { buildDatasetSnapshotMetadata, buildGithubDatasetPackage, publishDatasetPackageToGithub } from "./lib/githubLibrary";
import {
  InteractivePropagationPlot,
  InteractivePropagationSpectrumPlot,
  InteractiveTransmissionSpectrumPlot
} from "./components/InteractivePlots";
import ManualConversionPanel from "./components/ManualConversionPanel";
import DatasetLibraryPanel from "./components/DatasetLibraryPanel";
import ToastTray from "./components/ToastTray";

const APP_TABS = [
  { id: "propagation", label: "Propagation Loss" },
  { id: "insertion", label: "Insertion Loss" },
  { id: "heater", label: "Heater Efficiency" }
];

const RAIL_SECTIONS = [
  { title: "Workspace", items: APP_TABS },
  {
    title: "Library",
    items: [
      { id: "projects", label: "Projects" },
      { id: "datasets", label: "Datasets" },
      { id: "manual-conversion", label: "Manual Conversion" },
      { id: "wafermaps", label: "Wafermaps" },
      { id: "settings", label: "Settings" },
      { id: "audit", label: "Audit Log" },
      { id: "help", label: "Help" }
    ]
  }
];

const DEFAULT_MAPPING_OPTIONS = ["propagation", "insertion", "heater"];
const DATASET_PREVIEW_LIMIT = 12;
const DEFAULT_WAVEGUIDE_COUNT = 6;
const DEFAULT_WAVEGUIDE_START_MM = 0;
const DEFAULT_WAVEGUIDE_INTERVAL_MM = 4;
const UPLOAD_BATCH_SIZE = 8;
const MAX_LOCAL_SNAPSHOT_ROWS = 150000;
const MAX_LOCAL_SNAPSHOT_FILES = 120;
const MAX_LOCAL_SNAPSHOT_ESTIMATED_BYTES = 4500000;
const STORAGE_KEYS = {
  projects: "wps.projects.v1",
  datasets: "wps.datasets.v1",
  waferTemplates: "wps.wafer-templates.v1",
  settings: "wps.settings.v1",
  audit: "wps.audit.v1",
  github: "wps.github.v1"
};
const DEFAULT_WAFER_TEMPLATE_DRAFT = {
  id: "",
  name: "Custom Wafer Template",
  rows: 9,
  columns: 13,
  rowSpacing: 1,
  columnSpacing: 1,
  chipLengthX: 10,
  chipWidthY: 5,
  notchOrientation: "south"
};
const DEFAULT_WAVEGUIDE_LENGTHS_MM = buildGeneratedWaveguideLengthMap(
  DEFAULT_WAVEGUIDE_COUNT,
  DEFAULT_WAVEGUIDE_START_MM,
  DEFAULT_WAVEGUIDE_INTERVAL_MM
);
const DEFAULT_SETTINGS = {
  operatorName: "s.engineer",
  operatorRole: "Engineer",
  defaultWavelengthNm: 1550,
  defaultMetricFamily: "propagation",
  autoSaveUploads: true,
  launchPowerDbm: 10,
  propagationTargetWavelengthNm: 1550,
  propagationWindowNm: 5,
  propagationSpectralStepNm: 10,
  propagationMseThreshold: 0.5,
  propagationWaveguideCount: DEFAULT_WAVEGUIDE_COUNT,
  propagationWaveguideStartMm: DEFAULT_WAVEGUIDE_START_MM,
  propagationWaveguideIntervalMm: DEFAULT_WAVEGUIDE_INTERVAL_MM,
  propagationWaveguideManualMode: false,
  propagationWaveguideLengthsMm: DEFAULT_WAVEGUIDE_LENGTHS_MM,
  defaultWaferTemplateId: defaultWaferTemplateId()
};
const HELP_TOPICS = [
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
const REPO_DOC_BASE = "https://github.com/zimmxx/cs-testsuite/blob/main/";
const GITHUB_LIBRARY_MANIFEST_PATH = "public/sample-data/wst/library-index.json";
const GITHUB_LIBRARY_MANIFEST_MIRROR_PATH = "sample-data/wst/library-index.json";
const DEFAULT_GITHUB_CONFIG = { owner: "zimmxx", repo: "cs-testsuite", branch: "main", token: "" };
const DOC_LINKS = [
  { label: "Project README", path: "README.md", href: `${REPO_DOC_BASE}README.md` },
  { label: "Local Git and GitHub Workflow", path: "docs/LOCAL_GIT_GITHUB_WORKFLOW.md", href: `${REPO_DOC_BASE}docs/LOCAL_GIT_GITHUB_WORKFLOW.md` },
  { label: "Feature Guide v0.1.0", path: "docs/releases/v0.1.0/FEATURES.md", href: `${REPO_DOC_BASE}docs/releases/v0.1.0/FEATURES.md` },
  { label: "Change Log v0.1.0", path: "docs/releases/v0.1.0/CHANGELOG.md", href: `${REPO_DOC_BASE}docs/releases/v0.1.0/CHANGELOG.md` }
];

const BUNDLED_LIBRARY_DATASETS = [
  {
    id: "mpw30-slot13-rib",
    label: "MPW30 Slot13 Rib WST Raw Data",
    projectName: "MPW30_Slot13_Rib",
    waferName: "WaferMPW_30_slot13_rib_wg",
    selectedDate: "2024-04-16",
    folder: "sample-data/wst/MPW30_slot13_rib_data",
    chipIds: [11, 12, 13, 14, 35, 36, 37, 38, 39, 40],
    waveguides: [1, 2, 3, 4, 5, 6],
    traceCount: 60,
    sourceType: "Automated WST trace set"
  }
];

function bundledTraceNames(definition) {
  return definition.chipIds.flatMap((chipId) =>
    definition.waveguides.map((waveguide) => `WaferMPW_30_slot13_rib_wg_Chip${chipId}_WG${waveguide}.txt`)
  );
}

function bundledAssetUrl(relativePath) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${base}${String(relativePath || "").replace(/^\/+/, "")}`;
}

function normalizeLibraryDataset(definition) {
  return {
    ...definition,
    files: definition.files?.length ? definition.files : bundledTraceNames(definition),
    source: definition.source || "github-library"
  };
}
const DEMO_ROWS = [];

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

function estimateSnapshotBytes(rows = [], columnMap = {}, sourceMeta = {}) {
  const sample = rows.slice(0, Math.min(rows.length, 24));
  const sampleJson = JSON.stringify(sample);
  const avgRowBytes = sample.length ? sampleJson.length / sample.length : 0;
  return Math.round(avgRowBytes * rows.length + JSON.stringify(columnMap).length + JSON.stringify(sourceMeta).length + 1024);
}

function evaluateLocalSnapshotCapacity(rows = [], sourceMeta = {}) {
  const sourceFiles = new Set(rows.map((row) => row?.source_name).filter(Boolean)).size;
  const estimatedBytes = estimateSnapshotBytes(rows, {}, sourceMeta);
  if (rows.length > MAX_LOCAL_SNAPSHOT_ROWS) {
    return { ok: false, reason: `Dataset has ${rows.length.toLocaleString()} rows, above the local browser snapshot limit of ${MAX_LOCAL_SNAPSHOT_ROWS.toLocaleString()} rows.` };
  }
  if (sourceFiles > MAX_LOCAL_SNAPSHOT_FILES) {
    return { ok: false, reason: `Dataset has ${sourceFiles} source files, above the local browser snapshot limit of ${MAX_LOCAL_SNAPSHOT_FILES} files.` };
  }
  if (estimatedBytes > MAX_LOCAL_SNAPSHOT_ESTIMATED_BYTES) {
    return { ok: false, reason: `Estimated browser storage footprint is about ${(estimatedBytes / 1000000).toFixed(1)} MB, above the safe local snapshot limit.` };
  }
  return { ok: true, sourceFiles, estimatedBytes };
}

async function readFilesInBatches(files, reader, batchSize = UPLOAD_BATCH_SIZE, onProgress) {
  const rows = [];
  for (let index = 0; index < files.length; index += batchSize) {
    const batch = files.slice(index, index + batchSize);
    onProgress?.(Math.min(index + batch.length, files.length), files.length);
    const batchRows = await Promise.all(batch.map((file) => reader(file)));
    rows.push(...batchRows.flat());
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return rows;
}

function createId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildCrossChipSample(rows, limit = DATASET_PREVIEW_LIMIT) {
  const grouped = rows.reduce((acc, row) => {
    const key = row.chip_id || "unassigned";
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());

  const chipKeys = Array.from(grouped.keys());
  const sample = [];
  let depth = 0;

  while (sample.length < limit && chipKeys.length) {
    let addedThisRound = false;
    chipKeys.forEach((key) => {
      const row = grouped.get(key)?.[depth];
      if (row && sample.length < limit) {
        sample.push(row);
        addedThisRound = true;
      }
    });
    if (!addedThisRound) break;
    depth += 1;
  }

  return sample;
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

function buildGeneratedWaveguideLengthMap(count = DEFAULT_WAVEGUIDE_COUNT, start = DEFAULT_WAVEGUIDE_START_MM, interval = DEFAULT_WAVEGUIDE_INTERVAL_MM) {
  const safeCount = Math.max(Math.round(Number(count) || DEFAULT_WAVEGUIDE_COUNT), 1);
  const safeStart = Number.isFinite(Number(start)) ? Number(start) : DEFAULT_WAVEGUIDE_START_MM;
  const safeInterval = Number.isFinite(Number(interval)) ? Number(interval) : DEFAULT_WAVEGUIDE_INTERVAL_MM;
  return Object.fromEntries(
    Array.from({ length: safeCount }, (_, index) => [String(index + 1), safeStart + index * safeInterval])
  );
}

function inferWaveguideSequenceSettings(map = DEFAULT_WAVEGUIDE_LENGTHS_MM) {
  const entries = Object.entries(map || {})
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(([key, value]) => Number.isFinite(key) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0]);

  if (!entries.length) {
    return {
      count: DEFAULT_WAVEGUIDE_COUNT,
      start: DEFAULT_WAVEGUIDE_START_MM,
      interval: DEFAULT_WAVEGUIDE_INTERVAL_MM,
      isUniform: true
    };
  }

  const values = entries.map(([, value]) => value);
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const firstDelta = deltas[0] ?? DEFAULT_WAVEGUIDE_INTERVAL_MM;
  const isUniform = deltas.every((delta) => Math.abs(delta - firstDelta) < 1e-9);

  return {
    count: entries.length,
    start: values[0] ?? DEFAULT_WAVEGUIDE_START_MM,
    interval: isUniform ? firstDelta : DEFAULT_WAVEGUIDE_INTERVAL_MM,
    isUniform
  };
}

function cloneWaveguideLengthMap(
  map = DEFAULT_WAVEGUIDE_LENGTHS_MM,
  count = DEFAULT_WAVEGUIDE_COUNT,
  start = DEFAULT_WAVEGUIDE_START_MM,
  interval = DEFAULT_WAVEGUIDE_INTERVAL_MM,
  manualMode = true
) {
  const generated = buildGeneratedWaveguideLengthMap(count, start, interval);
  if (!manualMode) return generated;

  return Object.fromEntries(
    Object.keys(generated).map((key) => {
      const candidate = map?.[key];
      return [key, Number.isFinite(Number(candidate)) ? Number(candidate) : generated[key]];
    })
  );
}

function hydrateSettings(stored = {}) {
  const inferred = inferWaveguideSequenceSettings(stored.propagationWaveguideLengthsMm || DEFAULT_WAVEGUIDE_LENGTHS_MM);
  const count = Math.max(Math.round(Number(stored.propagationWaveguideCount ?? inferred.count) || inferred.count), 1);
  const start = Number.isFinite(Number(stored.propagationWaveguideStartMm)) ? Number(stored.propagationWaveguideStartMm) : inferred.start;
  const interval = Number.isFinite(Number(stored.propagationWaveguideIntervalMm)) ? Number(stored.propagationWaveguideIntervalMm) : inferred.interval;
  const manualMode = stored.propagationWaveguideManualMode ?? !inferred.isUniform;

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    propagationWaveguideCount: count,
    propagationWaveguideStartMm: start,
    propagationWaveguideIntervalMm: interval,
    propagationWaveguideManualMode: manualMode,
    defaultWaferTemplateId: stored.defaultWaferTemplateId || defaultWaferTemplateId(),
    propagationWaveguideLengthsMm: cloneWaveguideLengthMap(
      stored.propagationWaveguideLengthsMm,
      count,
      start,
      interval,
      manualMode
    )
  };
}

function buildDefaultSourceMeta(settings) {
  return {
    name: "",
    type: "No dataset loaded",
    defaultMetricFamily: settings.defaultMetricFamily,
    defaultWavelengthNm: settings.defaultWavelengthNm,
    launchPowerDbm: settings.launchPowerDbm,
    propagationTargetWavelengthNm: settings.propagationTargetWavelengthNm,
    propagationWindowNm: settings.propagationWindowNm,
    propagationSpectralStepNm: settings.propagationSpectralStepNm,
    propagationMseThreshold: settings.propagationMseThreshold,
    propagationWaveguideCount: settings.propagationWaveguideCount,
    propagationWaveguideStartMm: settings.propagationWaveguideStartMm,
    propagationWaveguideIntervalMm: settings.propagationWaveguideIntervalMm,
    propagationWaveguideManualMode: settings.propagationWaveguideManualMode,
    waveguideLengthByIndex: cloneWaveguideLengthMap(
      settings.propagationWaveguideLengthsMm,
      settings.propagationWaveguideCount,
      settings.propagationWaveguideStartMm,
      settings.propagationWaveguideIntervalMm,
      settings.propagationWaveguideManualMode
    ),
    waferTemplateId: settings.defaultWaferTemplateId || defaultWaferTemplateId(),
    waferTemplateLayout: null,
    waferTemplateName: "",
    waferTemplateNotchOrientation: "south",
    waferColorScaleMin: null,
    waferColorScaleMax: null
  };
}

function applyWaveguideSettingsToSourceMeta(previous, patch = {}) {
  const next = { ...previous, ...patch };
  const count = Math.max(Math.round(Number(next.propagationWaveguideCount) || DEFAULT_WAVEGUIDE_COUNT), 1);
  const start = Number.isFinite(Number(next.propagationWaveguideStartMm)) ? Number(next.propagationWaveguideStartMm) : DEFAULT_WAVEGUIDE_START_MM;
  const interval = Number.isFinite(Number(next.propagationWaveguideIntervalMm)) ? Number(next.propagationWaveguideIntervalMm) : DEFAULT_WAVEGUIDE_INTERVAL_MM;
  const manualMode = Boolean(next.propagationWaveguideManualMode);

  return {
    ...next,
    propagationWaveguideCount: count,
    propagationWaveguideStartMm: start,
    propagationWaveguideIntervalMm: interval,
    propagationWaveguideManualMode: manualMode,
    waveguideLengthByIndex: cloneWaveguideLengthMap(next.waveguideLengthByIndex, count, start, interval, manualMode)
  };
}

function applyWaveguideSettingsToDraft(previous, patch = {}) {
  const next = { ...previous, ...patch };
  const count = Math.max(Math.round(Number(next.propagationWaveguideCount) || DEFAULT_WAVEGUIDE_COUNT), 1);
  const start = Number.isFinite(Number(next.propagationWaveguideStartMm)) ? Number(next.propagationWaveguideStartMm) : DEFAULT_WAVEGUIDE_START_MM;
  const interval = Number.isFinite(Number(next.propagationWaveguideIntervalMm)) ? Number(next.propagationWaveguideIntervalMm) : DEFAULT_WAVEGUIDE_INTERVAL_MM;
  const manualMode = Boolean(next.propagationWaveguideManualMode);

  return {
    ...next,
    propagationWaveguideCount: count,
    propagationWaveguideStartMm: start,
    propagationWaveguideIntervalMm: interval,
    propagationWaveguideManualMode: manualMode,
    propagationWaveguideLengthsMm: cloneWaveguideLengthMap(next.propagationWaveguideLengthsMm, count, start, interval, manualMode)
  };
}

function formatWaveguideLengthPreview(map = {}) {
  const values = Object.entries(map)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, value]) => formatMetricNumber(value, Number.isInteger(value) ? 0 : 2));
  return values.length ? `[${values.join(" ")}] mm` : "[] mm";
}

function normalizeStoredDatasets(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function mergeWaferTemplates(...groups) {
  const merged = new Map();
  groups.flat().filter(Boolean).forEach((template) => {
    if (template?.id && !merged.has(template.id)) {
      merged.set(template.id, template);
    }
  });
  return Array.from(merged.values());
}

function sourceCount(rows) {
  return new Set(rows.map((row) => row.source_name).filter(Boolean)).size || 0;
}

function measurementDisplay(row) {
  if (row.loss_db !== null && row.loss_db !== undefined) return row.loss_db;
  if (row.transmission_db !== null && row.transmission_db !== undefined) return row.transmission_db;
  return null;
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
  const safeOptions = options.length ? options : [""];

  return (
    <label className="filter-field">
      <span>{label}</span>
      <div>
        {icon ? <i>{icon}</i> : null}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {safeOptions.map((option, index) => (
            <option key={`${label}-${option || index}`} value={option}>
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

function formatMetricNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function buildMiniBars(values) {
  const clean = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
  if (!clean.length) return [36, 48, 58, 72, 62, 50, 40];
  const trimmed = clean.slice(0, 7);
  const min = Math.min(...trimmed);
  const max = Math.max(...trimmed);
  return trimmed.map((value) => {
    if (max === min) return 68;
    return 26 + ((value - min) / (max - min)) * 58;
  });
}

function metricValueForComparison(metricKey, item) {
  if (!item) return null;
  if (metricKey === "propagation") return item.lossDbPerCm;
  if (metricKey === "insertion") return item.insertionLossDb;
  return item.efficiencyMwPerPi;
}

function metricDescriptorForComparison(metricKey, item) {
  if (!item) return "--";
  if (metricKey === "propagation") return `${item.samples?.length ?? 0} fit points`;
  if (metricKey === "insertion") return `${item.blockCount ?? 0} blocks`;
  return `${item.samples ?? 0} heater rows`;
}

function WaferMapPanel({
  cells,
  metricKey,
  selectedChip,
  onSelect,
  overlayMode = "none",
  templateName = "",
  notchOrientation = "south",
  colorScaleMin = null,
  colorScaleMax = null
}) {
  if (!cells.length) {
    return <div className="chart-empty">No wafermap values available for this metric.</div>;
  }

  const automaticRange = getMetricRange(cells);
  const hasManualRange = Number.isFinite(Number(colorScaleMin)) && Number.isFinite(Number(colorScaleMax)) && Number(colorScaleMax) > Number(colorScaleMin);
  const range = hasManualRange
    ? { min: Number(colorScaleMin), max: Number(colorScaleMax) }
    : automaticRange;
  const cols = Math.max(...cells.map((cell) => cell.dieX || 0), 1);
  const rowValues = Array.from(new Set(cells.map((cell) => cell.dieY).filter((value) => value !== null && value !== undefined)))
    .sort((a, b) => b - a);
  const rows = rowValues.length;
  const hue = metricKey === "heater" ? 16 : metricKey === "insertion" ? 210 : 174;

  const colorFor = (value) => {
    if (!range || value === null || value === undefined) return "#eef2f4";
    const rawRatio = (value - range.min) / Math.max(range.max - range.min, 0.0001);
    const ratio = Math.min(Math.max(rawRatio, 0), 1);
    const lightness = 82 - ratio * 34;
    return `hsl(${hue} 72% ${lightness}%)`;
  };

  const labelFor = (cell) => {
    if (overlayMode === "value" && cell.value !== null && cell.value !== undefined) {
      return formatMetricNumber(cell.value, metricKey === "heater" ? 1 : 2);
    }
    return shortChipLabel(cell.chipId);
  };

  return (
    <div className="wafer-card-layout">
      <div className="wafer-outline-shell">
        {templateName ? <div className="wafer-template-badge">{templateName}</div> : null}
        <div className="wafer-outline">
          <div className={`wafer-notch notch-${notchOrientation || "south"}`} />
          <div className="wafer-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: rows * cols }, (_, index) => {
              const x = (index % cols) + 1;
              const rowIndex = Math.floor(index / cols);
              const y = rowValues[rowIndex];
              const cell = cells.find((item) => item.dieX === x && item.dieY === y);
              const selected = selectedChip === cell?.chipId;
              const cellLabel = cell ? labelFor(cell) : "";
              const interactive = cell?.hasMeasurement;
              return (
                <button
                  key={`${x}-${y ?? rowIndex}`}
                  type="button"
                  className={selected ? "wafer-grid-cell selected" : "wafer-grid-cell"}
                  style={cell ? { background: colorFor(cell.value) } : undefined}
                  onClick={() => interactive && onSelect(cell.chipId)}
                  title={cell ? `${cell.chipId}: ${cell.detail || (cell.value !== null && cell.value !== undefined ? formatMetric(metricKey, cell.value) : "No measurement loaded")}` : `Empty die (${x}, ${y ?? "NA"})`}
                >
                  {cell ? <span className={interactive ? "wafer-cell-label" : "wafer-cell-label muted"}>{cellLabel}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="wafer-side-scale">
        <div className="wafer-scale-bar" />
        <div className="wafer-scale-labels">
          <span>{range ? range.max.toFixed(2) : "--"}</span>
          <span>{range ? ((range.max + range.min) / 2).toFixed(2) : "--"}</span>
          <span>{range ? range.min.toFixed(2) : "--"}</span>
        </div>
      </div>
    </div>
  );
}

function MetricComparisonPlot({ metricKey, items, selectedKey, onSelect, emptyMessage }) {
  if (!items.length) {
    return <div className="chart-empty">{emptyMessage}</div>;
  }

  const values = items.map((item) => metricValueForComparison(metricKey, item)).filter((value) => value !== null && value !== undefined);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <div className="metric-comparison-plot">
      {items.slice(0, 12).map((item) => {
        const key = item.chipId;
        const value = metricValueForComparison(metricKey, item);
        const ratio = value === null || value === undefined
          ? 0
          : max === min
            ? 0.7
            : 0.15 + ((value - min) / Math.max(max - min, 0.0001)) * 0.85;
        return (
          <button
            key={`${metricKey}-${key}`}
            type="button"
            className={selectedKey === key ? "metric-comparison-item selected" : "metric-comparison-item"}
            onClick={() => onSelect(key)}
          >
            <div className="metric-comparison-copy">
              <strong>{key}</strong>
              <span>{metricDescriptorForComparison(metricKey, item)}</span>
            </div>
            <div className="metric-comparison-track">
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
            <div className="metric-comparison-value">{formatMetric(metricKey, value)}</div>
          </button>
        );
      })}
    </div>
  );
}

function MetricInspector({ metricKey, item, sourceMeta }) {
  if (!item) {
    return (
      <aside className="fit-results-card metric-inspector-card">
        <h3>Metric Inspector</h3>
        <div className="chart-empty compact">Select a chip on the wafermap or comparison chart to inspect that die.</div>
      </aside>
    );
  }

  if (metricKey === "propagation") {
    return (
      <aside className="fit-results-card metric-inspector-card">
        <h3>Fit Results</h3>
        <ResultKeyValue label="Chip" value={item.chipId} />
        <ResultKeyValue label="Propagation loss" value={formatMetric("propagation", item.lossDbPerCm ?? null)} />
        <ResultKeyValue label="Intercept" value={item.interceptDb !== null && item.interceptDb !== undefined ? `${item.interceptDb.toFixed(2)} dB` : "--"} />
        <ResultKeyValue label="R2" value={item.mse !== null && item.mse !== undefined ? (1 - item.mse).toFixed(3) : "--"} />
        <ResultKeyValue label="RMSE" value={item.mse !== null && item.mse !== undefined ? `${Math.sqrt(item.mse).toFixed(2)} dB` : "--"} />
        <ResultKeyValue label="Wavelength band" value={`${sourceMeta.propagationTargetWavelengthNm - sourceMeta.propagationWindowNm} - ${sourceMeta.propagationTargetWavelengthNm + sourceMeta.propagationWindowNm} nm`} />
        <ResultKeyValue label="Fit points" value={String(item.samples?.length ?? 0)} />
      </aside>
    );
  }

  if (metricKey === "insertion") {
    return (
      <aside className="fit-results-card metric-inspector-card">
        <h3>Insertion Inspector</h3>
        <ResultKeyValue label="Chip" value={item.chipId} />
        <ResultKeyValue label="Mean insertion loss" value={formatMetric("insertion", item.insertionLossDb ?? null)} />
        <ResultKeyValue label="Blocks tracked" value={String(item.blockCount ?? 0)} />
        <ResultKeyValue label="Building blocks" value={item.blockNames?.join(", ") || "--"} />
        <ResultKeyValue label="Die position" value={item.dieX !== null && item.dieY !== null ? `${item.dieX}, ${item.dieY}` : "--"} />
      </aside>
    );
  }

  return (
    <aside className="fit-results-card metric-inspector-card">
      <h3>Heater Inspector</h3>
      <ResultKeyValue label="Chip" value={item.chipId} />
      <ResultKeyValue label="Efficiency" value={formatMetric("heater", item.efficiencyMwPerPi ?? null)} />
      <ResultKeyValue label="Samples" value={String(item.samples ?? 0)} />
      <ResultKeyValue label="Die position" value={item.dieX !== null && item.dieY !== null ? `${item.dieX}, ${item.dieY}` : "--"} />
    </aside>
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

function ReportPreviewCard({ reportState, selectedMetricLabel, onOpenReport }) {
  const propagationBars = buildMiniBars(reportState.propagationTop.map((item) => item.lossDbPerCm));
  const insertionBars = buildMiniBars(reportState.insertionTop.map((item) => item.insertionLossDb));
  const heaterBars = buildMiniBars(reportState.heaterTop.map((item) => item.efficiencyMwPerPi));

  return (
    <div className="report-preview-card">
      <div className="report-preview-head">
        <div>
          <p>Wafer Post-Processing Report</p>
          <strong>{selectedMetricLabel}</strong>
        </div>
        <button type="button" onClick={onOpenReport}>Export Report</button>
      </div>
      <div className="report-preview-body">
        <div className="report-summary-grid">
          <div>
            <small>Normalized rows</small>
            <span>{reportState.summary.rows}</span>
          </div>
          <div>
            <small>Passing chips</small>
            <span>{reportState.matlabSummary.fittedChips}</span>
          </div>
          <div>
            <small>Measured chips</small>
            <span>{reportState.matlabSummary.measuredChips}</span>
          </div>
        </div>
        <div className="report-preview-gallery">
          <div className="report-preview-note-card">
            <small>Highlights</small>
            <ul>
              {reportState.highlights.slice(0, 3).map((highlight) => <li key={highlight}>{highlight}</li>)}
            </ul>
          </div>
          <div className="report-preview-note-card">
            <small>Wafer Quality</small>
            <strong>{reportState.matlabSummary.avgPropagationLossDbPerCm !== null && reportState.matlabSummary.avgPropagationLossDbPerCm !== undefined ? `${reportState.matlabSummary.avgPropagationLossDbPerCm.toFixed(2)} dB/cm avg` : "Awaiting propagation fit"}</strong>
            <span>{reportState.matlabSummary.failedFits} failed fits filtered by the current MSE threshold.</span>
          </div>
        </div>
        <div className="report-preview-charts">
          <div>
            <small>Propagation Loss</small>
            <ReportMiniChart bars={propagationBars} tone="teal" />
          </div>
          <div>
            <small>Insertion Loss</small>
            <ReportMiniChart bars={insertionBars} tone="blue" />
          </div>
          <div>
            <small>Heater Efficiency</small>
            <ReportMiniChart bars={heaterBars} tone="copper" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceDiagnosticsCard({ rows, summary, sourceMeta }) {
  const chips = new Set(rows.map((row) => row.chip_id).filter(Boolean));
  const waveguides = new Set(rows.map((row) => row.waveguide_id).filter(Boolean));
  const slots = new Set(rows.map((row) => row.slot_id).filter(Boolean));
  const wavelengths = rows.map((row) => row.wavelength_nm).filter((value) => value !== null && value !== undefined);
  const minWavelength = wavelengths.length ? Math.min(...wavelengths) : null;
  const maxWavelength = wavelengths.length ? Math.max(...wavelengths) : null;

  return (
    <article className="analysis-card diagnostics-card">
      <div className="analysis-card-head stacked">
        <div>
          <h2>Source Diagnostics</h2>
          <p>Quick checks for silicon photonics uploads before fitting, wafer trending, and report export.</p>
        </div>
      </div>
      <div className="diagnostics-grid">
        <div><strong>{summary.rows}</strong><span>Normalized rows</span></div>
        <div><strong>{chips.size}</strong><span>Unique chips</span></div>
        <div><strong>{waveguides.size || "--"}</strong><span>Waveguides</span></div>
        <div><strong>{slots.size || "--"}</strong><span>Slots tagged</span></div>
        <div><strong>{minWavelength !== null ? `${minWavelength.toFixed(1)} - ${maxWavelength.toFixed(1)}` : "--"}</strong><span>Wavelength span (nm)</span></div>
        <div><strong>{sourceMeta.launchPowerDbm} dBm</strong><span>Launch power</span></div>
      </div>
    </article>
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
function PropagationSpectrumPlot({ series, targetWavelengthNm, windowNm, spectralStepNm }) {
  if (!series.length) {
    return <div className="chart-empty">No wavelength-interval propagation fits are available for the selected chip.</div>;
  }

  const width = 680;
  const height = 260;
  const padding = { top: 22, right: 54, bottom: 42, left: 54 };
  const xs = series.map((point) => point.wavelengthNm);
  const lossValues = series.map((point) => point.lossDbPerCm);
  const mseValues = series.map((point) => point.mse);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const lossMin = Math.min(...lossValues) - 0.2;
  const lossMax = Math.max(...lossValues) + 0.2;
  const mseMin = 0;
  const mseMax = Math.max(...mseValues, 0.001) * 1.15;

  const scaleX = (value) =>
    padding.left + ((value - xMin) / Math.max(xMax - xMin, 1)) * (width - padding.left - padding.right);
  const scaleLossY = (value) =>
    height - padding.bottom - ((value - lossMin) / Math.max(lossMax - lossMin, 1)) * (height - padding.top - padding.bottom);
  const scaleMseY = (value) =>
    height - padding.bottom - ((value - mseMin) / Math.max(mseMax - mseMin, 0.0001)) * (height - padding.top - padding.bottom);

  const lossPath = series
    .map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(point.wavelengthNm)} ${scaleLossY(point.lossDbPerCm)}`)
    .join(" ");
  const msePath = series
    .map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(point.wavelengthNm)} ${scaleMseY(point.mse)}`)
    .join(" ");

  const bandStart = Math.max(targetWavelengthNm - windowNm, xMin);
  const bandEnd = Math.min(targetWavelengthNm + windowNm, xMax);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="analysis-plot" role="img" aria-label="Propagation loss and MSE against wavelength">
      <rect x="0" y="0" width={width} height={height} rx="22" className="analysis-plot-bg" />
      <rect
        x={scaleX(bandStart)}
        y={padding.top}
        width={Math.max(scaleX(bandEnd) - scaleX(bandStart), 2)}
        height={height - padding.top - padding.bottom}
        className="analysis-band"
      />
      {[...Array(5)].map((_, index) => {
        const lossValue = lossMin + ((lossMax - lossMin) / 4) * index;
        const y = scaleLossY(lossValue);
        return (
          <g key={`loss-grid-${index}`}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="analysis-grid" />
            <text x={padding.left - 10} y={y + 4} textAnchor="end" className="analysis-axis-label">
              {lossValue.toFixed(2)}
            </text>
          </g>
        );
      })}
      {[...Array(5)].map((_, index) => {
        const mseValue = mseMin + ((mseMax - mseMin) / 4) * index;
        const y = scaleMseY(mseValue);
        return (
          <text key={`mse-label-${index}`} x={width - padding.right + 10} y={y + 4} textAnchor="start" className="analysis-axis-label secondary-axis-label">
            {mseValue.toFixed(3)}
          </text>
        );
      })}
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="analysis-axis" />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="analysis-axis" />
      <line x1={width - padding.right} y1={padding.top} x2={width - padding.right} y2={height - padding.bottom} className="analysis-axis secondary-axis" />
      <path d={lossPath} className="analysis-spectrum-line" />
      <path d={msePath} className="analysis-mse-line" />
      {series.map((point) => (
        <circle key={`loss-${point.wavelengthNm}`} cx={scaleX(point.wavelengthNm)} cy={scaleLossY(point.lossDbPerCm)} r="3.5" className="analysis-spectrum-point" />
      ))}
      {series.map((point) => (
        <circle key={`mse-${point.wavelengthNm}`} cx={scaleX(point.wavelengthNm)} cy={scaleMseY(point.mse)} r="3.2" className="analysis-mse-point" />
      ))}
      <text x={width / 2} y={height - 4} textAnchor="middle" className="analysis-title-label">
        Wavelength interval center (nm)
      </text>
      <text transform={`translate(16 ${height / 2}) rotate(-90)`} textAnchor="middle" className="analysis-title-label">
        Propagation loss (dB/cm)
      </text>
      <text transform={`translate(${width - 8} ${height / 2}) rotate(-90)`} textAnchor="middle" className="analysis-title-label secondary-axis-label">
        MSE
      </text>
      <text x={padding.left} y={16} className="analysis-axis-label">Step {spectralStepNm} nm</text>
    </svg>
  );
}

function TransmissionSpectrumPlot({ series, targetWavelengthNm, chipId }) {
  if (!series.length) {
    return <div className="chart-empty">No transmission traces are available for the selected chip.</div>;
  }

  const width = 680;
  const height = 260;
  const padding = { top: 22, right: 20, bottom: 42, left: 54 };
  const points = series.flatMap((item) => item.points);
  const xs = points.map((point) => point.wavelengthNm);
  const ys = points.map((point) => point.transmissionDb);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys) - 0.4;
  const yMax = Math.max(...ys) + 0.4;
  const palette = ["#4f8df3", "#ff8f45", "#0f8a83", "#9d5cf6", "#d6658f", "#2f7d68"];

  const scaleX = (value) =>
    padding.left + ((value - xMin) / Math.max(xMax - xMin, 1)) * (width - padding.left - padding.right);
  const scaleY = (value) =>
    height - padding.bottom - ((value - yMin) / Math.max(yMax - yMin, 1)) * (height - padding.top - padding.bottom);

  return (
    <div className="transmission-plot-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="analysis-plot" role="img" aria-label={`Transmission traces for ${chipId}`}>
        <rect x="0" y="0" width={width} height={height} rx="22" className="analysis-plot-bg" />
        {[...Array(5)].map((_, index) => {
          const value = yMin + ((yMax - yMin) / 4) * index;
          const y = scaleY(value);
          return (
            <g key={`ty-${index}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="analysis-grid" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="analysis-axis-label">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="analysis-axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="analysis-axis" />
        <line x1={scaleX(targetWavelengthNm)} y1={padding.top} x2={scaleX(targetWavelengthNm)} y2={height - padding.bottom} className="analysis-target-line" />
        {series.map((item, index) => {
          const color = palette[index % palette.length];
          const path = item.points
            .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${scaleX(point.wavelengthNm)} ${scaleY(point.transmissionDb)}`)
            .join(" ");
          return <path key={item.waveguideId} d={path} className="analysis-spectrum-line" style={{ stroke: color }} />;
        })}
        <text x={width / 2} y={height - 4} textAnchor="middle" className="analysis-title-label">
          Wavelength (nm)
        </text>
        <text transform={`translate(16 ${height / 2}) rotate(-90)`} textAnchor="middle" className="analysis-title-label">
          Transmission (dB)
        </text>
      </svg>
      <div className="transmission-series-list">
        {series.map((item, index) => (
          <div key={item.waveguideId} className="transmission-series-item">
            <span className="transmission-swatch" style={{ background: palette[index % palette.length] }} />
            <strong>{item.waveguideId}</strong>
            <small>{item.lengthMm !== null && item.lengthMm !== undefined ? `${item.lengthMm} mm` : "length not set"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatlabSummaryPanel({ summary }) {
  const cards = [
    { label: "Measured chips", value: summary?.measuredChips ?? "--", note: "Unique chip locations parsed" },
    { label: "Valid fitted chips", value: summary?.fittedChips ?? "--", note: "Passing the propagation fit threshold" },
    { label: "Failed fits", value: summary?.failedFits ?? "--", note: "Above the allowed MSE threshold" },
    { label: "Avg propagation", value: summary?.avgPropagationLossDbPerCm !== null && summary?.avgPropagationLossDbPerCm !== undefined ? `${summary.avgPropagationLossDbPerCm.toFixed(2)} dB/cm` : "--", note: "Filtered wafer average" },
    { label: "Avg peak wavelength", value: summary?.avgPeakWavelengthNm !== null && summary?.avgPeakWavelengthNm !== undefined ? `${summary.avgPeakWavelengthNm.toFixed(1)} nm` : "--", note: "Derived from WG1 transmission peak" },
    { label: "Avg insertion loss", value: summary?.avgInsertionLossDb !== null && summary?.avgInsertionLossDb !== undefined ? `${summary.avgInsertionLossDb.toFixed(2)} dB` : "--", note: "Estimated from the strongest transmission" },
    { label: "Avg 3 dB bandwidth", value: summary?.avgBandwidth3dBNm !== null && summary?.avgBandwidth3dBNm !== undefined ? `${summary.avgBandwidth3dBNm.toFixed(1)} nm` : "--", note: "Average passband width from WG1" }
  ];

  return (
    <section className="matlab-summary-grid">
      {cards.map((card) => (
        <article key={card.label} className="matlab-summary-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <p>{card.note}</p>
        </article>
      ))}
    </section>
  );
}

function WaveguideLengthConfigurator({
  count,
  start,
  interval,
  manualMode,
  lengths,
  onNumberChange,
  onLengthChange,
  onManualModeChange
}) {
  return (
    <div className="waveguide-configurator">
      <div className="propagation-length-grid waveguide-generator-grid">
        <label className="mapping-field">
          <span>Number of waveguides</span>
          <input type="number" min="1" value={count ?? ""} onChange={(event) => onNumberChange("propagationWaveguideCount", Math.max(Number(event.target.value) || 1, 1))} />
        </label>
        <label className="mapping-field">
          <span>Start waveguide length (mm)</span>
          <input type="number" value={start ?? ""} onChange={(event) => onNumberChange("propagationWaveguideStartMm", Number(event.target.value) || 0)} />
        </label>
        <label className="mapping-field">
          <span>Waveguide length interval (mm)</span>
          <input type="number" value={interval ?? ""} onChange={(event) => onNumberChange("propagationWaveguideIntervalMm", Number(event.target.value) || 0)} />
        </label>
      </div>
      <label className="toggle-row compact-toggle-row">
        <input type="checkbox" checked={manualMode} onChange={(event) => onManualModeChange(event.target.checked)} />
        <div>
          <strong>Manually override processed lengths</strong>
          <span>Turn this on when the interval is not uniform and you want to edit each waveguide length directly.</span>
        </div>
      </label>
      <div className="waveguide-preview-card">
        <strong>Processed waveguide length</strong>
        <span>{formatWaveguideLengthPreview(lengths)}</span>
      </div>
      {manualMode ? (
        <div className="propagation-length-grid">
          {Object.keys(lengths || {}).map((key) => (
            <label key={key} className="mapping-field">
              <span>{`WG${key} length (mm)`}</span>
              <input type="number" value={lengths?.[key] ?? ""} onChange={(event) => onLengthChange(key, event.target.value)} />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WafermapsLibrary({ draft, onDraftChange, onSaveTemplate, templates, selectedTemplateId, onUseTemplate, onDeleteTemplate }) {
  const previewTemplate = createCenterFilledWaferTemplate(draft);

  return (
    <section className="library-stack">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Wafermaps</h2>
            <p>Create reusable wafermap templates for different chip sizes and chip populations. Chips are filled from the centre of a fixed 8-inch wafer outline for a uniform layout.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={onSaveTemplate}>Generate And Save Template</button>
          </div>
        </div>
        <div className="settings-grid settings-grid-extended">
          <label className="mapping-field"><span>Wafer Name</span><input value={draft.name} onChange={(event) => onDraftChange("name", event.target.value)} /></label>
          <label className="mapping-field"><span>Rows</span><input type="number" min="1" value={draft.rows} onChange={(event) => onDraftChange("rows", Math.max(Number(event.target.value) || 1, 1))} /></label>
          <label className="mapping-field"><span>Columns</span><input type="number" min="1" value={draft.columns} onChange={(event) => onDraftChange("columns", Math.max(Number(event.target.value) || 1, 1))} /></label>
          <label className="mapping-field"><span>Row Spacing</span><input type="number" value={draft.rowSpacing} onChange={(event) => onDraftChange("rowSpacing", Number(event.target.value) || 0)} /></label>
          <label className="mapping-field"><span>Column Spacing</span><input type="number" value={draft.columnSpacing} onChange={(event) => onDraftChange("columnSpacing", Number(event.target.value) || 0)} /></label>
          <label className="mapping-field"><span>Chip Length (X)</span><input type="number" min="0.1" value={draft.chipLengthX} onChange={(event) => onDraftChange("chipLengthX", Number(event.target.value) || 0.1)} /></label>
          <label className="mapping-field"><span>Chip Width (Y)</span><input type="number" min="0.1" value={draft.chipWidthY} onChange={(event) => onDraftChange("chipWidthY", Number(event.target.value) || 0.1)} /></label>
        </div>
        <div className="translator-metrics wafermap-template-summary">
          <div><strong>{previewTemplate.layout.length}</strong><span>Generated chips</span></div>
          <div><strong>{previewTemplate.rows} x {previewTemplate.columns}</strong><span>Grid envelope</span></div>
          <div><strong>{previewTemplate.notchOrientation}</strong><span>Notch orientation</span></div>
        </div>
      </article>
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Saved Wafermap Templates</h2>
            <p>Select the active template for the analysis views or keep custom templates ready for future wafers.</p>
          </div>
        </div>
        <LibraryTable
          columns={["Template", "Rows", "Columns", "Chips", "Status", "Actions"]}
          rows={templates.map((template) => (
            <tr key={template.id}>
              <td>{template.name}</td>
              <td>{template.rows || "--"}</td>
              <td>{template.columns || "--"}</td>
              <td>{template.layout?.length ?? 0}</td>
              <td>{template.id === selectedTemplateId ? "Active" : template.source === "built-in" ? "Built-in" : "Custom"}</td>
              <td className="library-table-actions">
                <button type="button" onClick={() => onUseTemplate(template)}>Use</button>
                {template.source === "custom" ? <button type="button" className="danger-action" onClick={() => onDeleteTemplate(template.id)}>Delete</button> : null}
              </td>
            </tr>
          ))}
          emptyMessage="No wafermap templates are available yet."
        />
      </article>
    </section>
  );
}

function PropagationSettingsPanel({ sourceMeta, onNumberChange, onLengthChange }) {
  return (
    <section className="analysis-card propagation-settings-card">
      <div className="analysis-card-head">
        <div>
          <h2>Propagation Processing Settings</h2>
          <p>Configure launch power, target wavelength, averaging window, fit-quality filtering, and the generated or manual WG length map used for automated WST traces.</p>
        </div>
      </div>
      <div className="propagation-settings-grid">
        <label className="mapping-field">
          <span>Laser output power (dBm)</span>
          <input type="number" value={sourceMeta.launchPowerDbm ?? ""} onChange={(event) => onNumberChange("launchPowerDbm", Number(event.target.value) || 0)} />
        </label>
        <label className="mapping-field">
          <span>Target wavelength (nm)</span>
          <input type="number" value={sourceMeta.propagationTargetWavelengthNm ?? ""} onChange={(event) => onNumberChange("propagationTargetWavelengthNm", Number(event.target.value) || 1550)} />
        </label>
        <label className="mapping-field">
          <span>Window (+/- nm)</span>
          <input type="number" value={sourceMeta.propagationWindowNm ?? ""} onChange={(event) => onNumberChange("propagationWindowNm", Math.max(Number(event.target.value) || 0, 0))} />
        </label>
        <label className="mapping-field">
          <span>Spectral interval (nm)</span>
          <input type="number" min="1" value={sourceMeta.propagationSpectralStepNm ?? ""} onChange={(event) => onNumberChange("propagationSpectralStepNm", Math.max(Number(event.target.value) || 1, 1))} />
        </label>
        <label className="mapping-field">
          <span>Fit MSE threshold</span>
          <input type="number" step="0.01" value={sourceMeta.propagationMseThreshold ?? ""} onChange={(event) => onNumberChange("propagationMseThreshold", Math.max(Number(event.target.value) || 0, 0))} />
        </label>
      </div>
      <WaveguideLengthConfigurator
        count={sourceMeta.propagationWaveguideCount}
        start={sourceMeta.propagationWaveguideStartMm}
        interval={sourceMeta.propagationWaveguideIntervalMm}
        manualMode={sourceMeta.propagationWaveguideManualMode}
        lengths={sourceMeta.waveguideLengthByIndex}
        onNumberChange={onNumberChange}
        onLengthChange={onLengthChange}
        onManualModeChange={(checked) => onNumberChange("propagationWaveguideManualMode", checked)}
      />
    </section>
  );
}

export default function App() {
  const initialSettings = useMemo(() => hydrateSettings(readStoredJson(STORAGE_KEYS.settings, {})), []);

  const [activeTab, setActiveTab] = useState("propagation");
  const [rawRows, setRawRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [sourceMeta, setSourceMeta] = useState(() => buildDefaultSourceMeta(initialSettings));
  const [statusMessage, setStatusMessage] = useState("Workspace ready. Load a project or upload measurement files to begin.");
  const [search, setSearch] = useState("");
  const [datasetPreviewMode, setDatasetPreviewMode] = useState("all-chips");
  const [selectedWaferMetric, setSelectedWaferMetric] = useState("propagation");
  const [selectedChip, setSelectedChip] = useState("");
  const [projectName, setProjectName] = useState("");
  const [waferName, setWaferName] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [savedProjects, setSavedProjects] = useState(() => readStoredJson(STORAGE_KEYS.projects, []));
  const [savedDatasets, setSavedDatasets] = useState(() => normalizeStoredDatasets(readStoredJson(STORAGE_KEYS.datasets, [])));
  const [savedWaferTemplates, setSavedWaferTemplates] = useState(() => readStoredJson(STORAGE_KEYS.waferTemplates, []));
  const [auditLog, setAuditLog] = useState(() => readStoredJson(STORAGE_KEYS.audit, []));
  const [appSettings, setAppSettings] = useState(initialSettings);
  const [settingsDraft, setSettingsDraft] = useState(initialSettings);
  const [waferTemplateDraft, setWaferTemplateDraft] = useState(DEFAULT_WAFER_TEMPLATE_DRAFT);
  const [loadingBundledId, setLoadingBundledId] = useState("");
  const [publishingDatasetId, setPublishingDatasetId] = useState("");
  const [remoteLibraryDatasets, setRemoteLibraryDatasets] = useState(() => BUNDLED_LIBRARY_DATASETS.map(normalizeLibraryDataset));
  const [remoteLibraryStatus, setRemoteLibraryStatus] = useState("GitHub measurement library ready. Refresh to pull the latest published folders.");
  const [githubConfig, setGithubConfig] = useState(() => ({ ...DEFAULT_GITHUB_CONFIG, ...readStoredJson(STORAGE_KEYS.github, {}) }));
  const [toastItems, setToastItems] = useState([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [waferMapDisplayMode, setWaferMapDisplayMode] = useState("all");
  const [waferMapOverlayMode, setWaferMapOverlayMode] = useState("none");

  const deferredSearch = useDeferredValue(search);
  const builtInWaferTemplates = useMemo(() => getBuiltInWaferTemplates(), []);
  const allWaferTemplates = useMemo(() => mergeWaferTemplates(builtInWaferTemplates, savedWaferTemplates), [builtInWaferTemplates, savedWaferTemplates]);
  const currentWaferTemplate = useMemo(() => {
    const selected = allWaferTemplates.find((template) => template.id === sourceMeta.waferTemplateId);
    if (selected) return selected;
    if (sourceMeta.waferTemplateLayout?.length) {
      return {
        id: sourceMeta.waferTemplateId || "active-template",
        name: sourceMeta.waferTemplateName || "Current Template",
        notchOrientation: sourceMeta.waferTemplateNotchOrientation || "south",
        layout: sourceMeta.waferTemplateLayout,
        source: "active"
      };
    }
    return allWaferTemplates[0] || builtInWaferTemplates[0];
  }, [allWaferTemplates, builtInWaferTemplates, sourceMeta.waferTemplateId, sourceMeta.waferTemplateLayout, sourceMeta.waferTemplateName, sourceMeta.waferTemplateNotchOrientation]);
  const waferTemplateLayout = useMemo(() => getWaferTemplateLayout(currentWaferTemplate || defaultWaferTemplateId()), [currentWaferTemplate]);
  const hasLoadedData = rawRows.length > 0;
  const currentRows = rawRows;
  const currentMap = Object.keys(columnMap).length ? columnMap : inferColumnMap(Object.keys(currentRows[0] || {}));
  const normalizedRows = useMemo(() => buildNormalizedRows(currentRows, currentMap, sourceMeta), [currentRows, currentMap, sourceMeta]);
  const metrics = useMemo(
    () =>
      calculateAllMetrics(normalizedRows, {
        propagation: {
          targetWavelengthNm: sourceMeta.propagationTargetWavelengthNm,
          windowNm: sourceMeta.propagationWindowNm,
          spectralStepNm: sourceMeta.propagationSpectralStepNm,
          mseThreshold: sourceMeta.propagationMseThreshold
        }
      }),
    [normalizedRows, sourceMeta]
  );
  const datasetSummary = useMemo(() => summarizeDataset(normalizedRows), [normalizedRows]);
  const reportState = useMemo(() => buildReportState(metrics, datasetSummary), [metrics, datasetSummary]);
  const propagationAllWaferCells = useMemo(
    () => metrics.propagation.byChip
      .filter((item) => item.lossDbPerCm !== null && item.lossDbPerCm !== undefined)
      .map((item) => ({
        chipId: item.chipId,
        dieX: item.dieX,
        dieY: item.dieY,
        value: item.lossDbPerCm,
        detail: item.passMse
          ? `${item.lossDbPerCm.toFixed(2)} dB/cm @ ${sourceMeta.propagationTargetWavelengthNm} +/- ${sourceMeta.propagationWindowNm} nm`
          : `${item.lossDbPerCm.toFixed(2)} dB/cm (fit above MSE threshold)`
      })),
    [metrics.propagation.byChip, sourceMeta.propagationTargetWavelengthNm, sourceMeta.propagationWindowNm]
  );
  const insertionByChip = useMemo(
    () => metrics.insertion.waferMetric.map((cell) => {
      const blocks = metrics.insertion.byBlock.filter((item) => item.chipId === cell.chipId);
      return {
        chipId: cell.chipId,
        dieX: cell.dieX,
        dieY: cell.dieY,
        insertionLossDb: cell.value,
        blockCount: blocks.length,
        blockNames: blocks.map((block) => block.blockName)
      };
    }),
    [metrics.insertion.byBlock, metrics.insertion.waferMetric]
  );
  const currentWaferCells = useMemo(() => {
    const metricCells = selectedWaferMetric === "propagation"
      ? (waferMapDisplayMode === "passing" ? metrics.propagation.waferMetric : propagationAllWaferCells)
      : metrics[selectedWaferMetric].waferMetric;
    const metricLookup = new Map(metricCells.map((cell) => [cell.chipId, cell]));

    return waferTemplateLayout.map((slot) => {
      const metricCell = metricLookup.get(slot.chipId);
      return {
        chipId: slot.chipId,
        dieX: slot.dieX,
        dieY: slot.dieY,
        value: metricCell?.value ?? null,
        detail: metricCell?.detail ?? "No measurement loaded for this chip.",
        hasMeasurement: metricCell?.value !== null && metricCell?.value !== undefined
      };
    });
  }, [metrics, propagationAllWaferCells, selectedWaferMetric, waferMapDisplayMode, waferTemplateLayout]);
  const propagationLead = metrics.propagation.byChip.find((item) => item.chipId === selectedChip) || metrics.propagation.byChip[0] || null;
  const insertionLead = insertionByChip.find((item) => item.chipId === selectedChip) || insertionByChip[0] || null;
  const heaterLead = metrics.heater.byChip.find((item) => item.chipId === selectedChip) || metrics.heater.byChip[0] || null;
  const selectedMetricDetail = selectedWaferMetric === "heater" ? heaterLead : selectedWaferMetric === "insertion" ? insertionLead : propagationLead;
  const propagationMean = average(metrics.propagation.byChip.map((item) => item.lossDbPerCm).filter((value) => value !== null));
  const insertionMean = average(metrics.insertion.byBlock.map((item) => item.insertionLossDb));
  const heaterMean = average(metrics.heater.byChip.map((item) => item.efficiencyMwPerPi));
  const propagationYield = metrics.propagation.passRate;
  const matchedDevices = Math.max(datasetSummary.rows - 2, 0);
  const unmatchedDevices = datasetSummary.rows - matchedDevices;
  const isWorkspaceTab = APP_TABS.some((tab) => tab.id === activeTab);
  const railAvatar = useMemo(() => initialsFromName(appSettings.operatorName), [appSettings.operatorName]);
  const filteredRows = useMemo(() => {
    if (deferredSearch.trim()) {
      return normalizedRows.filter((row) => JSON.stringify(row).toLowerCase().includes(deferredSearch.toLowerCase())).slice(0, DATASET_PREVIEW_LIMIT);
    }

    if (datasetPreviewMode === "selected-chip") {
      return normalizedRows.filter((row) => row.chip_id === selectedChip).slice(0, DATASET_PREVIEW_LIMIT);
    }

    return buildCrossChipSample(normalizedRows, DATASET_PREVIEW_LIMIT);
  }, [normalizedRows, deferredSearch, datasetPreviewMode, selectedChip]);
  const primaryMetric = activeTab === "heater"
    ? { key: "heater", value: heaterMean, title: "Mean Heater Efficiency", icon: "Thermal" }
    : activeTab === "insertion"
      ? { key: "insertion", value: insertionMean, title: "Mean Insertion Loss", icon: "Blocks" }
      : { key: "propagation", value: propagationMean, title: "Mean Propagation Loss", icon: "Trend" };
  const secondaryMetric = activeTab === "heater"
    ? { label: "Heater Chips", value: metrics.heater.byChip.length.toLocaleString(), note: "Dies with heater-efficiency estimates", icon: "Heater" }
    : activeTab === "insertion"
      ? { label: "Building Blocks", value: metrics.insertion.byBlock.length.toLocaleString(), note: "Insertion-loss block averages extracted", icon: "Blocks" }
      : { label: "Fit R2", value: propagationLead?.mse !== null && propagationLead?.mse !== undefined ? (1 - propagationLead.mse).toFixed(3) : "--", note: "Selected wavelength-window fit quality", icon: "Fit" };
  const activeMetricItems = activeTab === "heater"
    ? metrics.heater.byChip
    : activeTab === "insertion"
      ? insertionByChip
      : metrics.propagation.byChip;
  const activeMetricKey = activeTab === "heater" ? "heater" : activeTab === "insertion" ? "insertion" : "propagation";
  const activeMetricDetail = activeMetricKey === "heater" ? heaterLead : activeMetricKey === "insertion" ? insertionLead : propagationLead;
  const chipOptions = uniqueOptions(metrics.propagation.byChip.map((item) => item.chipId));
  const legendItems = activeMetricKey === "propagation"
    ? (sourceMeta.type.includes("Automated")
      ? [
          { label: "Window-averaged loss points", color: "#4f8df3" },
          { label: "Linear fit", color: "#0f8a83" }
        ]
      : [
          { label: "TXT (Tester)", color: "#4f8df3" },
          { label: "XLSX (Manual)", color: "#ff8f45" },
          { label: "Combined Fit", color: "#0f8a83" }
        ])
    : [
        { label: activeMetricKey === "insertion" ? "Chip-average insertion loss" : "Chip-average heater efficiency", color: activeMetricKey === "insertion" ? "#4f8df3" : "#c87736" },
        { label: "Selectable die inspector", color: "#0f8a83" }
      ];

  useEffect(() => persistStoredJson(STORAGE_KEYS.projects, savedProjects), [savedProjects]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.datasets, savedDatasets), [savedDatasets]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.audit, auditLog), [auditLog]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.settings, appSettings), [appSettings]);
  useEffect(() => setSettingsDraft(appSettings), [appSettings]);
  useEffect(() => {
    if (chipOptions.length && !chipOptions.includes(selectedChip)) {
      setSelectedChip(chipOptions[0]);
    }
  }, [chipOptions, selectedChip]);

  function appendAudit(kind, title, detail) {
    setAuditLog((previous) => [{ id: createId("audit"), kind, title, detail, timestamp: new Date().toISOString() }, ...previous].slice(0, 120));
  }
  function pushToast(title, message, tone = "info") {
    const id = createId("toast");
    setToastItems((previous) => [...previous, { id, title, message, tone }].slice(-4));
    window.setTimeout(() => {
      setToastItems((previous) => previous.filter((item) => item.id !== id));
    }, 3200);
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
    const snapshotRows = nextRows;
    const snapshotSummary = summarizeDataset(buildNormalizedRows(snapshotRows, nextMap, nextSourceMeta));
    const baseSnapshot = { id: createId("dataset"), label: sourceLabel, projectName: nextProjectName, waferName: nextWaferName, selectedDate: nextDate, rawRows: snapshotRows, columnMap: nextMap, sourceMeta: nextSourceMeta, summary: snapshotSummary, autoSaved, savedAt: new Date().toISOString() };
    const display = buildDatasetSnapshotMetadata(baseSnapshot);
    const snapshot = { ...baseSnapshot, label: display.label, display, githubSync: { status: "local" } };
    setSavedDatasets((previous) => [snapshot, ...previous].slice(0, 40));
    return snapshot;
  }
  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || isUploadingFiles) return;
    setIsUploadingFiles(true);
    try {
      const rows = await readFilesInBatches(
        files,
        (file) => readFileRows(file, {
          launchPowerDbm: sourceMeta.launchPowerDbm,
          defaultMetricFamily: sourceMeta.defaultMetricFamily,
          defaultWavelengthNm: sourceMeta.defaultWavelengthNm
        }),
        UPLOAD_BATCH_SIZE,
        (completed, total) => {
          setStatusMessage(`Reading measurement files... ${completed}/${total} processed.`);
        }
      );
      if (!rows.length) {
        setStatusMessage("The selected files did not contain readable measurement rows.");
        appendAudit("upload", "Upload failed", `The uploaded selection (${files.map((file) => file.name).join(", ")}) did not produce readable rows.`);
        return;
      }
      const firstType = sourceTypeLabel(files[0].name);
      const sharedType = files.every((file) => sourceTypeLabel(file.name) === firstType)
        ? (files.length > 1 && firstType === "Automated WST trace" ? "Automated WST trace set" : firstType)
        : "Mixed measurement upload";
      const inferredMap = inferColumnMap(Object.keys(rows[0] || {}));
      const nextSourceMeta = { ...sourceMeta, name: files.length === 1 ? files[0].name : `${files.length} measurement files`, type: sharedType };
      setRawRows(rows);
      setColumnMap(inferredMap);
      setSourceMeta(nextSourceMeta);
      setStatusMessage(files.length === 1 ? `Loaded ${rows.length} rows from ${files[0].name}.` : `Loaded ${rows.length} rows from ${files.length} uploaded measurement files.`);
      appendAudit("upload", "Measurement file uploaded", `Loaded ${rows.length} rows from ${files.length} file(s) as ${sharedType}.`);
      pushToast("Files loaded", files.length === 1 ? `${files[0].name} loaded successfully.` : `${files.length} measurement files loaded.`, "success");
      if (appSettings.autoSaveUploads) {
        const snapshotCapacity = evaluateLocalSnapshotCapacity(rows, nextSourceMeta);
        if (snapshotCapacity.ok) {
          rememberDatasetSnapshot(true, rows, inferredMap, nextSourceMeta, nextSourceMeta.name);
          appendAudit("dataset", "Dataset auto-saved", `Saved ${nextSourceMeta.name} into the local dataset library automatically.`);
        } else {
          const detail = `Loaded ${nextSourceMeta.name}, but skipped browser auto-save because the dataset is too large for reliable local storage. ${snapshotCapacity.reason}`;
          setStatusMessage(detail);
          appendAudit("dataset", "Dataset auto-save skipped", detail);
          pushToast("Auto-save skipped", "Large uploads stay in the workspace, but are not auto-saved to browser storage.", "progress");
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown upload error.";
      setStatusMessage(`Upload failed: ${detail}`);
      appendAudit("upload", "Upload failed", detail);
      pushToast("Upload failed", detail, "danger");
    } finally {
      setIsUploadingFiles(false);
      if (event.target) event.target.value = "";
    }
  }
  function clearWorkspace() {
    setProjectName(""); setWaferName(""); setSelectedDate(""); setRawRows([]); setColumnMap({}); setSelectedChip("");
    setSourceMeta(buildDefaultSourceMeta(appSettings));
    setStatusMessage("Workspace cleared. Upload a measurement set or load a saved project to begin.");
    setActiveTab("propagation");
    appendAudit("workspace", "Workspace cleared", "Cleared the current wafer analysis workspace.");
  }
  async function loadBundledDataset(definition, libraryKind = "dataset") {
    setLoadingBundledId(definition.id);
    try {
      const fileNames = definition.files?.length ? definition.files : bundledTraceNames(definition);
      const rowSets = await Promise.all(
        fileNames.map(async (fileName) => {
          const response = await fetch(bundledAssetUrl(`${definition.folder}/${fileName}`));
          if (!response.ok) {
            throw new Error(`Unable to fetch ${fileName}`);
          }
          const text = await response.text();
          return readNamedTextRows(fileName, text, {
            launchPowerDbm: appSettings.launchPowerDbm,
            defaultMetricFamily: appSettings.defaultMetricFamily,
            defaultWavelengthNm: appSettings.defaultWavelengthNm
          });
        })
      );
      const rows = rowSets.flat();
      const nextSourceMeta = {
        ...buildDefaultSourceMeta(appSettings),
        name: definition.label,
        type: definition.sourceType
      };
      const inferredMap = inferColumnMap(Object.keys(rows[0] || {}));
      setProjectName(definition.projectName);
      setWaferName(definition.waferName);
      setSelectedDate(definition.selectedDate);
      setRawRows(rows);
      setColumnMap(inferredMap);
      setSourceMeta(nextSourceMeta);
      setSelectedWaferMetric("propagation");
      setSelectedChip(rows[0]?.chip_id || "");
      setActiveTab("propagation");
      setStatusMessage(`Loaded bundled sample ${definition.label} from GitHub-hosted files (${fileNames.length} traces).`);
      pushToast("Dataset loaded", `${definition.label} loaded from the GitHub measurement library.`, "success");
      appendAudit("dataset", "Bundled dataset loaded", `Loaded ${definition.label} from bundled GitHub-hosted files.`);
      if (libraryKind === "project") {
        appendAudit("project", "Bundled project loaded", `Opened ${definition.projectName} from the bundled sample library.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setStatusMessage(`Bundled sample load failed: ${detail}`);
      appendAudit("dataset", "Bundled dataset load failed", `Failed to load ${definition.label}: ${detail}`);
    } finally {
      setLoadingBundledId("");
    }
  }
  function updatePropagationMeta(field, value) {
    setSourceMeta((previous) => applyWaveguideSettingsToSourceMeta(previous, { [field]: value }));
  }
  function updateWaveguideLength(index, value) {
    setSourceMeta((previous) => applyWaveguideSettingsToSourceMeta(previous, {
      propagationWaveguideManualMode: true,
      waveguideLengthByIndex: {
        ...cloneWaveguideLengthMap(
          previous.waveguideLengthByIndex,
          previous.propagationWaveguideCount,
          previous.propagationWaveguideStartMm,
          previous.propagationWaveguideIntervalMm,
          true
        ),
        [index]: value === "" ? null : Number(value)
      }
    }));
  }
  function updateWaferTemplateDraft(field, value) { setWaferTemplateDraft((previous) => ({ ...previous, [field]: value })); }
  function useWaferTemplate(template) {
    setSourceMeta((previous) => ({
      ...previous,
      waferTemplateId: template.id,
      waferTemplateName: template.name,
      waferTemplateLayout: template.layout || null,
      waferTemplateNotchOrientation: template.notchOrientation || "south"
    }));
    setWaferTemplateDraft({
      id: template.source === "custom" ? template.id : "",
      name: template.name || DEFAULT_WAFER_TEMPLATE_DRAFT.name,
      rows: template.rows || DEFAULT_WAFER_TEMPLATE_DRAFT.rows,
      columns: template.columns || DEFAULT_WAFER_TEMPLATE_DRAFT.columns,
      rowSpacing: template.rowSpacing || DEFAULT_WAFER_TEMPLATE_DRAFT.rowSpacing,
      columnSpacing: template.columnSpacing || DEFAULT_WAFER_TEMPLATE_DRAFT.columnSpacing,
      chipLengthX: template.chipLengthX || DEFAULT_WAFER_TEMPLATE_DRAFT.chipLengthX,
      chipWidthY: template.chipWidthY || DEFAULT_WAFER_TEMPLATE_DRAFT.chipWidthY,
      notchOrientation: template.notchOrientation || "south"
    });
    setStatusMessage(`Using wafermap template ${template.name}.`);
  }
  function saveWaferTemplate() {
    const nextTemplate = createCenterFilledWaferTemplate({
      ...waferTemplateDraft,
      id: waferTemplateDraft.id || createId("wafermap"),
      source: "custom"
    });
    setSavedWaferTemplates((previous) => [nextTemplate, ...previous.filter((template) => template.id !== nextTemplate.id)].slice(0, 40));
    useWaferTemplate(nextTemplate);
    setWaferTemplateDraft({ ...waferTemplateDraft, id: nextTemplate.id, name: nextTemplate.name });
    appendAudit("wafermap", "Wafermap template saved", `Saved wafermap template ${nextTemplate.name} with ${nextTemplate.layout.length} generated chip slots.`);
  }
  function deleteWaferTemplate(templateId) {
    const target = savedWaferTemplates.find((template) => template.id === templateId);
    setSavedWaferTemplates((previous) => previous.filter((template) => template.id !== templateId));
    if (sourceMeta.waferTemplateId === templateId) {
      const fallback = builtInWaferTemplates[0];
      useWaferTemplate(fallback);
    }
    appendAudit("wafermap", "Wafermap template deleted", `Deleted wafermap template ${target?.name || templateId}.`);
  }
  function downloadBlob(content, fileName, mimeType) { const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url); }
  function exportNormalizedCsv() { downloadBlob(normalizedRowsToCsv(normalizedRows), "normalized-wafer-measurements.csv", "text/csv;charset=utf-8"); appendAudit("export", "Normalized CSV exported", `Exported ${normalizedRows.length} normalized rows to CSV.`); }
  function exportReportJson() {
    const safeWafer = waferName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "wafer";
    const reportTitle = `Wafer Report - ${waferName}`;
    downloadBlob(JSON.stringify(reportState, null, 2), `${safeWafer}-report-summary.json`, "application/json");
    downloadBlob(buildHtmlReport(reportState, reportTitle), `${safeWafer}-report-summary.html`, "text/html;charset=utf-8");
    appendAudit("export", "Report summary exported", `Exported HTML and JSON reports for ${waferName}.`);
  }
  function saveCurrentProject() { const snapshotCapacity = evaluateLocalSnapshotCapacity(currentRows, sourceMeta); if (!snapshotCapacity.ok) { const detail = `Project save skipped. ${snapshotCapacity.reason}`; setStatusMessage(detail); appendAudit("project", "Project save skipped", detail); pushToast("Project save skipped", "This workspace is too large for reliable browser storage.", "progress"); return; } const projectRecord = { id: createId("project"), projectName, waferName, selectedDate, activeTab: isWorkspaceTab ? activeTab : "propagation", selectedWaferMetric, selectedChip, rawRows: currentRows, columnMap: currentMap, sourceMeta, summary: datasetSummary, savedAt: new Date().toISOString() }; setSavedProjects((previous) => [projectRecord, ...previous].slice(0, 30)); appendAudit("project", "Project saved", `Saved project ${projectName} for wafer ${waferName}.`); setStatusMessage(`Saved project ${projectName}. You can reopen it later from the Projects section.`); }
  function loadProject(project) { setProjectName(project.projectName); setWaferName(project.waferName); setSelectedDate(project.selectedDate); setRawRows(project.rawRows || []); setColumnMap(project.columnMap || {}); setSourceMeta(project.sourceMeta || buildDefaultSourceMeta(appSettings)); setSelectedWaferMetric(project.selectedWaferMetric || "propagation"); setSelectedChip(project.selectedChip || ""); setActiveTab(project.activeTab || "propagation"); setStatusMessage(`Loaded project ${project.projectName} from local browser storage.`); appendAudit("project", "Project loaded", `Loaded project ${project.projectName} for wafer ${project.waferName}.`); }
  function deleteProject(projectId) { const target = savedProjects.find((project) => project.id === projectId); setSavedProjects((previous) => previous.filter((project) => project.id !== projectId)); appendAudit("project", "Project deleted", `Deleted saved project ${target?.projectName || projectId}.`); }
  function saveCurrentDataset(autoSaved = false) { const snapshotCapacity = evaluateLocalSnapshotCapacity(currentRows, sourceMeta); if (!snapshotCapacity.ok) { const detail = `Dataset save skipped. ${snapshotCapacity.reason}`; setStatusMessage(detail); appendAudit("dataset", autoSaved ? "Dataset auto-save skipped" : "Dataset save skipped", detail); pushToast(autoSaved ? "Auto-save skipped" : "Dataset save skipped", "This dataset is too large for reliable browser storage.", "progress"); return; } const snapshot = rememberDatasetSnapshot(autoSaved, currentRows, currentMap, sourceMeta, sourceMeta.name); appendAudit("dataset", autoSaved ? "Dataset auto-saved" : "Dataset saved", `Stored dataset ${snapshot.label} with ${snapshot.summary.rows} normalized rows.`); setStatusMessage(`Saved dataset snapshot ${snapshot.label} to the local library.`); }
  function loadDataset(dataset) { setProjectName(dataset.projectName || projectName); setWaferName(dataset.waferName || waferName); setSelectedDate(dataset.selectedDate || selectedDate); setRawRows(dataset.rawRows || []); setColumnMap(dataset.columnMap || {}); setSourceMeta(dataset.sourceMeta || buildDefaultSourceMeta(appSettings)); setActiveTab("propagation"); setSelectedWaferMetric("propagation"); setStatusMessage(`Loaded dataset snapshot ${dataset.label} from the local browser library.`); appendAudit("dataset", "Dataset loaded", `Loaded dataset ${dataset.label} for project ${dataset.projectName}.`); }
  function deleteDataset(datasetId) { const target = savedDatasets.find((dataset) => dataset.id === datasetId); setSavedDatasets((previous) => previous.filter((dataset) => dataset.id !== datasetId)); appendAudit("dataset", "Dataset deleted", `Deleted dataset snapshot ${target?.label || datasetId}.`); }
  function updateGithubConfig(field, value) { setGithubConfig((previous) => ({ ...previous, [field]: value })); }
  function saveGithubConfig() { persistStoredJson(STORAGE_KEYS.github, githubConfig); setStatusMessage(`Saved GitHub sync settings for ${githubConfig.owner}/${githubConfig.repo} on ${githubConfig.branch}.`); appendAudit("github", "GitHub settings saved", `Saved GitHub dataset sync settings for ${githubConfig.owner}/${githubConfig.repo}.`); pushToast("GitHub settings saved", `${githubConfig.owner}/${githubConfig.repo} stored in this browser.`, "success"); }
  async function refreshRemoteLibrary(silent = false) {
    setRemoteLibraryStatus("Refreshing GitHub measurement library...");
    try {
      const response = await fetch(bundledAssetUrl("sample-data/wst/library-index.json"), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      const normalized = Array.isArray(catalog) ? catalog.map(normalizeLibraryDataset) : [];
      setRemoteLibraryDatasets(normalized.length ? normalized : BUNDLED_LIBRARY_DATASETS.map(normalizeLibraryDataset));
      setRemoteLibraryStatus(`GitHub measurement library refreshed. ${normalized.length} dataset folder(s) are currently published.`);
      if (!silent) pushToast("Library refreshed", `${normalized.length} GitHub measurement dataset${normalized.length === 1 ? "" : "s"} ready.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setRemoteLibraryDatasets(BUNDLED_LIBRARY_DATASETS.map(normalizeLibraryDataset));
      setRemoteLibraryStatus(`Could not refresh the GitHub library, so the app is using the bundled fallback set. ${detail}`);
      if (!silent) pushToast("Library refresh failed", detail, "danger");
    }
  }
  async function publishDatasetToGithub(dataset) {
    if (!githubConfig.token) {
      const message = "Add a fine-grained GitHub token in the Datasets tab before publishing measurement data.";
      setStatusMessage(message);
      pushToast("GitHub token required", message, "danger");
      return;
    }
    if (!dataset?.rawRows?.length) {
      const message = "This dataset has no raw rows available for GitHub publishing.";
      setStatusMessage(message);
      pushToast("Publish skipped", message, "danger");
      return;
    }
    setPublishingDatasetId(dataset.id);
    setSavedDatasets((previous) => previous.map((item) => item.id === dataset.id ? { ...item, githubSync: { status: "publishing" } } : item));
    const packageData = buildGithubDatasetPackage(dataset);
    setStatusMessage(`Publishing ${packageData.identity.label} to GitHub...`);
    pushToast("GitHub publish started", `Preparing ${packageData.traceFiles.length} trace file(s) and README.md.`, "progress");
    try {
      const result = await publishDatasetPackageToGithub({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        branch: githubConfig.branch,
        token: githubConfig.token,
        manifestPath: GITHUB_LIBRARY_MANIFEST_PATH,
        mirrorManifestPath: GITHUB_LIBRARY_MANIFEST_MIRROR_PATH,
        packageData,
        existingManifest: remoteLibraryDatasets,
        onProgress: ({ completed, total, path }) => {
          setRemoteLibraryStatus(`Publishing to GitHub: ${completed}/${total} files processed. Latest: ${path}`);
        }
      });
      setRemoteLibraryDatasets(result.manifest.map(normalizeLibraryDataset));
      setSavedDatasets((previous) => previous.map((item) => item.id === dataset.id ? { ...item, githubSync: { status: "published", publishedAt: new Date().toISOString(), folderUrl: result.folderUrl } } : item));
      setStatusMessage(`Saved ${packageData.identity.label} to GitHub successfully.`);
      setRemoteLibraryStatus(`GitHub publish complete. ${packageData.identity.folderName} is now in the shared measurement-data library.`);
      appendAudit("github", "Dataset published to GitHub", `Published ${packageData.identity.label} into ${githubConfig.owner}/${githubConfig.repo}.`);
      pushToast("GitHub publish successful", `${packageData.identity.label} was committed to the repository.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setSavedDatasets((previous) => previous.map((item) => item.id === dataset.id ? { ...item, githubSync: { status: "failed", detail } } : item));
      setStatusMessage(`GitHub publish failed: ${detail}`);
      setRemoteLibraryStatus(`GitHub publish failed. ${detail}`);
      appendAudit("github", "Dataset publish failed", `Failed to publish ${dataset.label}: ${detail}`);
      pushToast("GitHub publish failed", detail, "danger");
    } finally {
      setPublishingDatasetId("");
    }
  }
  useEffect(() => {
    refreshRemoteLibrary(true);
  }, []);
  function updateSettingsDraft(field, value) { setSettingsDraft((previous) => applyWaveguideSettingsToDraft(previous, { [field]: value })); }
  function updateSettingsWaveguideLength(index, value) {
    setSettingsDraft((previous) => applyWaveguideSettingsToDraft(previous, {
      propagationWaveguideManualMode: true,
      propagationWaveguideLengthsMm: {
        ...cloneWaveguideLengthMap(
          previous.propagationWaveguideLengthsMm,
          previous.propagationWaveguideCount,
          previous.propagationWaveguideStartMm,
          previous.propagationWaveguideIntervalMm,
          true
        ),
        [index]: value === "" ? null : Number(value)
      }
    }));
  }
  function saveSettings() { const nextSettings = hydrateSettings(settingsDraft); setAppSettings(nextSettings); setSourceMeta((previous) => applyWaveguideSettingsToSourceMeta({ ...previous, defaultMetricFamily: nextSettings.defaultMetricFamily, defaultWavelengthNm: nextSettings.defaultWavelengthNm, launchPowerDbm: nextSettings.launchPowerDbm, propagationTargetWavelengthNm: nextSettings.propagationTargetWavelengthNm, propagationWindowNm: nextSettings.propagationWindowNm, propagationSpectralStepNm: nextSettings.propagationSpectralStepNm, propagationMseThreshold: nextSettings.propagationMseThreshold, propagationWaveguideCount: nextSettings.propagationWaveguideCount, propagationWaveguideStartMm: nextSettings.propagationWaveguideStartMm, propagationWaveguideIntervalMm: nextSettings.propagationWaveguideIntervalMm, propagationWaveguideManualMode: nextSettings.propagationWaveguideManualMode, waveguideLengthByIndex: nextSettings.propagationWaveguideLengthsMm, waferTemplateId: previous.waferTemplateId || nextSettings.defaultWaferTemplateId }, {})); appendAudit("settings", "Settings saved", `Updated defaults for operator ${nextSettings.operatorName}, launch power ${nextSettings.launchPowerDbm} dBm, wavelength ${nextSettings.propagationTargetWavelengthNm} nm, interval ${nextSettings.propagationSpectralStepNm} nm, and MSE threshold ${nextSettings.propagationMseThreshold}.`); setStatusMessage("Application settings saved in local browser storage."); }
  function resetSettings() { const reset = hydrateSettings(DEFAULT_SETTINGS); setSettingsDraft(reset); setAppSettings(reset); setSourceMeta(buildDefaultSourceMeta(reset)); appendAudit("settings", "Settings reset", "Restored the default application settings for operator, metric family, propagation window, and launch power."); setStatusMessage("Application settings were reset to the default values."); }
  function clearAuditLog() { setAuditLog([]); setStatusMessage("Audit log cleared from local browser storage."); }

  const projectOptions = uniqueOptions([projectName, ...savedProjects.map((project) => project.projectName)].filter(Boolean));
  const waferOptions = uniqueOptions([waferName, ...savedProjects.map((project) => project.waferName)].filter(Boolean));
  const dateOptions = uniqueOptions([selectedDate, ...savedProjects.map((project) => project.selectedDate)].filter(Boolean));
  const bundledProjectRows = remoteLibraryDatasets.map((definition) => (
    <tr key={`bundled-project-${definition.id}`}><td>{definition.projectName}</td><td>{definition.waferName}</td><td>{definition.label}</td><td>{`${definition.traceCount} raw traces`}</td><td>Bundled with app</td><td className="library-table-actions"><button type="button" onClick={() => loadBundledDataset(definition, "project")} disabled={loadingBundledId === definition.id}>{loadingBundledId === definition.id ? "Loading..." : "Load"}</button></td></tr>
  ));
  const currentProjectRows = savedProjects.map((project) => (
    <tr key={project.id}><td>{project.projectName}</td><td>{project.waferName}</td><td>{project.sourceMeta.name}</td><td>{project.summary.rows}</td><td>{formatSavedTime(project.savedAt)}</td><td className="library-table-actions"><button type="button" onClick={() => loadProject(project)}>Load</button><button type="button" className="danger-action" onClick={() => deleteProject(project.id)}>Delete</button></td></tr>
  ));
  const bundledDatasetRows = remoteLibraryDatasets.map((definition) => (
    <tr key={`bundled-dataset-${definition.id}`}><td>{definition.label}</td><td>{definition.projectName}</td><td>{definition.waferName}</td><td>{`${definition.traceCount} raw traces`}</td><td>Bundled with app</td><td className="library-table-actions"><button type="button" onClick={() => loadBundledDataset(definition, "dataset")} disabled={loadingBundledId === definition.id}>{loadingBundledId === definition.id ? "Loading..." : "Load"}</button></td></tr>
  ));
  const currentDatasetRows = normalizeStoredDatasets(savedDatasets).map((dataset) => ({
    ...dataset,
    display: dataset.display || buildDatasetSnapshotMetadata(dataset),
    savedDisplay: formatSavedTime(dataset.savedAt)
  }));
  const auditRows = auditLog.map((entry) => (
    <tr key={entry.id}><td>{entry.title}</td><td>{entry.kind}</td><td>{entry.detail}</td><td>{formatSavedTime(entry.timestamp)}</td></tr>
  ));

  return (
    <div className="dashboard-page">
      <ToastTray items={toastItems} />
      <div className="dashboard-shell">
        <aside className="dashboard-rail">
          <div className="brand-mark"><div className="brand-wafer" /></div>
          {RAIL_SECTIONS.map((section) => <SidebarSection key={section.title} section={section} activeTab={activeTab} onSelect={updateTab} />)}
          <div className="rail-user"><div className="rail-avatar">{railAvatar}</div><div><strong>{appSettings.operatorName}</strong><span>{appSettings.operatorRole}</span></div></div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div className="dashboard-title-block">
              <h1>Wafer Post-Processing Suite</h1>
              <p>Normalize txt and xlsx into one analysis pipeline</p>
            </div>
            <div className="dashboard-header-filters">
              <FilterField label="Project" value={projectName} onChange={setProjectName} options={projectOptions} />
              <FilterField label="Wafer" value={waferName} onChange={setWaferName} options={waferOptions} />
              <FilterField label="Date" value={selectedDate} onChange={setSelectedDate} options={dateOptions} icon="Cal" />
              <label className="upload-measurement-button"><input type="file" multiple accept=".txt,.csv,.xlsx,.xls" onChange={handleFileUpload} disabled={isUploadingFiles} /><span>{isUploadingFiles ? "Processing Files..." : "Upload Measurement Files"}</span></label>
            </div>
          </header>

          <nav className="analysis-tabs">
            {APP_TABS.map((tab) => <button key={tab.id} type="button" className={tab.id === activeTab ? "analysis-tab active" : "analysis-tab"} onClick={() => updateTab(tab.id)}>{tab.label}</button>)}
          </nav>

          {isWorkspaceTab ? <>
            <section className="hero-stats-row">
              <ShellStat label={primaryMetric.title} value={formatMetric(primaryMetric.key, primaryMetric.value)} note="Across all matched dies" tone="primary" icon={primaryMetric.icon} />
              <ShellStat label={secondaryMetric.label} value={secondaryMetric.value} note={secondaryMetric.note} tone="secondary" icon={secondaryMetric.icon} />
              <ShellStat label="Devices" value={datasetSummary.rows.toLocaleString()} note={`Across ${sourceCount(normalizedRows)} uploaded source files`} tone="mint" icon="Dev" />
              <ShellStat label="Wavelength" value={`${sourceMeta.propagationTargetWavelengthNm} nm`} note={`Window +/- ${sourceMeta.propagationWindowNm} nm`} tone="orange" icon="WL" />
              <ShellStat label="Sources" value={(sourceCount(normalizedRows) || (rawRows.length ? 1 : 0)).toString()} note={rawRows.length ? sourceMeta.type : "No source loaded"} tone="rose" icon="Src" />
              <ShellStat label="Wafer Yield" value={propagationYield !== null && propagationYield !== undefined ? `${propagationYield.toFixed(1)}%` : "--"} note={`Pass criteria: MSE <= ${sourceMeta.propagationMseThreshold}`} tone="yield" icon="Yield" />
            </section>

            {activeTab === "propagation" ? <PropagationSettingsPanel sourceMeta={sourceMeta} onNumberChange={updatePropagationMeta} onLengthChange={updateWaveguideLength} /> : null}

            <section className="analysis-top-grid">
              <article className="analysis-card analysis-chart-card">
                <div className="analysis-card-head">
                  <div>
                    <h2>{activeMetricKey === "heater" ? "Heater Efficiency" : activeMetricKey === "insertion" ? "Insertion Loss" : "Propagation Loss"}</h2>
                    <PlotLegend items={legendItems} />
                  </div>
                  <div className="analysis-card-controls propagation-headline-controls">
                    <span>{activeMetricKey === "propagation" ? `Lambda0 ${sourceMeta.propagationTargetWavelengthNm} nm` : `${activeMetricItems.length} selected dies`}</span>
                    <span>{activeMetricKey === "propagation" ? `Window +/- ${sourceMeta.propagationWindowNm} nm` : sourceMeta.type}</span>
                    <span>{activeMetricKey === "propagation" ? `MSE <= ${sourceMeta.propagationMseThreshold}` : `${datasetSummary.families.join(", ") || "single metric"}`}</span>{activeMetricKey === "propagation" ? <select value={selectedChip} onChange={(event) => setSelectedChip(event.target.value)}>{chipOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
                  </div>
                </div>
                <div className="analysis-card-body split-layout">
                  {activeMetricKey === "propagation" ? (
                    <InteractivePropagationPlot rows={propagationLead?.samples ?? []} fit={propagationLead?.fit ?? null} chipId={propagationLead?.chipId || selectedChip} />
                  ) : (
                    <MetricComparisonPlot
                      metricKey={activeMetricKey}
                      items={activeMetricItems}
                      selectedKey={selectedChip}
                      onSelect={setSelectedChip}
                      emptyMessage={activeMetricKey === "insertion" ? "Upload or load insertion-loss rows to compare building-block performance by chip." : "Upload or load heater measurements to compare pi-power performance by chip."}
                    />
                  )}
                  <MetricInspector metricKey={activeMetricKey} item={activeMetricDetail} sourceMeta={sourceMeta} />
                </div>
              </article>

              <article className="analysis-card analysis-wafer-card">
                <div className="analysis-card-head">
                  <div><h2>Wafermap - {metricLabel(selectedWaferMetric)}</h2></div>
                  <div className="analysis-card-controls compact"><span>Metric</span><select value={selectedWaferMetric} onChange={(event) => setSelectedWaferMetric(event.target.value)}><option value="propagation">Propagation Loss</option><option value="insertion">Insertion Loss</option><option value="heater">Heater Efficiency</option></select></div>
                </div>                <WaferMapPanel cells={currentWaferCells} metricKey={selectedWaferMetric} selectedChip={selectedChip} onSelect={setSelectedChip} overlayMode={waferMapOverlayMode} templateName={currentWaferTemplate?.name || ""} notchOrientation={currentWaferTemplate?.notchOrientation || "south"} colorScaleMin={sourceMeta.waferColorScaleMin} colorScaleMax={sourceMeta.waferColorScaleMax} />
                <div className="wafer-footer-bar"><div><span>Show</span><select value={waferMapDisplayMode} onChange={(event) => setWaferMapDisplayMode(event.target.value)} disabled={selectedWaferMetric !== "propagation"}><option value="all">All Dies</option><option value="passing">Passing only</option></select></div><div><span>Overlay</span><select value={waferMapOverlayMode} onChange={(event) => setWaferMapOverlayMode(event.target.value)}><option value="none">None</option><option value="chip">Chip ID</option><option value="value">Metric value</option></select></div><div><span>Template</span><select value={currentWaferTemplate?.id || defaultWaferTemplateId()} onChange={(event) => { const match = allWaferTemplates.find((template) => template.id === event.target.value); if (match) useWaferTemplate(match); }}><option value="">Select</option>{allWaferTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></div><div><span>Scale Min</span><input type="number" value={sourceMeta.waferColorScaleMin ?? ""} onChange={(event) => setSourceMeta((previous) => ({ ...previous, waferColorScaleMin: event.target.value === "" ? null : Number(event.target.value) }))} /></div><div><span>Scale Max</span><input type="number" value={sourceMeta.waferColorScaleMax ?? ""} onChange={(event) => setSourceMeta((previous) => ({ ...previous, waferColorScaleMax: event.target.value === "" ? null : Number(event.target.value) }))} /></div></div>
              </article>
            </section>

            {activeTab === "propagation" ? <>
              <MatlabSummaryPanel summary={reportState.matlabSummary} />
              <section className="analysis-spectrum-grid analysis-spectrum-grid-dual">
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>Propagation Loss Spectrum</h2>
                      <p>Interval-based linear fits across wavelength for the selected chip, showing propagation loss and MSE together for report-ready spectral diagnostics.</p>
                    </div>
                  </div>
                  <InteractivePropagationSpectrumPlot series={propagationLead?.spectralSeries ?? []} targetWavelengthNm={sourceMeta.propagationTargetWavelengthNm} windowNm={sourceMeta.propagationWindowNm} spectralStepNm={sourceMeta.propagationSpectralStepNm} chipId={propagationLead?.chipId || selectedChip} />
                </article>
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>Transmission Spectrum</h2>
                      <p>Overlay of all waveguide spectra for the selected chip, inspired by the MATLAB chip transmission figure set.</p>
                    </div>
                  </div>
                  <InteractiveTransmissionSpectrumPlot series={propagationLead?.transmissionSeries ?? []} targetWavelengthNm={sourceMeta.propagationTargetWavelengthNm} chipId={propagationLead?.chipId || selectedChip} />
                </article>
              </section>
            </> : null}

            <section className="analysis-bottom-grid">
              <article className="analysis-card wide-span">
                <div className="analysis-card-head"><div><h2>Normalized Dataset</h2><p>Unified CSV-ready rows from the shared translation layer.</p></div><div className="dataset-toolbar"><select value={datasetPreviewMode} onChange={(event) => setDatasetPreviewMode(event.target.value)}><option value="all-chips">All-chip sample</option><option value="selected-chip">Selected chip</option></select><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows, chips, or devices" /><button type="button" onClick={exportNormalizedCsv}>Export CSV</button></div></div>
                <div className="dashboard-table-wrap"><table><thead><tr><th>Device ID</th><th>Wafer</th><th>X</th><th>Y</th><th>Source</th><th>Rel. Length (mm)</th><th>Loss / Transmission (dB)</th><th>Propagation Loss</th><th>Wavelength</th></tr></thead><tbody>{filteredRows.map((row) => { const chipMetric = metrics.propagation.byChip.find((item) => item.chipId === row.chip_id); return <tr key={`${row.source_name}-${row.row_index}`}><td>{row.chip_id || row.waveguide_id || "--"}</td><td>{row.wafer_label || waferName}</td><td>{row.die_x ?? "--"}</td><td>{row.die_y ?? "--"}</td><td>{row.source_type.includes("excel") ? "XLSX" : row.source_type.includes("Automated") ? row.waveguide_id || "TXT trace" : row.source_type}</td><td>{row.relative_length_mm ?? "--"}</td><td>{measurementDisplay(row) ?? "--"}</td><td>{chipMetric?.lossDbPerCm !== null && chipMetric?.lossDbPerCm !== undefined ? chipMetric.lossDbPerCm.toFixed(2) : "--"}</td><td>{row.wavelength_nm ?? sourceMeta.defaultWavelengthNm}</td></tr>; })}</tbody></table></div>
              </article>
              <article className="analysis-card"><div className="analysis-card-head stacked"><div><h2>File Translator Status</h2><p>{statusMessage}</p></div></div><TranslationStatus sourceName={sourceMeta.name} sourceType={sourceMeta.type} totalRows={datasetSummary.rows} matchedDevices={matchedDevices} unmatchedDevices={unmatchedDevices} /><button type="button" className="secondary-action" onClick={() => updateTab("audit")}>Open Audit Log</button></article>
              <article className="analysis-card"><div className="analysis-card-head"><div><h2>Report Preview</h2><p>Export-ready representation of wafer quality.</p></div><button type="button" onClick={exportReportJson}>Open Report</button></div><ReportPreviewCard reportState={reportState} selectedMetricLabel={metricLabel(selectedWaferMetric)} onOpenReport={exportReportJson} /></article>
            </section>
</> : null}

          {activeTab === "projects" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Projects Workspace</h2><p>Save the current wafer analysis context so you can reopen the same project state later.</p></div><div className="library-action-row"><button type="button" onClick={saveCurrentProject}>Save Current Project</button><button type="button" className="ghost-action" onClick={() => updateTab("propagation")}>Back To Analysis</button></div></div><div className="translator-metrics"><div><strong>{projectName}</strong><span>Project</span></div><div><strong>{waferName}</strong><span>Wafer</span></div><div><strong>{datasetSummary.rows}</strong><span>Rows</span></div></div></article><article className="analysis-card"><div className="analysis-card-head"><div><h2>Saved Projects</h2><p>Stored locally in this browser.</p></div></div><LibraryTable columns={["Project", "Wafer", "Dataset", "Rows", "Saved", "Actions"]} rows={[...bundledProjectRows, ...currentProjectRows]} emptyMessage="No bundled or saved projects are available yet." /></article></section> : null}
          {activeTab === "datasets" ? <DatasetLibraryPanel sourceMeta={sourceMeta} appSettings={appSettings} currentDatasetMeta={currentRows.length ? buildDatasetSnapshotMetadata({ projectName, waferName, selectedDate, rawRows: currentRows, sourceMeta }) : null} statusMessage={statusMessage} githubConfig={githubConfig} onGithubConfigChange={updateGithubConfig} onSaveGithubConfig={saveGithubConfig} onRefreshLibrary={refreshRemoteLibrary} remoteLibraryStatus={remoteLibraryStatus} remoteDatasets={remoteLibraryDatasets} localDatasets={currentDatasetRows} onSaveCurrentDataset={saveCurrentDataset} onClearWorkspace={clearWorkspace} onLoadRemoteDataset={(dataset) => loadBundledDataset(dataset, "dataset")} onLoadLocalDataset={loadDataset} onDeleteLocalDataset={deleteDataset} onPublishLocalDataset={publishDatasetToGithub} loadingBundledId={loadingBundledId} publishingDatasetId={publishingDatasetId} /> : null}
          {activeTab === "manual-conversion" ? <ManualConversionPanel defaultLaunchPowerDbm={sourceMeta.launchPowerDbm ?? appSettings.launchPowerDbm} /> : null}
          {activeTab === "settings" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Settings</h2><p>Control persistent defaults for operator identity, wavelength assumptions, upload behavior, and automated propagation processing.</p></div><div className="library-action-row"><button type="button" onClick={saveSettings}>Save Settings</button><button type="button" className="ghost-action" onClick={resetSettings}>Reset Defaults</button></div></div><div className="settings-grid settings-grid-extended"><label className="mapping-field"><span>Operator name</span><input value={settingsDraft.operatorName} onChange={(event) => updateSettingsDraft("operatorName", event.target.value)} /></label><label className="mapping-field"><span>Operator role</span><input value={settingsDraft.operatorRole} onChange={(event) => updateSettingsDraft("operatorRole", event.target.value)} /></label><label className="mapping-field"><span>Default wavelength (nm)</span><input type="number" value={settingsDraft.defaultWavelengthNm} onChange={(event) => updateSettingsDraft("defaultWavelengthNm", Number(event.target.value) || 1550)} /></label><label className="mapping-field"><span>Default metric family</span><select value={settingsDraft.defaultMetricFamily} onChange={(event) => updateSettingsDraft("defaultMetricFamily", event.target.value)}>{DEFAULT_MAPPING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label className="mapping-field"><span>Laser output power (dBm)</span><input type="number" value={settingsDraft.launchPowerDbm} onChange={(event) => updateSettingsDraft("launchPowerDbm", Number(event.target.value) || 0)} /></label><label className="mapping-field"><span>Propagation target wavelength (nm)</span><input type="number" value={settingsDraft.propagationTargetWavelengthNm} onChange={(event) => updateSettingsDraft("propagationTargetWavelengthNm", Number(event.target.value) || 1550)} /></label><label className="mapping-field"><span>Propagation averaging window (+/- nm)</span><input type="number" value={settingsDraft.propagationWindowNm} onChange={(event) => updateSettingsDraft("propagationWindowNm", Math.max(Number(event.target.value) || 0, 0))} /></label><label className="mapping-field"><span>Propagation spectral interval (nm)</span><input type="number" min="1" value={settingsDraft.propagationSpectralStepNm} onChange={(event) => updateSettingsDraft("propagationSpectralStepNm", Math.max(Number(event.target.value) || 1, 1))} /></label><label className="mapping-field"><span>Propagation fit MSE threshold</span><input type="number" step="0.01" value={settingsDraft.propagationMseThreshold} onChange={(event) => updateSettingsDraft("propagationMseThreshold", Math.max(Number(event.target.value) || 0, 0))} /></label></div><WaveguideLengthConfigurator count={settingsDraft.propagationWaveguideCount} start={settingsDraft.propagationWaveguideStartMm} interval={settingsDraft.propagationWaveguideIntervalMm} manualMode={settingsDraft.propagationWaveguideManualMode} lengths={settingsDraft.propagationWaveguideLengthsMm} onNumberChange={updateSettingsDraft} onLengthChange={updateSettingsWaveguideLength} onManualModeChange={(checked) => updateSettingsDraft("propagationWaveguideManualMode", checked)} /><label className="toggle-row"><input type="checkbox" checked={settingsDraft.autoSaveUploads} onChange={(event) => updateSettingsDraft("autoSaveUploads", event.target.checked)} /><div><strong>Automatically save uploaded datasets</strong><span>Each new upload is stored as a reusable dataset snapshot in the local browser library.</span></div></label></article></section> : null}
          {activeTab === "wafermaps" ? <WafermapsLibrary draft={waferTemplateDraft} onDraftChange={updateWaferTemplateDraft} onSaveTemplate={saveWaferTemplate} templates={allWaferTemplates} selectedTemplateId={currentWaferTemplate?.id || ""} onUseTemplate={useWaferTemplate} onDeleteTemplate={deleteWaferTemplate} /> : null}
          {activeTab === "audit" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Audit Log</h2><p>Review the local activity trail for uploads, exports, saves, loads, and settings changes.</p></div><div className="library-action-row"><button type="button" className="ghost-action" onClick={clearAuditLog}>Clear Audit Log</button></div></div><LibraryTable columns={["Action", "Type", "Detail", "Time"]} rows={auditRows} emptyMessage="No audit entries yet." /></article></section> : null}
          {activeTab === "help" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Help Center</h2><p>Quick in-app guidance for the current release, focused on how data flows through propagation processing, storage, and reporting.</p></div><div className="library-action-row"><button type="button" onClick={() => updateTab("projects")}>Open Projects</button><button type="button" className="ghost-action" onClick={() => updateTab("propagation")}>Open Propagation View</button></div></div><div className="help-grid">{HELP_TOPICS.map((topic) => <article key={topic.title} className="help-card"><h3>{topic.title}</h3><p>{topic.body}</p></article>)}</div><div className="doc-link-list">{DOC_LINKS.map((doc) => <a key={doc.label} className="doc-link-item" href={doc.href} target="_blank" rel="noreferrer"><strong>{doc.label}</strong><span>{doc.path}</span></a>)}</div></article></section> : null}
        </main>
      </div>
    </div>
  );
}
































































