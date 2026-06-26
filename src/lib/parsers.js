import * as XLSX from "xlsx";
import { numeric } from "./analysis";

const COLUMN_ALIASES = {
  chip_id: ["chip", "chip_id", "chip no", "chip number", "die", "die_id"],
  die_x: ["die_x", "x", "x_pos", "x coordinate", "col", "column"],
  die_y: ["die_y", "y", "y_pos", "y coordinate", "row"],
  metric_family: ["metric_family", "measurement_family", "analysis", "metric"],
  block_name: ["block_name", "device", "structure", "component", "building block"],
  waveguide_type: ["waveguide_type", "wg_type", "waveguide", "type"],
  wavelength_nm: ["wavelength_nm", "wavelength", "wl", "lambda"],
  relative_length_mm: ["relative_length_mm", "length_mm", "relative length", "wg_length_mm"],
  transmission_db: ["transmission_db", "transmission", "loss_db", "s21_db", "power_db"],
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
  "chip_id",
  "die_x",
  "die_y",
  "metric_family",
  "block_name",
  "waveguide_type",
  "wavelength_nm",
  "relative_length_mm",
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

export async function readFileRows(file) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return extractRowsFromWorkbook(buffer);
  }

  const text = await file.text();
  return parseDelimitedText(text);
}

export function buildNormalizedRows(rows, mapping, sourceMeta) {
  return rows.map((row, index) => {
    const normalized = {
      source_name: sourceMeta.name,
      source_type: sourceMeta.type,
      chip_id: mapping.chip_id ? row[mapping.chip_id] : "",
      die_x: mapping.die_x ? numeric(row[mapping.die_x]) : null,
      die_y: mapping.die_y ? numeric(row[mapping.die_y]) : null,
      metric_family: mapping.metric_family ? String(row[mapping.metric_family]).toLowerCase() : sourceMeta.defaultMetricFamily,
      block_name: mapping.block_name ? row[mapping.block_name] : "",
      waveguide_type: mapping.waveguide_type ? row[mapping.waveguide_type] : "",
      wavelength_nm: mapping.wavelength_nm ? numeric(row[mapping.wavelength_nm]) : sourceMeta.defaultWavelengthNm,
      relative_length_mm: mapping.relative_length_mm ? numeric(row[mapping.relative_length_mm]) : null,
      transmission_db: mapping.transmission_db ? numeric(row[mapping.transmission_db]) : null,
      insertion_loss_db: mapping.insertion_loss_db ? numeric(row[mapping.insertion_loss_db]) : null,
      heater_power_mw: mapping.heater_power_mw ? numeric(row[mapping.heater_power_mw]) : null,
      pi_power_mw: mapping.pi_power_mw ? numeric(row[mapping.pi_power_mw]) : null,
      phase_shift_pi: mapping.phase_shift_pi ? numeric(row[mapping.phase_shift_pi]) : null,
      current_ma: mapping.current_ma ? numeric(row[mapping.current_ma]) : null,
      voltage_v: mapping.voltage_v ? numeric(row[mapping.voltage_v]) : null,
      row_index: index + 1
    };

    if (normalized.heater_power_mw === null && normalized.current_ma !== null && normalized.voltage_v !== null) {
      normalized.heater_power_mw = normalized.current_ma * normalized.voltage_v;
    }

    return normalized;
  });
}

export function normalizedRowsToCsv(rows) {
  const header = REQUIRED_EXPORT_COLUMNS.join(",");
  const lines = rows.map((row) =>
    REQUIRED_EXPORT_COLUMNS.map((column) => {
      const value = row[column] ?? "";
      const escaped = String(value).replace(/"/g, "\"\"");
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(",")
  );

  return [header, ...lines].join("\n");
}

export function sourceTypeLabel(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "txt") return "WST txt";
  if (ext === "xlsx" || ext === "xls") return "Manual wafer excel";
  if (ext === "csv") return "CSV";
  return "Measurement file";
}

export function requiredColumns() {
  return REQUIRED_EXPORT_COLUMNS;
}
