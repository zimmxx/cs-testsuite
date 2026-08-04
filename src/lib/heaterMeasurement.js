import * as XLSX from "xlsx";

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function stripExtension(name = "") {
  return String(name).replace(/\.[^.]+$/, "");
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function relativeFilePath(file) {
  return normalizePath(file?.webkitRelativePath || file?.name || "");
}

function parentDirectory(path = "") {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

function baseName(path = "") {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function splitPathParts(path = "") {
  return normalizePath(path).split("/").filter(Boolean);
}

function arrayAverage(values = []) {
  const clean = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function linearRegression(points = []) {
  const cleanPoints = points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (cleanPoints.length < 2) return null;

  const n = cleanPoints.length;
  const sumX = cleanPoints.reduce((sum, point) => sum + point.x, 0);
  const sumY = cleanPoints.reduce((sum, point) => sum + point.y, 0);
  const sumXY = cleanPoints.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = cleanPoints.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (!denominator) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const mse = cleanPoints.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0) / n;
  const meanY = sumY / n;
  const totalVariance = cleanPoints.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const residualVariance = cleanPoints.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0);
  const rSquared = totalVariance > 0 ? 1 - residualVariance / totalVariance : null;

  return { slope, intercept, mse, rSquared, count: n };
}

function interpolateAtX(points = [], targetX) {
  const clean = points
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .sort((a, b) => a.x - b.x);
  if (!clean.length || !Number.isFinite(targetX)) return null;
  if (targetX <= clean[0].x) return clean[0].y;
  if (targetX >= clean[clean.length - 1].x) return clean[clean.length - 1].y;

  for (let index = 0; index < clean.length - 1; index += 1) {
    const left = clean[index];
    const right = clean[index + 1];
    if (targetX < left.x || targetX > right.x) continue;
    if (targetX === left.x) return left.y;
    if (targetX === right.x) return right.y;
    const fraction = (targetX - left.x) / (right.x - left.x);
    return left.y + fraction * (right.y - left.y);
  }

  return null;
}

function readWorkbookRows(buffer, preferredSheetIndex = 1) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[preferredSheetIndex] || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function parsePowerWorkbook(rows = []) {
  return rows
    .map((row) => ({
      voltage: numeric(row?.[0]),
      currentRaw: numeric(row?.[1])
    }))
    .filter((row) => row.voltage !== null && row.currentRaw !== null);
}

function parseSpectrumWorkbook(rows = []) {
  return rows
    .map((row) => ({
      wavelengthMeters: numeric(row?.[0]),
      lossDb: numeric(row?.[1])
    }))
    .filter((row) => row.wavelengthMeters !== null && row.lossDb !== null)
    .map((row) => ({
      wavelengthNm: row.wavelengthMeters * 1e9,
      lossDb: row.lossDb
    }))
    .sort((a, b) => a.wavelengthNm - b.wavelengthNm);
}

function localProminence(values, index) {
  const peakValue = values[index];
  let leftMin = peakValue;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    leftMin = Math.min(leftMin, values[cursor]);
    if (values[cursor] > peakValue) break;
  }

  let rightMin = peakValue;
  for (let cursor = index; cursor < values.length; cursor += 1) {
    rightMin = Math.min(rightMin, values[cursor]);
    if (values[cursor] > peakValue) break;
  }

  return peakValue - Math.max(leftMin, rightMin);
}

function detectPeaks(points = [], minimumProminenceDb = 5) {
  if (points.length < 3) return [];
  const values = points.map((point) => point.lossDb);
  const peaks = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const current = values[index];
    if (!(current > values[index - 1] && current >= values[index + 1])) continue;
    const prominence = localProminence(values, index);
    if (prominence < minimumProminenceDb) continue;
    peaks.push({
      wavelengthNm: points[index].wavelengthNm,
      lossDb: points[index].lossDb,
      prominenceDb: prominence,
      index
    });
  }

  return peaks;
}

function pickTrackedPeak(peaks = [], previousWavelengthNm, direction = "increasing") {
  if (!peaks.length) return null;
  const preferred = direction === "decreasing"
    ? peaks.filter((peak) => peak.wavelengthNm <= previousWavelengthNm)
    : direction === "increasing"
      ? peaks.filter((peak) => peak.wavelengthNm >= previousWavelengthNm)
      : peaks;
  const candidates = preferred.length ? preferred : peaks;
  return [...candidates].sort(
    (left, right) => Math.abs(left.wavelengthNm - previousWavelengthNm) - Math.abs(right.wavelengthNm - previousWavelengthNm)
  )[0] || null;
}

function inferCurrentScale(powerRows = [], currentUnit = "auto") {
  if (currentUnit === "ma") return 1;
  if (currentUnit === "a") return 1000;

  const magnitudes = powerRows
    .map((row) => Math.abs(row.currentRaw))
    .filter((value) => Number.isFinite(value) && value > 0);
  const median = magnitudes.length
    ? [...magnitudes].sort((a, b) => a - b)[Math.floor(magnitudes.length / 2)]
    : 0;
  return median > 0.5 ? 1 : 1000;
}

function inferGroupMetadata(path = "", fallbackIndex = 1) {
  const joined = splitPathParts(path).join("_") || `heater_group_${fallbackIndex}`;
  const chipMatch = joined.match(/chip[_ -]?(\d+)/i);
  const slotMatch = joined.match(/slot[_ -]?(\d+)/i);
  const waferMatch = joined.match(/(mpw[_ -]?\d+|wafer[_ -]?[a-z0-9]+)/i);

  return {
    chipId: chipMatch ? `Chip${chipMatch[1]}` : `Heater${fallbackIndex}`,
    slotId: slotMatch ? `Slot${slotMatch[1]}` : "",
    waferLabel: waferMatch ? waferMatch[1].replace(/_/g, " ") : "",
    groupLabel: baseName(path) || `heater-group-${fallbackIndex}`
  };
}

function voltageFromSpectrumName(name = "") {
  const match = stripExtension(baseName(name)).match(/(^|[_ -])(-?\d+(?:\.\d+)?)V$/i) || stripExtension(baseName(name)).match(/(-?\d+(?:\.\d+)?)V/i);
  return match ? numeric(match[2] || match[1]) : null;
}

function groupHeaterFiles(files = []) {
  const withPaths = files.map((file) => ({
    file,
    path: relativeFilePath(file),
    dir: parentDirectory(relativeFilePath(file))
  }));

  const powerFiles = withPaths.filter(({ path }) => /^power\.(xlsx|xls)$/i.test(baseName(path)));
  const groups = [];

  if (powerFiles.length) {
    powerFiles.forEach((powerFile) => {
      const siblings = withPaths.filter(({ dir, path }) => dir === powerFile.dir && /\.(xlsx|xls)$/i.test(path));
      groups.push({
        key: powerFile.dir || stripExtension(baseName(powerFile.path)),
        powerFile: powerFile.file,
        spectrumFiles: siblings
          .filter(({ path }) => !/^power\.(xlsx|xls)$/i.test(baseName(path)))
          .map(({ file }) => file)
      });
    });
    return groups;
  }

  const workbookFiles = withPaths.filter(({ path }) => /\.(xlsx|xls)$/i.test(path));
  const fallbackPower = workbookFiles.find(({ path }) => /power/i.test(baseName(path)));
  if (fallbackPower) {
    return [{
      key: fallbackPower.dir || "heater-upload",
      powerFile: fallbackPower.file,
      spectrumFiles: workbookFiles
        .filter(({ path }) => path !== fallbackPower.path)
        .map(({ file }) => file)
    }];
  }

  return [];
}

async function parseHeaterGroup(group, groupIndex, options = {}) {
  const metadata = inferGroupMetadata(group.key, groupIndex + 1);
  const targetWavelengthNm = numeric(options.targetWavelengthNm) ?? 1550;
  const minimumProminenceDb = Math.max(numeric(options.minimumProminenceDb) ?? 5, 0);
  const shiftDirection = options.shiftDirection || "increasing";
  const blockName = options.blockName || "MZI Heater";

  const powerRows = parsePowerWorkbook(readWorkbookRows(await group.powerFile.arrayBuffer(), 0));
  if (!powerRows.length) {
    throw new Error(`Unable to read voltage/current rows from ${group.powerFile.name}.`);
  }

  const currentScale = inferCurrentScale(powerRows, options.currentUnit || "auto");
  const powerMap = new Map(
    powerRows.map((row) => {
      const currentMa = row.currentRaw * currentScale;
      return [row.voltage, {
        voltageV: row.voltage,
        currentMa,
        powerMw: row.voltage * currentMa,
        resistanceOhm: currentMa !== 0 ? row.voltage / (currentMa / 1000) : null
      }];
    })
  );

  const spectrumEntries = [];
  for (const file of group.spectrumFiles) {
    const voltage = voltageFromSpectrumName(file.name);
    if (voltage === null) continue;
    const powerInfo = powerMap.get(voltage) || null;
    const points = parseSpectrumWorkbook(readWorkbookRows(await file.arrayBuffer(), 1));
    if (!points.length) continue;
    spectrumEntries.push({
      file,
      voltageV: voltage,
      powerInfo,
      points,
      peaks: detectPeaks(points, minimumProminenceDb)
    });
  }

  spectrumEntries.sort((left, right) => left.voltageV - right.voltageV);
  if (!spectrumEntries.length) {
    throw new Error(`No heater sweep workbooks like 0V.xlsx, 1V.xlsx, ... were found alongside ${group.powerFile.name}.`);
  }

  const referenceEntry = spectrumEntries[0];
  const referencePeak = [...referenceEntry.peaks].sort(
    (left, right) => Math.abs(left.wavelengthNm - targetWavelengthNm) - Math.abs(right.wavelengthNm - targetWavelengthNm)
  )[0] || null;
  if (!referencePeak) {
    throw new Error(`No spectral peaks with prominence >= ${minimumProminenceDb} dB were found in ${referenceEntry.file.name}.`);
  }

  const fsrNmValues = [];
  for (let index = 0; index < referenceEntry.peaks.length - 1; index += 1) {
    fsrNmValues.push(referenceEntry.peaks[index + 1].wavelengthNm - referenceEntry.peaks[index].wavelengthNm);
  }
  const fsrNm = arrayAverage(fsrNmValues);

  let previousPeakNm = referencePeak.wavelengthNm;
  const sweepRows = [];
  const traceSeries = [];

  spectrumEntries.forEach((entry, index) => {
    const trackedPeak = index === 0 ? referencePeak : pickTrackedPeak(entry.peaks, previousPeakNm, shiftDirection);
    const trackedPeakNm = trackedPeak?.wavelengthNm ?? null;
    const wavelengthShiftNm = trackedPeakNm !== null ? trackedPeakNm - referencePeak.wavelengthNm : null;
    const phaseShiftPi = wavelengthShiftNm !== null && fsrNm ? (2 * wavelengthShiftNm) / fsrNm : null;
    const lossAtTargetDb = interpolateAtX(
      entry.points.map((point) => ({ x: point.wavelengthNm, y: point.lossDb })),
      targetWavelengthNm
    );
    const lossAtTrackedPeakDb = trackedPeak?.lossDb ?? null;
    if (trackedPeakNm !== null) previousPeakNm = trackedPeakNm;

    sweepRows.push({
      __normalized: true,
      source_name: relativeFilePath(entry.file) || entry.file.name,
      source_type: "Heater sweep workbook",
      wafer_label: metadata.waferLabel,
      slot_id: metadata.slotId,
      chip_id: metadata.chipId,
      die_x: null,
      die_y: null,
      metric_family: "heater",
      block_name: blockName,
      waveguide_type: "MZI heater",
      waveguide_id: `${entry.voltageV}V`,
      waveguide_index: index + 1,
      wavelength_nm: trackedPeakNm ?? targetWavelengthNm,
      relative_length_mm: null,
      optical_power_w: null,
      optical_power_dbm: null,
      launch_power_dbm: null,
      loss_db: lossAtTrackedPeakDb,
      transmission_db: lossAtTrackedPeakDb,
      insertion_loss_db: null,
      heater_power_mw: entry.powerInfo?.powerMw ?? null,
      pi_power_mw: null,
      phase_shift_pi: phaseShiftPi,
      current_ma: entry.powerInfo?.currentMa ?? null,
      voltage_v: entry.powerInfo?.voltageV ?? entry.voltageV,
      tracked_peak_wavelength_nm: trackedPeakNm,
      wavelength_shift_nm: wavelengthShiftNm,
      fsr_nm: fsrNm,
      resistance_ohm: entry.powerInfo?.resistanceOhm ?? null,
      loss_at_target_db: lossAtTargetDb,
      loss_at_tracked_peak_db: lossAtTrackedPeakDb,
      row_index: index + 1
    });

    traceSeries.push({
      label: `${entry.voltageV} V`,
      voltageV: entry.voltageV,
      powerMw: entry.powerInfo?.powerMw ?? null,
      currentMa: entry.powerInfo?.currentMa ?? null,
      trackedPeakNm,
      wavelengthShiftNm,
      phaseShiftPi,
      points: entry.points,
      peaks: entry.peaks
    });
  });

  const phaseFitPoints = sweepRows
    .filter((row) => row.heater_power_mw !== null && row.phase_shift_pi !== null)
    .map((row) => ({ x: row.heater_power_mw, y: row.phase_shift_pi }));
  const wavelengthFitPoints = sweepRows
    .filter((row) => row.heater_power_mw !== null && row.wavelength_shift_nm !== null)
    .map((row) => ({ x: row.heater_power_mw, y: row.wavelength_shift_nm }));
  const phaseFit = linearRegression(phaseFitPoints);
  const wavelengthFit = linearRegression(wavelengthFitPoints);
  const piPowerMw = phaseFit?.slope ? 1 / phaseFit.slope : wavelengthFit?.slope && fsrNm ? fsrNm / (2 * wavelengthFit.slope) : null;
  const currentAtPiMa = piPowerMw !== null
    ? interpolateAtX(sweepRows.map((row) => ({ x: row.heater_power_mw, y: row.current_ma })), piPowerMw)
    : null;
  const voltageAtPiV = piPowerMw !== null && currentAtPiMa ? piPowerMw / currentAtPiMa : null;
  const maxPhaseShiftPi = Math.max(...sweepRows.map((row) => row.phase_shift_pi ?? -Infinity));
  const validMaxPhaseShiftPi = Number.isFinite(maxPhaseShiftPi) ? maxPhaseShiftPi : null;

  const summaryRow = {
    __normalized: true,
    source_name: `${metadata.groupLabel}/heater-summary`,
    source_type: "Heater sweep summary",
    wafer_label: metadata.waferLabel,
    slot_id: metadata.slotId,
    chip_id: metadata.chipId,
    die_x: null,
    die_y: null,
    metric_family: "heater",
    block_name: blockName,
    waveguide_type: "MZI heater",
    waveguide_id: "SUMMARY",
    waveguide_index: null,
    wavelength_nm: referencePeak.wavelengthNm,
    relative_length_mm: null,
    optical_power_w: null,
    optical_power_dbm: null,
    launch_power_dbm: null,
    loss_db: sweepRows[0]?.loss_at_target_db ?? null,
    transmission_db: sweepRows[0]?.loss_at_target_db ?? null,
    insertion_loss_db: null,
    heater_power_mw: piPowerMw,
    pi_power_mw: piPowerMw,
    phase_shift_pi: 1,
    current_ma: currentAtPiMa,
    voltage_v: voltageAtPiV,
    tracked_peak_wavelength_nm: referencePeak.wavelengthNm,
    wavelength_shift_nm: null,
    fsr_nm: fsrNm,
    resistance_ohm: arrayAverage(sweepRows.map((row) => row.resistance_ohm)),
    loss_at_target_db: sweepRows[0]?.loss_at_target_db ?? null,
    loss_at_tracked_peak_db: sweepRows[0]?.loss_at_tracked_peak_db ?? null,
    heater_trace_series: traceSeries,
    heater_phase_fit: phaseFit,
    heater_wavelength_fit: wavelengthFit,
    heater_target_wavelength_nm: targetWavelengthNm,
    heater_peak_prominence_db: minimumProminenceDb,
    heater_shift_direction: shiftDirection,
    heater_vpi_v: voltageAtPiV,
    heater_ipi_ma: currentAtPiMa,
    heater_max_phase_shift_pi: validMaxPhaseShiftPi,
    row_index: sweepRows.length + 1
  };

  return {
    metadata,
    rows: [...sweepRows, summaryRow],
    summary: {
      chipId: metadata.chipId,
      piPowerMw,
      voltageAtPiV,
      currentAtPiMa,
      fsrNm,
      maxPhaseShiftPi: validMaxPhaseShiftPi,
      sweepCount: sweepRows.length
    }
  };
}

export async function parseHeaterMeasurementFiles(files = [], options = {}) {
  const groups = groupHeaterFiles(files);
  if (!groups.length) {
    throw new Error("Upload a heater folder that includes Power.xlsx plus bias sweep workbooks such as 0V.xlsx, 1V.xlsx, and 2V.xlsx.");
  }

  const groupResults = [];
  for (let index = 0; index < groups.length; index += 1) {
    groupResults.push(await parseHeaterGroup(groups[index], index, options));
  }

  const rows = groupResults.flatMap((result) => result.rows);
  const summaries = groupResults.map((result) => result.summary);
  const first = groupResults[0]?.metadata || {};

  return {
    rows,
    groups: groupResults.length,
    summaries,
    sourceMetaPatch: {
      name: groups.length === 1 ? `${first.groupLabel || "heater"} heater measurement` : `${groups.length} heater measurement groups`,
      type: "Heater folder upload",
      defaultMetricFamily: "heater"
    }
  };
}
