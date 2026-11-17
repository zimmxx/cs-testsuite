import { datasetFields, processingVerdict, reviewText } from "../lib/datasetReview";
import TestTeamApprovalField from "./TestTeamApprovalField";

export default function DatasetReviewPanel({ dataset, review, onChange }) {
  const fields = datasetFields(dataset);
  const verdict = processingVerdict(review);
  return <article className="analysis-card dataset-review-panel">
    <div className="analysis-card-head"><div><h2>Dataset parameters & review</h2><p>Post-processing fit quality. Fabrication acceptance requires the team's specification.</p></div><strong className={`review-verdict ${verdict.tone}`}>Propagation fit quality: {verdict.label}</strong></div>
    <dl className="dataset-parameter-grid">{Object.entries({ Project: dataset?.projectName || "Not loaded", Platform: fields.platform, Slot: fields.slot, Step: fields.step, BB: fields.bb, "Waveguide type": fields.waveguide }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    {verdict.total > 0 ? <p>{verdict.passed} / {verdict.total} reviewed dies passed the propagation fit criteria. Excluded dies are outside this verdict.</p> : null}
    <TestTeamApprovalField value={reviewText(dataset, "testTeamApproval")} onChange={(value) => onChange("testTeamApproval", value)} disabled={!dataset} />
    <div className="review-edit-grid">{[["stepDescription", "Step description", "e.g. Before cleaning / After cleaning"], ["testTeamComments", "Test-team comments", "Explain findings, exclusions, or follow-up actions"]].map(([field, label, placeholder]) => <label className="mapping-field" key={field}><span>{label}</span><textarea aria-label={label} value={reviewText(dataset, field)} placeholder={placeholder} disabled={!dataset} onChange={(event) => onChange(field, event.target.value)} /></label>)}</div>
    <p>Save a Dataset Snapshot to retain edits. Review the publish preview before uploading to GitHub.</p>
  </article>;
}
