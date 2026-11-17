// Keys retain the measured chip and waveguide identities; exclusions never renumber routes.
export function normalizeWaveguideExclusions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([, ids]) => Array.isArray(ids))
    .map(([chipId, ids]) => [chipId, [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))]])
    .filter(([, ids]) => ids.length));
}

export function propagationWaveguideId(row) {
  return String(row.waveguide_id || `L${row.relative_length_mm ?? "NA"}`);
}
