export const DEFAULT_ELECTRICAL_VIEW = {
  scope: "chip", comparisonKeys: [], graphs: { iv: true, resistance: false, power: true, residuals: false },
  showFit: true, showMarkers: false, fitRangeOnly: false,
  showMap: false, showDetails: false, expandedColumns: false
};

export function normalizeElectricalView(value = {}) {
  const defaults = DEFAULT_ELECTRICAL_VIEW;
  return {
    scope: ["device", "chip", "custom", "run"].includes(value?.scope) ? value.scope : defaults.scope,
    comparisonKeys: Array.isArray(value?.comparisonKeys) ? [...new Set(value.comparisonKeys.filter((key) => typeof key === "string"))] : [],
    graphs: Object.fromEntries(Object.entries(defaults.graphs).map(([key, fallback]) => [key, typeof value?.graphs?.[key] === "boolean" ? value.graphs[key] : fallback])),
    ...Object.fromEntries(["showFit", "showMarkers", "fitRangeOnly", "showMap", "showDetails", "expandedColumns"].map((key) => [key, typeof value?.[key] === "boolean" ? value[key] : defaults[key]]))
  };
}

export function filterElectricalDevices(analyses, { search = "", deviceId = "all", review = "all" } = {}) {
  const terms = search.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
  return analyses.filter((trace) => {
    const identity = `${trace.chipId} ${trace.deviceId} ${trace.fileName}`.toLowerCase();
    const matchesSearch = !terms.length || terms.some((term) => /^\d+$/.test(term) ? trace.chipId.toLowerCase() === `chip${Number(term)}` : identity.includes(term));
    return matchesSearch && (deviceId === "all" || trace.deviceId === deviceId)
      && (review === "all" || (review === "unavailable" ? trace.fit?.resistanceOhm == null : review === "flagged" ? trace.warnings.length > 0 : trace.warnings.length === 0));
  }).sort((a, b) => a.chipId.localeCompare(b.chipId, undefined, { numeric: true }) || a.deviceId.localeCompare(b.deviceId, undefined, { numeric: true }));
}

export function selectElectricalCurves(analyses, { scope, comparisonKeys }, selected) {
  if (!selected) return [];
  if (scope === "device") return [selected];
  if (scope === "chip") return analyses.filter((trace) => trace.chipId === selected.chipId);
  if (scope === "custom") {
    const keys = new Set(comparisonKeys);
    return analyses.filter((trace) => keys.has(trace.key));
  }
  return analyses;
}
