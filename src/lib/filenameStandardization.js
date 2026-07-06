function cleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function titleCaseCompact(value) {
  return normalizeLabel(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("");
}

function matchToken(source, pattern, formatter) {
  const match = String(source || "").match(pattern);
  if (!match) return "";
  return formatter ? formatter(match) : match[0];
}

function inferWaveguideDescriptor(source) {
  if (/\bstrip\b/i.test(source)) return "StripWaveguide";
  if (/\brib\b/i.test(source)) return "RibWaveguide";
  if (/\bslot\b/i.test(source)) return "SlotWaveguide";
  return "Waveguide";
}

function inferMeasurementType(source) {
  if (/heater|mzi/i.test(source)) return "HeaterEfficiency";
  if (/insertion|\bil\b/i.test(source)) return "InsertionLoss";
  if (/propagation|loss/i.test(source)) return "PropagationLoss";
  return "PropagationLoss";
}

function inferMode(source) {
  if (/manual/i.test(source)) return "Manual";
  if (/wst|tester|automated/i.test(source)) return "WST";
  return "Measurement";
}

function inferPlatform(source) {
  const direct = matchToken(source, /(\d+\s*nm\s*SOI)/i, (match) => cleanToken(match[1]).replace(/_/g, ""));
  if (direct) return direct;
  return "220nmSOI";
}

export function normalizeStandardMetadata(meta = {}) {
  const mpw = cleanToken(meta.mpw || "").toUpperCase() || "MPWUndefined";
  const platform = cleanToken(meta.platform || "").replace(/_/g, "") || "220nmSOI";
  const slotNumber = matchToken(meta.slot || "", /(\d+)/, (match) => match[1]);
  const chipNumber = matchToken(meta.chipId || "", /(\d+)/, (match) => match[1]);
  const waveguideNumber = matchToken(meta.waveguideId || "", /(\d+)/, (match) => match[1]);

  return {
    mpw,
    platform,
    slot: slotNumber ? `Slot${slotNumber}` : "SlotUndefined",
    waveguideDescriptor: cleanToken(meta.waveguideDescriptor || titleCaseCompact(meta.waveguideType) || "Waveguide"),
    measurementType: cleanToken(meta.measurementType || "PropagationLoss"),
    mode: cleanToken(meta.mode || "Measurement"),
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
    platform: overrides.platform || inferPlatform(combined),
    slot: matchToken(combined, /slot\s*[_ -]*(\d+)/i, (match) => `Slot${match[1]}`),
    waveguideDescriptor: overrides.waveguideDescriptor || inferWaveguideDescriptor(combined),
    measurementType: overrides.measurementType || inferMeasurementType(combined),
    mode: overrides.mode || inferMode(combined),
    chipId: matchToken(combined, /chip\s*[_ -]*(\d+)/i, (match) => `Chip${match[1]}`),
    waveguideId: matchToken(combined, /\bWG\s*[_ -]*(\d+)/i, (match) => `WG${match[1]}`),
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
  const base = buildStandardDatasetBaseName(normalized);
  const suffix = [normalized.chipId, normalized.waveguideId].filter(Boolean).join("_");
  return `${suffix ? `${base}_${suffix}` : base}.${normalized.extension}`;
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
  return normalizeStandardMetadata({
    ...detectStandardFilenameMetadata(source, overrides),
    ...overrides
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
