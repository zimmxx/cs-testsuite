import * as XLSX from "xlsx";
import { numeric } from "./analysis";
import { applyWaferTemplate } from "./waferTemplates";

const COLUMN_ALIASES = {
  chip_id: ["chip", "chip_id", "chip no", "chip number", "die", "die_id"],
  die_x: ["die_x", "x", "x_pos", "x coordinate", "col", "column"],
  die_y: ["die_y", "y", "y_pos", "y coordinate", "row"],
  metric_family: ["metric_family", "measurement_family", "analysis", "metric"],
  block_name: ["block_name", "device", "structure", "component", "building block"],
  waveguide_type: ["waveguide_type", "wg_type", "waveguide", "type"],
  waveguide_id: ["waveguide_id", "wg", "waveguide id"],
  waveguide_index: ["waveguide_index", "wg_index"],
  slot_id: ["slot_id", "slot"],
  wafer_label: ["wafer_label", "wafer", "wafer_id"],
  wavelength_nm: ["wavelength_nm", "wavelength", "wl", "lambda"],
  relative_length_mm: ["relative_length_mm", "length_mm", "relative length", "wg_length_mm"],
  optical_power_w: ["optical_power_w", "optical power", "power_w"],
  optical_power_dbm: ["optical_power_dbm", "power_dbm", "measured_power_dbm"],
  launch_power_dbm: ["launch_power_dbm", "laser_power_dbm", "input_power_dbm"],
  loss_db: ["loss_db", "optical_loss_db", "total_loss_db"],
  transmission_db: ["transmission_db", "transmission", "s21_db", "power_db"],
  insertion_loss_db: ["insertion_loss_db", "insertion loss", "il_db"],
  heater_power_mw: ["heater_power_mw", "power_mw", "heater_power"],
  pi_power_mw: ["pi_power_mw", "mW/pi", "pi_power", "pi power"],
  phase_shift_pi: ["phase_shift_pi", "phase_pi", "phase shift"],
  current_ma: ["current_ma", "current", "i_ma"],
  voltage_v: ["voltage_v", "voltage", "v_v"]
};

const REQUIRED_EXPORT_COLUMNS = [
  "source_name",
  "source_type",
  "wafer_label",
  "slot_id",
  "chip_id",
  "die_x",
  "die_y",
  "metric_family",
  "block_name",
  "waveguide_type",
  "waveguide_id",
  "waveguide_index",
  "wavelength_nm",
  "relative_length_mm",
  "optical_power_w",
  "optical_power_dbm",
  "launch_power_dbm",
  "loss_db",
  "transmission_db",
  "insertion_loss_db",
  "heater_power_mw",
  "pi_power_mw",
  "phase_shift_pi",
  "current_ma",
  "voltage_v"
];

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function detectDelimiter(text) {
  if (text.includes("\t")) return "\t";
  if (text.includes(";")) return ";";
  return ",";
}

function parseDelimitedText(text) {
  const delimiter = detectDelimiter(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(delimiter).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    return headers.reduce((row, header, index) => {
      row[header] = values[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

function scoreAlias(header, aliases) {
  const normalizedHeader = normalizeHeader(header);
  return aliases.some((alias) => normalizeHeader(alias) === normalizedHeader);
}

function fileNameMetadata(fileName) {
  const baseName = String(fileName || "").replace(/\.[^.]+$/, "");
  const chip = baseName.match(/(?:^|[_-])Chip(\d+)/i);
  const waveguide = baseName.match(/(?:^|[_-])WG(\d+)/i);
  const slot = baseName.match(/(?:^|[_-])Slot(\d+)/i);
  const wafer = baseName.match(/(?:^|[_-])Wafer(\d+)/i);
  const chipMarkerIndex = baseName.search(/(?:^|[_-])Chip\d+/i);
  const waferLabelPrefix =
    chipMarkerIndex > 0 ? baseName.slice(0, chipMarkerIndex).replace(/[_-]+$/, "") : baseName;
  const waveguideFlavor = /rib/i.test(baseName)
    ? "Rib waveguide"
    : /strip/i.test(baseName)
      ? "Strip waveguide"
      : /slot/i.test(baseName)
        ? "Slot waveguide"
        : "Waveguide";
  return {
    chipId: chip ? `Chip${chip[1]}` : "",
    chipIndex: chip ? Number(chip[1]) : null,
    waveguideId: waveguide ? `WG${waveguide[1]}` : "",
    waveguideIndex: waveguide ? Number(waveguide[1]) : null,
    slotId: slot ? `Slot${slot[1]}` : "",
    slotIndex: slot ? Number(slot[1]) : null,
    waferLabel: waferLabelPrefix || (wafer ? `Wafer${wafer[1]}` : ""),
    waferIndex: wafer ? Number(wafer[1]) : null,
    waveguideFlavor
  };
}

function toDbmFromWatts(powerW) {
  if (powerW === null || powerW === undefined || powerW <= 0) return null;
  return 10 * Math.log10(powerW * 1000);
}

function isTwoColumnNumericLine(line) {
  const parts = String(line || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return false;
  return numeric(parts[0]) !== null && numeric(parts[1]) !== null;
}

function isAutomatedTraceText(text, fileName) {
  const meta = fileNameMetadata(fileName);
  if (!meta.chipId || !meta.waveguideId) return false;
  const firstLines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!firstLines.length) return false;
  return firstLines.every(isTwoColumnNumericLine);
}

function parseAutomatedTraceText(text, fileName, options = {}) {
  const launchPowerDbm = numeric(options.launchPowerDbm) ?? 10;
  const meta = fileNameMetadata(fileName);
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [wavelengthValue, powerValue] = line.split(/\s+/);
      const wavelengthNm = numeric(wavelengthValue);
      const opticalPowerW = numeric(powerValue);
      const opticalPowerDbm = toDbmFromWatts(opticalPowerW);
      const lossDb = opticalPowerDbm === null ? null : launchPowerDbm - opticalPowerDbm;
      return {
        __normalized: true,
        source_name: fileName,
        source_type: "Automated WST trace",
        wafer_label: meta.waferLabel,
        slot_id: meta.slotId,
        chip_id: meta.chipId,
        die_x: null,
        die_y: null,
        metric_family: "propagation",
        block_name: meta.waveguideId || "Waveguide",
        waveguide_type: meta.slotId ? `${meta.slotId} ${meta.waveguideFlavor}` : meta.waveguideFlavor,
        waveguide_id: meta.waveguideId,
        waveguide_index: meta.waveguideIndex,
        wavelength_nm: wavelengthNm,
        relative_length_mm: null,
        optical_power_w: opticalPowerW,
        optical_power_dbm: opticalPowerDbm,
        launch_power_dbm: launchPowerDbm,
        loss_db: lossDb,
        transmission_db: opticalPowerDbm,
        insertion_loss_db: null,
        heater_power_mw: null,
        pi_power_mw: null,
        phase_shift_pi: null,
        current_ma: null,
        voltage_v: null,
        row_index: index + 1
      };
    })
    .filter((row) => row.wavelength_nm !== null && row.optical_power_w !== null);
}

function resolveMappedLength(row, sourceMeta) {
  if (row.relative_length_mm !== null && row.relative_length_mm !== undefined && row.relative_length_mm !== "") {
    return numeric(row.relative_length_mm);
  }
  const map = sourceMeta?.waveguideLengthByIndex || {};
  const waveguideIndex = numeric(row.waveguide_index);
  if (waveguideIndex !== null && Object.prototype.hasOwnProperty.call(map, String(waveguideIndex))) {
    return numeric(map[String(waveguideIndex)]);
  }
  return null;
}

export function inferColumnMap(columns) {
  const mapping = {};
  Object.entries(COLUMN_ALIASES).forEach(([canonical, aliases]) => {
    const match = columns.find((column) => scoreAlias(column, aliases));
    if (match) mapping[canonical] = match;
  });
  return mapping;
}

export function extractRowsFromWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export function readNamedTextRows(fileName, text, options = {}) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if ((ext === "txt" || ext === "csv") && isAutomatedTraceText(text, fileName)) {
    return parseAutomatedTraceText(text, fileName, options);
  }

  return parseDelimitedText(text);
}

export async function readFileRows(file, options = {}) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return extractRowsFromWorkbook(buffer);
  }

  const text = await file.text();
  return readNamedTextRows(file.name, text, options);
}

export function buildNormalizedRows(rows, mapping, sourceMeta) {
  const templateChoice = sourceMeta?.waferTemplateLayout?.length ? sourceMeta.waferTemplateLayout : sourceMeta?.waferTemplateId;
  return rows.map((row, index) => {
    if (row.__normalized) {
      const normalized = applyWaferTemplate({
        ...row,
        source_name: row.source_name || sourceMeta.name,
        source_type: row.source_type || sourceMeta.type,
        wavelength_nm: numeric(row.wavelength_nm) ?? sourceMeta.defaultWavelengthNm,
        launch_power_dbm: numeric(row.launch_power_dbm) ?? sourceMeta.launchPowerDbm ?? null,
        optical_power_w: numeric(row.optical_power_w),
        optical_power_dbm: numeric(row.optical_power_dbm),
        loss_db: numeric(row.loss_db),
        transmission_db: numeric(row.transmission_db),
        relative_length_mm: resolveMappedLength(row, sourceMeta),
        waveguide_index: numeric(row.waveguide_index),
        die_x: numeric(row.die_x),
        die_y: numeric(row.die_y),
        row_index: row.row_index ?? index + 1
      }, templateChoice);
      return normalized;
    }

    const normalized = applyWaferTemplate({
      source_name: sourceMeta.name,
      source_type: sourceMeta.type,
      wafer_label: mapping.wafer_label ? row[mapping.wafer_label] : "",
      slot_id: mapping.slot_id ? row[mapping.slot_id] : "",
      chip_id: mapping.chip_id ? row[mapping.chip_id] : "",
      die_x: mapping.die_x ? numeric(row[mapping.die_x]) : null,
      die_y: mapping.die_y ? numeric(row[mapping.die_y]) : null,
      metric_family: mapping.metric_family ? String(row[mapping.metric_family]).toLowerCase() : sourceMeta.defaultMetricFamily,
      block_name: mapping.block_name ? row[mapping.block_name] : "",
      waveguide_type: mapping.waveguide_type ? row[mapping.waveguide_type] : "",
      waveguide_id: mapping.waveguide_id ? row[mapping.waveguide_id] : "",
      waveguide_index: mapping.waveguide_index ? numeric(row[mapping.waveguide_index]) : null,
      wavelength_nm: mapping.wavelength_nm ? numeric(row[mapping.wavelength_nm]) : sourceMeta.defaultWavelengthNm,
      relative_length_mm: mapping.relative_length_mm ? numeric(row[mapping.relative_length_mm]) : null,
      optical_power_w: mapping.optical_power_w ? numeric(row[mapping.optical_power_w]) : null,
      optical_power_dbm: mapping.optical_power_dbm ? numeric(row[mapping.optical_power_dbm]) : null,
      launch_power_dbm: mapping.launch_power_dbm ? numeric(row[mapping.launch_power_dbm]) : sourceMeta.launchPowerDbm ?? null,
      loss_db: mapping.loss_db ? numeric(row[mapping.loss_db]) : null,
      transmission_db: mapping.transmission_db ? numeric(row[mapping.transmission_db]) : null,
      insertion_loss_db: mapping.insertion_loss_db ? numeric(row[mapping.insertion_loss_db]) : null,
      heater_power_mw: mapping.heater_power_mw ? numeric(row[mapping.heater_power_mw]) : null,
      pi_power_mw: mapping.pi_power_mw ? numeric(row[mapping.pi_power_mw]) : null,
      phase_shift_pi: mapping.phase_shift_pi ? numeric(row[mapping.phase_shift_pi]) : null,
      current_ma: mapping.current_ma ? numeric(row[mapping.current_ma]) : null,
      voltage_v: mapping.voltage_v ? numeric(row[mapping.voltage_v]) : null,
      row_index: index + 1
    }, templateChoice);

    if (normalized.heater_power_mw === null && normalized.current_ma !== null && normalized.voltage_v !== null) {
      normalized.heater_power_mw = normalized.current_ma * normalized.voltage_v;
    }
    if (normalized.loss_db === null && normalized.launch_power_dbm !== null && normalized.optical_power_dbm !== null) {
      normalized.loss_db = normalized.launch_power_dbm - normalized.optical_power_dbm;
    }

    return normalized;
  });
}

export function normalizedRowsToCsv(rows) {
  const header = REQUIRED_EXPORT_COLUMNS.join(",");
  const lines = rows.map((row) =>
    REQUIRED_EXPORT_COLUMNS.map((column) => {
      const value = row[column] ?? "";
      const escaped = String(value).replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(",")
  );

  return [header, ...lines].join("\n");
}

export function sourceTypeLabel(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if ((ext === "txt" || ext === "csv") && fileNameMetadata(fileName).chipId && fileNameMetadata(fileName).waveguideId) {
    return "Automated WST trace";
  }
  if (ext === "txt") return "WST txt";
  if (ext === "xlsx" || ext === "xls") return "Manual wafer excel";
  if (ext === "csv") return "CSV";
  return "Measurement file";
}

export function requiredColumns() {
  return REQUIRED_EXPORT_COLUMNS;
}











