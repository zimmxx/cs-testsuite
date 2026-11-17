import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeElectricalTrace, createElectricalProject, parseElectricalFile, readElectricalProject } from '../src/lib/electricalAnalysis.js';
import { filterElectricalDevices, normalizeElectricalView, selectElectricalCurves } from '../src/lib/electricalView.js';

const device = (chip, id = 1) => analyzeElectricalTrace(parseElectricalFile(`run_Chip${chip}_D${id}.txt`, '0 0\n1 0.02\n2 0.04'));
test('device filters use exact numeric chip IDs and natural order without changing source devices', () => {
  const devices = [device(40), device(4, 2), device(12), device(4)];
  assert.deepEqual(filterElectricalDevices(devices, {search:'4,12', deviceId:'D1'}).map(d=>d.chipId), ['Chip4','Chip12']);
  assert.equal(devices[0].chipId, 'Chip40');
  assert.equal(filterElectricalDevices(devices, {search:'not-here'}).length, 0);
});
test('custom selection, focused chip and run views retain identities without modifying fit inputs', () => {
  const devices = [device(4), device(4,2), device(6)];
  assert.deepEqual(selectElectricalCurves(devices, {scope:'custom',comparisonKeys:[devices[2].key]},devices[0]), [devices[2]]);
  assert.equal(selectElectricalCurves(devices, {scope:'chip'},devices[0]).length, 2);
  assert.equal(selectElectricalCurves(devices, {scope:'run'},devices[0]).length, 3);
  assert.deepEqual(selectElectricalCurves(devices, {scope:'custom',comparisonKeys:[]},devices[0]), []);
  assert.equal(devices[0].fit.count, 3);
});
test('review filters distinguish unavailable resistance from observation flags', () => {
  const invalid = analyzeElectricalTrace(parseElectricalFile('run_Chip2_D1.txt','0 0\n1 0\n2 0'));
  const devices = [device(4), invalid];
  assert.deepEqual(filterElectricalDevices(devices,{review:'unavailable'}),[invalid]);
  assert.deepEqual(filterElectricalDevices(devices,{review:'flagged'}),[invalid]);
  assert.equal(filterElectricalDevices(devices,{review:'clear'}).length,1);
});
test('old projects receive safe view defaults and keep individual fit overrides after JSON round trip', () => {
  const trace = parseElectricalFile('run_Chip4_D1.txt','0 0\n1 0.02\n2 0.04');
  const view = normalizeElectricalView({scope:'custom',comparisonKeys:[trace.key,trace.key],graphs:{power:false},showMap:true});
  const fitOverrides = {[trace.key]: {minVoltageV:'1',maxVoltageV:'2',throughOrigin:true}};
  const restored = readElectricalProject(JSON.parse(JSON.stringify(createElectricalProject([trace],{}, {},'notes',{view,fitOverrides}))));
  assert.deepEqual(normalizeElectricalView(restored.view),view);
  assert.deepEqual(restored.fitOverrides,fitOverrides);
  assert.equal(normalizeElectricalView({scope:'invalid'}).scope,'chip');
  assert.equal(view.comparisonKeys.length,1);
  assert.equal(view.graphs.iv,true);
  assert.equal(analyzeElectricalTrace(restored.traces[0],restored.fitOverrides[trace.key]).fit.count,2);
});
