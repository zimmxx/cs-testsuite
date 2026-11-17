// A processing verdict describes fit quality, not fabrication acceptance.
export const TEST_TEAM_APPROVAL_OPTIONS = ["Awaiting review", "Accepted", "Accepted with conditions", "Rejected"];

export function normalizeTestTeamApproval(value) {
  const legacy = { "Not assessed": "Awaiting review", Pass: "Accepted", "Pass with issues": "Accepted with conditions", Fail: "Rejected" };
  return TEST_TEAM_APPROVAL_OPTIONS.includes(value) ? value : legacy[value] || "Awaiting review";
}

export function testTeamApproval(dataset) {
  const label = normalizeTestTeamApproval(reviewText(dataset, "testTeamApproval"));
  return { label, tone: label === "Accepted" ? "pass" : label === "Rejected" ? "fail" : label === "Accepted with conditions" ? "issues" : "pending" };
}

export function datasetFields(dataset = {}) {
  dataset = dataset || {};
  const d = dataset.display || {};
  const text = dataset.label || d.label || dataset.sourceMeta?.name || "";
  return {
    platform: dataset.platformLabel || d.platformLabel || dataset.platformDisplayName || text.match(/SOI\d+nm(?:Passive|Active)?|SiN\d+nm/i)?.[0] || "Unknown",
    slot: dataset.slot || d.slot || text.match(/Slot\d+/i)?.[0] || "Unknown",
    step: dataset.processStep || d.processStep || text.match(/Step(?:\d+[A-Z]?|XX)/i)?.[0] || "StepXX",
    bb: dataset.buildingBlockLabel || d.buildingBlockLabel || text.match(/(?:RIB|STRIP)_(?:Waveguide_Crossing|Grating_Coupler|2x[12]_MMI|Waveguide|Spiral)/i)?.[0] || "Unknown",
    waveguide: (dataset.buildingBlockLabel || d.buildingBlockLabel || text).match(/RIB|STRIP/i)?.[0] || dataset.waveguideType || d.waveguideFamily || "Unknown"
  };
}

export function reviewText(dataset, field) {
  return dataset?.namingOverrides?.[field] ?? dataset?.[field] ?? dataset?.display?.[field] ?? dataset?.sourceMeta?.[field] ?? "";
}

export function processingVerdict(review) {
  const total = Number(review?.selectedChipCount || review?.measuredChips) || 0;
  const passed = Number(review?.fittedChips) || 0;
  if (!total || !review || review.fittedChips == null) return { label: "Not evaluated", tone: "pending", total: 0, passed: 0 };
  return { label: passed === total ? "Meets fit criteria" : "Needs fit review", tone: passed === total ? "pass" : "issues", total, passed };
}
