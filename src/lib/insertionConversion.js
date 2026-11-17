import * as XLSX from "xlsx";
import { numeric } from "./analysis";
import { buildGithubReadyManualDatasetPackage, buildStoredZip } from "./manualConversion";

export const INSERTION_FILE_TYPES = /\.(xlsx|xls|csv|tsv|txt)$/i;
export const INSERTION_VALUE_TYPES = [
  ["loss", "Insertion loss (dB, positive loss)"],
  ["transmission", "Transmission (dB, negative loss)"],
  ["dbm", "Measured power (dBm)"],
  ["watts", "Measured power (W)"]
];
const SCALES = { nm: 1, m: 1e9, um: 1e3, pm: 1e-3 };

export function insertionPathMatches(path, folder) {
  const target = String(folder || "").trim().toLowerCase();
  return !target || String(path).split(/[\\/]/).slice(0, -1).some((part) => part.toLowerCase() === target);
}

export function orientInsertionRows(rows, transpose = false) {
  if (!transpose) return rows;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, col) => rows.map((row) => row[col] ?? null));
}

export function suggestInsertionMapping(rows) {
  const headerText = (value) => String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
    const row = rows[index];
    const wavelengthColumn = row.findIndex((value) => /wavelength|lambda|^wl(?:\b|_)/i.test(String(value)));
    if (wavelengthColumn < 0) continue;
    let valueColumn = row.findIndex((value, col) => col !== wavelengthColumn && /(?:^il\b|insertion|loss|transmission|power|s21)/i.test(String(value)));
    if (valueColumn < 0) valueColumn = wavelengthColumn === 0 ? 1 : 0;
    const wavelengthHeader = headerText(row[wavelengthColumn]);
    const valueHeader = headerText(row[valueColumn]);
    const sample = rows.slice(index + 1).map((item) => numeric(item[wavelengthColumn])).find((value) => value !== null && value > 0);
    const wavelengthUnit = /(?:\(|\s)pm\)?$/.test(wavelengthHeader) ? "pm"
      : /(?:\(|\s)(?:um|µm|μm)\)?$/.test(wavelengthHeader) ? "um"
        : /(?:\(|\s)m\)?$/.test(wavelengthHeader) || (sample != null && sample < 0.01) ? "m" : "nm";
    const valueType = /dbm/.test(valueHeader) ? "dbm" : /transmission|s21/.test(valueHeader) ? "transmission"
      : /power/.test(valueHeader) && !/db/.test(valueHeader) ? "watts" : "loss";
    return { headerRow: index + 1, startRow: index + 2, endRow: "", wavelengthColumn, valueColumn, wavelengthUnit, valueType };
  }
  const start = rows.findIndex((row) => row.filter((value) => numeric(value) !== null).length >= 2);
  const columns = (rows[Math.max(start, 0)] || []).map((value, index) => numeric(value) !== null ? index : -1).filter((index) => index >= 0);
  return { headerRow: 0, startRow: Math.max(0, start) + 1, endRow: "", wavelengthColumn: columns[0] ?? 0, valueColumn: columns[1] ?? 1, wavelengthUnit: "nm", valueType: "loss" };
}

export async function inspectInsertionFile(file) {
  if (!INSERTION_FILE_TYPES.test(file.name)) throw new Error("Supported formats: XLSX, XLS, CSV, TSV and TXT.");
  const excel = /\.xlsx?$/i.test(file.name);
  const workbook = excel ? XLSX.read(await file.arrayBuffer(), { type: "array" }) : XLSX.read(await file.text(), { type: "string", raw: true });
  const sheets = workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }) }));
  if (!sheets.length || !sheets.some((sheet) => sheet.rows.length)) throw new Error("This file has no readable worksheet rows.");
  return { name: file.name, sourcePath: file.webkitRelativePath || file.name, sheets };
}

export function suggestInsertionIdentity(sourcePath) {
  const name = String(sourcePath).split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  const chip = String(sourcePath).match(/(?:^|[\\/_ -])Chip\s*(\d+)(?=$|[\\/_ .-])/i);
  return { chipId: chip ? `Chip${Number(chip[1])}` : "", deviceLabel: name,
    buildingBlockLabel: /strip/i.test(name) ? "STRIP_Waveguide" : "RIB_Waveguide" };
}

export function convertInsertionTrace(source, mapping, launchPowerDbm) {
  const sheet = source.sheets.find((item) => item.name === mapping.sheetName);
  if (!sheet) throw new Error("Select a worksheet.");
  const rows = orientInsertionRows(sheet.rows, mapping.transpose);
  const startRow = Number(mapping.startRow);
  const endRow = mapping.endRow === "" || mapping.endRow == null ? rows.length : Number(mapping.endRow);
  const wavelengthColumn = Number(mapping.wavelengthColumn);
  const valueColumn = Number(mapping.valueColumn);
  const scale = SCALES[mapping.wavelengthUnit];
  const launch = numeric(launchPowerDbm);
  if (!Number.isInteger(startRow) || startRow < 1 || !Number.isInteger(endRow) || endRow < startRow || startRow > rows.length || endRow > rows.length) throw new Error("Choose a valid first and last data row.");
  if (!Number.isInteger(wavelengthColumn) || !Number.isInteger(valueColumn) || wavelengthColumn < 0 || valueColumn < 0 || wavelengthColumn === valueColumn) throw new Error("Choose distinct wavelength and value columns.");
  if (!scale || !INSERTION_VALUE_TYPES.some(([kind]) => kind === mapping.valueType)) throw new Error("Choose the wavelength unit and value type.");
  if (launch === null) throw new Error("Enter the laser output power in dBm.");
  const convertedRows = [];
  let skippedRows = 0;
  for (const row of rows.slice(startRow - 1, endRow)) {
    const wavelength = numeric(row[wavelengthColumn]);
    const value = numeric(row[valueColumn]);
    if (wavelength === null || wavelength <= 0 || value === null || (mapping.valueType === "watts" && value <= 0)) { skippedRows += 1; continue; }
    const wavelengthNm = wavelength * scale;
    const ilDb = mapping.valueType === "loss" ? value : mapping.valueType === "transmission" ? -value
      : launch - (mapping.valueType === "dbm" ? value : 10 * Math.log10(value * 1000));
    const opticalPowerDbm = launch - ilDb;
    const opticalPowerW = 10 ** (opticalPowerDbm / 10) / 1000;
    if (!Number.isFinite(wavelengthNm) || !Number.isFinite(opticalPowerW) || opticalPowerW <= 0) { skippedRows += 1; continue; }
    convertedRows.push({ wavelengthNm, ilDb, opticalPowerDbm, opticalPowerW });
  }
  if (!convertedRows.length) throw new Error("No valid numeric pairs. Check the sheet, rows, columns and units in the preview.");
  convertedRows.sort((left, right) => left.wavelengthNm - right.wavelengthNm);
  if (new Set(convertedRows.map((row) => row.wavelengthNm)).size !== convertedRows.length) throw new Error("Repeated wavelengths found. Limit the row range to one sweep or create separate traces.");
  return {
    sourcePath: `${source.sourcePath} [${sheet.name}; column ${valueColumn + 1}; rows ${startRow}-${endRow}]`,
    sourceName: source.name, deviceLabel: mapping.deviceLabel.trim(),
    chipId: mapping.chipId.trim(), buildingBlockLabel: mapping.buildingBlockLabel,
    convertedRows, launchPowerDbm: launch, rowCount: convertedRows.length, skippedRows,
    wavelengthMinNm: convertedRows[0].wavelengthNm,
    wavelengthMaxNm: convertedRows.at(-1).wavelengthNm
  };
}

export function buildInsertionPackages(entries, datasetFields, launchPowerDbm) {
  if (!entries.length) throw new Error("Include at least one trace.");
  const groups = new Map();
  for (const entry of entries) {
    if (!/^Chip\d+$/.test(entry.chipId)) throw new Error(`Enter a Chip number for ${entry.sourceName}.`);
    if (!entry.deviceLabel) throw new Error(`Enter a device label for ${entry.sourceName}.`);
    if (!groups.has(entry.buildingBlockLabel)) groups.set(entry.buildingBlockLabel, []);
    groups.get(entry.buildingBlockLabel).push(entry);
  }
  const packages = [];
  for (const [buildingBlockLabel, group] of groups) {
    if (new Set(group.map((entry) => entry.sourcePath)).size !== group.length) throw new Error("Duplicated traces must use a different worksheet, value column or row range.");
    const fields = { ...datasetFields, buildingBlockLabel, measurementType: "InsertionLoss" };
    // Routes identify traces for the existing library format; they never imply physical lengths.
    const routesByLabel = new Map();
    const identities = new Set();
    const readyEntries = group.map((entry) => {
      const identity = JSON.stringify([entry.chipId, entry.deviceLabel]);
      if (identities.has(identity)) throw new Error(`Duplicate device label "${entry.deviceLabel}" on ${entry.chipId}. Use a different label for each sweep.`);
      identities.add(identity);
      if (!routesByLabel.has(entry.deviceLabel)) routesByLabel.set(entry.deviceLabel, `WG${routesByLabel.size + 1}`);
      const waveguideId = routesByLabel.get(entry.deviceLabel);
      return { ...entry, waveguideId, standardMeta: { chipId: entry.chipId, waveguideId }, datasetFields: fields };
    });
    packages.push(buildGithubReadyManualDatasetPackage({ entries: readyEntries, datasetFields: fields, launchPowerDbm }));
  }
  return packages;
}

export function buildInsertionArchive(packages) {
  const files = packages.flatMap((item) => [
    ...item.traceFiles.map((file) => ({ outputFileName: `${item.folderName}/${file.fileName}`, content: file.content })),
    { outputFileName: `${item.folderName}/metadata.json`, content: JSON.stringify(item.metadata, null, 2) },
    { outputFileName: `${item.folderName}/route-config.json`, content: JSON.stringify(item.routeConfig, null, 2) },
    { outputFileName: `${item.folderName}/filename-manifest.csv`, content: item.filenameManifest },
    { outputFileName: `${item.folderName}/README.md`, content: `${item.readme}\n\n## Insertion-loss import\nExtract this folder. In Upload Measurement Files, select all TXT traces together with metadata.json and route-config.json. WG numbers identify traces only; no propagation lengths are used. Original filenames and device labels are preserved in metadata.json.\n` }
  ]);
  return buildStoredZip(files);
}
