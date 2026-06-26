const CHIP_KEYS = ["chip_id", "die_x", "die_y"];

const METRIC_DESCRIPTIONS = {
  propagation: "Linear fit of transmission against relative length, converted to dB/cm.",
  insertion: "Average insertion loss grouped per chip and building block.",
  heater: "Average MZI heater efficiency from direct pi-power or derived electrical power."
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
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

function computePropagationLoss(normalizedRows) {
  const groups = groupBy(
    normalizedRows.filter(
      (row) => row.metric_family === "propagation" && row.relative_length_mm !== null && row.transmission_db !== null
    ),
    (row, index) => resolveChipId(row, index)
  );

  const byChip = Array.from(groups.entries()).map(([chipId, rows]) => {
    const fit = linearRegression(
      rows.map((row) => ({
        x: row.relative_length_mm,
        y: row.transmission_db
      }))
    );
    if (!fit) return null;

    return {
      chipId,
      dieX: rows[0].die_x,
      dieY: rows[0].die_y,
      measurementCount: rows.length,
      lossDbPerCm: Math.abs(fit.slope) * 10,
      interceptDb: fit.intercept,
      mse: fit.mse,
      fit,
      samples: rows
    };
  }).filter(Boolean);

  return {
    metric: "Propagation Loss",
    description: METRIC_DESCRIPTIONS.propagation,
    byChip,
    waferMetric: byChip.map((item) => ({
      chipId: item.chipId,
      dieX: item.dieX,
      dieY: item.dieY,
      value: item.lossDbPerCm,
      detail: `${item.lossDbPerCm.toFixed(2)} dB/cm`
    }))
  };
}

function computeInsertionLoss(normalizedRows) {
  const groups = groupBy(
    normalizedRows.filter(
      (row) =>
        row.metric_family === "insertion" &&
        (row.insertion_loss_db !== null || row.transmission_db !== null)
    ),
    (row, index) => `${resolveChipId(row, index)}::${row.block_name || "Unnamed block"}`
  );

  const byBlock = Array.from(groups.entries()).map(([key, rows]) => {
    const [chipId, blockName] = key.split("::");
    const values = rows
      .map((row) => (row.insertion_loss_db !== null ? row.insertion_loss_db : Math.abs(row.transmission_db)))
      .filter((value) => value !== null);

    if (!values.length) return null;
    const average = values.reduce((acc, value) => acc + value, 0) / values.length;
    return {
      chipId,
      dieX: rows[0].die_x,
      dieY: rows[0].die_y,
      blockName,
      insertionLossDb: average,
      samples: rows.length
    };
  }).filter(Boolean);

  const chipMap = groupBy(byBlock, (item) => item.chipId);
  const waferMetric = Array.from(chipMap.entries()).map(([chipId, items]) => ({
    chipId,
    dieX: items[0].dieX,
    dieY: items[0].dieY,
    value: items.reduce((acc, item) => acc + item.insertionLossDb, 0) / items.length,
    detail: `${items.length} building blocks`
  }));

  return {
    metric: "Insertion Loss",
    description: METRIC_DESCRIPTIONS.insertion,
    byBlock,
    waferMetric
  };
}

function computeHeaterEfficiency(normalizedRows) {
  const groups = groupBy(
    normalizedRows.filter((row) => row.metric_family === "heater"),
    (row, index) => resolveChipId(row, index)
  );

  const byChip = Array.from(groups.entries()).map(([chipId, rows]) => {
    const values = rows
      .map((row) => {
        if (row.pi_power_mw !== null) return row.pi_power_mw;
        if (row.heater_power_mw !== null && row.phase_shift_pi !== null && row.phase_shift_pi !== 0) {
          return row.heater_power_mw / row.phase_shift_pi;
        }
        return null;
      })
      .filter((value) => value !== null);

    if (!values.length) return null;
    const average = values.reduce((acc, value) => acc + value, 0) / values.length;
    return {
      chipId,
      dieX: rows[0].die_x,
      dieY: rows[0].die_y,
      efficiencyMwPerPi: average,
      samples: rows.length
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
      detail: `${item.efficiencyMwPerPi.toFixed(2)} mW/pi`
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

export function calculateAllMetrics(normalizedRows) {
  return {
    propagation: computePropagationLoss(normalizedRows),
    insertion: computeInsertionLoss(normalizedRows),
    heater: computeHeaterEfficiency(normalizedRows)
  };
}

export function buildReportState(metrics, datasetSummary) {
  const propagationTop = [...metrics.propagation.byChip]
    .sort((a, b) => a.lossDbPerCm - b.lossDbPerCm)
    .slice(0, 5);
  const heaterTop = [...metrics.heater.byChip]
    .sort((a, b) => a.efficiencyMwPerPi - b.efficiencyMwPerPi)
    .slice(0, 5);
  const insertionTop = [...metrics.insertion.byBlock]
    .sort((a, b) => a.insertionLossDb - b.insertionLossDb)
    .slice(0, 5);

  return {
    generatedAt: new Date().toLocaleString(),
    summary: datasetSummary,
    highlights: [
      `Processed ${datasetSummary.rows} normalized records across ${datasetSummary.chips} chip locations.`,
      `${metrics.propagation.byChip.length} chips produced valid propagation-loss fits.`,
      `${metrics.insertion.byBlock.length} insertion-loss groupings were extracted.`,
      `${metrics.heater.byChip.length} chips produced heater-efficiency estimates.`
    ],
    propagationTop,
    insertionTop,
    heaterTop
  };
}

export function getMetricRange(cells) {
  const values = cells.map((cell) => cell.value).filter((value) => value !== null && value !== undefined);
  if (!values.length) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values)
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
