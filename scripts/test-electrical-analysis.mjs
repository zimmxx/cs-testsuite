import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeElectricalTrace, createElectricalProject, electricalPointsCsv, electricalSummaryCsv, fitElectricalIv, mergeElectricalTraces, parseElectricalFile, readElectricalProject } from '../src/lib/electricalAnalysis.js';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const ideal = () => parseElectricalFile('WaferThox_Wafer1_test1_Chip4_D1.txt', '0\t0.001\n0.5\t0.011\n1\t0.021\n1.5\t0.031\n2\t0.041');

test('extracts run, chip and device; parses scientific notation with explicit source lines', () => {
  const trace = parseElectricalFile('WaferThox_Wafer1_test1_Chip004_D02.csv', '\uFEFFVoltage (V),Current (A)\n0.1,2e-3\n0.2,4e-3\n\n');
  assert.equal(trace.runId, 'WaferThox_Wafer1_test1');
  assert.equal(trace.chipId, 'Chip4'); assert.equal(trace.deviceId, 'D2');
  assert.deepEqual(trace.points.map(p => [p.voltageV, p.currentA, p.line]), [[0.1, 0.002, 2], [0.2, 0.004, 3]]);
  assert.throws(() => parseElectricalFile('Chip4_WG1.txt', '0 0\n1 1'), /filename/);
  assert.throws(() => parseElectricalFile('run_Chip4_D1.txt', '0 0\nbad data'), /two valid/);
});

test('reports malformed rows and never interprets a three-column optical trace as IV', () => {
  const trace = parseElectricalFile('run_Chip1_D1.txt', '0 0\nbad row\n1 0.02\n2 NaN\n3 0.1 4');
  assert.deepEqual(trace.invalidLines, [2, 4, 5]);
  assert.equal(trace.points.length, 2);
  assert.match(analyzeElectricalTrace(trace).warnings.join(' '), /3 malformed/);
  const missing = parseElectricalFile('run_Chip1_D1.csv', '0,0\n1,\n2,,0.02\n3,0.03');
  assert.deepEqual(missing.invalidLines, [2, 3]);
  assert.deepEqual(missing.points.map(p => p.currentA), [0, 0.03]);
});

test('least squares recovers known resistance, offset, R² and power using amperes', () => {
  const analysis = analyzeElectricalTrace(ideal());
  close(analysis.fit.resistanceOhm, 50); close(analysis.fit.interceptA, 0.001);
  close(analysis.fit.rSquared, 1); close(analysis.fit.rmseA, 0);
  close(analysis.points[2].powerMw, 21); close(analysis.points[2].resistanceOhm, 1 / 0.021);
  close(analysis.points[2].currentMa, 21); close(analysis.peakPowerPoint.powerMw, 82);
  assert.equal(analysis.points[0].resistanceOhm, null);
});

test('origin fit is explicit and voltage range affects only fitted metrics', () => {
  const trace = ideal();
  const analysis = analyzeElectricalTrace(trace, { minVoltageV: 0.5, maxVoltageV: 1.5, throughOrigin: true });
  const expectedG = (0.5 * 0.011 + 1 * 0.021 + 1.5 * 0.031) / (0.5 ** 2 + 1 + 1.5 ** 2);
  close(analysis.fit.resistanceOhm, 1 / expectedG);
  assert.equal(analysis.fit.interceptA, 0); assert.equal(analysis.fit.count, 3);
  assert.equal(analysis.points.length, 5); assert.equal(analysis.points[0].inFit, false);
  assert.equal(analysis.peakPowerPoint.voltageV, 2);
  assert.equal(analyzeElectricalTrace(trace, { minVoltageV: 2, maxVoltageV: 1 }).fit, null);
  assert.equal(analyzeElectricalTrace(trace, { minVoltageV: 1.1, maxVoltageV: 1.2 }).fit, null);
});

test('handles zero current, constant voltage/current and negative signs without fabricated resistance', () => {
  const analysis = analyzeElectricalTrace(parseElectricalFile('r_Chip1_D1.txt', '0 0\n1 0\n2 0'));
  assert.ok(analysis.points.every(p => p.resistanceOhm === null));
  assert.equal(analysis.fit.resistanceOhm, null); assert.equal(analysis.fit.rSquared, null);
  assert.equal(fitElectricalIv([{ voltageV: 1, currentA: 1 }, { voltageV: 1, currentA: 2 }]), null);
  const negative = analyzeElectricalTrace(parseElectricalFile('r_Chip1_D1.txt', '1 -0.01\n2 -0.02'));
  assert.equal(negative.fit.resistanceOhm, null);
  assert.equal(negative.points[0].powerMw, -10);
  assert.match(negative.warnings.join(' '), /sign convention/);
});

test('retains acquisition order, repeated bias points and sweep direction reversals', () => {
  const trace = parseElectricalFile('r_Chip1_D1.txt', '0 0\n1 0.01\n1 0.012\n2 0.02\n1 0.01\n0 0');
  const analysis = analyzeElectricalTrace(trace);
  assert.deepEqual(analysis.points.map(p => p.voltageV), [0, 1, 1, 2, 1, 0]);
  assert.equal(analysis.reversals, 1);
  assert.match(analysis.warnings.join(' '), /repeat the applied voltage/);
  assert.equal(analysis.fit.count, 6);
});

test('different runs and device IDs stay separate, reupload replaces only the same identity', () => {
  const first = ideal();
  const second = parseElectricalFile('WaferThox_Wafer1_test2_Chip4_D1.txt', first.text);
  const third = parseElectricalFile('WaferThox_Wafer1_test1_Chip4_D2.txt', first.text);
  const replacement = parseElectricalFile(first.fileName, '0 0\n1 0.04');
  const merged = mergeElectricalTraces([first, second, third], [replacement]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(t => t.key === first.key).points.length, 2);
  assert.equal(merged.find(t => t.key === second.key).points.length, 5);
});

test('portable JSON retains source precision, settings, selection and notes and rejects invalid projects', () => {
  const trace = ideal();
  const settings = { minVoltageV: '0.5', maxVoltageV: '1.5', throughOrigin: true };
  const project = createElectricalProject([trace], settings, { runId: trace.runId, chipId: trace.chipId, deviceId: trace.deviceId }, 'Reprobe contact');
  const restored = readElectricalProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.traces, [trace]); assert.deepEqual(restored.settings, settings);
  assert.equal(restored.notes, 'Reprobe contact'); assert.equal(restored.selection.chipId, 'Chip4');
  assert.throws(() => readElectricalProject({ kind: 'different', files: [] }), /valid electrical project/);
});

test('CSV exports retain all points, unit definitions, fit model, source identity and flags', () => {
  const analysis = analyzeElectricalTrace(ideal());
  const summary = electricalSummaryCsv([analysis]);
  const points = electricalPointsCsv([analysis]);
  assert.match(summary, /Fit resistance \(ohm\)/); assert.match(summary, /I=I0\+G\*V/);
  assert.match(summary, /WaferThox_Wafer1_test1_Chip4_D1.txt/);
  assert.equal(points.split('\n').length, 6); assert.match(points, /Current \(A\)/);
  assert.match(points, /Power \(mW\)/);
});
