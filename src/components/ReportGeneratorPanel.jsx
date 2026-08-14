export default function ReportGeneratorPanel({
  reportState,
  sourceMeta,
  isGeneratingPptReport,
  isGeneratingWordReport,
  isGeneratingPdfReport,
  isGeneratingPostProcessed,
  onGeneratePptReport,
  onGenerateWordReport,
  onGeneratePdfReport,
  onGeneratePostProcessedFiles
}) {
  return (
    <section className="library-stack">
      <article className="analysis-card report-generator-card">
        <div className="analysis-card-head">
          <div>
            <h2>Report Generator</h2>
            <p>Generate a one-section PowerPoint deck with overview slides, a chip summary table, wafermaps, and one detailed slide for every measured chip.</p>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={onGeneratePptReport} disabled={isGeneratingPptReport}>
              {isGeneratingPptReport ? "Generating PPT..." : "Generate Section PPT"}
            </button>
            <button type="button" className="ghost-action" onClick={onGenerateWordReport} disabled={isGeneratingWordReport}>
              {isGeneratingWordReport ? "Generating Word..." : "Generate Word"}
            </button>
            <button type="button" className="ghost-action" onClick={onGeneratePdfReport} disabled={isGeneratingPdfReport}>
              {isGeneratingPdfReport ? "Generating PDF..." : "Generate PDF"}
            </button>
          </div>
        </div>

        <div className="translator-metrics report-generator-summary-grid">
          <div><strong>{reportState.matlabSummary.measuredChips}</strong><span>Measured chips</span></div>
          <div><strong>{reportState.matlabSummary.fittedChips}</strong><span>Passing chips</span></div>
          <div><strong>{reportState.matlabSummary.failedFits}</strong><span>Fits above MSE threshold</span></div>
          <div><strong>{reportState.matlabSummary.avgPropagationLossDbPerCm !== null && reportState.matlabSummary.avgPropagationLossDbPerCm !== undefined ? `${reportState.matlabSummary.avgPropagationLossDbPerCm.toFixed(2)} dB/cm` : "--"}</strong><span>Average propagation loss</span></div>
        </div>

        <div className="report-generator-note-grid">
          <div className="report-preview-note-card">
            <small>PPT contents</small>
            <ul>
              <li>Overview KPIs and the active propagation-analysis settings</li>
              <li>A chip table with location, propagation loss, MSE, peak wavelength, insertion loss, and bandwidth</li>
              <li>Wafermaps for chip IDs and wafer-level metrics</li>
              <li>One detailed slide per measured chip with propagation fit, transmission spectrum, and loss spectrum plots</li>
              <li>Matching Word and PDF exports use the same post-processed metrics and wafermaps</li>
            </ul>
          </div>
          <div className="report-preview-note-card">
            <small>Current analysis settings</small>
            <strong>{sourceMeta.propagationTargetWavelengthNm} nm target wavelength</strong>
            <span>Window: +/- {sourceMeta.propagationWindowNm} nm</span>
            <span>Spectral step: {sourceMeta.propagationSpectralStepNm} nm</span>
            <span>MSE threshold: {sourceMeta.propagationMseThreshold}</span>
          </div>
        </div>
      </article>

      <article className="analysis-card report-generator-card">
        <div className="analysis-card-head">
          <div>
            <h2>Post-Processed Package</h2>
            <p>Download the PNG plots, wafermaps, JSON, and Excel outputs alongside the new PowerPoint workflow.</p>
          </div>
          <div className="library-action-row">
            <button type="button" className="ghost-action" onClick={onGeneratePostProcessedFiles} disabled={isGeneratingPostProcessed}>
              {isGeneratingPostProcessed ? "Packaging Files..." : "Generate Post-Processed Files"}
            </button>
          </div>
        </div>
        <div className="chart-empty compact report-generator-helper">
          The PowerPoint export is built on the same post-processed metrics, so both outputs stay aligned.
        </div>
      </article>
    </section>
  );
}
