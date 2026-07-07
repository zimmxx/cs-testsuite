export function prettifyIdentifier(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactIdentifier(value) {
  return String(value || "").replace(/\s+/g, "");
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
    dataset.measurementType,
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
    display.measurementType,
    ...files,
    ...rows.slice(0, 24).map((row) => row?.source_name || "")
  ].filter(Boolean).join(" ");
}

function detectProjectCode(dataset = {}) {
  const existing = compactIdentifier(dataset.mpw || dataset.display?.mpw || dataset.projectName || "");
  if (/^(MPW|BSPK|DEV)[0-9]+$/i.test(existing)) return existing.toUpperCase();
  const joined = joinedDatasetText(dataset);
  const match = joined.match(/\b(MPW|BSPK|DEV)\s*([0-9]+)\b/i);
  return match ? `${match[1].toUpperCase()}${match[2]}` : "MPWUNDEFINED";
}

function detectSlot(dataset = {}) {
  const existing = compactIdentifier(dataset.slot || dataset.display?.slot || "");
  if (/^Slot[0-9]+$/i.test(existing)) return existing.replace(/^slot/i, "Slot");
  const joined = joinedDatasetText(dataset);
  const match = joined.match(/\bSlot\s*([0-9]+)\b/i);
  return match ? `Slot${match[1]}` : "SlotUndefined";
}

function detectWaveguideType(dataset = {}) {
  const existing = compactIdentifier(dataset.waveguideType || dataset.display?.waveguideType || "");
  if (/^StripWaveguide$/i.test(existing)) return "StripWaveguide";
  if (/^RibWaveguide$/i.test(existing)) return "RibWaveguide";
  if (/strip/i.test(existing)) return "StripWaveguide";
  if (/rib/i.test(existing)) return "RibWaveguide";
  const joined = joinedDatasetText(dataset);
  if (/stripwaveguide|\bstrip\b/i.test(joined)) return "StripWaveguide";
  if (/ribwaveguide|\brib\b/i.test(joined)) return "RibWaveguide";
  return "WaveguideUndefined";
}

function detectMeasurementMode(dataset = {}) {
  const existing = String(dataset.measurementMode || dataset.display?.measurementMode || dataset.sourceType || dataset.sourceMeta?.type || "");
  if (/manual/i.test(existing)) return "Manual";
  if (/wst|automated/i.test(existing)) return "WST";
  const joined = joinedDatasetText(dataset);
  if (/manual/i.test(joined)) return "Manual";
  if (/wst|automated/i.test(joined)) return "WST";
  return "ModeUndefined";
}

function detectMeasurementType(dataset = {}) {
  const existing = compactIdentifier(dataset.measurementType || dataset.display?.measurementType || dataset.metricFamily || "");
  if (/^PropagationLoss$/i.test(existing)) return "PropagationLoss";
  if (/^InsertionLoss$/i.test(existing)) return "InsertionLoss";
  if (/^HeaterEfficiency$/i.test(existing)) return "HeaterEfficiency";
  const joined = joinedDatasetText(dataset);
  if (/PropagationLoss|Propagation Loss/i.test(joined)) return "PropagationLoss";
  if (/InsertionLoss|Insertion Loss/i.test(joined)) return "InsertionLoss";
  if (/HeaterEfficiency|Heater Efficiency/i.test(joined)) return "HeaterEfficiency";
  return "MeasurementTypeUndefined";
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
  const projectCode = detectProjectCode(dataset);
  const slot = detectSlot(dataset);
  const waveguideType = detectWaveguideType(dataset);
  const measurementMode = detectMeasurementMode(dataset);
  const measurementType = detectMeasurementType(dataset);
  const platform = detectPlatform(dataset);

  return {
    projectDisplayName: projectCode,
    waferDisplayName: slot,
    platformDisplayName: platform,
    projectCode,
    mpw: projectCode,
    slot,
    waveguideType,
    measurementMode,
    measurementType
  };
}
