import { normalizeTestTeamApproval, TEST_TEAM_APPROVAL_OPTIONS, testTeamApproval } from "../lib/datasetReview";

export default function TestTeamApprovalField({ value, onChange, disabled = false }) {
  const approval = testTeamApproval({ testTeamApproval: value });
  return <div className="test-team-approval-field">
    <label className="mapping-field"><span>Measurement acceptance</span><select aria-label="Measurement acceptance" value={normalizeTestTeamApproval(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{TEST_TEAM_APPROVAL_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
    <strong className={`review-verdict ${approval.tone}`}>{approval.label}</strong>
    <p>Set by the test team after reviewing all applicable measurement results and acceptance criteria. Record conditions or reasons in Test-team comments.</p>
  </div>;
}
