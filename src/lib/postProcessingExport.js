import * as XLSX from "xlsx";
import { buildStoredZip } from "./manualConversion";
import { getMetricRange, metricLabel } from "./analysis";

const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";
const PLOT_FONT = "IBM Plex Sans, Arial, sans-serif";
const PLOT_COLORS = ["#4f8df3", "#ff8f45", "#0f8a83", "#9d5cf6", "#d6658f", "#2f7d68"];
const PLOT_TITLE_FONT_SIZE = 30;
const PLOT_AXIS_TITLE_FONT_SIZE = 22;
const PLOT_AXIS_TICK_FONT_SIZE = 18;
const PLOT_LEGEND_FONT_SIZE = 18;

let plotlyPromise = null;

function buildAxisTitle(text) {
  return {
    text,
    standoff: 18,
    font: { family: PLOT_FONT, size: PLOT_AXIS_TITLE_FONT_SIZE, color: "#16323b" }
  };
}

function buildTopLegend() {
  return {
    orientation: "h",
    x: 0,
    xanchor: "left",
    y: 1.04,
    yanchor: "bottom",
    font: { family: PLOT_FONT, size: PLOT_LEGEND_FONT_SIZE, color: "#16323b" }
  };
}

function arrayMin(values, fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function arrayMax(values, fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function average(values) {
  const clean = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function formatMetricValue(metricKey, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (metricKey === "propagation") return `${Number(value).toFixed(2)} dB/cm`;
  if (metricKey === "insertion") return `${Number(value).toFixed(2)} dB`;
  return `${Number(value).toFixed(2)} mW/pi`;
}

function buildBasePlotConfig(filename) {
  return {
    responsive: false,
    displaylogo: false,
    scrollZoom: false,
    staticPlot: true,
    toImageButtonOptions: {
      format: "png",
      filename,
      scale: 2
    },
    modeBarButtonsToRemove: ["select2d", "lasso2d"]
  };
}

function buildConfidenceBand(rows, fit) {
  if (!rows.length || !fit || rows.length < 3) return null;

  const points = rows
    .map((row) => ({ x: Number(row.relative_length_mm), y: Number(row.transmission_db) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 3) return null;

  const xValues = points.map((point) => point.x);
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const sxx = xValues.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!sxx) return null;

  const residuals = points.map((point) => point.y - (fit.slope * point.x + fit.intercept));
  const residualSumSquares = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const sigma = Math.sqrt(residualSumSquares / Math.max(points.length - 2, 1));
  const critical = 1.96;
  const minX = arrayMin(xValues);
  const maxX = arrayMax(xValues);
  const steps = 40;
  const x = Array.from({ length: steps }, (_, index) => minX + ((maxX - minX) * index) / (steps - 1));
  const y = x.map((value) => fit.slope * value + fit.intercept);
  const delta = x.map((value) => critical * sigma * Math.sqrt((1 / points.length) + (((value - meanX) ** 2) / sxx)));

  return {
    x,
    y,
    upper: y.map((value, index) => value + delta[index]),
    lower: y.map((value, index) => value - delta[index])
  };
}

function buildPropagationPlotSpec({ chip, projectCode, slotLabel, targetWavelengthNm, windowNm }) {
  if (!chip?.samples?.length || !chip?.fit) return null;

  const x = chip.samples.map((row) => row.relative_length_mm);
  const y = chip.samples.map((row) => row.transmission_db);
  const confidenceBand = buildConfidenceBand(chip.samples, chip.fit);
  const lossValue = formatNumber(chip.lossDbPerCm, 2);
  const rSquared = chip.mse !== null && chip.mse !== undefined ? formatNumber(1 - chip.mse, 3) : "--";
  const rmse = chip.mse !== null && chip.mse !== undefined ? formatNumber(Math.sqrt(chip.mse), 3) : "--";

  const data = [
    {
      type: "scatter",
      mode: "markers",
      name: "Window-averaged points",
      x,
      y,
      marker: { color: "#4f8df3", size: 10, line: { color: "#ffffff", width: 1.5 } },
      hovertemplate: "Length: %{x:.2f} mm<br>Transmission: %{y:.2f} dB<extra></extra>"
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Linear fit",
      x: confidenceBand?.x || [arrayMin(x), arrayMax(x)],
      y: confidenceBand?.y || [chip.fit.slope * arrayMin(x) + chip.fit.intercept, chip.fit.slope * arrayMax(x) + chip.fit.intercept],
      line: { color: "#0f8a83", width: 3 },
      hovertemplate: "Fit transmission: %{y:.2f} dB<extra></extra>"
    }
  ];

  if (confidenceBand) {
    data.push(
      {
        type: "scatter",
        mode: "lines",
        name: "95% confidence upper",
        x: confidenceBand.x,
        y: confidenceBand.upper,
        line: { color: "#f08a3c", width: 2, dash: "dot" },
        hovertemplate: "Upper bound: %{y:.2f} dB<extra></extra>"
      },
      {
        type: "scatter",
        mode: "lines",
        name: "95% confidence lower",
        x: confidenceBand.x,
        y: confidenceBand.lower,
        line: { color: "#f08a3c", width: 2, dash: "dot" },
        hovertemplate: "Lower bound: %{y:.2f} dB<extra></extra>"
      }
    );
  }

  return {
    data,
    layout: {
      width: 1600,
      height: 980,
      margin: { l: 112, r: 340, t: 180, b: 104 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#fbfcfc",
      hovermode: "closest",
      title: {
        text: `Project: ${projectCode} | ${slotLabel} | ${chip.chipId} | Propagation Loss = ${lossValue} dB/cm`,
        x: 0.02,
        xanchor: "left",
        xref: "container",
        y: 0.98,
        yanchor: "top",
        yref: "container",
        font: { family: PLOT_FONT, size: PLOT_TITLE_FONT_SIZE, color: "#16323b" }
      },
      annotations: [
        {
          xref: "paper",
          yref: "paper",
          x: 1.03,
          y: 0.98,
          xanchor: "left",
          yanchor: "top",
          align: "left",
          showarrow: false,
          bordercolor: "#d8e3e8",
          borderwidth: 1,
          borderpad: 12,
          bgcolor: "#f8fbfb",
          font: { family: PLOT_FONT, size: 18, color: "#16323b" },
          text: [
            `<b>Fit Results</b>`,
            `Propagation loss: ${lossValue} dB/cm`,
            `Intercept: ${formatNumber(chip.interceptDb, 2)} dB`,
            `R2: ${rSquared}`,
            `RMSE: ${rmse} dB`,
            `Fit points: ${chip.samples.length}`,
            `Lambda0: ${targetWavelengthNm} nm`,
            `Window: +/- ${windowNm} nm`,
            `Spectral samples: ${chip.spectralAverageCount || 0}`
          ].join("<br>")
        }
      ],
      xaxis: {
        title: buildAxisTitle("Relative length (mm)"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        zeroline: false,
        gridcolor: "#e3ecef",
        linecolor: "#9db2b8",
        ticks: "outside"
      },
      yaxis: {
        title: buildAxisTitle("Transmission (dB)"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        zeroline: false,
        gridcolor: "#e3ecef",
        linecolor: "#9db2b8",
        ticks: "outside"
      },
      legend: buildTopLegend(),
      font: { family: PLOT_FONT, size: 17, color: "#16323b" }
    },
    config: buildBasePlotConfig(`${chip.chipId}-propagation-fit`)
  };
}

function buildPropagationSpectrumPlotSpec({ chip, projectCode }) {
  if (!chip?.spectralSeries?.length) return null;

  const x = chip.spectralSeries.map((point) => point.wavelengthNm);
  const bandStart = Math.max(chip.targetWavelengthNm - chip.windowNm, arrayMin(x));
  const bandEnd = Math.min(chip.targetWavelengthNm + chip.windowNm, arrayMax(x));

  return {
    data: [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "Propagation loss",
        x,
        y: chip.spectralSeries.map((point) => point.lossDbPerCm),
        marker: { color: "#3974e7", size: 8 },
        line: { color: "#3974e7", width: 3 },
        hovertemplate: "Center: %{x:.1f} nm<br>Loss: %{y:.3f} dB/cm<extra></extra>"
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "MSE",
        x,
        y: chip.spectralSeries.map((point) => point.mse),
        yaxis: "y2",
        marker: { color: "#f08a3c", size: 7 },
        line: { color: "#f08a3c", width: 2.5, dash: "dash" },
        hovertemplate: "Center: %{x:.1f} nm<br>MSE: %{y:.4f}<extra></extra>"
      }
    ],
    layout: {
      width: 1600,
      height: 840,
      margin: { l: 112, r: 120, t: 180, b: 104 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#fbfcfc",
      hovermode: "x unified",
      title: {
        text: `Project: ${projectCode} | ${chip.chipId} | Propagation Loss Spectrum`,
        x: 0.02,
        xanchor: "left",
        xref: "container",
        y: 0.98,
        yanchor: "top",
        yref: "container",
        font: { family: PLOT_FONT, size: PLOT_TITLE_FONT_SIZE, color: "#16323b" }
      },
      xaxis: {
        title: buildAxisTitle("Wavelength interval center (nm)"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        tickmode: "linear",
        dtick: Math.max(chip.spectralStepNm || 10, 1),
        zeroline: false,
        gridcolor: "#e3ecef",
        linecolor: "#9db2b8",
        ticks: "outside"
      },
      yaxis: {
        title: buildAxisTitle("Propagation loss (dB/cm)"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        zeroline: false,
        gridcolor: "#e3ecef",
        linecolor: "#9db2b8",
        ticks: "outside"
      },
      yaxis2: {
        title: buildAxisTitle("MSE"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        overlaying: "y",
        side: "right",
        zeroline: false,
        showgrid: false,
        linecolor: "#c2783d",
        ticks: "outside"
      },
      shapes: [
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: bandStart,
          x1: bandEnd,
          y0: 0,
          y1: 1,
          fillcolor: "rgba(79,141,243,0.12)",
          line: { width: 0 }
        }
      ],
      legend: buildTopLegend(),
      font: { family: PLOT_FONT, size: 17, color: "#16323b" }
    },
    config: buildBasePlotConfig(`${chip.chipId}-propagation-spectrum`)
  };
}

function buildTransmissionSpectrumPlotSpec({ chip, projectCode }) {
  if (!chip?.transmissionSeries?.length) return null;

  const minWavelength = arrayMin(chip.transmissionSeries.flatMap((item) => item.points.map((point) => point.wavelengthNm)));

  return {
    data: chip.transmissionSeries.map((item, index) => ({
      type: "scatter",
      mode: "lines",
      name: item.waveguideId,
      x: item.points.map((point) => point.wavelengthNm),
      y: item.points.map((point) => point.transmissionDb),
      line: { color: PLOT_COLORS[index % PLOT_COLORS.length], width: 2.4 },
      hovertemplate: `${item.waveguideId}<br>Wavelength: %{x:.2f} nm<br>Transmission: %{y:.2f} dB<extra></extra>`
    })),
    layout: {
      width: 1600,
      height: 840,
      margin: { l: 112, r: 50, t: 180, b: 104 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#fbfcfc",
      hovermode: "x unified",
      title: {
        text: `Project: ${projectCode} | ${chip.chipId} | Transmission Spectrum`,
        x: 0.02,
        xanchor: "left",
        xref: "container",
        y: 0.98,
        yanchor: "top",
        yref: "container",
        font: { family: PLOT_FONT, size: PLOT_TITLE_FONT_SIZE, color: "#16323b" }
      },
      xaxis: {
        title: buildAxisTitle("Wavelength (nm)"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        tickmode: "linear",
        tick0: Math.floor(minWavelength / 10) * 10,
        dtick: 10,
        zeroline: false,
        gridcolor: "#e3ecef",
        linecolor: "#9db2b8",
        ticks: "outside"
      },
      yaxis: {
        title: buildAxisTitle("Transmission (dB)"),
        tickfont: { family: PLOT_FONT, size: PLOT_AXIS_TICK_FONT_SIZE, color: "#294650" },
        automargin: true,
        zeroline: false,
        gridcolor: "#e3ecef",
        linecolor: "#9db2b8",
        ticks: "outside"
      },
      shapes: [
        {
          type: "line",
          xref: "x",
          yref: "paper",
          x0: chip.targetWavelengthNm,
          x1: chip.targetWavelengthNm,
          y0: 0,
          y1: 1,
          line: { color: "#7dc6c4", width: 2, dash: "dash" }
        }
      ],
      legend: buildTopLegend(),
      font: { family: PLOT_FONT, size: 17, color: "#16323b" }
    },
    config: buildBasePlotConfig(`${chip.chipId}-transmission-spectrum`)
  };
}

async function ensurePlotlyLoaded() {
  if (typeof window === "undefined") {
    throw new Error("Window is not available.");
  }
  if (window.Plotly) return window.Plotly;
  if (plotlyPromise) return plotlyPromise;

  plotlyPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plotly-loader="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Plotly));
      existing.addEventListener("error", () => reject(new Error("Failed to load Plotly.")));
      return;
    }

    const script = document.createElement("script");
    script.src = PLOTLY_CDN;
    script.async = true;
    script.dataset.plotlyLoader = "true";
    script.onload = () => resolve(window.Plotly);
    script.onerror = () => reject(new Error("Failed to load Plotly."));
    document.head.appendChild(script);
  });

  return plotlyPromise;
}

async function renderPlotSpecToPng(plot, width = 1600, height = 900, scale = 2) {
  const Plotly = await ensurePlotlyLoaded();
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  try {
    await Plotly.newPlot(container, plot.data, { ...plot.layout, width, height }, { ...plot.config, responsive: false, staticPlot: true });
    const dataUrl = await Plotly.toImage(container, { format: "png", width, height, scale });
    const response = await fetch(dataUrl);
    return await response.blob();
  } finally {
    Plotly.purge(container);
    container.remove();
  }
}

function sanitizeSegment(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || fallback;
}

function slotFolderName(slotValue) {
  return String(slotValue || "SlotUndefined").replace(/^slot/i, "SLOT");
}

function formatDateParts(dateValue = new Date()) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  const hours = String(dateValue.getHours()).padStart(2, "0");
  const minutes = String(dateValue.getMinutes()).padStart(2, "0");
  const seconds = String(dateValue.getSeconds()).padStart(2, "0");
  return {
    dateStamp: `${year}${month}${day}`,
    timeStamp: `${hours}${minutes}${seconds}`
  };
}

function blobToUint8Array(blob) {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const WAFER_SCALE_COLORS = {
  low: "#2fa66d",
  medium: "#f2c94c",
  high: "#d94b4b",
  empty: "#eef2f4"
};

function mixHexColors(startColor, endColor, ratio) {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const channels = [1, 3, 5].map((offset) => {
    const start = Number.parseInt(startColor.slice(offset, offset + 2), 16);
    const end = Number.parseInt(endColor.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * clampedRatio).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function colorForValue(value, range) {
  if (!range || value === null || value === undefined) return WAFER_SCALE_COLORS.empty;
  if (value <= range.mid) {
    const ratio = (value - range.min) / Math.max(range.mid - range.min, 0.0001);
    return mixHexColors(WAFER_SCALE_COLORS.low, WAFER_SCALE_COLORS.medium, ratio);
  }
  const ratio = (value - range.mid) / Math.max(range.max - range.mid, 0.0001);
  return mixHexColors(WAFER_SCALE_COLORS.medium, WAFER_SCALE_COLORS.high, ratio);
}
function buildWaferMapSvg({ cells, metricKey, overlayMode, notchOrientation, title, subtitle, colorScaleMin, colorScaleMid, colorScaleMax }) {
  const validCells = Array.isArray(cells) ? cells : [];
  const rowValues = Array.from(new Set(validCells.map((cell) => cell.dieY).filter((value) => value !== null && value !== undefined))).sort((a, b) => b - a);
  const cols = Math.max(arrayMax(validCells.map((cell) => cell.dieX || 0), 0), 1);
  const rows = rowValues.length || 1;
  const cellSize = 62;
  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;
  const waferPadding = 120;
  const titleBlockHeight = 110;
  const scaleWidth = 140;
  const width = waferPadding * 2 + gridWidth + scaleWidth;
  const height = titleBlockHeight + waferPadding + gridHeight + 80;
  const automaticRange = getMetricRange(validCells.filter((cell) => cell.hasMeasurement && cell.isVisible !== false));
  const requestedMin = colorScaleMin === null || colorScaleMin === "" ? null : Number(colorScaleMin);
  const requestedMid = colorScaleMid === null || colorScaleMid === "" ? null : Number(colorScaleMid);
  const requestedMax = colorScaleMax === null || colorScaleMax === "" ? null : Number(colorScaleMax);
  const hasManualEndpoints = Number.isFinite(requestedMin) && Number.isFinite(requestedMax) && requestedMax > requestedMin;
  const rangeMin = hasManualEndpoints ? requestedMin : automaticRange?.min;
  const rangeMax = hasManualEndpoints ? requestedMax : automaticRange?.max;
  const range = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
    ? {
      min: rangeMin,
      mid: Number.isFinite(requestedMid) && requestedMid > rangeMin && requestedMid < rangeMax ? requestedMid : (rangeMin + rangeMax) / 2,
      max: rangeMax
    }
    : null;
  const cellLookup = new Map(validCells.map((cell) => [`${cell.dieX}-${cell.dieY}`, cell]));
  const waferRadius = Math.max(gridWidth, gridHeight) / 2 + 48;
  const waferCenterX = waferPadding + gridWidth / 2;
  const waferCenterY = titleBlockHeight + waferPadding / 2 + gridHeight / 2;
  const notch = String(notchOrientation || "south").toLowerCase();

  const notchSvg = notch === "north"
    ? `<rect x="${waferCenterX - 42}" y="${waferCenterY - waferRadius - 12}" width="84" height="28" rx="12" fill="#ffffff" />`
    : notch === "east"
      ? `<rect x="${waferCenterX + waferRadius - 16}" y="${waferCenterY - 42}" width="28" height="84" rx="12" fill="#ffffff" />`
      : notch === "west"
        ? `<rect x="${waferCenterX - waferRadius - 12}" y="${waferCenterY - 42}" width="28" height="84" rx="12" fill="#ffffff" />`
        : `<rect x="${waferCenterX - 42}" y="${waferCenterY + waferRadius - 16}" width="84" height="28" rx="12" fill="#ffffff" />`;

  const gridCells = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const x = colIndex + 1;
      const y = rowValues[rowIndex];
      const cell = cellLookup.get(`${x}-${y}`) || null;
      const cellX = waferPadding + colIndex * cellSize;
      const cellY = titleBlockHeight + 48 + rowIndex * cellSize;
      const visible = cell?.isVisible !== false;
      const label = visible && cell
        ? overlayMode === "value" && cell.value !== null && cell.value !== undefined
          ? formatNumber(cell.value, metricKey === "heater" ? 1 : 2)
          : overlayMode === "chip" ? cell.chipId : ""
        : "";
      const fill = cell ? colorForValue(visible ? cell.value : null, range) : "#f4f7f8";
      gridCells.push(`
        <rect x="${cellX + 4}" y="${cellY + 4}" width="${cellSize - 8}" height="${cellSize - 8}" rx="12" fill="${fill}" stroke="#d7e2e6" stroke-width="1.5" />
        ${label ? `<text x="${cellX + cellSize / 2}" y="${cellY + cellSize / 2 + 6}" text-anchor="middle" font-family="${PLOT_FONT}" font-size="${overlayMode === "value" ? 16 : 15}" font-weight="600" fill="#16323b">${escapeXml(label)}</text>` : ""}
      `);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <text x="48" y="48" font-family="${PLOT_FONT}" font-size="32" font-weight="700" fill="#16323b">${escapeXml(title)}</text>
    <text x="48" y="84" font-family="${PLOT_FONT}" font-size="19" fill="#48626b">${escapeXml(subtitle)}</text>
    <circle cx="${waferCenterX}" cy="${waferCenterY}" r="${waferRadius}" fill="#f7fbfc" stroke="#d6e3e7" stroke-width="3" />
    ${notchSvg}
    ${gridCells.join("\n")}
    <text x="${waferPadding + gridWidth + 40}" y="${titleBlockHeight + 54}" font-family="${PLOT_FONT}" font-size="21" font-weight="700" fill="#16323b">${escapeXml(metricLabel(metricKey) || metricKey)}</text>
    <rect x="${waferPadding + gridWidth + 64}" y="${titleBlockHeight + 82}" width="28" height="${gridHeight - 24}" rx="14" fill="url(#scaleGradient)" />
    <text x="${waferPadding + gridWidth + 104}" y="${titleBlockHeight + 96}" font-family="${PLOT_FONT}" font-size="18" fill="#16323b">${range ? formatNumber(range.max, 2) : "--"}</text>
    <text x="${waferPadding + gridWidth + 104}" y="${titleBlockHeight + 82 + (gridHeight - 24) / 2}" font-family="${PLOT_FONT}" font-size="18" fill="#16323b">${range ? formatNumber(range.mid, 2) : "--"}</text>
    <text x="${waferPadding + gridWidth + 104}" y="${titleBlockHeight + gridHeight + 46}" font-family="${PLOT_FONT}" font-size="18" fill="#16323b">${range ? formatNumber(range.min, 2) : "--"}</text>
    <defs>
      <linearGradient id="scaleGradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${WAFER_SCALE_COLORS.high}" />
        <stop offset="50%" stop-color="${WAFER_SCALE_COLORS.medium}" />
        <stop offset="100%" stop-color="${WAFER_SCALE_COLORS.low}" />
      </linearGradient>
    </defs>
  </svg>`;
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
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function buildWaferMapPng({ cells, metricKey, overlayMode, notchOrientation, title, subtitle, colorScaleMin, colorScaleMid, colorScaleMax }) {
  const svg = buildWaferMapSvg({ cells, metricKey, overlayMode, notchOrientation, title, subtitle, colorScaleMin, colorScaleMid, colorScaleMax });
  return svgToPngBlob(svg, 1600, 1200);
}

function workbookBytes({ projectCode, slotLabel, selectedDate, summaryRows, propagationMetrics }) {
  const workbook = XLSX.utils.book_new();
  const chipSheetRows = summaryRows.map((row) => ({
    Chip: row.chipId,
    DieX: row.dieX,
    DieY: row.dieY,
    PropagationLoss_dB_per_cm: row.lossDbPerCm,
    Intercept_dB: row.interceptDb,
    R2: row.rSquared,
    RMSE_dB: row.rmseDb,
    FitPoints: row.fitPoints,
    PeakWavelength_nm: row.peakWavelengthNm,
    PeakTransmission_dB: row.peakTransmissionDb,
    InsertionLoss_dB: row.insertionLossDb,
    Bandwidth3dB_nm: row.bandwidth3dBNm,
    MeasurementCount: row.measurementCount,
    SpectralPoints: row.spectralPointCount,
    FitPass: row.fitPass
  }));
  const summarySheetRows = [
    { Metric: "Project", Value: projectCode },
    { Metric: "Slot", Value: slotLabel },
    { Metric: "Selected Date", Value: selectedDate || "" },
    { Metric: "Measured Chips", Value: propagationMetrics.summaryStats.measuredChips },
    { Metric: "Passing Chips", Value: propagationMetrics.summaryStats.fittedChips },
    { Metric: "Failed Fits", Value: propagationMetrics.summaryStats.failedFits },
    { Metric: "Pass Rate (%)", Value: propagationMetrics.passRate },
    { Metric: "Average Propagation Loss (all chips, dB/cm)", Value: propagationMetrics.averages.allChipsDbPerCm },
    { Metric: "Average Propagation Loss (passing chips, dB/cm)", Value: propagationMetrics.averages.filteredDbPerCm },
    { Metric: "Average Peak Wavelength (nm)", Value: propagationMetrics.averages.peakWavelengthNm },
    { Metric: "Average Insertion Loss (dB)", Value: propagationMetrics.averages.insertionLossDb },
    { Metric: "Average 3 dB Bandwidth (nm)", Value: propagationMetrics.averages.bandwidth3dBNm },
    { Metric: "Target Wavelength (nm)", Value: propagationMetrics.targetWavelengthNm },
    { Metric: "Averaging Window (+/- nm)", Value: propagationMetrics.windowNm },
    { Metric: "MSE Threshold", Value: propagationMetrics.mseThreshold },
    { Metric: "Spectral Step (nm)", Value: propagationMetrics.spectralStepNm }
  ];

  const chipSheet = XLSX.utils.json_to_sheet(chipSheetRows);
  const summarySheet = XLSX.utils.json_to_sheet(summarySheetRows);
  chipSheet["!cols"] = [
    { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 10 }
  ];
  summarySheet["!cols"] = [{ wch: 42 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, chipSheet, "Chip Summary");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Project Summary");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

function chipSummaryRows(chips, waferCells = []) {
  const coordinateLookup = new Map(waferCells.map((cell) => [cell.chipId, cell]));
  return chips.map((chip) => {
    const coordinate = coordinateLookup.get(chip.chipId);
    return {
      chipId: chip.chipId,
      dieX: coordinate?.dieX ?? chip.dieX,
      dieY: coordinate?.dieY ?? chip.dieY,
      lossDbPerCm: chip.lossDbPerCm,
      interceptDb: chip.interceptDb,
      rSquared: chip.mse !== null && chip.mse !== undefined ? 1 - chip.mse : null,
      rmseDb: chip.mse !== null && chip.mse !== undefined ? Math.sqrt(chip.mse) : null,
      fitPoints: chip.samples?.length || 0,
      peakWavelengthNm: chip.transmissionSummary?.peakWavelengthNm ?? null,
      peakTransmissionDb: chip.transmissionSummary?.peakTransmissionDb ?? null,
      insertionLossDb: chip.transmissionSummary?.insertionLossDb ?? null,
      bandwidth3dBNm: chip.transmissionSummary?.bandwidth3dBNm ?? null,
      measurementCount: chip.measurementCount,
      spectralPointCount: chip.spectralSeries?.length || 0,
      fitPass: chip.passMse ? "PASS" : "CHECK"
    };
  });
}
function archiveBaseName(projectCode, slotLabel, now) {
  const { dateStamp, timeStamp } = formatDateParts(now);
  return `post_processed_${sanitizeSegment(projectCode, "MPWUNDEFINED")}_${sanitizeSegment(slotLabel.toUpperCase(), "SLOTUNDEFINED")}_${dateStamp}_${timeStamp}`;
}

export async function generatePostProcessedArchive({
  projectCode,
  slot,
  selectedDate,
  sourceMeta,
  metrics,
  currentWaferTemplate,
  currentWaferCells,
  onProgress
}) {
  const slotLabel = slotFolderName(slot);
  const baseName = archiveBaseName(projectCode, slotLabel, new Date());
  const zipEntries = [];
  const propagationChips = metrics?.propagation?.byChip || [];
  const summaryRows = chipSummaryRows(propagationChips, currentWaferCells);

  onProgress?.(`Preparing ${propagationChips.length} chip exports...`);

  for (let index = 0; index < propagationChips.length; index += 1) {
    const chip = propagationChips[index];
    const chipFolder = `chips/${sanitizeSegment(chip.chipId, `chip_${index + 1}`)}`;
    onProgress?.(`Rendering chip ${index + 1}/${propagationChips.length}: ${chip.chipId}`);

    const fitPlot = buildPropagationPlotSpec({
      chip,
      projectCode,
      slotLabel,
      targetWavelengthNm: sourceMeta.propagationTargetWavelengthNm,
      windowNm: sourceMeta.propagationWindowNm
    });
    if (fitPlot) {
      const png = await renderPlotSpecToPng(fitPlot, 1600, 980, 2);
      zipEntries.push({ outputFileName: `${chipFolder}/propagation_loss_fit.png`, contentBytes: await blobToUint8Array(png) });
    }

    const spectrumPlot = buildPropagationSpectrumPlotSpec({ chip, projectCode });
    if (spectrumPlot) {
      const png = await renderPlotSpecToPng(spectrumPlot, 1600, 840, 2);
      zipEntries.push({ outputFileName: `${chipFolder}/propagation_loss_spectrum.png`, contentBytes: await blobToUint8Array(png) });
    }

    const transmissionPlot = buildTransmissionSpectrumPlotSpec({ chip, projectCode });
    if (transmissionPlot) {
      const png = await renderPlotSpecToPng(transmissionPlot, 1600, 840, 2);
      zipEntries.push({ outputFileName: `${chipFolder}/transmission_spectrum.png`, contentBytes: await blobToUint8Array(png) });
    }
  }

  onProgress?.("Rendering wafermaps...");

  const waferSubtitle = `${projectCode} | ${slotLabel} | Template: ${currentWaferTemplate?.name || "Current Template"}`;
  const waferMapViews = [
    {
      fileName: "project/wafermaps/wafermap_chip_numbers.png",
      metricKey: "propagation",
      overlayMode: "chip",
      title: `Wafermap - Chip Numbers`
    },
    {
      fileName: "project/wafermaps/wafermap_propagation_loss.png",
      metricKey: "propagation",
      overlayMode: "value",
      title: `Wafermap - Propagation Loss`
    }
  ];

  if ((metrics?.insertion?.waferMetric || []).length) {
    waferMapViews.push({
      fileName: "project/wafermaps/wafermap_insertion_loss.png",
      metricKey: "insertion",
      overlayMode: "value",
      title: `Wafermap - Insertion Loss`
    });
  }
  if ((metrics?.heater?.waferMetric || []).length) {
    waferMapViews.push({
      fileName: "project/wafermaps/wafermap_heater_efficiency.png",
      metricKey: "heater",
      overlayMode: "value",
      title: `Wafermap - Heater Efficiency`
    });
  }

  const waferCellsByMetric = {
    propagation: currentWaferCells,
    insertion: currentWaferCells.map((cell) => {
      const metricCell = (metrics?.insertion?.waferMetric || []).find((item) => item.chipId === cell.chipId);
      return {
        ...cell,
        value: metricCell?.value ?? null,
        detail: metricCell?.detail ?? cell.detail,
        hasMeasurement: metricCell?.value !== null && metricCell?.value !== undefined
      };
    }),
    heater: currentWaferCells.map((cell) => {
      const metricCell = (metrics?.heater?.waferMetric || []).find((item) => item.chipId === cell.chipId);
      return {
        ...cell,
        value: metricCell?.value ?? null,
        detail: metricCell?.detail ?? cell.detail,
        hasMeasurement: metricCell?.value !== null && metricCell?.value !== undefined
      };
    })
  };

  for (const view of waferMapViews) {
    const png = await buildWaferMapPng({
      cells: waferCellsByMetric[view.metricKey] || [],
      metricKey: view.metricKey,
      overlayMode: view.overlayMode,
      notchOrientation: currentWaferTemplate?.notchOrientation || "south",
      title: view.title,
      subtitle: waferSubtitle,
      colorScaleMin: sourceMeta.waferColorScaleMin,
      colorScaleMid: sourceMeta.waferColorScaleMid,
      colorScaleMax: sourceMeta.waferColorScaleMax
    });
    zipEntries.push({ outputFileName: view.fileName, contentBytes: await blobToUint8Array(png) });
  }

  onProgress?.("Building Excel summary...");
  zipEntries.push({
    outputFileName: `project/data/${sanitizeSegment(projectCode, "project")}_${sanitizeSegment(slotLabel, "slot")}_summary.xlsx`,
    contentBytes: workbookBytes({ projectCode, slotLabel, selectedDate, summaryRows, propagationMetrics: metrics.propagation })
  });

  zipEntries.push({
    outputFileName: `project/data/${sanitizeSegment(projectCode, "project")}_${sanitizeSegment(slotLabel, "slot")}_summary.json`,
    content: JSON.stringify({
      projectCode,
      slot: slotLabel,
      selectedDate,
      generatedAt: new Date().toISOString(),
      propagationSummary: metrics.propagation.summaryStats,
      averages: metrics.propagation.averages,
      chips: summaryRows
    }, null, 2)
  });

  const zipBlob = buildStoredZip(zipEntries, { rootFolderName: baseName });
  return {
    baseName,
    zipBlob,
    chipCount: propagationChips.length,
    fileCount: zipEntries.length
  };
}
