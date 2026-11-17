const CURRENT_ZERO_A = 1e-12;
const MIN_CONDUCTANCE_S = 1e-12;
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function bounds(points, field) {
  return points.reduce((result, point) => ({ min: Math.min(result.min, point[field]), max: Math.max(result.max, point[field]) }), { min: Infinity, max: -Infinity });
}

export function parseElectricalFile(name, text) {
  const fileName = String(name).split(/[\\/]/).pop();
  const match = fileName.match(/^(.*?)[_-]Chip(\d+)[_-]D(\d+)\.(txt|csv)$/i);
  if (!match || !match[1]) throw new Error(`${fileName}: expected a filename ending in _Chip1_D1.txt (or .csv).`);
  const points = [];
  const invalidLines = [];
  String(text).replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    if (!points.length && /volt/i.test(trimmed) && /curr/i.test(trimmed)) return;
    const values = /[;,]/.test(trimmed) ? trimmed.split(/[;,]/).map((value) => value.trim()) : trimmed.split(/\s+/);
    const voltageV = Number(values[0]);
    const currentA = Number(values[1]);
    if (values.length !== 2 || !values.every((value) => DECIMAL_NUMBER.test(value)) || !Number.isFinite(voltageV) || !Number.isFinite(currentA)) {
      invalidLines.push(index + 1);
      return;
    }
    points.push({ index: points.length + 1, line: index + 1, voltageV, currentA });
  });
  if (points.length < 2) throw new Error(`${fileName}: at least two valid voltage (V), current (A) rows are required.`);
  const runId = match[1];
  const chipId = `Chip${Number(match[2])}`;
  const deviceId = `D${Number(match[3])}`;
  return { key: JSON.stringify([runId, chipId, deviceId]), runId, chipId, deviceId, fileName, text: String(text), points, invalidLines };
}

export function mergeElectricalTraces(existing, incoming) {
  return [...new Map([...existing, ...incoming].map((trace) => [trace.key, trace])).values()];
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function fitElectricalIv(points, throughOrigin = false) {
  if (points.length < 2) return null;
  const averageV = mean(points.map((point) => point.voltageV));
  const averageI = mean(points.map((point) => point.currentA));
  const varianceV = points.reduce((sum, point) => sum + (point.voltageV - averageV) ** 2, 0);
  if (varianceV <= Number.EPSILON * Math.max(1, points.length * averageV ** 2)) return null;
  const denominator = throughOrigin ? points.reduce((sum, point) => sum + point.voltageV ** 2, 0) : varianceV;
  const numerator = points.reduce((sum, point) => sum + (throughOrigin ? point.voltageV * point.currentA : (point.voltageV - averageV) * (point.currentA - averageI)), 0);
  const conductanceS = numerator / denominator;
  const interceptA = throughOrigin ? 0 : averageI - conductanceS * averageV;
  const sse = points.reduce((sum, point) => sum + (point.currentA - (conductanceS * point.voltageV + interceptA)) ** 2, 0);
  // Centred R² for both models; the origin model can have negative R².
  const sst = points.reduce((sum, point) => sum + (point.currentA - averageI) ** 2, 0);
  return {
    conductanceS, interceptA,
    resistanceOhm: conductanceS > MIN_CONDUCTANCE_S ? 1 / conductanceS : null,
    rSquared: sst > 1e-24 ? 1 - sse / sst : null,
    rmseA: Math.sqrt(sse / points.length), count: points.length,
    minVoltageV: bounds(points, "voltageV").min,
    maxVoltageV: bounds(points, "voltageV").max, throughOrigin
  };
}

export function analyzeElectricalTrace(trace, settings = {}) {
  const minV = settings.minVoltageV === "" || settings.minVoltageV == null ? -Infinity : Number(settings.minVoltageV);
  const maxV = settings.maxVoltageV === "" || settings.maxVoltageV == null ? Infinity : Number(settings.maxVoltageV);
  const rangeValid = !Number.isNaN(minV) && !Number.isNaN(maxV) && minV <= maxV;
  const fitPoints = rangeValid ? trace.points.filter((point) => point.voltageV >= minV && point.voltageV <= maxV) : [];
  const fit = fitElectricalIv(fitPoints, settings.throughOrigin === true);
  const points = trace.points.map((point) => ({
    ...point,
    currentMa: point.currentA * 1000,
    resistanceOhm: Math.abs(point.currentA) > CURRENT_ZERO_A && Math.abs(point.voltageV) > 1e-12 ? point.voltageV / point.currentA : null,
    powerMw: point.voltageV * point.currentA * 1000,
    inFit: rangeValid && point.voltageV >= minV && point.voltageV <= maxV,
    residualMa: fit ? (point.currentA - (fit.conductanceS * point.voltageV + fit.interceptA)) * 1000 : null
  }));
  const resistances = points.map((point) => point.resistanceOhm).filter((value) => value !== null);
  let negativeSlopeSteps = 0;
  let repeatedVoltageSteps = 0;
  let reversals = 0;
  let lastDirection = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dv = points[index].voltageV - points[index - 1].voltageV;
    const di = points[index].currentA - points[index - 1].currentA;
    if (dv === 0) { repeatedVoltageSteps += 1; continue; }
    const direction = Math.sign(dv);
    if (lastDirection && lastDirection !== direction) reversals += 1;
    lastDirection = direction;
    if (dv * di < 0) negativeSlopeSteps += 1;
  }
  const peakPowerPoint = points.reduce((best, point) => !best || point.powerMw > best.powerMw ? point : best, null);
  const warnings = [];
  if (trace.invalidLines.length) warnings.push(`${trace.invalidLines.length} malformed row(s) skipped; source line(s): ${trace.invalidLines.slice(0, 10).join(", ")}${trace.invalidLines.length > 10 ? "…" : ""}.`);
  if (!rangeValid) warnings.push("Fit minimum voltage must not exceed the maximum voltage.");
  if (!fit) warnings.push("No fit: select at least two distinct voltages within the fit range.");
  if (fit && fit.resistanceOhm === null) warnings.push("Fitted conductance is zero, negative or too small to report a positive resistance.");
  if (negativeSlopeSteps) warnings.push(`${negativeSlopeSteps} adjacent step(s) have negative ΔI/ΔV. Inspect the raw sweep; this alone does not establish device failure.`);
  if (repeatedVoltageSteps) warnings.push(`${repeatedVoltageSteps} adjacent step(s) repeat the applied voltage.`);
  if (reversals) warnings.push(`${reversals} sweep direction reversal(s); acquisition order is preserved and the fit includes both directions within the selected voltage range.`);
  if (points.some((point) => point.powerMw < 0)) warnings.push("Negative V×I values are retained. Check the current sign convention before interpreting dissipated power.");
  return {
    ...trace, points, fit, rangeValid, warnings, negativeSlopeSteps, reversals,
    minVoltageV: bounds(points, "voltageV").min,
    maxVoltageV: bounds(points, "voltageV").max,
    maxAbsCurrentMa: points.reduce((maximum, point) => Math.max(maximum, Math.abs(point.currentMa)), 0),
    medianResistanceOhm: median(resistances),
    peakPowerPoint
  };
}

function csv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    // Text identities may be untrusted file names. Avoid formula evaluation in Excel.
    return `"${(/^[=+@-]/.test(text) && typeof value === "string" ? "'" : "") + text.replace(/"/g, '""')}"`;
  }).join(",")).join("\n");
}

export function electricalSummaryCsv(analyses) {
  return csv([
    ["Run", "Chip", "Device", "Source", "Points", "V min (V)", "V max (V)", "Fit V min (V)", "Fit V max (V)", "Fit model", "Fit points", "Fit resistance (ohm)", "Median V/I (ohm)", "Current offset (A)", "Centred R squared", "Fit RMSE (A)", "Peak power (mW)", "Peak power voltage (V)", "Max abs current (mA)", "Review notes"],
    ...analyses.map((item) => [item.runId, item.chipId, item.deviceId, item.fileName, item.points.length, item.minVoltageV, item.maxVoltageV, item.fit?.minVoltageV, item.fit?.maxVoltageV, item.fit?.throughOrigin ? "I=G*V" : "I=I0+G*V", item.fit?.count, item.fit?.resistanceOhm, item.medianResistanceOhm, item.fit?.interceptA, item.fit?.rSquared, item.fit?.rmseA, item.peakPowerPoint?.powerMw, item.peakPowerPoint?.voltageV, item.maxAbsCurrentMa, item.warnings.join(" ")])
  ]);
}

export function electricalPointsCsv(analyses) {
  return csv([
    ["Run", "Chip", "Device", "Source", "Sample", "Source line", "Voltage (V)", "Current (A)", "Current (mA)", "V/I (ohm)", "Power (mW)", "Included in fit", "Current residual (mA)"],
    ...analyses.flatMap((item) => item.points.map((point) => [item.runId, item.chipId, item.deviceId, item.fileName, point.index, point.line, point.voltageV, point.currentA, point.currentMa, point.resistanceOhm, point.powerMw, point.inFit, point.residualMa]))
  ]);
}

export function createElectricalProject(traces, settings, selection, notes = "", preferences = {}) {
  return { kind: "cornerstone-electrical-project", schemaVersion: 1, savedAt: new Date().toISOString(), units: { voltage: "V", current: "A" }, files: traces.map(({ fileName, text }) => ({ fileName, text })), settings, selection, notes, view: preferences.view || {}, fitOverrides: preferences.fitOverrides || {} };
}

export function readElectricalProject(project) {
  if (project?.kind !== "cornerstone-electrical-project" || project.schemaVersion !== 1 || !Array.isArray(project.files) || !project.files.length) throw new Error("Select a valid electrical project JSON file (schema version 1).");
  const traces = project.files.map((file) => {
    if (typeof file?.text !== "string") throw new Error("Electrical project contains a file without source text.");
    return parseElectricalFile(file.fileName, file.text);
  });
  const cleanSettings = (value) => ({ minVoltageV: value?.minVoltageV ?? "", maxVoltageV: value?.maxVoltageV ?? "", throughOrigin: value?.throughOrigin === true });
  const fitOverrides = Object.fromEntries(traces.filter((trace) => Object.hasOwn(project.fitOverrides || {}, trace.key)).map((trace) => [trace.key, cleanSettings(project.fitOverrides[trace.key])]));
  return { traces: mergeElectricalTraces([], traces), settings: cleanSettings(project.settings), selection: project.selection || {}, notes: typeof project.notes === "string" ? project.notes : "", view: project.view || {}, fitOverrides };
}
