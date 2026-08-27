import { useMemo, useState } from "react";
import {
  buildAiEvidencePayload,
  buildBatchComparison,
  buildWaferDiagnostics,
  requestAiInterpretation
} from "../lib/aiDiagnostics";

const SUGGESTED_QUESTIONS = [
  "Summarise the failed chips and prioritise what I should inspect first.",
  "Explain the spectral anomalies without overstating the fabrication root cause.",
  "Compare the selected MPW batches and highlight meaningful process shifts.",
  "Suggest repeat measurements that would separate setup issues from cleanroom variation."
];

function formatMetric(value, digits = 2, suffix = "") {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? "--" : `${Number(value).toFixed(digits)}${suffix}`;
}

function StatusPill({ severity, children }) {
  return <span className={`ai-status-pill ${severity}`}>{children}</span>;
}

export default function AiDiagnosticsPanel({
  datasetLabel,
  propagationMetrics,
  remoteDatasets = [],
  onAnalyzeRemoteDataset
}) {
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-3.1-flash-lite");
  const [question, setQuestion] = useState(SUGGESTED_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [saveToEvaluationLog, setSaveToEvaluationLog] = useState(true);
  const [requestStatus, setRequestStatus] = useState("Ready. Local diagnostics run without an AI API key.");
  const [isRequesting, setIsRequesting] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  const diagnostics = useMemo(() => buildWaferDiagnostics(propagationMetrics), [propagationMetrics]);
  const batchComparison = useMemo(() => buildBatchComparison(batchResults), [batchResults]);

  function toggleBatch(id) {
    setSelectedBatchIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  }

  async function compareBatches() {
    if (selectedBatchIds.length < 2) return;
    setIsComparing(true);
    setRequestStatus(`Preparing ${selectedBatchIds.length} GitHub-library datasets for comparison...`);
    try {
      const selected = remoteDatasets.filter((dataset) => selectedBatchIds.includes(dataset.id));
      const prepared = await Promise.all(selected.map(async (dataset) => {
        const existing = dataset.analyticsSummary || {};
        const hasSummary = existing.propagationAverage !== null && existing.propagationAverage !== undefined
          && existing.yield !== null && existing.yield !== undefined;
        if (hasSummary || !onAnalyzeRemoteDataset) return dataset;
        const analyticsSummary = await onAnalyzeRemoteDataset(dataset);
        return { ...dataset, analyticsSummary };
      }));
      setBatchResults(prepared);
      setRequestStatus(`Compared ${prepared.length} MPW datasets. Gemini can now interpret the compact comparison evidence.`);
    } catch (error) {
      setRequestStatus(error instanceof Error ? error.message : "Unable to prepare the selected datasets.");
    } finally {
      setIsComparing(false);
    }
  }

  async function askAi() {
    if (!diagnostics.measuredChipCount && !batchResults.length) {
      setRequestStatus("Load a wafer dataset or compare at least two MPW batches before asking the AI.");
      return;
    }
    setIsRequesting(true);
    setAnswer("");
    setRequestStatus(`Sending compact diagnostic evidence to ${provider === "gemini" ? "Gemini" : provider}...`);
    try {
      const payload = buildAiEvidencePayload({ datasetLabel, diagnostics, batchComparison, question });
      const result = await requestAiInterpretation({
        provider,
        model,
        payload,
        storeAnalysis: saveToEvaluationLog
      });
      setAnswer(result.text);
      setRequestStatus(result.stored
        ? "AI interpretation complete and saved to Gemini logs for evaluation. Verify every proposed cause against measurement and process evidence."
        : "AI interpretation complete without saving it to Gemini logs. Verify every proposed cause against measurement and process evidence.");
    } catch (error) {
      setRequestStatus(error instanceof Error ? error.message : "The AI interpretation request failed.");
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <section className="library-stack ai-diagnostics-page">
      <article className="analysis-card ai-diagnostics-hero">
        <div className="analysis-card-head">
          <div>
            <span className="ai-eyebrow">Evidence-led wafer screening</span>
            <h2>AI Diagnostics</h2>
            <p>Screen failed fits and transmission spectra locally, compare MPW batches, then use an interchangeable AI provider to interpret the evidence.</p>
          </div>
          <div className="ai-provider-controls">
            <label>
              <span>Provider</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                <option value="gemini">Gemini (default)</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (fast)</option>
                <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (lowest output)</option>
                <option value="gemini-3.6-flash">Gemini 3.6 Flash (balanced)</option>
                <option value="gemini-3.7-flash">Gemini 3.7 Flash (slower)</option>
              </select>
            </label>
          </div>
        </div>
        <div className="ai-safety-note">
          <strong>Engineering safeguard</strong>
          <span>Sidewall roughness and other cleanroom causes are hypotheses, not diagnoses. Confirm them with repeat sweeps, reference structures, CD-SEM/process data, and cross-wafer consistency.</span>
        </div>
      </article>

      <div className="ai-summary-grid">
        <article><span>Measured chips</span><strong>{diagnostics.measuredChipCount}</strong><small>{datasetLabel || "No dataset loaded"}</small></article>
        <article><span>Failed fits</span><strong>{diagnostics.failedChipCount}</strong><small>Above the configured MSE criterion</small></article>
        <article><span>Flagged chips</span><strong>{diagnostics.anomalousChipCount}</strong><small>Ripple or discontinuity indicators</small></article>
        <article><span>Spectra screened</span><strong>{diagnostics.screenedTraceCount}</strong><small>{diagnostics.flaggedTraceCount} flagged traces</small></article>
      </div>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>Chip triage</h2>
            <p>Deterministic screening results. These remain available even when Gemini is not configured.</p>
          </div>
        </div>
        <div className="dashboard-table-wrap">
          <table>
            <thead><tr><th>Chip</th><th>Fit</th><th>MSE</th><th>Propagation loss</th><th>Flagged traces</th><th>Screening result</th></tr></thead>
            <tbody>
              {diagnostics.chips.length ? diagnostics.chips.map((chip) => (
                <tr key={`ai-chip-${chip.chipId}`}>
                  <td><strong>{chip.chipId}</strong><div className="dataset-subcopy">({chip.dieX ?? "--"}, {chip.dieY ?? "--"})</div></td>
                  <td><StatusPill severity={chip.failedFit ? "medium" : "clear"}>{chip.failedFit ? "Failed" : "Passed"}</StatusPill></td>
                  <td>{formatMetric(chip.mse, 4)} / {formatMetric(chip.mseThreshold, 4)}</td>
                  <td>{formatMetric(chip.lossDbPerCm, 2, " dB/cm")}</td>
                  <td>{chip.flaggedTraceCount} / {chip.traceCount}</td>
                  <td>
                    <StatusPill severity={chip.severity}>{chip.severity === "clear" ? "No threshold exceeded" : `${chip.severity} priority`}</StatusPill>
                    {chip.hypotheses.length ? <div className="ai-hypothesis-list">{chip.hypotheses.map((item) => <span key={`${chip.chipId}-${item.label}`} title={item.detail}>{item.label}</span>)}</div> : null}
                  </td>
                </tr>
              )) : <tr><td colSpan="6"><div className="chart-empty compact">Load a propagation dataset to screen chip fits and transmission spectra.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>MPW batch comparison</h2>
            <p>Select GitHub-library datasets. Existing reviewed analytics are reused; missing summaries are calculated from their bundled traces.</p>
          </div>
          <button type="button" onClick={compareBatches} disabled={isComparing || selectedBatchIds.length < 2}>{isComparing ? "Comparing..." : "Compare selected"}</button>
        </div>
        <div className="ai-batch-selector">
          {remoteDatasets.map((dataset) => (
            <label key={`ai-batch-${dataset.id}`} className={selectedBatchIds.includes(dataset.id) ? "selected" : ""}>
              <input type="checkbox" checked={selectedBatchIds.includes(dataset.id)} onChange={() => toggleBatch(dataset.id)} />
              <span><strong>{dataset.label || dataset.projectName}</strong><small>{dataset.mpw || dataset.projectName || "MPW undefined"} · {dataset.slot || dataset.waferName || "Slot undefined"}</small></span>
            </label>
          ))}
        </div>
        {batchComparison.rows.length ? (
          <div className="dashboard-table-wrap ai-batch-results">
            <table>
              <thead><tr><th>Dataset</th><th>Average propagation</th><th>Δ vs reference</th><th>Yield</th><th>Δ yield</th><th>Measured chips</th></tr></thead>
              <tbody>{batchComparison.rows.map((row) => (
                <tr key={`ai-comparison-${row.id}`}>
                  <td>
                    <strong>{row.mpw} · {row.slot}</strong>
                    <div className="dataset-subcopy ai-dataset-name">{row.label}</div>
                    {row.id === batchComparison.referenceId ? <div className="dataset-subcopy">Reference</div> : null}
                  </td>
                  <td>{formatMetric(row.propagationAverage, 2, " dB/cm")}</td>
                  <td>{formatMetric(row.propagationDelta, 2, " dB/cm")}</td>
                  <td>{formatMetric(row.yield, 1, "%")}</td>
                  <td>{formatMetric(row.yieldDelta, 1, " pp")}</td>
                  <td>{formatMetric(row.measuredChips, 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </article>

      <article className="analysis-card ai-copilot-card">
        <div className="analysis-card-head">
          <div>
            <h2>Ask the diagnostics copilot</h2>
            <p>Only compact metrics and flagged evidence are sent—never the complete raw spectra.</p>
          </div>
        </div>
        <div className="ai-question-presets">
          {SUGGESTED_QUESTIONS.map((item, index) => <button key={item} type="button" className={question === item ? "active" : "ghost-action"} onClick={() => setQuestion(item)}>{index + 1}</button>)}
        </div>
        <label className="ai-question-field">
          <span>Engineering question</span>
          <textarea rows="4" value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <label className="ai-log-toggle">
          <input
            type="checkbox"
            checked={saveToEvaluationLog}
            onChange={(event) => setSaveToEvaluationLog(event.target.checked)}
          />
          <span>
            <strong>Save to Gemini logs for evaluation</strong>
            <small>Checked by default. The prompt and answer can be reviewed and added to an AI Studio dataset later.</small>
          </span>
        </label>
        <div className="library-action-row">
          <button type="button" onClick={askAi} disabled={isRequesting || !question.trim()}>{isRequesting ? "Analysing..." : "Interpret with Gemini"}</button>
          <span className="ai-request-status" role="status">{requestStatus}</span>
        </div>
        {answer ? <div className="ai-answer"><strong>Gemini interpretation</strong><div>{answer}</div></div> : null}
      </article>
    </section>
  );
}
