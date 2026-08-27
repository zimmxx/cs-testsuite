const DEFAULT_THRESHOLDS = {
  minimumPoints: 24,
  rippleRmsDb: 0.15,
  ripplePeakToPeakDb: 0.55,
  abruptJumpDb: 0.8,
  reversalDensity: 0.12
};

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values = []) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
}

function movingAverage(values, radius) {
  const prefix = [0];
  values.forEach((value) => prefix.push(prefix[prefix.length - 1] + value));
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    return (prefix[end + 1] - prefix[start]) / (end - start + 1);
  });
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function severityRank(severity) {
  return { high: 3, medium: 2, low: 1, clear: 0 }[severity] || 0;
}

export function analyzeTransmissionTrace(points = [], options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options };
  const clean = points
    .map((point) => ({ wavelengthNm: finite(point?.wavelengthNm), transmissionDb: finite(point?.transmissionDb) }))
    .filter((point) => point.wavelengthNm !== null && point.transmissionDb !== null)
    .sort((left, right) => left.wavelengthNm - right.wavelengthNm);

  if (clean.length < thresholds.minimumPoints) {
    return {
      status: "insufficient-data",
      severity: "low",
      pointCount: clean.length,
      flags: ["insufficient-data"],
      evidence: `Only ${clean.length} valid spectral points were available; at least ${thresholds.minimumPoints} are needed.`
    };
  }

  const values = clean.map((point) => point.transmissionDb);
  const smoothingRadius = Math.max(2, Math.min(12, Math.floor(clean.length / 35)));
  const baseline = movingAverage(values, smoothingRadius);
  const residuals = values.map((value, index) => value - baseline[index]);
  const residualRmsDb = Math.sqrt(mean(residuals.map((value) => value ** 2)));
  const residualPeakToPeakDb = Math.max(...residuals) - Math.min(...residuals);
  const adjacentSteps = values.slice(1).map((value, index) => Math.abs(value - values[index]));
  const medianStepDb = median(adjacentSteps) || 0;
  const maximumStepDb = Math.max(...adjacentSteps);
  const slopes = values.slice(1).map((value, index) => value - values[index]);
  let reversals = 0;
  for (let index = 1; index < slopes.length; index += 1) {
    if (Math.sign(slopes[index]) && Math.sign(slopes[index - 1]) && Math.sign(slopes[index]) !== Math.sign(slopes[index - 1])) reversals += 1;
  }
  const reversalDensity = reversals / Math.max(slopes.length - 1, 1);
  const noiseFloorDb = standardDeviation(adjacentSteps);
  const abruptThresholdDb = Math.max(thresholds.abruptJumpDb, medianStepDb * 8, noiseFloorDb * 5);
  const abruptJumpCount = adjacentSteps.filter((step) => step >= abruptThresholdDb).length;
  const oscillationDetected = residualRmsDb >= thresholds.rippleRmsDb
    && residualPeakToPeakDb >= thresholds.ripplePeakToPeakDb
    && reversalDensity >= thresholds.reversalDensity;
  const abruptChangeDetected = maximumStepDb >= abruptThresholdDb;
  const flags = [];
  if (oscillationDetected) flags.push("oscillation-or-ripple");
  if (abruptChangeDetected) flags.push("abrupt-discontinuity");
  if (residualPeakToPeakDb >= thresholds.ripplePeakToPeakDb * 1.8) flags.push("high-spectral-roughness");

  const severity = abruptJumpCount >= 3 || residualPeakToPeakDb >= thresholds.ripplePeakToPeakDb * 2.5
    ? "high"
    : flags.length
      ? "medium"
      : "clear";

  return {
    status: flags.length ? "flagged" : "clear",
    severity,
    pointCount: clean.length,
    wavelengthMinNm: clean[0].wavelengthNm,
    wavelengthMaxNm: clean[clean.length - 1].wavelengthNm,
    residualRmsDb,
    residualPeakToPeakDb,
    reversalDensity,
    maximumStepDb,
    abruptJumpCount,
    flags,
    evidence: flags.length
      ? `Residual ripple ${residualPeakToPeakDb.toFixed(2)} dB p-p, RMS ${residualRmsDb.toFixed(2)} dB; ${abruptJumpCount} abrupt step${abruptJumpCount === 1 ? "" : "s"}.`
      : `No configured ripple or discontinuity threshold was exceeded across ${clean.length} points.`
  };
}

function hypothesesForChip(chip, traceResults) {
  const flags = new Set(traceResults.flatMap((result) => result.flags || []));
  const hypotheses = [];
  if (flags.has("oscillation-or-ripple")) {
    hypotheses.push({
      label: "Spectral ripple / oscillation",
      detail: "Check fibre alignment stability, facet or grating reflections, Fabry-Pérot effects, polarisation drift, and scan repeatability before attributing the pattern to fabrication."
    });
  }
  if (flags.has("abrupt-discontinuity")) {
    hypotheses.push({
      label: "Abrupt spectral discontinuity",
      detail: "Repeat the sweep and inspect instrument range changes, dropped samples, connector movement, and file concatenation."
    });
  }
  if (flags.has("high-spectral-roughness") && !flags.has("oscillation-or-ripple")) {
    hypotheses.push({
      label: "High spectral roughness",
      detail: "The detrended trace has a large residual range. Check repeatability, wavelength sampling, detector noise, coupling stability, and reflected-light effects before considering fabrication-related scattering."
    });
  }
  if (!chip.passMse && chip.lossDbPerCm !== null && chip.lossDbPerCm !== undefined) {
    hypotheses.push({
      label: "Propagation fit failed",
      detail: "The length-versus-loss fit exceeds the configured MSE threshold. Inspect waveguide ordering, route lengths, coupling consistency, and individual traces."
    });
  }
  if ((finite(chip.lossDbPerCm) ?? 0) >= 5 && flags.has("high-spectral-roughness")) {
    hypotheses.push({
      label: "Possible fabrication-related excess scattering",
      detail: "High fitted loss combined with spectral roughness can be consistent with sidewall roughness or dimensional non-uniformity, but CD-SEM, repeat sweeps, and cross-wafer evidence are required to support that conclusion."
    });
  }
  return hypotheses;
}

export function buildWaferDiagnostics(propagation = {}) {
  const chips = (propagation.byChip || []).map((chip) => {
    const traces = (chip.transmissionSeries || []).map((series, index) => ({
      waveguideId: series.waveguideId || `Trace ${index + 1}`,
      ...analyzeTransmissionTrace(series.points || [])
    }));
    const flaggedTraces = traces.filter((trace) => trace.status === "flagged");
    const failedFit = chip.passMse !== true;
    const severity = [...flaggedTraces.map((trace) => trace.severity), failedFit ? "medium" : "clear"]
      .sort((left, right) => severityRank(right) - severityRank(left))[0] || "clear";
    return {
      chipId: chip.chipId,
      dieX: chip.dieX,
      dieY: chip.dieY,
      failedFit,
      passMse: chip.passMse,
      mse: finite(chip.mse),
      mseThreshold: finite(chip.mseThreshold ?? propagation.mseThreshold),
      lossDbPerCm: finite(chip.lossDbPerCm),
      traceCount: traces.length,
      flaggedTraceCount: flaggedTraces.length,
      severity,
      traces,
      hypotheses: hypothesesForChip(chip, traces)
    };
  });

  const failedChips = chips.filter((chip) => chip.failedFit);
  const anomalousChips = chips.filter((chip) => chip.flaggedTraceCount > 0);
  return {
    generatedAt: new Date().toISOString(),
    thresholds: DEFAULT_THRESHOLDS,
    measuredChipCount: chips.length,
    failedChipCount: failedChips.length,
    anomalousChipCount: anomalousChips.length,
    screenedTraceCount: chips.reduce((sum, chip) => sum + chip.traceCount, 0),
    flaggedTraceCount: chips.reduce((sum, chip) => sum + chip.flaggedTraceCount, 0),
    chips,
    failedChips,
    anomalousChips
  };
}

export function buildBatchComparison(datasets = []) {
  const rows = datasets.map((dataset) => ({
    id: dataset.id,
    label: dataset.label || dataset.projectName || dataset.id,
    mpw: dataset.mpw || dataset.projectName || "MPW undefined",
    slot: dataset.slot || dataset.waferName || "Slot undefined",
    propagationAverage: finite(dataset.analyticsSummary?.propagationAverage),
    yield: finite(dataset.analyticsSummary?.yield),
    measuredChips: finite(dataset.analyticsSummary?.measuredChips)
  }));
  const reference = rows.find((row) => row.propagationAverage !== null || row.yield !== null) || null;
  return {
    referenceId: reference?.id || "",
    rows: rows.map((row) => ({
      ...row,
      propagationDelta: reference?.propagationAverage !== null && row.propagationAverage !== null
        ? row.propagationAverage - reference.propagationAverage
        : null,
      yieldDelta: reference?.yield !== null && row.yield !== null ? row.yield - reference.yield : null
    }))
  };
}

export function buildAiEvidencePayload({ datasetLabel, diagnostics, batchComparison, question }) {
  return {
    schemaVersion: 1,
    datasetLabel,
    question,
    measurementCaveat: "Indicators are screening evidence, not proof of a fabrication root cause.",
    waferSummary: {
      measuredChipCount: diagnostics.measuredChipCount,
      failedChipCount: diagnostics.failedChipCount,
      anomalousChipCount: diagnostics.anomalousChipCount,
      screenedTraceCount: diagnostics.screenedTraceCount,
      flaggedTraceCount: diagnostics.flaggedTraceCount
    },
    chips: diagnostics.chips.map((chip) => ({
      chipId: chip.chipId,
      location: [chip.dieX, chip.dieY],
      failedFit: chip.failedFit,
      mse: chip.mse,
      mseThreshold: chip.mseThreshold,
      lossDbPerCm: chip.lossDbPerCm,
      severity: chip.severity,
      flaggedTraceCount: chip.flaggedTraceCount,
      traceEvidence: chip.traces.filter((trace) => trace.status === "flagged").map((trace) => ({
        waveguideId: trace.waveguideId,
        flags: trace.flags,
        residualRmsDb: trace.residualRmsDb,
        residualPeakToPeakDb: trace.residualPeakToPeakDb,
        maximumStepDb: trace.maximumStepDb
      })),
      hypotheses: chip.hypotheses.map((hypothesis) => hypothesis.label)
    })),
    batchComparison
  };
}

export async function requestAiInterpretation({
  provider = "gemini",
  model = "gemini-3.1-flash-lite",
  payload,
  storeAnalysis = true
}) {
  const endpoint = import.meta.env.VITE_AI_API_URL || "/api/ai";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, payload, storeAnalysis }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `AI request failed (${response.status}).`);
    return {
      text: result.text || "The AI provider returned an empty response.",
      stored: result.stored === true
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Gemini did not finish within 90 seconds. Please try again shortly.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
