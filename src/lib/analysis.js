const CHIP_KEYS = ["chip_id", "die_x", "die_y"];

const METRIC_DESCRIPTIONS = {
  propagation: "Loss is fit across waveguide lengths at each wavelength, then averaged over the selected wavelength window.",
  insertion: "Average insertion loss grouped per chip and building block.",
  heater: "Average MZI heater efficiency from direct pi-power or derived electrical power."
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row, index) => {
    const key = keyFn(row, index);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());
}

function linearRegression(points) {
  const cleanPoints = points.filter((point) => point.x !== null && point.y !== null);
  if (cleanPoints.length < 2) return null;

  const n = cleanPoints.length;
  const sumX = cleanPoints.reduce((acc, point) => acc + point.x, 0);
  const sumY = cleanPoints.reduce((acc, point) => acc + point.y, 0);
  const sumXY = cleanPoints.reduce((acc, point) => acc + point.x * point.y, 0);
  const sumXX = cleanPoints.reduce((acc, point) => acc + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const mse =
    cleanPoints.reduce((acc, point) => {
      const predicted = slope * point.x + intercept;
      return acc + (point.y - predicted) ** 2;
    }, 0) / n;

  return { slope, intercept, mse, count: n };
}

function resolveChipId(row, index) {
  if (row.chip_id) return String(row.chip_id);
  if (row.die_x !== null && row.die_y !== null) return `(${row.die_x}, ${row.die_y})`;
  return `chip-${index + 1}`;
}

function propagationLossValue(row) {
  if (row.loss_db !== null && row.loss_db !== undefined) return row.loss_db;
  if (row.transmission_db !== null && row.transmission_db !== undefined) return Math.abs(row.transmission_db);
  return null;
}

function transmissionValue(row) {
  if (row.loss_db !== null && row.loss_db !== undefined) return row.loss_db;
  if (row.transmission_db !== null && row.transmission_db !== undefined) return Math.abs(row.transmission_db);
  return null;
}

function roundWavelength(value) {
  return Number((value ?? 0).toFixed(3));
}

function average(values) {
  const clean = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
  if (!clean.length) return null;
  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}


function interpolateAtX(points, targetX) {
  const clean = points
    .filter((point) => point?.x !== null && point?.x !== undefined && point?.y !== null && point?.y !== undefined)
    .sort((a, b) => a.x - b.x);
  if (!clean.length || targetX === null || targetX === undefined) return null;
  if (targetX <= clean[0].x) return clean[0].y;
  if (targetX >= clean[clean.length - 1].x) return clean[clean.length - 1].y;

  for (let index = 0; index < clean.length - 1; index += 1) {
    const left = clean[index];
    const right = clean[index + 1];
    if (targetX < left.x || targetX > right.x) continue;
    if (right.x === left.x) return left.y;
    const fraction = (targetX - left.x) / (right.x - left.x);
    return left.y + fraction * (right.y - left.y);
  }

  return null;
}
function buildWindowAveragedSamples(rows, targetWavelengthNm, windowNm) {
  const filtered = rows.filter((row) => {
    const wavelength = toNumber(row.wavelength_nm);
    return wavelength !== null && Math.abs(wavelength - targetWavelengthNm) <= windowNm;
  });
  const grouped = groupBy(
    filtered,
    (row) => `${row.waveguide_id || row.relative_length_mm || row.block_name || "length"}::${row.relative_length_mm}`
  );
  return Array.from(grouped.values())
    .map((items) => {
      const lengthMm = toNumber(items[0].relative_length_mm);
      const values = items.map(propagationLossValue).filter((value) => value !== null);
      if (lengthMm === null || values.length === 0) return null;
      return {
        ...items[0],
        relative_length_mm: lengthMm,
        transmission_db: values.reduce((acc, value) => acc + value, 0) / values.length,
        sample_count: values.length
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.relative_length_mm - b.relative_length_mm);
}

function buildIntervalSpectralSeries(rows, stepNm, windowNm) {
  const wavelengths = rows
    .map((row) => toNumber(row.wavelength_nm))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  if (!wavelengths.length) return [];

  const minWavelength = wavelengths[0];
  const maxWavelength = wavelengths[wavelengths.length - 1];
  const startCenter = Math.ceil(minWavelength / stepNm) * stepNm;
  const centers = [];

  for (let center = startCenter; center <= maxWavelength; center += stepNm) {
    centers.push(Number(center.toFixed(3)));
  }

  return centers
    .map((centerWavelengthNm) => {
      const samples = buildWindowAveragedSamples(rows, centerWavelengthNm, windowNm);
      const fit = linearRegression(
        samples.map((row) => ({
          x: row.relative_length_mm,
          y: row.transmission_db
        }))
      );
      if (!fit) return null;
      return {
        wavelengthNm: centerWavelengthNm,
        lossDbPerCm: fit.slope * 10,
        interceptDb: fit.intercept,
        mse: fit.mse,
        sampleCount: fit.count
      };
    })
    .filter(Boolean);
}
function buildTransmissionSeries(rows) {
  const grouped = groupBy(
    rows.filter((row) => row.wavelength_nm !== null && transmissionValue(row) !== null),
    (row) => row.waveguide_id || `L${row.relative_length_mm ?? "NA"}`
  );
  return Array.from(grouped.entries())
    .map(([waveguideId, items]) => ({
      waveguideId,
      lengthMm: toNumber(items[0].relative_length_mm),
      points: [...items]
        .map((row) => ({ wavelengthNm: toNumber(row.wavelength_nm), transmissionDb: transmissionValue(row) }))
        .filter((point) => point.wavelengthNm !== null && point.transmissionDb !== null)
        .sort((a, b) => a.wavelengthNm - b.wavelengthNm)
    }))
    .filter((item) => item.points.length)
    .sort((a, b) => {
      if (a.lengthMm === null) return 1;
      if (b.lengthMm === null) return -1;
      return a.lengthMm - b.lengthMm;
    });
}

function arrayMin(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function arrayMax(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}
function summarizeLossPoints(points = []) {
  if (!points.length) return null;
  const values = points.map((point) => point.transmissionDb);
  const minimumLossDb = arrayMin(values);
  const peakPoint = points.find((point) => point.transmissionDb === minimumLossDb) || null;
  const lossThreshold = minimumLossDb + 3;
  const withinBandwidth = points.filter((point) => point.transmissionDb <= lossThreshold);
  const bandwidthNm = withinBandwidth.length
    ? withinBandwidth[withinBandwidth.length - 1].wavelengthNm - withinBandwidth[0].wavelengthNm
    : null;

  return {
    peakWavelengthNm: peakPoint?.wavelengthNm ?? null,
    peakTransmissionDb: minimumLossDb,
    insertionLossDb: minimumLossDb,
    bandwidth3dBNm: bandwidthNm
  };
}

function summarizeTransmission(series) {
  const wg1 = series.find((item) => item.waveguideId === "WG1") || series[0] || null;
  if (!wg1 || !wg1.points.length) return null;
  return {
    waveguideId: wg1.waveguideId,
    ...summarizeLossPoints(wg1.points)
  };
}

export function computePropagationLoss(normalizedRows, options = {}) {
  const targetWavelengthNm = toNumber(options.targetWavelengthNm) ?? 1550;
  const windowNm = toNumber(options.windowNm) ?? 5;
  const mseThreshold = toNumber(options.mseThreshold) ?? 0.5;
  const spectralStepNm = toNumber(options.spectralStepNm) ?? 10;
  const groups = groupBy(
    normalizedRows.filter(
      (row) => row.metric_family === "propagation" && row.relative_length_mm !== null && propagationLossValue(row) !== null
    ),
    (row, index) => resolveChipId(row, index)
  );

  const byChip = Array.from(groups.entries())
    .map(([chipId, rows]) => {
      const spectralSeries = buildIntervalSpectralSeries(rows, spectralStepNm, windowNm);
      const windowedSamples = buildWindowAveragedSamples(rows, targetWavelengthNm, windowNm);
      const fit = linearRegression(
        windowedSamples.map((row) => ({
          x: row.relative_length_mm,
          y: row.transmission_db
        }))
      );
      const nearestSpectralPoint = spectralSeries.length
        ? [...spectralSeries].sort(
          (a, b) => Math.abs(a.wavelengthNm - targetWavelengthNm) - Math.abs(b.wavelengthNm - targetWavelengthNm)
        )[0]
        : null;
      const windowAverage = nearestSpectralPoint?.lossDbPerCm ?? null;
      if (!fit && windowAverage === null && !spectralSeries.length) return null;

      const transmissionSeries = buildTransmissionSeries(rows);
      const transmissionSummary = summarizeTransmission(transmissionSeries);
      const mse = fit?.mse ?? null;
      const passMse = mse === null ? false : mse <= mseThreshold;

      return {
        chipId,
        dieX: rows[0].die_x,
        dieY: rows[0].die_y,
        measurementCount: rows.length,
        lossDbPerCm: windowAverage ?? (fit ? fit.slope * 10 : null),
        interceptDb: fit?.intercept ?? null,
        mse,
        passMse,
        fit,
        samples: windowedSamples,
        spectralSeries,
        transmissionSeries,
        transmissionSummary,
        targetWavelengthNm,
        windowNm,
        mseThreshold,
        spectralStepNm,
        spectralAverageCount: nearestSpectralPoint?.sampleCount ?? 0
      };
    })
    .filter(Boolean);

  const validByChip = byChip.filter((item) => item.passMse && item.lossDbPerCm !== null);
  const passRate = byChip.length ? (validByChip.length / byChip.length) * 100 : null;

  return {
    metric: "Propagation Loss",
    description: METRIC_DESCRIPTIONS.propagation,
    targetWavelengthNm,
    windowNm,
    mseThreshold,
    spectralStepNm,
    byChip,
    validByChip,
    passRate,
    averages: {
      allChipsDbPerCm: average(byChip.map((item) => item.lossDbPerCm)),
      filteredDbPerCm: average(validByChip.map((item) => item.lossDbPerCm)),
      peakWavelengthNm: average(validByChip.map((item) => item.transmissionSummary?.peakWavelengthNm ?? null)),
      insertionLossDb: average(validByChip.map((item) => item.transmissionSummary?.insertionLossDb ?? null)),
      bandwidth3dBNm: average(validByChip.map((item) => item.transmissionSummary?.bandwidth3dBNm ?? null))
    },
    summaryStats: {
      measuredChips: byChip.length,
      failedFits: byChip.filter((item) => item.mse !== null && item.mse > mseThreshold).length,
      fittedChips: validByChip.length,
      avgPropagationLossDbPerCm: average(validByChip.map((item) => item.lossDbPerCm)),
      avgPeakWavelengthNm: average(validByChip.map((item) => item.transmissionSummary?.peakWavelengthNm ?? null)),
      avgInsertionLossDb: average(validByChip.map((item) => item.transmissionSummary?.insertionLossDb ?? null)),
      avgBandwidth3dBNm: average(validByChip.map((item) => item.transmissionSummary?.bandwidth3dBNm ?? null))
    },
    waferMetric: byChip
      .filter((item) => item.passMse && item.lossDbPerCm !== null)
      .map((item) => ({
        chipId: item.chipId,
        dieX: item.dieX,
        dieY: item.dieY,
        value: item.lossDbPerCm,
        detail: `${item.lossDbPerCm.toFixed(2)} dB/cm @ ${targetWavelengthNm} +/- ${windowNm} nm`
      }))
  };
}

function uniqueWaveguideIds(items) {
  return [...new Set(items.map((item) => item.referenceWaveguideId).filter(Boolean))];
}

function nearestPoint(points = [], targetWavelengthNm = 1550) {
  if (!points.length) return null;
  return [...points].sort(
    (a, b) => Math.abs(a.wavelengthNm - targetWavelengthNm) - Math.abs(b.wavelengthNm - targetWavelengthNm)
  )[0] || null;
}

function summarizeDeviceSpectrum(points = [], targetWavelengthNm = 1550) {
  const summary = summarizeLossPoints(points);
  if (!summary) return null;
  const targetPoint = nearestPoint(points, targetWavelengthNm);
  const values = points.map((point) => point.transmissionDb).filter((value) => value !== null && value !== undefined);
  const spectralFlatnessDb = values.length ? arrayMax(values) - arrayMin(values) : null;
  return {
    ...summary,
    insertionLossAt1550Db: targetPoint?.transmissionDb ?? null,
    insertionLossAtTargetDb: targetPoint?.transmissionDb ?? null,
    targetWavelengthNm: targetPoint?.wavelengthNm ?? targetWavelengthNm,
    spectralFlatnessDb
  };
}

function explicitDeviceType(blockName = "") {
  return /mmi/i.test(String(blockName)) ? "mmi" : "other-device";
}

function aggregateDeviceProfiles(items = [], targetWavelengthNm = 1550) {
  const chipMap = groupBy(items, (item) => item.chipId);
  return Array.from(chipMap.entries()).map(([chipId, chipItems]) => ({
    chipId,
    dieX: chipItems[0].dieX,
    dieY: chipItems[0].dieY,
    insertionLossDb: average(chipItems.map((item) => item.insertionLossDb)),
    insertionLossAt1550Db: average(chipItems.map((item) => item.insertionLossAt1550Db ?? null)),
    peakWavelengthNm: average(chipItems.map((item) => item.peakWavelengthNm ?? null)),
    bandwidth3dBNm: average(chipItems.map((item) => item.bandwidth3dBNm ?? null)),
    spectralFlatnessDb: average(chipItems.map((item) => item.spectralFlatnessDb ?? null)),
    blockCount: chipItems.length,
    blockNames: chipItems.map((item) => item.blockName),
    referenceWaveguideIds: uniqueWaveguideIds(chipItems),
    transmissionSeries: chipItems.flatMap((item) => item.transmissionSeries || []),
    deviceDescriptor: chipItems.map((item) => item.blockName).join(", "),
    targetWavelengthNm
  }));
}

export function computeInsertionLoss(normalizedRows, options = {}) {
  const targetWavelengthNm = toNumber(options.targetWavelengthNm) ?? 1550;
  const explicitGroups = groupBy(
    normalizedRows.filter(
      (row) =>
        row.metric_family === "insertion" &&
        row.wavelength_nm !== null &&
        (row.insertion_loss_db !== null || row.transmission_db !== null || row.loss_db !== null)
    ),
    (row, index) => `${resolveChipId(row, index)}::${row.block_name || "Unnamed block"}`
  );

  const explicitBlocks = Array.from(explicitGroups.entries()).map(([key, rows]) => {
    const [chipId, blockName] = key.split("::");
    const points = rows
      .map((row) => ({
        wavelengthNm: toNumber(row.wavelength_nm),
        transmissionDb: transmissionValue(row)
      }))
      .filter((point) => point.wavelengthNm !== null && point.transmissionDb !== null)
      .sort((a, b) => a.wavelengthNm - b.wavelengthNm);

    if (!points.length) return null;
    const summary = summarizeDeviceSpectrum(points, targetWavelengthNm);
    if (!summary) return null;
    return {
      chipId,
      dieX: rows[0].die_x,
      dieY: rows[0].die_y,
      blockName,
      insertionLossDb: summary.insertionLossDb,
      insertionLossAt1550Db: summary.insertionLossAt1550Db,
      peakWavelengthNm: summary.peakWavelengthNm,
      bandwidth3dBNm: summary.bandwidth3dBNm,
      spectralFlatnessDb: summary.spectralFlatnessDb,
      samples: rows.length,
      transmissionSeries: [{ waveguideId: blockName, points }],
      sourceFamily: "insertion",
      deviceType: explicitDeviceType(blockName)
    };
  }).filter(Boolean);

  const propagationGroups = groupBy(
    normalizedRows.filter((row) => row.metric_family === "propagation" && transmissionValue(row) !== null),
    (row, index) => resolveChipId(row, index)
  );

  const gratingCouplerBlocks = Array.from(propagationGroups.entries()).map(([chipId, rows]) => {
    const series = buildTransmissionSeries(rows);
    const reference = series.find((item) => item.waveguideId === "WG1") || series[0] || null;
    if (!reference?.points?.length) return null;
    const summary = summarizeDeviceSpectrum(reference.points, targetWavelengthNm);
    if (!summary) return null;
    return {
      chipId,
      dieX: rows[0].die_x,
      dieY: rows[0].die_y,
      blockName: rows[0].waveguide_type || "WG1 reference",
      insertionLossDb: summary.insertionLossDb,
      insertionLossAt1550Db: summary.insertionLossAt1550Db,
      peakWavelengthNm: summary.peakWavelengthNm,
      bandwidth3dBNm: summary.bandwidth3dBNm,
      spectralFlatnessDb: summary.spectralFlatnessDb,
      referenceWaveguideId: reference.waveguideId,
      samples: reference.points.length,
      transmissionSeries: [reference],
      sourceFamily: "propagation-reference",
      deviceType: "grating-couplers"
    };
  }).filter(Boolean);

  const blockMap = new Map();
  [...explicitBlocks, ...gratingCouplerBlocks].forEach((item) => {
    const key = `${item.chipId}::${item.blockName}`;
    if (!blockMap.has(key) || blockMap.get(key).sourceFamily !== "insertion") {
      blockMap.set(key, item);
    }
  });

  const byBlock = Array.from(blockMap.values());
  const byChip = aggregateDeviceProfiles(byBlock, targetWavelengthNm);
  const gratingByChip = aggregateDeviceProfiles(gratingCouplerBlocks, targetWavelengthNm);
  const mmiByChip = aggregateDeviceProfiles(explicitBlocks.filter((item) => item.deviceType === "mmi"), targetWavelengthNm);
  const otherByChip = aggregateDeviceProfiles(explicitBlocks.filter((item) => item.deviceType === "other-device"), targetWavelengthNm);

  const waferMetric = byChip.map((item) => ({
    chipId: item.chipId,
    dieX: item.dieX,
    dieY: item.dieY,
    value: item.insertionLossDb,
    detail: `${item.blockCount} building block${item.blockCount === 1 ? "" : "s"}`
  }));

  return {
    metric: "Insertion Loss",
    description: METRIC_DESCRIPTIONS.insertion,
    targetWavelengthNm,
    byBlock,
    byChip,
    waferMetric,
    deviceProfiles: {
      "grating-couplers": {
        label: "Grating Couplers",
        description: "Uses the shortest propagation reference trace, typically WG1, to characterize the coupled grating pair on each chip.",
        metricOptions: [
          { value: "insertionLossDb", label: "Insertion Loss At Peak" },
          { value: "insertionLossAt1550Db", label: "Insertion Loss At 1550 nm" },
          { value: "peakWavelengthNm", label: "Peak Wavelength" },
          { value: "bandwidth3dBNm", label: "3 dB Bandwidth" },
          { value: "spectralFlatnessDb", label: "Spectral Flatness" }
        ],
        byChip: gratingByChip
      },
      mmi: {
        label: "MMI",
        description: "Generic MMI spectral characterization using uploaded insertion-loss traces. FSR is not reported unless the device spectrum is periodic.",
        metricOptions: [
          { value: "insertionLossDb", label: "Insertion Loss At Peak" },
          { value: "insertionLossAt1550Db", label: "Insertion Loss At 1550 nm" },
          { value: "peakWavelengthNm", label: "Peak Wavelength" },
          { value: "bandwidth3dBNm", label: "3 dB Bandwidth" },
          { value: "spectralFlatnessDb", label: "Spectral Flatness" }
        ],
        byChip: mmiByChip
      },
      "other-device": {
        label: "Other Device",
        description: "Generic building-block spectral characterization for uploaded insertion-loss traces that are not tagged as MMI.",
        metricOptions: [
          { value: "insertionLossDb", label: "Insertion Loss At Peak" },
          { value: "insertionLossAt1550Db", label: "Insertion Loss At 1550 nm" },
          { value: "peakWavelengthNm", label: "Peak Wavelength" },
          { value: "bandwidth3dBNm", label: "3 dB Bandwidth" },
          { value: "spectralFlatnessDb", label: "Spectral Flatness" }
        ],
        byChip: otherByChip
      }
    }
  };
}

export function computeHeaterEfficiency(normalizedRows) {
  const groups = groupBy(
    normalizedRows.filter((row) => row.metric_family === "heater"),
    (row, index) => resolveChipId(row, index)
  );

  const byChip = Array.from(groups.entries()).map(([chipId, rows]) => {
    const summaryRows = rows.filter((row) => row.pi_power_mw !== null && row.pi_power_mw !== undefined);
    const sweepRows = rows
      .filter((row) => row.heater_power_mw !== null || row.phase_shift_pi !== null || row.wavelength_shift_nm !== null)
      .sort((a, b) => (a.heater_power_mw ?? 0) - (b.heater_power_mw ?? 0));
    const directRatioValues = rows
      .map((row) => {
        if (row.heater_power_mw !== null && row.phase_shift_pi !== null && row.phase_shift_pi !== 0) {
          return row.heater_power_mw / row.phase_shift_pi;
        }
        return null;
      })
      .filter((value) => value !== null);
    const phaseFit = linearRegression(
      sweepRows
        .filter((row) => row.heater_power_mw !== null && row.phase_shift_pi !== null)
        .map((row) => ({ x: row.heater_power_mw, y: row.phase_shift_pi }))
    );
    const wavelengthFit = linearRegression(
      sweepRows
        .filter((row) => row.heater_power_mw !== null && row.wavelength_shift_nm !== null)
        .map((row) => ({ x: row.heater_power_mw, y: row.wavelength_shift_nm }))
    );
    const fsrNm = average(rows.map((row) => toNumber(row.fsr_nm)));
    const fitPiPowerMw = phaseFit?.slope ? 1 / phaseFit.slope : wavelengthFit?.slope && fsrNm ? fsrNm / (2 * wavelengthFit.slope) : null;
    const summaryPiPowerMw = average(summaryRows.map((row) => toNumber(row.pi_power_mw)));
    const ratioPiPowerMw = average(directRatioValues);
    const efficiencyMwPerPi = fitPiPowerMw ?? summaryPiPowerMw ?? ratioPiPowerMw;

    if (efficiencyMwPerPi === null || efficiencyMwPerPi === undefined) return null;

    const currentAtPiMa = interpolateAtX(
      sweepRows.map((row) => ({ x: row.heater_power_mw, y: row.current_ma })),
      efficiencyMwPerPi
    ) ?? average(summaryRows.map((row) => toNumber(row.current_ma)));
    const voltageAtPiV = currentAtPiMa ? efficiencyMwPerPi / currentAtPiMa : average(summaryRows.map((row) => toNumber(row.voltage_v)));
    const traceCarrier = rows.find((row) => Array.isArray(row.heater_trace_series)) || summaryRows[0] || null;
    const maxPhaseShiftPi = average(summaryRows.map((row) => toNumber(row.heater_max_phase_shift_pi)))
      ?? Math.max(...sweepRows.map((row) => toNumber(row.phase_shift_pi)).filter((value) => value !== null), Number.NEGATIVE_INFINITY);
    const safeMaxPhaseShiftPi = Number.isFinite(maxPhaseShiftPi) ? maxPhaseShiftPi : null;
    const targetLossValues = sweepRows.map((row) => toNumber(row.loss_at_target_db)).filter((value) => value !== null);
    const lossDriftDb = targetLossValues.length ? targetLossValues[targetLossValues.length - 1] - targetLossValues[0] : null;

    return {
      chipId,
      dieX: rows[0].die_x,
      dieY: rows[0].die_y,
      efficiencyMwPerPi,
      piPowerMw: efficiencyMwPerPi,
      voltageAtPiV: voltageAtPiV ?? average(summaryRows.map((row) => toNumber(row.heater_vpi_v))),
      currentAtPiMa: currentAtPiMa ?? average(summaryRows.map((row) => toNumber(row.heater_ipi_ma))),
      fsrNm,
      referencePeakWavelengthNm: average(rows.map((row) => toNumber(row.tracked_peak_wavelength_nm))),
      wavelengthShiftSlopeNmPerMw: wavelengthFit?.slope ?? null,
      phaseSlopePiPerMw: phaseFit?.slope ?? null,
      phaseFit,
      wavelengthFit,
      fitMse: phaseFit?.mse ?? wavelengthFit?.mse ?? null,
      fitRSquared: phaseFit?.rSquared ?? wavelengthFit?.rSquared ?? null,
      samples: sweepRows.length || rows.length,
      maxPhaseShiftPi: safeMaxPhaseShiftPi,
      meanResistanceOhm: average(rows.map((row) => toNumber(row.resistance_ohm))),
      lossDriftDb,
      powerSeries: sweepRows.map((row) => ({
        powerMw: toNumber(row.heater_power_mw),
        phaseShiftPi: toNumber(row.phase_shift_pi),
        wavelengthShiftNm: toNumber(row.wavelength_shift_nm),
        currentMa: toNumber(row.current_ma),
        voltageV: toNumber(row.voltage_v),
        trackedPeakWavelengthNm: toNumber(row.tracked_peak_wavelength_nm),
        lossAtTargetDb: toNumber(row.loss_at_target_db),
        lossAtTrackedPeakDb: toNumber(row.loss_at_tracked_peak_db)
      })),
      traceSeries: traceCarrier?.heater_trace_series || [],
      targetWavelengthNm: average(rows.map((row) => toNumber(row.heater_target_wavelength_nm))),
      peakProminenceDb: average(rows.map((row) => toNumber(row.heater_peak_prominence_db))),
      shiftDirection: traceCarrier?.heater_shift_direction || "increasing"
    };
  }).filter(Boolean);

  return {
    metric: "Heater Efficiency",
    description: METRIC_DESCRIPTIONS.heater,
    byChip,
    waferMetric: byChip.map((item) => ({
      chipId: item.chipId,
      dieX: item.dieX,
      dieY: item.dieY,
      value: item.efficiencyMwPerPi,
      detail: item.voltageAtPiV !== null && item.voltageAtPiV !== undefined ? `${item.efficiencyMwPerPi.toFixed(2)} mW/pi | Vpi ${item.voltageAtPiV.toFixed(2)} V` : `${item.efficiencyMwPerPi.toFixed(2)} mW/pi`
    }))
  };
}
export function summarizeDataset(normalizedRows) {
  const chips = new Set();
  const families = new Set();

  normalizedRows.forEach((row, index) => {
    chips.add(resolveChipId(row, index));
    if (row.metric_family) families.add(row.metric_family);
  });

  return {
    rows: normalizedRows.length,
    chips: chips.size,
    families: Array.from(families)
  };
}

export function calculateAllMetrics(normalizedRows, options = {}) {
  return {
    propagation: computePropagationLoss(normalizedRows, options.propagation || {}),
    insertion: computeInsertionLoss(normalizedRows),
    heater: computeHeaterEfficiency(normalizedRows)
  };
}

export function buildReportState(metrics, datasetSummary) {
  const propagationTop = [...metrics.propagation.validByChip]
    .sort((a, b) => a.lossDbPerCm - b.lossDbPerCm)
    .slice(0, 5);
  const heaterTop = [...metrics.heater.byChip]
    .sort((a, b) => a.efficiencyMwPerPi - b.efficiencyMwPerPi)
    .slice(0, 5);
  const insertionTop = [...metrics.insertion.byBlock]
    .sort((a, b) => a.insertionLossDb - b.insertionLossDb)
    .slice(0, 5);
  const chipTable = metrics.propagation.byChip.map((item) => ({
    chipId: item.chipId,
    lossDbPerCm: item.lossDbPerCm,
    mse: item.mse,
    passMse: item.passMse,
    peakWavelengthNm: item.transmissionSummary?.peakWavelengthNm ?? null,
    insertionLossDb: item.transmissionSummary?.insertionLossDb ?? null,
    bandwidth3dBNm: item.transmissionSummary?.bandwidth3dBNm ?? null
  }));

  return {
    generatedAt: new Date().toLocaleString(),
    summary: datasetSummary,
    highlights: [
      `Processed ${datasetSummary.rows} normalized records across ${datasetSummary.chips} chip locations.`,
      `${metrics.propagation.validByChip.length} chips passed the propagation MSE threshold of ${metrics.propagation.mseThreshold}.`,
      `${metrics.insertion.byBlock.length} insertion-loss groupings were extracted.`,
      `${metrics.heater.byChip.length} chips produced heater-efficiency estimates.`
    ],
    matlabSummary: metrics.propagation.summaryStats,
    propagationTop,
    insertionTop,
    heaterTop,
    chipTable,
    waferMetric: metrics.propagation.waferMetric
  };
}

export function buildHtmlReport(reportState, title = "Wafer Post-Processing Report") {
  const rows = reportState.chipTable
    .map(
      (row) => `<tr><td>${row.chipId}</td><td>${formatNullable(row.lossDbPerCm, 2)}</td><td>${formatNullable(row.mse, 4)}</td><td>${row.passMse ? "Pass" : "Fail"}</td><td>${formatNullable(row.peakWavelengthNm, 1)}</td><td>${formatNullable(row.insertionLossDb, 2)}</td><td>${formatNullable(row.bandwidth3dBNm, 1)}</td></tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#162126;background:#f7fbfc}
h1,h2{color:#0f4f57} .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}
.card{background:#fff;border:1px solid #d9e4e7;border-radius:14px;padding:14px} table{width:100%;border-collapse:collapse;background:#fff}
th,td{border:1px solid #d9e4e7;padding:8px 10px;text-align:left} th{background:#eff7f8}
ul{padding-left:18px}
</style>
</head>
<body>
<h1>${title}</h1>
<p>Generated: ${reportState.generatedAt}</p>
<div class="grid">
<div class="card"><strong>Measured chips</strong><div>${reportState.matlabSummary.measuredChips}</div></div>
<div class="card"><strong>Fitted chips</strong><div>${reportState.matlabSummary.fittedChips}</div></div>
<div class="card"><strong>Failed fits</strong><div>${reportState.matlabSummary.failedFits}</div></div>
<div class="card"><strong>Avg propagation loss</strong><div>${formatNullable(reportState.matlabSummary.avgPropagationLossDbPerCm, 2)} dB/cm</div></div>
<div class="card"><strong>Avg peak wavelength</strong><div>${formatNullable(reportState.matlabSummary.avgPeakWavelengthNm, 1)} nm</div></div>
<div class="card"><strong>Avg 3 dB bandwidth</strong><div>${formatNullable(reportState.matlabSummary.avgBandwidth3dBNm, 1)} nm</div></div>
</div>
<h2>Highlights</h2>
<ul>${reportState.highlights.map((item) => `<li>${item}</li>`).join("")}</ul>
<h2>Chip Summary Table</h2>
<table>
<thead><tr><th>Chip</th><th>Loss (dB/cm)</th><th>MSE</th><th>Status</th><th>Peak WL (nm)</th><th>Insertion Loss (dB)</th><th>3 dB BW (nm)</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

function formatNullable(value, digits) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

export function getMetricRange(cells) {
  const values = cells.map((cell) => cell.value).filter((value) => value !== null && value !== undefined);
  if (!values.length) return null;
  return {
    min: arrayMin(values),
    max: arrayMax(values)
  };
}

export function metricLabel(metricKey) {
  return {
    propagation: "Propagation loss (dB/cm)",
    insertion: "Insertion loss (dB)",
    heater: "Heater efficiency (mW/pi)"
  }[metricKey];
}

export function chipFields() {
  return CHIP_KEYS;
}

export function numeric(value) {
  return toNumber(value);
}

