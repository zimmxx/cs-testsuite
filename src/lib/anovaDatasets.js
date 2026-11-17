import { buildNormalizedRows } from "./parsers.js";
import { computePropagationLoss } from "./analysis.js";
import { normalizeDatasetAnalyticsReview } from "./githubLibrary.js";
import { summarizeAcceptedPropagation } from "./propagationStatistics.js";

function identity(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

export function propagationAnovaGroup(dataset, analysis) {
  const review = normalizeDatasetAnalyticsReview(analysis.analyticsReview || dataset.analyticsReview);
  const chips = analysis.propagation?.byChip || [];
  const excluded = new Set(review.excludedChipIds);
  const included = chips.filter((chip) => !excluded.has(String(chip.chipId))).map((chip) => String(chip.chipId));
  const summary = summarizeAcceptedPropagation(chips, included);
  if (!summary.count) throw new Error("This dataset has no included chips passing its propagation fit criteria.");
  const project = dataset.projectName || dataset.mpw || "";
  const wafer = dataset.slot || dataset.waferName || "";
  const known = project && wafer && !/undefined|unknown/i.test(`${project} ${wafer}`);
  return {
    label: dataset.label || `${project} ${wafer}`.trim() || "Propagation dataset",
    sourceKey: dataset.folder || dataset.id || null,
    source: `${dataset.scope === "remote" ? "GitHub dataset" : "Local snapshot"}: ${dataset.label || dataset.id || "dataset"}`,
    cohortId: known ? JSON.stringify([identity(project), identity(wafer)]) : null,
    waferLabel: known ? `${project} / ${wafer}` : "Wafer identity unavailable",
    context: {
      settings: analysis.settings, excludedChipIds: review.excludedChipIds,
      excludedWaveguideIdsByChip: review.excludedWaveguideIdsByChip,
      measuredChipCount: chips.length, acceptedChipCount: summary.count,
      rule: summary.rule, datasetId: dataset.id || "", folder: dataset.folder || ""
    },
    observations: summary.chips.map((chip) => ({ chipId: chip.chipId, value: chip.lossDbPerCm }))
  };
}

export function localPropagationAnovaGroup(dataset) {
  if (!Array.isArray(dataset.rawRows) || !dataset.rawRows.length) throw new Error("The local snapshot contains no measurement rows.");
  const review = normalizeDatasetAnalyticsReview(dataset.analyticsReview);
  const meta = { ...dataset.sourceMeta, ...Object.fromEntries(Object.entries(review.propagationSettings).filter(([, value]) => value !== null)),
    excludedWaveguideIdsByChip: dataset.analyticsReview?.excludedWaveguideIdsByChip != null ? review.excludedWaveguideIdsByChip : dataset.sourceMeta?.excludedWaveguideIdsByChip || {} };
  const settings = {
    targetWavelengthNm: meta.propagationTargetWavelengthNm, windowNm: meta.propagationWindowNm,
    spectralStepNm: meta.propagationSpectralStepNm, mseThreshold: meta.propagationMseThreshold,
    excludedWaveguideIdsByChip: meta.excludedWaveguideIdsByChip, waveguideLengthByIndex: meta.waveguideLengthByIndex,
    launchPowerDbm: meta.launchPowerDbm
  };
  const propagation = computePropagationLoss(buildNormalizedRows(dataset.rawRows, dataset.columnMap || {}, meta), settings);
  return propagationAnovaGroup(dataset, { propagation, settings, analyticsReview: { ...review, excludedWaveguideIdsByChip: meta.excludedWaveguideIdsByChip } });
}
