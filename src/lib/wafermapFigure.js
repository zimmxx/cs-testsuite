import { getMetricRange, metricLabel } from "./analysis";
import { shortChipLabel } from "./waferTemplates";

export const WAFER_SCALE_COLORS = {
  low: "#2fa66d",
  medium: "#f2c94c",
  high: "#d94b4b",
  empty: "#eef2f4"
};

function formatMetricNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function mixHexColors(startColor, endColor, ratio) {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const channels = [1, 3, 5].map((offset) => {
    const start = Number.parseInt(startColor.slice(offset, offset + 2), 16);
    const end = Number.parseInt(endColor.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * clampedRatio).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function resolveWaferColorRange(cells, colorScaleMin, colorScaleMid, colorScaleMax) {
  const automaticRange = getMetricRange((cells || []).filter((cell) => cell.hasMeasurement && cell.isVisible !== false));
  const parseThreshold = (value) => value === null || value === undefined || value === "" ? null : Number(value);
  const requestedMin = parseThreshold(colorScaleMin);
  const requestedMid = parseThreshold(colorScaleMid);
  const requestedMax = parseThreshold(colorScaleMax);
  const hasManualEndpoints = Number.isFinite(requestedMin) && Number.isFinite(requestedMax) && requestedMax > requestedMin;
  const min = hasManualEndpoints ? requestedMin : automaticRange?.min;
  const max = hasManualEndpoints ? requestedMax : automaticRange?.max;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const midpoint = (min + max) / 2;
  return {
    min,
    mid: Number.isFinite(requestedMid) && requestedMid > min && requestedMid < max ? requestedMid : midpoint,
    max
  };
}

export function waferColorForValue(value, range) {
  if (!range || value === null || value === undefined) return WAFER_SCALE_COLORS.empty;
  if (value <= range.mid) {
    const ratio = (value - range.min) / Math.max(range.mid - range.min, 0.0001);
    return mixHexColors(WAFER_SCALE_COLORS.low, WAFER_SCALE_COLORS.medium, ratio);
  }
  const ratio = (value - range.mid) / Math.max(range.max - range.mid, 0.0001);
  return mixHexColors(WAFER_SCALE_COLORS.medium, WAFER_SCALE_COLORS.high, ratio);
}

export function buildWaferMapFigureModel({
  cells,
  metricKey,
  overlayMode = "none",
  selectedChip = "",
  colorScaleMin = null,
  colorScaleMid = null,
  colorScaleMax = null
}) {
  const safeCells = Array.isArray(cells) ? cells : [];
  const layoutCells = safeCells.filter((cell) => cell.dieX !== null && cell.dieX !== undefined && cell.dieY !== null && cell.dieY !== undefined);
  const range = resolveWaferColorRange(layoutCells, colorScaleMin, colorScaleMid, colorScaleMax);
  const colValues = Array.from(new Set(layoutCells.map((cell) => cell.dieX))).sort((a, b) => a - b);
  const rowValues = Array.from(new Set(layoutCells.map((cell) => cell.dieY))).sort((a, b) => b - a);
  const minCol = colValues.length ? colValues[0] : 1;
  const maxCol = colValues.length ? colValues[colValues.length - 1] : 1;
  const minRow = rowValues.length ? rowValues[rowValues.length - 1] : 1;
  const maxRow = rowValues.length ? rowValues[0] : 1;
  const colCount = Math.max(maxCol - minCol + 1, 1);
  const rowCount = Math.max(maxRow - minRow + 1, 1);
  const svgWidth = 100;
  const svgHeight = 108;
  const waferCenterX = 52;
  const waferCenterY = 58.5;
  const waferRadius = 43.8;
  const mapWidth = 73.2;
  const mapHeight = 73.2;
  const stepX = mapWidth / colCount;
  const stepY = mapHeight / rowCount;
  const cellWidth = Math.min(stepX * 1.08, 5.64);
  const cellHeight = Math.min(stepY * 1.08, 5.64);
  const labelFontSize = overlayMode === "chip" ? (layoutCells.length > 90 ? 2.16 : 2.52) : 2.16;
  const centreChipX = layoutCells.find((cell) => shortChipLabel(cell.chipId) === "51")?.dieX ?? ((minCol + maxCol) / 2);
  const centreChipY = layoutCells.find((cell) => shortChipLabel(cell.chipId) === "51")?.dieY ?? ((minRow + maxRow) / 2);
  const mapLeft = waferCenterX - ((centreChipX - minCol) + 0.5) * stepX;
  const mapTop = waferCenterY - ((maxRow - centreChipY) + 0.5) * stepY;

  const labelFor = (cell) => {
    if (overlayMode === "none") return "";
    if (overlayMode === "value") {
      return cell.isActiveInView && cell.value !== null && cell.value !== undefined
        ? formatMetricNumber(cell.value, metricKey === "heater" ? 1 : 2)
        : "";
    }
    return overlayMode === "chip" ? shortChipLabel(cell.chipId) : "";
  };

  const positionedCells = layoutCells.map((cell) => {
    const selected = Boolean(selectedChip === cell.chipId);
    const interactive = Boolean(cell.hasMeasurement);
    const visibleValue = interactive && cell.isActiveInView ? cell.value : null;
    return {
      ...cell,
      selected,
      interactive,
      visibleValue,
      label: labelFor(cell),
      fill: visibleValue !== null && visibleValue !== undefined ? waferColorForValue(visibleValue, range) : undefined,
      x: mapLeft + (cell.dieX - minCol) * stepX + (stepX - cellWidth) / 2,
      y: mapTop + (maxRow - cell.dieY) * stepY + (stepY - cellHeight) / 2
    };
  });

  return {
    range,
    colValues,
    rowValues,
    svgWidth,
    svgHeight,
    waferCenterX,
    waferCenterY,
    waferRadius,
    mapLeft,
    mapTop,
    stepX,
    stepY,
    cellWidth,
    cellHeight,
    labelFontSize,
    cells: [
      ...positionedCells.filter((cell) => !cell.selected),
      ...positionedCells.filter((cell) => cell.selected)
    ]
  };
}

export function buildWaferMapSvgDocument({
  cells,
  metricKey,
  overlayMode = "none",
  selectedChip = "",
  templateName = "",
  title = "",
  subtitle = "",
  colorScaleMin = null,
  colorScaleMid = null,
  colorScaleMax = null,
  includeHeader = true
}) {
  const figure = buildWaferMapFigureModel({
    cells,
    metricKey,
    overlayMode,
    selectedChip,
    colorScaleMin,
    colorScaleMid,
    colorScaleMax
  });
  const headerHeight = includeHeader ? 28 : 0;
  const width = 1120;
  const height = includeHeader ? 840 : 760;
  const mapScale = includeHeader ? 6.1 : 6.5;
  const mapOriginX = 90;
  const mapOriginY = includeHeader ? 148 : 64;
  const scaleOriginX = width - 180;
  const scaleOriginY = mapOriginY + 74;
  const scaleHeight = includeHeader ? 292 : 324;
  const showScale = overlayMode !== "chip";
  const badgeWidth = Math.max(140, String(templateName || "").length * 8 + 34);
  const mapContent = `
    <g transform="translate(${mapOriginX} ${mapOriginY}) scale(${mapScale})">
      <circle cx="${figure.waferCenterX}" cy="${figure.waferCenterY}" r="${figure.waferRadius}" fill="#fbfcfc" stroke="#a9b9bf" stroke-width="0.45" />
      <path d="M ${figure.waferCenterX - 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32} A 2.16 2.16 0 0 1 ${figure.waferCenterX + 2.16} ${figure.waferCenterY + figure.waferRadius - 1.32}" fill="none" stroke="#a9b9bf" stroke-width="0.4" />
      ${figure.colValues.map((column) => `
        <text x="${figure.mapLeft + (column - figure.colValues[0]) * figure.stepX + figure.stepX / 2}" y="10.8" text-anchor="middle" fill="#6e8792" font-size="2.94px" font-weight="600">${escapeXml(column)}</text>
      `).join("")}
      ${figure.rowValues.map((row) => `
        <text x="5" y="${figure.mapTop + (figure.rowValues[0] - row) * figure.stepY + figure.stepY / 2 + 0.4}" text-anchor="middle" fill="#6e8792" font-size="2.94px" font-weight="600">${escapeXml(row)}</text>
      `).join("")}
      ${figure.cells.map((cell) => `
        <g opacity="${cell.excluded ? 0.42 : 1}">
          <rect
            x="${cell.x}"
            y="${cell.y}"
            width="${figure.cellWidth}"
            height="${figure.cellHeight}"
            rx="0.35"
            fill="${cell.fill || "#eef2f4"}"
            stroke="${cell.selected ? "#102d38" : "rgba(255,255,255,0.78)"}"
            stroke-width="${cell.selected ? 0.45 : 0.28}"
          />
          ${cell.label ? `
            <text
              x="${cell.x + figure.cellWidth / 2}"
              y="${cell.y + figure.cellHeight / 2 + figure.labelFontSize * 0.32}"
              text-anchor="middle"
              fill="${cell.interactive && cell.isActiveInView ? "#12333d" : "#7f9097"}"
              font-size="${figure.labelFontSize}px"
              font-weight="${cell.interactive && cell.isActiveInView ? 700 : 600}"
            >${escapeXml(cell.label)}</text>
          ` : ""}
        </g>
      `).join("")}
    </g>
  `;

  return {
    width,
    height,
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="22" fill="#ffffff" stroke="#d8e3e8" />
  ${includeHeader ? `
    <text x="42" y="54" fill="#16323b" font-family="IBM Plex Sans, Arial, sans-serif" font-size="20" font-weight="700">${escapeXml(title || `Wafermap - ${metricLabel(metricKey)}`)}</text>
    ${templateName ? `
      <rect x="42" y="74" width="${badgeWidth}" height="28" rx="14" fill="#ffffff" stroke="#d8e3e8" />
      <text x="56" y="93" fill="#6e8792" font-family="IBM Plex Sans, Arial, sans-serif" font-size="12" font-weight="600">${escapeXml(templateName)}</text>
    ` : ""}
    ${subtitle ? `<text x="42" y="${templateName ? 122 : 92}" fill="#5e6f75" font-family="IBM Plex Sans, Arial, sans-serif" font-size="14">${escapeXml(subtitle)}</text>` : ""}
  ` : ""}
  ${mapContent}
  ${showScale ? `
    <text x="${scaleOriginX - 8}" y="${scaleOriginY - 18}" fill="#16323b" font-family="IBM Plex Sans, Arial, sans-serif" font-size="16" font-weight="700">${escapeXml(metricLabel(metricKey) || metricKey)}</text>
    <text x="${scaleOriginX + 26}" y="${scaleOriginY - 2}" fill="#c53b3b" font-family="IBM Plex Sans, Arial, sans-serif" font-size="12" font-weight="700">HIGH</text>
    <rect x="${scaleOriginX + 30}" y="${scaleOriginY + 10}" width="18" height="${scaleHeight}" rx="9" fill="url(#waferScaleGradient)" />
    <text x="${scaleOriginX + 66}" y="${scaleOriginY + 18}" fill="#35515b" font-family="IBM Plex Sans, Arial, sans-serif" font-size="12">${figure.range ? formatMetricNumber(figure.range.max, 2) : "--"}</text>
    <text x="${scaleOriginX + 66}" y="${scaleOriginY + scaleHeight / 2 + 4}" fill="#35515b" font-family="IBM Plex Sans, Arial, sans-serif" font-size="12">${figure.range ? formatMetricNumber(figure.range.mid, 2) : "--"}</text>
    <text x="${scaleOriginX + 66}" y="${scaleOriginY + scaleHeight - 2}" fill="#35515b" font-family="IBM Plex Sans, Arial, sans-serif" font-size="12">${figure.range ? formatMetricNumber(figure.range.min, 2) : "--"}</text>
    <text x="${scaleOriginX + 26}" y="${scaleOriginY + scaleHeight + 34}" fill="#1f7d58" font-family="IBM Plex Sans, Arial, sans-serif" font-size="12" font-weight="700">LOW</text>
  ` : ""}
  <defs>
    <linearGradient id="waferScaleGradient" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${WAFER_SCALE_COLORS.high}" />
      <stop offset="50%" stop-color="${WAFER_SCALE_COLORS.medium}" />
      <stop offset="100%" stop-color="${WAFER_SCALE_COLORS.low}" />
    </linearGradient>
  </defs>
</svg>`
  };
}

async function svgToPngBlob(svgText, width, height) {
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to render wafermap image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export wafermap PNG."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildWaferMapPng(options) {
  const { svg, width, height } = buildWaferMapSvgDocument(options);
  const exportScale = options.includeHeader === false ? 2.2 : 2;
  return svgToPngBlob(svg, Math.round(width * exportScale), Math.round(height * exportScale));
}

export function openWaferMapFigureWindow({ svg, title }) {
  if (typeof window === "undefined") return;
  const popup = window.open("", "_blank", "width=1280,height=920");
  if (!popup) return;
  popup.document.open();
  popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title || "Wafermap Figure")}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; padding: 24px; background: #edf4f6; font-family: 'IBM Plex Sans', Arial, sans-serif; }
      .figure-shell { max-width: 1200px; margin: 0 auto; }
      svg { width: 100%; height: auto; display: block; box-shadow: 0 18px 48px rgba(22,50,59,0.08); border-radius: 20px; }
    </style>
  </head>
  <body>
    <div class="figure-shell">${svg}</div>
  </body>
</html>`);
  popup.document.close();
}

export function downloadBlob(blob, fileName) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}
