import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { emptyDatabase, gitBlobSha, libraryRecords, mergeRecords, numberOrNull, publishDatabase, statistics, validateDatabase } from '../src/lib/mpwDatabase.js';
import { buildExcel, buildPdf } from '../src/lib/mpwDatabaseExport.js';
import { formatExcelPackage } from '../src/lib/mpwExcelFormat.js';

const record = { id: 'test-record', project: 'MPW48', platform: 'SOI220nmPassive', step: 'Step31', slot: 'Slot5', buildingBlock: 'Strip', opticalMode: '1550nm_TE', parameter: 'Propagation loss', metric: 'propagation', unit: 'dB/cm', summaryValue: 99, source: 'manual', sourceRef: '=HYPERLINK("test")', chips: [
  { id: 'Chip1', value: 0, included: true, status: 'passed' },
  { id: 'Chip2', value: 4, included: true, status: 'passed' },
  { id: 'Chip3', value: 100, included: true, status: 'failed' },
  { id: 'Chip4', value: 8, included: false, status: 'passed' },
  { id: 'Chip5', value: null, included: true, status: 'passed' }
] };
const db = { ...emptyDatabase(), records: [record] };
test('averages preserve zero, reject missing/failed/excluded values, and never fall back to stale summary', () => {
  assert.equal(numberOrNull(''), null); assert.equal(numberOrNull(null), null); assert.equal(numberOrNull(0), 0);
  assert.deepEqual(statistics(record), { mean: 2, count: 2, total: 5, min: 0, max: 4, sd: Math.sqrt(8) });
  assert.equal(statistics({ ...record, chips: record.chips.map(c => ({ ...c, included: false })) }).mean, null);
  assert.equal(statistics({ ...record, chips: [], summaryValue: 0 }).mean, 0);
});
test('refresh retains manual overrides and exclusions without duplicating IDs', () => {
  const existing = { ...record, source: 'library', locallyEdited: true };
  assert.equal(mergeRecords([existing], [{ ...existing, chips: [], locallyEdited: false }])[0], existing);
  assert.equal(mergeRecords([record], [record]).length, 1);
});
test('workbook reference imports are valid and have no invented chips', async () => {
  const records = JSON.parse(await readFile(new URL('../public/mpw-database/reference-records.json', import.meta.url), 'utf8'));
  validateDatabase({ ...emptyDatabase(), records });
  assert.equal(records.length, 245);
  assert.ok(records.every(r => r.chips.length === 0 && r.sourceRef.includes('!')));
  assert.equal(records.find(r => r.sourceRef.endsWith('MPW_RUN-prop-Loss!D4')).summaryValue, 1.45);
  assert.equal(records.find(r => r.project === 'MPW39').platform, 'SOI: 500nm');
});
test('library adapters retain missing values and separate measurement categories', () => {
  const rows = libraryRecords([{ id: 'a', measurementType: 'InsertionLoss', platformLabel: 'SOI', slot: 'Slot1' }, { id: 'b', measurementType: 'HeaterEfficiency' }]);
  assert.equal(rows[0].metric, 'insertion'); assert.equal(rows[0].summaryValue, null); assert.equal(rows[1].metric, 'heater');
  assert.throws(() => validateDatabase({ ...db, records: [record, record] }), /Duplicate/);
});
test('Excel has four sheets, collapsed chip rows, formulas, literal source text, styling, and panes', async () => {
  const wb = await buildExcel(db, db.records, 'QA selection');
  assert.deepEqual(wb.SheetNames, ['Master Summary', 'Propagation Loss', 'Insertion Loss', 'Heater Performance']);
  assert.match(wb.Sheets['Propagation Loss'].I5.f, /AVERAGEIFS/);
  assert.match(wb.Sheets['Master Summary'].I5.f, /'Propagation Loss'!I5/);
  assert.equal(wb.Sheets['Propagation Loss']['!rows'][5].hidden, true);
  assert.equal(wb.Sheets['Propagation Loss'].T5.t, 's');
  const bytes = formatExcelPackage(XLSX, wb);
  const reopened = XLSX.read(bytes, { type: 'array', cellStyles: true });
  assert.equal(reopened.Sheets['Propagation Loss'].I5.v, 2);
  assert.equal(reopened.Sheets['Propagation Loss'].I6.v, 0);
  const zip = (XLSX.CFB || XLSX.default.CFB).read(bytes, { type: 'array' });
  const sheet = new TextDecoder().decode(zip.FileIndex[zip.FullPaths.findIndex(p => p.endsWith('/xl/worksheets/sheet2.xml'))].content);
  assert.match(sheet, /state="frozen"/); assert.match(sheet, /dataValidations/); assert.match(sheet, /hidden="1"/);
});
test('PDF includes version and records and paginates a full history', async () => {
  const records = JSON.parse(await readFile(new URL('../public/mpw-database/reference-records.json', import.meta.url), 'utf8'));
  const pdf = await buildPdf(db, records, 'Full database QA');
  assert.ok(pdf.getNumberOfPages() > 1);
  const output = pdf.output(); assert.ok(output.includes('CORNERSTONE MPW Measurement Records')); assert.ok(output.includes('V1.0'));
});
test('GitHub upload creates four artifacts atomically with non-forced branch update', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let serverDatabase = null;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (url.includes('/contents/')) return serverDatabase ? Response.json({ sha: serverDatabase.sha, content: Buffer.from(JSON.stringify(serverDatabase.db, null, 2) + '\n').toString('base64') }) : new Response('', { status: 404 });
    if (url.includes('/git/ref/') && options.method === 'GET') return Response.json({ object: { sha: 'head' } });
    if (url.endsWith('/git/commits/head')) return Response.json({ tree: { sha: 'base-tree' } });
    if (url.endsWith('/git/trees')) return Response.json({ sha: 'tree', tree: [{ path: 'public/mpw-database/database.json', sha: 'file-sha' }] });
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'new-commit' });
    if (url.includes('/git/refs/') && options.method === 'PATCH') return Response.json({});
    throw new Error(`Unexpected GitHub endpoint: ${options.method} ${url}`);
  };
  try {
    const result = await publishDatabase({ owner: 'test', repo: 'repo', branch: 'main', token: 'test-token' }, db, null, 'QA update', 'Tester');
    assert.equal(result.db.version, '1.0'); assert.equal(result.sha, await gitBlobSha(JSON.stringify(result.db, null, 2) + '\n'));
    const tree = JSON.parse(calls.find(c => c.url.endsWith('/git/trees')).body);
    assert.equal(tree.tree.length, 4); assert.ok(tree.tree.every(f => !f.content.includes('test-token')));
    assert.deepEqual(JSON.parse(calls.at(-1).body), { sha: 'new-commit', force: false });
    assert.ok(calls.some(c => c.url.includes('ref=head')));
    const text = JSON.stringify(result.db, null, 2) + '\n';
    assert.equal(result.sha, createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex'));
    serverDatabase = result;
    const second = await publishDatabase({ owner: 'test', repo: 'repo', branch: 'main', token: 'test-token' }, result.db, result.sha, 'Second update', 'Tester');
    assert.equal(second.db.version, '1.1');
    assert.ok(second.db.history.some(h => h.action.includes('Published V1.1')));
  } finally { globalThis.fetch = originalFetch; }
});
test('concurrent shared edits block upload before creating commits', async () => {
  const originalFetch = globalThis.fetch; let writes = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method && options.method !== 'GET') writes++;
    return Response.json(url.includes('/contents/') ? { sha: 'changed', content: Buffer.from(JSON.stringify(db)).toString('base64') } : { object: { sha: 'head' } });
  };
  try { await assert.rejects(publishDatabase({ owner: 'test', repo: 'repo', branch: 'main', token: 'test' }, db, 'old', 'Note', 'Tester'), /shared database changed/); assert.equal(writes, 0); }
  finally { globalThis.fetch = originalFetch; }
});
import { filterOptions, changeFilter, reconcileFilters, comparisonRows, chartRows, parameterKey, loadDatabaseSnapshot } from '../src/lib/mpwDatabaseViews.js';
test('project filters cascade and clear incompatible child selections', () => {
  const rows = [record, { ...record, project: 'MPW43', step: 'Step84A', slot: 'Slot3' }];
  assert.deepEqual(filterOptions(rows, { project: 'MPW48' }, 'step'), ['Step31']);
  assert.equal(changeFilter({ project: 'MPW48', step: 'Step31', slot: 'Slot5' }, 'project', 'MPW43').step, '');
  assert.equal(reconcileFilters(rows, { project: 'MPW43', step: 'Step31' }).step, '');
});
test('comparison retains record means, zero and distinct units without pooling chips', () => {
  const rows = comparisonRows([record, { ...record, id: 'zero', chips: [], summaryValue: 0 }, { ...record, id: 'other-unit', unit: 'dB' }, { ...record, id: 'missing', chips: [], summaryValue: null }]);
  assert.deepEqual(chartRows(rows, parameterKey(record)).map(r => r.mean), [2, 0]);
  assert.deepEqual(chartRows(rows, parameterKey(record), ['test-record']).map(r => r.mean), [0]);
  assert.equal(rows[0].family, 'Strip');
});
test('fresh browsers load all workbook records automatically and preserve edited references', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const reference = JSON.parse(await readFile(new URL('../public/mpw-database/reference-records.json', import.meta.url), 'utf8'));
  let saved = null;
  globalThis.localStorage = { getItem: () => saved };
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('reference-records') ? reference : String(url).includes('database.json') ? null : []), { status: String(url).includes('database.json') ? 404 : 200, headers: { 'content-type': 'application/json' } });
  try {
    const snapshot = await loadDatabaseSnapshot({ owner: 'a', repo: 'b', branch: 'main' });
    assert.equal(snapshot.db.records.length, 245);
    const edited = { ...snapshot.db.records[0], summaryValue: 123, locallyEdited: true };
    saved = JSON.stringify({ ...snapshot, db: { ...snapshot.db, records: [edited, ...snapshot.db.records.slice(1)] } });
    const restored = await loadDatabaseSnapshot({ owner: 'a', repo: 'b', branch: 'main' });
    assert.equal(restored.db.records.length, 245); assert.equal(restored.db.records[0].summaryValue, 123);
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});
