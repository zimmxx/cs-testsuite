// Two-sided 95% Student's t critical values, degrees of freedom 1–30.
const T95 = [null, 12.706204736, 4.30265273, 3.182446305, 2.776445105, 2.570581836, 2.446911851, 2.364624252, 2.306004135, 2.262157163, 2.228138852, 2.20098516, 2.17881283, 2.160368656, 2.144786688, 2.131449546, 2.119905299, 2.109815578, 2.10092204, 2.093024054, 2.085963447, 2.079613845, 2.073873068, 2.06865761, 2.063898562, 2.059538553, 2.055529439, 2.051830516, 2.048407142, 2.045229642, 2.042272456];

export function tCritical95(df) {
  if (!Number.isInteger(df) || df < 1) return null;
  if (df <= 30) return T95[df];
  // Cornish–Fisher expansion through 1/df^4; accurate to < 1e-6 for df > 30.
  const z = 1.959963984540054;
  return z + (z ** 3 + z) / (4 * df)
    + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2)
    + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3)
    + (79 * z ** 9 + 776 * z ** 7 + 1482 * z ** 5 - 1920 * z ** 3 - 945 * z) / (92160 * df ** 4);
}

export function summarizeAcceptedPropagation(chips = [], includedChipIds = null) {
  const included = includedChipIds == null ? null : new Set(includedChipIds.map(String));
  const accepted = chips.filter((chip) => (!included || included.has(String(chip.chipId))) && chip.passMse === true && typeof chip.lossDbPerCm === "number" && Number.isFinite(chip.lossDbPerCm));
  const count = accepted.length;
  const values = accepted.map((chip) => chip.lossDbPerCm);
  const mean = count ? values.reduce((sum, value) => sum + value, 0) / count : null;
  const sampleSd = count > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1)) : null;
  const sem = sampleSd === null ? null : sampleSd / Math.sqrt(count);
  const halfWidth95 = sem === null ? null : tCritical95(count - 1) * sem;
  return {
    count, mean, sampleSd, sem,
    confidenceLevel: 0.95, degreesOfFreedom: count > 1 ? count - 1 : null,
    halfWidth95, lower95: halfWidth95 === null ? null : mean - halfWidth95, upper95: halfWidth95 === null ? null : mean + halfWidth95,
    min: count ? values.reduce((a, b) => Math.min(a, b)) : null,
    max: count ? values.reduce((a, b) => Math.max(a, b)) : null,
    chips: accepted.map((chip) => ({ chipId: String(chip.chipId), lossDbPerCm: chip.lossDbPerCm })),
    rule: "Included chips passing propagation MSE criteria with finite loss values",
    method: "Arithmetic mean; sample SD (n-1); SEM=SD/sqrt(n); two-sided Student's t 95% CI"
  };
}

export function propagationStatisticsCsv(summary) {
  const metrics = [
    ["Accepted chip count", summary.count, "chips"], ["Mean propagation loss", summary.mean, "dB/cm"],
    ["Sample standard deviation", summary.sampleSd, "dB/cm"], ["Standard error of mean", summary.sem, "dB/cm"],
    ["95% CI lower", summary.lower95, "dB/cm"], ["95% CI upper", summary.upper95, "dB/cm"],
    ["Minimum", summary.min, "dB/cm"], ["Maximum", summary.max, "dB/cm"],
    ["Inclusion rule", summary.rule, ""], ["Method", summary.method, ""],
    ["Assumption", "CI assumes independent representative chip measurements; not per-chip fit or instrument uncertainty", ""],
    ...summary.chips.map((chip) => [`Accepted ${chip.chipId}`, chip.lossDbPerCm, "dB/cm"])
  ];
  return [["Statistic", "Value", "Unit"], ...metrics].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}
