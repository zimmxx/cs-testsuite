export function prettifyIdentifier(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinedDatasetText(dataset = {}) {
  const files = Array.isArray(dataset.files) ? dataset.files : [];
  const rows = Array.isArray(dataset.rawRows) ? dataset.rawRows : Array.isArray(dataset.rows) ? dataset.rows : [];
  const display = dataset.display || {};
  return [
    dataset.label,
    dataset.projectName,
    dataset.waferName,
    dataset.mpw,
    dataset.slot,
    dataset.waveguideType,
    dataset.measurementMode,
    dataset.sourceType,
    dataset.sourceMeta?.name,
    dataset.sourceMeta?.type,
    display.label,
    display.projectName,
    display.waferName,
    display.mpw,
    display.slot,
    display.waveguideType,
    display.measurementMode,
    ...files,
    ...rows.slice(0, 24).map((row) => row?.source_name || "")
  ].filter(Boolean).join(" ");
}

function detectMpw(dataset = {}) {
  const joined = joinedDatasetText(dataset);
  const match = joined.match(/MPW\s*([0-9]+)/i);
  return dataset.mpw || dataset.display?.mpw || (match ? `MPW${match[1]}` : "MPWUndefined");
}

function detectSlot(dataset = {}) {
  const joined = joinedDatasetText(dataset);
  const match = joined.match(/Slot\s*([0-9]+)/i);
  return dataset.slot || dataset.display?.slot || (match ? `Slot${match[1]}` : "SlotUndefined");
}

function detectWaveguideType(dataset = {}) {
  const value = String(dataset.waveguideType || dataset.display?.waveguideType || "");
  if (value) {
    if (/rib/i.test(value)) return "Rib";
    if (/strip/i.test(value)) return "Strip";
    if (/slot/i.test(value)) return "Slot";
    return prettifyIdentifier(value);
  }
  const joined = joinedDatasetText(dataset);
  if (/\brib\b/i.test(joined)) return "Rib";
  if (/\bstrip\b/i.test(joined)) return "Strip";
  if (/\bslot\b/i.test(joined)) return "Slot";
  return "Waveguide";
}

function detectMeasurementMode(dataset = {}) {
  const value = String(dataset.measurementMode || dataset.display?.measurementMode || dataset.sourceType || dataset.sourceMeta?.type || "");
  if (/manual/i.test(value)) return "Manual";
  if (/wst|automated/i.test(value)) return "WST";
  const joined = joinedDatasetText(dataset);
  if (/manual/i.test(joined)) return "Manual";
  if (/wst|automated/i.test(joined)) return "WST";
  return "Measurement";
}

function detectPlatform(dataset = {}) {
  const joined = joinedDatasetText(dataset).replace(/\s+/g, "").toLowerCase();
  if (joined.includes("220nmsoiactive")) return "220nmSOIActive";
  if (joined.includes("220nmsoi")) return "220nmSOI";
  if (joined.includes("340nmsoi")) return "340nmSOI";
  if (joined.includes("300nmsin")) return "300nmSiN";
  if (joined.includes("500nmsin")) return "500nmSiN";
  if (joined.includes("geonsi")) return "GeonSi";
  return "";
}

export function getDatasetPresentation(dataset = {}) {
  const mpw = detectMpw(dataset);
  const slot = detectSlot(dataset);
  const waveguideType = detectWaveguideType(dataset);
  const measurementMode = detectMeasurementMode(dataset);
  const platform = detectPlatform(dataset);

  const projectDisplayName = mpw !== "MPWUndefined"
    ? mpw
    : prettifyIdentifier(dataset.projectName) || "MPW Undefined";

  const waferPieces = [
    slot !== "SlotUndefined" ? slot : "",
    waveguideType !== "Waveguide" ? waveguideType : "",
    measurementMode !== "Measurement" ? measurementMode : ""
  ].filter(Boolean);

  const waferDisplayName = waferPieces.length
    ? waferPieces.join(" · ")
    : prettifyIdentifier(dataset.waferName) || "Wafer run";

  return {
    projectDisplayName,
    waferDisplayName,
    platformDisplayName: platform,
    mpw,
    slot,
    waveguideType,
    measurementMode
  };
}
