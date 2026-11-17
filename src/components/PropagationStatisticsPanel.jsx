import { useMemo } from "react";
import { PlotlyFigure } from "./InteractivePlots";
import { propagationStatisticsCsv, summarizeAcceptedPropagation } from "../lib/propagationStatistics";

const format = (value) => value == null ? "—" : value.toFixed(3);
const CONFIG = { responsive: true, displaylogo: false, scrollZoom: true };

export default function PropagationStatisticsPanel({ chips, includedChipIds }) {
  const summary = useMemo(() => summarizeAcceptedPropagation(chips, includedChipIds), [chips, includedChipIds]);
  const data = useMemo(() => {
    if (!summary.count) return [];
    return [
      { type: "scatter", mode: "markers", name: "Accepted chip values", x: summary.chips.map((chip) => chip.lossDbPerCm), y: summary.chips.map((_, index) => ((index % 9) - 4) * 0.035), text: summary.chips.map((chip) => chip.chipId), marker: { size: 7, color: "#4f8df3", opacity: 0.75 }, hovertemplate: "%{text}<br>%{x:.3f} dB/cm<extra></extra>" },
      { type: "scatter", mode: "markers", name: "Mean ± 95% CI", x: [summary.mean], y: [0.7], marker: { size: 12, color: "#0f8a83", symbol: "diamond" }, error_x: { type: "data", array: summary.halfWidth95 === null ? [] : [summary.halfWidth95], visible: summary.halfWidth95 !== null, color: "#0f8a83", thickness: 3, width: 8 }, hovertemplate: `Mean: %{x:.3f} dB/cm<br>${summary.halfWidth95 === null ? "95% CI needs at least two chips" : `95% CI: ${format(summary.lower95)} to ${format(summary.upper95)} dB/cm`}<extra></extra>` }
    ];
  }, [summary]);
  const layout = useMemo(() => ({ margin: { l: 130, r: 24, t: 20, b: 58 }, height: 260, showlegend: false, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "#fbfcfc", xaxis: { title: "Propagation loss (dB/cm)", zeroline: false, gridcolor: "#e3ecef" }, yaxis: { range: [-0.3, 1], tickvals: [0, 0.7], ticktext: ["Chip values", "Mean ± 95% CI"], fixedrange: true, zeroline: false, showgrid: false }, font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" } }), []);
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([propagationStatisticsCsv(summary)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "propagation-accepted-chip-statistics.csv"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article className="analysis-card propagation-statistics-card">
    <div className="analysis-card-head"><div><h2>Accepted-chip propagation statistics</h2><p>Uses chips included in Chip Summary Table that pass the current MSE criteria and have a finite propagation-loss result. This is fit acceptance, not fabrication approval.</p></div><button type="button" className="ghost-action" disabled={!summary.count} onClick={exportCsv}>Export propagation statistics CSV</button></div>
    <div className="propagation-statistics-grid">
      {[["Accepted chips", summary.count], ["Mean (dB/cm)", format(summary.mean)], ["Sample SD (dB/cm)", format(summary.sampleSd)], ["SEM (dB/cm)", format(summary.sem)], ["95% CI (dB/cm)", summary.lower95 === null ? "—" : `${format(summary.lower95)} to ${format(summary.upper95)}`]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    <details className="propagation-statistics-details" onToggle={(event) => { if (event.currentTarget.open) window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); }}><summary>Show chip distribution & mean error bar</summary>
      <PlotlyFigure data={data} layout={layout} config={CONFIG} height={260} emptyMessage="No included chips currently pass the propagation fit criteria." windowTitle="Accepted-chip propagation statistics" />
      <p>SD describes chip-to-chip spread; the error bar shows the 95% confidence interval of the mean (Student’s t), assuming independent, representative chip measurements. Spatial correlation can make that interval too narrow. It is not an uncertainty estimate for each chip’s fit or the instrument.</p>
      <p>{summary.count < 2 ? "At least two accepted chips are required for sample SD, SEM and a confidence interval." : `Observed range: ${format(summary.min)} to ${format(summary.max)} dB/cm. n = ${summary.count}; degrees of freedom = ${summary.degreesOfFreedom}.`}</p>
    </details>
  </article>;
}
