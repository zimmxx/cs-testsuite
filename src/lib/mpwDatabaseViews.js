import { emptyDatabase, libraryRecords, mergeRecords, recordChange, statistics, validateDatabase, validateRecord } from './mpwDatabase.js';

export const SOURCE_OPTIONS = [['all', 'All'], ['library', 'GitHub library'], ['reference', 'Excel overview'], ['manual', 'Manual entries']];
export const sourceLabel = value => SOURCE_OPTIONS.find(([id]) => id === value)?.[1] || value || 'Unknown';
export const FILTER_ORDER = ['platform', 'project', 'step', 'slot', 'buildingBlock', 'opticalMode'];
export const naturalSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
export const uniqueValues = (rows, key) => [...new Set(rows.map(r => r[key]).filter(Boolean))].sort(naturalSort);
export const databaseStorageKey = c => `cs.mpw-database.v1:${c.owner}/${c.repo}/${c.branch}`;

export function filterOptions(rows, filters, key) {
  const parents = FILTER_ORDER.slice(0, FILTER_ORDER.indexOf(key));
  return uniqueValues(rows.filter(r => parents.every(parent => !filters[parent] || r[parent] === filters[parent])), key);
}
export function changeFilter(filters, key, value) {
  const next = { ...filters, [key]: value };
  FILTER_ORDER.slice(FILTER_ORDER.indexOf(key) + 1).forEach(child => { next[child] = ''; });
  return next;
}
export function reconcileFilters(rows, filters) {
  const next = { ...filters };
  for (const key of FILTER_ORDER) if (next[key] && !filterOptions(rows, next, key).includes(next[key])) next[key] = '';
  return next;
}

// Both library sections read the same persisted draft and always include the
// bundled historical source. Automatic hydration is idempotent and preserves edits.
export async function loadDatabaseSnapshot(config) {
  const saved = localStorage.getItem(databaseStorageKey(config));
  const snapshot = saved ? JSON.parse(saved) : null;
  if (snapshot) validateDatabase(snapshot.db);
  async function json(path, optional = false) {
    const response = await fetch(`${import.meta.env?.BASE_URL || '/'}${path}`, { cache: 'no-store' });
    if (optional && (response.status === 404 || response.headers.get('content-type')?.includes('text/html'))) return null;
    if (!response.ok) throw new Error(`Unable to load ${path} (${response.status}).`);
    return response.json();
  }
  const [catalog, reference, analytics, shared] = await Promise.all([
    json('sample-data/wst/library-index-v2.json'), json('mpw-database/reference-records.json'),
    snapshot ? null : json('sample-data/wst/library-analytics.json', true),
    snapshot ? null : json('mpw-database/database.json', true)
  ]);
  if (!Array.isArray(reference) || !Array.isArray(catalog)) throw new Error('Invalid database source format.');
  reference.forEach(validateRecord);
  let db = snapshot?.db || (shared ? validateDatabase(shared) : { ...emptyDatabase(), records: libraryRecords(catalog, analytics || []) });
  const merged = mergeRecords(db.records, reference);
  const changed = JSON.stringify(merged) !== JSON.stringify(db.records);
  if (changed) db = recordChange(db, merged, 'Loaded Excel overview records', 'Database');
  return { db, baseSha: snapshot?.baseSha || null, dirty: Boolean(snapshot?.dirty || !shared && !snapshot || changed), catalog };
}

export function waveguideFamily(record) {
  const text = String(record.buildingBlock || '');
  return /strip/i.test(text) ? 'Strip' : /rib/i.test(text) ? 'Rib' : 'Other / unspecified';
}
export function comparisonRows(records) {
  return records.map(r => ({ ...r, family: waveguideFamily(r), opticalMode: r.opticalMode || 'Unspecified', mean: statistics(r).mean }));
}
export const parameterKey = r => JSON.stringify([r.metric, r.parameter, r.unit]);
export function chartRows(rows, selectedParameter, excluded = []) {
  const skip = new Set(excluded);
  return rows.filter(r => parameterKey(r) === selectedParameter && r.mean !== null && Number.isFinite(r.mean) && !skip.has(r.id));
}
