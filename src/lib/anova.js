import { summarizeAcceptedPropagation } from "./propagationStatistics.js";

// Lanczos log-gamma and a continued fraction for the regularized incomplete beta.
// F upper-tail probabilities are evaluated directly to avoid 1-CDF cancellation.
function logGamma(z) {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.9999999999998099;
  z -= 1;
  for (let i = 0; i < c.length; i += 1) x += c[i] / (z + i + 1);
  const t = z + c.length - 0.5;
  return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a, b, x) {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m += 1) {
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) return h;
  }
  throw new Error("Probability calculation did not converge for these inputs.");
}

function betaRegularized(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  const value = x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a : 1 - factor * betaFraction(b, a, 1 - x) / b;
  return Math.max(0, Math.min(1, value));
}

export function fSurvival(f, df1, df2) {
  if (!(df1 > 0) || !(df2 > 0) || f < 0 || Number.isNaN(f)) return null;
  if (f === Infinity) return 0;
  if (f === 0) return 1;
  return betaRegularized(df2 / (df2 + df1 * f), df2 / 2, df1 / 2);
}

function describe(group) {
  const summary = summarizeAcceptedPropagation(group.observations.map((row) => ({ chipId: row.chipId, lossDbPerCm: row.value, passMse: true })));
  return { ...group, ...summary, variance: summary.sampleSd === null ? null : summary.sampleSd ** 2 };
}

export function classicalAnova(groups) {
  const n = groups.reduce((sum, group) => sum + group.count, 0);
  const k = groups.length;
  const grandMean = groups.reduce((sum, group) => sum + group.count * group.mean, 0) / n;
  const betweenSs = groups.reduce((sum, group) => sum + group.count * (group.mean - grandMean) ** 2, 0);
  const withinSs = groups.reduce((sum, group) => sum + (group.count - 1) * group.variance, 0);
  const df1 = k - 1; const df2 = n - k;
  const betweenMs = betweenSs / df1; const withinMs = withinSs / df2;
  const f = withinMs > 0 ? betweenMs / withinMs : null;
  const totalSs = betweenSs + withinSs;
  return { f, p: f === null ? null : fSurvival(f, df1, df2), df1, df2, grandMean, betweenSs, withinSs, totalSs, betweenMs, withinMs,
    etaSquared: totalSs > 0 ? betweenSs / totalSs : null,
    omegaSquared: totalSs + withinMs > 0 ? Math.max(0, (betweenSs - df1 * withinMs) / (totalSs + withinMs)) : null };
}

export function welchAnova(groups) {
  if (groups.some((group) => !(group.variance > 0))) return null;
  const k = groups.length;
  const weights = groups.map((group) => group.count / group.variance);
  const sumWeights = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(sumWeights)) return null;
  const weightedMean = groups.reduce((sum, group, i) => sum + weights[i] * group.mean / sumWeights, 0);
  const correction = groups.reduce((sum, group, i) => sum + (1 - weights[i] / sumWeights) ** 2 / (group.count - 1), 0);
  const numerator = groups.reduce((sum, group, i) => sum + weights[i] * (group.mean - weightedMean) ** 2, 0) / (k - 1);
  const f = numerator / (1 + 2 * (k - 2) * correction / (k ** 2 - 1));
  const df1 = k - 1; const df2 = (k ** 2 - 1) / (3 * correction);
  return { f, p: fSurvival(f, df1, df2), df1, df2, weightedMean };
}

export function holmAdjust(pValues) {
  const ordered = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const adjusted = Array(pValues.length);
  let previous = 0;
  ordered.forEach((item, rank) => { previous = Math.max(previous, Math.min(1, item.p * (pValues.length - rank))); adjusted[item.index] = previous; });
  return adjusted;
}

function pairwise(groups, method, pooled) {
  const comparisons = [];
  for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) {
    const a = groups[i]; const b = groups[j];
    const va = a.variance / a.count; const vb = b.variance / b.count;
    const se2 = method === "welch" ? va + vb : pooled.withinMs * (1 / a.count + 1 / b.count);
    const df = method === "welch" ? se2 ** 2 / (va ** 2 / (a.count - 1) + vb ** 2 / (b.count - 1)) : pooled.df2;
    const t = (a.mean - b.mean) / Math.sqrt(se2);
    comparisons.push({ a: a.label, b: b.label, difference: a.mean - b.mean, t, df, p: fSurvival(t ** 2, 1, df) });
  }
  const adjusted = holmAdjust(comparisons.map((comparison) => comparison.p));
  return comparisons.map((comparison, index) => ({ ...comparison, adjustedP: adjusted[index] }));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeAnova(inputGroups, { method = "welch", alpha = 0.05, independent = false } = {}) {
  if (!Array.isArray(inputGroups) || inputGroups.some((group) => !group || !Array.isArray(group.observations) || group.observations.some((row) => !row || typeof row !== "object"))) {
    return { groups: [], errors: ["Every group must contain an observations array of chip values."], warnings: [], method, alpha, omnibus: null, varianceCheck: null, pairs: [] };
  }
  const input = inputGroups.filter((group) => group.enabled !== false);
  const errors = []; const warnings = [];
  if (!["welch", "classical"].includes(method)) errors.push("Choose Welch or classical one-way ANOVA.");
  if (!(alpha > 0 && alpha < 1) || !Number.isFinite(alpha)) errors.push("Significance level must be between zero and one.");
  if (input.length < 2) errors.push("Include at least two groups.");
  if (input.length > 20) errors.push("Compare no more than 20 groups at once.");
  if (!independent) errors.push("Confirm that observations and groups are independent before interpreting ANOVA.");
  const labels = new Set(); const sources = new Set(); const physicalSamples = new Set();
  for (const group of input) {
    const label = String(group.label || "").trim();
    if (!label || labels.has(label)) errors.push("Give every group a distinct, nonempty label.");
    labels.add(label);
    if (!Array.isArray(group.observations) || group.observations.length < 2) errors.push(`${group.label}: at least two chip observations are required.`);
    if ((group.observations || []).some((row) => typeof row.value !== "number" || !Number.isFinite(row.value))) errors.push(`${group.label}: every observation must be a finite number.`);
    const ids = (group.observations || []).map((row) => row.chipId);
    if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) errors.push(`${group.label}: chip IDs must be nonempty and unique within the group.`);
    if (group.sourceKey && sources.has(group.sourceKey)) errors.push("The same dataset has been included more than once.");
    if (group.sourceKey) sources.add(group.sourceKey);
    for (const row of group.observations || []) if (group.cohortId) {
      const key = JSON.stringify([group.cohortId, row.chipId]);
      if (physicalSamples.has(key)) errors.push("The same chip on the same identified wafer appears in multiple groups. Use a paired/repeated-measures analysis, not independent-groups ANOVA.");
      physicalSamples.add(key);
    }
  }
  if (errors.some((error) => /finite number|chip IDs/.test(error))) return { groups: [], errors: [...new Set(errors)], warnings, method, alpha, omnibus: null, varianceCheck: null, pairs: [] };
  const groups = input.filter((group) => Array.isArray(group.observations)).map(describe);
  if (groups.some((group) => group.mean !== null && !Number.isFinite(group.mean) || group.variance !== null && !Number.isFinite(group.variance))) errors.push("The magnitude of the observations exceeds numerical limits.");
  if (groups.some((group) => group.count < 5)) warnings.push("Some groups have fewer than five chips; distribution assumptions and low power need particular care.");
  warnings.push("The test compares selected passing chip fits. MSE filtering can introduce selection bias; findings do not automatically generalize to rejected or unmeasured chips.");
  warnings.push("Check residual distributions and outliers. Welch allows unequal variances, but does not remove independence or distribution assumptions. Spatially correlated chips or repeated measurements need a different model.");
  if (errors.length) return { groups, errors: [...new Set(errors)], warnings, method, alpha, omnibus: null, varianceCheck: null, pairs: [] };
  const pooled = classicalAnova(groups);
  const omnibus = method === "classical" ? pooled : welchAnova(groups);
  if (!omnibus || omnibus.f === null || !Number.isFinite(omnibus.f) || omnibus.p === null || !Number.isFinite(omnibus.p)) {
    errors.push(method === "welch" ? "Welch ANOVA needs strictly positive sample variance in every group. Inspect constant or rounded groups; no p-value is reported." : "Within-group variance is zero or the test is not numerically estimable. No p-value is reported.");
    return { groups, errors, warnings, method, alpha, omnibus: null, varianceCheck: null, pairs: [] };
  }
  const deviations = groups.map((group) => {
    const centre = median(group.observations.map((row) => row.value));
    return describe({ ...group, observations: group.observations.map((row) => ({ ...row, value: Math.abs(row.value - centre) })) });
  });
  const varianceCheck = classicalAnova(deviations);
  return { groups, errors, warnings, method, alpha, omnibus, varianceCheck: varianceCheck.f === null ? null : varianceCheck, pairs: pairwise(groups, method, pooled) };
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false; let closed = false;
  const source = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i <= source.length; i += 1) {
    const c = source[i];
    if (c === '"') { if (quoted && source[i + 1] === '"') { field += '"'; i += 1; } else if (!closed && (!field || quoted)) { closed = quoted; quoted = !quoted; } else throw new Error("Unexpected quote in CSV field."); }
    else if ((c === "," || c === "\n" || c === undefined) && !quoted) { row.push(field.trim()); field = ""; closed = false; if (c !== ",") { if (row.some(Boolean)) rows.push(row); row = []; } }
    else if (closed && c !== undefined && !/\s/.test(c)) throw new Error("Unexpected text after a quoted CSV field.");
    else if (c !== undefined) field += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  return rows;
}

export function parseAnovaCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((field) => field.toLowerCase());
  const required = ["group", "chip_id", "loss_db_per_cm"];
  if (!header || required.some((field) => !header.includes(field)) || new Set(header).size !== header.length) throw new Error("CSV must have unique group, chip_id, loss_db_per_cm headers. Optional wafer_id identifies repeated chips across groups.");
  const groups = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; const get = (field) => row[header.indexOf(field)] || "";
    const label = get("group"); const chipId = get("chip_id"); const rawValue = get("loss_db_per_cm"); const waferId = get("wafer_id");
    if (row.length !== header.length || !label || !chipId || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(rawValue) || !Number.isFinite(Number(rawValue))) throw new Error(`CSV data row ${index + 1}: supply a group, chip ID and finite numeric propagation loss in dB/cm.`);
    if (!groups.has(label)) groups.set(label, { label, observations: [], cohortId: waferId || null, source: "Grouped chip CSV (user-supplied inclusion)" });
    const group = groups.get(label);
    if (group.cohortId !== (waferId || null)) throw new Error(`${label}: use a consistent wafer_id within a group.`);
    if (group.observations.some((item) => item.chipId === chipId)) throw new Error(`${label}: chip ${chipId} is repeated; one independent chip value is required per row.`);
    group.observations.push({ chipId, value: Number(rawValue) });
  }
  if (!groups.size) throw new Error("CSV contains no chip observations.");
  return [...groups.values()];
}

export function parseAnovaProject(text) {
  const project = JSON.parse(text);
  if (project?.kind !== "cornerstone-propagation-anova" || project.schemaVersion !== 1 || project.unit !== "dB/cm" || !Array.isArray(project.groups) || project.groups.length > 20) throw new Error("Select a valid propagation ANOVA JSON project in dB/cm.");
  const groups = project.groups.map((group) => {
    if (!group || typeof group.label !== "string" || !Array.isArray(group.observations)
      || group.observations.some((row) => !row || typeof row.chipId !== "string" || !row.chipId.trim() || typeof row.value !== "number" || !Number.isFinite(row.value))
      || new Set(group.observations.map((row) => row.chipId)).size !== group.observations.length) throw new Error("Each project group needs a text label, finite chip values and unique, nonempty chip IDs, including disabled groups.");
    for (const key of ["source", "sourceKey", "cohortId", "waferLabel"]) if (group[key] != null && typeof group[key] !== "string") throw new Error(`Invalid group ${key}.`);
    if (group.context != null && (typeof group.context !== "object" || Array.isArray(group.context))) throw new Error("Invalid processing context.");
    return { label: group.label, observations: group.observations.map(({ chipId, value }) => ({ chipId, value })), enabled: group.enabled !== false,
      source: group.source || "Imported ANOVA project", sourceKey: group.sourceKey || null, cohortId: group.cohortId || null, waferLabel: group.waferLabel || "", context: group.context || null };
  });
  return { groups, method: project.method === "classical" ? "classical" : "welch", alpha: [0.01, 0.05, 0.1].includes(project.alpha) ? project.alpha : 0.05, notes: typeof project.notes === "string" ? project.notes : "" };
}

export function anovaReportCsv(result) {
  const rows = [["Section", "Group / term", "Statistic", "Value", "Unit"]];
  const add = (section, label, key, value, unit = "") => rows.push([section, label, key, value ?? "", unit]);
  add("Settings", "ANOVA", "Method", result.method); add("Settings", "ANOVA", "Alpha", result.alpha);
  add("Settings", "ANOVA", "Independence acknowledged", result.independent === true);
  add("Settings", "ANOVA", "Study notes", result.notes || "");
  add("Settings", "ANOVA", "Hypothesis", "All included group population means are equal");
  for (const group of result.groups) {
    for (const key of ["count", "mean", "sampleSd", "sem", "lower95", "upper95"]) add("Group", group.label, key, group[key], key === "count" ? "chips" : "dB/cm");
    add("Group", group.label, "Source", group.source || ""); add("Group", group.label, "Cohort / wafer", group.cohortId || "unknown");
    add("Group", group.label, "Processing context", group.context ? JSON.stringify(group.context) : "User-supplied chip values");
    for (const row of group.observations) add("Observation", group.label, row.chipId, row.value, "dB/cm");
  }
  if (result.omnibus) for (const [key, value] of Object.entries(result.omnibus)) add("Omnibus", "ANOVA", key, value);
  if (result.varianceCheck) for (const key of ["f", "df1", "df2", "p"]) add("Variance check", "Median-centred Levene / Brown-Forsythe", key, result.varianceCheck[key]);
  for (const pair of result.pairs) for (const key of ["difference", "t", "df", "p", "adjustedP"]) add("Pairwise", `${pair.a} minus ${pair.b}`, key, pair[key], key === "difference" ? "dB/cm" : "");
  add("Settings", "Pairwise", "Multiplicity correction", "Holm across all included group pairs");
  for (const error of result.errors) add("Validation", "ANOVA", "Not run", error);
  for (const warning of result.warnings) add("Caveat", "ANOVA", "Review", warning);
  return rows.map((row) => row.map((value) => { const text = String(value); return `"${(/^[=+@-]/.test(text) && typeof value === "string" ? "'" : "") + text.replace(/"/g, '""')}"`; }).join(",")).join("\n");
}
