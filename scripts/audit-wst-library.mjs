import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const libraryRoot = path.resolve(process.argv[2] || "public/sample-data/wst");
const REQUIRED_FILES = ["README.md", "metadata.json", "route-config.json", "filename-manifest.csv"];
const INDEX_FILES = ["library-index.json", "library-index-v2.json", "library-analytics.json"];
const TRACE_PATTERN = /^Chip(\d+)_WG(\d+)\.txt$/;
const results = [];

function record(level, dataset, check, detail) {
  results.push({ level, dataset, check, detail });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

async function auditTrace(filePath) {
  const hash = createHash("sha256");
  let remainder = "";
  let rows = 0;
  let invalidRows = 0;
  let wavelengthMin = Infinity;
  let wavelengthMax = -Infinity;

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    const text = remainder + chunk.toString("utf8");
    const lines = text.split(/\r?\n/);
    remainder = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const columns = line.trim().split(/[\t,; ]+/).filter(Boolean);
      const wavelength = Number(columns[0]);
      const power = Number(columns[1]);
      rows += 1;
      if (columns.length !== 2 || !Number.isFinite(wavelength) || !Number.isFinite(power)) invalidRows += 1;
      if (Number.isFinite(wavelength)) {
        wavelengthMin = Math.min(wavelengthMin, wavelength);
        wavelengthMax = Math.max(wavelengthMax, wavelength);
      }
    }
  }
  if (remainder.trim()) {
    const columns = remainder.trim().split(/[\t,; ]+/).filter(Boolean);
    const wavelength = Number(columns[0]);
    const power = Number(columns[1]);
    rows += 1;
    if (columns.length !== 2 || !Number.isFinite(wavelength) || !Number.isFinite(power)) invalidRows += 1;
    if (Number.isFinite(wavelength)) {
      wavelengthMin = Math.min(wavelengthMin, wavelength);
      wavelengthMax = Math.max(wavelengthMax, wavelength);
    }
  }
  return {
    sha256: hash.digest("hex"),
    rows,
    invalidRows,
    wavelengthMin: Number.isFinite(wavelengthMin) ? wavelengthMin : null,
    wavelengthMax: Number.isFinite(wavelengthMax) ? wavelengthMax : null
  };
}

const directoryEntries = await readdir(libraryRoot, { withFileTypes: true });
const datasetFolders = directoryEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const rootFiles = directoryEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
const unexpectedRootFiles = rootFiles.filter((fileName) => !INDEX_FILES.includes(fileName));
if (unexpectedRootFiles.length) record("warning", "library", "root-files", `Unexpected root files: ${unexpectedRootFiles.join(", ")}`);

const indexes = {};
for (const fileName of INDEX_FILES) {
  const filePath = path.join(libraryRoot, fileName);
  if (!(await exists(filePath))) {
    record("error", "library", "index-exists", `Missing ${fileName}`);
    indexes[fileName] = [];
    continue;
  }
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    indexes[fileName] = Array.isArray(value) ? value : [];
    if (!Array.isArray(value)) record("error", "library", "index-shape", `${fileName} must contain an array`);
  } catch (error) {
    indexes[fileName] = [];
    record("error", "library", "index-json", `${fileName}: ${error.message}`);
  }
}

const indexIds = {};
for (const [fileName, entries] of Object.entries(indexes)) {
  const ids = entries.map((entry) => String(entry.id || entry.datasetId || "")).filter(Boolean);
  indexIds[fileName] = new Set(ids);
  if (ids.length !== new Set(ids).size) record("error", "library", "index-unique-ids", `${fileName} contains duplicate IDs`);
  if (entries.length !== datasetFolders.length) record("error", "library", "index-count", `${fileName}: ${entries.length} entries for ${datasetFolders.length} folders`);
}

const datasetSummaries = [];
for (const folderName of datasetFolders) {
  const folderPath = path.join(libraryRoot, folderName);
  const files = await readdir(folderPath, { withFileTypes: true });
  const fileNames = files.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const nestedDirectories = files.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (nestedDirectories.length) record("warning", folderName, "flat-folder", `Nested folders: ${nestedDirectories.join(", ")}`);
  for (const requiredFile of REQUIRED_FILES) {
    if (!fileNames.includes(requiredFile)) record("error", folderName, "required-file", `Missing ${requiredFile}`);
  }

  let metadata = {};
  let routeConfig = {};
  try { metadata = JSON.parse(await readFile(path.join(folderPath, "metadata.json"), "utf8")); }
  catch (error) { record("error", folderName, "metadata-json", error.message); }
  try { routeConfig = JSON.parse(await readFile(path.join(folderPath, "route-config.json"), "utf8")); }
  catch (error) { record("error", folderName, "route-config-json", error.message); }

  const expectedFolder = [
    metadata.projectName,
    metadata.platform,
    metadata.slot,
    metadata.processStep,
    metadata.opticalMode,
    metadata.buildingBlock,
    metadata.measurementType,
    metadata.alignmentMode
  ].filter(Boolean).join("_");
  if (expectedFolder !== folderName) record("error", folderName, "canonical-folder", `Metadata builds ${expectedFolder || "<empty>"}`);
  if (metadata.label !== folderName) record("error", folderName, "metadata-label", `metadata.label is ${metadata.label || "<missing>"}`);
  if (!/^((MPW\d+(?:_[A-Z0-9]+)*)|(DEV_[A-Z0-9_]+)|(BSPK_[A-Z0-9_]+))$/i.test(metadata.projectName || "")) {
    record("error", folderName, "project-name", `Invalid projectName ${metadata.projectName || "<missing>"}`);
  }
  if (!/^Slot\d+$/i.test(metadata.slot || "")) record("error", folderName, "slot", `Invalid slot ${metadata.slot || "<missing>"}`);
  if (!/^Step(?:\d+[A-Za-z]?|XX)$/i.test(metadata.processStep || "")) record("error", folderName, "process-step", `Invalid process step ${metadata.processStep || "<missing>"}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.measurementDate || "")) record("error", folderName, "measurement-date", `Invalid measurement date ${metadata.measurementDate || "<missing>"}`);

  const traceFiles = fileNames.filter((fileName) => fileName.toLowerCase().endsWith(".txt")).sort();
  const invalidNames = traceFiles.filter((fileName) => !TRACE_PATTERN.test(fileName));
  if (invalidNames.length) record("error", folderName, "trace-name", invalidNames.join(", "));
  const duplicateTraceNames = traceFiles.filter((fileName, index) => traceFiles.indexOf(fileName) !== index);
  if (duplicateTraceNames.length) record("error", folderName, "trace-duplicates", duplicateTraceNames.join(", "));

  let manifestRows = [];
  try {
    const manifestLines = (await readFile(path.join(folderPath, "filename-manifest.csv"), "utf8")).trim().split(/\r?\n/);
    const headers = parseCsvLine(manifestLines.shift() || "");
    manifestRows = manifestLines.filter(Boolean).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] || ""])));
  } catch (error) {
    record("error", folderName, "manifest-read", error.message);
  }
  const manifestMap = new Map(manifestRows.map((row) => [row.trace_filename, row]));
  if (manifestRows.length !== traceFiles.length) record("error", folderName, "manifest-count", `${manifestRows.length} rows for ${traceFiles.length} traces`);
  const missingFromManifest = traceFiles.filter((fileName) => !manifestMap.has(fileName));
  if (missingFromManifest.length) record("error", folderName, "manifest-files", `Missing: ${missingFromManifest.join(", ")}`);

  let rowCount = 0;
  let wavelengthMin = Infinity;
  let wavelengthMax = -Infinity;
  const chips = new Set();
  const routes = new Set();
  for (const fileName of traceFiles) {
    const match = fileName.match(TRACE_PATTERN);
    if (match) {
      chips.add(`Chip${match[1]}`);
      routes.add(`WG${match[2]}`);
    }
    const tracePath = path.join(folderPath, fileName);
    const traceAudit = await auditTrace(tracePath);
    rowCount += traceAudit.rows;
    if (traceAudit.wavelengthMin !== null) wavelengthMin = Math.min(wavelengthMin, traceAudit.wavelengthMin);
    if (traceAudit.wavelengthMax !== null) wavelengthMax = Math.max(wavelengthMax, traceAudit.wavelengthMax);
    if (traceAudit.invalidRows) record("error", folderName, "trace-format", `${fileName}: ${traceAudit.invalidRows} invalid row(s)`);
    const manifestRow = manifestMap.get(fileName);
    if (manifestRow) {
      if (manifestRow.sha256 && manifestRow.sha256 !== traceAudit.sha256) record("error", folderName, "trace-sha256", `${fileName}: hash mismatch`);
      const actualSize = (await stat(tracePath)).size;
      if (Number(manifestRow.size_bytes) !== actualSize) record("error", folderName, "trace-size", `${fileName}: manifest ${manifestRow.size_bytes}, actual ${actualSize}`);
    }
  }

  const configuredRoutes = new Set((routeConfig.routes || []).map((route) => route.route));
  const missingRoutes = [...routes].filter((route) => !configuredRoutes.has(route));
  const unusedConfiguredRoutes = [...configuredRoutes].filter((route) => !routes.has(route));
  if (missingRoutes.length) record("warning", folderName, "route-coverage", `Trace routes without a known physical length: ${missingRoutes.join(", ")}`);
  if (unusedConfiguredRoutes.length) record("error", folderName, "route-files", `Configured routes without trace files: ${unusedConfiguredRoutes.join(", ")}`);
  if (routeConfig.measurementType !== metadata.measurementType) record("error", folderName, "route-measurement-type", `${routeConfig.measurementType || "<missing>"} != ${metadata.measurementType || "<missing>"}`);

  const countChecks = [
    ["traceCount", metadata.traceCount, traceFiles.length],
    ["rowCount", metadata.rowCount, rowCount],
    ["chipCount", metadata.chipCount, chips.size],
    ["waveguideCount", metadata.waveguideCount, routes.size]
  ];
  for (const [field, expected, actual] of countChecks) {
    if (Number(expected) !== Number(actual)) record("error", folderName, `metadata-${field}`, `${expected} != ${actual}`);
  }
  if (Number.isFinite(wavelengthMin) && Math.abs(Number(metadata.wavelengthMinNm) - wavelengthMin) > 1e-9) record("error", folderName, "metadata-wavelength-min", `${metadata.wavelengthMinNm} != ${wavelengthMin}`);
  if (Number.isFinite(wavelengthMax) && Math.abs(Number(metadata.wavelengthMaxNm) - wavelengthMax) > 1e-9) record("error", folderName, "metadata-wavelength-max", `${metadata.wavelengthMaxNm} != ${wavelengthMax}`);

  for (const [indexName, entries] of Object.entries(indexes)) {
    const entry = entries.find((item) => String(item.id || item.datasetId || "") === String(metadata.datasetId || ""));
    if (!entry) {
      record("error", folderName, "index-membership", `Missing from ${indexName}`);
      continue;
    }
    const expectedPath = `sample-data/wst/${folderName}`;
    if (entry.folder !== expectedPath) record("error", folderName, "index-folder", `${indexName}: ${entry.folder || "<missing>"}`);
    if (entry.label !== folderName) record("error", folderName, "index-label", `${indexName}: ${entry.label || "<missing>"}`);
    for (const [field, expected, actual] of countChecks) {
      if (Number(entry[field]) !== Number(actual)) record("error", folderName, `index-${field}`, `${indexName}: ${entry[field]} != ${actual}`);
    }
  }

  const readme = await readFile(path.join(folderPath, "README.md"), "utf8").catch(() => "");
  if (!readme.includes(folderName)) record("warning", folderName, "readme-title", "Canonical dataset name not found in README.md");
  if (!readme.includes(metadata.measurementDate || "")) record("warning", folderName, "readme-date", "Measurement date not found in README.md");

  datasetSummaries.push({
    folder: folderName,
    datasetId: metadata.datasetId,
    traces: traceFiles.length,
    rows: rowCount,
    chips: chips.size,
    routes: [...routes].sort(),
    wavelengthMinNm: Number.isFinite(wavelengthMin) ? wavelengthMin : null,
    wavelengthMaxNm: Number.isFinite(wavelengthMax) ? wavelengthMax : null
  });
}

const errors = results.filter((result) => result.level === "error");
const warnings = results.filter((result) => result.level === "warning");
const totalTraces = datasetSummaries.reduce((sum, dataset) => sum + dataset.traces, 0);
const totalRows = datasetSummaries.reduce((sum, dataset) => sum + dataset.rows, 0);
const report = {
  ok: errors.length === 0,
  libraryRoot,
  auditedAt: new Date().toISOString(),
  datasetCount: datasetSummaries.length,
  totalTraces,
  totalRows,
  errorCount: errors.length,
  warningCount: warnings.length,
  findings: results,
  datasets: datasetSummaries
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
