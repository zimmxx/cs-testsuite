import { useEffect, useMemo, useRef, useState } from 'react';
import { DATABASE_PATH, METRICS, emptyDatabase, formatValue, githubJson, libraryRecords, mergeRecords, numberOrNull, publishDatabase, recordChange, statistics, validateDatabase, validateRecord } from '../lib/mpwDatabase';
import { exportExcel, exportJson, exportLog, exportPdf } from '../lib/mpwDatabaseExport';
import './MpwDatabasePanel.css';
import { SOURCE_OPTIONS, loadDatabaseSnapshot, filterOptions, changeFilter, reconcileFilters } from '../lib/mpwDatabaseViews';

const freshRecord = () => ({ id: crypto.randomUUID(), project: '', platform: '', slot: '', step: 'Unknown', buildingBlock: '', opticalMode: '1550nm_TE', metric: 'propagation', parameter: 'Propagation loss', unit: 'dB/cm', date: '', method: 'Manual', summaryValue: null, chips: [], source: 'manual', sourceRef: '', notes: '' });
const fields = [['project', 'MPW / project'], ['platform', 'Platform'], ['step', 'Process step'], ['slot', 'Slot'], ['buildingBlock', 'Building block / geometry'], ['opticalMode', 'Optical mode'], ['parameter', 'Extracted parameter'], ['unit', 'Unit'], ['date', 'Measurement date'], ['method', 'Test method'], ['sourceRef', 'Source reference'], ['notes', 'Notes']];
const asset = path => `${import.meta.env.BASE_URL}${path}`;

function Editor({ record, onSave, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(record));
  const [error, setError] = useState('');
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  function field(key, value) { setDraft(d => ({ ...d, [key]: value })); }
  function chip(index, key, value) { setDraft(d => ({ ...d, chips: d.chips.map((c, i) => i === index ? { ...c, [key]: value } : c) })); }
  function save(event) {
    event.preventDefault();
    try { validateRecord(draft); onSave({ ...draft, locallyEdited: true, updatedAt: new Date().toISOString() }); } catch (e) { setError(e.message); }
  }
  return <dialog className="mpw-dialog" ref={dialog} onCancel={onClose} aria-labelledby="mpw-editor-title"><form onSubmit={save}>
    <div className="mpw-heading"><div><span className="mpw-eyebrow">DATABASE EDITOR</span><h2 id="mpw-editor-title">Measurement record</h2></div><button type="button" onClick={onClose} aria-label="Close editor">✕</button></div>
    <p>Keep different geometries, measurement dates and loss conventions in separate records. Unknown metadata should be labelled explicitly.</p>
    <div className="mpw-form-grid"><label>Measurement category<select value={draft.metric} onChange={e => { const metric = e.target.value; setDraft(d => ({ ...d, metric, parameter: METRICS[metric].parameter, unit: METRICS[metric].unit })); }}>{Object.entries(METRICS).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}</select></label>
      {fields.map(([key, label]) => <label key={key}>{label}<input required={['project', 'platform', 'slot', 'step', 'buildingBlock', 'parameter', 'unit'].includes(key)} type={key === 'date' ? 'date' : 'text'} value={draft[key] || ''} onChange={e => field(key, e.target.value)} /></label>)}
      {!draft.chips.length && <label>Summary value ({draft.unit})<input aria-label="Summary value" type="number" step="any" value={draft.summaryValue ?? ''} onChange={e => field('summaryValue', numberOrNull(e.target.value))} /></label>}
    </div>
    <div className="mpw-heading"><h3>Chip measurements <small>{draft.chips.length ? 'Mean is calculated from included chips' : 'Optional — leave empty for a historical summary'}</small></h3><button type="button" onClick={() => field('chips', [...draft.chips, { id: `Chip${draft.chips.length + 1}`, value: null, status: 'unreviewed', included: true, reason: '' }])}>+ Add chip</button></div>
    {draft.chips.length > 0 && <div className="mpw-table-scroll"><table><thead><tr><th>Chip ID</th><th>Value ({draft.unit})</th><th>Review</th><th>Include</th><th>Reason / note</th><th /></tr></thead><tbody>{draft.chips.map((c, i) => <tr key={i}><td><input aria-label={`Chip ${i + 1} ID`} value={c.id} onChange={e => chip(i, 'id', e.target.value)} required /></td><td><input type="number" step="any" aria-label={`Chip ${i + 1} value`} value={c.value ?? ''} onChange={e => chip(i, 'value', numberOrNull(e.target.value))} /></td><td><select aria-label={`Chip ${i + 1} review`} value={c.status} onChange={e => chip(i, 'status', e.target.value)}>{['passed', 'failed', 'unreviewed'].map(s => <option key={s}>{s}</option>)}</select></td><td><input type="checkbox" aria-label={`Include chip ${i + 1}`} checked={c.included} onChange={e => chip(i, 'included', e.target.checked)} /></td><td><input aria-label={`Chip ${i + 1} note`} value={c.reason || ''} onChange={e => chip(i, 'reason', e.target.value)} /></td><td><button type="button" onClick={() => field('chips', draft.chips.filter((_, n) => n !== i))}>Remove</button></td></tr>)}</tbody></table></div>}
    <p>Failed chips are excluded from averages even if checked. Unreviewed chips are included only when checked. Blank values never count as zero.</p>
    {error && <p role="alert" className="mpw-error">{error}</p>}<div className="mpw-actions"><button type="button" onClick={onClose}>Cancel</button><button className="mpw-primary" type="submit">Save record</button></div>
  </form></dialog>;
}

export default function MpwDatabasePanel({ githubConfig, onLoadChips }) {
  const storageKey = `cs.mpw-database.v1:${githubConfig.owner}/${githubConfig.repo}/${githubConfig.branch}`;
  const [db, setDb] = useState(emptyDatabase);
  const [baseSha, setBaseSha] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading database…');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [dataSource, setDataSource] = useState('all');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ platform: '', project: '', step: '', slot: '', buildingBlock: '', opticalMode: '' });
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [author, setAuthor] = useState('');
  const [note, setNote] = useState('');
  const [scope, setScope] = useState('filtered');
  const [page, setPage] = useState(0);
  const definitions = useRef(new Map());
  const input = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    async function init() {
      let initialized = false;
      try {
        const snapshot = await loadDatabaseSnapshot(githubConfig);
        definitions.current = new Map(snapshot.catalog.map(d => [d.id || d.datasetId, d]));
        if (!cancelled) { setDb(snapshot.db); setBaseSha(snapshot.baseSha); setDirty(snapshot.dirty); setStatus('Loaded database including Excel overview records. Refresh to check GitHub for updates.'); }
        initialized = true;
      } catch (e) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setReady(initialized); }
    }
    init(); return () => { cancelled = true; };
  }, [storageKey]);
  useEffect(() => { if (ready) { try { localStorage.setItem(storageKey, JSON.stringify({ db, baseSha, dirty })); } catch { setError('Browser storage is full or unavailable. Download JSON to preserve this draft before leaving.'); } } }, [db, baseSha, dirty, ready, storageKey]);
  const sourceRows = useMemo(() => db.records.filter(r => dataSource === 'all' || r.source === dataSource), [db.records, dataSource]);
  const optionRows = useMemo(() => sourceRows.filter(r => tab === 'all' || r.metric === tab), [sourceRows, tab]);
  useEffect(() => { setFilters(old => { const next = reconcileFilters(optionRows, old); return JSON.stringify(next) === JSON.stringify(old) ? old : next; }); }, [optionRows]);
  const filtered = useMemo(() => sourceRows.filter(r => (tab === 'all' || r.metric === tab) && Object.entries(filters).every(([key, value]) => !value || r[key] === value) && search.toLowerCase().split(/\s+/).every(token => `${r.project} ${r.platform} ${r.step} ${r.slot} ${r.buildingBlock} ${r.opticalMode} ${r.parameter} ${r.notes}`.toLowerCase().includes(token))).sort((a, b) => a.project.localeCompare(b.project, undefined, { numeric: true }) || a.slot.localeCompare(b.slot, undefined, { numeric: true }) || a.buildingBlock.localeCompare(b.buildingBlock)), [sourceRows, tab, filters, search]);
  useEffect(() => setPage(0), [tab, filters, search, dataSource, db.records.length]);
  const exportRows = scope === 'all' ? db.records : filtered;
  const exportScope = scope === 'all' ? `Full database: ${db.records.length} records` : `Filtered view: ${filtered.length} records; source ${dataSource}; ${tab}; ${search || 'no search'}; ${Object.values(filters).filter(Boolean).join(', ')}`;
  function changed(records, action) { setDb(d => recordChange(d, records, action, author)); setReady(true); setDirty(true); setStatus(action + '. Saved in this browser; upload to share.'); }
  async function run(label, operation) { setBusy(label); setError(''); try { await operation(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  async function refresh() {
    await run('Refreshing', async () => {
      const [shared, catalog, analytics] = await Promise.all([githubJson(githubConfig, DATABASE_PATH, true), githubJson(githubConfig, 'public/sample-data/wst/library-index-v2.json'), githubJson(githubConfig, 'public/sample-data/wst/library-analytics.json', true)]);
      if (!Array.isArray(catalog.data)) throw new Error('Invalid GitHub library index.');
      definitions.current = new Map(catalog.data.map(d => [d.id || d.datasetId, { ...d, mpwRemote: githubConfig }]));
      if (shared) validateDatabase(shared.data);
      const localEdits = db.records.filter(r => r.locallyEdited || r.source === 'manual' || r.source === 'reference');
      const overlaps = shared && localEdits.some(r => shared.data.records.some(s => s.id === r.id && JSON.stringify(s) !== JSON.stringify(r)));
      if (shared && shared.sha !== baseSha && dirty && (baseSha || overlaps)) throw new Error('Another editor changed the shared database while you have a draft. Download your JSON backup, then use “Load shared version” below to reconcile before publishing.');
      const combined = new Map((shared?.data.records || []).map(r => [r.id, r]));
      localEdits.forEach(r => combined.set(r.id, r));
      const history = [...new Map([...(shared?.data.history || []), ...db.history].map(h => [h.id, h])).values()];
      let next = shared ? { ...shared.data, records: [...combined.values()], history } : db;
      next = recordChange(next, mergeRecords(next.records, libraryRecords(catalog.data, analytics?.data || [], 'github')), 'Refreshed GitHub library', author);
      setDb(next); setBaseSha(shared?.sha || null); setDirty(true); setStatus(`Refreshed ${catalog.data.length} datasets from GitHub. Reviewed and historical records retained.`);
    });
  }
  async function loadShared() {
    await run('Loading shared version', async () => {
      const remote = await githubJson(githubConfig, DATABASE_PATH);
      validateDatabase(remote.data);
      exportJson(db); // Preserve the local draft before replacing it.
      setDb(remote.data); setBaseSha(remote.sha); setDirty(false); setReady(true); setStatus('Loaded shared database. Previous local draft downloaded as JSON for reconciliation.');
    });
  }
  async function chips(r) {
    await run(`Loading ${r.project} ${r.slot} chips`, async () => {
      let definition = definitions.current.get(r.datasetId);
      if (r.origin === 'github' && !definition?.mpwRemote) {
        const catalog = await githubJson(githubConfig, 'public/sample-data/wst/library-index-v2.json');
        definition = catalog.data.find(d => (d.id || d.datasetId) === r.datasetId);
        if (definition) definition = { ...definition, mpwRemote: githubConfig };
      }
      if (!definition) throw new Error('Dataset is not in the current library. Refresh to retrieve its metadata.');
      const result = await onLoadChips(definition);
      const values = result[r.metric]?.byChip || [];
      if (!values.length) throw new Error('No chip results were produced for this measurement type. The summary is retained.');
      if (r.metric === 'insertion' && values.some(c => c.blockCount > 1)) throw new Error('This dataset combines several insertion-loss devices per chip. Publish separate processed records per building block to avoid averaging unlike devices.');
      const next = { ...r, chips: values.map(c => ({ id: c.chipId, value: numberOrNull(r.metric === 'propagation' ? c.lossDbPerCm : r.metric === 'insertion' ? c.insertionLossDb : c.efficiencyMwPerPi), status: r.metric === 'propagation' ? (c.passMse ? 'passed' : 'failed') : 'unreviewed', included: (r.metric !== 'propagation' || c.passMse) && !r.excludedChipIds?.includes(c.chipId), reason: c.mse != null ? `MSE: ${c.mse}` : '' })), analysisSettings: result.settings, locallyEdited: true };
      if (r.metric === 'insertion') { next.unit = 'dB'; next.parameter = 'Insertion loss at peak (measured path)'; next.notes = 'Measured-path loss from the suite insertion analysis. No per-unit or splitting-loss correction has been applied.'; }
      validateRecord(next); changed(db.records.map(v => v.id === r.id ? next : v), `Loaded chip results for ${r.project} ${r.slot} ${r.buildingBlock}`);
    });
  }
  return <section className="mpw-db" aria-label="MPW Database">
    <div className="mpw-hero"><div><span className="mpw-eyebrow">CORNERSTONE / MEASUREMENT RECORDS</span><h2>MPW Database</h2><p>A shared performance record, from platform to individual chip.</p></div><div className="mpw-version"><strong>V{db.version}</strong><span>{dirty ? 'Local changes' : 'Saved version'}</span></div></div>
    <div className="mpw-stats">{[['Projects', new Set(db.records.map(r => r.project)).size], ['Platforms', new Set(db.records.map(r => r.platform)).size], ['Measurement records', db.records.length], ['Chip measurements', db.records.reduce((n, r) => n + r.chips.length, 0)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="mpw-toolbar"><div className="mpw-actions"><button disabled={!!busy || !ready} onClick={refresh}>↻ Refresh database</button><button aria-pressed={editMode} onClick={() => setEditMode(!editMode)}>{editMode ? 'Finish editing' : 'Edit database'}</button><button className="mpw-primary" disabled={!ready || !!busy} onClick={() => setEditing(freshRecord())}>+ Add record</button></div><div className="mpw-actions"><label>Export<select aria-label="Export scope" value={scope} onChange={e => setScope(e.target.value)}><option value="filtered">Current view</option><option value="all">Full database</option></select></label><button disabled={!!busy || !exportRows.length} onClick={() => run('Exporting Excel', () => exportExcel(db, exportRows, exportScope))}>Export Excel</button><button disabled={!!busy || !exportRows.length} onClick={() => run('Generating PDF', () => exportPdf(db, exportRows, exportScope))}>Generate PDF</button></div></div>
    <p className="mpw-status" role="status">{busy ? `${busy}…` : status}</p>{error && <div className="mpw-error" role="alert">{error}</div>}
    <div className="mpw-tabs" role="tablist" aria-label="Measurement categories">{[['all', 'Master Summary'], ...Object.entries(METRICS).map(([key, m]) => [key, m.label])].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}<span>{sourceRows.filter(r => key === 'all' || r.metric === key).length}</span></button>)}</div>
    <div className="mpw-filter-panel"><label>Data from<select aria-label="Data from" value={dataSource} onChange={e => setDataSource(e.target.value)}>{SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mpw-search">Find a project, slot or building block<input placeholder="Try MPW48 Slot5 Strip…" aria-label="Search MPW database" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="mpw-filter-grid">{Object.keys(filters).map(key => <label key={key}>{({ project: 'MPW / project', buildingBlock: 'Building block', opticalMode: 'Optical mode' })[key] || key}<select aria-label={`Filter ${key}`} value={filters[key]} onChange={e => setFilters(changeFilter(filters, key, e.target.value))}><option value="">All</option>{filterOptions(optionRows, filters, key).map(v => <option key={v}>{v}</option>)}</select></label>)}</div></div>
    <div className="mpw-heading"><p><strong>{filtered.length}</strong> records · averages use included, non-failed chips · units shown per parameter</p><button onClick={() => { setSearch(''); setDataSource('all'); setTab('all'); setFilters(Object.fromEntries(Object.keys(filters).map(k => [k, '']))); }}>Clear filters</button></div>
    <div className="mpw-table-scroll"><table className="mpw-records"><thead><tr><th>Project / slot</th><th>Platform / step</th><th>Building block</th><th>Parameter</th><th>Mean</th><th>Chip coverage</th><th>Measured / source</th><th>Details</th></tr></thead><tbody>{filtered.slice(page * 30, page * 30 + 30).map(r => { const s = statistics(r); return <RecordRow key={r.id} record={r} stats={s} expanded={!!expanded[r.id]} toggle={() => setExpanded({ ...expanded, [r.id]: !expanded[r.id] })} editMode={editMode} onEdit={() => setEditing(r)} busy={!!busy} loadChips={() => chips(r)} onInclude={(id, included) => changed(db.records.map(v => v.id === r.id ? { ...v, locallyEdited: true, chips: v.chips.map(c => c.id === id ? { ...c, included } : c) } : v), `${included ? 'Included' : 'Excluded'} ${id} in ${r.project} ${r.slot} ${r.parameter}`)} />; })}</tbody></table>{!filtered.length && <div className="mpw-empty"><h3>No matching measurement records</h3><p>Adjust your filters or add a historical record manually.</p></div>}</div>
    <div className="mpw-heading"><span>Page {Math.min(page + 1, Math.max(1, Math.ceil(filtered.length / 30)))} of {Math.max(1, Math.ceil(filtered.length / 30))}</span><div className="mpw-actions"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={(page + 1) * 30 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div></div>
    <details className="mpw-management" open={editMode}><summary>Database publishing, imports & update history</summary><p>JSON is the shared source of truth. Every upload creates a versioned JSON snapshot and Markdown update record in a single GitHub commit.</p><div className="mpw-publish"><label>Editor name<input aria-label="Database editor name" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name" /></label><label>Update note<input aria-label="Database update note" value={note} onChange={e => setNote(e.target.value)} placeholder="Describe changed projects and review decisions" /></label><button className="mpw-primary" disabled={!!busy || !ready || !author.trim() || !note.trim()} onClick={() => run('Uploading database', async () => { const result = await publishDatabase(githubConfig, db, baseSha, note, author); setDb(result.db); setBaseSha(result.sha); setDirty(false); setNote(''); setStatus(`Published V${result.db.version} to GitHub in commit ${result.commit.slice(0, 8)}.`); })}>Upload database to GitHub</button></div><p className="mpw-hint">Destination: {githubConfig.owner}/{githubConfig.repo} · {githubConfig.branch} · {DATABASE_PATH}. Access settings are in Dataset Snapshots.</p>
      <div className="mpw-actions"><button onClick={() => exportJson(db)}>Download JSON backup</button><button onClick={() => exportLog(db)}>Download update log (.md)</button><button disabled={!!busy} onClick={() => input.current.click()}>Import JSON</button><button disabled={!!busy} onClick={() => run('Importing workbook records', async () => { const response = await fetch(asset('mpw-database/reference-records.json')); if (!response.ok) throw new Error('Workbook reference records unavailable.'); const records = await response.json(); records.forEach(validateRecord); const merged = mergeRecords(db.records, records); changed(merged, `Imported ${merged.length - db.records.length} historical workbook records`); })}>Import reference workbook records</button><button disabled={!!busy} onClick={loadShared}>Load shared version</button></div>
      <input hidden type="file" accept=".json,application/json" ref={input} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) run('Importing JSON', async () => { const imported = validateDatabase(JSON.parse(await file.text())); const ids = new Set(db.records.map(r => r.id)); const additions = imported.records.filter(r => !ids.has(r.id)).map(r => ({ ...r, locallyEdited: true })); changed([...db.records, ...additions], `Imported ${additions.length} records from ${file.name}; existing IDs kept`); }); }} />
      <p>Workbook import preserves summary values and references. It does not invent chip results, process steps or missing units. Matching IDs are imported only once.</p>
      <ol className="mpw-history">{db.history.slice(-8).reverse().map(h => <li key={h.id}><strong>{h.action}</strong><span>{h.author} · {h.at}</span></li>)}</ol>
    </details>
    {editing && <Editor record={editing} onClose={() => setEditing(null)} onSave={r => { changed([...db.records.filter(v => v.id !== r.id), r], `Saved ${r.project} ${r.slot} ${r.parameter}`); setEditing(null); }} />}
  </section>;
}

function RecordRow({ record: r, stats: s, expanded, toggle, editMode, onEdit, busy, loadChips, onInclude }) {
  return <><tr><td><strong>{r.project}</strong><small>{r.slot}</small></td><td>{r.platform}<small>{r.step}</small></td><td>{r.buildingBlock}<small>{r.opticalMode}</small></td><td>{r.parameter}<small>{METRICS[r.metric].label}</small></td><td className="mpw-value">{formatValue(s.mean)}<small>{r.unit}</small></td><td><span className={`mpw-badge ${r.chips.length ? 'mpw-reviewed' : ''}`}>{r.chips.length ? `${s.count} / ${s.total} included` : 'Summary only'}</span>{r.chips.length > 0 && <small>SD {formatValue(s.sd)}</small>}</td><td>{r.date || 'Date unknown'}<small>{r.source}{r.locallyEdited ? ' · reviewed locally' : ''}</small></td><td><button onClick={toggle} aria-expanded={expanded} aria-label={`Details ${r.project} ${r.slot} ${r.buildingBlock} ${r.parameter}`}>{expanded ? 'Collapse −' : 'Expand +'}</button>{editMode && <button disabled={busy} onClick={onEdit}>Edit</button>}</td></tr>
  {expanded && <tr className="mpw-detail"><td colSpan="8"><div className="mpw-detail-head"><div><strong>{r.project} · {r.step} · {r.slot} · {r.parameter}</strong><p>{r.notes || 'No notes recorded.'}</p><p className="mpw-source">Source: {r.sourceRef || 'Manual entry'} · Method: {r.method || 'Unknown'}</p>{r.analysisSettings && <p className="mpw-source">Analysis settings: {Object.entries(r.analysisSettings).map(([k, v]) => `${k}: ${v ?? 'unknown'}`).join(' · ')}</p>}</div><button disabled={busy} onClick={onEdit}>Edit record</button></div>{r.chips.length ? <table className="mpw-chips"><thead><tr><th>Included</th><th>Chip</th><th>Value ({r.unit})</th><th>Review</th><th>Reason / fit quality</th></tr></thead><tbody>{r.chips.map(c => <tr key={c.id}><td><input type="checkbox" aria-label={`Include ${c.id}`} checked={c.included && c.status !== 'failed'} disabled={!editMode || busy || c.status === 'failed'} onChange={e => onInclude(c.id, e.target.checked)} /></td><td>{c.id}</td><td>{formatValue(c.value)}</td><td>{c.status}</td><td>{c.reason || '—'}</td></tr>)}</tbody></table> : <div className="mpw-summary-note"><p>This is a source average. Individual chip values have not been loaded; the chip count is not inferred.</p>{r.source === 'library' && <button disabled={busy} onClick={loadChips}>Load chip results</button>}</div>}<p className="mpw-hint">Enable “Edit database” to change chip inclusion. Failed chips never contribute to the mean.</p></td></tr>}</>;
}
