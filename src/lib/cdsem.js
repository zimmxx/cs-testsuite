import { chipNumberFromId, getWaferTemplateLayout } from "./waferTemplates";

const CHIP_ALIASES = ["chip", "chip id", "chip_id", "chip number", "chip no"];
const COLUMN_ALIASES = ["column", "col", "x", "x coordinate", "die x", "die_x"];
const ROW_ALIASES = ["row", "y", "y coordinate", "die y", "die_y"];
const RESERVED_HINTS = [
  "wafer",
  "slot",
  "project",
  "mpw",
  "operator",
  "notes",
  "comment",
  "date",
  "time",
  "id"
];

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesAlias(header, aliases) {
  const normalized = normalizeHeader(header);
  return aliases.some((alias) => normalizeHeader(alias) === normalized);
}

function coordinateLookup(template) {
  const layout = getWaferTemplateLayout(template || []);
  const chipByCoordinate = new Map();
  const coordinateByChip = new Map();

  layout.forEach((slot) => {
    chipByCoordinate.set(`${slot.dieX}:${slot.dieY}`, slot.chipId);
    coordinateByChip.set(slot.chipId, { dieX: slot.dieX, dieY: slot.dieY });
    const chipNumber = chipNumberFromId(slot.chipId);
    if (chipNumber !== null) {
      coordinateByChip.set(`Chip${chipNumber}`, { dieX: slot.dieX, dieY: slot.dieY });
    }
  });

  return { chipByCoordinate, coordinateByChip };
}

function detectColumns(rows = []) {
  const sample = rows.find((row) => row && typeof row === "object") || {};
  const columns = Object.keys(sample);
  const chipIdColumn = columns.find((column) => matchesAlias(column, CHIP_ALIASES)) || "";
  const columnField = columns.find((column) => matchesAlias(column, COLUMN_ALIASES)) || "";
  const rowField = columns.find((column) => matchesAlias(column, ROW_ALIASES)) || "";
  const numericParameterColumns = columns.filter((column) => {
    if ([chipIdColumn, columnField, rowField].includes(column)) return false;
    const normalized = normalizeHeader(column);
    if (RESERVED_HINTS.some((hint) => normalized === hint || normalized.startsWith(`${hint} `))) return false;
    const values = rows
      .slice(0, 50)
      .map((row) => numeric(row?.[column]))
      .filter((value) => value !== null);
    return values.length >= Math.max(2, Math.min(4, rows.length));
  });

  return {
    chipIdColumn,
    columnField,
    rowField,
    parameterColumns: numericParameterColumns
  };
}

export function detectCdSemStructure(rows = []) {
  const detected = detectColumns(rows);
  const preferredParameter = detected.parameterColumns.find((column) => /si.*waveguide.*mid|waveguide.*mid|si mid/i.test(String(column)))
    || detected.parameterColumns[0]
    || "";

  return {
    ...detected,
    selectedParameter: preferredParameter
  };
}

export function buildCdSemDataset(rows = [], options = {}) {
  const detected = detectCdSemStructure(rows);
  const selectedParameter = options.selectedParameter || detected.selectedParameter;
  const { chipByCoordinate, coordinateByChip } = coordinateLookup(options.waferTemplate);

  const entries = rows.map((row, index) => {
    const dieX = detected.columnField ? numeric(row?.[detected.columnField]) : null;
    const dieY = detected.rowField ? numeric(row?.[detected.rowField]) : null;
    const rawChipId = detected.chipIdColumn ? String(row?.[detected.chipIdColumn] || "").trim() : "";
    const chipId = rawChipId
      || (dieX !== null && dieY !== null ? chipByCoordinate.get(`${dieX}:${dieY}`) || "" : "");
    const chipCoordinate = chipId ? coordinateByChip.get(chipId) : null;
    const values = Object.fromEntries(
      detected.parameterColumns.map((column) => [column, numeric(row?.[column])])
    );

    return {
      id: `cdsem-${index + 1}`,
      chipId: chipId || (dieX !== null && dieY !== null ? `(${dieX}, ${dieY})` : `row-${index + 1}`),
      dieX: chipCoordinate?.dieX ?? dieX,
      dieY: chipCoordinate?.dieY ?? dieY,
      sourceChipId: rawChipId || null,
      sourceColumn: dieX,
      sourceRow: dieY,
      value: selectedParameter ? values[selectedParameter] ?? null : null,
      values
    };
  }).filter((entry) => entry.dieX !== null && entry.dieY !== null);

  return {
    structure: detected,
    selectedParameter,
    parameterColumns: detected.parameterColumns,
    entries
  };
}

export function summarizeCdSemDataset(entries = [], selectedParameter = "") {
  const values = entries.map((entry) => entry.value).filter((value) => value !== null);
  const measuredChipIds = new Set(entries.map((entry) => entry.chipId));
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;

  return {
    measuredChips: measuredChipIds.size,
    points: values.length,
    average,
    min,
    max,
    selectedParameter
  };
}

export function correlateCdSemWithPropagation(entries = [], propagationCells = []) {
  const propagationByChip = new Map(
    propagationCells
      .filter((cell) => cell?.chipId && cell.value !== null && cell.value !== undefined)
      .map((cell) => [cell.chipId, cell.value])
  );
  const overlap = entries
    .filter((entry) => entry.value !== null && propagationByChip.has(entry.chipId))
    .map((entry) => ({
      chipId: entry.chipId,
      cdsemValue: entry.value,
      propagationLossDbPerCm: propagationByChip.get(entry.chipId)
    }));

  if (overlap.length < 2) {
    return {
      overlap,
      correlation: null
    };
  }

  const cdsemMean = overlap.reduce((sum, item) => sum + item.cdsemValue, 0) / overlap.length;
  const propagationMean = overlap.reduce((sum, item) => sum + item.propagationLossDbPerCm, 0) / overlap.length;
  const numerator = overlap.reduce(
    (sum, item) => sum + ((item.cdsemValue - cdsemMean) * (item.propagationLossDbPerCm - propagationMean)),
    0
  );
  const cdsemSpread = Math.sqrt(overlap.reduce((sum, item) => sum + (item.cdsemValue - cdsemMean) ** 2, 0));
  const propagationSpread = Math.sqrt(overlap.reduce((sum, item) => sum + (item.propagationLossDbPerCm - propagationMean) ** 2, 0));

  return {
    overlap,
    correlation: cdsemSpread && propagationSpread ? numerator / (cdsemSpread * propagationSpread) : null
  };
}
