import { useMemo, useRef, useState } from "react";
import { PlotlyFigure } from "./InteractivePlots";
import { analyzeAnova, anovaReportCsv, parseAnovaCsv, parseAnovaProject } from "../lib/anova";

const CONFIG = { responsive: true, displaylogo: false, scrollZoom: true };
const number = (value, digits = 4) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const probability = (value) => value == null ? "—" : value === 0 ? "< 1e-300" : value < 0.0001 ? value.toExponential(3) : value.toFixed(5);
const EXAMPLE = "group,chip_id,loss_db_per_cm,wafer_id\nWafer A,Chip1,2.1,Example-A\nWafer A,Chip2,2.4,Example-A\nWafer A,Chip3,2.8,Example-A\nWafer A,Chip4,2.5,Example-A\nWafer B,Chip1,3.2,Example-B\nWafer B,Chip2,3.9,Example-B\nWafer B,Chip3,4.3,Example-B\nWafer B,Chip4,3.6,Example-B\nWafer C,Chip1,4.1,Example-C\nWafer C,Chip2,4.5,Example-C\nWafer C,Chip3,4.8,Example-C\nWafer C,Chip4,5.0,Example-C";

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Distribution({ groups }) {
  const data = useMemo(() => groups.map((group) => ({
    type: "box", name: group.label, x: group.observations.map(() => group.label), y: group.observations.map((row) => row.value), text: group.observations.map((row) => row.chipId),
    boxpoints: "all", jitter: 0.25, pointpos: 0, marker: { size: 6 }, line: { width: 2 },
    hovertemplate: "%{text}<br>%{y:.4f} dB/cm<extra>%{fullData.name}</extra>"
  })), [groups]);
  const layout = useMemo(() => ({ margin: { l: 70, r: 20, t: 20, b: 110 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "#fbfcfc", showlegend: false,
    yaxis: { title: "Propagation loss (dB/cm)", zeroline: false, gridcolor: "#e3ecef" }, xaxis: { title: "Independent group", automargin: true },
    font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" } }), []);
  return <PlotlyFigure data={data} layout={layout} config={CONFIG} height={390} emptyMessage="Add at least two groups to compare their chip distributions." windowTitle="Propagation ANOVA group distributions" />;
}

export default function AnovaPanel({ datasets, loadDataset, addCurrent, currentChipCount }) {
  const [groups, setGroups] = useState([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("welch");
  const [alpha, setAlpha] = useState(0.05);
  const [independent, setIndependent] = useState(false);
  const [csv, setCsv] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("Add two or more independent groups. Each observation must be one chip-level propagation-loss estimate.");
  const csvRef = useRef(null); const jsonRef = useRef(null);
  const sourceOptions = useMemo(() => datasets.filter((dataset) => `${dataset.label} ${dataset.projectName || ""} ${dataset.slot || ""}`.toLowerCase().includes(sourceSearch.toLowerCase())), [datasets, sourceSearch]);
  const displayed = useMemo(() => analyzeAnova(groups, { method, alpha, independent: false }).groups, [groups, method, alpha]);

  function replaceGroups(next) { setGroups(next); setIndependent(false); setResult(null); }
  function appendGroups(incoming) {
    if (groups.length + incoming.length > 20) throw new Error("Use no more than 20 groups in one comparison.");
    if (incoming.some((group) => group.sourceKey && groups.some((existing) => existing.sourceKey === group.sourceKey))) throw new Error("This source dataset is already present. Use its Include checkbox instead of adding it twice.");
    replaceGroups([...groups, ...incoming.map((group) => ({ ...group, id: crypto.randomUUID(), enabled: true }))]);
  }
  async function addSelected() {
    const dataset = datasets.find((item) => item.anovaSourceKey === selectedSource);
    if (!dataset) { setStatus("Choose a saved dataset first."); return; }
    setBusy(true);
    try { const group = await loadDataset(dataset); appendGroups([group]); setStatus(`Added ${group.observations.length} included, passing chip values from ${group.label}. Review the wafer identity and processing context.`); }
    catch (error) { setStatus(`Dataset could not be added: ${error.message}`); }
    finally { setBusy(false); }
  }
  function addWorkspace() {
    try { const group = addCurrent(); appendGroups([group]); setStatus(`Added ${group.observations.length} accepted chip values from the current propagation workspace.`); }
    catch (error) { setStatus(error.message); }
  }
  function addCsv(text = csv) {
    try { const incoming = parseAnovaCsv(text); appendGroups(incoming); setStatus(`Added ${incoming.length} CSV group(s). CSV rows are treated as user-selected chip estimates; no MSE filtering is applied to pasted values.`); }
    catch (error) { setStatus(`CSV import failed: ${error.message}`); }
  }
  async function importCsv(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try { const text = await file.text(); setCsv(text); addCsv(text); } catch (error) { setStatus(`CSV import failed: ${error.message}`); }
  }
  async function importProject(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const project = parseAnovaProject(await file.text());
      replaceGroups(project.groups.map((group) => ({ ...group, id: crypto.randomUUID() })));
      setMethod(project.method); setAlpha(project.alpha);
      setNotes(project.notes); setStatus("ANOVA inputs restored. Review the groups and confirm independence again before running the test.");
    } catch (error) { setStatus(`Project import failed: ${error.message}`); }
  }
  function exportProject() {
    download(JSON.stringify({ kind: "cornerstone-propagation-anova", schemaVersion: 1, savedAt: new Date().toISOString(), unit: "dB/cm", groups, method, alpha, notes,
      independenceAcknowledged: independent, result, assumptions: "Independent chip observations; approximate normality; classical ANOVA also assumes equal variances. No paired or repeated-measures model." }, null, 2), "propagation-anova-project.json", "application/json");
  }
  function run() {
    try { const next = analyzeAnova(groups, { method, alpha, independent }); setResult({ ...next, independent }); setStatus(next.errors.length ? "ANOVA was not run. Resolve the issues shown below." : "ANOVA complete. Interpret the p-value alongside group distributions, effect sizes and design assumptions."); }
    catch (error) { setStatus(`ANOVA calculation failed: ${error.message}`); }
  }

  return <section className="library-stack anova-workspace" aria-label="Propagation ANOVA workspace">
    <article className="analysis-card"><div className="analysis-card-head"><div><h2>Propagation ANOVA</h2><p>Compare chip-level propagation loss across independent groups, such as separate wafers. One group represents one dataset or one user-defined condition.</p></div><div className="library-action-row"><button type="button" disabled={!groups.length} onClick={exportProject}>Export ANOVA project JSON</button><button type="button" className="ghost-action" onClick={() => jsonRef.current?.click()}>Import ANOVA project JSON</button></div></div>
      <p className="anova-status" role="status">{busy ? "Loading and processing the selected dataset…" : status}</p>
      <input type="file" ref={jsonRef} hidden accept=".json" aria-label="ANOVA project JSON" onChange={importProject} />
      <div className="anova-controls">
        <label className="mapping-field"><span>Find saved datasets</span><input type="search" aria-label="Find ANOVA datasets" value={sourceSearch} placeholder="Project, slot or dataset name" onChange={(event) => setSourceSearch(event.target.value)} /></label>
        <label className="mapping-field"><span>Saved dataset</span><select aria-label="ANOVA dataset" value={sourceOptions.some((item) => item.anovaSourceKey === selectedSource) ? selectedSource : ""} onChange={(event) => setSelectedSource(event.target.value)} disabled={busy}><option value="">Choose a dataset</option>{sourceOptions.map((dataset) => <option key={dataset.anovaSourceKey} value={dataset.anovaSourceKey}>{dataset.scope === "remote" ? "GitHub" : "Local"} · {dataset.label}</option>)}</select></label>
        <button type="button" disabled={busy || !selectedSource || !sourceOptions.some((item) => item.anovaSourceKey === selectedSource)} onClick={addSelected}>Add dataset as group</button>
        <button type="button" className="ghost-action" disabled={!currentChipCount || busy} onClick={addWorkspace}>Add current accepted chips ({currentChipCount})</button>
      </div>
      <p className="anova-note">Saved datasets use their own wavelength, MSE threshold, physical lengths and exclusions. Match measurement conditions before comparing. Add current accepted chips uses the live propagation review. Groups stay in this tab session; export JSON to keep a portable copy.</p>
      <details className="anova-import"><summary>Add grouped chip CSV or try a synthetic example</summary><p>Headers: <code>group,chip_id,loss_db_per_cm</code>. Optional <code>wafer_id</code> identifies shared wafers for repeat detection. One row must be one chip, not one waveguide or wavelength.</p>
        <label className="mapping-field"><span>Grouped ANOVA CSV</span><textarea aria-label="Grouped ANOVA CSV" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={'group,chip_id,loss_db_per_cm,wafer_id\nWafer A,Chip1,2.3,A\nWafer A,Chip2,2.6,A\nWafer B,Chip1,3.1,B\nWafer B,Chip2,3.4,B'} /></label>
        <div className="library-action-row"><button type="button" disabled={!csv.trim()} onClick={() => addCsv()}>Add pasted ANOVA groups</button><button type="button" className="ghost-action" onClick={() => csvRef.current?.click()}>Import grouped CSV</button><button type="button" className="ghost-action" disabled={groups.length > 0} onClick={() => { setCsv(EXAMPLE); addCsv(EXAMPLE); }}>Load synthetic ANOVA example</button></div>
        <input ref={csvRef} type="file" accept=".csv,.txt" hidden aria-label="Grouped ANOVA CSV file" onChange={importCsv} />
      </details>
    </article>

    <article className="analysis-card"><div className="analysis-card-head"><div><h3>Groups & chip distributions</h3><p>Use Include to select groups. Keep labels distinct and avoid mixing unrelated factors. CSV values must already represent your accepted chip-level estimates. Group 95% CIs are unadjusted descriptive intervals; their overlap is not a significance test.</p></div></div>
      <div className="dashboard-table-wrap"><table className="anova-table"><thead><tr><th>Include</th><th>Group label</th><th>n</th><th>Mean (dB/cm)</th><th>Sample SD</th><th>95% mean CI</th><th>Source / wafer identity</th><th>Actions</th></tr></thead><tbody>{groups.map((group) => {
        const summary = displayed.find((item) => item.id === group.id);
        return <tr key={group.id}><td><input type="checkbox" aria-label={`Include ANOVA group ${group.label}`} checked={group.enabled !== false} onChange={(event) => replaceGroups(groups.map((item) => item.id === group.id ? { ...item, enabled: event.target.checked } : item))} /></td><td><input type="text" aria-label={`ANOVA label ${group.label}`} value={group.label} onChange={(event) => replaceGroups(groups.map((item) => item.id === group.id ? { ...item, label: event.target.value } : item))} /></td><td>{group.observations?.length || 0}</td><td>{number(summary?.mean)}</td><td>{number(summary?.sampleSd)}</td><td>{summary?.lower95 == null ? "—" : `${number(summary.lower95)} to ${number(summary.upper95)}`}</td><td><span>{group.source}</span><small>{group.waferLabel || group.cohortId || "Wafer identity not supplied; check independence manually"}</small></td><td><button type="button" className="ghost-action" aria-label={`Remove ANOVA group ${group.label}`} onClick={() => replaceGroups(groups.filter((item) => item.id !== group.id))}>Remove</button></td></tr>;
      })}{!groups.length ? <tr><td colSpan={8}>No groups yet. Add datasets, paste grouped chip values, or load the clearly labelled synthetic example.</td></tr> : null}</tbody></table></div>
      <Distribution groups={displayed} />
      <details className="anova-observations"><summary>Inspect group chip values and processing provenance</summary>{groups.map((group) => <div key={group.id}><h4>{group.label}</h4><p>{group.observations.map((row) => `${row.chipId}: ${number(row.value)} dB/cm`).join(" · ")}</p>{group.context ? <pre>{JSON.stringify(group.context, null, 2)}</pre> : <p>User-supplied values; MSE filtering and source processing settings were not independently verified.</p>}</div>)}</details>
    </article>

    <article className="analysis-card"><div className="analysis-card-head"><div><h3>Run the independent-groups test</h3><p>H₀: all included group population means are equal. H₁: at least one differs. Statistical significance does not establish a fabrication cause or practical importance.</p></div></div>
      <div className="anova-controls"><label className="mapping-field"><span>ANOVA method</span><select aria-label="ANOVA method" value={method} onChange={(event) => { setMethod(event.target.value); setResult(null); }}><option value="welch">Welch — unequal variances allowed</option><option value="classical">Classical one-way — equal variances assumed</option></select></label><label className="mapping-field"><span>Significance level α</span><select aria-label="ANOVA significance level" value={alpha} onChange={(event) => { setAlpha(Number(event.target.value)); setResult(null); }}><option value={0.01}>0.01</option><option value={0.05}>0.05</option><option value={0.1}>0.10</option></select></label><button type="button" onClick={run} disabled={busy || groups.filter((group) => group.enabled !== false).length < 2 || !independent}>Run propagation ANOVA</button></div>
      <label className="anova-independence"><input type="checkbox" checked={independent} onChange={(event) => { setIndependent(event.target.checked); setResult(null); }} />I have checked that the groups and chip observations are independent; these are not repeated measurements of the same chips.</label>
      <p className="anova-note">Before/after measurements on the same wafer/chips, multiple wavelengths from one chip, and multiple devices nested in one wafer may require paired, repeated-measures or hierarchical models. This view does not implement those models. Shared chip/wafer identities are blocked when known; absent identities cannot establish independence. Both methods require distribution checks; classical ANOVA additionally assumes equal group variances. Spatial correlation can invalidate p-values. For treatments applied to whole wafers, chips within one wafer do not provide independent wafer replications. Use multiple wafers and a suitable hierarchical design for process-level conclusions.</p>
    </article>

    {result ? <article className="analysis-card anova-results"><div className="analysis-card-head"><div><h3>ANOVA results</h3><p>{result.method === "welch" ? "Welch's one-way ANOVA" : "Classical one-way ANOVA"} · α = {result.alpha}</p></div><button type="button" className="ghost-action" onClick={() => download(anovaReportCsv({ ...result, notes }), "propagation-anova-report.csv", "text/csv;charset=utf-8")}>Export ANOVA report CSV</button></div>
      {result.errors.length ? <div className="anova-errors" role="alert"><strong>Test not run</strong><ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : <>
        <div className="propagation-statistics-grid">{[["F statistic", number(result.omnibus.f)], ["Numerator df", number(result.omnibus.df1, 0)], ["Denominator df", number(result.omnibus.df2, 3)], ["p-value", probability(result.omnibus.p)]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <p className="anova-conclusion">{result.omnibus.p < result.alpha ? "Reject equal group means under the model assumptions; at least one mean differs." : "Do not reject equal group means at this α. This is not proof of equality or equivalence."}</p>
        {result.method === "classical" ? <><div className="dashboard-table-wrap"><table className="anova-table"><thead><tr><th>Source</th><th>SS ((dB/cm)²)</th><th>df</th><th>MS ((dB/cm)²)</th></tr></thead><tbody><tr><td>Between groups</td><td>{number(result.omnibus.betweenSs)}</td><td>{result.omnibus.df1}</td><td>{number(result.omnibus.betweenMs)}</td></tr><tr><td>Within groups</td><td>{number(result.omnibus.withinSs)}</td><td>{result.omnibus.df2}</td><td>{number(result.omnibus.withinMs)}</td></tr><tr><td>Total</td><td>{number(result.omnibus.totalSs)}</td><td>{result.omnibus.df1 + result.omnibus.df2}</td><td>—</td></tr></tbody></table></div><p className="anova-note">η² = {number(result.omnibus.etaSquared)}; ω² = {number(result.omnibus.omegaSquared)} (negative ω² estimates truncated to zero).</p></> : <p className="anova-note">Welch uses variance-weighted group means and adjusted denominator degrees of freedom. Classical pooled SS/MS and η²/ω² are not reported as Welch effect sizes.</p>}
        <p className="anova-note"><strong>Median-centred Levene / Brown–Forsythe variance check:</strong> {result.varianceCheck ? `F = ${number(result.varianceCheck.f)}, p = ${probability(result.varianceCheck.p)}. ${result.varianceCheck.p < alpha ? "Evidence of unequal variances." : "No detected variance difference; this does not prove equal variances."}` : "Not estimable for these absolute deviations."} This is a variance diagnostic, not a normality test, and does not automatically select the ANOVA method.</p>
        <details className="anova-pairwise"><summary>Pairwise comparisons · Holm-adjusted p-values</summary><p>{result.method === "welch" ? "Two-sided Welch t-tests" : "Two-sided pooled t-tests using the ANOVA residual mean square"}, corrected together across all included group pairs using Holm. These are not Tukey tests. Mean differences are group A minus B in dB/cm.</p><div className="dashboard-table-wrap"><table className="anova-table"><thead><tr><th>Group A</th><th>Group B</th><th>Mean difference</th><th>t</th><th>df</th><th>Raw p</th><th>Holm p</th><th>At α</th></tr></thead><tbody>{result.pairs.map((pair, index) => <tr key={index}><td>{pair.a}</td><td>{pair.b}</td><td>{number(pair.difference)}</td><td>{number(pair.t)}</td><td>{number(pair.df, 3)}</td><td>{probability(pair.p)}</td><td>{probability(pair.adjustedP)}</td><td>{pair.adjustedP < alpha ? "Difference detected" : "Not detected"}</td></tr>)}</tbody></table></div></details>
      </>}
      <div className="anova-note"><h4>Interpretation limits</h4><ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
    </article> : null}
    <article className="analysis-card"><div className="anova-note"><label className="mapping-field"><span>ANOVA study notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Define the factor, groups, wafer identities, matching conditions and experimental design." /></label><p>Methods: <a href="https://www.itl.nist.gov/div898/handbook/ppc/section2/ppc231.htm" target="_blank" rel="noreferrer">NIST one-way ANOVA</a> · <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.f_oneway.html" target="_blank" rel="noreferrer">Classical and Welch ANOVA</a> · <a href="https://www.itl.nist.gov/div898/handbook/eda/section3/eda35a.htm" target="_blank" rel="noreferrer">Median-centred Levene check</a> · <a href="https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html" target="_blank" rel="noreferrer">Holm multiplicity correction</a></p></div></article>
  </section>;
}
