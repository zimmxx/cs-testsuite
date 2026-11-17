import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propagationStatisticsCsv, summarizeAcceptedPropagation, tCritical95 } from '../src/lib/propagationStatistics.js';

const close = (a, b, tolerance=1e-6) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
const chip = (id, loss, passMse=true) => ({chipId:id,lossDbPerCm:loss,passMse});

test('wafer statistics include only selected chips with passing finite fits and preserve real zeros',()=>{
  const rows=[chip('1',0),chip('2',2),chip('3',4),chip('4',100,false),chip('5',null),chip('6',Infinity),chip('7',9)];
  const summary=summarizeAcceptedPropagation(rows,['1','2','3','4','5','6']);
  assert.equal(summary.count,3); assert.equal(summary.mean,2); assert.equal(summary.sampleSd,2);
  assert.equal(summary.min,0); assert.equal(summary.max,4); assert.deepEqual(summary.chips.map(c=>c.chipId),['1','2','3']);
  close(summary.sem,1.1547005383792517);
  close(summary.lower95,-2.96827542); close(summary.upper95,6.96827542);
});
test('empty and one-chip selections never invent spread or a confidence interval',()=>{
  const rows=[chip('1',3)];
  const empty=summarizeAcceptedPropagation(rows,[]);
  assert.equal(empty.count,0); assert.equal(empty.mean,null); assert.equal(empty.sampleSd,null); assert.equal(empty.lower95,null);
  const single=summarizeAcceptedPropagation(rows,['1']);
  assert.equal(single.mean,3); assert.equal(single.sem,null); assert.equal(single.halfWidth95,null);
});
test('sample denominator and small-sample Student t intervals are used rather than normal approximations',()=>{
  const summary=summarizeAcceptedPropagation([chip('1',2),chip('2',4)]);
  close(summary.sampleSd,Math.SQRT2); close(summary.sem,1); close(summary.halfWidth95,12.706204736);
  assert.equal(summary.degreesOfFreedom,1);
  close(tCritical95(31),2.039513446,1e-6);
  close(tCritical95(60),2.000297822,1e-6);
  close(tCritical95(120),1.979930405,1e-6);
});
test('identical chips yield valid zero SD/SEM/CI and CSV includes method and accepted identities',()=>{
  const summary=summarizeAcceptedPropagation([chip('Chip1',5),chip('Chip2',5)]);
  assert.equal(summary.sampleSd,0); assert.equal(summary.sem,0); assert.equal(summary.lower95,5); assert.equal(summary.upper95,5);
  const csv=propagationStatisticsCsv(summary);
  assert.match(csv,/Sample standard deviation/); assert.match(csv,/Student/); assert.match(csv,/Accepted Chip1/); assert.match(csv,/independent representative/);
});
