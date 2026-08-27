import { computePropagationLoss } from "./analysis";
import { buildNormalizedRows } from "./parsers";

export const ROUTE_CONFIG_FILE_NAME = "route-config.json";
export const LEGACY_WAVEGUIDE_CONFIG_FILE_NAME = "waveguide-config.json";
export const FILENAME_MANIFEST_FILE_NAME = "filename-manifest.csv";

export const DATASET_PLATFORM_OPTIONS = [
  "SOI220nmPassive",
  "SOI220nmActive",
  "SOI340nm",
  "SOI500nm",
  "SiN200nm",
  "SiN300nm"
];
export const DATASET_OPTICAL_MODE_OPTIONS = ["1550nm_TE", "1310nm_TE", "1550nm_TM", "1310nm_TM"];
export const DATASET_ALIGNMENT_MODE_OPTIONS = ["AutoAlign", "OperatorAlign"];
export const DATASET_BUILDING_BLOCK_OPTIONS = [
  "RIB_Waveguide",
  "STRIP_Waveguide",
  "RIB_2x1_MMI",
  "RIB_2x2_MMI",
  "STRIP_2x1_MMI",
  "STRIP_2x2_MMI",
  "RIB_Waveguide_Crossing",
  "STRIP_Waveguide_Crossing",
  "RIB_Grating_Coupler",
  "STRIP_Grating_Coupler",
  "RIB_Spiral",
  "STRIP_Spiral"
];
export const DATASET_MEASUREMENT_TYPE_OPTIONS = [
  "PropagationLoss",
  "CouplingLoss",
  "InsertionLoss",
  "InsertionLossCutback"
];

const CANONICAL_FOLDER_FIELDS = [
  "projectName",
  "platformLabel",
  "slot",
  "processStep",
  "opticalMode",
  "buildingBlockLabel",
  "measurementType",
  "alignmentMode"
];

function slugify(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function titleizeToken(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeOverrideText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function controlledValue(value, options) {
  const candidate = String(value || "").trim();
  return options.find((option) => option.toLowerCase() === candidate.toLowerCase()) || "";
}

export function normalizeDatasetProject(value) {
  const candidate = slugify(value);
  return /^(?:MPW\d+(?:_[A-Za-z0-9]+)*|DEV_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*|BSPK_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)$/.test(candidate)
    ? candidate
    : "";
}

export function normalizeDatasetSlot(value) {
  const match = String(value || "").trim().match(/^Slot0*(\d+)$/i);
  return match ? `Slot${Number(match[1])}` : "";
}

export function buildCanonicalDatasetFolderName(fields = {}) {
  const normalized = {
    projectName: normalizeDatasetProject(fields.projectName),
    platformLabel: controlledValue(fields.platformLabel, DATASET_PLATFORM_OPTIONS),
    slot: normalizeDatasetSlot(fields.slot),
    processStep: normalizeProcessStep(fields.processStep),
    opticalMode: controlledValue(fields.opticalMode, DATASET_OPTICAL_MODE_OPTIONS),
    buildingBlockLabel: controlledValue(fields.buildingBlockLabel, DATASET_BUILDING_BLOCK_OPTIONS),
    measurementType: controlledValue(fields.measurementType, DATASET_MEASUREMENT_TYPE_OPTIONS),
    alignmentMode: controlledValue(fields.alignmentMode, DATASET_ALIGNMENT_MODE_OPTIONS)
  };
  return CANONICAL_FOLDER_FIELDS.every((field) => normalized[field])
    ? CANONICAL_FOLDER_FIELDS.map((field) => normalized[field]).join("_")
    : "";
}

export function validateCanonicalDatasetIdentity(fields = {}) {
  const missing = [];
  if (!normalizeDatasetProject(fields.projectName)) missing.push("project (for example MPW47, DEV_MIT, or BSPK_Duality)");
  if (!controlledValue(fields.platformLabel, DATASET_PLATFORM_OPTIONS)) missing.push("platform");
  if (!normalizeDatasetSlot(fields.slot)) missing.push("slot (for example Slot5)");
  if (!normalizeProcessStep(fields.processStep)) missing.push("process step");
  if (!controlledValue(fields.opticalMode, DATASET_OPTICAL_MODE_OPTIONS)) missing.push("optical mode");
  if (!controlledValue(fields.buildingBlockLabel, DATASET_BUILDING_BLOCK_OPTIONS)) missing.push("building block");
  if (!controlledValue(fields.measurementType, DATASET_MEASUREMENT_TYPE_OPTIONS)) missing.push("measurement type");
  if (!controlledValue(fields.alignmentMode, DATASET_ALIGNMENT_MODE_OPTIONS)) missing.push("alignment mode");
  return { valid: missing.length === 0, missing };
}

export function normalizeProcessStep(value) {
  const candidate = String(value || "").trim();
  return /^Step(?:XX|\d+[A-Z]?)$/.test(candidate) ? candidate : "";
}

export function isValidProcessStep(value) {
  return Boolean(normalizeProcessStep(value));
}

function arrayMin(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function arrayMax(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function summarizeWavelength(rows) {
  const values = rows
    .map((row) => Number(row.wavelength_nm))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { min: null, max: null };
  }
  return { min: arrayMin(values), max: arrayMax(values) };
}

function joinedDatasetText(projectName, waferName, sourceMeta = {}, rows = []) {
  return [
    projectName,
    waferName,
    sourceMeta.name,
    sourceMeta.type,
    sourceMeta.platform,
    sourceMeta.platformId,
    sourceMeta.processStep,
    sourceMeta.buildingBlock,
    sourceMeta.buildingBlockId,
    sourceMeta.notes,
    ...rows.slice(0, 24).map((row) => row.source_name || "")
  ].filter(Boolean).join(" ");
}

function inferProjectToken(projectName, joined) {
  const explicit = slugify(projectName);
  if (/^MPW\d+_Rerun(?:_[A-Za-z0-9]+)+$/i.test(explicit)) return explicit;
  if (/^(?:DEV|BSPK)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(explicit)) return explicit;
  const explicitMpw = explicit.match(/^MPW0*(\d+)/i);
  if (explicitMpw) return `MPW${Number(explicitMpw[1])}`;
  if (/\bPIC\s*BOOTCAMP\b|\bPICBOOTCAMP\b/i.test(joined)) return "DEV_PICBOOTCAMP";
  if (/(?:^|[^A-Z0-9])MIT(?:$|[^A-Z0-9])/i.test(joined)) return "DEV_MIT";
  const detectedMpw = joined.match(/(?:^|[^A-Z0-9])MPW\s*[_-]?\s*0*(\d+)(?=$|[^0-9])/i);
  return detectedMpw ? `MPW${Number(detectedMpw[1])}` : "Measurement";
}

function inferDatasetTokens(projectName, waferName, sourceMeta = {}, rows = []) {
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  const projectToken = inferProjectToken(projectName, joined);
  const slotMatch = joined.match(/Slot\s*([0-9]+)/i);
  const processStepMatch = joined.match(/(?:^|[^A-Z0-9])Step\s*[_-]?\s*(\d+[A-Z]?|XX)(?=$|[^A-Z0-9])/i);
  const typeMatch = joined.match(/\b(rib|strip|slot)\b/i);
  const modeMatch = /manual/i.test(joined)
    ? "manual"
    : /automated|wst/i.test(joined)
      ? "wst"
      : "measurement";

  return {
    mpw: projectToken,
    slot: slotMatch ? `Slot${slotMatch[1]}` : "SlotUndefined",
    processStep: processStepMatch ? `Step${processStepMatch[1].toUpperCase()}` : "StepXX",
    waveguideType: typeMatch ? typeMatch[1].toLowerCase() : "waveguide",
    mode: modeMatch
  };
}

function inferPlatform(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.platformId || sourceMeta.platform || "").replace(/[_\s-]+/g, "").toLowerCase();
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows).replace(/[_\s-]+/g, "").toLowerCase();
  const normalized = explicit || joined;

  if (normalized.includes("220nmsoiactive") || normalized.includes("soi220nmactive")) return { id: "soi220nm_active", label: "SOI220nmActive" };
  if (normalized.includes("220nmsoipassive") || normalized.includes("soi220nmpassive")) return { id: "soi220nm_passive", label: "SOI220nmPassive" };
  if (normalized.includes("340nmsoi") || normalized.includes("soi340nm")) return { id: "soi340nm", label: "SOI340nm" };
  if (normalized.includes("500nmsoi") || normalized.includes("soi500nm")) return { id: "soi500nm", label: "SOI500nm" };
  if (normalized.includes("200nmsin") || normalized.includes("sin200nm")) return { id: "sin200nm", label: "SiN200nm" };
  if (normalized.includes("300nmsin") || normalized.includes("sin300nm")) return { id: "sin300nm", label: "SiN300nm" };
  return { id: "", label: "" };
}

function inferMeasurementType(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.measurementType || "");
  if (/insertion.*cutback|cutback/i.test(explicit)) return "InsertionLossCutback";
  if (/coupling/i.test(explicit)) return "CouplingLoss";
  if (/insertion|\bil\b/i.test(explicit)) return "InsertionLoss";
  if (/propagation/i.test(explicit)) return "PropagationLoss";

  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  if (/insertion.*cutback|cutback/i.test(joined)) return "InsertionLossCutback";
  if (/grating|\bgc\b|coupling/i.test(joined)) return "CouplingLoss";
  if (/insertion|\bil\b/i.test(joined)) return "InsertionLoss";
  if (/mmi|crossing|spiral/i.test(joined)) return "InsertionLoss";
  return "PropagationLoss";
}

function inferWaveguideType(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.waveguideType || sourceMeta.waveguideDescriptor || "");
  if (/rib/i.test(explicit)) return { id: "rib", label: "Rib" };
  if (/strip/i.test(explicit)) return { id: "strip", label: "Strip" };

  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  if (/rib/i.test(joined)) return { id: "rib", label: "Rib" };
  if (/strip/i.test(joined)) return { id: "strip", label: "Strip" };
  return { id: "waveguide", label: "Waveguide" };
}

function inferBuildingBlock(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.buildingBlockId || sourceMeta.buildingBlock || "").trim();
  if (explicit) {
    const controlled = controlledValue(explicit, DATASET_BUILDING_BLOCK_OPTIONS);
    if (controlled) return { id: controlled.toLowerCase(), label: controlled };
  }

  const waveguideType = inferWaveguideType(sourceMeta, rows, projectName, waferName);
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows).toLowerCase();
  const family = waveguideType.id === "rib" ? "RIB" : waveguideType.id === "strip" ? "STRIP" : "";

  let label = "";
  if (family && /grating|\bgc\b/i.test(joined)) label = `${family}_Grating_Coupler`;
  else if (family && /2\s*[xX]\s*1.*mmi|mmi.*2\s*[xX]\s*1/i.test(joined)) label = `${family}_2x1_MMI`;
  else if (family && /2\s*[xX]\s*2.*mmi|mmi.*2\s*[xX]\s*2/i.test(joined)) label = `${family}_2x2_MMI`;
  else if (family && /cross/i.test(joined)) label = `${family}_Waveguide_Crossing`;
  else if (family && /spiral/i.test(joined)) label = `${family}_Spiral`;
  else if (family) label = `${family}_Waveguide`;
  return { id: label.toLowerCase(), label };
}

function inferOpticalMode(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  const explicit = String(sourceMeta.opticalMode || sourceMeta.modePolarization || "");
  const text = `${explicit} ${joined}`;
  const wavelengthMatch = text.match(/(?:^|[^A-Z0-9])(1310|1550)\s*nm(?=$|[^A-Z0-9])/i);
  const polarizationMatch = text.match(/(?:^|[^A-Z0-9])(TE|TM)(?=$|[^A-Z0-9])/i);
  if (!wavelengthMatch || !polarizationMatch) return "";
  return `${wavelengthMatch[1]}nm_${polarizationMatch[1].toUpperCase()}`;
}

function inferAlignmentMode(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = controlledValue(sourceMeta.alignmentMode, DATASET_ALIGNMENT_MODE_OPTIONS);
  if (explicit) return explicit;
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  if (/operator\s*align|manual/i.test(joined)) return "OperatorAlign";
  if (/auto\s*align|automated|\bwst\b/i.test(joined)) return "AutoAlign";
  return "";
}

export function inferDatasetIdentity({ projectName = "", waferName = "", sourceMeta = {}, rows = [], selectedDate = "" }) {
  const tokens = inferDatasetTokens(projectName, waferName, sourceMeta, rows);
  const chipIds = unique(rows.map((row) => row.chip_id));
  const waveguides = unique(rows.map((row) => row.waveguide_id));
  const sourceNames = unique(rows.map((row) => row.source_name));
  const wavelength = summarizeWavelength(rows);
  const label = `${tokens.mpw} ${tokens.slot} ${titleizeToken(tokens.waveguideType)} ${tokens.mode === "manual" ? "Manual" : "WST"} Raw Data`;
  const folderName = `${tokens.mpw}_${tokens.slot}_${tokens.waveguideType}_${tokens.mode}_data`;
  const projectLabel = tokens.mpw !== "Measurement"
    ? tokens.mpw
    : projectName || `${tokens.mpw}_${tokens.slot}_${titleizeToken(tokens.waveguideType).replace(/\s+/g, "_")}`;
  const waferLabel = waferName || unique(rows.map((row) => row.wafer_label))[0] || `${tokens.mpw}_${tokens.slot}_${tokens.waveguideType}`;
  const platform = inferPlatform(sourceMeta, rows, projectName, waferName);
  const measurementType = inferMeasurementType(sourceMeta, rows, projectName, waferName);
  const waveguideType = inferWaveguideType(sourceMeta, rows, projectName, waferName);
  const buildingBlock = inferBuildingBlock(sourceMeta, rows, projectName, waferName);
  const opticalMode = inferOpticalMode(sourceMeta, rows, projectName, waferName);
  const alignmentMode = inferAlignmentMode(sourceMeta, rows, projectName, waferName);

  return {
    id: slugify(folderName).toLowerCase(),
    label,
    folderName,
    projectName: projectLabel,
    waferName: waferLabel,
    selectedDate,
    mpw: tokens.mpw,
    slot: tokens.slot,
    processStep: tokens.processStep,
    waveguideType: titleizeToken(tokens.waveguideType),
    measurementMode: tokens.mode === "manual" ? "Manual converted" : tokens.mode === "wst" ? "Automated WST" : "Measurement",
    sourceType: sourceMeta.type || (tokens.mode === "manual" ? "Manual converted trace set" : "Automated WST trace set"),
    sourceNames,
    sourceCount: sourceNames.length,
    chipCount: chipIds.length,
    waveguideCount: waveguides.length,
    rowCount: rows.length,
    wavelengthMinNm: wavelength.min,
    wavelengthMaxNm: wavelength.max,
    platformId: platform.id,
    platformLabel: platform.label,
    buildingBlockId: buildingBlock.id,
    buildingBlockLabel: buildingBlock.label,
    measurementType,
    opticalMode,
    alignmentMode,
    waveguideFamily: waveguideType.label,
    legacyFolder: `sample-data/wst/${folderName}`
  };
}

export function applyDatasetNamingOverrides(identity, namingOverrides = {}) {
  if (!namingOverrides || typeof namingOverrides !== "object") return identity;

  const nextLabel = normalizeOverrideText(namingOverrides.label, identity.label);
  const nextProjectName = normalizeOverrideText(namingOverrides.projectName, identity.projectName);
  const nextSlot = normalizeDatasetSlot(normalizeOverrideText(namingOverrides.slot, identity.slot)) || normalizeOverrideText(namingOverrides.slot, identity.slot);
  const nextProcessStep = Object.prototype.hasOwnProperty.call(namingOverrides, "processStep")
    ? normalizeProcessStep(namingOverrides.processStep)
    : identity.processStep;
  const nextPlatformLabel = controlledValue(namingOverrides.platformLabel, DATASET_PLATFORM_OPTIONS) || identity.platformLabel;
  const nextBuildingBlockLabel = controlledValue(namingOverrides.buildingBlockLabel, DATASET_BUILDING_BLOCK_OPTIONS) || identity.buildingBlockLabel;
  const nextMeasurementType = controlledValue(namingOverrides.measurementType, DATASET_MEASUREMENT_TYPE_OPTIONS) || identity.measurementType;
  const nextOpticalMode = controlledValue(namingOverrides.opticalMode, DATASET_OPTICAL_MODE_OPTIONS) || identity.opticalMode;
  const nextAlignmentMode = controlledValue(namingOverrides.alignmentMode, DATASET_ALIGNMENT_MODE_OPTIONS) || identity.alignmentMode;
  const canonicalFolderName = buildCanonicalDatasetFolderName({
    projectName: nextProjectName,
    platformLabel: nextPlatformLabel,
    slot: nextSlot,
    processStep: nextProcessStep,
    opticalMode: nextOpticalMode,
    buildingBlockLabel: nextBuildingBlockLabel,
    measurementType: nextMeasurementType,
    alignmentMode: nextAlignmentMode
  });
  const legacyFolderName = slugify(normalizeOverrideText(namingOverrides.folderName, identity.folderName)) || identity.folderName;
  const nextFolderName = canonicalFolderName || legacyFolderName;

  return {
    ...identity,
    label: nextLabel,
    folderName: nextFolderName,
    id: slugify(nextFolderName).toLowerCase() || identity.id,
    projectName: nextProjectName,
    waferName: normalizeOverrideText(namingOverrides.waferName, identity.waferName),
    mpw: normalizeOverrideText(namingOverrides.mpw || namingOverrides.projectName, identity.mpw),
    slot: nextSlot,
    processStep: nextProcessStep,
    platformLabel: nextPlatformLabel,
    platformId: nextPlatformLabel ? slugify(nextPlatformLabel).toLowerCase() : identity.platformId,
    buildingBlockLabel: nextBuildingBlockLabel,
    buildingBlockId: nextBuildingBlockLabel ? slugify(nextBuildingBlockLabel).toLowerCase() : identity.buildingBlockId,
    measurementType: nextMeasurementType,
    opticalMode: nextOpticalMode,
    alignmentMode: nextAlignmentMode,
    legacyFolder: `sample-data/wst/${nextFolderName}`
  };
}

function formatNumber(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function formatDateLabel(selectedDate) {
  return selectedDate || "--";
}

export function normalizeMeasurementDate(value) {
  const candidate = String(value || "").trim();
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? candidate
    : "";
}

export function getDatasetMeasurementDate(dataset = {}) {
  return normalizeMeasurementDate(
    dataset.namingOverrides?.measurementDate
      || dataset.measurementDate
      || dataset.metadata?.measurementDate
      || dataset.selectedDate
  );
}

export function normalizeDatasetAnalyticsSummary(summary = {}) {
  return {
    propagationAverage: Number.isFinite(Number(summary.propagationAverage)) ? Number(summary.propagationAverage) : null,
    yield: Number.isFinite(Number(summary.yield)) ? Number(summary.yield) : null,
    measuredChips: Number.isFinite(Number(summary.measuredChips)) ? Number(summary.measuredChips) : null,
    computedAt: summary.computedAt || ""
  };
}

export function normalizeDatasetAnalyticsReview(review = {}) {
  const excludedChipIds = Array.isArray(review?.excludedChipIds)
    ? review.excludedChipIds.map((chipId) => String(chipId)).filter(Boolean)
    : [];
  const includedChipIds = Array.isArray(review?.includedChipIds)
    ? review.includedChipIds.map((chipId) => String(chipId)).filter(Boolean)
    : [];
  const propagationSettings = review?.propagationSettings || {};

  return {
    excludedChipIds,
    includedChipIds,
    totalChipCount: Number.isFinite(Number(review?.totalChipCount)) ? Number(review.totalChipCount) : null,
    selectedChipCount: Number.isFinite(Number(review?.selectedChipCount)) ? Number(review.selectedChipCount) : null,
    measuredChips: Number.isFinite(Number(review?.measuredChips)) ? Number(review.measuredChips) : null,
    fittedChips: Number.isFinite(Number(review?.fittedChips)) ? Number(review.fittedChips) : null,
    failedFits: Number.isFinite(Number(review?.failedFits)) ? Number(review.failedFits) : null,
    savedAt: review?.savedAt || "",
    propagationSettings: {
      propagationTargetWavelengthNm: Number.isFinite(Number(propagationSettings.propagationTargetWavelengthNm))
        ? Number(propagationSettings.propagationTargetWavelengthNm)
        : null,
      propagationWindowNm: Number.isFinite(Number(propagationSettings.propagationWindowNm))
        ? Number(propagationSettings.propagationWindowNm)
        : null,
      propagationSpectralStepNm: Number.isFinite(Number(propagationSettings.propagationSpectralStepNm))
        ? Number(propagationSettings.propagationSpectralStepNm)
        : null,
      propagationMseThreshold: Number.isFinite(Number(propagationSettings.propagationMseThreshold))
        ? Number(propagationSettings.propagationMseThreshold)
        : null
    }
  };
}

export function buildLibraryAnalyticsEntry(dataset = {}) {
  return {
    id: dataset.id || dataset.datasetId || dataset.label,
    datasetId: dataset.datasetId || dataset.id || dataset.label,
    label: dataset.label || "",
    projectName: dataset.projectName || "",
    waferName: dataset.waferName || "",
    selectedDate: dataset.selectedDate || "",
    folder: dataset.folder || dataset.traceFolder || "",
    measurementType: dataset.measurementType || "",
    measurementMode: dataset.measurementMode || "",
    mpw: dataset.mpw || "",
    slot: dataset.slot || "",
    waveguideType: dataset.waveguideType || dataset.waveguideFamily || "",
    platformId: dataset.platformId || "",
    platformLabel: dataset.platformLabel || "",
    buildingBlockId: dataset.buildingBlockId || "",
    buildingBlockLabel: dataset.buildingBlockLabel || "",
    traceCount: Number(dataset.traceCount) || 0,
    rowCount: Number(dataset.rowCount) || 0,
    chipCount: Number(dataset.chipCount) || 0,
    waveguideCount: Number(dataset.waveguideCount) || 0,
    analyticsSummary: normalizeDatasetAnalyticsSummary(dataset.analyticsSummary),
    analyticsReview: normalizeDatasetAnalyticsReview(dataset.analyticsReview)
  };
}

export function buildLibraryAnalyticsIndex(datasets = []) {
  return datasets
    .map((dataset) => buildLibraryAnalyticsEntry(dataset))
    .sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));
}

export function buildDatasetAnalyticsSummary(dataset) {
  const rawRows = Array.isArray(dataset?.rawRows) ? dataset.rawRows : [];
  if (!rawRows.length) {
    return normalizeDatasetAnalyticsSummary(dataset?.analyticsSummary);
  }

  const columnMap = dataset?.columnMap || {};
  const sourceMeta = dataset?.sourceMeta || {};
  const normalizedRows = buildNormalizedRows(rawRows, columnMap, sourceMeta);
  const propagation = computePropagationLoss(normalizedRows, {
    targetWavelengthNm: sourceMeta.propagationTargetWavelengthNm,
    windowNm: sourceMeta.propagationWindowNm,
    spectralStepNm: sourceMeta.propagationSpectralStepNm,
    mseThreshold: sourceMeta.propagationMseThreshold
  });

  return normalizeDatasetAnalyticsSummary({
    propagationAverage: propagation.summaryStats.avgPropagationLossDbPerCm,
    yield: propagation.passRate,
    measuredChips: propagation.summaryStats.measuredChips,
    computedAt: new Date().toISOString()
  });
}

function upgradeManifestEntryToV2(entry = {}) {
  if ((entry.schemaVersion || entry.librarySchemaVersion) >= 2) return entry;
  return {
    schemaVersion: 2,
    datasetId: entry.datasetId || entry.id,
    id: entry.id || entry.datasetId || entry.label,
    label: entry.label,
    projectName: entry.projectName,
    waferName: entry.waferName,
    selectedDate: entry.selectedDate,
    measurementDate: entry.measurementDate || entry.selectedDate || null,
    publishedDate: entry.publishedDate || null,
    processStep: entry.processStep || "StepXX",
    folder: entry.folder,
    traceFolder: entry.folder,
    sourceType: entry.sourceType,
    measurementMode: entry.measurementMode,
    measurementType: entry.measurementType || "PropagationLoss",
    opticalMode: entry.opticalMode || "",
    alignmentMode: entry.alignmentMode || "",
    mpw: entry.mpw,
    slot: entry.slot,
    waveguideType: entry.waveguideType,
    waveguideFamily: entry.waveguideFamily || entry.waveguideType,
    platformId: entry.platformId || "platform_undefined",
    platformLabel: entry.platformLabel || "Platform Undefined",
    buildingBlockId: entry.buildingBlockId || "measurement_block",
    buildingBlockLabel: entry.buildingBlockLabel || "Measurement Block",
    pdkMonitorBuildingBlock: entry.pdkMonitorBuildingBlock || "",
    traceCount: entry.traceCount,
    rowCount: entry.rowCount,
    chipCount: entry.chipCount,
    waveguideCount: entry.waveguideCount,
    wavelengthMinNm: entry.wavelengthMinNm,
    wavelengthMaxNm: entry.wavelengthMaxNm,
    files: entry.files || [],
    readme: entry.readme,
    metadataFile: entry.metadataFile || "",
    configFile: entry.configFile || "",
    filenameManifest: entry.filenameManifest || "",
    routeConfig: entry.routeConfig || null,
    waveguideConfig: entry.waveguideConfig || null,
    copiedToFolder: true,
    processedInTestingSuite: true,
    notes: entry.notes || "",
    source: entry.source || "github-library",
    librarySchemaVersion: 2
  };
}

function sortWaveguideLengthEntries(lengthMap = {}) {
  return Object.entries(lengthMap || {})
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(([key, value]) => Number.isFinite(key) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0]);
}

export function buildWaveguideConfig(sourceMeta = {}) {
  const waveguideLengths = sortWaveguideLengthEntries(sourceMeta.waveguideLengthByIndex).map(([index, lengthMm]) => ({
    index,
    lengthMm
  }));

  return {
    propagationWaveguideCount: Number(sourceMeta.propagationWaveguideCount) || waveguideLengths.length || 0,
    propagationWaveguideStartMm: Number.isFinite(Number(sourceMeta.propagationWaveguideStartMm))
      ? Number(sourceMeta.propagationWaveguideStartMm)
      : null,
    propagationWaveguideIntervalMm: Number.isFinite(Number(sourceMeta.propagationWaveguideIntervalMm))
      ? Number(sourceMeta.propagationWaveguideIntervalMm)
      : null,
    propagationWaveguideManualMode: Boolean(sourceMeta.propagationWaveguideManualMode),
    waveguideLengths
  };
}

function routeNumber(value, fallbackIndex) {
  const match = String(value || "").match(/(?:WG)?\s*(\d+)/i);
  const parsed = match ? Number(match[1]) : Number(fallbackIndex);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function buildRouteConfig(sourceMeta = {}, measurementType = "PropagationLoss") {
  const normalizedMeasurementType = String(measurementType || sourceMeta.measurementType || "PropagationLoss");
  if (Array.isArray(sourceMeta.routeConfig?.routes)) {
    return {
      ...sourceMeta.routeConfig,
      measurementType: normalizedMeasurementType
    };
  }

  if (normalizedMeasurementType === "InsertionLossCutback") {
    const deviceCounts = sortWaveguideLengthEntries(
      sourceMeta.deviceCountByIndex || sourceMeta.insertionDeviceCountByIndex
    );
    return {
      measurementType: normalizedMeasurementType,
      routes: deviceCounts.map(([index, deviceCount]) => ({
        route: `WG${index}`,
        deviceCount
      }))
    };
  }

  if (normalizedMeasurementType !== "PropagationLoss") {
    return {
      measurementType: normalizedMeasurementType,
      routes: []
    };
  }

  const legacyConfig = buildWaveguideConfig(sourceMeta);
  const configuredLengths = legacyConfig.waveguideLengths.length
    ? legacyConfig.waveguideLengths
    : Array.from({ length: legacyConfig.propagationWaveguideCount }, (_, offset) => ({
        index: offset + 1,
        lengthMm: Number(legacyConfig.propagationWaveguideStartMm || 0)
          + (offset * Number(legacyConfig.propagationWaveguideIntervalMm || 0))
      }));
  const routes = configuredLengths.map(({ index, lengthMm }) => ({
    route: `WG${index}`,
    lengthMm
  }));

  return {
    measurementType: normalizedMeasurementType,
    routes
  };
}

export function routeConfigToWaveguideConfig(routeConfig = {}) {
  if (!Array.isArray(routeConfig.routes)) {
    return buildWaveguideConfig(routeConfig);
  }

  const waveguideLengths = routeConfig.routes
    .map((entry, index) => ({
      index: routeNumber(entry?.route ?? entry?.index, index + 1),
      lengthMm: entry?.lengthMm === null || entry?.lengthMm === undefined ? null : Number(entry.lengthMm)
    }))
    .filter((entry) => Number.isFinite(entry.index) && Number.isFinite(entry.lengthMm))
    .sort((a, b) => a.index - b.index);
  const intervals = waveguideLengths.slice(1).map((entry, index) => entry.lengthMm - waveguideLengths[index].lengthMm);
  const firstInterval = intervals[0];
  const uniformInterval = intervals.length <= 1 || intervals.every((value) => Math.abs(value - firstInterval) < 1e-9);

  return {
    propagationWaveguideCount: waveguideLengths.length,
    propagationWaveguideStartMm: waveguideLengths[0]?.lengthMm ?? null,
    propagationWaveguideIntervalMm: Number.isFinite(firstInterval) ? firstInterval : null,
    propagationWaveguideManualMode: !uniformInterval,
    waveguideLengths
  };
}

export function buildDatasetMetadata(dataset, identity, traceFiles, routeConfig, waveguideConfig) {
  const sourceMeta = dataset?.sourceMeta || {};
  const analyticsSummary = buildDatasetAnalyticsSummary(dataset);
  const measurementDate = getDatasetMeasurementDate(dataset);
  return {
    schemaVersion: 4,
    datasetId: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    measurementDate,
    publishedDate: dataset.publishedDate,
    selectedDate: measurementDate,
    mpwRun: identity.mpw,
    slot: identity.slot,
    processStep: identity.processStep,
    platform: identity.platformLabel,
    platformId: identity.platformId,
    buildingBlock: identity.buildingBlockLabel,
    buildingBlockId: identity.buildingBlockId,
    measurementType: identity.measurementType,
    opticalMode: identity.opticalMode,
    alignmentMode: identity.alignmentMode,
    pdkMonitorBuildingBlock: buildPdkMonitorBuildingBlockName(identity),
    measurementMode: identity.measurementMode,
    waveguideType: identity.waveguideFamily,
    sourceType: identity.sourceType,
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    analyticsSummary,
    analyticsReview: normalizeDatasetAnalyticsReview(dataset?.analyticsReview),
    copiedToFolder: true,
    processedInTestingSuite: true,
    notes: sourceMeta.notes || "",
    publisher: "CORNERSTONE",
    license: null,
    sourceNames: identity.sourceNames,
    traceFiles: traceFiles.map((file) => file.fileName),
    filenamePattern: "Chip#_WG#.txt",
    filenameManifest: `${identity.folderName}/${FILENAME_MANIFEST_FILE_NAME}`,
    traceFormat: {
      fileType: "text/plain",
      delimiter: "tab",
      header: false,
      columns: ["wavelength_nm", "optical_power_w"]
    },
    routeConfig,
    waveguideConfig,
    legacyFolder: identity.legacyFolder,
    metadataFile: `${identity.folderName}/metadata.json`,
    configFile: `${identity.folderName}/${ROUTE_CONFIG_FILE_NAME}`
  };
}

function normalizeNumberedTraceToken(value, prefix, sourceName) {
  const direct = String(value || "").match(/(\d+)/);
  const source = String(sourceName || "").match(new RegExp(`${prefix}\\s*[_-]?\\s*(\\d+)`, "i"));
  const number = direct?.[1] || source?.[1] || "";
  return number ? `${prefix}${Number(number)}` : "";
}

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function sha256Hex(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || "")));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const primes = [];
  for (let candidate = 2; primes.length < 64; candidate += 1) {
    if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate);
  }
  const constants = primes.map((prime) => Math.floor((Math.cbrt(prime) % 1) * 0x100000000) >>> 0);
  const hash = primes.slice(0, 8).map((prime) => Math.floor((Math.sqrt(prime) % 1) * 0x100000000) >>> 0);
  const words = new Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] = ((bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const sigma0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const sigma1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => { hash[index] = (hash[index] + value) >>> 0; });
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function buildDatasetTraceFiles(rows, identity) {
  const grouped = rows.reduce((acc, row) => {
    const key = row.source_name || `${row.chip_id || "chip"}-${row.waveguide_id || "wg"}`;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());

  const traceFiles = Array.from(grouped.entries()).map(([sourceName, sourceRows]) => {
    const ordered = [...sourceRows].sort((a, b) => Number(a.wavelength_nm) - Number(b.wavelength_nm));
    const chipIds = unique(ordered.map((row) => normalizeNumberedTraceToken(row.chip_id, "Chip", sourceName)));
    const routeIds = unique(ordered.map((row) => normalizeNumberedTraceToken(row.waveguide_id, "WG", sourceName)));
    if (chipIds.length !== 1 || routeIds.length !== 1) {
      throw new Error(`Could not assign one Chip# and one WG# to source file ${sourceName || "(unnamed)"}. Check the chip and route columns before publishing.`);
    }
    const chipId = chipIds[0];
    const waveguideId = routeIds[0];
    const outputName = `${chipId}_${waveguideId}.txt`;
    const points = ordered
      .filter((row) => Number.isFinite(Number(row.wavelength_nm)) && Number.isFinite(Number(row.optical_power_w)))
      .map((row) => `${Number(row.wavelength_nm)}\t${Number(row.optical_power_w)}`);
    if (!points.length) return null;
    const content = points.join("\n");
    return {
      fileName: outputName,
      content,
      rowCount: ordered.length,
      sourceName,
      chipId,
      waveguideId,
      sha256: sha256Hex(content)
    };
  }).filter(Boolean);
  const duplicateNames = traceFiles
    .map((file) => file.fileName)
    .filter((fileName, index, values) => values.indexOf(fileName) !== index);
  if (duplicateNames.length) {
    throw new Error(`Short trace filename collision: ${unique(duplicateNames).join(", ")}. Each dataset must contain only one source trace for each Chip#/WG# route.`);
  }
  return traceFiles;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildFilenameManifest(traceFiles = []) {
  const encoder = new TextEncoder();
  const header = ["original_filename", "trace_filename", "chip", "route", "sha256", "size_bytes"];
  const rows = traceFiles.map((file) => [
    file.sourceName,
    file.fileName,
    file.chipId,
    file.waveguideId,
    file.sha256,
    encoder.encode(file.content || "").length
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function buildPdkMonitorBuildingBlockName(identity = {}) {
  const platform = String(identity.platformLabel || "");
  const platformBase = platform.startsWith("SOI220nm") ? "SOI220nm" : platform;
  return [platformBase, identity.opticalMode, identity.buildingBlockLabel].filter(Boolean).join("_");
}

export function buildDatasetReadme(identity, traceFiles, metadata) {
  const chipList = unique(traceFiles.map((file) => file.chipId)).join(", ") || "--";
  const waveguideList = unique(traceFiles.map((file) => file.waveguideId)).join(", ") || "--";
  return [
    `# ${identity.label}`,
    "",
    `This folder contains GitHub-hosted measurement traces for ${identity.projectName}.`,
    "",
    "## Dataset Summary",
    `- Project: ${identity.projectName}`,
    `- Wafer: ${identity.waferName}`,
    `- Platform: ${identity.platformLabel}`,
    `- Building block: ${identity.buildingBlockLabel}`,
    `- PDKMonitor building block: ${metadata?.pdkMonitorBuildingBlock || "--"}`,
    `- Optical mode: ${identity.opticalMode}`,
    `- Alignment mode: ${identity.alignmentMode}`,
    `- Measurement type: ${identity.measurementType}`,
    `- Waveguide type: ${identity.waveguideFamily}`,
    `- Process step: ${identity.processStep}`,
    `- Measurement date: ${formatDateLabel(metadata?.measurementDate)}`,
    `- Published date: ${formatDateLabel(metadata?.publishedDate)}`,
    `- Files: ${traceFiles.length}`,
    `- Chips: ${chipList}`,
    `- Waveguides: ${waveguideList}`,
    `- Metadata: metadata.json`,
    `- Route config: ${ROUTE_CONFIG_FILE_NAME}`,
    `- Filename manifest: ${FILENAME_MANIFEST_FILE_NAME}`,
    `- Publisher: ${metadata?.publisher || "CORNERSTONE"}`,
    `- License: ${metadata?.license || "Pending"}`,
    `- Normalized rows: ${identity.rowCount}`,
    `- Wavelength span: ${formatNumber(identity.wavelengthMinNm, 3)} nm to ${formatNumber(identity.wavelengthMaxNm, 3)} nm`,
    metadata?.notes ? `- Notes: ${metadata.notes}` : null,
    "",
    "## Filename Pattern",
    "Each trace uses `Chip#_WG#.txt`. The filename manifest maps every original filename to its published trace filename and SHA-256 checksum.",
    "",
    "Each trace is a headerless, tab-delimited, two-column text file:",
    "1. wavelength in nm",
    "2. optical power in W",
    "",
    "This folder was prepared for the Wafer Post-Processing Suite GitHub measurement-data library."
  ].filter(Boolean).join("\n");
}

export function buildDatasetManifestEntry(identity, traceFiles, routeConfig, waveguideConfig, metadata) {
  return {
    id: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    selectedDate: metadata?.measurementDate || identity.selectedDate,
    measurementDate: metadata?.measurementDate || null,
    publishedDate: metadata?.publishedDate || null,
    folder: `sample-data/wst/${identity.folderName}`,
    sourceType: identity.sourceType,
    measurementMode: identity.measurementMode,
    measurementType: identity.measurementType,
    opticalMode: identity.opticalMode,
    alignmentMode: identity.alignmentMode,
    mpw: identity.mpw,
    slot: identity.slot,
    processStep: identity.processStep,
    waveguideType: identity.waveguideType,
    platformId: identity.platformId,
    platformLabel: identity.platformLabel,
    buildingBlockId: identity.buildingBlockId,
    buildingBlockLabel: identity.buildingBlockLabel,
    pdkMonitorBuildingBlock: metadata?.pdkMonitorBuildingBlock || buildPdkMonitorBuildingBlockName(identity),
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    files: traceFiles.map((file) => file.fileName),
    readme: `${identity.folderName}/README.md`,
    metadataFile: `${identity.folderName}/metadata.json`,
    configFile: `${identity.folderName}/${ROUTE_CONFIG_FILE_NAME}`,
    filenameManifest: `${identity.folderName}/${FILENAME_MANIFEST_FILE_NAME}`,
    routeConfig,
    waveguideConfig,
    analyticsSummary: normalizeDatasetAnalyticsSummary(metadata?.analyticsSummary),
    analyticsReview: normalizeDatasetAnalyticsReview(metadata?.analyticsReview),
    notes: metadata?.notes || "",
    source: "github-library",
    librarySchemaVersion: 1
  };
}

export function buildDatasetManifestEntryV2(identity, traceFiles, routeConfig, waveguideConfig, metadata) {
  return {
    schemaVersion: 4,
    datasetId: identity.id,
    id: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    selectedDate: metadata?.measurementDate || identity.selectedDate,
    measurementDate: metadata?.measurementDate || null,
    publishedDate: metadata?.publishedDate || null,
    folder: `sample-data/wst/${identity.folderName}`,
    traceFolder: `sample-data/wst/${identity.folderName}`,
    sourceType: identity.sourceType,
    measurementMode: identity.measurementMode,
    measurementType: identity.measurementType,
    opticalMode: identity.opticalMode,
    alignmentMode: identity.alignmentMode,
    mpw: identity.mpw,
    slot: identity.slot,
    processStep: identity.processStep,
    waveguideType: identity.waveguideType,
    waveguideFamily: identity.waveguideFamily,
    platformId: identity.platformId,
    platformLabel: identity.platformLabel,
    buildingBlockId: identity.buildingBlockId,
    buildingBlockLabel: identity.buildingBlockLabel,
    pdkMonitorBuildingBlock: metadata?.pdkMonitorBuildingBlock || buildPdkMonitorBuildingBlockName(identity),
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    files: traceFiles.map((file) => file.fileName),
    readme: `${identity.folderName}/README.md`,
    metadataFile: `${identity.folderName}/metadata.json`,
    configFile: `${identity.folderName}/${ROUTE_CONFIG_FILE_NAME}`,
    filenameManifest: `${identity.folderName}/${FILENAME_MANIFEST_FILE_NAME}`,
    routeConfig,
    waveguideConfig,
    analyticsSummary: normalizeDatasetAnalyticsSummary(metadata?.analyticsSummary),
    analyticsReview: normalizeDatasetAnalyticsReview(metadata?.analyticsReview),
    copiedToFolder: metadata?.copiedToFolder ?? true,
    processedInTestingSuite: metadata?.processedInTestingSuite ?? true,
    notes: metadata?.notes || "",
    source: "github-library-v4",
    librarySchemaVersion: 4
  };
}

export function buildDatasetSnapshotMetadata(dataset) {
  const detectedIdentity = inferDatasetIdentity({
    projectName: dataset.projectName,
    waferName: dataset.waferName,
    sourceMeta: dataset.sourceMeta,
    rows: dataset.rawRows || [],
    selectedDate: dataset.selectedDate
  });
  const identity = applyDatasetNamingOverrides(detectedIdentity, dataset.namingOverrides);

  return {
    ...identity,
    shortLabel: identity.label || `${identity.mpw} ${identity.slot} ${identity.waveguideType}`,
    rowLabel: `${identity.rowCount.toLocaleString()} normalized rows`,
    sourceLabel: `${identity.sourceCount} file${identity.sourceCount === 1 ? "" : "s"}`
  };
}

export function buildUpdatedPublishedDatasetManifestEntry(dataset, namingOverrides = {}, metadata = {}) {
  const nextLabel = normalizeOverrideText(namingOverrides.label, dataset.label);
  const nextProjectName = normalizeOverrideText(namingOverrides.projectName, dataset.projectName);
  const nextSlot = normalizeOverrideText(namingOverrides.slot, dataset.slot);
  const nextProcessStep = normalizeProcessStep(metadata.processStep || namingOverrides.processStep || dataset.processStep) || "StepXX";
  const nextPlatformLabel = normalizeOverrideText(namingOverrides.platformLabel, dataset.platformLabel);
  const nextBuildingBlockLabel = normalizeOverrideText(namingOverrides.buildingBlockLabel, dataset.buildingBlockLabel);
  const nextMeasurementType = normalizeOverrideText(namingOverrides.measurementType, dataset.measurementType);
  const nextOpticalMode = normalizeOverrideText(namingOverrides.opticalMode, dataset.opticalMode);
  const nextAlignmentMode = normalizeOverrideText(namingOverrides.alignmentMode, dataset.alignmentMode);
  const analyticsSummary = normalizeDatasetAnalyticsSummary(
    metadata.analyticsSummary || dataset.analyticsSummary
  );
  const analyticsReview = normalizeDatasetAnalyticsReview(
    metadata.analyticsReview || dataset.analyticsReview
  );

  return {
    ...dataset,
    label: nextLabel,
    projectName: nextProjectName,
    slot: nextSlot,
    processStep: nextProcessStep,
    mpw: normalizeOverrideText(namingOverrides.mpw || namingOverrides.projectName, dataset.mpw),
    platformLabel: nextPlatformLabel,
    buildingBlockLabel: nextBuildingBlockLabel,
    measurementType: nextMeasurementType,
    opticalMode: nextOpticalMode,
    alignmentMode: nextAlignmentMode,
    pdkMonitorBuildingBlock: metadata.pdkMonitorBuildingBlock || buildPdkMonitorBuildingBlockName({
      platformLabel: nextPlatformLabel,
      opticalMode: nextOpticalMode,
      buildingBlockLabel: nextBuildingBlockLabel
    }) || dataset.pdkMonitorBuildingBlock,
    selectedDate: metadata.measurementDate || dataset.selectedDate,
    measurementDate: metadata.measurementDate || dataset.measurementDate || null,
    publishedDate: metadata.publishedDate || dataset.publishedDate || null,
    analyticsSummary,
    analyticsReview
  };
}

function encodeBase64Unicode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 404) return null;
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    const message = typeof payload === "string"
      ? payload
      : payload?.message || `GitHub request failed with status ${response.status}.`;
    const error = new Error(message || `GitHub request failed with status ${response.status}.`);
    error.name = "GitHubRequestError";
    error.githubStatus = response.status;
    error.githubPayload = payload;
    throw error;
  }
  return response.json();
}

async function getExistingFileSha({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const result = await githubRequest(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  return result?.sha || null;
}

async function putGithubFile({ owner, repo, branch, path, token, message, content }) {
  const existingSha = await getExistingFileSha({ owner, repo, branch, path, token });
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  return githubRequest(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      message,
      branch,
      content: encodeBase64Unicode(content),
      ...(existingSha ? { sha: existingSha } : {})
    })
  });
}

async function deleteGithubFile({ owner, repo, branch, path, token, message }) {
  const existingSha = await getExistingFileSha({ owner, repo, branch, path, token });
  if (!existingSha) return null;

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  return githubRequest(url, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      message,
      branch,
      sha: existingSha
    })
  });
}

export async function publishDatasetPackageToGithub({
  owner,
  repo,
  branch,
  token,
  manifestPath,
  mirrorManifestPath,
  manifestPathV2,
  mirrorManifestPathV2,
  analyticsIndexPath,
  analyticsIndexMirrorPath,
  packageData,
  existingManifest = [],
  existingManifestV2 = [],
  onProgress
}) {
  const nextManifest = [
    packageData.manifestEntry,
    ...existingManifest.filter((entry) => entry.id !== packageData.manifestEntry.id)
  ].sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));

  const nextManifestV2 = [
    packageData.manifestEntryV2,
    ...existingManifestV2
      .map((entry) => upgradeManifestEntryToV2(entry))
      .filter((entry) => entry.id !== packageData.manifestEntryV2.id)
  ].sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));
  const analyticsIndex = buildLibraryAnalyticsIndex(nextManifestV2);

  const filesToWrite = [
    ...packageData.traceFiles.map((file) => (
      { path: `public/sample-data/wst/${packageData.identity.folderName}/${file.fileName}`, content: file.content }
    )),
    { path: `public/sample-data/wst/${packageData.identity.folderName}/README.md`, content: packageData.readme },
    { path: `public/sample-data/wst/${packageData.identity.folderName}/${packageData.metadataFileName}`, content: packageData.metadataContent },
    { path: `public/sample-data/wst/${packageData.identity.folderName}/${packageData.configFileName}`, content: packageData.configContent },
    { path: `public/sample-data/wst/${packageData.identity.folderName}/${packageData.legacyConfigFileName}`, content: packageData.legacyConfigContent },
    { path: `public/sample-data/wst/${packageData.identity.folderName}/${packageData.filenameManifestFileName}`, content: packageData.filenameManifestContent },
    ...(manifestPath ? [{ path: manifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" }] : []),
    ...(mirrorManifestPath ? [{ path: mirrorManifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" }] : []),
    ...(manifestPathV2 ? [{ path: manifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n" }] : []),
    ...(mirrorManifestPathV2 ? [{ path: mirrorManifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n" }] : []),
    ...(analyticsIndexPath ? [{ path: analyticsIndexPath, content: JSON.stringify(analyticsIndex, null, 2) + "\n" }] : []),
    ...(analyticsIndexMirrorPath ? [{ path: analyticsIndexMirrorPath, content: JSON.stringify(analyticsIndex, null, 2) + "\n" }] : [])
  ];

  let completed = 0;
  for (const file of filesToWrite) {
    onProgress?.({ completed, total: filesToWrite.length, path: file.path });
    await putGithubFile({
      owner,
      repo,
      branch,
      token,
      path: file.path,
      content: file.content,
      message: `Add measurement dataset ${packageData.identity.label}`
    });
    completed += 1;
    onProgress?.({ completed, total: filesToWrite.length, path: file.path });
  }

  return {
    manifest: nextManifest,
    manifestV2: nextManifestV2,
    folderUrl: `https://github.com/${owner}/${repo}/tree/${branch}/public/sample-data/wst/${packageData.identity.folderName}`
  };
}

export async function updatePublishedDatasetMetadataOnGithub({
  owner,
  repo,
  branch,
  token,
  manifestPath,
  mirrorManifestPath,
  manifestPathV2,
  mirrorManifestPathV2,
  analyticsIndexPath,
  analyticsIndexMirrorPath,
  dataset,
  metadata,
  existingManifest = [],
  existingManifestV2 = [],
  onProgress
}) {
  const manifestEntry = buildUpdatedPublishedDatasetManifestEntry(dataset, metadata.namingOverrides, metadata);
  const nextManifest = [manifestEntry, ...existingManifest.filter((entry) => entry.id !== dataset.id)]
    .sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));
  const nextManifestV2 = [manifestEntry, ...existingManifestV2.filter((entry) => entry.id !== dataset.id)]
    .sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));
  const analyticsIndex = buildLibraryAnalyticsIndex(nextManifestV2);
  const filesToWrite = [
    {
      path: `public/${dataset.folder}/metadata.json`,
      content: JSON.stringify(metadata, null, 2) + "\n"
    },
    ...(manifestPath ? [{ path: manifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" }] : []),
    ...(mirrorManifestPath ? [{ path: mirrorManifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" }] : []),
    ...(manifestPathV2 ? [{ path: manifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n" }] : []),
    ...(mirrorManifestPathV2 ? [{ path: mirrorManifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n" }] : []),
    ...(analyticsIndexPath ? [{ path: analyticsIndexPath, content: JSON.stringify(analyticsIndex, null, 2) + "\n" }] : []),
    ...(analyticsIndexMirrorPath ? [{ path: analyticsIndexMirrorPath, content: JSON.stringify(analyticsIndex, null, 2) + "\n" }] : [])
  ];

  let completed = 0;
  for (const file of filesToWrite) {
    onProgress?.({ completed, total: filesToWrite.length, path: file.path });
    await putGithubFile({
      owner,
      repo,
      branch,
      token,
      path: file.path,
      content: file.content,
      message: `Update measurement dataset metadata ${manifestEntry.label}`
    });
    completed += 1;
    onProgress?.({ completed, total: filesToWrite.length, path: file.path });
  }

  return {
    manifest: nextManifest,
    manifestV2: nextManifestV2,
    folderUrl: `https://github.com/${owner}/${repo}/tree/${branch}/public/${dataset.folder}`
  };
}

export async function deletePublishedDatasetFromGithub({
  owner,
  repo,
  branch,
  token,
  manifestPath,
  mirrorManifestPath,
  manifestPathV2,
  mirrorManifestPathV2,
  analyticsIndexPath,
  analyticsIndexMirrorPath,
  dataset,
  existingManifest = [],
  existingManifestV2 = [],
  onProgress
}) {
  if (!owner || !repo || !token) {
    throw new Error("GitHub owner, repo, and token are required.");
  }
  if (!dataset?.id || !dataset?.folder) {
    throw new Error("Published dataset metadata is incomplete.");
  }

  const nextManifest = existingManifest.filter((entry) => entry?.id !== dataset.id)
    .sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));
  const nextManifestV2 = existingManifestV2.filter((entry) => entry?.id !== dataset.id)
    .sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));
  const analyticsIndex = buildLibraryAnalyticsIndex(nextManifestV2);
  const datasetFolder = String(dataset.folder || "").replace(/^\/+|\/+$/g, "");
  const datasetFiles = Array.isArray(dataset.files) ? dataset.files.filter(Boolean) : [];
  const deletePaths = unique([
    `public/${datasetFolder}/README.md`,
    `public/${datasetFolder}/metadata.json`,
    `public/${datasetFolder}/${ROUTE_CONFIG_FILE_NAME}`,
    `public/${datasetFolder}/${FILENAME_MANIFEST_FILE_NAME}`,
    `public/${datasetFolder}/waveguide-config.json`,
    ...datasetFiles.map((fileName) => `public/${datasetFolder}/${fileName}`)
  ]);
  const writes = [
    manifestPath ? { path: manifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n", message: `Remove ${dataset.label || dataset.id} from library manifest` } : null,
    mirrorManifestPath ? { path: mirrorManifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n", message: `Mirror removal of ${dataset.label || dataset.id} from library manifest` } : null,
    manifestPathV2 ? { path: manifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n", message: `Remove ${dataset.label || dataset.id} from library manifest v2` } : null,
    mirrorManifestPathV2 ? { path: mirrorManifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n", message: `Mirror removal of ${dataset.label || dataset.id} from library manifest v2` } : null,
    analyticsIndexPath ? { path: analyticsIndexPath, content: JSON.stringify(analyticsIndex, null, 2) + "\n", message: `Remove ${dataset.label || dataset.id} from library analytics cache` } : null,
    analyticsIndexMirrorPath ? { path: analyticsIndexMirrorPath, content: JSON.stringify(analyticsIndex, null, 2) + "\n", message: `Mirror removal of ${dataset.label || dataset.id} from library analytics cache` } : null
  ].filter(Boolean);

  let completed = 0;
  const total = deletePaths.length + writes.length;
  for (const path of deletePaths) {
    onProgress?.({ completed, total, path });
    await deleteGithubFile({
      owner,
      repo,
      branch,
      token,
      path,
      message: `Delete measurement dataset ${dataset.label || dataset.id}`
    });
    completed += 1;
    onProgress?.({ completed, total, path });
  }

  for (const file of writes) {
    onProgress?.({ completed, total, path: file.path });
    await putGithubFile({
      owner,
      repo,
      branch,
      token,
      path: file.path,
      content: file.content,
      message: file.message
    });
    completed += 1;
    onProgress?.({ completed, total, path: file.path });
  }

  return {
    manifest: nextManifest,
    manifestV2: nextManifestV2
  };
}

export function buildGithubDatasetPackage(dataset) {
  const measurementDate = getDatasetMeasurementDate(dataset);
  if (!measurementDate) {
    throw new Error("Enter a valid measurement date in YYYY-MM-DD format before publishing this dataset.");
  }
  const publishDataset = {
    ...dataset,
    measurementDate,
    publishedDate: new Date().toISOString().slice(0, 10)
  };
  const detectedIdentity = inferDatasetIdentity({
    projectName: publishDataset.projectName,
    waferName: publishDataset.waferName,
    sourceMeta: publishDataset.sourceMeta,
    rows: publishDataset.rawRows || [],
    selectedDate: measurementDate
  });
  const identity = applyDatasetNamingOverrides(detectedIdentity, publishDataset.namingOverrides);
  if (!isValidProcessStep(identity.processStep)) {
    throw new Error("Enter a valid process step such as Step36, Step84A, or StepXX before publishing this dataset.");
  }
  const canonicalValidation = validateCanonicalDatasetIdentity(identity);
  if (!canonicalValidation.valid) {
    throw new Error(`Complete the controlled publish identity before publishing: ${canonicalValidation.missing.join(", ")}.`);
  }
  const canonicalFolderName = buildCanonicalDatasetFolderName(identity);
  identity.folderName = canonicalFolderName;
  identity.label = canonicalFolderName;
  identity.id = slugify(canonicalFolderName).toLowerCase();
  identity.legacyFolder = `sample-data/wst/${canonicalFolderName}`;
  // Snapshots retain original upload rows. Normalize them here so column mappings
  // and per-file source names are honoured when the package is built.
  const rawRows = publishDataset.rawRows || [];
  const columnMap = publishDataset.columnMap && Object.keys(publishDataset.columnMap).length
    ? publishDataset.columnMap
    : Object.fromEntries(Object.keys(rawRows[0] || {}).map((column) => [column, column]));
  const traceRows = buildNormalizedRows(rawRows, columnMap, publishDataset.sourceMeta || {});
  const traceFiles = buildDatasetTraceFiles(traceRows, identity);
  if (!traceFiles.length) {
    throw new Error("This dataset does not contain trace-style wavelength and optical-power rows that can be published to the GitHub measurement library.");
  }
  const waveguideConfig = buildWaveguideConfig(publishDataset.sourceMeta);
  const routeConfig = buildRouteConfig(publishDataset.sourceMeta, identity.measurementType);
  const metadata = buildDatasetMetadata(publishDataset, identity, traceFiles, routeConfig, waveguideConfig);
  const readme = buildDatasetReadme(identity, traceFiles, metadata);
  const filenameManifestContent = buildFilenameManifest(traceFiles);
  const manifestEntry = buildDatasetManifestEntry(identity, traceFiles, routeConfig, waveguideConfig, metadata);
  const manifestEntryV2 = buildDatasetManifestEntryV2(identity, traceFiles, routeConfig, waveguideConfig, metadata);
  return {
    identity,
    traceFiles,
    readme,
    metadata,
    manifestEntry,
    manifestEntryV2,
    metadataFileName: "metadata.json",
    metadataContent: JSON.stringify(metadata, null, 2) + "\n",
    configFileName: ROUTE_CONFIG_FILE_NAME,
    configContent: JSON.stringify(routeConfig, null, 2) + "\n",
    legacyConfigFileName: LEGACY_WAVEGUIDE_CONFIG_FILE_NAME,
    legacyConfigContent: JSON.stringify(waveguideConfig, null, 2) + "\n",
    filenameManifestFileName: FILENAME_MANIFEST_FILE_NAME,
    filenameManifestContent
  };
}


