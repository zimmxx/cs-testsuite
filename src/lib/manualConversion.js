import * as XLSX from "xlsx";
import { numeric } from "./analysis";

const WAVELENGTH_ALIASES = [
  "wavelength",
  "wavelength (nm)",
  "wavelength_nm",
  "wavelength_m",
  "lambda",
  "wl"
];
const IL_ALIASES = [
  "il",
  "il (db)",
  "il_db",
  "insertion loss",
  "insertion_loss_db",
  "loss",
  "loss (db)"
];

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function sanitizeToken(value) {
  return String(value || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function powerDbmToWatts(powerDbm) {
  return Math.pow(10, Number(powerDbm) / 10) / 1000;
}

function isAliasMatch(value, aliases) {
  const normalized = normalizeHeader(value);
  return aliases.some((alias) => normalizeHeader(alias) === normalized);
}

function inferWavelengthScale(headerValue, sampleValue) {
  const normalized = normalizeHeader(headerValue);
  if (normalized.includes("(m)") || normalized.endsWith(" m") || normalized.includes("wavelength m")) {
    return 1e9;
  }
  if (normalized.includes("(um)") || normalized.endsWith(" um")) {
    return 1e3;
  }
  if (normalized.includes("(pm)") || normalized.endsWith(" pm")) {
    return 1e-3;
  }
  if (typeof sampleValue === "number" && Math.abs(sampleValue) < 0.01) {
    return 1e9;
  }
  return 1;
}

function findWorkbookColumns(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 8); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const wavelengthIndex = row.findIndex((cell) => isAliasMatch(cell, WAVELENGTH_ALIASES));
    const ilIndex = row.findIndex((cell) => isAliasMatch(cell, IL_ALIASES));
    if (wavelengthIndex >= 0 && ilIndex >= 0) {
      return { wavelengthIndex, ilIndex, dataStartIndex: rowIndex + 1 };
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const numericCells = row
      .map((cell, index) => ({ index, value: numeric(cell) }))
      .filter((cell) => cell.value !== null);
    if (numericCells.length >= 2) {
      return {
        wavelengthIndex: numericCells[0].index,
        ilIndex: numericCells[1].index,
        dataStartIndex: rowIndex
      };
    }
  }

  return null;
}

function buildConvertedRows(rows, columnInfo, launchPowerDbm) {
  const headerRow = rows[columnInfo.dataStartIndex - 1] || [];
  const firstDataRow = rows[columnInfo.dataStartIndex] || [];
  const wavelengthScale = inferWavelengthScale(
    headerRow[columnInfo.wavelengthIndex],
    numeric(firstDataRow?.[columnInfo.wavelengthIndex])
  );

  return rows
    .slice(columnInfo.dataStartIndex)
    .map((row) => {
      const wavelengthValue = numeric(row?.[columnInfo.wavelengthIndex]);
      const ilDb = numeric(row?.[columnInfo.ilIndex]);
      if (wavelengthValue === null || ilDb === null) return null;
      const wavelengthNm = wavelengthValue * wavelengthScale;
      const opticalPowerDbm = launchPowerDbm - ilDb;
      const opticalPowerW = powerDbmToWatts(opticalPowerDbm);
      return {
        wavelengthNm,
        ilDb,
        opticalPowerDbm,
        opticalPowerW
      };
    })
    .filter(Boolean);
}

export function isManualMeasurementWorkbook(file) {
  const fileName = String(file?.name || "");
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext !== "xlsx" && ext !== "xls") return false;
  if (!/^WG\d+\.(xlsx|xls)$/i.test(fileName)) return false;
  const relativePath = String(file?.webkitRelativePath || fileName);
  if (/loss[_ -]*mse[_ -]*vs[_ -]*wavelength/i.test(relativePath)) return false;
  if (/\.omr$/i.test(relativePath)) return false;
  return true;
}

export function parseManualMeasurementPath(file) {
  const relativePath = String(file?.webkitRelativePath || file?.name || "");
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  const fileName = parts[parts.length - 1] || "";
  const projectSegment = parts[0] || "ManualMeasurement";
  const slotSegment = parts.find((part) => /slot\s*\d+/i.test(part)) || "";
  const chipSegment = parts.find((part) => /chip\s*\d+/i.test(part)) || "";
  const flavorSegment = parts.find((part) => /rib|strip|slot/i.test(part)) || "";
  const waveguideMatch = fileName.match(/^WG(\d+)\.(xlsx|xls)$/i);
  const chipMatch = chipSegment.match(/chip\s*(\d+)/i);
  const slotMatch = slotSegment.match(/slot\s*(\d+)/i);

  const chipNumber = chipMatch ? Number(chipMatch[1]) : null;
  const slotNumber = slotMatch ? Number(slotMatch[1]) : null;
  const waveguideNumber = waveguideMatch ? Number(waveguideMatch[1]) : null;
  const projectToken = sanitizeToken(projectSegment) || "ManualMeasurement";
  const flavorToken = sanitizeToken(flavorSegment);
  const slotId = slotNumber !== null ? `Slot${slotNumber}` : "";
  const chipId = chipNumber !== null ? `Chip${chipNumber}` : "";
  const waveguideId = waveguideNumber !== null ? `WG${waveguideNumber}` : "";
  const prefixTokens = [`Wafer${projectToken}`];
  if (slotId) prefixTokens.push(slotId);
  if (flavorToken) prefixTokens.push(flavorToken.toLowerCase());
  prefixTokens.push("manual");
  const outputBaseName = `${prefixTokens.join("_")}_${chipId}_${waveguideId}`;

  return {
    relativePath,
    fileName,
    projectSegment,
    slotId,
    chipId,
    waveguideId,
    waveguideNumber,
    flavorSegment,
    outputBaseName
  };
}

function getWorkbookRows(workbook) {
  const candidateNames = workbook.SheetNames.filter((sheetName) => {
    const normalized = normalizeHeader(sheetName);
    return normalized === "il" || normalized.includes("insertion loss");
  });
  const orderedNames = [
    ...candidateNames,
    ...workbook.SheetNames.filter((sheetName) => !candidateNames.includes(sheetName))
  ];

  for (const sheetName of orderedNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const columnInfo = findWorkbookColumns(rawRows);
    if (columnInfo) {
      return { rawRows, columnInfo, sheetName };
    }
  }

  return null;
}

export async function convertManualMeasurementWorkbook(file, options = {}) {
  const launchPowerDbm = numeric(options.launchPowerDbm) ?? 10;
  const outputFormat = options.outputFormat === "csv" ? "csv" : "txt";
  const meta = parseManualMeasurementPath(file);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const workbookRows = getWorkbookRows(workbook);
  if (!workbookRows) {
    throw new Error(`Unable to identify wavelength and IL columns in ${meta.relativePath}.`);
  }
  const { rawRows, columnInfo, sheetName } = workbookRows;

  const convertedRows = buildConvertedRows(rawRows, columnInfo, launchPowerDbm);
  if (!convertedRows.length) {
    throw new Error(`No numeric wavelength/IL rows were found in ${meta.relativePath}.`);
  }

  const outputFileName = `${meta.outputBaseName}.${outputFormat}`;
  const content = outputFormat === "csv"
    ? ["wavelength_nm,optical_power_w", ...convertedRows.map((row) => `${row.wavelengthNm},${row.opticalPowerW}`)].join("\n")
    : convertedRows.map((row) => `${row.wavelengthNm}\t${row.opticalPowerW}`).join("\n");

  return {
    sourcePath: meta.relativePath,
    sourceName: file.name,
    outputFileName,
    outputFormat,
    content,
    chipId: meta.chipId,
    slotId: meta.slotId,
    waveguideId: meta.waveguideId,
    waveguideNumber: meta.waveguideNumber,
    rowCount: convertedRows.length,
    wavelengthMinNm: convertedRows[0]?.wavelengthNm ?? null,
    wavelengthMaxNm: convertedRows[convertedRows.length - 1]?.wavelengthNm ?? null,
    launchPowerDbm,
    parser: `xlsx (SheetJS CE, sheet: ${sheetName})`,
    flavor: meta.flavorSegment || ""
  };
}

export async function convertManualMeasurementFiles(files, options = {}) {
  const candidates = Array.from(files || []).filter(isManualMeasurementWorkbook);
  const ignored = Array.from(files || []).filter((file) => !isManualMeasurementWorkbook(file));
  const converted = [];
  const failed = [];

  for (const file of candidates) {
    try {
      converted.push(await convertManualMeasurementWorkbook(file, options));
    } catch (error) {
      failed.push({
        sourcePath: String(file.webkitRelativePath || file.name),
        message: error instanceof Error ? error.message : "Unknown conversion error."
      });
    }
  }

  return {
    converted,
    failed,
    ignored: ignored.map((file) => String(file.webkitRelativePath || file.name))
  };
}

export function buildManualConversionManifestCsv(entries) {
  const header = ["source_path", "output_file", "chip_id", "slot_id", "waveguide_id", "rows", "wavelength_min_nm", "wavelength_max_nm", "launch_power_dbm"];
  const lines = entries.map((entry) => [
    entry.sourcePath,
    entry.outputFileName,
    entry.chipId,
    entry.slotId,
    entry.waveguideId,
    entry.rowCount,
    entry.wavelengthMinNm,
    entry.wavelengthMaxNm,
    entry.launchPowerDbm
  ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day
  };
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, true);
  return bytes;
}

function concatUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

export function buildStoredZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const stamp = dosDateTime();

  entries.forEach((entry) => {
    const fileNameBytes = encoder.encode(entry.outputFileName);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    const localHeader = concatUint8Arrays([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(stamp.time),
      uint16(stamp.date),
      uint32(crc),
      uint32(dataBytes.length),
      uint32(dataBytes.length),
      uint16(fileNameBytes.length),
      uint16(0),
      fileNameBytes,
      dataBytes
    ]);
    localParts.push(localHeader);

    const centralHeader = concatUint8Arrays([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(stamp.time),
      uint16(stamp.date),
      uint32(crc),
      uint32(dataBytes.length),
      uint32(dataBytes.length),
      uint16(fileNameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(localOffset),
      fileNameBytes
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const endRecord = concatUint8Arrays([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(localOffset),
    uint16(0)
  ]);

  return new Blob([...localParts, centralDirectory, endRecord], { type: "application/zip" });
}
