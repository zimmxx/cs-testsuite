export const PLATFORM_OPTIONS = [
  "220nmSOI",
  "220nmSOIActive",
  "340nmSOI",
  "300nmSiN",
  "500nmSiN",
  "GeonSi",
  "other"
];

export const WAVEGUIDE_TYPE_OPTIONS = ["StripWaveguide", "RibWaveguide"];
export const MEASUREMENT_MODE_OPTIONS = ["Manual", "WST"];

function cleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function matchToken(source, pattern, formatter) {
  const match = String(source || "").match(pattern);
  if (!match) return "";
  return formatter ? formatter(match) : match[0];
}

function detectPlatform(source) {
  const normalized = String(source || "").toLowerCase().replace(/[_\-\s]+/g, "");
  if (normalized.includes("220nmsoiactive")) return "220nmSOIActive";
  if (normalized.includes("220nmsoi")) return "220nmSOI";
  if (normalized.includes("340nmsoi")) return "340nmSOI";
  if (normalized.includes("300nmsin")) return "300nmSiN";
  if (normalized.includes("500nmsin")) return "500nmSiN";
  if (normalized.includes("geonsi")) return "GeonSi";
  return "220nmSOI";
}

function detectWaveguideType(source) {
  if (/\brib\b/i.test(source)) return "RibWaveguide";
  return "StripWaveguide";
}

function detectMeasurementType(source) {
  if (/heater|mzi/i.test(source)) return "HeaterEfficiency";
  if (/insertion|\bil\b/i.test(source)) return "InsertionLoss";
  return "PropagationLoss";
}

function detectMeasurementMode(source) {
  if (/wst|tester|automated/i.test(source)) return "WST";
  return "Manual";
}

export function normalizeStandardMetadata(meta = {}) {
  const mpwMatch = matchToken(meta.mpw || "", /(MPW\s*\d+)/i, (match) => cleanToken(match[1]).toUpperCase());
  const slotNumber = matchToken(meta.slot || "", /(\d+)/, (match) => match[1]);
  const chipNumber = matchToken(meta.chipId || "", /(\d+)/, (match) => match[1]);
  const waveguideNumber = matchToken(meta.waveguideId || "", /(\d+)/, (match) => match[1]);
  const rawPlatform = String(meta.platform || "").trim();
  const platform = PLATFORM_OPTIONS.includes(rawPlatform) ? rawPlatform : detectPlatform(rawPlatform);
  const rawWaveguide = String(meta.waveguideDescriptor || meta.waveguideType || "").trim();
  const waveguideDescriptor = WAVEGUIDE_TYPE_OPTIONS.includes(rawWaveguide) ? rawWaveguide : detectWaveguideType(rawWaveguide);
  const rawMode = String(meta.mode || "").trim();
  const mode = MEASUREMENT_MODE_OPTIONS.includes(rawMode) ? rawMode : detectMeasurementMode(rawMode);

  return {
    mpw: mpwMatch || "MPWUNDEFINED",
    platform: platform || "220nmSOI",
    slot: slotNumber ? `Slot${slotNumber}` : "SlotUndefined",
    waveguideDescriptor,
    measurementType: String(meta.measurementType || "PropagationLoss").trim() || "PropagationLoss",
    mode,
    chipId: chipNumber ? `Chip${chipNumber}` : "",
    waveguideId: waveguideNumber ? `WG${waveguideNumber}` : "",
    extension: String(meta.extension || "txt").replace(/^\./, "").toLowerCase() || "txt"
  };
}

export function detectStandardFilenameMetadata(pathOrName, overrides = {}) {
  const source = String(pathOrName || "");
  const combined = `${source} ${JSON.stringify(overrides)}`;
  return normalizeStandardMetadata({
    mpw: matchToken(combined, /(MPW\s*\d+)/i, (match) => cleanToken(match[1]).toUpperCase()),
    platform: overrides.platform || detectPlatform(combined),
    slot: matchToken(combined, /(?:^|[_\-\s])slot\s*[_\-\s]*(\d+)/i, (match) => `Slot${match[1]}`),
    waveguideDescriptor: overrides.waveguideDescriptor || detectWaveguideType(combined),
    measurementType: overrides.measurementType || detectMeasurementType(combined),
    mode: overrides.mode || detectMeasurementMode(combined),
    chipId: matchToken(combined, /(?:^|[_\-\s])chip\s*[_\-\s]*(\d+)/i, (match) => `Chip${match[1]}`),
    waveguideId: matchToken(combined, /(?:^|[_\-\s])wg\s*[_\-\s]*(\d+)/i, (match) => `WG${match[1]}`),
    extension: overrides.extension || source.split(".").pop() || "txt"
  });
}

export function buildStandardDatasetBaseName(meta = {}) {
  const normalized = normalizeStandardMetadata(meta);
  return [
    normalized.mpw,
    normalized.platform,
    normalized.slot,
    normalized.waveguideDescriptor,
    normalized.measurementType,
    normalized.mode
  ].filter(Boolean).join("_");
}

export function buildStandardMeasurementFileName(meta = {}) {
  const normalized = normalizeStandardMetadata(meta);
  const suffix = [normalized.chipId, normalized.waveguideId].filter(Boolean).join("_");
  return `${buildStandardDatasetBaseName(normalized)}${suffix ? `_${suffix}` : ""}.${normalized.extension}`;
}

export function formatDateStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}${month}${year}`;
}

export function buildConvertedArchiveName(meta = {}, value = new Date()) {
  return `${buildStandardDatasetBaseName(meta)}_converted_${formatDateStamp(value)}`;
}

export function mergeBatchStandardMetadata(entries = [], overrides = {}) {
  const source = entries.map((entry) => entry?.sourcePath || entry?.sourceName || entry?.outputFileName || "").join(" ");
  const detected = detectStandardFilenameMetadata(source, overrides);
  return normalizeStandardMetadata({
    ...detected,
    ...overrides,
    mpw: overrides.mpw || detected.mpw,
    platform: overrides.platform || detected.platform,
    slot: overrides.slot || detected.slot,
    waveguideDescriptor: overrides.waveguideDescriptor || detected.waveguideDescriptor,
    measurementType: overrides.measurementType || detected.measurementType,
    mode: overrides.mode || detected.mode
  });
}

export function buildFilenameConversionManifest(entries = []) {
  const header = [
    "source_path",
    "output_file",
    "mpw",
    "platform",
    "slot",
    "waveguide_descriptor",
    "measurement_type",
    "mode",
    "chip_id",
    "waveguide_id"
  ];
  const lines = entries.map((entry) => [
    entry.sourcePath,
    entry.outputFileName,
    entry.standardMeta?.mpw,
    entry.standardMeta?.platform,
    entry.standardMeta?.slot,
    entry.standardMeta?.waveguideDescriptor,
    entry.standardMeta?.measurementType,
    entry.standardMeta?.mode,
    entry.standardMeta?.chipId,
    entry.standardMeta?.waveguideId
  ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}
