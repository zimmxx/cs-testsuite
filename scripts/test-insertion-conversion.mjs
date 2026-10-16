import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import * as XLSX from "xlsx";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());
const conversion = await server.ssrLoadModule("/src/lib/insertionConversion.js");
const manual = await server.ssrLoadModule("/src/lib/manualConversion.js");
const parsers = await server.ssrLoadModule("/src/lib/parsers.js");
const analysis = await server.ssrLoadModule("/src/lib/analysis.js");
const library = await server.ssrLoadModule("/src/lib/githubLibrary.js");

const fields = { projectName: "MPW49", platformLabel: "SOI340nm", slot: "Slot9", processStep: "StepXX", opticalMode: "1550nm_TE", alignmentMode: "OperatorAlign", measurementDate: "2026-10-01" };
function source(rows, name = "Rib_Ref.xlsx") {
  return { name, sourcePath: `MPW49/Slot9/Chip67/BORDER/${name}`, sheets: [{ name: "IL", rows }] };
}
function mapping(rows, overrides = {}) {
  return { ...conversion.suggestInsertionMapping(rows), sheetName: "IL", chipId: "Chip67", deviceLabel: "Rib_Ref", buildingBlockLabel: "RIB_Waveguide", ...overrides };
}
function convert(rows, overrides, name) {
  return conversion.convertInsertionTrace(source(rows, name), mapping(rows, overrides), 10);
}
const rows = [["Wavelength (m)", "IL (dB)"], [1.54e-6, 20], [1.55e-6, 18], [1.56e-6, 21]];

test("BORDER accepts both reference names and uses exact path segments", () => {
  assert.equal(conversion.insertionPathMatches("MPW49/Chip67/BORDER/Rib_Ref.xlsx", "border"), true);
  assert.equal(conversion.insertionPathMatches("Chip67/BORDER/Strip_Ref.xlsx", "BORDER"), true);
  assert.equal(conversion.insertionPathMatches("Chip67/BORDER_OLD/Rib_Ref.xlsx", "BORDER"), false);
  assert.equal(conversion.suggestInsertionIdentity("MPW49/Slot9/Chip67/BORDER/Strip_Ref.xlsx").buildingBlockLabel, "STRIP_Waveguide");
});

test("arbitrary Excel names, worksheets and metadata before the header are inspectable", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Operator", "Example"]]), "Notes");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Run", 12], [], ...rows]), "Sweep A");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const inspected = await conversion.inspectInsertionFile({ name: "anything at all.xlsx", arrayBuffer: async () => bytes });
  assert.equal(inspected.sheets.length, 2);
  const suggested = conversion.suggestInsertionMapping(inspected.sheets[1].rows);
  assert.equal(suggested.startRow, 4);
  const result = conversion.convertInsertionTrace(inspected, { ...mapping(rows), ...suggested, sheetName: "Sweep A" }, 10);
  assert.equal(result.rowCount, 3);
  assert.ok(Math.abs(result.wavelengthMinNm - 1540) < 1e-8);
});

test("CSV, TSV and TXT read without WG names", async () => {
  for (const [name, delimiter] of [["sample.csv", ","], ["sample.tsv", "\t"], ["sample.txt", "\t"]]) {
    const inspected = await conversion.inspectInsertionFile({ name, text: async () => `wavelength_nm${delimiter}loss_db\n1540${delimiter}20\n1550${delimiter}18` });
    assert.equal(inspected.sheets[0].rows.length, 3);
  }
  await assert.rejects(conversion.inspectInsertionFile({ name: "sample.omr" }), /Supported formats/);
});

test("manual columns, no header, different wavelength units and row windows", () => {
  const input = [["comment", "skip", "skip"], [99, 18, 1550000], [99, 21, 1560000], [99, 30, 1570000]];
  const entry = convert(input, { headerRow: 0, startRow: 2, endRow: 3, wavelengthColumn: 2, valueColumn: 1, wavelengthUnit: "pm" });
  assert.equal(entry.rowCount, 2);
  assert.equal(entry.wavelengthMinNm, 1550);
  assert.equal(entry.convertedRows[0].ilDb, 18);
  assert.equal(convert([[1.55, 18]], { startRow: 1, wavelengthUnit: "um" }).wavelengthMinNm, 1550);
});

test("transposed tables and multiple value columns can be separate traces", () => {
  const input = [["Wavelength (nm)", 1540, 1550, 1560], ["IL A", 20, 18, 21], ["IL B", 25, 24, 27]];
  const transposed = conversion.orientInsertionRows(input, true);
  const first = convert(input, { ...mapping(transposed), transpose: true });
  const second = convert(input, { ...mapping(transposed), transpose: true, valueColumn: 2, deviceLabel: "Channel B" });
  assert.equal(first.rowCount, 3);
  assert.equal(second.convertedRows[1].ilDb, 24);
});

test("loss, transmission, dBm and watts converge on the same physical power", () => {
  for (const [valueType, value] of [["loss", 20], ["transmission", -20], ["dbm", -10], ["watts", 0.0001]]) {
    const entry = convert([[1550, value]], { startRow: 1, valueType });
    assert.ok(Math.abs(entry.convertedRows[0].opticalPowerW - 0.0001) < 1e-12);
    assert.equal(entry.convertedRows[0].ilDb, 20);
  }
  assert.equal(convert([[1550, -2]], { startRow: 1, valueType: "loss" }).convertedRows[0].ilDb, -2);
});

test("bad rows are reported; invalid mappings and repeated sweeps block conversion", () => {
  const entry = convert([[1540, 20], ["bad", 10], [1550, null]], { startRow: 1 });
  assert.equal(entry.rowCount, 1);
  assert.equal(entry.skippedRows, 2);
  assert.throws(() => convert(rows, { valueColumn: 0 }), /distinct/);
  assert.throws(() => convert(rows, { startRow: 99 }), /valid first/);
  assert.throws(() => convert([[1550, 18], [1550, 19]], { startRow: 1 }), /Repeated wavelengths/);
  assert.throws(() => convert([[1550, 0]], { startRow: 1, valueType: "watts" }), /No valid numeric pairs/);
});

test("rib and strip create separate canonical insertion packages without length checks", async () => {
  const rib = convert(rows);
  const strip = convert(rows, { deviceLabel: "Strip_Ref", buildingBlockLabel: "STRIP_Waveguide" }, "Strip_Ref.xlsx");
  const packages = conversion.buildInsertionPackages([rib, strip], fields, 10);
  assert.equal(packages.length, 2);
  assert.match(packages[0].folderName, /RIB_Waveguide_InsertionLoss/);
  assert.match(packages[1].folderName, /STRIP_Waveguide_InsertionLoss/);
  for (const item of packages) {
    assert.equal(item.metadata.measurementType, "InsertionLoss");
    assert.deepEqual(item.routeConfig.routes, []);
    assert.equal(item.traceFiles[0].fileName, "Chip67_WG1.txt");
    assert.match(item.filenameManifest, /_Ref.xlsx/);
  }
  const zip = new Uint8Array(await conversion.buildInsertionArchive(packages).arrayBuffer());
  assert.deepEqual(Array.from(zip.slice(0, 4)), [80, 75, 3, 4]);
  assert.throws(() => conversion.buildInsertionPackages([rib, rib], fields, 10), /Duplicated traces/);
  assert.throws(() => conversion.buildInsertionPackages([{ ...rib, chipId: "" }], fields, 10), /Chip number/);
});

test("export, upload parsing, insertion analysis and republish retain original labels and values", () => {
  const item = conversion.buildInsertionPackages([convert(rows)], fields, 10)[0];
  const trace = item.traceFiles[0];
  const parsed = parsers.readNamedTextRows(trace.fileName, trace.content, { launchPowerDbm: -30, traceValueUnit: "watts" });
  const sourceMeta = { ...item.metadata, launchPowerDbm: 10 };
  const normalized = parsers.buildNormalizedRows(parsed, {}, sourceMeta);
  assert.equal(normalized[0].metric_family, "insertion");
  assert.equal(normalized[0].relative_length_mm, null);
  assert.equal(normalized[0].block_name, "Rib_Ref");
  assert.ok(Math.abs(normalized[1].loss_db - 18) < 1e-10);
  assert.equal(analysis.computePropagationLoss(normalized).byChip.length, 0);
  const metrics = analysis.computeInsertionLoss(normalized);
  assert.equal(metrics.byBlock[0].blockName, "Rib_Ref");
  assert.ok(Math.abs(metrics.byBlock[0].insertionLossDb - 18) < 1e-10);
  const republishedTraces = library.buildDatasetTraceFiles(normalized, { ...item.metadata, folderName: item.folderName });
  const metadata = library.buildDatasetMetadata({ rawRows: parsed, columnMap: {}, sourceMeta }, { ...item.metadata, folderName: item.folderName }, republishedTraces, item.routeConfig, item.waveguideConfig);
  assert.equal(metadata.insertionTraceMap[trace.fileName].deviceLabel, "Rib_Ref");
  assert.match(metadata.insertionTraceMap[trace.fileName].originalSource, /BORDER\/Rib_Ref.xlsx/);
});

test("propagation validation still requires confirmed physical lengths and WG filenames", () => {
  assert.equal(manual.isManualMeasurementWorkbook({ name: "Rib_Ref.xlsx" }), false);
  assert.equal(manual.isManualMeasurementWorkbook({ name: "WG1.xlsx" }), true);
  const entry = { chipId: "Chip67", waveguideId: "WG1" };
  const check = manual.validateManualDatasetPackage([entry], { ...fields, buildingBlockLabel: "RIB_Waveguide", measurementType: "PropagationLoss" });
  assert.equal(check.valid, false);
  assert.ok(check.missing.some((value) => /physical length/.test(value)));
  assert.ok(check.missing.some((value) => /confirmation/.test(value)));
});
