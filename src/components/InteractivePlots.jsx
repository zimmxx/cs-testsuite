import { useEffect, useMemo, useRef, useState } from "react";

const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";
let plotlyPromise = null;

function loadPlotly() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window is not available."));
  if (window.Plotly) return Promise.resolve(window.Plotly);
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

function openPlotInWindow({ title, data, layout, config }) {
  if (typeof window === "undefined") return;
  const popup = window.open("", "_blank", "width=1180,height=760");
  if (!popup) return;

  const encodedData = JSON.stringify(data);
  const encodedLayout = JSON.stringify({ ...layout, autosize: true, width: undefined, height: undefined });
  const encodedConfig = JSON.stringify(config);
  popup.document.open();
  popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="${PLOTLY_CDN}"></script>
    <style>
      body { margin: 0; font-family: 'IBM Plex Sans', Arial, sans-serif; background: #ffffff; }
      #plot { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="plot"></div>
    <script>
      const data = ${encodedData};
      const layout = ${encodedLayout};
      const config = ${encodedConfig};
      window.addEventListener('load', () => {
        const render = () => {
          if (!window.Plotly) {
            window.setTimeout(render, 50);
            return;
          }
          window.Plotly.newPlot('plot', data, layout, config);
        };
        render();
      });
    </script>
  </body>
</html>`);
  popup.document.close();
}

function stripFileExtension(fileName) {
  return String(fileName || "").replace(/\.[^.]+$/, "");
}

function sanitizeExportBaseName(fileName, fallback = "plot") {
  const cleaned = stripFileExtension(fileName)
    .replace(/[\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function downloadTextFile(content, fileName, mimeType = "text/plain;charset=utf-8") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}

function buildStandalonePlotHtml({ title, data, layout, config }) {
  const encodedData = JSON.stringify(data);
  const encodedLayout = JSON.stringify({ ...layout, autosize: true, width: undefined, height: undefined });
  const encodedConfig = JSON.stringify({ ...config, responsive: true });
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="${PLOTLY_CDN}"></script>
    <style>
      body { margin: 0; font-family: 'IBM Plex Sans', Arial, sans-serif; background: #ffffff; }
      #plot { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="plot"></div>
    <script>
      const data = ${encodedData};
      const layout = ${encodedLayout};
      const config = ${encodedConfig};
      window.addEventListener('load', () => {
        const render = () => {
          if (!window.Plotly) {
            window.setTimeout(render, 50);
            return;
          }
          window.Plotly.newPlot('plot', data, layout, config);
        };
        render();
      });
    </script>
  </body>
</html>`;
}

function PlotlyFigure({ data, layout, config, emptyMessage, windowTitle, height = 360, exportBaseName, enableHtmlExport = true }) {
  const ref = useRef(null);
  const [error, setError] = useState("");

  const hasData = Array.isArray(data) && data.some((trace) => Array.isArray(trace?.x) && trace.x.length);

  useEffect(() => {
    const resizeHandler = () => {
      if (window.Plotly && ref.current) window.Plotly.Plots.resize(ref.current);
    };
    window.addEventListener("resize", resizeHandler);
    return () => {
      window.removeEventListener("resize", resizeHandler);
      if (window.Plotly && ref.current) window.Plotly.purge(ref.current);
    };
  }, []);

  useEffect(() => {
    if (!hasData || !ref.current) return undefined;

    let active = true;
    loadPlotly()
      .then((Plotly) => {
        if (!active || !ref.current) return undefined;
        setError("");
        return Plotly.react(ref.current, data, layout, config);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load interactive plot.");
      });

    return () => {
      active = false;
    };
  }, [config, data, hasData, layout]);

  const resolveExportName = () => {
    const requested = typeof exportBaseName === "function" ? exportBaseName() : exportBaseName;
    if (requested === null) return null;
    return sanitizeExportBaseName(requested || windowTitle || "plot", "plot");
  };

  const handleDownloadPng = async () => {
    if (!ref.current || !hasData) return;
    const fileName = resolveExportName();
    if (!fileName) return;
    try {
      const Plotly = await loadPlotly();
      setError("");
      const width = Math.max(Math.round(ref.current.clientWidth || 0), 640);
      const height = Math.max(Math.round(ref.current.clientHeight || 0), 320);
      const dataUrl = await Plotly.toImage(ref.current, {
        format: "png",
        width,
        height,
        scale: 2
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${fileName}.png`;
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PNG.");
    }
  };

  const handleDownloadHtml = () => {
    const fileName = resolveExportName();
    if (!fileName) return;
    const html = buildStandalonePlotHtml({ title: windowTitle, data, layout, config });
    downloadTextFile(html, `${fileName}.html`, "text/html;charset=utf-8");
  };

  if (!hasData) return <div className="chart-empty">{emptyMessage}</div>;
  if (error) return <div className="chart-empty">{error}</div>;

  return (
    <div className="plotly-figure-shell">
      <div className="plotly-toolbar">
        <button type="button" className="ghost-action" onClick={() => openPlotInWindow({ title: windowTitle, data, layout, config })}>
          Open Figure
        </button>
        <button type="button" className="ghost-action" onClick={handleDownloadPng}>
          Download PNG
        </button>
        {enableHtmlExport ? (
          <button type="button" className="ghost-action" onClick={handleDownloadHtml}>
            Save Interactive HTML
          </button>
        ) : null}
      </div>
      <div ref={ref} className="plotly-figure" style={{ height: `${height}px` }} />
    </div>
  );
}

function baseConfig(filename) {
  return {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "toImage"],
    doubleClick: "autosize"
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
function wattsToDbm(powerW) {
  if (powerW === null || powerW === undefined || powerW <= 0) return null;
  return 10 * Math.log10(powerW * 1000);
}

function valueForSpectrumUnit(point, displayUnit) {
  if (displayUnit === "watts") return point.opticalPowerW;
  return point.lossDb ?? point.opticalPowerDbm ?? wattsToDbm(point.opticalPowerW);
}

function normalizeAxisValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildAxisRange(minValue, maxValue) {
  const min = normalizeAxisValue(minValue);
  const max = normalizeAxisValue(maxValue);
  if (min === null || max === null) return undefined;
  if (min === max) return undefined;
  return min < max ? [min, max] : [max, min];
}

function buildSpectrumYAxisRange(minValue, maxValue, displayUnit) {
  const baseRange = buildAxisRange(minValue, maxValue);
  if (!baseRange) return undefined;
  if (displayUnit === "watts") return baseRange;
  return [baseRange[1], baseRange[0]];
}

function valueToDb(value, displayUnit) {
  if (!Number.isFinite(value)) return null;
  if (displayUnit === "watts") {
    if (value <= 0) return null;
    return 10 * Math.log10(value);
  }
  return value;
}

function formatSpectrumValue(value, displayUnit) {
  if (!Number.isFinite(value)) return "--";
  return displayUnit === "watts" ? `${value.toExponential(3)} W` : `${value.toFixed(2)} dB`;
}

function formatFsr(value) {
  return Number.isFinite(value) ? `${value.toFixed(3)} nm` : "--";
}

function filterPointsByRange(points, focusMinNm, focusMaxNm) {
  const min = normalizeAxisValue(focusMinNm);
  const max = normalizeAxisValue(focusMaxNm);
  if (min === null || max === null) return points;
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return points.filter((point) => point.wavelengthNm >= lower && point.wavelengthNm <= upper);
}

function detectSpectrumPeaks(points, displayUnit, peakType = "minima", minSpacingNm = 0.5, minProminence = 0.1) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const spacing = Math.max(Number(minSpacingNm) || 0, 0);
  const prominenceThreshold = Math.max(Number(minProminence) || 0, 0);
  const candidates = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = valueForSpectrumUnit(points[index - 1], displayUnit);
    const current = valueForSpectrumUnit(points[index], displayUnit);
    const next = valueForSpectrumUnit(points[index + 1], displayUnit);

    if (![previous, current, next].every(Number.isFinite)) continue;

    const isExtremum = peakType === "maxima"
      ? current >= previous && current >= next && (current > previous || current > next)
      : current <= previous && current <= next && (current < previous || current < next);
    if (!isExtremum) continue;

    const prominence = peakType === "maxima"
      ? current - Math.max(previous, next)
      : Math.min(previous, next) - current;
    if (prominence < prominenceThreshold) continue;

    candidates.push({
      wavelengthNm: points[index].wavelengthNm,
      value: current,
      prominence
    });
  }

  const sorted = [...candidates].sort((left, right) => {
    const primary = right.prominence - left.prominence;
    if (primary !== 0) return primary;
    return left.wavelengthNm - right.wavelengthNm;
  });

  const accepted = [];
  sorted.forEach((candidate) => {
    const tooClose = accepted.some((item) => Math.abs(item.wavelengthNm - candidate.wavelengthNm) < spacing);
    if (!tooClose) accepted.push(candidate);
  });

  return accepted.sort((left, right) => left.wavelengthNm - right.wavelengthNm);
}

function averagePeakSpacing(peaks) {
  if (!Array.isArray(peaks) || peaks.length < 2) return null;
  const spacings = [];
  for (let index = 1; index < peaks.length; index += 1) {
    spacings.push(peaks[index].wavelengthNm - peaks[index - 1].wavelengthNm);
  }
  return spacings.length ? spacings.reduce((sum, value) => sum + value, 0) / spacings.length : null;
}

function extinctionRatioForSeries(points, displayUnit) {
  if (!Array.isArray(points) || !points.length) return null;
  const values = points
    .map((point) => valueForSpectrumUnit(point, displayUnit))
    .filter(Number.isFinite);
  if (values.length < 2) return null;

  const maxValue = arrayMax(values, values[0]);
  const minValue = arrayMin(values, values[0]);
  if (!Number.isFinite(maxValue) || !Number.isFinite(minValue)) return null;

  if (displayUnit === "watts") {
    if (maxValue <= 0 || minValue <= 0) return null;
    return 10 * Math.log10(maxValue / minValue);
  }
  return Math.abs(maxValue - minValue);
}

function alignPeakOffsets(leftPeaks, rightPeaks) {
  if (!Array.isArray(leftPeaks) || !Array.isArray(rightPeaks) || !leftPeaks.length || !rightPeaks.length) {
    return [];
  }
  const count = Math.min(leftPeaks.length, rightPeaks.length);
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    left: leftPeaks[index],
    right: rightPeaks[index],
    deltaNm: rightPeaks[index].wavelengthNm - leftPeaks[index].wavelengthNm
  }));
}


function buildConfidenceBand(rows, fit) {
  if (!rows.length || !fit || rows.length < 3) return null;

  const points = rows
    .map((row) => ({ x: Number(row.relative_length_mm), y: Number(row.transmission_db) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 3) return null;

  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
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

export function InteractivePropagationPlot({ rows, fit, chipId }) {
  const plot = useMemo(() => {
    if (!rows.length || !fit) return null;

    const x = rows.map((row) => row.relative_length_mm);
    const y = rows.map((row) => row.transmission_db);
    const confidenceBand = buildConfidenceBand(rows, fit);

    const data = [
      {
        type: "scatter",
        mode: "markers",
        name: "Window-averaged points",
        x,
        y,
        marker: { color: "#4f8df3", size: 9, line: { color: "#ffffff", width: 1.5 } },
        hovertemplate: "Length: %{x:.2f} mm<br>Transmission: %{y:.2f} dB<extra></extra>"
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Linear fit",
        x: confidenceBand?.x || [arrayMin(x), arrayMax(x)],
        y: confidenceBand?.y || [fit.slope * arrayMin(x) + fit.intercept, fit.slope * arrayMax(x) + fit.intercept],
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
        margin: { l: 66, r: 24, t: 18, b: 56 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#fbfcfc",
        hovermode: "closest",
        xaxis: {
          title: "Relative length (mm)",
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside"
        },
        yaxis: {
          title: "Loss (dB)",
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside"
        },
        showlegend: true,
        legend: { orientation: "h", y: 1.14, x: 0 },
        font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" }
      },
      config: baseConfig(`${chipId || "chip"}-propagation-fit`)
    };
  }, [chipId, fit, rows]);

  return (
    <PlotlyFigure
      data={plot?.data || []}
      layout={plot?.layout || {}}
      config={plot?.config || {}}
      windowTitle={`Propagation Fit - ${chipId || "Chip"}`}
      emptyMessage="Upload propagation rows to fit a model."
      height={280}
    />
  );
}

export function InteractivePropagationSpectrumPlot({ series, targetWavelengthNm, windowNm, spectralStepNm, chipId }) {
  const plot = useMemo(() => {
    if (!series.length) return null;

    const x = series.map((point) => point.wavelengthNm);
    const bandStart = Math.max(targetWavelengthNm - windowNm, arrayMin(x));
    const bandEnd = Math.min(targetWavelengthNm + windowNm, arrayMax(x));

    return {
      data: [
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Propagation loss",
          x,
          y: series.map((point) => point.lossDbPerCm),
          marker: { color: "#3974e7", size: 8 },
          line: { color: "#3974e7", width: 3 },
          hovertemplate: "Center: %{x:.1f} nm<br>Loss: %{y:.3f} dB/cm<extra></extra>"
        },
        {
          type: "scatter",
          mode: "lines+markers",
          name: "MSE",
          x,
          y: series.map((point) => point.mse),
          yaxis: "y2",
          marker: { color: "#f08a3c", size: 7 },
          line: { color: "#f08a3c", width: 2.5, dash: "dash" },
          hovertemplate: "Center: %{x:.1f} nm<br>MSE: %{y:.4f}<extra></extra>"
        }
      ],
      layout: {
        margin: { l: 66, r: 66, t: 18, b: 56 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#fbfcfc",
        hovermode: "x unified",
        xaxis: {
          title: "Wavelength interval center (nm)",
          tickmode: "linear",
          dtick: Math.max(spectralStepNm || 10, 1),
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside"
        },
        yaxis: {
          title: "Propagation loss (dB/cm)",
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside"
        },
        yaxis2: {
          title: "MSE",
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
        showlegend: true,
        legend: { orientation: "h", y: 1.14, x: 0 },
        font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" }
      },
      config: baseConfig(`${chipId || "chip"}-propagation-spectrum`)
    };
  }, [chipId, series, spectralStepNm, targetWavelengthNm, windowNm]);

  return (
    <PlotlyFigure
      data={plot?.data || []}
      layout={plot?.layout || {}}
      config={plot?.config || {}}
      windowTitle={`Propagation Spectrum - ${chipId || "Chip"}`}
      emptyMessage="No wavelength-interval propagation fits are available for the selected chip."
      height={220}
    />
  );
}

export function InteractiveTransmissionSpectrumPlot({ series, targetWavelengthNm, chipId }) {
  const plot = useMemo(() => {
    if (!series.length) return null;

    const visibleSeries = series.filter((item) => item.visible !== false);
    if (!visibleSeries.length) return null;

    const palette = ["#4f8df3", "#ff8f45", "#0f8a83", "#9d5cf6", "#d6658f", "#2f7d68", "#b94f9d", "#8b6b3f"];
    const minWavelength = arrayMin(visibleSeries.flatMap((item) => item.points.map((point) => point.wavelengthNm)));

    return {
      data: visibleSeries.map((item, index) => ({
        type: "scattergl",
        mode: "lines",
        name: item.label || item.waveguideId,
        x: item.points.map((point) => point.wavelengthNm),
        y: item.points.map((point) => point.transmissionDb),
        line: { color: palette[index % palette.length], width: 2.4 },
        hovertemplate: `${item.label || item.waveguideId}<br>Wavelength: %{x:.2f} nm<br>Loss: %{y:.2f} dB<extra></extra>`
      })),
      layout: {
        margin: { l: 66, r: 24, t: 18, b: 56 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#fbfcfc",
        hovermode: "x unified",
        xaxis: {
          title: "Wavelength (nm)",
          tickmode: "linear",
          tick0: Math.floor(minWavelength / 10) * 10,
          dtick: 10,
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside"
        },
        yaxis: {
          title: "Loss (dB)",
          autorange: "reversed",
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
            x0: targetWavelengthNm,
            x1: targetWavelengthNm,
            y0: 0,
            y1: 1,
            line: { color: "#7dc6c4", width: 2, dash: "dash" }
          }
        ],
        showlegend: true,
        legend: { orientation: "h", y: 1.16, x: 0 },
        font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" }
      },
      config: baseConfig(`${chipId || "chip"}-transmission-spectrum`)
    };
  }, [chipId, series, targetWavelengthNm]);

  return (
    <PlotlyFigure
      data={plot?.data || []}
      layout={plot?.layout || {}}
      config={plot?.config || {}}
      windowTitle={`Transmission Spectrum - ${chipId || "Chip"}`}
      emptyMessage="No transmission spectra are available for the selected chip."
      height={220}
    />
  );
}


export function InteractiveHeaterTuningPlot({
  series,
  fit = null,
  chipId,
  metric = "phase",
  targetWavelengthNm = 1550
}) {
  const plot = useMemo(() => {
    const usable = (series || []).filter((point) => point?.powerMw !== null && point?.powerMw !== undefined);
    if (!usable.length) return null;
    const yKey = metric === "wavelength" ? "wavelengthShiftNm" : "phaseShiftPi";
    const filtered = usable.filter((point) => point?.[yKey] !== null && point?.[yKey] !== undefined);
    if (!filtered.length) return null;
    const x = filtered.map((point) => point.powerMw);
    const y = filtered.map((point) => point[yKey]);
    const yTitle = metric === "wavelength" ? "Wavelength shift (nm)" : "Phase shift (pi)";
    const plotTitle = metric === "wavelength" ? "Wavelength shift vs power" : "Phase shift vs power";
    const fitX = fit && Number.isFinite(fit.slope) ? [arrayMin(x), arrayMax(x)] : [];
    const fitY = fitX.length ? fitX.map((value) => fit.slope * value + fit.intercept) : [];
    return {
      data: [
        {
          type: "scatter",
          mode: "markers",
          name: plotTitle,
          x,
          y,
          marker: { color: metric === "wavelength" ? "#ff8f45" : "#c87736", size: 9, line: { color: "#ffffff", width: 1.5 } },
          hovertemplate: metric === "wavelength" ? "Power: %{x:.2f} mW<br>Shift: %{y:.4f} nm<extra></extra>" : "Power: %{x:.2f} mW<br>Phase: %{y:.4f} pi<extra></extra>"
        },
        ...(fitX.length ? [{
          type: "scatter",
          mode: "lines",
          name: "Linear fit",
          x: fitX,
          y: fitY,
          line: { color: "#0f8a83", width: 3 },
          hovertemplate: metric === "wavelength" ? "Fit shift: %{y:.4f} nm<extra></extra>" : "Fit phase: %{y:.4f} pi<extra></extra>"
        }] : [])
      ],
      layout: {
        margin: { l: 66, r: 24, t: 18, b: 56 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#fbfcfc",
        hovermode: "closest",
        xaxis: { title: "Electrical power (mW)", zeroline: false, gridcolor: "#e3ecef", linecolor: "#9db2b8", ticks: "outside" },
        yaxis: { title: yTitle, zeroline: false, gridcolor: "#e3ecef", linecolor: "#9db2b8", ticks: "outside" },
        showlegend: true,
        legend: { orientation: "h", y: 1.14, x: 0 },
        annotations: [{ xref: "paper", yref: "paper", x: 1, y: 1.14, text: `Target ${targetWavelengthNm} nm`, showarrow: false, font: { size: 11, color: "#5a6d74" } }],
        font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" }
      },
      config: baseConfig(`${chipId || "chip"}-heater-${metric}`)
    };
  }, [chipId, fit, metric, series, targetWavelengthNm]);

  return (
    <PlotlyFigure
      data={plot?.data || []}
      layout={plot?.layout || {}}
      config={plot?.config || {}}
      windowTitle={`${metric === "wavelength" ? "Wavelength Shift" : "Phase Shift"} - ${chipId || "Chip"}`}
      emptyMessage="No heater tuning data are available for the selected chip."
      height={240}
    />
  );
}
export function InteractiveSpectrumViewerPlot({
  series,
  displayUnit = "db",
  chipId = "Spectrum Viewer",
  figureTitle = "",
  onFigureTitleChange,
  showPeakPosition = false,
  analysisOptions = {}
}) {
  const visibleSeries = useMemo(() => series.filter((item) => item.visible !== false), [series]);
  const focusRange = useMemo(
    () => buildAxisRange(analysisOptions.focusMinNm, analysisOptions.focusMaxNm),
    [analysisOptions.focusMaxNm, analysisOptions.focusMinNm]
  );

  const resolvedFigureTitle = useMemo(() => {
    if (String(figureTitle || "").trim()) return String(figureTitle).trim();
    if (visibleSeries.length === 1) return visibleSeries[0]?.label || chipId || "Spectrum Viewer";
    return `${chipId || "Spectrum Viewer"} Comparison`;
  }, [chipId, figureTitle, visibleSeries]);

  const exportBaseName = useMemo(() => () => {
    if (visibleSeries.length === 1) {
      return visibleSeries[0]?.fileName || visibleSeries[0]?.label || resolvedFigureTitle;
    }
    const suggested = sanitizeExportBaseName(resolvedFigureTitle || "spectrum-viewer", "spectrum-viewer");
    if (typeof window === "undefined") return suggested;
    const answer = window.prompt("Enter a filename for the exported spectrum figure.", suggested);
    if (answer === null) return null;
    return answer.trim() || suggested;
  }, [resolvedFigureTitle, visibleSeries]);

  const analysis = useMemo(() => {
    const peakDetectionEnabled = analysisOptions.peakDetectionEnabled === true;
    const peakType = analysisOptions.peakType === "maxima" ? "maxima" : "minima";
    const compareSeriesAId = analysisOptions.compareSeriesAId || visibleSeries[0]?.id || "";
    const compareSeriesBId = analysisOptions.compareSeriesBId || visibleSeries[1]?.id || visibleSeries[0]?.id || "";

    const bySeries = visibleSeries.map((item) => {
      const seriesPoints = item.points || [];
      const values = seriesPoints
        .map((point) => valueForSpectrumUnit(point, displayUnit))
        .filter(Number.isFinite);
      const peaks = peakDetectionEnabled
        ? detectSpectrumPeaks(
            seriesPoints,
            displayUnit,
            peakType,
            analysisOptions.minPeakSpacingNm,
            analysisOptions.minPeakProminence
          )
        : [];
      const strongestPeak = peaks.length
        ? peaks.reduce((best, current) => {
            if (!best) return current;
            return peakType === "maxima"
              ? (current.value > best.value ? current : best)
              : (current.value < best.value ? current : best);
          }, null)
        : null;

      return {
        id: item.id,
        label: item.label,
        pointCount: seriesPoints.length,
        filteredPoints: seriesPoints,
        yMin: values.length ? arrayMin(values, values[0]) : null,
        yMax: values.length ? arrayMax(values, values[0]) : null,
        extinctionRatioDb: extinctionRatioForSeries(seriesPoints, displayUnit),
        peaks,
        averageFsrNm: averagePeakSpacing(peaks),
        strongestPeak
      };
    });

    const left = bySeries.find((item) => item.id === compareSeriesAId) || bySeries[0] || null;
    const right = bySeries.find((item) => item.id === compareSeriesBId) || bySeries[1] || null;
    const peakOffsets = left && right && left.id !== right.id ? alignPeakOffsets(left.peaks, right.peaks) : [];
    const averageOffsetNm = peakOffsets.length
      ? peakOffsets.reduce((sum, item) => sum + item.deltaNm, 0) / peakOffsets.length
      : null;

    return {
      peakDetectionEnabled,
      peakType,
      bySeries,
      comparison: {
        left,
        right,
        peakOffsets,
        averageOffsetNm
      }
    };
  }, [analysisOptions, displayUnit, visibleSeries]);

  const plot = useMemo(() => {
    if (!series.length) return null;
    if (!visibleSeries.length) return null;

    const palette = ["#4f8df3", "#ff8f45", "#0f8a83", "#9d5cf6", "#d6658f", "#2f7d68", "#b94f9d", "#8b6b3f"];
    const plottedSeries = visibleSeries.filter((item) => (item.points || []).length);
    if (!plottedSeries.length) return null;

    const allWavelengths = plottedSeries.flatMap((item) => item.points.map((point) => point.wavelengthNm));
    const minWavelength = arrayMin(allWavelengths);
    const yTitle = displayUnit === "watts" ? "Power (W)" : "Loss (dB)";

    const traceSpecs = plottedSeries.map((item, index) => {
      const color = palette[index % palette.length];
      const x = item.points.map((point) => point.wavelengthNm);
      const y = item.points.map((point) => valueForSpectrumUnit(point, displayUnit));
      const seriesAnalysis = analysis.bySeries.find((entry) => entry.id === item.id);
      const peakPoint = item.points.reduce((best, point) => {
        const value = valueForSpectrumUnit(point, displayUnit);
        if (!Number.isFinite(value)) return best;
        if (!best) return { wavelengthNm: point.wavelengthNm, value };
        const isBetter = displayUnit === "watts" ? value > best.value : value < best.value;
        return isBetter ? { wavelengthNm: point.wavelengthNm, value } : best;
      }, null);
      return { item, color, x, y, peakPoint, detectedPeaks: seriesAnalysis?.peaks || [] };
    });

    const data = traceSpecs.map(({ item, color, x, y }) => ({
      type: "scattergl",
      mode: "lines",
      name: item.label,
      x,
      y,
      line: { color, width: 2.4 },
      hovertemplate:
        displayUnit === "watts"
          ? `${item.label}<br>Wavelength: %{x:.2f} nm<br>Power: %{y:.4e} W<extra></extra>`
          : `${item.label}<br>Wavelength: %{x:.2f} nm<br>Loss: %{y:.2f} dB<extra></extra>`
    }));

    const peakTraces = showPeakPosition
      ? traceSpecs
          .filter((item) => item.peakPoint)
          .map(({ item, color, peakPoint }) => ({
            type: "scatter",
            mode: "markers",
            name: `${item.label} peak`,
            x: [peakPoint.wavelengthNm],
            y: [peakPoint.value],
            marker: { color, size: 10, symbol: "diamond", line: { color: "#ffffff", width: 1.5 } },
            showlegend: false,
            hovertemplate:
              displayUnit === "watts"
                ? `${item.label} peak<br>Wavelength: %{x:.2f} nm<br>Power: %{y:.4e} W<extra></extra>`
                : `${item.label} peak<br>Wavelength: %{x:.2f} nm<br>Loss: %{y:.2f} dB<extra></extra>`
          }))
      : [];

    const peakShapes = showPeakPosition
      ? traceSpecs.flatMap(({ color, peakPoint }) => {
          if (!peakPoint) return [];
          return [
            {
              type: "line",
              xref: "x",
              yref: "paper",
              x0: peakPoint.wavelengthNm,
              x1: peakPoint.wavelengthNm,
              y0: 0,
              y1: 1,
              line: { color, width: 1.6, dash: "dot" }
            },
            {
              type: "line",
              xref: "paper",
              yref: "y",
              x0: 0,
              x1: 1,
              y0: peakPoint.value,
              y1: peakPoint.value,
              line: { color, width: 1.2, dash: "dot" }
            }
          ];
        })
      : [];

    const peakAnnotations = showPeakPosition
      ? traceSpecs.flatMap(({ item, color, peakPoint }) => {
          if (!peakPoint) return [];
          return [{
            x: peakPoint.wavelengthNm,
            y: peakPoint.value,
            xanchor: "left",
            yanchor: displayUnit === "watts" ? "bottom" : "top",
            text:
              displayUnit === "watts"
                ? `${item.label}: ${peakPoint.wavelengthNm.toFixed(2)} nm, ${peakPoint.value.toExponential(3)} W`
                : `${item.label}: ${peakPoint.wavelengthNm.toFixed(2)} nm, ${peakPoint.value.toFixed(2)} dB`,
            bgcolor: "rgba(255,255,255,0.92)",
            bordercolor: color,
            borderwidth: 1,
            font: { color: "#16323b", size: 11 },
            showarrow: true,
            arrowcolor: color,
            arrowsize: 1,
            arrowwidth: 1.2,
            ax: 18,
            ay: displayUnit === "watts" ? -28 : 28
          }];
        })
      : [];

    const detectedPeakTraces = analysis.peakDetectionEnabled
      ? traceSpecs.flatMap(({ item, color, detectedPeaks }) => (
          detectedPeaks.length
            ? [{
                type: "scatter",
                mode: "markers",
                name: `${item.label} detected peaks`,
                x: detectedPeaks.map((peak) => peak.wavelengthNm),
                y: detectedPeaks.map((peak) => peak.value),
                marker: {
                  color,
                  size: 9,
                  symbol: analysis.peakType === "maxima" ? "triangle-up" : "triangle-down",
                  line: { color: "#ffffff", width: 1.2 }
                },
                showlegend: false,
                hovertemplate:
                  analysis.peakType === "maxima"
                    ? `${item.label} maximum<br>Wavelength: %{x:.2f} nm<br>Value: %{y:.4g}<extra></extra>`
                    : `${item.label} minimum<br>Wavelength: %{x:.2f} nm<br>Value: %{y:.4g}<extra></extra>`
              }]
            : []
        ))
      : [];

    const detectedPeakShapes = analysis.peakDetectionEnabled
      ? traceSpecs.flatMap(({ color, detectedPeaks }) =>
          detectedPeaks.map((peak) => ({
            type: "line",
            xref: "x",
            yref: "paper",
            x0: peak.wavelengthNm,
            x1: peak.wavelengthNm,
            y0: 0,
            y1: 1,
            line: { color, width: 1, dash: "dot" }
          }))
        )
      : [];

    const xAxisRange = focusRange || buildAxisRange(analysisOptions.xAxisMin, analysisOptions.xAxisMax);
    const yAxisRange = buildSpectrumYAxisRange(analysisOptions.yAxisMin, analysisOptions.yAxisMax, displayUnit);
    const xAxisDtick = normalizeAxisValue(analysisOptions.xAxisDtick);
    const yAxisDtick = normalizeAxisValue(analysisOptions.yAxisDtick);

    return {
      data: [...data, ...peakTraces, ...detectedPeakTraces],
      layout: {
        margin: { l: 66, r: 24, t: 76, b: 56 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        hovermode: "x unified",
        title: {
          text: resolvedFigureTitle,
          x: 0.5,
          xanchor: "center",
          font: { size: 18, color: "#16323b" }
        },
        xaxis: {
          title: "Wavelength (nm)",
          tickmode: "linear",
          tick0: Math.floor(minWavelength / 10) * 10,
          dtick: xAxisDtick || 10,
          range: xAxisRange,
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside",
          mirror: true
        },
        yaxis: {
          title: yTitle,
          autorange: yAxisRange ? false : (displayUnit === "watts" ? true : "reversed"),
          range: yAxisRange,
          dtick: yAxisDtick || (displayUnit === "watts" ? undefined : 2),
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside",
          mirror: true
        },
        showlegend: true,
        legend: { orientation: "h", y: 1.16, x: 0 },
        shapes: [...peakShapes, ...detectedPeakShapes],
        annotations: peakAnnotations,
        font: { family: "IBM Plex Sans, Arial, sans-serif", color: "#16323b" }
      },
      config: baseConfig(`${chipId || "viewer"}-spectrum-viewer`)
    };
  }, [analysis, analysisOptions.focusMaxNm, analysisOptions.focusMinNm, analysisOptions.xAxisDtick, analysisOptions.xAxisMax, analysisOptions.xAxisMin, analysisOptions.yAxisDtick, analysisOptions.yAxisMax, analysisOptions.yAxisMin, chipId, displayUnit, focusRange, resolvedFigureTitle, series, showPeakPosition, visibleSeries]);

  return (
    <div className="spectrum-plot-stack">
      <PlotlyFigure
        data={plot?.data || []}
        layout={plot?.layout || {}}
        config={plot?.config || {}}
        windowTitle={`${resolvedFigureTitle} - Spectrum Viewer`}
        emptyMessage="Upload one or more files to visualize the spectra."
        height={340}
        exportBaseName={exportBaseName}
        enableHtmlExport
      />
      {visibleSeries.length ? (
        <div className="spectrum-analysis-panel">
          <div className="spectrum-analysis-grid">
            {analysis.bySeries.map((item) => (
              <article key={item.id} className="spectrum-analysis-card">
                <strong>{item.label}</strong>
                <span>{item.pointCount} points in view</span>
                <span>{analysis.peakDetectionEnabled ? `${item.peaks.length} detected ${analysis.peakType}` : "Peak detection off"}</span>
                <span>Average FSR: {formatFsr(item.averageFsrNm)}</span>
                <span>Extinction ratio: {item.extinctionRatioDb !== null ? `${item.extinctionRatioDb.toFixed(2)} dB` : "--"}</span>
                <span>
                  Strongest peak: {item.strongestPeak ? `${item.strongestPeak.wavelengthNm.toFixed(2)} nm | ${formatSpectrumValue(item.strongestPeak.value, displayUnit)}` : "--"}
                </span>
              </article>
            ))}
          </div>
          {analysis.comparison.left && analysis.comparison.right && analysis.comparison.left.id !== analysis.comparison.right.id ? (
            <div className="chart-empty compact">
              Cross-trace peak comparison: <strong>{analysis.comparison.left.label}</strong> vs <strong>{analysis.comparison.right.label}</strong>. Average peak spacing estimate: <strong>{formatFsr(analysis.comparison.averageOffsetNm)}</strong>. Matched peaks: <strong>{analysis.comparison.peakOffsets.length}</strong>.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}






