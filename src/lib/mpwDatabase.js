export const DATABASE_PATH = 'public/mpw-database/database.json';
export const METRICS = {
  propagation: { label: 'Propagation Loss', unit: 'dB/cm', parameter: 'Propagation loss' },
  insertion: { label: 'Insertion Loss', unit: 'dB/unit', parameter: 'Insertion loss' },
  heater: { label: 'Heater Performance', unit: 'mW/pi', parameter: 'Ppi' }
};
export const numberOrNull = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export const formatValue = value => numberOrNull(value) === null ? '—' : Number(value).toFixed(3);
export const emptyDatabase = () => ({ schemaVersion: 1, version: '1.0', records: [], history: [], updatedAt: null });

export function statistics(record) {
  const chips = record.chips || [];
  const values = chips.filter(c => c.included && c.status !== 'failed').map(c => numberOrNull(c.value)).filter(v => v !== null);
  const mean = chips.length ? (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null) : numberOrNull(record.summaryValue);
  return { mean, count: chips.length ? values.length : null, total: chips.length || record.reportedChipCount || null,
    min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
    sd: values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)) : null };
}

export function validateRecord(record) {
  for (const key of ['id', 'project', 'platform', 'slot', 'step', 'buildingBlock', 'metric', 'parameter', 'unit']) {
    if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`Record requires ${key}.`);
  }
  if (!METRICS[record.metric]) throw new Error('Unknown measurement category.');
  for (const key of ['opticalMode', 'date', 'method', 'source', 'sourceRef', 'notes']) {
    if (record[key] !== undefined && typeof record[key] !== 'string') throw new Error(`${key} must be text.`);
  }
  if (!Array.isArray(record.chips)) throw new Error('Chips must be a list.');
  const ids = new Set();
  for (const c of record.chips) {
    if (typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id)) throw new Error('Chip IDs must be non-empty and unique within a record.');
    if (c.reason !== undefined && typeof c.reason !== 'string') throw new Error('Chip notes must be text.');
    ids.add(c.id);
    if (c.value !== null && (typeof c.value !== 'number' || !Number.isFinite(c.value))) throw new Error('Chip values must be finite numbers or null.');
    if (typeof c.included !== 'boolean' || !['passed', 'failed', 'unreviewed'].includes(c.status)) throw new Error('Invalid chip review state.');
  }
  if (record.summaryValue !== null && (typeof record.summaryValue !== 'number' || !Number.isFinite(record.summaryValue))) throw new Error('Summary must be a finite number or null.');
  return record;
}
export function validateDatabase(db) {
  if (db?.schemaVersion !== 1 || !Array.isArray(db.records) || !Array.isArray(db.history) || !/^\d+\.\d+$/.test(db.version)) throw new Error('Unsupported MPW database format (expected schemaVersion 1).');
  const ids = new Set();
  db.records.forEach(r => { validateRecord(r); if (ids.has(r.id)) throw new Error('Duplicate record ID.'); ids.add(r.id); });
  return db;
}
export function libraryRecords(catalog, analytics = [], origin = 'bundled') {
  const byId = new Map(analytics.map(a => [a.id || a.datasetId, a]));
  return catalog.flatMap(d => {
    const a = byId.get(d.id || d.datasetId) || d;
    const type = String(d.measurementType || '');
    const metric = /propagation/i.test(type) ? 'propagation' : /insertion/i.test(type) ? 'insertion' : /heater/i.test(type) ? 'heater' : null;
    if (!metric) return [];
    const summaryKey = { propagation: 'propagationAverage', insertion: 'insertionAverage', heater: 'heaterEfficiencyAverage' }[metric];
    const spec = METRICS[metric];
    const supplied = a.processedRecords || d.processedRecords;
    if (Array.isArray(supplied)) return supplied.map(validateRecord);
    return [{ id: `library:${d.id || d.datasetId}:${metric}`, datasetId: d.id || d.datasetId, project: d.mpw || d.projectName || 'Unknown',
      platform: d.platformLabel || 'Unknown', slot: d.slot || 'Unknown', step: d.processStep || d.folder?.match(/Step\w+?(?=_)/)?.[0] || 'Unknown',
      buildingBlock: d.buildingBlockLabel || d.waveguideType || 'Unknown', opticalMode: d.opticalMode || 'Unknown', metric,
      parameter: spec.parameter, unit: spec.unit, date: d.measurementDate || d.selectedDate || '', method: d.measurementMode || '',
      summaryValue: numberOrNull(a.analyticsSummary?.[summaryKey]), reportedChipCount: d.chipCount || null,
      chips: (a.chips || []).map(c => ({ ...c, id: c.id || c.chipId, value: numberOrNull(c.value), included: c.included ?? c.status === 'passed', status: c.status || 'unreviewed' })),
      source: 'library', origin, sourceRef: d.folder || '', notes: 'Saved library analysis. Load chip results to inspect individual fits.',
      analysisSettings: a.analyticsReview?.propagationSettings || {}, excludedChipIds: a.analyticsReview?.excludedChipIds || [], updatedAt: a.analyticsSummary?.computedAt || null }];
  });
}

// Refresh never silently replaces a manually reviewed record or its exclusions.
export function mergeRecords(existing, incoming) {
  const map = new Map(existing.map(r => [r.id, r]));
  for (const next of incoming) {
    const previous = map.get(next.id);
    if (!previous) map.set(next.id, next);
    else if (!previous.locallyEdited && previous.source === next.source && ['library', 'reference'].includes(previous.source)) {
      map.set(next.id, { ...next, chips: next.chips.length ? next.chips : previous.chips });
    }
  }
  return [...map.values()];
}
export function recordChange(db, records, action, author) {
  const at = new Date().toISOString();
  return { ...db, records, updatedAt: at, history: [...db.history, { id: crypto.randomUUID(), at, author: author || 'Local editor', action }] };
}
export function markdownLog(db, note = '') {
  const clean = value => String(value || '').replace(/[\r\n|]/g, ' ');
  return `# CORNERSTONE MPW Measurement Records\n\nVersion: V${db.version}\n\nUpdated: ${db.updatedAt || 'Not published'}\n\n${clean(note)}\n\nRecords: ${db.records.length}\n\nAverages use included, non-failed chip values. Summary-only records retain their supplied average and have no inferred chip population. Units and parameters are kept separate.\n\n## Update history\n\n| UTC timestamp | Editor | Change |\n| --- | --- | --- |\n${db.history.map(h => `| ${clean(h.at)} | ${clean(h.author)} | ${clean(h.action)} |`).join('\n')}\n`;
}

export async function githubJson(config, path, optional = false) {
  const base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const response = await fetch(`${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(config.branch)}`, {
    cache: 'no-store', headers: { Accept: 'application/vnd.github+json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) }
  });
  if (response.status === 404 && optional) return null;
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}). Check repository, branch and access.`);
  const data = await response.json();
  if (!data.content) throw new Error(`GitHub did not return file content for ${path}.`);
  const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, '')), c => c.charCodeAt(0));
  return { data: JSON.parse(new TextDecoder().decode(bytes)), sha: data.sha };
}

export async function gitBlobSha(content) {
  const encoder = new TextEncoder();
  const body = encoder.encode(content);
  const header = encoder.encode(`blob ${body.length}\0`);
  const payload = new Uint8Array(header.length + body.length);
  payload.set(header); payload.set(body, header.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', payload))].map(b => b.toString(16).padStart(2, '0')).join('');
}

// All version artifacts are committed atomically; a concurrent database edit blocks upload.
export async function publishDatabase(config, db, baseSha, note, author) {
  if (!config.token) throw new Error('Set a GitHub token with Contents write access in Dataset Snapshots first.');
  if (!note.trim() || !author.trim()) throw new Error('Enter your name and an update note.');
  const root = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  async function api(path, method = 'GET', body) {
    const response = await fetch(root + path, { method, headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status}); refresh before retrying. No forced overwrite was attempted.`);
    return response.json();
  }
  const encodedBranch = config.branch.split('/').map(encodeURIComponent).join('/');
  const refPath = `/git/refs/heads/${encodedBranch}`;
  const head = await api(`/git/ref/heads/${encodedBranch}`);
  const pinned = { ...config, branch: head.object.sha };
  const existing = await githubJson(pinned, DATABASE_PATH, true);
  if ((existing?.sha || null) !== (baseSha || null)) throw new Error('The shared database changed. Refresh and review the latest version before uploading. Your local draft is retained.');
  const current = existing ? validateDatabase(existing.data) : null;
  const [major, minor] = (current?.version || '1.0').split('.').map(Number);
  const version = current ? `${major}.${minor + 1}` : '1.0';
  const next = recordChange({ ...db, version }, db.records, `Published V${version}: ${note.trim()}`, author.trim());
  validateDatabase(next);
  const parent = await api(`/git/commits/${head.object.sha}`);
  const json = JSON.stringify(next, null, 2) + '\n';
  const fileSha = await gitBlobSha(json);
  const log = markdownLog(next, note);
  const files = [[DATABASE_PATH, json], ['public/mpw-database/README.md', log], [`public/mpw-database/history/V${version}.md`, log], [`public/mpw-database/versions/V${version}.json`, json]];
  const tree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: files.map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) });
  const commit = await api('/git/commits', 'POST', { message: `MPW database V${version}: ${note.trim()}`, tree: tree.sha, parents: [head.object.sha] });
  await api(refPath, 'PATCH', { sha: commit.sha, force: false });
  return { db: next, sha: fileSha, commit: commit.sha };
}
