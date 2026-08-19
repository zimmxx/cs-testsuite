import { useEffect, useMemo, useState, startTransition } from "react";
import {
  buildHtmlReport,
  buildReportState,
  computeHeaterEfficiency,
  computeInsertionLoss,
  computePropagationLoss,
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
  readSpectrumFile,
  requiredColumns,
  sourceTypeLabel
} from "./lib/parsers";
import { createCenterFilledWaferTemplate, defaultWaferTemplateId, getBuiltInWaferTemplates, getWaferTemplateLayout, shortChipLabel } from "./lib/waferTemplates";
import {
  buildDatasetAnalyticsSummary,
  deletePublishedDatasetFromGithub,
  normalizeDatasetAnalyticsReview,
  buildDatasetSnapshotMetadata,
  buildGithubDatasetPackage,
  normalizeDatasetAnalyticsSummary,
  publishDatasetPackageToGithub,
  updatePublishedDatasetMetadataOnGithub
} from "./lib/githubLibrary";
import { getDatasetPresentation } from "./lib/datasetPresentation";
import { buildStandardDatasetBaseName } from "./lib/filenameStandardization";
import { parseHeaterMeasurementFiles } from "./lib/heaterMeasurement";
import { generatePostProcessedArchive } from "./lib/postProcessingExport";
import { buildWaferMapFigureModel, buildWaferMapPng, buildWaferMapSvgDocument, downloadBlob as downloadAssetBlob, openWaferMapFigureWindow } from "./lib/wafermapFigure";
import {
  InteractiveHeaterTuningPlot,
  InteractivePropagationPlot,
  InteractivePropagationSpectrumPlot,
  InteractiveSpectrumViewerPlot,
  InteractiveTransmissionSpectrumPlot
} from "./components/InteractivePlots";
import ManualConversionPanel from "./components/ManualConversionPanel";
import DatasetLibraryPanel from "./components/DatasetLibraryPanel";
import ComparisonLibraryPanel from "./components/ComparisonLibraryPanel";
import CdSemLibraryPanel from "./components/CdSemLibraryPanel";
import DatasetDashboardPanel from "./components/DatasetDashboardPanel";
import HeaterEfficiencyPanel from "./components/HeaterEfficiencyPanel";
import FilenameConversionPanel from "./components/FilenameConversionPanel";
import ReportGeneratorPanel from "./components/ReportGeneratorPanel";
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
      { id: "projects", label: "Workspace Snapshots" },
      { id: "datasets", label: "Dataset Snapshots" },
      { id: "manual-conversion", label: "Manual Conversion" },
      { id: "manual-conversion-advanced", label: "Manual Conversion (Advanced)" },
      { id: "comparison", label: "Comparison" },
      { id: "cd-sem", label: "CD-SEM Data" },
      { id: "dashboard", label: "Dashboard" },
      { id: "spectrum-viewer", label: "Spectrum Viewer" },
      { id: "spectrum-viewer-advanced", label: "Spectrum Viewer (Advanced)" },
      { id: "filename-conversion", label: "Filename Conversion" },
      { id: "wafermaps", label: "Wafermaps" },
      { id: "report-generator", label: "Report Generator" },
      { id: "settings", label: "Settings" },
      { id: "audit", label: "Audit Log" },
      { id: "help", label: "Help" }
    ]
  }
];

const DEFAULT_MAPPING_OPTIONS = ["propagation", "insertion", "heater"];
const DEFAULT_WAVEGUIDE_COUNT = 6;
const DEFAULT_WAVEGUIDE_START_MM = 0;
const DEFAULT_WAVEGUIDE_INTERVAL_MM = 4;
const UPLOAD_BATCH_SIZE = 8;
const BUNDLED_ANALYSIS_BATCH_SIZE = 4;
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
const PERSISTENCE_DB_NAME = "wps-persistence.v1";
const PERSISTENCE_DB_VERSION = 1;
const PERSISTENCE_STORE = "collections";
const PERSISTENCE_COLLECTION_KEYS = {
  projects: "projects",
  datasets: "datasets"
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
  themePreference: "system",
  defaultWavelengthNm: 1550,
  defaultMetricFamily: "propagation",
  autoSaveUploads: false,
  launchPowerDbm: 10,
  traceInputUnit: "watts",
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
const THEME_PREFERENCE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];
const HELP_TOPICS = [
  {
    title: "Projects",
    body: "Save the current workspace context, including wafer metadata, source file context, selected views, and translation settings."
  },
  {
    title: "Datasets",
    body: "Store dataset snapshots locally, review the generated naming, then publish the snapshot to GitHub when it looks correct."
  },
  {
    title: "Audit Log",
    body: "Tracks uploads, exports, saved projects, dataset loads, and settings changes to give a lightweight trace of post-processing actions."
  }
];
function resolveThemePreference(preference, prefersDark = false) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return prefersDark ? "dark" : "light";
}

const REPO_DOC_BASE = "https://github.com/zimmxx/cs-testsuite/blob/main/";
const GITHUB_LIBRARY_MANIFEST_PATH = "public/sample-data/wst/library-index.json";
const GITHUB_LIBRARY_MANIFEST_MIRROR_PATH = "sample-data/wst/library-index.json";
const GITHUB_LIBRARY_MANIFEST_V2_PATH = "public/sample-data/wst/library-index-v2.json";
const GITHUB_LIBRARY_MANIFEST_V2_MIRROR_PATH = "sample-data/wst/library-index-v2.json";
const GITHUB_LIBRARY_ANALYTICS_PATH = "public/sample-data/wst/library-analytics.json";
const GITHUB_LIBRARY_ANALYTICS_MIRROR_PATH = "sample-data/wst/library-analytics.json";
const DEFAULT_GITHUB_CONFIG = { owner: "zimmxx", repo: "cs-testsuite", branch: "main", token: "" };
const DOC_LINKS = [
  { label: "Project README", path: "README.md", href: `${REPO_DOC_BASE}README.md` },
  { label: "Local Git and GitHub Workflow", path: "docs/LOCAL_GIT_GITHUB_WORKFLOW.md", href: `${REPO_DOC_BASE}docs/LOCAL_GIT_GITHUB_WORKFLOW.md` },
  { label: "Feature Guide v0.3.1", path: "docs/releases/v0.3.1/FEATURES.md", href: `${REPO_DOC_BASE}docs/releases/v0.3.1/FEATURES.md` },
  { label: "Change Log v0.3.1", path: "docs/releases/v0.3.1/CHANGELOG.md", href: `${REPO_DOC_BASE}docs/releases/v0.3.1/CHANGELOG.md` },
  { label: "Suggested Next Updates", path: "docs/suggested_update.md", href: `${REPO_DOC_BASE}docs/suggested_update.md` },
  { label: "Dataset Filename Standard", path: "docs/DATASET_FILENAME_STANDARD.md", href: `${REPO_DOC_BASE}docs/DATASET_FILENAME_STANDARD.md` }
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
  const files = definition.files?.length ? definition.files : bundledTraceNames(definition);
  const display = getDatasetPresentation({ ...definition, files });
  return {
    ...definition,
    id: definition.id || definition.datasetId || definition.label,
    ...display,
    files,
    analyticsSummary: normalizeDatasetAnalyticsSummary(definition.analyticsSummary),
    analyticsReview: normalizeDatasetAnalyticsReview(definition.analyticsReview),
    source: definition.source || "github-library",
    librarySchemaVersion: definition.librarySchemaVersion || definition.schemaVersion || 1
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

function removeStoredJson(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function supportsIndexedDbPersistence() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openPersistenceDb() {
  if (!supportsIndexedDbPersistence()) {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PERSISTENCE_DB_NAME, PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PERSISTENCE_STORE)) {
        db.createObjectStore(PERSISTENCE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open persistence database."));
  });
}

async function readPersistentCollection(key, fallback) {
  if (!supportsIndexedDbPersistence()) return fallback;
  const db = await openPersistenceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PERSISTENCE_STORE, "readonly");
    const store = transaction.objectStore(PERSISTENCE_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? fallback);
    request.onerror = () => reject(request.error || new Error(`Unable to read ${key} from persistent storage.`));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error || new Error(`Unable to finish reading ${key}.`));
  });
}

async function writePersistentCollection(key, value) {
  if (!supportsIndexedDbPersistence()) {
    throw new Error("IndexedDB is not available in this browser.");
  }
  const db = await openPersistenceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PERSISTENCE_STORE, "readwrite");
    const store = transaction.objectStore(PERSISTENCE_STORE);
    store.put(value, key);
    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
    transaction.onerror = () => reject(transaction.error || new Error(`Unable to write ${key} to persistent storage.`));
  });
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
    batchRows.forEach((fileRows) => {
      fileRows.forEach((row) => {
        rows.push(row);
      });
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return rows;
}

async function readItemsInBatches(items, reader, batchSize = BUNDLED_ANALYSIS_BATCH_SIZE, onProgress) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item, batchIndex) => reader(item, index + batchIndex)));
    batchResults.forEach((result) => {
      results.push(result);
    });
    onProgress?.(Math.min(index + batch.length, items.length), items.length);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return results;
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

function inferSpectrumInputUnit(files = []) {
  const names = files.map((file) => String(file?.name || "").toLowerCase());
  if (!names.length) return "watts";
  if (names.every((name) => name.endsWith(".xlsx") || name.endsWith(".xls"))) return "db";
  return "watts";
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

function arrayMin(values, fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function arrayMax(values, fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function formatGithubPublishError(error, githubConfig) {
  const detail = error instanceof Error ? error.message : "Unknown error";
  const status = error?.githubStatus;
  const payloadMessage = typeof error?.githubPayload?.message === "string" ? error.githubPayload.message : "";
  const combined = `${detail} ${payloadMessage}`.toLowerCase();
  const repoLabel = `${githubConfig?.owner || "owner"}/${githubConfig?.repo || "repo"}`;

  if (status === 403 || combined.includes("resource not accessible by personal access token")) {
    return `GitHub rejected the token for ${repoLabel}. Use a fine-grained PAT that includes this repository and grants Contents: Read and Write access, then save the token again.`;
  }

  if (status === 401 || combined.includes("bad credentials")) {
    return `GitHub did not accept the token for ${repoLabel}. Check that the token is still valid, then save the updated token and try again.`;
  }

  return detail;
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
    traceInputUnit: settings.traceInputUnit || "watts",
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
    waferColorScaleMid: null,
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

function buildWaveguideSettingsPatch(values = {}) {
  const count = Math.max(Math.round(Number(values.propagationWaveguideCount) || DEFAULT_WAVEGUIDE_COUNT), 1);
  const start = Number.isFinite(Number(values.propagationWaveguideStartMm)) ? Number(values.propagationWaveguideStartMm) : DEFAULT_WAVEGUIDE_START_MM;
  const interval = Number.isFinite(Number(values.propagationWaveguideIntervalMm)) ? Number(values.propagationWaveguideIntervalMm) : DEFAULT_WAVEGUIDE_INTERVAL_MM;
  const manualMode = Boolean(values.propagationWaveguideManualMode);
  const entries = Array.isArray(values.waveguideLengths)
    ? values.waveguideLengths
        .map((entry) => [Number(entry?.index), Number(entry?.lengthMm)])
        .filter(([index, length]) => Number.isFinite(index) && Number.isFinite(length))
        .sort((a, b) => a[0] - b[0])
    : Object.entries(values.waveguideLengthByIndex || {})
        .map(([key, value]) => [Number(key), Number(value)])
        .filter(([index, length]) => Number.isFinite(index) && Number.isFinite(length))
        .sort((a, b) => a[0] - b[0]);

  const waveguideLengthByIndex = entries.length
    ? Object.fromEntries(entries.map(([index, length]) => [String(index), length]))
    : cloneWaveguideLengthMap({}, count, start, interval, manualMode);

  return {
    propagationWaveguideCount: count,
    propagationWaveguideStartMm: start,
    propagationWaveguideIntervalMm: interval,
    propagationWaveguideManualMode: manualMode,
    waveguideLengthByIndex
  };
}

function propagationDraftFromSourceMeta(sourceMeta = {}) {
  return {
    launchPowerDbm: String(sourceMeta.launchPowerDbm ?? ""),
    propagationTargetWavelengthNm: String(sourceMeta.propagationTargetWavelengthNm ?? ""),
    propagationWindowNm: String(sourceMeta.propagationWindowNm ?? ""),
    propagationSpectralStepNm: String(sourceMeta.propagationSpectralStepNm ?? ""),
    propagationMseThreshold: String(sourceMeta.propagationMseThreshold ?? ""),
    propagationWaveguideCount: String(sourceMeta.propagationWaveguideCount ?? ""),
    propagationWaveguideStartMm: String(sourceMeta.propagationWaveguideStartMm ?? ""),
    propagationWaveguideIntervalMm: String(sourceMeta.propagationWaveguideIntervalMm ?? ""),
    propagationWaveguideManualMode: Boolean(sourceMeta.propagationWaveguideManualMode),
    waveguideLengthByIndex: Object.fromEntries(
      Object.entries(sourceMeta.waveguideLengthByIndex || {}).map(([key, value]) => [key, String(value ?? "")])
    )
  };
}

function updatePropagationDraft(previous, field, value) {
  const next = { ...previous, [field]: value };
  if (!["propagationWaveguideCount", "propagationWaveguideStartMm", "propagationWaveguideIntervalMm", "propagationWaveguideManualMode"].includes(field)) {
    return next;
  }

  const count = Math.round(Number(next.propagationWaveguideCount));
  const start = Number(next.propagationWaveguideStartMm);
  const interval = Number(next.propagationWaveguideIntervalMm);
  if (!Number.isFinite(count) || count < 1 || !Number.isFinite(start) || !Number.isFinite(interval)) {
    return next;
  }

  return {
    ...next,
    waveguideLengthByIndex: cloneWaveguideLengthMap(
      next.waveguideLengthByIndex,
      count,
      start,
      interval,
      Boolean(next.propagationWaveguideManualMode)
    )
  };
}

function propagationSettingsFingerprint(values = {}) {
  const numericOrText = (value) => {
    if (value === "") return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : String(value);
  };
  const lengths = Object.entries(values.waveguideLengthByIndex || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, value]) => [key, numericOrText(value)]);

  return JSON.stringify({
    launchPowerDbm: numericOrText(values.launchPowerDbm),
    propagationTargetWavelengthNm: numericOrText(values.propagationTargetWavelengthNm),
    propagationWindowNm: numericOrText(values.propagationWindowNm),
    propagationSpectralStepNm: numericOrText(values.propagationSpectralStepNm),
    propagationMseThreshold: numericOrText(values.propagationMseThreshold),
    propagationWaveguideCount: numericOrText(values.propagationWaveguideCount),
    propagationWaveguideStartMm: numericOrText(values.propagationWaveguideStartMm),
    propagationWaveguideIntervalMm: numericOrText(values.propagationWaveguideIntervalMm),
    propagationWaveguideManualMode: Boolean(values.propagationWaveguideManualMode),
    waveguideLengthByIndex: lengths
  });
}

function validatePropagationDraft(draft) {
  const readNumber = (field, label, { min = null, integer = false } = {}) => {
    if (draft[field] === "") throw new Error(`${label} is required.`);
    const value = Number(draft[field]);
    if (!Number.isFinite(value)) throw new Error(`${label} must be a valid number.`);
    if (integer && !Number.isInteger(value)) throw new Error(`${label} must be a whole number.`);
    if (min !== null && value < min) throw new Error(`${label} must be at least ${min}.`);
    return value;
  };

  const count = readNumber("propagationWaveguideCount", "Number of waveguides", { min: 1, integer: true });
  const manualMode = Boolean(draft.propagationWaveguideManualMode);
  const start = readNumber("propagationWaveguideStartMm", "Start waveguide length");
  const interval = readNumber("propagationWaveguideIntervalMm", "Waveguide length interval");
  const generatedLengths = buildGeneratedWaveguideLengthMap(count, start, interval);
  const lengths = {};
  for (let index = 1; index <= count; index += 1) {
    const rawValue = draft.waveguideLengthByIndex?.[index] ?? generatedLengths[index];
    if (manualMode && (rawValue === "" || rawValue === null || rawValue === undefined)) {
      throw new Error(`WG${index} length is required.`);
    }
    const parsedLength = Number(rawValue);
    if (!Number.isFinite(parsedLength)) throw new Error(`WG${index} length must be a valid number.`);
    lengths[index] = parsedLength;
  }

  return {
    launchPowerDbm: readNumber("launchPowerDbm", "Laser output power"),
    propagationTargetWavelengthNm: readNumber("propagationTargetWavelengthNm", "Target wavelength"),
    propagationWindowNm: readNumber("propagationWindowNm", "Window", { min: 0 }),
    propagationSpectralStepNm: readNumber("propagationSpectralStepNm", "Spectral interval", { min: 1 }),
    propagationMseThreshold: readNumber("propagationMseThreshold", "Fit MSE threshold", { min: 0 }),
    propagationWaveguideCount: count,
    propagationWaveguideStartMm: start,
    propagationWaveguideIntervalMm: interval,
    propagationWaveguideManualMode: manualMode,
    waveguideLengthByIndex: lengths
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
    .map(([, value]) => { const numericValue = Number(value); return formatMetricNumber(numericValue, Number.isInteger(numericValue) ? 0 : 2); });
  return values.length ? `[${values.join(" ")}] mm` : "[] mm";
}

function normalizeStoredDatasets(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function presentDataset(dataset) {
  const presented = getDatasetPresentation(dataset);
  const display = dataset?.display || {};
  return {
    ...dataset,
    ...presented,
    projectDisplayName: display.projectName || presented.projectDisplayName,
    waferDisplayName: display.slot || presented.waferDisplayName,
    slot: display.slot || presented.slot,
    waveguideType: display.waveguideType || presented.waveguideType,
    measurementMode: display.measurementMode || presented.measurementMode,
    measurementType: display.measurementType || presented.measurementType,
    platformDisplayName: display.platformLabel || presented.platformDisplayName
  };
}

function createDatasetNamingDraft(dataset = {}) {
  const display = buildDatasetSnapshotMetadata(dataset);
  return {
    label: display.label || "",
    folderName: display.folderName || "",
    projectName: display.projectName || "",
    slot: display.slot || "",
    platformLabel: display.platformLabel || "",
    buildingBlockLabel: display.buildingBlockLabel || ""
  };
}

function createPublishedDatasetDraft(dataset = {}) {
  return {
    label: dataset.label || "",
    projectName: dataset.projectName || "",
    slot: dataset.slot || "",
    platformLabel: dataset.platformLabel || dataset.platformDisplayName || "",
    buildingBlockLabel: dataset.buildingBlockLabel || ""
  };
}

function buildReviewedAnalyticsPayload(reportState, includedChipIds, allChipIds, sourceMeta) {
  const measuredChips = Number(reportState?.matlabSummary?.measuredChips) || 0;
  const fittedChips = Number(reportState?.matlabSummary?.fittedChips) || 0;
  const failedFits = Number(reportState?.matlabSummary?.failedFits) || 0;
  const selectedChipCount = Number(reportState?.selectedChipCount) || measuredChips;
  const totalChipCount = Number(reportState?.totalChipCount) || selectedChipCount;
  const includedIds = Array.isArray(includedChipIds) ? includedChipIds.map((chipId) => String(chipId)) : [];
  const excludedChipIds = Array.isArray(allChipIds)
    ? allChipIds.map((chipId) => String(chipId)).filter((chipId) => !includedIds.includes(chipId))
    : [];
  const yieldValue = measuredChips ? (fittedChips / measuredChips) * 100 : null;

  return {
    analyticsSummary: normalizeDatasetAnalyticsSummary({
      propagationAverage: reportState?.matlabSummary?.avgPropagationLossDbPerCm,
      yield: yieldValue,
      measuredChips,
      computedAt: new Date().toISOString()
    }),
    analyticsReview: normalizeDatasetAnalyticsReview({
      excludedChipIds,
      includedChipIds: includedIds,
      totalChipCount,
      selectedChipCount,
      measuredChips,
      fittedChips,
      failedFits,
      savedAt: new Date().toISOString(),
      propagationSettings: {
        propagationTargetWavelengthNm: sourceMeta?.propagationTargetWavelengthNm,
        propagationWindowNm: sourceMeta?.propagationWindowNm,
        propagationSpectralStepNm: sourceMeta?.propagationSpectralStepNm,
        propagationMseThreshold: sourceMeta?.propagationMseThreshold
      }
    })
  };
}

function selectedLocalDatasetId(value = "") {
  return String(value || "").startsWith("local:") ? String(value).slice(6) : "";
}

function selectedGithubDatasetId(value = "") {
  return String(value || "").startsWith("github:") ? String(value).slice(7) : "";
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

function quickDatasetLabel(dataset = {}) {
  const presentation = getDatasetPresentation(dataset);
  const name = dataset.label || dataset.display?.shortLabel || dataset.sourceMeta?.name || "Dataset snapshot";
  const context = [presentation.projectDisplayName, presentation.slot, dataset.selectedDate]
    .filter((value) => value && !/undefined/i.test(value))
    .join(" - ");
  return context ? `${name} (${context})` : name;
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
  const xMin = arrayMin(xs);
  const xMax = arrayMax(xs);
  const yMin = arrayMin(ys) - 2;
  const yMax = arrayMax(ys) + 2;

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
  const min = arrayMin(trimmed);
  const max = arrayMax(trimmed);
  return trimmed.map((value) => {
    if (max === min) return 68;
    return 26 + ((value - min) / (max - min)) * 58;
  });
}

function metricValueForComparison(metricKey, item, insertionMetricField = "insertionLossDb") {
  if (!item) return null;
  if (metricKey === "propagation") return item.lossDbPerCm;
  if (metricKey === "insertion") return item[insertionMetricField] ?? null;
  return item.efficiencyMwPerPi;
}

function metricDescriptorForComparison(metricKey, item) {
  if (!item) return "--";
  if (metricKey === "propagation") return `${item.samples?.length ?? 0} fit points`;
  if (metricKey === "insertion") return `${item.referenceWaveguideIds?.join(", ") || `${item.blockCount ?? 0} blocks`}`;
  return `${item.samples ?? 0} heater rows`;
}

function insertionMetricLabel(field) {
  return {
    insertionLossDb: "Insertion loss at peak",
    insertionLossAt1550Db: "Insertion loss at 1550 nm",
    peakWavelengthNm: "Peak wavelength",
    bandwidth3dBNm: "3 dB bandwidth",
    spectralFlatnessDb: "Spectral flatness"
  }[field] || "Insertion metric";
}

function formatInsertionMetric(field, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (field === "peakWavelengthNm") return `${Number(value).toFixed(1)} nm`;
  if (field === "bandwidth3dBNm") return `${Number(value).toFixed(1)} nm`;
  return `${Number(value).toFixed(2)} dB`;
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
  colorScaleMid = null,
  colorScaleMax = null
}) {
  if (!cells.length) {
    return <div className="chart-empty">No wafermap values available for this metric.</div>;
  }

  const figure = buildWaferMapFigureModel({
    cells,
    metricKey,
    overlayMode,
    selectedChip,
    colorScaleMin,
    colorScaleMid,
    colorScaleMax
  });

  return (
    <div className="wafer-card-layout">
      <div className="wafer-outline-shell">
        {templateName ? <div className="wafer-template-badge">{templateName}</div> : null}
        <svg viewBox={`0 0 ${figure.svgWidth} ${figure.svgHeight}`} className="wafermap-svg" role="img" aria-label={`Wafermap for ${metricLabel(metricKey)}`}>
          <circle cx={figure.waferCenterX} cy={figure.waferCenterY} r={figure.waferRadius} className="wafermap-circle" />
          <path d={`M ${figure.waferCenterX - 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32} A 2.16 2.16 0 0 1 ${figure.waferCenterX + 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32}`} className="wafermap-notch-stroke" />
          {figure.colValues.map((column) => (
            <text
              key={`column-label-${column}`}
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
              key={`row-label-${row}`}
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
              <g
                key={cell.chipId}
                className={cell.selected ? "wafermap-slot-group selected" : cell.excluded ? "wafermap-slot-group excluded" : "wafermap-slot-group"}
                onClick={() => cell.interactive && onSelect(cell.chipId)}
              >
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={figure.cellWidth}
                  height={figure.cellHeight}
                  rx="0.35"
                  className={cell.interactive ? "wafermap-slot active" : "wafermap-slot"}
                  style={cell.fill ? { fill: cell.fill } : undefined}
                >
                  <title>{`${cell.chipId}: ${cell.detail || (cell.value !== null && cell.value !== undefined ? formatMetric(metricKey, cell.value) : "No measurement loaded")}${cell.excluded ? " | Excluded from chip summary averages" : ""}`}</title>
                </rect>
                {cell.label ? (
                  <text
                    x={cell.x + figure.cellWidth / 2}
                    y={cell.y + figure.cellHeight / 2 + figure.labelFontSize * 0.32}
                    textAnchor="middle"
                    className={cell.interactive && cell.isActiveInView ? "wafermap-slot-label" : "wafermap-slot-label muted"}
                    style={{ fontSize: `${figure.labelFontSize}px` }}
                  >
                    {cell.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="wafer-side-scale">
        <span className="wafer-scale-caption high">High</span>
        <div className="wafer-scale-bar" />
        <div className="wafer-scale-labels">
          <span>{figure.range ? figure.range.max.toFixed(2) : "--"}</span>
          <span>{figure.range ? figure.range.mid.toFixed(2) : "--"}</span>
          <span>{figure.range ? figure.range.min.toFixed(2) : "--"}</span>
        </div>
        <span className="wafer-scale-caption low">Low</span>
      </div>
    </div>
  );
}

function ChipSelectionTable({
  rows,
  summary,
  onToggleChip,
  onSelectAll,
  onClearAll,
  onSelectPassingOnly,
  onOpenChip,
  onExportNormalizedCsv
}) {
  const formatValue = (value, digits, suffix = "") => (
    value === null || value === undefined || Number.isNaN(value) ? "--" : `${Number(value).toFixed(digits)}${suffix}`
  );

  return (
    <article className="analysis-card wide-span chip-summary-card">
      <div className="analysis-card-head">
        <div>
          <h2>Chip Summary Table</h2>
          <p>Choose which chips contribute to the wafer-level averages and exported HTML summary.</p>
        </div>
        <div className="dataset-toolbar">
          <button type="button" className="secondary-action" onClick={onSelectAll}>Select All</button>
          <button type="button" className="secondary-action" onClick={onSelectPassingOnly}>Passing Only</button>
          <button type="button" className="secondary-action" onClick={onClearAll}>Clear All</button>
          <button type="button" onClick={onExportNormalizedCsv}>Export CSV</button>
        </div>
      </div>
      <div className="report-summary-grid chip-summary-grid">
        <div>
          <small>Selected chips</small>
          <span>{rows.filter((row) => row.included).length}</span>
        </div>
        <div>
          <small>Passing selected</small>
          <span>{rows.filter((row) => row.included && row.passMse).length}</span>
        </div>
        <div>
          <small>Excluded chips</small>
          <span>{rows.filter((row) => !row.included).length}</span>
        </div>
      </div>
      <div className="dashboard-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Use</th>
              <th>Chip</th>
              <th>Column (X)</th>
              <th>Row (Y)</th>
              <th>Status</th>
              <th>Prop Loss</th>
              <th>MSE</th>
              <th>Peak WL</th>
              <th>Insertion</th>
              <th>3 dB BW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`chip-summary-${row.chipId}`} className={row.included ? "" : "chip-summary-row-excluded"}>
                <td><input type="checkbox" checked={row.included} onChange={() => onToggleChip(row.chipId)} aria-label={`Include ${row.chipId}`} /></td>
                <td><button type="button" className="chip-link-button" onClick={() => onOpenChip(row.chipId)}>{row.chipId}</button></td>
                <td>{row.dieX ?? "--"}</td>
                <td>{row.dieY ?? "--"}</td>
                <td><span className={row.passMse ? "status-pill pass" : "status-pill fail"}>{row.passMse ? "PASS" : "FAIL"}</span></td>
                <td>{row.lossDbPerCm !== null && row.lossDbPerCm !== undefined ? `${row.lossDbPerCm.toFixed(2)} dB/cm` : "--"}</td>
                <td>{row.mse !== null && row.mse !== undefined ? row.mse.toFixed(4) : "--"}</td>
                <td>{row.peakWavelengthNm !== null && row.peakWavelengthNm !== undefined ? `${row.peakWavelengthNm.toFixed(1)} nm` : "--"}</td>
                <td>{row.insertionLossDb !== null && row.insertionLossDb !== undefined ? `${row.insertionLossDb.toFixed(2)} dB` : "--"}</td>
                <td>{row.bandwidth3dBNm !== null && row.bandwidth3dBNm !== undefined ? `${row.bandwidth3dBNm.toFixed(1)} nm` : "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="chip-summary-averages">
        <div className="analysis-card-head stacked">
          <div>
            <h3>Average Values</h3>
            <p>These values update immediately from the chips currently included in the table.</p>
          </div>
        </div>
        <div className="report-summary-grid chip-summary-average-grid">
          <div>
            <small>Selected chips</small>
            <span>{summary?.selectedChipCount ?? rows.filter((row) => row.included).length}</span>
          </div>
          <div>
            <small>Avg prop loss</small>
            <span>{formatValue(summary?.matlabSummary?.avgPropagationLossDbPerCm, 2, " dB/cm")}</span>
          </div>
          <div>
            <small>Avg peak WL</small>
            <span>{formatValue(summary?.matlabSummary?.avgPeakWavelengthNm, 1, " nm")}</span>
          </div>
          <div>
            <small>Avg insertion</small>
            <span>{formatValue(summary?.matlabSummary?.avgInsertionLossDb, 2, " dB")}</span>
          </div>
          <div>
            <small>Avg 3 dB BW</small>
            <span>{formatValue(summary?.matlabSummary?.avgBandwidth3dBNm, 1, " nm")}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
function MetricComparisonPlot({ metricKey, items, selectedKey, onSelect, emptyMessage, insertionMetricField = "insertionLossDb" }) {
  if (!items.length) {
    return <div className="chart-empty">{emptyMessage}</div>;
  }

  const values = items.map((item) => metricValueForComparison(metricKey, item, insertionMetricField)).filter((value) => value !== null && value !== undefined);
  const min = arrayMin(values);
  const max = arrayMax(values);

  return (
    <div className="metric-comparison-plot">
      {items.slice(0, 12).map((item) => {
        const key = item.chipId;
        const value = metricValueForComparison(metricKey, item, insertionMetricField);
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
            <div className="metric-comparison-value">{metricKey === "insertion" ? formatInsertionMetric(insertionMetricField, value) : formatMetric(metricKey, value)}</div>
          </button>
        );
      })}
    </div>
  );
}

function MetricInspector({ metricKey, item, sourceMeta, insertionDeviceLabel = "Selected Device" }) {
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
        <h3>{insertionDeviceLabel} Inspector</h3>
        <ResultKeyValue label="Chip" value={item.chipId} />
        <ResultKeyValue label="Insertion loss at peak" value={formatMetric("insertion", item.insertionLossDb ?? null)} />
        <ResultKeyValue label="Insertion loss at 1550 nm" value={item.insertionLossAt1550Db !== null && item.insertionLossAt1550Db !== undefined ? `${item.insertionLossAt1550Db.toFixed(2)} dB` : "--"} />
        <ResultKeyValue label="Blocks tracked" value={String(item.blockCount ?? 0)} />
        <ResultKeyValue label="Building blocks" value={item.blockNames?.join(", ") || "--"} />
        <ResultKeyValue label="Reference WG" value={item.referenceWaveguideIds?.join(", ") || "WG1 / shortest trace"} />
        <ResultKeyValue label="Peak wavelength" value={item.peakWavelengthNm !== null && item.peakWavelengthNm !== undefined ? `${item.peakWavelengthNm.toFixed(1)} nm` : "--"} />
        <ResultKeyValue label="3 dB bandwidth" value={item.bandwidth3dBNm !== null && item.bandwidth3dBNm !== undefined ? `${item.bandwidth3dBNm.toFixed(1)} nm` : "--"} />
        <ResultKeyValue label="Spectral flatness" value={item.spectralFlatnessDb !== null && item.spectralFlatnessDb !== undefined ? `${item.spectralFlatnessDb.toFixed(2)} dB` : "--"} />
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

function InsertionPerformanceTable({ items, emptyMessage }) {
  if (!items.length) return <div className="chart-empty">{emptyMessage}</div>;

  return (
    <div className="dashboard-table-wrap insertion-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Chip</th>
            <th>Peak WL (nm)</th>
            <th>IL At Peak (dB)</th>
            <th>IL @ 1550 nm (dB)</th>
            <th>3 dB BW (nm)</th>
            <th>Flatness (dB)</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`insertion-table-${item.chipId}`}>
              <td>{item.chipId}</td>
              <td>{item.peakWavelengthNm !== null && item.peakWavelengthNm !== undefined ? item.peakWavelengthNm.toFixed(1) : "--"}</td>
              <td>{item.insertionLossDb !== null && item.insertionLossDb !== undefined ? item.insertionLossDb.toFixed(2) : "--"}</td>
              <td>{item.insertionLossAt1550Db !== null && item.insertionLossAt1550Db !== undefined ? item.insertionLossAt1550Db.toFixed(2) : "--"}</td>
              <td>{item.bandwidth3dBNm !== null && item.bandwidth3dBNm !== undefined ? item.bandwidth3dBNm.toFixed(1) : "--"}</td>
              <td>{item.spectralFlatnessDb !== null && item.spectralFlatnessDb !== undefined ? item.spectralFlatnessDb.toFixed(2) : "--"}</td>
              <td>{item.referenceWaveguideIds?.join(", ") || item.deviceDescriptor || "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const minWavelength = wavelengths.length ? arrayMin(wavelengths) : null;
  const maxWavelength = wavelengths.length ? arrayMax(wavelengths) : null;

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
  const xMin = arrayMin(xs);
  const xMax = arrayMax(xs);
  const lossMin = arrayMin(lossValues) - 0.2;
  const lossMax = arrayMax(lossValues) + 0.2;
  const mseMin = 0;
  const mseMax = Math.max(arrayMax(mseValues, 0.001), 0.001) * 1.15;

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
  const xMin = arrayMin(xs);
  const xMax = arrayMax(xs);
  const yMin = arrayMin(ys) - 0.4;
  const yMax = arrayMax(ys) + 0.4;
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
          <input type="number" min="1" value={count ?? ""} onChange={(event) => onNumberChange("propagationWaveguideCount", event.target.value)} />
        </label>
        <label className="mapping-field">
          <span>Start waveguide length (mm)</span>
          <input type="number" value={start ?? ""} onChange={(event) => onNumberChange("propagationWaveguideStartMm", event.target.value)} />
        </label>
        <label className="mapping-field">
          <span>Waveguide length interval (mm)</span>
          <input type="number" value={interval ?? ""} onChange={(event) => onNumberChange("propagationWaveguideIntervalMm", event.target.value)} />
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

function PropagationSettingsPanel({
  draft,
  hasChanges,
  isApplying,
  isExpanded,
  onNumberChange,
  onLengthChange,
  onApply,
  onReset,
  onToggleExpanded
}) {
  return (
    <form className={isExpanded ? "analysis-card propagation-settings-card" : "analysis-card propagation-settings-card collapsed"} onSubmit={(event) => { event.preventDefault(); onApply(); }}>
      <div className="analysis-card-head propagation-settings-head">
        <div>
          <h2>Propagation Processing Settings</h2>
          <p>{isExpanded ? "Edit values freely, then apply them once to update the analysis and plots." : "Settings are collapsed to keep the analysis workspace in view."}</p>
        </div>
        <div className="analysis-card-controls propagation-settings-actions">
          <button
            type="button"
            className="settings-collapse-action"
            aria-expanded={isExpanded}
            aria-controls="propagation-settings-fields"
            onClick={onToggleExpanded}
          >
            <span aria-hidden="true" className={isExpanded ? "collapse-chevron expanded" : "collapse-chevron"}>v</span>
            {isExpanded ? "Collapse" : "Expand"}
          </button>
          <span className={isApplying ? "dataset-status-chip progress" : hasChanges ? "dataset-status-chip progress" : "dataset-status-chip success"}>
            {isApplying ? "Updating analysis..." : hasChanges ? "Changes not applied" : "Analysis current"}
          </span>
          <button type="button" onClick={onReset} disabled={!hasChanges || isApplying}>Reset</button>
          <button type="submit" className="propagation-apply-action" disabled={!hasChanges || isApplying}>
            {isApplying ? "Recalculating..." : "Apply & Recalculate"}
          </button>
        </div>
      </div>
      {isExpanded ? (
        <div id="propagation-settings-fields" className="propagation-settings-fields">
          <div className="propagation-settings-grid">
            <label className="mapping-field">
              <span>Laser output power (dBm)</span>
              <input type="number" value={draft.launchPowerDbm} onChange={(event) => onNumberChange("launchPowerDbm", event.target.value)} />
            </label>
            <label className="mapping-field">
              <span>Target wavelength (nm)</span>
              <input type="number" value={draft.propagationTargetWavelengthNm} onChange={(event) => onNumberChange("propagationTargetWavelengthNm", event.target.value)} />
            </label>
            <label className="mapping-field">
              <span>Window (+/- nm)</span>
              <input type="number" min="0" value={draft.propagationWindowNm} onChange={(event) => onNumberChange("propagationWindowNm", event.target.value)} />
            </label>
            <label className="mapping-field">
              <span>Spectral interval (nm)</span>
              <input type="number" min="1" value={draft.propagationSpectralStepNm} onChange={(event) => onNumberChange("propagationSpectralStepNm", event.target.value)} />
            </label>
            <label className="mapping-field">
              <span>Fit MSE threshold</span>
              <input type="number" min="0" step="0.01" value={draft.propagationMseThreshold} onChange={(event) => onNumberChange("propagationMseThreshold", event.target.value)} />
            </label>
          </div>
          <WaveguideLengthConfigurator
            count={draft.propagationWaveguideCount}
            start={draft.propagationWaveguideStartMm}
            interval={draft.propagationWaveguideIntervalMm}
            manualMode={draft.propagationWaveguideManualMode}
            lengths={draft.waveguideLengthByIndex}
            onNumberChange={onNumberChange}
            onLengthChange={onLengthChange}
            onManualModeChange={(checked) => onNumberChange("propagationWaveguideManualMode", checked)}
          />
        </div>
      ) : null}
    </form>
  );
}
export default function App() {
  const initialSettings = useMemo(() => hydrateSettings(readStoredJson(STORAGE_KEYS.settings, {})), []);

  const [activeTab, setActiveTab] = useState("propagation");
  const [rawRows, setRawRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [sourceMeta, setSourceMeta] = useState(() => buildDefaultSourceMeta(initialSettings));
  const [propagationDraft, setPropagationDraft] = useState(() => propagationDraftFromSourceMeta(buildDefaultSourceMeta(initialSettings)));
  const [pendingPropagationFingerprint, setPendingPropagationFingerprint] = useState("");
  const [statusMessage, setStatusMessage] = useState("Workspace ready. Load a project or upload measurement files to begin.");
  const [selectedWaferMetric, setSelectedWaferMetric] = useState("propagation");
  const [selectedChip, setSelectedChip] = useState("");
  const [excludedPropagationChipIds, setExcludedPropagationChipIds] = useState({});
  const [insertionDeviceType, setInsertionDeviceType] = useState("grating-couplers");
  const [insertionMetricField, setInsertionMetricField] = useState("insertionLossDb");
  const [insertionOverlayVisibility, setInsertionOverlayVisibility] = useState({});
  const [projectName, setProjectName] = useState("");
  const [waferName, setWaferName] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [savedProjects, setSavedProjects] = useState(() => readStoredJson(STORAGE_KEYS.projects, []));
  const [savedDatasets, setSavedDatasets] = useState(() => normalizeStoredDatasets(readStoredJson(STORAGE_KEYS.datasets, [])));
  const [datasetNamingDraft, setDatasetNamingDraft] = useState(() => createDatasetNamingDraft({ sourceMeta: buildDefaultSourceMeta(initialSettings), rawRows: [] }));
  const [selectedPublishedDatasetId, setSelectedPublishedDatasetId] = useState("");
  const [publishedDatasetDraft, setPublishedDatasetDraft] = useState({});
  const [isSavingPublishedDataset, setIsSavingPublishedDataset] = useState(false);
  const [isDeletingPublishedDataset, setIsDeletingPublishedDataset] = useState(false);
  const [persistentCollectionsReady, setPersistentCollectionsReady] = useState(() => !supportsIndexedDbPersistence());
  const [savedWaferTemplates, setSavedWaferTemplates] = useState(() => readStoredJson(STORAGE_KEYS.waferTemplates, []));
  const [auditLog, setAuditLog] = useState(() => readStoredJson(STORAGE_KEYS.audit, []));
  const [appSettings, setAppSettings] = useState(initialSettings);
  const [settingsDraft, setSettingsDraft] = useState(initialSettings);
  const [waferTemplateDraft, setWaferTemplateDraft] = useState(DEFAULT_WAFER_TEMPLATE_DRAFT);
  const [loadingBundledId, setLoadingBundledId] = useState("");
  const [quickDatasetSelection, setQuickDatasetSelection] = useState("");
  const [brandLogoAvailable, setBrandLogoAvailable] = useState(true);
  const [publishingDatasetId, setPublishingDatasetId] = useState("");
  const [remoteLibraryDatasets, setRemoteLibraryDatasets] = useState(() => BUNDLED_LIBRARY_DATASETS.map(normalizeLibraryDataset));
  const [remoteLibraryStatus, setRemoteLibraryStatus] = useState("GitHub measurement library ready. Refresh to pull the latest published folders.");
  const [githubConfig, setGithubConfig] = useState(() => ({ ...DEFAULT_GITHUB_CONFIG, ...readStoredJson(STORAGE_KEYS.github, {}) }));
  const [toastItems, setToastItems] = useState([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isUploadingHeaterFiles, setIsUploadingHeaterFiles] = useState(false);
  const [waferMapDisplayMode, setWaferMapDisplayMode] = useState("all");
  const [waferMapOverlayMode, setWaferMapOverlayMode] = useState("chip");
  const [isPropagationSettingsExpanded, setIsPropagationSettingsExpanded] = useState(true);
  const [isGeneratingPostProcessed, setIsGeneratingPostProcessed] = useState(false);
  const [isGeneratingPptReport, setIsGeneratingPptReport] = useState(false);
  const [isGeneratingWordReport, setIsGeneratingWordReport] = useState(false);
  const [isGeneratingPdfReport, setIsGeneratingPdfReport] = useState(false);
  const [spectrumViewerSeries, setSpectrumViewerSeries] = useState([]);
  const [spectrumViewerInputUnit, setSpectrumViewerInputUnit] = useState("watts");
  const [spectrumViewerDisplayUnit, setSpectrumViewerDisplayUnit] = useState("db");
  const [spectrumViewerTitle, setSpectrumViewerTitle] = useState("");
  const [showSpectrumViewerPeakPosition, setShowSpectrumViewerPeakPosition] = useState(false);
  const [isUploadingSpectrumViewerFiles, setIsUploadingSpectrumViewerFiles] = useState(false);
  const [isSpectrumViewerDragging, setIsSpectrumViewerDragging] = useState(false);
  const [advancedSpectrumViewerSeries, setAdvancedSpectrumViewerSeries] = useState([]);
  const [advancedSpectrumViewerInputUnit, setAdvancedSpectrumViewerInputUnit] = useState("watts");
  const [advancedSpectrumViewerDisplayUnit, setAdvancedSpectrumViewerDisplayUnit] = useState("db");
  const [advancedSpectrumViewerTitle, setAdvancedSpectrumViewerTitle] = useState("");
  const [showAdvancedSpectrumViewerPeakPosition, setShowAdvancedSpectrumViewerPeakPosition] = useState(false);
  const [spectrumViewerPeakDetectionEnabled, setSpectrumViewerPeakDetectionEnabled] = useState(false);
  const [spectrumViewerPeakType, setSpectrumViewerPeakType] = useState("minima");
  const [spectrumViewerPeakSpacingNm, setSpectrumViewerPeakSpacingNm] = useState(0.5);
  const [spectrumViewerPeakProminence, setSpectrumViewerPeakProminence] = useState(0.2);
  const [advancedSpectrumViewerStartWavelengthNm, setAdvancedSpectrumViewerStartWavelengthNm] = useState("");
  const [advancedSpectrumViewerStopWavelengthNm, setAdvancedSpectrumViewerStopWavelengthNm] = useState("");
  const [advancedSpectrumViewerYAxisMin, setAdvancedSpectrumViewerYAxisMin] = useState("");
  const [advancedSpectrumViewerYAxisMax, setAdvancedSpectrumViewerYAxisMax] = useState("");
  const [spectrumViewerComparisonSeriesA, setSpectrumViewerComparisonSeriesA] = useState("");
  const [spectrumViewerComparisonSeriesB, setSpectrumViewerComparisonSeriesB] = useState("");
  const [advancedSpectrumViewerComparisonSeriesA, setAdvancedSpectrumViewerComparisonSeriesA] = useState("");
  const [advancedSpectrumViewerComparisonSeriesB, setAdvancedSpectrumViewerComparisonSeriesB] = useState("");
  const [isUploadingAdvancedSpectrumViewerFiles, setIsUploadingAdvancedSpectrumViewerFiles] = useState(false);
  const [isAdvancedSpectrumViewerDragging, setIsAdvancedSpectrumViewerDragging] = useState(false);
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
  const currentMap = useMemo(
    () => Object.keys(columnMap).length ? columnMap : inferColumnMap(Object.keys(currentRows[0] || {})),
    [columnMap, currentRows]
  );
  const normalizationSourceMeta = useMemo(
    () => ({
      name: sourceMeta.name,
      type: sourceMeta.type,
      defaultMetricFamily: sourceMeta.defaultMetricFamily,
      defaultWavelengthNm: sourceMeta.defaultWavelengthNm,
      launchPowerDbm: sourceMeta.launchPowerDbm,
      waveguideLengthByIndex: sourceMeta.waveguideLengthByIndex
    }),
    [
      sourceMeta.name,
      sourceMeta.type,
      sourceMeta.defaultMetricFamily,
      sourceMeta.defaultWavelengthNm,
      sourceMeta.launchPowerDbm,
      sourceMeta.waveguideLengthByIndex
    ]
  );
  const normalizedRows = useMemo(
    () => buildNormalizedRows(currentRows, currentMap, normalizationSourceMeta),
    [currentRows, currentMap, normalizationSourceMeta]
  );
  const propagationMetrics = useMemo(
    () => computePropagationLoss(normalizedRows, {
      targetWavelengthNm: sourceMeta.propagationTargetWavelengthNm,
      windowNm: sourceMeta.propagationWindowNm,
      spectralStepNm: sourceMeta.propagationSpectralStepNm,
      mseThreshold: sourceMeta.propagationMseThreshold
    }),
    [
      normalizedRows,
      sourceMeta.propagationTargetWavelengthNm,
      sourceMeta.propagationWindowNm,
      sourceMeta.propagationSpectralStepNm,
      sourceMeta.propagationMseThreshold
    ]
  );
  const insertionMetrics = useMemo(() => computeInsertionLoss(normalizedRows, { targetWavelengthNm: sourceMeta.propagationTargetWavelengthNm }), [normalizedRows, sourceMeta.propagationTargetWavelengthNm]);
  const heaterMetrics = useMemo(() => computeHeaterEfficiency(normalizedRows), [normalizedRows]);
  const metrics = useMemo(
    () => ({ propagation: propagationMetrics, insertion: insertionMetrics, heater: heaterMetrics }),
    [propagationMetrics, insertionMetrics, heaterMetrics]
  );
  const appliedPropagationFingerprint = useMemo(
    () => propagationSettingsFingerprint(sourceMeta),
    [
      sourceMeta.launchPowerDbm,
      sourceMeta.propagationTargetWavelengthNm,
      sourceMeta.propagationWindowNm,
      sourceMeta.propagationSpectralStepNm,
      sourceMeta.propagationMseThreshold,
      sourceMeta.propagationWaveguideCount,
      sourceMeta.propagationWaveguideStartMm,
      sourceMeta.propagationWaveguideIntervalMm,
      sourceMeta.propagationWaveguideManualMode,
      sourceMeta.waveguideLengthByIndex
    ]
  );
  const draftPropagationFingerprint = useMemo(
    () => propagationSettingsFingerprint(propagationDraft),
    [propagationDraft]
  );
  const propagationHasChanges = draftPropagationFingerprint !== appliedPropagationFingerprint;
  const isApplyingPropagation = Boolean(pendingPropagationFingerprint);
  const datasetSummary = useMemo(() => summarizeDataset(normalizedRows), [normalizedRows]);
  const propagationChipIds = useMemo(() => metrics.propagation.byChip.map((item) => item.chipId), [metrics.propagation.byChip]);
  const includedPropagationChipIds = useMemo(
    () => propagationChipIds.filter((chipId) => excludedPropagationChipIds[chipId] !== true),
    [excludedPropagationChipIds, propagationChipIds]
  );
  const reportState = useMemo(
    () => buildReportState(metrics, datasetSummary, { includedChipIds: includedPropagationChipIds }),
    [datasetSummary, includedPropagationChipIds, metrics]
  );
  const propagationAllWaferCells = useMemo(
    () => metrics.propagation.byChip
      .filter((item) => item.lossDbPerCm !== null && item.lossDbPerCm !== undefined)
      .map((item) => ({
        chipId: item.chipId,
        dieX: item.dieX,
        dieY: item.dieY,
        value: item.lossDbPerCm,
        passMse: item.passMse,
        detail: item.passMse
          ? `${item.lossDbPerCm.toFixed(2)} dB/cm @ ${sourceMeta.propagationTargetWavelengthNm} +/- ${sourceMeta.propagationWindowNm} nm`
          : `${item.lossDbPerCm.toFixed(2)} dB/cm (fit above MSE threshold)`
      })),
    [metrics.propagation.byChip, sourceMeta.propagationTargetWavelengthNm, sourceMeta.propagationWindowNm]
  );
  const insertionProfile = useMemo(() => {
    const profiles = metrics.insertion.deviceProfiles || {};
    return profiles[insertionDeviceType] || profiles["grating-couplers"] || { byChip: [], metricOptions: [] };
  }, [insertionDeviceType, metrics.insertion.deviceProfiles]);
  const insertionByChip = useMemo(() => insertionProfile.byChip || [], [insertionProfile.byChip]);
  const insertionMetricOptions = insertionProfile.metricOptions || [];
  const insertionOverlaySeries = useMemo(() => insertionByChip.flatMap((item) => (item.transmissionSeries || []).map((seriesItem, index) => ({
    id: `${item.chipId}-${seriesItem.waveguideId || index}`,
    chipId: item.chipId,
    waveguideId: seriesItem.waveguideId || item.chipId,
    label: `${item.chipId}${seriesItem.waveguideId ? ` - ${seriesItem.waveguideId}` : ""}`,
    pointCount: seriesItem.points?.length || 0,
    wavelengthMinNm: seriesItem.points?.length ? Math.min(...seriesItem.points.map((point) => point.wavelengthNm)) : null,
    wavelengthMaxNm: seriesItem.points?.length ? Math.max(...seriesItem.points.map((point) => point.wavelengthNm)) : null,
    points: seriesItem.points || []
  }))), [insertionByChip]);
  const insertionOverlayDisplaySeries = useMemo(() => insertionOverlaySeries.map((item) => ({ ...item, visible: insertionOverlayVisibility[item.id] !== false })), [insertionOverlaySeries, insertionOverlayVisibility]);
  const currentWaferCells = useMemo(() => {
    const insertionWaferCells = insertionByChip
      .filter((item) => item[insertionMetricField] !== null && item[insertionMetricField] !== undefined)
      .map((item) => ({
        chipId: item.chipId,
        dieX: item.dieX,
        dieY: item.dieY,
        value: item[insertionMetricField],
        detail: `${insertionProfile.label || "Building block"} | ${insertionMetricLabel(insertionMetricField)}: ${formatInsertionMetric(insertionMetricField, item[insertionMetricField])}${item.referenceWaveguideIds?.length ? ` | Ref ${item.referenceWaveguideIds.join(", ")}` : ""}`
      }));
    const metricCells = selectedWaferMetric === "propagation"
      ? propagationAllWaferCells
      : selectedWaferMetric === "insertion"
        ? insertionWaferCells
        : metrics[selectedWaferMetric].waferMetric;
    const metricLookup = new Map(metricCells.map((cell) => [cell.chipId, cell]));
    const propagationStatusLookup = new Map(
      metrics.propagation.byChip.map((item) => [item.chipId, item.passMse ? "passing" : item.mse !== null ? "failed" : "unfitted"])
    );

    return waferTemplateLayout.map((slot) => {
      const metricCell = metricLookup.get(slot.chipId);
      const hasMeasurement = metricCell?.value !== null && metricCell?.value !== undefined;
      const propagationStatus = propagationStatusLookup.get(slot.chipId) || "unmeasured";
      const isActiveInView = waferMapDisplayMode === "all"
        || (waferMapDisplayMode === "measured" && hasMeasurement)
        || waferMapDisplayMode === propagationStatus;

      return {
        chipId: slot.chipId,
        dieX: slot.dieX,
        dieY: slot.dieY,
        value: metricCell?.value ?? null,
        detail: metricCell?.detail ?? "No measurement loaded for this chip.",
        hasMeasurement,
        propagationStatus,
        isVisible: true,
        isActiveInView,
        excluded: excludedPropagationChipIds[slot.chipId] === true
      };
    });
  }, [excludedPropagationChipIds, insertionByChip, insertionMetricField, insertionProfile.label, metrics, propagationAllWaferCells, selectedWaferMetric, waferMapDisplayMode, waferTemplateLayout]);
  const propagationLead = metrics.propagation.byChip.find((item) => item.chipId === selectedChip) || metrics.propagation.byChip[0] || null;
  const insertionLead = insertionByChip.find((item) => item.chipId === selectedChip) || insertionByChip[0] || null;
  const heaterLead = metrics.heater.byChip.find((item) => item.chipId === selectedChip) || metrics.heater.byChip[0] || null;
  const heaterTraceSeries = useMemo(() => (heaterLead?.traceSeries || []).map((item) => ({
    label: item.label,
    waveguideId: item.label,
    points: (item.points || []).map((point) => ({ wavelengthNm: point.wavelengthNm, transmissionDb: point.lossDb }))
  })), [heaterLead]);
  const selectedMetricDetail = selectedWaferMetric === "heater" ? heaterLead : selectedWaferMetric === "insertion" ? insertionLead : propagationLead;
  const propagationMean = average(metrics.propagation.byChip.map((item) => item.lossDbPerCm).filter((value) => value !== null));
  const insertionMean = average(insertionByChip.map((item) => item[insertionMetricField]).filter((value) => value !== null && value !== undefined));
  const heaterMean = average(metrics.heater.byChip.map((item) => item.efficiencyMwPerPi));
  const propagationYield = metrics.propagation.passRate;
  const matchedDevices = Math.max(datasetSummary.rows - 2, 0);
  const unmatchedDevices = datasetSummary.rows - matchedDevices;
  const isWorkspaceTab = APP_TABS.some((tab) => tab.id === activeTab);
  const railAvatar = useMemo(() => initialsFromName(appSettings.operatorName), [appSettings.operatorName]);
  const chipSelectionRows = useMemo(
    () => metrics.propagation.byChip
      .map((item) => ({
        chipId: item.chipId,
        dieX: item.dieX,
        dieY: item.dieY,
        passMse: item.passMse,
        lossDbPerCm: item.lossDbPerCm,
        mse: item.mse,
        peakWavelengthNm: item.transmissionSummary?.peakWavelengthNm ?? null,
        insertionLossDb: item.transmissionSummary?.insertionLossDb ?? null,
        bandwidth3dBNm: item.transmissionSummary?.bandwidth3dBNm ?? null,
        included: excludedPropagationChipIds[item.chipId] !== true
      }))
      .sort((left, right) => {
        const leftRow = left.dieY ?? -Infinity;
        const rightRow = right.dieY ?? -Infinity;
        if (leftRow !== rightRow) return rightRow - leftRow;
        const leftCol = left.dieX ?? Infinity;
        const rightCol = right.dieX ?? Infinity;
        if (leftCol !== rightCol) return leftCol - rightCol;
        return String(left.chipId).localeCompare(String(right.chipId), undefined, { numeric: true });
      }),
    [excludedPropagationChipIds, metrics.propagation.byChip]
  );
  const primaryMetric = activeTab === "heater"
    ? { key: "heater", value: heaterMean, title: "Mean Heater Efficiency", icon: "Thermal" }
    : activeTab === "insertion"
      ? { key: "insertion", value: insertionMean, title: insertionMetricLabel(insertionMetricField), icon: "Blocks" }
      : { key: "propagation", value: propagationMean, title: "Mean Propagation Loss", icon: "Trend" };
  const secondaryMetric = activeTab === "heater"
    ? { label: "Heater Chips", value: metrics.heater.byChip.length.toLocaleString(), note: "Dies with heater-efficiency estimates", icon: "Heater" }
    : activeTab === "insertion"
      ? { label: insertionProfile.label || "Building Block", value: insertionByChip.length.toLocaleString(), note: insertionProfile.description || "Device-specific insertion-loss analysis across the wafer.", icon: "Blocks" }
      : { label: "Fit R2", value: propagationLead?.mse !== null && propagationLead?.mse !== undefined ? (1 - propagationLead.mse).toFixed(3) : "--", note: "Selected wavelength-window fit quality", icon: "Fit" };
  const primaryMetricDisplay = activeTab === "insertion"
    ? formatInsertionMetric(insertionMetricField, primaryMetric.value)
    : formatMetric(primaryMetric.key, primaryMetric.value);
  const activeMetricItems = activeTab === "heater"
    ? metrics.heater.byChip
    : activeTab === "insertion"
      ? insertionByChip
      : metrics.propagation.byChip;
  const activeMetricKey = activeTab === "heater" ? "heater" : activeTab === "insertion" ? "insertion" : "propagation";
  const activeMetricDetail = activeMetricKey === "heater" ? heaterLead : activeMetricKey === "insertion" ? insertionLead : propagationLead;
  const activeChipOptions = uniqueOptions(activeMetricItems.map((item) => item.chipId));
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

  useEffect(() => {
    setPropagationDraft(propagationDraftFromSourceMeta(sourceMeta));
  }, [appliedPropagationFingerprint]);

  useEffect(() => {
    if (!pendingPropagationFingerprint || pendingPropagationFingerprint !== appliedPropagationFingerprint) return undefined;
    const frame = window.requestAnimationFrame(() => {
      setPendingPropagationFingerprint("");
      setStatusMessage("Propagation analysis updated with the applied settings.");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appliedPropagationFingerprint, pendingPropagationFingerprint]);
  useEffect(() => {
    let cancelled = false;

    async function hydratePersistentCollections() {
      if (!supportsIndexedDbPersistence()) {
        if (!cancelled) setPersistentCollectionsReady(true);
        return;
      }

      const legacyProjects = readStoredJson(STORAGE_KEYS.projects, []);
      const legacyDatasets = normalizeStoredDatasets(readStoredJson(STORAGE_KEYS.datasets, []));

      try {
        const storedProjects = await readPersistentCollection(PERSISTENCE_COLLECTION_KEYS.projects, legacyProjects);
        const storedDatasets = normalizeStoredDatasets(await readPersistentCollection(PERSISTENCE_COLLECTION_KEYS.datasets, legacyDatasets));

        if (Array.isArray(legacyProjects) && legacyProjects.length && (!Array.isArray(storedProjects) || !storedProjects.length)) {
          await writePersistentCollection(PERSISTENCE_COLLECTION_KEYS.projects, legacyProjects);
        }
        if (Array.isArray(legacyDatasets) && legacyDatasets.length && (!Array.isArray(storedDatasets) || !storedDatasets.length)) {
          await writePersistentCollection(PERSISTENCE_COLLECTION_KEYS.datasets, legacyDatasets);
        }

        removeStoredJson(STORAGE_KEYS.projects);
        removeStoredJson(STORAGE_KEYS.datasets);

        if (!cancelled) {
          setSavedProjects(Array.isArray(storedProjects) ? storedProjects : []);
          setSavedDatasets(storedDatasets);
        }
      } catch {
        if (!cancelled) {
          setSavedProjects(Array.isArray(legacyProjects) ? legacyProjects : []);
          setSavedDatasets(legacyDatasets);
        }
      } finally {
        if (!cancelled) setPersistentCollectionsReady(true);
      }
    }

    hydratePersistentCollections();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persistentCollectionsReady) return;
    if (supportsIndexedDbPersistence()) {
      writePersistentCollection(PERSISTENCE_COLLECTION_KEYS.projects, savedProjects)
        .then(() => removeStoredJson(STORAGE_KEYS.projects))
        .catch(() => persistStoredJson(STORAGE_KEYS.projects, savedProjects));
      return;
    }
    persistStoredJson(STORAGE_KEYS.projects, savedProjects);
  }, [persistentCollectionsReady, savedProjects]);

  useEffect(() => {
    if (!persistentCollectionsReady) return;
    if (supportsIndexedDbPersistence()) {
      writePersistentCollection(PERSISTENCE_COLLECTION_KEYS.datasets, savedDatasets)
        .then(() => removeStoredJson(STORAGE_KEYS.datasets))
        .catch(() => persistStoredJson(STORAGE_KEYS.datasets, savedDatasets));
      return;
    }
    persistStoredJson(STORAGE_KEYS.datasets, savedDatasets);
  }, [persistentCollectionsReady, savedDatasets]);

  useEffect(() => persistStoredJson(STORAGE_KEYS.audit, auditLog), [auditLog]);
  useEffect(() => persistStoredJson(STORAGE_KEYS.settings, appSettings), [appSettings]);
  useEffect(() => setSettingsDraft(appSettings), [appSettings]);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const mediaQuery = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

    const applyTheme = () => {
      const resolvedTheme = resolveThemePreference(appSettings.themePreference, mediaQuery?.matches);
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    if (!mediaQuery) return undefined;

    const handleChange = () => applyTheme();
    if (typeof mediaQuery.addEventListener === "function") mediaQuery.addEventListener("change", handleChange);
    else if (typeof mediaQuery.addListener === "function") mediaQuery.addListener(handleChange);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") mediaQuery.removeEventListener("change", handleChange);
      else if (typeof mediaQuery.removeListener === "function") mediaQuery.removeListener(handleChange);
    };
  }, [appSettings.themePreference]);
  useEffect(() => {
    if (activeChipOptions.length && !activeChipOptions.includes(selectedChip)) {
      setSelectedChip(activeChipOptions[0]);
    }
  }, [activeChipOptions, selectedChip]);

  useEffect(() => {
    setExcludedPropagationChipIds((previous) => {
      const trimmed = Object.fromEntries(
        Object.entries(previous).filter(([chipId]) => propagationChipIds.includes(chipId))
      );
      if (Object.keys(trimmed).length > 0 || !metrics.propagation.byChip.length) {
        return trimmed;
      }
      return Object.fromEntries(
        metrics.propagation.byChip
          .filter((item) => !item.passMse)
          .map((item) => [item.chipId, true])
      );
    });
  }, [metrics.propagation.byChip, propagationChipIds]);

  useEffect(() => {
    if (insertionMetricOptions.length && !insertionMetricOptions.some((option) => option.value === insertionMetricField)) {
      setInsertionMetricField(insertionMetricOptions[0].value);
    }
  }, [insertionMetricField, insertionMetricOptions]);

  useEffect(() => {
    const visibleSeries = spectrumViewerSeries.filter((item) => item.visible !== false);
    const ids = visibleSeries.map((item) => item.id);
    if (!ids.length) {
      setSpectrumViewerComparisonSeriesA("");
      setSpectrumViewerComparisonSeriesB("");
      return;
    }
    if (!ids.includes(spectrumViewerComparisonSeriesA)) {
      setSpectrumViewerComparisonSeriesA(ids[0]);
    }
    if (!ids.includes(spectrumViewerComparisonSeriesB) || (ids.length > 1 && spectrumViewerComparisonSeriesB === spectrumViewerComparisonSeriesA)) {
      setSpectrumViewerComparisonSeriesB(ids[1] || ids[0]);
    }
  }, [spectrumViewerSeries, spectrumViewerComparisonSeriesA, spectrumViewerComparisonSeriesB]);

  useEffect(() => {
    const visibleSeries = advancedSpectrumViewerSeries.filter((item) => item.visible !== false);
    const ids = visibleSeries.map((item) => item.id);
    if (!ids.length) {
      setAdvancedSpectrumViewerComparisonSeriesA("");
      setAdvancedSpectrumViewerComparisonSeriesB("");
      return;
    }
    if (!ids.includes(advancedSpectrumViewerComparisonSeriesA)) {
      setAdvancedSpectrumViewerComparisonSeriesA(ids[0]);
    }
    if (!ids.includes(advancedSpectrumViewerComparisonSeriesB) || (ids.length > 1 && advancedSpectrumViewerComparisonSeriesB === advancedSpectrumViewerComparisonSeriesA)) {
      setAdvancedSpectrumViewerComparisonSeriesB(ids[1] || ids[0]);
    }
  }, [advancedSpectrumViewerComparisonSeriesA, advancedSpectrumViewerComparisonSeriesB, advancedSpectrumViewerSeries]);

  function appendAudit(kind, title, detail) {
    setAuditLog((previous) => [{ id: createId("audit"), kind, title, detail, timestamp: new Date().toISOString() }, ...previous].slice(0, 120));
  }
  function togglePropagationChipInclusion(chipId) {
    setExcludedPropagationChipIds((previous) => (
      previous[chipId]
        ? Object.fromEntries(Object.entries(previous).filter(([key]) => key !== chipId))
        : { ...previous, [chipId]: true }
    ));
  }
  function selectAllPropagationChips() {
    setExcludedPropagationChipIds({});
  }
  function clearAllPropagationChips() {
    setExcludedPropagationChipIds(Object.fromEntries(propagationChipIds.map((chipId) => [chipId, true])));
  }
  function selectPassingPropagationChips() {
    setExcludedPropagationChipIds(
      Object.fromEntries(
        metrics.propagation.byChip
          .filter((item) => !item.passMse)
          .map((item) => [item.chipId, true])
      )
    );
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
    const baseSnapshot = {
      id: createId("dataset"),
      label: sourceLabel,
      projectName: nextProjectName,
      waferName: nextWaferName,
      selectedDate: nextDate,
      rawRows: snapshotRows,
      columnMap: nextMap,
      sourceMeta: nextSourceMeta,
      summary: snapshotSummary,
      namingOverrides: { ...datasetNamingDraft },
      autoSaved,
      savedAt: new Date().toISOString()
    };
    const display = buildDatasetSnapshotMetadata(baseSnapshot);
    const snapshot = { ...baseSnapshot, label: display.label, display, githubSync: { status: "local" } };
    setSavedDatasets((previous) => [snapshot, ...previous].slice(0, 40));
    return snapshot;
  }
  function updateCurrentDatasetNaming(field, value) {
    setDatasetNamingDraft((previous) => ({ ...previous, [field]: value }));
  }
  function resetCurrentDatasetNaming(dataset = { projectName, waferName, selectedDate, rawRows: currentRows, sourceMeta }) {
    setDatasetNamingDraft(createDatasetNamingDraft(dataset));
  }
  function applyCurrentNamingToLoadedSnapshot() {
    const datasetId = selectedLocalDatasetId(quickDatasetSelection);
    if (!datasetId) return;
    let appliedLabel = "";
    setSavedDatasets((previous) => previous.map((dataset) => {
      if (String(dataset.id) !== datasetId) return dataset;
      const nextDataset = {
        ...dataset,
        projectName: projectName || dataset.projectName,
        waferName: waferName || dataset.waferName,
        selectedDate: selectedDate || dataset.selectedDate,
        rawRows: currentRows.length ? currentRows : dataset.rawRows,
        columnMap: Object.keys(currentMap).length ? currentMap : dataset.columnMap,
        sourceMeta: sourceMeta || dataset.sourceMeta,
        namingOverrides: { ...datasetNamingDraft }
      };
      const display = buildDatasetSnapshotMetadata(nextDataset);
      appliedLabel = display.label;
      return { ...nextDataset, label: display.label, display };
    }));
    setStatusMessage(`Updated naming for the loaded dataset snapshot${appliedLabel ? ` ${appliedLabel}` : ""}.`);
    appendAudit("dataset", "Dataset naming updated", `Updated naming for local dataset snapshot ${datasetId}.`);
    pushToast("Dataset naming updated", "The loaded snapshot now uses the current publish preview naming.", "success");
  }
  function selectPublishedDatasetForEdit(dataset) {
    setSelectedPublishedDatasetId(dataset?.id || "");
    setPublishedDatasetDraft(createPublishedDatasetDraft(dataset));
    setStatusMessage(`Editing published dataset metadata for ${dataset?.label || "the selected dataset"}.`);
  }
  function updatePublishedDatasetDraft(field, value) {
    setPublishedDatasetDraft((previous) => ({ ...previous, [field]: value }));
  }
  async function savePublishedDatasetMetadata(dataset) {
    if (!dataset?.id) return;
    if (!githubConfig.token) {
      const message = "Add a fine-grained GitHub token in the Datasets tab before updating published dataset metadata.";
      setStatusMessage(message);
      pushToast("GitHub token required", message, "danger");
      return;
    }

    setIsSavingPublishedDataset(true);
    setRemoteLibraryStatus(`Updating GitHub metadata for ${dataset.label}...`);
    try {
      const metadataResponse = await fetch(bundledAssetUrl(`${dataset.folder}/metadata.json`), { cache: "no-store" });
      const existingMetadata = metadataResponse.ok ? await metadataResponse.json() : {};
      const isLoadedPublishedDataset = selectedGithubDatasetId(quickDatasetSelection) === dataset.id;
      const reviewedAnalytics = isLoadedPublishedDataset
        ? buildReviewedAnalyticsPayload(reportState, includedPropagationChipIds, propagationChipIds, sourceMeta)
        : null;
      const analyticsSummary = reviewedAnalytics?.analyticsSummary || normalizeDatasetAnalyticsSummary(
        existingMetadata?.analyticsSummary || dataset.analyticsSummary
      );
      const analyticsReview = reviewedAnalytics?.analyticsReview || normalizeDatasetAnalyticsReview(
        existingMetadata?.analyticsReview || dataset.analyticsReview
      );
      const nextMetadata = {
        ...existingMetadata,
        label: publishedDatasetDraft.label || dataset.label,
        projectName: publishedDatasetDraft.projectName || dataset.projectName,
        mpwRun: publishedDatasetDraft.projectName || existingMetadata.mpwRun || dataset.mpw,
        slot: publishedDatasetDraft.slot || dataset.slot,
        platform: publishedDatasetDraft.platformLabel || dataset.platformLabel,
        buildingBlock: publishedDatasetDraft.buildingBlockLabel || dataset.buildingBlockLabel,
        analyticsSummary,
        analyticsReview,
        namingOverrides: {
          label: publishedDatasetDraft.label || dataset.label,
          projectName: publishedDatasetDraft.projectName || dataset.projectName,
          slot: publishedDatasetDraft.slot || dataset.slot,
          platformLabel: publishedDatasetDraft.platformLabel || dataset.platformLabel,
          buildingBlockLabel: publishedDatasetDraft.buildingBlockLabel || dataset.buildingBlockLabel
        }
      };

      const result = await updatePublishedDatasetMetadataOnGithub({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        branch: githubConfig.branch,
        token: githubConfig.token,
        manifestPath: GITHUB_LIBRARY_MANIFEST_PATH,
        mirrorManifestPath: GITHUB_LIBRARY_MANIFEST_MIRROR_PATH,
        manifestPathV2: GITHUB_LIBRARY_MANIFEST_V2_PATH,
        mirrorManifestPathV2: GITHUB_LIBRARY_MANIFEST_V2_MIRROR_PATH,
        analyticsIndexPath: GITHUB_LIBRARY_ANALYTICS_PATH,
        analyticsIndexMirrorPath: GITHUB_LIBRARY_ANALYTICS_MIRROR_PATH,
        dataset,
        metadata: nextMetadata,
        existingManifest: remoteLibraryDatasets,
        existingManifestV2: remoteLibraryDatasets,
        onProgress: ({ completed, total, path }) => {
          setRemoteLibraryStatus(`Updating GitHub metadata: ${completed}/${total} files processed. Latest: ${path}`);
        }
      });

      setRemoteLibraryDatasets((result.manifestV2 || result.manifest).map(normalizeLibraryDataset));
      setStatusMessage(`Updated published dataset metadata for ${publishedDatasetDraft.label || dataset.label}.`);
      setRemoteLibraryStatus(`GitHub metadata update complete for ${publishedDatasetDraft.label || dataset.label}.`);
      appendAudit("github", "Published dataset metadata updated", `Updated GitHub metadata for ${dataset.id}.`);
      pushToast("GitHub metadata updated", `${publishedDatasetDraft.label || dataset.label} was updated in the repository.`, "success");
    } catch (error) {
      const detail = formatGithubPublishError(error, githubConfig);
      setStatusMessage(`GitHub metadata update failed: ${detail}`);
      setRemoteLibraryStatus(`GitHub metadata update failed. ${detail}`);
      appendAudit("github", "Published dataset metadata update failed", `Failed to update ${dataset.id}: ${detail}`);
      pushToast("GitHub metadata update failed", detail, "danger");
    } finally {
      setIsSavingPublishedDataset(false);
    }
  }
  async function deletePublishedDataset(dataset) {
    if (!dataset?.id) return;
    if (!githubConfig.token) {
      const message = "Add a fine-grained GitHub token in the Datasets tab before deleting a published dataset.";
      setStatusMessage(message);
      pushToast("GitHub token required", message, "danger");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${dataset.label || dataset.id} from the GitHub library?\n\nThis removes its published files, metadata, and cached analytics from ${dataset.folder}.`
    );
    if (!confirmed) return;

    setIsDeletingPublishedDataset(true);
    setRemoteLibraryStatus(`Deleting ${dataset.label || dataset.id} from the GitHub library...`);
    try {
      const result = await deletePublishedDatasetFromGithub({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        branch: githubConfig.branch,
        token: githubConfig.token,
        manifestPath: GITHUB_LIBRARY_MANIFEST_PATH,
        mirrorManifestPath: GITHUB_LIBRARY_MANIFEST_MIRROR_PATH,
        manifestPathV2: GITHUB_LIBRARY_MANIFEST_V2_PATH,
        mirrorManifestPathV2: GITHUB_LIBRARY_MANIFEST_V2_MIRROR_PATH,
        analyticsIndexPath: GITHUB_LIBRARY_ANALYTICS_PATH,
        analyticsIndexMirrorPath: GITHUB_LIBRARY_ANALYTICS_MIRROR_PATH,
        dataset,
        existingManifest: remoteLibraryDatasets,
        existingManifestV2: remoteLibraryDatasets,
        onProgress: ({ completed, total, path }) => {
          setRemoteLibraryStatus(`Deleting published dataset: ${completed}/${total} files processed. Latest: ${path}`);
        }
      });

      const nextRemoteDatasets = (result.manifestV2 || result.manifest).map(normalizeLibraryDataset);
      setRemoteLibraryDatasets(nextRemoteDatasets);
      if (selectedPublishedDatasetId === dataset.id) {
        setSelectedPublishedDatasetId("");
        setPublishedDatasetDraft({});
      }
      if (selectedGithubDatasetId(quickDatasetSelection) === dataset.id) {
        setQuickDatasetSelection("");
      }
      setStatusMessage(`Deleted published dataset ${dataset.label || dataset.id} from the GitHub library.`);
      setRemoteLibraryStatus(`GitHub dataset deletion complete for ${dataset.label || dataset.id}.`);
      appendAudit("github", "Published dataset deleted", `Deleted ${dataset.id} from the GitHub library.`);
      pushToast("GitHub dataset deleted", `${dataset.label || dataset.id} was removed from the repository library.`, "success");
    } catch (error) {
      const detail = formatGithubPublishError(error, githubConfig);
      setStatusMessage(`GitHub dataset deletion failed: ${detail}`);
      setRemoteLibraryStatus(`GitHub dataset deletion failed. ${detail}`);
      appendAudit("github", "Published dataset deletion failed", `Failed to delete ${dataset.id}: ${detail}`);
      pushToast("GitHub dataset deletion failed", detail, "danger");
    } finally {
      setIsDeletingPublishedDataset(false);
    }
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
          defaultWavelengthNm: sourceMeta.defaultWavelengthNm,
          traceValueUnit: sourceMeta.traceInputUnit
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
      const nextSourceMeta = { ...sourceMeta, name: files.length === 1 ? files[0].name : `${files.length} measurement files`, type: sharedType, traceInputUnit: sourceMeta.traceInputUnit || "watts" };
      const nextPresentation = getDatasetPresentation({ projectName: "", waferName: "", sourceMeta: nextSourceMeta, rawRows: rows, files: files.map((file) => file.name) });
      setProjectName(nextPresentation.projectDisplayName);
      setWaferName(nextPresentation.waferDisplayName);
      setExcludedPropagationChipIds({});
      setRawRows(rows);
      setColumnMap(inferredMap);
      setSourceMeta(nextSourceMeta);
      setDatasetNamingDraft(createDatasetNamingDraft({
        projectName: nextPresentation.projectDisplayName,
        waferName: nextPresentation.waferDisplayName,
        selectedDate: "",
        rawRows: rows,
        sourceMeta: nextSourceMeta,
        files: files.map((file) => file.name)
      }));
      setQuickDatasetSelection("");
      setStatusMessage(files.length === 1 ? `Loaded ${rows.length} rows from ${files[0].name}.` : `Loaded ${rows.length} rows from ${files.length} uploaded measurement files.`);
      appendAudit("upload", "Measurement file uploaded", `Loaded ${rows.length} rows from ${files.length} file(s) as ${sharedType}.`);
      pushToast("Files loaded", files.length === 1 ? `${files[0].name} loaded successfully.` : `${files.length} measurement files loaded.`, "success");
      appendAudit("dataset", "Workspace updated", `Loaded ${nextSourceMeta.name} into the active workspace. Save it as a dataset snapshot, review the naming, and publish it later from the Dataset Snapshots section if you want to keep it.`);
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
  async function handleHeaterUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || isUploadingHeaterFiles) return;
    setIsUploadingHeaterFiles(true);
    try {
      setStatusMessage(`Reading heater measurement files... ${files.length} selected.`);
      const result = await parseHeaterMeasurementFiles(files, {
        targetWavelengthNm: sourceMeta.heaterTrackingWavelengthNm ?? sourceMeta.propagationTargetWavelengthNm ?? 1550,
        minimumProminenceDb: sourceMeta.heaterPeakProminenceDb ?? 5,
        currentUnit: sourceMeta.heaterCurrentUnit || "auto",
        shiftDirection: sourceMeta.heaterShiftDirection || "increasing"
      });
      if (!result.rows.length) {
        setStatusMessage("The selected heater files did not produce readable heater rows.");
        return;
      }
      const inferredMap = inferColumnMap(Object.keys(result.rows[0] || {}));
      const nextSourceMeta = {
        ...sourceMeta,
        ...result.sourceMetaPatch,
        heaterTrackingWavelengthNm: sourceMeta.heaterTrackingWavelengthNm ?? sourceMeta.propagationTargetWavelengthNm ?? 1550,
        heaterPeakProminenceDb: sourceMeta.heaterPeakProminenceDb ?? 5,
        heaterCurrentUnit: sourceMeta.heaterCurrentUnit || "auto",
        heaterShiftDirection: sourceMeta.heaterShiftDirection || "increasing"
      };
      const nextPresentation = getDatasetPresentation({ projectName: "", waferName: "", sourceMeta: nextSourceMeta, rawRows: result.rows, files: files.map((file) => file.name) });
      setProjectName(nextPresentation.projectDisplayName);
      setWaferName(nextPresentation.waferDisplayName);
      setExcludedPropagationChipIds({});
      setRawRows(result.rows);
      setColumnMap(inferredMap);
      setSourceMeta(nextSourceMeta);
      setDatasetNamingDraft(createDatasetNamingDraft({
        projectName: nextPresentation.projectDisplayName,
        waferName: nextPresentation.waferDisplayName,
        selectedDate: "",
        rawRows: result.rows,
        sourceMeta: nextSourceMeta,
        files: files.map((file) => file.name)
      }));
      setQuickDatasetSelection("");
      setSelectedChip(result.rows[0]?.chip_id || "");
      setSelectedWaferMetric("heater");
      setActiveTab("heater");
      setStatusMessage(`Loaded ${result.rows.length} normalized heater rows across ${result.groups} heater group(s).`);
      appendAudit("upload", "Heater folder uploaded", `Loaded ${result.rows.length} heater rows from ${files.length} file(s).`);
      pushToast("Heater workspace updated", `${result.groups} heater group${result.groups === 1 ? "" : "s"} loaded successfully.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown heater upload error.";
      setStatusMessage(`Heater upload failed: ${detail}`);
      appendAudit("upload", "Heater upload failed", detail);
      pushToast("Heater upload failed", detail, "danger");
    } finally {
      setIsUploadingHeaterFiles(false);
      if (event.target) event.target.value = "";
    }
  }
  async function loadSpectrumViewerFiles(files) {
    if (!files.length || isUploadingSpectrumViewerFiles) return;
    const inferredInputUnit = inferSpectrumInputUnit(files);
    setSpectrumViewerInputUnit(inferredInputUnit);
    setIsUploadingSpectrumViewerFiles(true);
    try {
      const series = await Promise.all(
        files.map((file) => readSpectrumFile(file, { traceValueUnit: inferredInputUnit, launchPowerDbm: sourceMeta.launchPowerDbm ?? appSettings.launchPowerDbm }))
      );
      setSpectrumViewerSeries((previous) => {
        const next = [...previous];
        series.forEach((item, index) => {
          next.push({
            ...item,
            id: `${item.fileName}-${Date.now()}-${index}`,
            visible: true
          });
        });
        return next;
      });
      if (!String(spectrumViewerTitle || "").trim()) {
        const nextCount = spectrumViewerSeries.length + series.length;
        setSpectrumViewerTitle(nextCount === 1 ? (series[0]?.label || "Spectrum Viewer") : "Spectrum Viewer Comparison");
      }
      setStatusMessage(series.length === 1 ? `Added ${series[0].fileName} to Spectrum Viewer.` : `Added ${series.length} traces to Spectrum Viewer.`);
      appendAudit("upload", "Spectrum viewer files uploaded", `Loaded ${series.length} spectrum file(s) using ${inferredInputUnit} input mode.`);
      pushToast("Spectrum viewer updated", `${series.length} trace${series.length === 1 ? "" : "s"} added to the viewer.`, "success");
      setActiveTab("spectrum-viewer");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown spectrum upload error.";
      setStatusMessage(`Spectrum Viewer upload failed: ${detail}`);
      appendAudit("upload", "Spectrum viewer upload failed", detail);
      pushToast("Spectrum viewer upload failed", detail, "danger");
    } finally {
      setIsUploadingSpectrumViewerFiles(false);
      setIsSpectrumViewerDragging(false);
    }
  }

  async function loadAdvancedSpectrumViewerFiles(files) {
    if (!files.length || isUploadingAdvancedSpectrumViewerFiles) return;
    const inferredInputUnit = inferSpectrumInputUnit(files);
    setAdvancedSpectrumViewerInputUnit(inferredInputUnit);
    setIsUploadingAdvancedSpectrumViewerFiles(true);
    try {
      const series = await Promise.all(
        files.map((file) => readSpectrumFile(file, { traceValueUnit: inferredInputUnit, launchPowerDbm: sourceMeta.launchPowerDbm ?? appSettings.launchPowerDbm }))
      );
      setAdvancedSpectrumViewerSeries((previous) => {
        const next = [...previous];
        series.forEach((item, index) => {
          next.push({
            ...item,
            id: `${item.fileName}-${Date.now()}-advanced-${index}`,
            visible: true
          });
        });
        return next;
      });
      if (!String(advancedSpectrumViewerTitle || "").trim()) {
        const nextCount = advancedSpectrumViewerSeries.length + series.length;
        setAdvancedSpectrumViewerTitle(nextCount === 1 ? (series[0]?.label || "Spectrum Viewer") : "Spectrum Viewer Comparison");
      }
      const allSeries = [...advancedSpectrumViewerSeries, ...series];
      const wavelengthMin = allSeries.length ? Math.min(...allSeries.map((item) => item.wavelengthMinNm)) : null;
      const wavelengthMax = allSeries.length ? Math.max(...allSeries.map((item) => item.wavelengthMaxNm)) : null;
      if (wavelengthMin !== null && wavelengthMax !== null) {
        setAdvancedSpectrumViewerStartWavelengthNm(String(wavelengthMin));
        setAdvancedSpectrumViewerStopWavelengthNm(String(wavelengthMax));
      }
      setStatusMessage(series.length === 1 ? `Added ${series[0].fileName} to Spectrum Viewer (Advanced).` : `Added ${series.length} traces to Spectrum Viewer (Advanced).`);
      appendAudit("upload", "Advanced spectrum viewer files uploaded", `Loaded ${series.length} advanced spectrum file(s) using ${inferredInputUnit} input mode.`);
      pushToast("Advanced spectrum viewer updated", `${series.length} trace${series.length === 1 ? "" : "s"} added to the advanced viewer.`, "success");
      setActiveTab("spectrum-viewer-advanced");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown spectrum upload error.";
      setStatusMessage(`Spectrum Viewer (Advanced) upload failed: ${detail}`);
      appendAudit("upload", "Advanced spectrum viewer upload failed", detail);
      pushToast("Advanced spectrum viewer upload failed", detail, "danger");
    } finally {
      setIsUploadingAdvancedSpectrumViewerFiles(false);
      setIsAdvancedSpectrumViewerDragging(false);
    }
  }

  async function handleSpectrumViewerUpload(event) {
    const files = Array.from(event.target.files || []);
    await loadSpectrumViewerFiles(files);
    if (event.target) event.target.value = "";
  }

  async function handleSpectrumViewerDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    await loadSpectrumViewerFiles(files);
  }
  async function handleAdvancedSpectrumViewerUpload(event) {
    const files = Array.from(event.target.files || []);
    await loadAdvancedSpectrumViewerFiles(files);
    if (event.target) event.target.value = "";
  }

  async function handleAdvancedSpectrumViewerDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    await loadAdvancedSpectrumViewerFiles(files);
  }
  function resetSpectrumViewerAnalysisControls() {
    setShowAdvancedSpectrumViewerPeakPosition(false);
    setSpectrumViewerPeakDetectionEnabled(false);
    setSpectrumViewerPeakType("minima");
    setSpectrumViewerPeakSpacingNm(0.5);
    setSpectrumViewerPeakProminence(0.2);
    setAdvancedSpectrumViewerStartWavelengthNm("");
    setAdvancedSpectrumViewerStopWavelengthNm("");
    setAdvancedSpectrumViewerYAxisMin("");
    setAdvancedSpectrumViewerYAxisMax("");
    setAdvancedSpectrumViewerComparisonSeriesA("");
    setAdvancedSpectrumViewerComparisonSeriesB("");
  }
  function resetAdvancedSpectrumViewerVerticalRange() {
    setAdvancedSpectrumViewerYAxisMin("");
    setAdvancedSpectrumViewerYAxisMax("");
  }
  function clearWorkspace() {
    const nextSourceMeta = buildDefaultSourceMeta(appSettings);
    setProjectName(""); setWaferName(""); setSelectedDate(""); setRawRows([]); setColumnMap({}); setSelectedChip(""); setQuickDatasetSelection(""); setExcludedPropagationChipIds({});
    setSourceMeta(nextSourceMeta);
    setDatasetNamingDraft(createDatasetNamingDraft({ sourceMeta: nextSourceMeta, rawRows: [] }));
    setStatusMessage("Workspace cleared. Upload a measurement set or load a saved project to begin.");
    setActiveTab("propagation");
    appendAudit("workspace", "Workspace cleared", "Cleared the current wafer analysis workspace.");
  }
  async function fetchBundledDatasetBundle(definition, onProgress) {
    const fileNames = definition.files?.length ? definition.files : bundledTraceNames(definition);
    const metadataPromise = definition.metadata
      ? Promise.resolve(definition.metadata)
      : definition.metadataFile
        ? fetch(bundledAssetUrl(`${definition.folder}/metadata.json`), { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
        : Promise.resolve(null);
    const configPromise = definition.waveguideConfig
      ? Promise.resolve(definition.waveguideConfig)
      : definition.configFile
        ? fetch(bundledAssetUrl(`${definition.folder}/waveguide-config.json`), { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
        : Promise.resolve(null);
    const rowSets = await readItemsInBatches(
      fileNames,
      async (fileName) => {
        const response = await fetch(bundledAssetUrl(`${definition.folder}/${fileName}`));
        if (!response.ok) {
          throw new Error(`Unable to fetch ${fileName}`);
        }
        const text = await response.text();
        return readNamedTextRows(fileName, text, {
          launchPowerDbm: sourceMeta.launchPowerDbm ?? appSettings.launchPowerDbm,
          defaultMetricFamily: sourceMeta.defaultMetricFamily ?? appSettings.defaultMetricFamily,
          defaultWavelengthNm: sourceMeta.defaultWavelengthNm ?? appSettings.defaultWavelengthNm,
          traceValueUnit: sourceMeta.traceInputUnit || appSettings.traceInputUnit || "watts"
        });
      },
      BUNDLED_ANALYSIS_BATCH_SIZE,
      onProgress
    );
    const metadata = await metadataPromise;
    const waveguideConfig = await configPromise;
    const rows = rowSets.flat();
    const fallbackSettings = buildWaveguideSettingsPatch(sourceMeta);
    const configuredSettings = waveguideConfig ? buildWaveguideSettingsPatch(waveguideConfig) : fallbackSettings;
    const savedReview = normalizeDatasetAnalyticsReview(metadata?.analyticsReview);
    const reviewedPropagationSettings = {
      propagationTargetWavelengthNm: savedReview.propagationSettings?.propagationTargetWavelengthNm,
      propagationWindowNm: savedReview.propagationSettings?.propagationWindowNm,
      propagationSpectralStepNm: savedReview.propagationSettings?.propagationSpectralStepNm,
      propagationMseThreshold: savedReview.propagationSettings?.propagationMseThreshold
    };
    const nextSourceMeta = applyWaveguideSettingsToSourceMeta(
      {
        ...buildDefaultSourceMeta(appSettings),
        ...fallbackSettings,
        name: definition.label,
        type: definition.sourceType,
        traceInputUnit: sourceMeta.traceInputUnit || appSettings.traceInputUnit || "watts"
      },
      {
        ...configuredSettings,
        ...Object.fromEntries(Object.entries(reviewedPropagationSettings).filter(([, value]) => value !== null && value !== undefined))
      }
    );
    const inferredMap = inferColumnMap(Object.keys(rows[0] || {}));
    const nextProjectName = metadata?.projectName || definition.projectDisplayName || definition.projectName;
    const nextWaferName = metadata?.waferName || definition.waferDisplayName || definition.waferName;

    return {
      fileNames,
      rows,
      metadata,
      waveguideConfig,
      sourceMeta: nextSourceMeta,
      columnMap: inferredMap,
      projectName: nextProjectName,
      waferName: nextWaferName
    };
  }
  async function loadBundledDataset(definition, libraryKind = "dataset") {
    setLoadingBundledId(definition.id);
    try {
      const {
        fileNames,
        rows,
        metadata,
        waveguideConfig,
        sourceMeta: nextSourceMeta,
        columnMap: inferredMap,
        projectName: nextProjectName,
        waferName: nextWaferName
      } = await fetchBundledDatasetBundle(definition);
      const savedReview = normalizeDatasetAnalyticsReview(metadata?.analyticsReview);
      const excludedChipLookup = Object.fromEntries(
        (savedReview.excludedChipIds || []).map((chipId) => [String(chipId), true])
      );
      setProjectName(nextProjectName);
      setWaferName(nextWaferName);
      setExcludedPropagationChipIds(excludedChipLookup);
      setRawRows(rows);
      setColumnMap(inferredMap);
      setSourceMeta(nextSourceMeta);
      setDatasetNamingDraft(createDatasetNamingDraft({
        ...definition,
        metadata,
        projectName: nextProjectName,
        waferName: nextWaferName,
        selectedDate: definition.selectedDate,
        rawRows: rows,
        sourceMeta: nextSourceMeta
      }));
      setQuickDatasetSelection(`github:${definition.id}`);
      setSelectedWaferMetric("propagation");
      setSelectedChip(rows[0]?.chip_id || "");
      setActiveTab("propagation");
      setStatusMessage(
        savedReview.excludedChipIds.length
          ? `Loaded bundled sample ${definition.label} from GitHub-hosted files (${fileNames.length} traces) with ${savedReview.excludedChipIds.length} saved chip exclusions.`
          : `Loaded bundled sample ${definition.label} from GitHub-hosted files (${fileNames.length} traces).`
      );
      pushToast(
        "Dataset loaded",
        waveguideConfig
          ? `${definition.label} loaded with its saved waveguide configuration.`
          : `${definition.label} loaded with the current page waveguide defaults.`,
        "success"
      );
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
  async function analyzeBundledDataset(definition) {
    const bundle = await fetchBundledDatasetBundle(
      definition,
      (completed, total) => {
        setRemoteLibraryStatus(`Analysing ${definition.label}: loaded ${completed}/${total} trace files.`);
      }
    );
    const existingSummary = normalizeDatasetAnalyticsSummary(
      definition.analyticsSummary || bundle.metadata?.analyticsSummary
    );
    if (
      existingSummary.propagationAverage !== null
      && existingSummary.yield !== null
      && existingSummary.measuredChips !== null
    ) {
      return existingSummary;
    }

    const summary = buildDatasetAnalyticsSummary({
      rawRows: bundle.rows,
      columnMap: bundle.columnMap,
      sourceMeta: bundle.sourceMeta
    });

    setRemoteLibraryDatasets((previous) => previous.map((dataset) => (
      dataset.id === definition.id
        ? { ...dataset, analyticsSummary: summary }
        : dataset
    )));

    return summary;
  }
  function updatePropagationDraftField(field, value) {
    setPropagationDraft((previous) => updatePropagationDraft(previous, field, value));
  }
  function updateWaveguideDraftLength(index, value) {
    setPropagationDraft((previous) => ({
      ...previous,
      propagationWaveguideManualMode: true,
      waveguideLengthByIndex: {
        ...previous.waveguideLengthByIndex,
        [index]: value
      }
    }));
  }
  function resetPropagationDraft() {
    setPropagationDraft(propagationDraftFromSourceMeta(sourceMeta));
  }
  function applyPropagationDraft() {
    let patch;
    try {
      patch = validatePropagationDraft(propagationDraft);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Review the propagation settings.";
      setStatusMessage(detail);
      pushToast("Settings need attention", detail, "danger");
      return;
    }

    const nextSourceMeta = applyWaveguideSettingsToSourceMeta(sourceMeta, patch);
    const nextFingerprint = propagationSettingsFingerprint(nextSourceMeta);
    if (nextFingerprint === appliedPropagationFingerprint) return;

    setPendingPropagationFingerprint(nextFingerprint);
    setStatusMessage("Applying propagation settings and recalculating the analysis...");
    window.requestAnimationFrame(() => {
      startTransition(() => setSourceMeta(nextSourceMeta));
    });
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
  function buildCurrentReportNaming() {
    const presented = getDatasetPresentation({ projectName, waferName, sourceMeta, rawRows: currentRows });
    const datasetIdentity = buildDatasetSnapshotMetadata({
      projectName,
      waferName,
      selectedDate,
      rawRows: currentRows,
      sourceMeta,
      namingOverrides: datasetNamingDraft
    });
    const datasetBaseName = buildStandardDatasetBaseName({
      mpw: datasetIdentity.mpw || presented.projectDisplayName || projectName || "MPWUNDEFINED",
      platform: datasetIdentity.platformLabel || sourceMeta.platform || sourceMeta.platformId || "220nmSOI",
      slot: datasetIdentity.slot || presented.slot || waferName || "SlotUndefined",
      waveguideDescriptor: presented.waveguideType || "StripWaveguide",
      measurementType: datasetIdentity.measurementType || "PropagationLoss",
      mode: /wst/i.test(datasetIdentity.measurementMode || "") ? "WST" : "Manual"
    });

    return {
      presented,
      datasetBaseName,
      exportProjectCode: presented.projectDisplayName || projectName || "MPWUNDEFINED",
      exportSlot: presented.slot || waferName || "SlotUndefined"
    };
  }
  async function saveCurrentWafermapPng() {
    if (!currentWaferCells.length) {
      const message = "No wafermap is available to export yet.";
      setStatusMessage(message);
      pushToast("Wafermap export skipped", message, "danger");
      return;
    }

    const { datasetBaseName } = buildCurrentReportNaming();
    const metricName = metricLabel(selectedWaferMetric).replace(/\s+/g, "");
    try {
      const png = await buildWaferMapPng({
        cells: currentWaferCells,
        metricKey: selectedWaferMetric,
        overlayMode: waferMapOverlayMode,
        templateName: currentWaferTemplate?.name || "",
        title: `Wafermap - ${metricLabel(selectedWaferMetric)}`,
        subtitle: `${projectName || "MPWUNDEFINED"} | ${waferName || "SlotUndefined"}${selectedDate ? ` | ${selectedDate}` : ""}`,
        colorScaleMin: sourceMeta.waferColorScaleMin,
        colorScaleMid: sourceMeta.waferColorScaleMid,
        colorScaleMax: sourceMeta.waferColorScaleMax
      });
      downloadAssetBlob(png, `${datasetBaseName}_wafermap_${metricName}.png`);
      setStatusMessage(`Saved wafermap PNG for ${metricLabel(selectedWaferMetric)}.`);
      pushToast("Wafermap PNG ready", `${metricLabel(selectedWaferMetric)} saved as a PNG.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown wafermap export error.";
      setStatusMessage(`Wafermap PNG export failed: ${detail}`);
      pushToast("Wafermap export failed", detail, "danger");
    }
  }
  function openCurrentWafermapFigure() {
    if (!currentWaferCells.length) {
      const message = "No wafermap is available to open yet.";
      setStatusMessage(message);
      pushToast("Wafermap figure skipped", message, "danger");
      return;
    }

    const title = `Wafermap - ${metricLabel(selectedWaferMetric)}`;
    const subtitle = `${projectName || "MPWUNDEFINED"} | ${waferName || "SlotUndefined"}${selectedDate ? ` | ${selectedDate}` : ""}`;
    const { svg } = buildWaferMapSvgDocument({
      cells: currentWaferCells,
      metricKey: selectedWaferMetric,
      overlayMode: waferMapOverlayMode,
      templateName: currentWaferTemplate?.name || "",
      title,
      subtitle,
      colorScaleMin: sourceMeta.waferColorScaleMin,
      colorScaleMid: sourceMeta.waferColorScaleMid,
      colorScaleMax: sourceMeta.waferColorScaleMax
    });
    openWaferMapFigureWindow({ svg, title });
  }
  function exportNormalizedCsv() { downloadBlob(normalizedRowsToCsv(normalizedRows), "normalized-wafer-measurements.csv", "text/csv;charset=utf-8"); appendAudit("export", "Normalized CSV exported", `Exported ${normalizedRows.length} normalized rows to CSV.`); }
  function exportReportJson() {
    const safeWafer = waferName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "wafer";
    const reportTitle = `Wafer Report - ${waferName}`;
    downloadBlob(JSON.stringify(reportState, null, 2), `${safeWafer}-report-summary.json`, "application/json");
    downloadBlob(buildHtmlReport(reportState, reportTitle), `${safeWafer}-report-summary.html`, "text/html;charset=utf-8");
    appendAudit("export", "Report summary exported", `Exported HTML and JSON reports for ${waferName}.`);
  }
  async function generatePostProcessedFiles() {
    if (!metrics.propagation.byChip.length) {
      const message = "Load a propagation-loss dataset before generating post-processed files.";
      setStatusMessage(message);
      pushToast("Export skipped", message, "danger");
      return;
    }

    setIsGeneratingPostProcessed(true);
    const { datasetBaseName, exportProjectCode, exportSlot } = buildCurrentReportNaming();

    try {
      const result = await generatePostProcessedArchive({
        projectCode: exportProjectCode,
        slot: exportSlot,
        datasetBaseName,
        selectedDate,
        sourceMeta,
        metrics,
        currentWaferTemplate,
        currentWaferCells,
        onProgress: (message) => setStatusMessage(message)
      });
      downloadBlob(result.zipBlob, `${result.baseName}.zip`, "application/zip");
      const detail = `Generated ${result.fileCount} files for ${result.chipCount} chip(s) in ${result.baseName}.zip.`;
      setStatusMessage(detail);
      appendAudit("export", "Post-processed package exported", detail);
      pushToast("Post-processed files ready", `${result.chipCount} chip(s) packaged for download.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown export error.";
      setStatusMessage(`Post-processed export failed: ${detail}`);
      appendAudit("export", "Post-processed package failed", detail);
      pushToast("Post-processed export failed", detail, "danger");
    } finally {
      setIsGeneratingPostProcessed(false);
    }
  }
  async function generatePowerPointDeck() {
    if (!metrics.propagation.byChip.length) {
      const message = "Load a propagation-loss dataset before generating the PowerPoint report.";
      setStatusMessage(message);
      pushToast("PPT export skipped", message, "danger");
      return;
    }

    setIsGeneratingPptReport(true);
    const { datasetBaseName, exportProjectCode, exportSlot } = buildCurrentReportNaming();

    try {
      const { generatePowerPointReport } = await import("./lib/reportGenerator");
      const result = await generatePowerPointReport({
        projectCode: exportProjectCode,
        slotLabel: exportSlot,
        datasetBaseName,
        selectedDate,
        sourceMeta,
        metrics,
        currentWaferTemplate,
        currentWaferCells,
        onProgress: (message) => setStatusMessage(message)
      });
      downloadBlob(result.blob, result.fileName, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      const detail = `Generated ${result.fileName} with ${result.chipCount} chip slides across ${result.slideCount} total slides.`;
      setStatusMessage(detail);
      appendAudit("export", "PowerPoint report exported", detail);
      pushToast("PowerPoint report ready", `${result.chipCount} chip slides exported to ${result.fileName}.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown PowerPoint export error.";
      setStatusMessage(`PowerPoint export failed: ${detail}`);
      appendAudit("export", "PowerPoint report failed", detail);
      pushToast("PowerPoint export failed", detail, "danger");
    } finally {
      setIsGeneratingPptReport(false);
    }
  }
  async function generateWordDeck() {
    if (!metrics.propagation.byChip.length) {
      const message = "Load a propagation-loss dataset before generating the Word report.";
      setStatusMessage(message);
      pushToast("Word export skipped", message, "danger");
      return;
    }

    setIsGeneratingWordReport(true);
    const { datasetBaseName, exportProjectCode, exportSlot } = buildCurrentReportNaming();

    try {
      const { generateWordReport } = await import("./lib/reportGenerator");
      const result = await generateWordReport({
        projectCode: exportProjectCode,
        slotLabel: exportSlot,
        datasetBaseName,
        selectedDate,
        sourceMeta,
        metrics,
        currentWaferTemplate,
        currentWaferCells,
        onProgress: (message) => setStatusMessage(message)
      });
      downloadBlob(result.blob, result.fileName, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const detail = `Generated ${result.fileName} with ${result.chipCount} chip section(s).`;
      setStatusMessage(detail);
      appendAudit("export", "Word report exported", detail);
      pushToast("Word report ready", `${result.chipCount} chip section(s) exported to ${result.fileName}.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Word export error.";
      setStatusMessage(`Word export failed: ${detail}`);
      appendAudit("export", "Word report failed", detail);
      pushToast("Word export failed", detail, "danger");
    } finally {
      setIsGeneratingWordReport(false);
    }
  }
  async function generatePdfDeck() {
    if (!metrics.propagation.byChip.length) {
      const message = "Load a propagation-loss dataset before generating the PDF report.";
      setStatusMessage(message);
      pushToast("PDF export skipped", message, "danger");
      return;
    }

    setIsGeneratingPdfReport(true);
    const { datasetBaseName, exportProjectCode, exportSlot } = buildCurrentReportNaming();

    try {
      const { generatePdfReport } = await import("./lib/reportGenerator");
      const result = await generatePdfReport({
        projectCode: exportProjectCode,
        slotLabel: exportSlot,
        datasetBaseName,
        selectedDate,
        sourceMeta,
        metrics,
        currentWaferTemplate,
        currentWaferCells,
        onProgress: (message) => setStatusMessage(message)
      });
      downloadBlob(result.blob, result.fileName, "application/pdf");
      const detail = `Generated ${result.fileName} with ${result.chipCount} chip section(s).`;
      setStatusMessage(detail);
      appendAudit("export", "PDF report exported", detail);
      pushToast("PDF report ready", `${result.chipCount} chip section(s) exported to ${result.fileName}.`, "success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown PDF export error.";
      setStatusMessage(`PDF export failed: ${detail}`);
      appendAudit("export", "PDF report failed", detail);
      pushToast("PDF export failed", detail, "danger");
    } finally {
      setIsGeneratingPdfReport(false);
    }
  }
  function saveCurrentProject() { const snapshotCapacity = evaluateLocalSnapshotCapacity(currentRows, sourceMeta); if (!supportsIndexedDbPersistence() && !snapshotCapacity.ok) { const detail = `Project save skipped. ${snapshotCapacity.reason}`; setStatusMessage(detail); appendAudit("project", "Project save skipped", detail); pushToast("Project save skipped", "This workspace is too large for reliable browser storage.", "progress"); return; } const currentPresentation = getDatasetPresentation({ projectName, waferName, sourceMeta, rawRows: currentRows }); const projectRecord = { id: createId("project"), projectName: currentPresentation.projectDisplayName, waferName: currentPresentation.waferDisplayName, slot: currentPresentation.slot, waveguideType: currentPresentation.waveguideType, measurementMode: currentPresentation.measurementMode, measurementType: currentPresentation.measurementType, datasetLabel: sourceMeta?.name || `${currentPresentation.projectDisplayName} ${currentPresentation.slot}`, selectedDate, activeTab: isWorkspaceTab ? activeTab : "propagation", selectedWaferMetric, selectedChip, excludedPropagationChipIds, rawRows: currentRows, columnMap: currentMap, sourceMeta, summary: datasetSummary, savedAt: new Date().toISOString() }; setSavedProjects((previous) => [projectRecord, ...previous].slice(0, 30)); appendAudit("project", "Project saved", `Saved project ${currentPresentation.projectDisplayName} for slot ${currentPresentation.slot}.`); setStatusMessage(`Saved project ${currentPresentation.projectDisplayName}. You can reopen it later from the Projects section.`); }
  function loadProject(project) { const presented = presentDataset(project); setProjectName(presented.projectDisplayName); setWaferName(presented.waferDisplayName); setSelectedDate(project.selectedDate); setRawRows(project.rawRows || []); setColumnMap(project.columnMap || {}); setSourceMeta(project.sourceMeta || buildDefaultSourceMeta(appSettings)); setQuickDatasetSelection(""); setSelectedWaferMetric(project.selectedWaferMetric || "propagation"); setSelectedChip(project.selectedChip || ""); setExcludedPropagationChipIds(project.excludedPropagationChipIds || {}); setActiveTab(project.activeTab || "propagation"); setStatusMessage(`Loaded project ${presented.projectDisplayName} from local browser storage.`); appendAudit("project", "Project loaded", `Loaded project ${presented.projectDisplayName} for wafer run ${presented.waferDisplayName}.`); }
  function deleteProject(projectId) { const target = savedProjects.find((project) => project.id === projectId); setSavedProjects((previous) => previous.filter((project) => project.id !== projectId)); appendAudit("project", "Project deleted", `Deleted saved project ${target?.projectName || projectId}.`); }
  function saveCurrentDataset(autoSaved = false) { const snapshotCapacity = evaluateLocalSnapshotCapacity(currentRows, sourceMeta); if (!supportsIndexedDbPersistence() && !snapshotCapacity.ok) { const detail = `Dataset save skipped. ${snapshotCapacity.reason}`; setStatusMessage(detail); appendAudit("dataset", autoSaved ? "Dataset auto-save skipped" : "Dataset save skipped", detail); pushToast(autoSaved ? "Auto-save skipped" : "Dataset save skipped", "This dataset is too large for reliable browser storage.", "progress"); return; } const snapshot = rememberDatasetSnapshot(autoSaved, currentRows, currentMap, sourceMeta, sourceMeta.name); appendAudit("dataset", autoSaved ? "Dataset auto-saved" : "Dataset saved", `Stored dataset ${snapshot.label} with ${snapshot.summary.rows} normalized rows.`); setStatusMessage(`Saved dataset snapshot ${snapshot.label} to the local library.`); }
  function loadDataset(dataset) { const presented = presentDataset(dataset); const rows = dataset.rawRows || []; const nextSourceMeta = dataset.sourceMeta || buildDefaultSourceMeta(appSettings); setProjectName(presented.projectDisplayName || projectName); setWaferName(presented.waferDisplayName || waferName); setSelectedDate(dataset.selectedDate || selectedDate); setRawRows(rows); setColumnMap(dataset.columnMap || {}); setSourceMeta(nextSourceMeta); setDatasetNamingDraft(createDatasetNamingDraft({ ...dataset, projectName: presented.projectDisplayName || dataset.projectName, waferName: presented.waferDisplayName || dataset.waferName, selectedDate: dataset.selectedDate || selectedDate, rawRows: rows, sourceMeta: nextSourceMeta })); setQuickDatasetSelection(`local:${dataset.id}`); setSelectedChip(rows[0]?.chip_id || ""); setExcludedPropagationChipIds({}); setActiveTab("propagation"); setSelectedWaferMetric("propagation"); setStatusMessage(`Loaded dataset snapshot ${dataset.label} from the local browser library.`); appendAudit("dataset", "Dataset loaded", `Loaded dataset ${dataset.label} for project ${presented.projectDisplayName}.`); }
  async function handleQuickDatasetLoad(value) {
    if (!value) return;
    setQuickDatasetSelection(value);
    const separator = value.indexOf(":");
    const source = value.slice(0, separator);
    const datasetId = value.slice(separator + 1);
    if (source === "github") {
      const dataset = remoteLibraryDatasets.find((item) => String(item.id) === datasetId);
      if (dataset) await loadBundledDataset(dataset, "dataset");
      return;
    }
    const dataset = currentDatasetRows.find((item) => String(item.id) === datasetId);
    if (dataset) loadDataset(dataset);
  }
  function deleteDataset(datasetId) { const target = savedDatasets.find((dataset) => dataset.id === datasetId); setSavedDatasets((previous) => previous.filter((dataset) => dataset.id !== datasetId)); appendAudit("dataset", "Dataset deleted", `Deleted dataset snapshot ${target?.label || datasetId}.`); }
  function updateGithubConfig(field, value) { setGithubConfig((previous) => ({ ...previous, [field]: value })); }
  function saveGithubConfig() { persistStoredJson(STORAGE_KEYS.github, githubConfig); setStatusMessage(`Saved GitHub sync settings for ${githubConfig.owner}/${githubConfig.repo} on ${githubConfig.branch}.`); appendAudit("github", "GitHub settings saved", `Saved GitHub dataset sync settings for ${githubConfig.owner}/${githubConfig.repo}.`); pushToast("GitHub settings saved", `${githubConfig.owner}/${githubConfig.repo} stored in this browser.`, "success"); }
  async function refreshRemoteLibrary(silent = false) {
    setRemoteLibraryStatus("Refreshing GitHub measurement library...");
    try {
      let catalog = [];
      let schemaVersion = 1;
      let analyticsIndex = [];
      const v2Response = await fetch(bundledAssetUrl("sample-data/wst/library-index-v2.json"), { cache: "no-store" });
      if (v2Response.ok) {
        catalog = await v2Response.json();
        schemaVersion = 2;
      } else {
        const response = await fetch(bundledAssetUrl("sample-data/wst/library-index.json"), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        catalog = await response.json();
      }
      const analyticsResponse = await fetch(bundledAssetUrl("sample-data/wst/library-analytics.json"), { cache: "no-store" });
      if (analyticsResponse.ok) {
        analyticsIndex = await analyticsResponse.json();
      }
      const analyticsById = new Map(
        (Array.isArray(analyticsIndex) ? analyticsIndex : []).map((entry) => [
          entry.id || entry.datasetId || entry.label,
          entry
        ])
      );
      const mergedCatalog = Array.isArray(catalog)
        ? catalog.map((entry) => {
            const analyticsEntry = analyticsById.get(entry.id || entry.datasetId || entry.label);
            return analyticsEntry
              ? {
                  ...entry,
                  analyticsSummary: analyticsEntry.analyticsSummary || entry.analyticsSummary,
                  analyticsReview: analyticsEntry.analyticsReview || entry.analyticsReview
                }
              : entry;
          })
        : [];
      const normalized = mergedCatalog.map(normalizeLibraryDataset);
      setRemoteLibraryDatasets(normalized.length ? normalized : BUNDLED_LIBRARY_DATASETS.map(normalizeLibraryDataset));
      setRemoteLibraryStatus(`GitHub measurement library refreshed. ${normalized.length} dataset folder(s) are currently published${schemaVersion >= 2 ? " with v2 metadata" : ""}${analyticsById.size ? ` and ${analyticsById.size} saved analytics records` : ""}.`);
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
        manifestPathV2: GITHUB_LIBRARY_MANIFEST_V2_PATH,
        mirrorManifestPathV2: GITHUB_LIBRARY_MANIFEST_V2_MIRROR_PATH,
        analyticsIndexPath: GITHUB_LIBRARY_ANALYTICS_PATH,
        analyticsIndexMirrorPath: GITHUB_LIBRARY_ANALYTICS_MIRROR_PATH,
        packageData,
        existingManifest: remoteLibraryDatasets,
        existingManifestV2: remoteLibraryDatasets,
        onProgress: ({ completed, total, path }) => {
          setRemoteLibraryStatus(`Publishing to GitHub: ${completed}/${total} files processed. Latest: ${path}`);
        }
      });
      setRemoteLibraryDatasets((result.manifestV2 || result.manifest).map(normalizeLibraryDataset));
      setSavedDatasets((previous) => previous.map((item) => item.id === dataset.id ? { ...item, githubSync: { status: "published", publishedAt: new Date().toISOString(), folderUrl: result.folderUrl } } : item));
      setStatusMessage(`Saved ${packageData.identity.label} to GitHub successfully.`);
      setRemoteLibraryStatus(`GitHub publish complete. ${packageData.identity.folderName} is now in the shared measurement-data library.`);
      appendAudit("github", "Dataset published to GitHub", `Published ${packageData.identity.label} into ${githubConfig.owner}/${githubConfig.repo}.`);
      pushToast("GitHub publish successful", `${packageData.identity.label} was committed to the repository.`, "success");
    } catch (error) {
      const detail = formatGithubPublishError(error, githubConfig);
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
  useEffect(() => {
    if (!selectedPublishedDatasetId) return;
    const selectedDataset = remoteLibraryDatasets.find((dataset) => dataset.id === selectedPublishedDatasetId);
    if (!selectedDataset) {
      setSelectedPublishedDatasetId("");
      setPublishedDatasetDraft({});
      return;
    }
    setPublishedDatasetDraft((previous) => (
      Object.keys(previous).length ? previous : createPublishedDatasetDraft(selectedDataset)
    ));
  }, [remoteLibraryDatasets, selectedPublishedDatasetId]);
  const loadedGithubDatasetId = selectedGithubDatasetId(quickDatasetSelection);
  const loadedGithubDataset = remoteLibraryDatasets.find((dataset) => dataset.id === loadedGithubDatasetId) || null;
  const selectedPublishedDataset = remoteLibraryDatasets.find((dataset) => dataset.id === selectedPublishedDatasetId) || null;
  const currentPublishedDatasetReview = loadedGithubDataset
    ? buildReviewedAnalyticsPayload(reportState, includedPropagationChipIds, propagationChipIds, sourceMeta)
    : null;
  const canSaveCurrentReviewToPublishedDataset = Boolean(
    selectedPublishedDataset
    && loadedGithubDataset
    && selectedPublishedDataset.id === loadedGithubDataset.id
    && currentPublishedDatasetReview?.analyticsSummary?.measuredChips
  );
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

  const currentDatasetMeta = currentRows.length ? buildDatasetSnapshotMetadata({ projectName, waferName, selectedDate, rawRows: currentRows, sourceMeta, namingOverrides: datasetNamingDraft }) : null;
  const currentDatasetRows = normalizeStoredDatasets(savedDatasets).map((dataset) => ({
    ...dataset,
    display: dataset.display || buildDatasetSnapshotMetadata(dataset),
    savedDisplay: formatSavedTime(dataset.savedAt)
  })).map((dataset) => ({
    ...dataset,
    ...getDatasetPresentation(dataset)
  }));
  const bundledProjectRows = remoteLibraryDatasets.map((definition) => {
    const presented = presentDataset(definition);
    return (
      <tr key={`bundled-project-${definition.id}`}><td>{presented.projectDisplayName || "MPWUNDEFINED"}</td><td>{presented.slot || "SlotUndefined"}</td><td>{presented.waveguideType || "WaveguideUndefined"}</td><td>{presented.measurementMode || "ModeUndefined"}</td><td>{presented.measurementType || "MeasurementTypeUndefined"}</td><td>{definition.label || definition.sourceMeta?.name || "--"}</td><td>{`${definition.traceCount} raw traces`}</td><td>Bundled with app</td><td className="library-table-actions"><button type="button" onClick={() => loadBundledDataset(definition, "project")} disabled={loadingBundledId === definition.id}>{loadingBundledId === definition.id ? "Loading..." : "Load"}</button></td></tr>
    );
  });
  const currentProjectRows = savedProjects.map((project) => {
    const presented = presentDataset(project);
    return <tr key={project.id}><td>{presented.projectDisplayName || "MPWUNDEFINED"}</td><td>{presented.slot || "SlotUndefined"}</td><td>{presented.waveguideType || "WaveguideUndefined"}</td><td>{presented.measurementMode || "ModeUndefined"}</td><td>{presented.measurementType || "MeasurementTypeUndefined"}</td><td>{project.datasetLabel || project.sourceMeta?.name || project.label || "--"}</td><td>{project.summary.rows}</td><td>{formatSavedTime(project.savedAt)}</td><td className="library-table-actions"><button type="button" onClick={() => loadProject(project)}>Load</button><button type="button" className="danger-action" onClick={() => deleteProject(project.id)}>Delete</button></td></tr>;
  });
  const bundledDatasetRows = remoteLibraryDatasets.map((definition) => (
    <tr key={`bundled-dataset-${definition.id}`}><td>{definition.label}</td><td>{presentDataset(definition).projectDisplayName || definition.projectName}</td><td>{presentDataset(definition).slot || definition.waferDisplayName || definition.waferName}</td><td>{`${definition.traceCount} raw traces`}</td><td>Bundled with app</td><td className="library-table-actions"><button type="button" onClick={() => loadBundledDataset(definition, "dataset")} disabled={loadingBundledId === definition.id}>{loadingBundledId === definition.id ? "Loading..." : "Load"}</button></td></tr>
  ));
  const auditRows = auditLog.map((entry) => (
    <tr key={entry.id}><td>{entry.title}</td><td>{entry.kind}</td><td>{entry.detail}</td><td>{formatSavedTime(entry.timestamp)}</td></tr>
  ));

  return (
    <div className="dashboard-page">
      <ToastTray items={toastItems} />
      <div className="dashboard-shell">
        <aside className="dashboard-rail">
          <div className="brand-mark">
            {brandLogoAvailable ? <img className="brand-logo" src={bundledAssetUrl("cornerstone_logo.png")} alt="CORNERSTONE" onError={() => setBrandLogoAvailable(false)} /> : <div className="brand-wafer" aria-label="CORNERSTONE logo placeholder" />}
          </div>
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
              <label className="filter-field quick-dataset-field">
                <span>Quick Load Dataset</span>
                <div>
                  <i>Data</i>
                  <select aria-label="Quick Load Dataset" value={quickDatasetSelection} onChange={(event) => handleQuickDatasetLoad(event.target.value)} disabled={Boolean(loadingBundledId)}>
                    <option value="">{loadingBundledId ? "Loading dataset..." : "Select a GitHub or local dataset"}</option>
                    <optgroup label="GitHub Measurement Data Library">
                      {remoteLibraryDatasets.map((dataset) => <option key={`quick-github-${dataset.id}`} value={`github:${dataset.id}`}>{quickDatasetLabel(dataset)}</option>)}
                    </optgroup>
                    {currentDatasetRows.length ? <optgroup label="Local Dataset Snapshots">
                      {currentDatasetRows.map((dataset) => <option key={`quick-local-${dataset.id}`} value={`local:${dataset.id}`}>{quickDatasetLabel(dataset)}</option>)}
                    </optgroup> : null}
                  </select>
                </div>
              </label>
              <label className="upload-measurement-button"><input type="file" multiple accept=".txt,.csv,.xlsx,.xls" onChange={handleFileUpload} disabled={isUploadingFiles} /><span>{isUploadingFiles ? "Processing Files..." : "Upload Measurement Files"}</span></label>
            </div>
          </header>

          <nav className="analysis-tabs">
            {APP_TABS.map((tab) => <button key={tab.id} type="button" className={tab.id === activeTab ? "analysis-tab active" : "analysis-tab"} onClick={() => updateTab(tab.id)}>{tab.label}</button>)}
          </nav>

          {isWorkspaceTab ? <>
            <section className="hero-stats-row">
              <ShellStat label={primaryMetric.title} value={primaryMetricDisplay} note="Across all matched dies" tone="primary" icon={primaryMetric.icon} />
              <ShellStat label={secondaryMetric.label} value={secondaryMetric.value} note={secondaryMetric.note} tone="secondary" icon={secondaryMetric.icon} />
              <ShellStat label="Devices" value={datasetSummary.rows.toLocaleString()} note={`Across ${sourceCount(normalizedRows)} uploaded source files`} tone="mint" icon="Dev" />
              <ShellStat label="Wavelength" value={`${sourceMeta.propagationTargetWavelengthNm} nm`} note={`Window +/- ${sourceMeta.propagationWindowNm} nm`} tone="orange" icon="WL" />
              <ShellStat label="Sources" value={(sourceCount(normalizedRows) || (rawRows.length ? 1 : 0)).toString()} note={rawRows.length ? sourceMeta.type : "No source loaded"} tone="rose" icon="Src" />
              <ShellStat label="Wafer Yield" value={propagationYield !== null && propagationYield !== undefined ? `${propagationYield.toFixed(1)}%` : "--"} note={`Pass criteria: MSE <= ${sourceMeta.propagationMseThreshold}`} tone="yield" icon="Yield" />
            </section>

            {activeTab === "propagation" ? (
              <PropagationSettingsPanel
                draft={propagationDraft}
                hasChanges={propagationHasChanges}
                isApplying={isApplyingPropagation}
                isExpanded={isPropagationSettingsExpanded}
                onNumberChange={updatePropagationDraftField}
                onLengthChange={updateWaveguideDraftLength}
                onApply={applyPropagationDraft}
                onReset={resetPropagationDraft}
                onToggleExpanded={() => setIsPropagationSettingsExpanded((previous) => !previous)}
              />
            ) : null}

            {activeTab === "propagation" ? <MatlabSummaryPanel summary={reportState.matlabSummary} /> : null}

{activeTab === "heater" ? <HeaterEfficiencyPanel sourceMeta={sourceMeta} heaterMetrics={metrics.heater} statusMessage={statusMessage} isUploading={isUploadingHeaterFiles} onFolderUpload={handleHeaterUpload} onFileUpload={handleHeaterUpload} onConfigChange={(field, value) => setSourceMeta((previous) => ({ ...previous, [field]: value }))} /> : null}
                        <section className={activeTab === "propagation" ? "analysis-top-grid propagation-overview-grid" : "analysis-top-grid"}>
              <article className="analysis-card analysis-chart-card overview-fit-card">
                <div className="analysis-card-head">
                  <div>
                    <h2>{activeMetricKey === "heater" ? "Heater Efficiency" : activeMetricKey === "insertion" ? insertionProfile.label || "Insertion Loss" : "Propagation Loss"}</h2>
                    <PlotLegend items={legendItems} />
                  </div>
                  <div className="analysis-card-controls propagation-headline-controls">
                    {activeMetricKey === "propagation" ? <>
                      <span>{`Lambda0 ${sourceMeta.propagationTargetWavelengthNm} nm`}</span>
                      <span>{`Window +/- ${sourceMeta.propagationWindowNm} nm`}</span>
                      <span>{`MSE <= ${sourceMeta.propagationMseThreshold}`}</span>
                      <select value={selectedChip} onChange={(event) => setSelectedChip(event.target.value)}>{activeChipOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                      <button type="button" className="secondary-action" onClick={generatePostProcessedFiles} disabled={isGeneratingPostProcessed || !metrics.propagation.byChip.length}>{isGeneratingPostProcessed ? "Generating Files..." : "Generate Post-Processed Files"}</button>
                    </> : activeMetricKey === "insertion" ? <>
                      <label className="inline-select-field compact-inline-field"><span>Device</span><select value={insertionDeviceType} onChange={(event) => setInsertionDeviceType(event.target.value)}>{Object.entries(metrics.insertion.deviceProfiles || {}).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></label>
                      <label className="inline-select-field compact-inline-field"><span>Metric</span><select value={insertionMetricField} onChange={(event) => setInsertionMetricField(event.target.value)}>{insertionMetricOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label className="inline-select-field compact-inline-field"><span>Chip</span><select value={selectedChip} onChange={(event) => setSelectedChip(event.target.value)}>{activeChipOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                      <span>{insertionProfile.description || "Device-specific insertion-loss analysis across the wafer."}</span>
                    </> : <>
                      <span>{`${activeMetricItems.length} selected dies`}</span>
                      <span>{sourceMeta.type}</span>
                      <span>{`${datasetSummary.families.join(", ") || "single metric"}`}</span>
                    </>}
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
                      insertionMetricField={insertionMetricField}
                      emptyMessage={activeMetricKey === "insertion" ? "Upload or load insertion-loss rows to compare building-block performance by chip." : "Upload or load heater measurements to compare pi-power performance by chip."}
                    />
                  )}
                  <MetricInspector metricKey={activeMetricKey} item={activeMetricDetail} sourceMeta={sourceMeta} insertionDeviceLabel={insertionProfile.label || "Selected Device"} />
                </div>
              </article>

              <article className="analysis-card analysis-wafer-card overview-wafer-card">
                <div className="analysis-card-head">
                  <div><h2>Wafermap - {metricLabel(selectedWaferMetric)}</h2></div>
                  <div className="analysis-card-controls compact">
                    <button type="button" className="ghost-action" onClick={openCurrentWafermapFigure} disabled={!currentWaferCells.length}>Open Figure</button>
                    <button type="button" className="ghost-action" onClick={saveCurrentWafermapPng} disabled={!currentWaferCells.length}>Save PNG</button>
                    <span>Metric</span>
                    <select value={selectedWaferMetric} onChange={(event) => setSelectedWaferMetric(event.target.value)}>
                      <option value="propagation">Propagation Loss</option>
                      <option value="insertion">Insertion Loss</option>
                      <option value="heater">Heater Efficiency</option>
                    </select>
                  </div>
                </div>
                <WaferMapPanel
                  cells={currentWaferCells}
                  metricKey={selectedWaferMetric}
                  selectedChip={selectedChip}
                  onSelect={setSelectedChip}
                  overlayMode={waferMapOverlayMode}
                  templateName={currentWaferTemplate?.name || ""}
                  notchOrientation={currentWaferTemplate?.notchOrientation || "south"}
                  colorScaleMin={sourceMeta.waferColorScaleMin}
                  colorScaleMid={sourceMeta.waferColorScaleMid}
                  colorScaleMax={sourceMeta.waferColorScaleMax}
                />
                <div className="wafer-footer-bar">
                  <label><span>Show</span><select value={waferMapDisplayMode} onChange={(event) => setWaferMapDisplayMode(event.target.value)}><option value="all">All Chips</option><option value="passing">Passed Chips</option><option value="failed">Failed Chips</option><option value="measured">Measured Chips</option></select></label>
                  <label><span>Overlay</span><select value={waferMapOverlayMode} onChange={(event) => setWaferMapOverlayMode(event.target.value)}><option value="none">None</option><option value="chip">Chip ID</option><option value="value">Metric value</option></select></label>
                  <label><span>Template</span><select value={currentWaferTemplate?.id || defaultWaferTemplateId()} onChange={(event) => { const match = allWaferTemplates.find((template) => template.id === event.target.value); if (match) useWaferTemplate(match); }}><option value="">Select</option>{allWaferTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                  <label className="wafer-scale-control low"><span><i aria-hidden="true" />Scale Min</span><input type="number" value={sourceMeta.waferColorScaleMin ?? ""} placeholder="Auto" onChange={(event) => setSourceMeta((previous) => ({ ...previous, waferColorScaleMin: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
                  <label className="wafer-scale-control medium"><span><i aria-hidden="true" />Scale Medium</span><input type="number" value={sourceMeta.waferColorScaleMid ?? ""} placeholder="Auto" onChange={(event) => setSourceMeta((previous) => ({ ...previous, waferColorScaleMid: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
                  <label className="wafer-scale-control high"><span><i aria-hidden="true" />Scale Max</span><input type="number" value={sourceMeta.waferColorScaleMax ?? ""} placeholder="Auto" onChange={(event) => setSourceMeta((previous) => ({ ...previous, waferColorScaleMax: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
                </div>
                <p className="wafer-scale-hint">Low values are green, the medium threshold is yellow, and high values are red. Leave fields blank for automatic scaling.</p>
              </article>

            {activeTab === "propagation" ? (
              <section className="analysis-spectrum-grid analysis-spectrum-grid-dual overview-spectra-grid">
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
                      <h2>Loss Spectrum</h2>
                      <p>Overlay of all waveguide loss traces for the selected chip, aligned with the raw measurement view rather than launch-power-shifted output power.</p>
                    </div>
                  </div>
                  <InteractiveTransmissionSpectrumPlot series={propagationLead?.transmissionSeries ?? []} targetWavelengthNm={sourceMeta.propagationTargetWavelengthNm} chipId={propagationLead?.chipId || selectedChip} />
                </article>
              </section>
            ) : activeTab === "heater" ? (
              <section className="analysis-spectrum-grid analysis-spectrum-grid-dual overview-spectra-grid">
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>Phase Shift vs Power</h2>
                      <p>Tracks the extracted MZI fringe phase against electrical power so users can inspect the linear fit used to estimate <code>Ppi</code>.</p>
                    </div>
                  </div>
                  <InteractiveHeaterTuningPlot series={heaterLead?.powerSeries ?? []} fit={heaterLead?.phaseFit ?? null} chipId={heaterLead?.chipId || selectedChip} metric="phase" targetWavelengthNm={heaterLead?.targetWavelengthNm || sourceMeta.heaterTrackingWavelengthNm || sourceMeta.propagationTargetWavelengthNm} />
                </article>
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>Wavelength Shift vs Power</h2>
                      <p>Shows the raw fringe shift trend before the <code>FSR/2</code> phase conversion, which is useful for checking tracking stability and heater linearity.</p>
                    </div>
                  </div>
                  <InteractiveHeaterTuningPlot series={heaterLead?.powerSeries ?? []} fit={heaterLead?.wavelengthFit ?? null} chipId={heaterLead?.chipId || selectedChip} metric="wavelength" targetWavelengthNm={heaterLead?.targetWavelengthNm || sourceMeta.heaterTrackingWavelengthNm || sourceMeta.propagationTargetWavelengthNm} />
                </article>
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>Heater Transmission Overlay</h2>
                      <p>Overlay of all uploaded heater-bias spectra for the selected chip so the tracked fringe motion can be inspected directly against the raw measurement.</p>
                    </div>
                  </div>
                  <InteractiveTransmissionSpectrumPlot series={heaterTraceSeries} targetWavelengthNm={heaterLead?.targetWavelengthNm || sourceMeta.heaterTrackingWavelengthNm || sourceMeta.propagationTargetWavelengthNm} chipId={heaterLead?.chipId || selectedChip} />
                </article>
              </section>
            ) : activeTab === "insertion" ? (
              <section className="analysis-spectrum-grid analysis-spectrum-grid-dual overview-spectra-grid">
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>{`${insertionProfile.label || "Building Block"} Transmission Spectrum`}</h2>
                      <p>{insertionDeviceType === "grating-couplers" ? "Uses the shortest propagation reference trace, typically WG1, to track grating-coupler response across the wafer." : "Overlay of the uploaded insertion-loss spectrum for the selected building block on the chosen chip."}</p>
                    </div>
                  </div>
                  <InteractiveTransmissionSpectrumPlot series={insertionLead?.transmissionSeries ?? []} targetWavelengthNm={sourceMeta.propagationTargetWavelengthNm} chipId={insertionLead?.chipId || selectedChip} />
                </article>
                <article className="analysis-card wide-span insertion-overlay-card">
                  <div className="analysis-card-head">
                    <div>
                      <h2>{`${insertionProfile.label || "Building Block"} Variation Overlay`}</h2>
                      <p>Overlay all chip spectra for the selected device so you can inspect wafer-level variation and hide or show traces as needed.</p>
                    </div>
                  </div>
                  <div className="spectrum-viewer-grid insertion-overlay-grid">
                    <div className="spectrum-series-panel">
                      <div className="spectrum-series-toolbar">
                        <button type="button" className="secondary-action compact-inline-action" onClick={() => setInsertionOverlayVisibility((previous) => Object.fromEntries(Object.keys(previous).map((key) => [key, true])))} disabled={!insertionOverlaySeries.length}>Show All</button>
                        <button type="button" className="secondary-action compact-inline-action" onClick={() => setInsertionOverlayVisibility((previous) => Object.fromEntries(Object.keys(previous).map((key) => [key, false])))} disabled={!insertionOverlaySeries.length}>Hide All</button>
                      </div>
                      <div className="spectrum-series-list">
                        {insertionOverlayDisplaySeries.length ? insertionOverlayDisplaySeries.map((item) => <label key={item.id} className="spectrum-series-item"><input type="checkbox" checked={item.visible !== false} onChange={() => setInsertionOverlayVisibility((previous) => ({ ...previous, [item.id]: previous[item.id] === false }))} /><div><strong>{item.label}</strong><span>{item.pointCount} points | {item.wavelengthMinNm !== null && item.wavelengthMaxNm !== null ? `${item.wavelengthMinNm.toFixed(1)}-${item.wavelengthMaxNm.toFixed(1)} nm` : "Spectrum unavailable"}</span></div></label>) : <div className="chart-empty compact">No overlay spectra are available for the selected device type.</div>}
                      </div>
                    </div>
                    <div className="spectrum-overlay-plot"><InteractiveTransmissionSpectrumPlot series={insertionOverlayDisplaySeries} targetWavelengthNm={sourceMeta.propagationTargetWavelengthNm} chipId={`${insertionProfile.label || "building-block"}-wafer-overlay`} /></div>
                  </div>
                </article>
                <article className="analysis-card wide-span">
                  <div className="analysis-card-head">
                    <div>
                      <h2>{`${insertionProfile.label || "Building Block"} Performance Table`}</h2>
                      <p>Chip-by-chip summary of the key insertion-loss metrics for the selected silicon-photonics building block.</p>
                    </div>
                  </div>
                  <InsertionPerformanceTable items={insertionByChip} emptyMessage="No insertion-loss spectra were found for the selected device type." />
                </article>
              </section>
            ) : null}
            </section>

            <section className="analysis-chip-summary-section">
              <ChipSelectionTable
                rows={chipSelectionRows}
                summary={reportState}
                onToggleChip={togglePropagationChipInclusion}
                onSelectAll={selectAllPropagationChips}
                onClearAll={clearAllPropagationChips}
                onSelectPassingOnly={selectPassingPropagationChips}
                onOpenChip={setSelectedChip}
                onExportNormalizedCsv={exportNormalizedCsv}
              />
            </section>
            <section className="analysis-bottom-grid analysis-bottom-grid-secondary">
              <article className="analysis-card"><div className="analysis-card-head stacked"><div><h2>File Translator Status</h2><p>{statusMessage}</p></div></div><TranslationStatus sourceName={sourceMeta.name} sourceType={sourceMeta.type} totalRows={datasetSummary.rows} matchedDevices={matchedDevices} unmatchedDevices={unmatchedDevices} /><button type="button" className="secondary-action" onClick={() => updateTab("audit")}>Open Audit Log</button></article>
              <article className="analysis-card"><div className="analysis-card-head"><div><h2>Report Preview</h2><p>Export-ready representation of wafer quality.</p></div><button type="button" onClick={exportReportJson}>Open Report</button></div><ReportPreviewCard reportState={reportState} selectedMetricLabel={metricLabel(selectedWaferMetric)} onOpenReport={exportReportJson} /></article>
            </section>
</> : null}

          {activeTab === "projects" ? <section className="library-stack workspace-fit-view"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Workspace Snapshots</h2><p>Save the current wafer analysis context so you can reopen the same workspace state later, including selected views and analysis settings.</p></div><div className="library-action-row"><button type="button" onClick={saveCurrentProject}>Save Workspace Snapshot</button><button type="button" className="ghost-action" onClick={() => updateTab("propagation")}>Back To Analysis</button></div></div><div className="translator-metrics"><div><strong>{projectName}</strong><span>Project</span></div><div><strong>{getDatasetPresentation({ projectName, waferName, sourceMeta, rawRows: currentRows }).slot}</strong><span>Slot</span></div><div><strong>{datasetSummary.rows}</strong><span>Rows</span></div></div></article><article className="analysis-card"><div className="analysis-card-head"><div><h2>Saved Workspace Snapshots</h2><p>Stored locally in this browser for reopening the same workspace state.</p></div></div><LibraryTable columns={["Project", "Slot", "Waveguide Type", "Measurement Mode", "Measurement Type", "Dataset", "Rows", "Saved", "Actions"]} rows={[...bundledProjectRows, ...currentProjectRows]} emptyMessage="No bundled or saved projects are available yet." /></article></section> : null}
          {activeTab === "datasets" ? <DatasetLibraryPanel sourceMeta={sourceMeta} currentDatasetMeta={currentDatasetMeta} currentDatasetNamingDraft={datasetNamingDraft} onCurrentDatasetNamingChange={updateCurrentDatasetNaming} onResetCurrentDatasetNaming={() => resetCurrentDatasetNaming()} onApplyCurrentNamingToLoadedSnapshot={applyCurrentNamingToLoadedSnapshot} canApplyCurrentNamingToLoadedSnapshot={Boolean(selectedLocalDatasetId(quickDatasetSelection))} statusMessage={statusMessage} githubConfig={githubConfig} onGithubConfigChange={updateGithubConfig} onSaveGithubConfig={saveGithubConfig} onRefreshLibrary={refreshRemoteLibrary} remoteLibraryStatus={remoteLibraryStatus} remoteDatasets={remoteLibraryDatasets} selectedPublishedDataset={selectedPublishedDataset} publishedDatasetDraft={publishedDatasetDraft} onSelectPublishedDataset={selectPublishedDatasetForEdit} onPublishedDatasetDraftChange={updatePublishedDatasetDraft} onSavePublishedDatasetMetadata={savePublishedDatasetMetadata} isSavingPublishedDataset={isSavingPublishedDataset} onDeletePublishedDataset={deletePublishedDataset} isDeletingPublishedDataset={isDeletingPublishedDataset} loadedGithubDataset={loadedGithubDataset} currentPublishedDatasetReview={currentPublishedDatasetReview} canSaveCurrentReviewToPublishedDataset={canSaveCurrentReviewToPublishedDataset} localDatasets={currentDatasetRows} onSaveCurrentDataset={saveCurrentDataset} onClearWorkspace={clearWorkspace} onLoadRemoteDataset={(dataset) => loadBundledDataset(dataset, "dataset")} onLoadLocalDataset={loadDataset} onDeleteLocalDataset={deleteDataset} onPublishLocalDataset={publishDatasetToGithub} loadingBundledId={loadingBundledId} publishingDatasetId={publishingDatasetId} /> : null}
          {activeTab === "manual-conversion" ? <ManualConversionPanel defaultLaunchPowerDbm={sourceMeta.launchPowerDbm ?? appSettings.launchPowerDbm} /> : null}
          {activeTab === "manual-conversion-advanced" ? <ManualConversionPanel defaultLaunchPowerDbm={sourceMeta.launchPowerDbm ?? appSettings.launchPowerDbm} advanced /> : null}
          {activeTab === "comparison" ? <ComparisonLibraryPanel remoteDatasets={remoteLibraryDatasets} localDatasets={currentDatasetRows} sourceMeta={sourceMeta} waferTemplate={currentWaferTemplate} /> : null}
          {activeTab === "cd-sem" ? <CdSemLibraryPanel waferTemplate={currentWaferTemplate} propagationCells={propagationAllWaferCells} currentDatasetMeta={currentDatasetMeta} sourceMeta={sourceMeta} /> : null}
          {activeTab === "dashboard" ? <DatasetDashboardPanel remoteDatasets={remoteLibraryDatasets} onAnalyzeDataset={analyzeBundledDataset} onLoadDataset={(dataset) => loadBundledDataset(dataset, "dataset")} /> : null}
          {activeTab === "spectrum-viewer" ? (
            <section className="library-stack">
              <article className="analysis-card spectrum-viewer-card">
                <div className="analysis-card-head">
                  <div>
                    <h2>Spectrum Viewer</h2>
                    <p>Upload any insertion-loss or transmission trace and compare devices instantly. TXT is preferred if you plan to publish the data to the GitHub library later, while Excel is supported for quick review.</p>
                  </div>
                  <div className="library-action-row">
                    <label className="inline-select-field">
                      <span>Input unit</span>
                      <select value={advancedSpectrumViewerInputUnit} onChange={(event) => setAdvancedSpectrumViewerInputUnit(event.target.value)}>
                        <option value="watts">Watts (W)</option>
                        <option value="db">dB / dBm</option>
                      </select>
                    </label>
                    <label className="inline-select-field">
                      <span>Display</span>
                      <select value={advancedSpectrumViewerDisplayUnit} onChange={(event) => setAdvancedSpectrumViewerDisplayUnit(event.target.value)}>
                        <option value="db">dB / dBm</option>
                        <option value="watts">Watts (W)</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div
                  className={isSpectrumViewerDragging ? "spectrum-dropzone active" : "spectrum-dropzone"}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsSpectrumViewerDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsSpectrumViewerDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsSpectrumViewerDragging(false);
                  }}
                  onDrop={handleSpectrumViewerDrop}
                >
                  <strong>{isUploadingSpectrumViewerFiles ? "Reading uploaded spectra..." : "Upload Files"}</strong>
                  <p>Drag and drop `.txt`, `.csv`, `.xlsx`, or `.xls` files here, or browse from a folder. Excel files are read from the `IL` sheet using wavelength in metres and IL in dB.</p>
                  <label className="upload-measurement-button secondary-upload">
                    <input type="file" multiple accept=".txt,.csv,.xlsx,.xls" onChange={handleSpectrumViewerUpload} disabled={isUploadingSpectrumViewerFiles} />
                    <span>{isUploadingSpectrumViewerFiles ? "Processing Files..." : "Choose Files"}</span>
                  </label>
                </div>
                <div className="spectrum-viewer-controls">
                  <label className="inline-text-field">
                    <span>Figure title</span>
                    <input value={spectrumViewerTitle} onChange={(event) => setSpectrumViewerTitle(event.target.value)} placeholder="Spectrum Viewer" />
                  </label>
                  <label className="checkbox-inline-field">
                    <input type="checkbox" checked={showSpectrumViewerPeakPosition} onChange={(event) => setShowSpectrumViewerPeakPosition(event.target.checked)} />
                    <span>Show peak position guides</span>
                  </label>
                </div>
                <div className="spectrum-viewer-grid insertion-overlay-grid">
                  <div className="spectrum-series-panel">
                    <div className="spectrum-series-toolbar">
                      <button type="button" className="secondary-action compact-inline-action" onClick={() => setSpectrumViewerSeries((previous) => previous.map((item) => ({ ...item, visible: true })))} disabled={!spectrumViewerSeries.length}>Show All</button>
                      <button type="button" className="secondary-action compact-inline-action" onClick={() => setSpectrumViewerSeries((previous) => previous.map((item) => ({ ...item, visible: false })))} disabled={!spectrumViewerSeries.length}>Hide All</button>
                      <button
                        type="button"
                        className="secondary-action compact-inline-action"
                        onClick={() => {
                          setSpectrumViewerSeries([]);
                          setSpectrumViewerTitle("");
                          resetSpectrumViewerAnalysisControls();
                        }}
                        disabled={!spectrumViewerSeries.length}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="spectrum-series-list">
                      {spectrumViewerSeries.length ? spectrumViewerSeries.map((item) => (
                        <label key={item.id} className="spectrum-series-item">
                          <input
                            type="checkbox"
                            checked={item.visible !== false}
                            onChange={() => setSpectrumViewerSeries((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, visible: entry.visible === false } : entry))}
                          />
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.pointCount} points | {item.wavelengthMinNm.toFixed(1)}-{item.wavelengthMaxNm.toFixed(1)} nm</span>
                          </div>
                        </label>
                      )) : <div className="chart-empty compact">No traces loaded yet.</div>}
                    </div>
                  </div>
                  <InteractiveSpectrumViewerPlot
                    series={spectrumViewerSeries}
                    displayUnit={spectrumViewerDisplayUnit}
                    chipId="Spectrum Viewer"
                    figureTitle={spectrumViewerTitle}
                    onFigureTitleChange={setSpectrumViewerTitle}
                    showPeakPosition={showSpectrumViewerPeakPosition}
                  />
                </div>
              </article>
            </section>
          ) : null}
          {activeTab === "spectrum-viewer-advanced" ? (
            <section className="library-stack">
              <article className="analysis-card spectrum-viewer-card">
                <div className="analysis-card-head">
                  <div>
                    <h2>Spectrum Viewer (Advanced)</h2>
                    <p>Use advanced peak detection, wavelength focus windows, custom axes, FSR estimates, and extinction-ratio summaries on the same uploaded spectra.</p>
                  </div>
                  <div className="library-action-row">
                    <label className="inline-select-field">
                      <span>Input unit</span>
                      <select value={spectrumViewerInputUnit} onChange={(event) => setSpectrumViewerInputUnit(event.target.value)}>
                        <option value="watts">Watts (W)</option>
                        <option value="db">dB / dBm</option>
                      </select>
                    </label>
                    <label className="inline-select-field">
                      <span>Display</span>
                      <select value={spectrumViewerDisplayUnit} onChange={(event) => setSpectrumViewerDisplayUnit(event.target.value)}>
                        <option value="db">dB / dBm</option>
                        <option value="watts">Watts (W)</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div
                  className={isAdvancedSpectrumViewerDragging ? "spectrum-dropzone active" : "spectrum-dropzone"}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsAdvancedSpectrumViewerDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsAdvancedSpectrumViewerDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsAdvancedSpectrumViewerDragging(false);
                  }}
                  onDrop={handleAdvancedSpectrumViewerDrop}
                >
                  <strong>{isUploadingAdvancedSpectrumViewerFiles ? "Reading uploaded spectra..." : "Upload Files"}</strong>
                  <p>Drag and drop `.txt`, `.csv`, `.xlsx`, or `.xls` files here, or browse from a folder. Excel files are read from the `IL` sheet using wavelength in metres and IL in dB.</p>
                  <label className="upload-measurement-button secondary-upload">
                    <input type="file" multiple accept=".txt,.csv,.xlsx,.xls" onChange={handleAdvancedSpectrumViewerUpload} disabled={isUploadingAdvancedSpectrumViewerFiles} />
                    <span>{isUploadingAdvancedSpectrumViewerFiles ? "Processing Files..." : "Choose Files"}</span>
                  </label>
                </div>
                <div className="spectrum-viewer-controls">
                  <label className="inline-text-field">
                    <span>Figure title</span>
                    <input value={advancedSpectrumViewerTitle} onChange={(event) => setAdvancedSpectrumViewerTitle(event.target.value)} placeholder="Spectrum Viewer" />
                  </label>
                  <label className="checkbox-inline-field">
                    <input type="checkbox" checked={showAdvancedSpectrumViewerPeakPosition} onChange={(event) => setShowAdvancedSpectrumViewerPeakPosition(event.target.checked)} />
                    <span>Show strongest-peak guides</span>
                  </label>
                  <label className="checkbox-inline-field">
                    <input type="checkbox" checked={spectrumViewerPeakDetectionEnabled} onChange={(event) => setSpectrumViewerPeakDetectionEnabled(event.target.checked)} />
                    <span>Enable peak detection</span>
                  </label>
                  <label className="inline-select-field">
                    <span>Peak type</span>
                    <select value={spectrumViewerPeakType} onChange={(event) => setSpectrumViewerPeakType(event.target.value)}>
                      <option value="minima">Minima</option>
                      <option value="maxima">Maxima</option>
                    </select>
                  </label>
                  <label className="inline-text-field">
                    <span>Peak spacing (nm)</span>
                    <input type="number" min="0" step="0.1" value={spectrumViewerPeakSpacingNm} onChange={(event) => setSpectrumViewerPeakSpacingNm(Math.max(Number(event.target.value) || 0, 0))} />
                  </label>
                  <label className="inline-text-field">
                    <span>Prominence</span>
                    <input type="number" min="0" step="0.05" value={spectrumViewerPeakProminence} onChange={(event) => setSpectrumViewerPeakProminence(Math.max(Number(event.target.value) || 0, 0))} />
                  </label>
                </div>
                <div className="spectrum-analysis-controls">
                  <label className="mapping-field">
                    <span>Start wavelength (nm)</span>
                    <input type="number" value={advancedSpectrumViewerStartWavelengthNm} onChange={(event) => setAdvancedSpectrumViewerStartWavelengthNm(event.target.value)} />
                  </label>
                  <label className="mapping-field">
                    <span>Stop wavelength (nm)</span>
                    <input type="number" value={advancedSpectrumViewerStopWavelengthNm} onChange={(event) => setAdvancedSpectrumViewerStopWavelengthNm(event.target.value)} />
                  </label>
                  <label className="mapping-field">
                    <span>{advancedSpectrumViewerDisplayUnit === "watts" ? "Power min (W)" : "Loss min (dB)"}</span>
                    <input type="number" value={advancedSpectrumViewerYAxisMin} onChange={(event) => setAdvancedSpectrumViewerYAxisMin(event.target.value)} />
                  </label>
                  <label className="mapping-field">
                    <span>{advancedSpectrumViewerDisplayUnit === "watts" ? "Power max (W)" : "Loss max (dB)"}</span>
                    <input type="number" value={advancedSpectrumViewerYAxisMax} onChange={(event) => setAdvancedSpectrumViewerYAxisMax(event.target.value)} />
                  </label>
                </div>
                <div className="spectrum-series-toolbar">
                  <button type="button" className="ghost-action compact-inline-action" onClick={resetAdvancedSpectrumViewerVerticalRange} disabled={!advancedSpectrumViewerSeries.length}>Reset Vertical Range</button>
                </div>
                <div className="spectrum-viewer-grid insertion-overlay-grid">
                  <div className="spectrum-series-panel">
                    <div className="spectrum-series-toolbar">
                      <button type="button" className="secondary-action compact-inline-action" onClick={() => setAdvancedSpectrumViewerSeries((previous) => previous.map((item) => ({ ...item, visible: true })))} disabled={!advancedSpectrumViewerSeries.length}>Show All</button>
                      <button type="button" className="secondary-action compact-inline-action" onClick={() => setAdvancedSpectrumViewerSeries((previous) => previous.map((item) => ({ ...item, visible: false })))} disabled={!advancedSpectrumViewerSeries.length}>Hide All</button>
                      <button
                        type="button"
                        className="secondary-action compact-inline-action"
                        onClick={() => {
                          setAdvancedSpectrumViewerSeries([]);
                          setAdvancedSpectrumViewerTitle("");
                          resetSpectrumViewerAnalysisControls();
                        }}
                        disabled={!advancedSpectrumViewerSeries.length}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="spectrum-series-list">
                      {advancedSpectrumViewerSeries.length ? advancedSpectrumViewerSeries.map((item) => (
                        <label key={item.id} className="spectrum-series-item">
                          <input
                            type="checkbox"
                            checked={item.visible !== false}
                            onChange={() => setAdvancedSpectrumViewerSeries((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, visible: entry.visible === false } : entry))}
                          />
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.pointCount} points | {item.wavelengthMinNm.toFixed(1)}-{item.wavelengthMaxNm.toFixed(1)} nm</span>
                          </div>
                        </label>
                      )) : <div className="chart-empty compact">No traces loaded yet.</div>}
                    </div>
                  </div>
                  <InteractiveSpectrumViewerPlot
                    series={advancedSpectrumViewerSeries}
                    displayUnit={advancedSpectrumViewerDisplayUnit}
                    chipId="Spectrum Viewer"
                    figureTitle={advancedSpectrumViewerTitle}
                    onFigureTitleChange={setAdvancedSpectrumViewerTitle}
                    showPeakPosition={showAdvancedSpectrumViewerPeakPosition}
                    analysisOptions={{
                      peakDetectionEnabled: spectrumViewerPeakDetectionEnabled,
                      peakType: spectrumViewerPeakType,
                      minPeakSpacingNm: spectrumViewerPeakSpacingNm,
                      minPeakProminence: spectrumViewerPeakProminence,
                      focusMinNm: advancedSpectrumViewerStartWavelengthNm,
                      focusMaxNm: advancedSpectrumViewerStopWavelengthNm,
                      yAxisMin: advancedSpectrumViewerYAxisMin,
                      yAxisMax: advancedSpectrumViewerYAxisMax,
                      compareSeriesAId: advancedSpectrumViewerComparisonSeriesA,
                      compareSeriesBId: advancedSpectrumViewerComparisonSeriesB
                    }}
                  />
                </div>
              </article>
            </section>
          ) : null}
          {activeTab === "filename-conversion" ? <FilenameConversionPanel /> : null}
          {activeTab === "settings" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Settings</h2><p>Control persistent defaults for operator identity, wavelength assumptions, upload behavior, and automated propagation processing.</p></div><div className="library-action-row"><button type="button" onClick={saveSettings}>Save Settings</button><button type="button" className="ghost-action" onClick={resetSettings}>Reset Defaults</button></div></div><div className="settings-grid settings-grid-extended"><label className="mapping-field"><span>Operator name</span><input value={settingsDraft.operatorName} onChange={(event) => updateSettingsDraft("operatorName", event.target.value)} /></label><label className="mapping-field"><span>Operator role</span><input value={settingsDraft.operatorRole} onChange={(event) => updateSettingsDraft("operatorRole", event.target.value)} /></label><label className="mapping-field"><span>Theme preference</span><select value={settingsDraft.themePreference} onChange={(event) => updateSettingsDraft("themePreference", event.target.value)}>{THEME_PREFERENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="mapping-field"><span>Default wavelength (nm)</span><input type="number" value={settingsDraft.defaultWavelengthNm} onChange={(event) => updateSettingsDraft("defaultWavelengthNm", Number(event.target.value) || 1550)} /></label><label className="mapping-field"><span>Default metric family</span><select value={settingsDraft.defaultMetricFamily} onChange={(event) => updateSettingsDraft("defaultMetricFamily", event.target.value)}>{DEFAULT_MAPPING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label className="mapping-field"><span>Laser output power (dBm)</span><input type="number" value={settingsDraft.launchPowerDbm} onChange={(event) => updateSettingsDraft("launchPowerDbm", Number(event.target.value) || 0)} /></label><label className="mapping-field"><span>Propagation target wavelength (nm)</span><input type="number" value={settingsDraft.propagationTargetWavelengthNm} onChange={(event) => updateSettingsDraft("propagationTargetWavelengthNm", Number(event.target.value) || 1550)} /></label><label className="mapping-field"><span>Propagation averaging window (+/- nm)</span><input type="number" value={settingsDraft.propagationWindowNm} onChange={(event) => updateSettingsDraft("propagationWindowNm", Math.max(Number(event.target.value) || 0, 0))} /></label><label className="mapping-field"><span>Propagation spectral interval (nm)</span><input type="number" min="1" value={settingsDraft.propagationSpectralStepNm} onChange={(event) => updateSettingsDraft("propagationSpectralStepNm", Math.max(Number(event.target.value) || 1, 1))} /></label><label className="mapping-field"><span>Propagation fit MSE threshold</span><input type="number" step="0.01" value={settingsDraft.propagationMseThreshold} onChange={(event) => updateSettingsDraft("propagationMseThreshold", Math.max(Number(event.target.value) || 0, 0))} /></label></div><WaveguideLengthConfigurator count={settingsDraft.propagationWaveguideCount} start={settingsDraft.propagationWaveguideStartMm} interval={settingsDraft.propagationWaveguideIntervalMm} manualMode={settingsDraft.propagationWaveguideManualMode} lengths={settingsDraft.propagationWaveguideLengthsMm} onNumberChange={updateSettingsDraft} onLengthChange={updateSettingsWaveguideLength} onManualModeChange={(checked) => updateSettingsDraft("propagationWaveguideManualMode", checked)} /><div className="chart-empty compact">Uploaded measurement files now stay in the active workspace only. Use <strong>Save Dataset Snapshot</strong> or <strong>Save to GitHub</strong> from <strong>Dataset Snapshots</strong> when you want to keep a dataset.</div></article></section> : null}
          {activeTab === "wafermaps" ? <WafermapsLibrary draft={waferTemplateDraft} onDraftChange={updateWaferTemplateDraft} onSaveTemplate={saveWaferTemplate} templates={allWaferTemplates} selectedTemplateId={currentWaferTemplate?.id || ""} onUseTemplate={useWaferTemplate} onDeleteTemplate={deleteWaferTemplate} /> : null}
          {activeTab === "report-generator" ? <ReportGeneratorPanel reportState={reportState} sourceMeta={sourceMeta} isGeneratingPptReport={isGeneratingPptReport} isGeneratingWordReport={isGeneratingWordReport} isGeneratingPdfReport={isGeneratingPdfReport} isGeneratingPostProcessed={isGeneratingPostProcessed} onGeneratePptReport={generatePowerPointDeck} onGenerateWordReport={generateWordDeck} onGeneratePdfReport={generatePdfDeck} onGeneratePostProcessedFiles={generatePostProcessedFiles} /> : null}
          {activeTab === "audit" ? <section className="library-stack workspace-fit-view"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Audit Log</h2><p>Review the local activity trail for uploads, exports, saves, loads, and settings changes.</p></div><div className="library-action-row"><button type="button" className="ghost-action" onClick={clearAuditLog}>Clear Audit Log</button></div></div><LibraryTable columns={["Action", "Type", "Detail", "Time"]} rows={auditRows} emptyMessage="No audit entries yet." /></article></section> : null}
          {activeTab === "help" ? <section className="library-stack"><article className="analysis-card"><div className="analysis-card-head"><div><h2>Help Center</h2><p>Quick in-app guidance for the current release, focused on how data flows through propagation processing, storage, and reporting.</p></div><div className="library-action-row"><button type="button" onClick={() => updateTab("projects")}>Open Workspace Snapshots</button><button type="button" className="ghost-action" onClick={() => updateTab("propagation")}>Open Propagation View</button></div></div><div className="help-grid">{HELP_TOPICS.map((topic) => <article key={topic.title} className="help-card"><h3>{topic.title}</h3><p>{topic.body}</p></article>)}</div><div className="doc-link-list">{DOC_LINKS.map((doc) => <a key={doc.label} className="doc-link-item" href={doc.href} target="_blank" rel="noreferrer"><strong>{doc.label}</strong><span>{doc.path}</span></a>)}</div></article></section> : null}
        </main>
      </div>
    </div>
  );
}
