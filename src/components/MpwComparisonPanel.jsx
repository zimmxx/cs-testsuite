import { useEffect, useMemo, useState } from 'react';
import { METRICS, formatValue } from '../lib/mpwDatabase';
import { SOURCE_OPTIONS, sourceLabel, databaseStorageKey, loadDatabaseSnapshot, comparisonRows, chartRows, parameterKey, uniqueValues } from '../lib/mpwDatabaseViews';
import './MpwDatabasePanel.css';
import './MpwComparisonPanel.css';

const palette = ['#6246b8', '#087f8c', '#be5630', '#3371ba', '#a43179', '#667323'];
function ComparisonChart({ rows, axis, group, unit, parameter }) {
  const [active, setActive] = useState(null);
  const categories = uniqueValues(rows, axis), groups = uniqueValues(rows, group);
  const width = Math.max(760, categories.length * 85 + 120), height = 400;
  const left = 75, right = width - 28, top = 32, bottom = 300;
  const values = rows.map(r => r.mean), min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1, low = min < 0 ? min - span * .08 : 0, high = max + span * .12;
  const x = value => left + (categories.indexOf(value) + .5) * (right - left) / Math.max(1, categories.length);
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  const selected = rows.find(r => r.id === active);
  return <div className="mpw-chart-card">
    <div className="mpw-heading"><div><h3>{parameter}</h3><p>One point per record average · {rows.length} points · focus or select a point for details</p></div></div>
    <div className="mpw-chart-legend">{groups.map((name, i) => <span key={name}><b style={{ color: palette[i % palette.length] }}>{i % 2 ? '◆' : '●'}</b> {name || 'Unspecified'}</span>)}</div>
    {rows.length ? <div className="mpw-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label={`${parameter} in ${unit} by ${axis}. Each point is one record average.`}>
      {[0, 1, 2, 3, 4, 5].map(i => { const v = low + (high - low) * i / 5; return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#e1e4ed" /><text x={left - 10} y={y(v) + 4} textAnchor="end">{Number(v.toPrecision(3))}</text></g>; })}
      <text transform={`translate(18 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">{unit}</text>
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#788197" />
      {categories.map(value => <text key={value} x={x(value)} y={bottom + 22} textAnchor="end" transform={`rotate(-35 ${x(value)} ${bottom + 22})`}>{value || 'Unspecified'}</text>)}
      {rows.map((r, index) => { const gi = groups.indexOf(r[group]); const offset = ((index * 7) % 9 - 4) * 2; const px = x(r[axis]) + offset, py = y(r.mean); const label = `${r.project}, ${r.step}, ${r.slot}, ${r.buildingBlock}, ${r.opticalMode || 'Unspecified'}: ${formatValue(r.mean)} ${r.unit}`; return <g key={r.id} tabIndex={0} role="button" aria-label={label} onFocus={() => setActive(r.id)} onMouseEnter={() => setActive(r.id)} onClick={() => setActive(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(r.id); } }}>
        <title>{label}</title>{gi % 2 ? <path d={`M ${px} ${py - 6} l 6 6 l -6 6 l -6 -6 Z`} fill={palette[gi % palette.length]} stroke={active === r.id ? '#101828' : '#fff'} strokeWidth={active === r.id ? 2 : 1} /> : <circle cx={px} cy={py} r={active === r.id ? 6 : 5} fill={palette[gi % palette.length]} stroke={active === r.id ? '#101828' : '#fff'} strokeWidth={1.5} />}
      </g>; })}
    </svg></div> : <div className="mpw-empty">No numeric averages for this parameter and selection.</div>}
    <div className="mpw-point-details" aria-live="polite">{selected ? <><strong>{selected.project} · {selected.step} · {selected.slot} — {formatValue(selected.mean)} {selected.unit}</strong><span>{selected.platform} · {selected.buildingBlock} · {selected.opticalMode || 'Mode unspecified'} · {sourceLabel(selected.source)} · {selected.date || 'Date unknown'}</span></> : 'Select a point to inspect its project, geometry, optical mode and source.'}</div>
    <p>Horizontal offsets separate overlapping points. Records are never averaged together. Different parameters and units are plotted separately.</p>
  </div>;
}

export default function MpwComparisonPanel({ githubConfig }) {
  const [records, setRecords] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [source, setSource] = useState('all'), [metric, setMetric] = useState('propagation');
  const [filters, setFilters] = useState({ platform: '', step: '', slot: '', family: '', buildingBlock: '', opticalMode: '' });
  const [projects, setProjects] = useState([]), [excluded, setExcluded] = useState([]), [parameter, setParameter] = useState('');
  const [axis, setAxis] = useState('project'), [group, setGroup] = useState('family'), [page, setPage] = useState(0);
  const key = databaseStorageKey(githubConfig);
  async function load() {
    setLoading(true); setError('');
    try { const snapshot = await loadDatabaseSnapshot(githubConfig); setRecords(comparisonRows(snapshot.db.records)); localStorage.setItem(key, JSON.stringify({ db: snapshot.db, baseSha: snapshot.baseSha, dirty: snapshot.dirty })); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [key]);
  const base = useMemo(() => records.filter(r => (source === 'all' || r.source === source) && (metric === 'all' || r.metric === metric)), [records, source, metric]);
  const projectOptions = uniqueValues(base.filter(r => !filters.platform || r.platform === filters.platform), 'project');
  const selectedProjects = base.filter(r => !projects.length || projects.includes(r.project));
  const rows = selectedProjects.filter(r => Object.entries(filters).every(([k, v]) => !v || r[k] === v));
  const included = rows.filter(r => !excluded.includes(r.id));
  const parameters = [...new Map(included.map(r => [parameterKey(r), r])).entries()];
  const chosen = parameters.some(([k]) => k === parameter) ? parameter : parameters[0]?.[0] || '';
  const specification = parameters.find(([k]) => k === chosen)?.[1];
  const plotted = chartRows(included, chosen);
  useEffect(() => setPage(0), [source, metric, projects, filters]);
  function reset() { setSource('all'); setMetric('propagation'); setFilters(Object.fromEntries(Object.keys(filters).map(k => [k, '']))); setProjects([]); setExcluded([]); }
  function setFilter(key, value) {
    const keys = Object.keys(filters), next = { ...filters, [key]: value }; keys.slice(keys.indexOf(key) + 1).forEach(k => next[k] = ''); setFilters(next);
    if (key === 'platform') setProjects([]);
  }
  return <section className="mpw-db mpw-comparison">
    <div className="mpw-hero"><div><span className="mpw-eyebrow">CORNERSTONE · LIBRARY</span><h2>MPW Comparison</h2><p>Compare project performance across runs, process steps and waveguide geometries.</p></div></div>
    <div className="mpw-heading"><p>Uses the current MPW Database, including this browser’s saved edits and Excel overview.</p><button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload database'}</button></div>
    {error && <p className="mpw-error" role="alert">{error}</p>}
    <div className="mpw-filter-panel"><div className="mpw-filter-grid">
      <label>Data from<select aria-label="Comparison data from" value={source} onChange={e => { reset(); setSource(e.target.value); }}>{SOURCE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label>Component<select value={metric} onChange={e => { reset(); setSource(source); setMetric(e.target.value); }}><option value="all">All components</option>{Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      {Object.entries(filters).map(([key, value], index) => { const parents = Object.entries(filters).slice(0, index); const options = uniqueValues((key === 'platform' ? base : selectedProjects).filter(r => parents.every(([k, v]) => !v || r[k] === v)), key); return <label key={key}>{({ platform: 'Platform', step: 'Process step', slot: 'Slot', family: 'Waveguide type', buildingBlock: 'Building block', opticalMode: 'Optical mode' })[key]}<select aria-label={`Comparison ${key}`} value={value} onChange={e => setFilter(key, e.target.value)}><option value="">All</option>{options.map(v => <option key={v}>{v}</option>)}</select></label>; })}
    </div><fieldset className="mpw-project-picker"><legend>MPW / projects <small>— choose several; none selected means all</small></legend>{projectOptions.map(project => <label key={project}><input type="checkbox" checked={projects.includes(project)} onChange={e => { setProjects(old => e.target.checked ? [...old, project] : old.filter(p => p !== project)); setFilters(old => ({ ...old, step: '', slot: '', family: '', buildingBlock: '', opticalMode: '' })); }} />{project}</label>)}</fieldset></div>
    <div className="mpw-heading"><p><strong>{included.length}</strong> included summary records / {rows.length} matching · {new Set(included.map(r => r.project)).size} projects</p><button onClick={reset}>Reset comparison</button></div>
    <p>Uncheck a row to omit it from this comparison. Chip inclusion and the database stay unchanged.</p>
    <div className="mpw-table-scroll"><table className="mpw-records"><thead><tr><th>Compare</th><th>Project / slot</th><th>Platform / step</th><th>Building block / mode</th><th>Parameter</th><th>Average</th><th>Source / measured</th></tr></thead><tbody>{rows.slice(page * 30, page * 30 + 30).map(r => <tr key={r.id}><td><input type="checkbox" aria-label={`Compare ${r.project} ${r.slot} ${r.parameter} ${r.id}`} checked={!excluded.includes(r.id)} onChange={e => setExcluded(old => e.target.checked ? old.filter(id => id !== r.id) : [...old, r.id])} /></td><td><strong>{r.project}</strong><small>{r.slot}</small></td><td>{r.platform}<small>{r.step}</small></td><td>{r.buildingBlock}<small>{r.opticalMode || 'Unspecified'}</small></td><td>{r.parameter}</td><td><strong>{formatValue(r.mean)}</strong> {r.unit}</td><td>{sourceLabel(r.source)}<small>{r.date || 'Unknown'}</small></td></tr>)}</tbody></table>{!rows.length && !loading && <p className="mpw-empty">No matching records. Adjust the filters.</p>}</div>
    <div className="mpw-actions"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 30))}</span><button disabled={(page + 1) * 30 >= rows.length} onClick={() => setPage(p => p + 1)}>Next</button></div>
    <div className="mpw-filter-panel mpw-filter-grid"><label>Chart parameter<select aria-label="Chart parameter" value={chosen} onChange={e => setParameter(e.target.value)}>{parameters.map(([k, r]) => <option key={k} value={k}>{r.parameter} ({r.unit})</option>)}</select></label><label>X axis<select aria-label="X axis" value={axis} onChange={e => setAxis(e.target.value)}>{[['project', 'MPW run'], ['step', 'Process step'], ['slot', 'Slot'], ['platform', 'Platform']].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Colour / shape by<select aria-label="Colour by" value={group} onChange={e => setGroup(e.target.value)}>{[['family', 'Waveguide type (Strip / Rib)'], ['opticalMode', 'Optical mode (TE / TM)'], ['project', 'MPW run'], ['platform', 'Platform']].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label></div>
    <ComparisonChart rows={plotted} axis={axis} group={group} unit={specification?.unit || ''} parameter={specification?.parameter || 'Performance comparison'} />
    <p>{included.filter(r => parameterKey(r) === chosen && r.mean === null).length} records with missing averages omitted from this chart. Historical summary records may overlap library measurements; source labels help identify them.</p>
  </section>;
}
