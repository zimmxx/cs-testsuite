import { useEffect, useMemo, useRef, useState } from "react";

const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";
let plotlyPromise = null;

function loadPlotly() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window is not available."));
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (plotlyPromise) return plotlyPromise;

  plotlyPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-plotly-loader="true"]`);
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
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="${PLOTLY_CDN}"></script>
    <style>
      body { margin: 0; font-family: 'IBM Plex Sans', Arial, sans-serif; background: #f5f8f8; }
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

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  popup.location.replace(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function PlotlyFigure({ data, layout, config, emptyMessage, windowTitle, height = 360 }) {
  const ref = useRef(null);
  const [error, setError] = useState("");

  const hasData = Array.isArray(data) && data.some((trace) => Array.isArray(trace?.x) && trace.x.length);

  useEffect(() => {
    if (!hasData || !ref.current) return undefined;

    let active = true;
    let resizeHandler = null;

    loadPlotly()
      .then((Plotly) => {
        if (!active || !ref.current) return;
        return Plotly.newPlot(ref.current, data, layout, config).then(() => {
          resizeHandler = () => Plotly.Plots.resize(ref.current);
          window.addEventListener("resize", resizeHandler);
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load interactive plot.");
      });

    return () => {
      active = false;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (window.Plotly && ref.current) {
        window.Plotly.purge(ref.current);
      }
    };
  }, [config, data, hasData, layout]);

  if (!hasData) return <div className="chart-empty">{emptyMessage}</div>;
  if (error) return <div className="chart-empty">{error}</div>;

  return (
    <div className="plotly-figure-shell">
      <div className="plotly-toolbar">
        <button type="button" className="ghost-action" onClick={() => openPlotInWindow({ title: windowTitle, data, layout, config })}>
          Open Figure
        </button>
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
    toImageButtonOptions: {
      format: "png",
      filename,
      scale: 2
    },
    modeBarButtonsToRemove: ["select2d", "lasso2d"],
    doubleClick: "autosize"
  };
}

export function InteractivePropagationPlot({ rows, fit, chipId }) {
  const plot = useMemo(() => {
    if (!rows.length || !fit) return null;

    const x = rows.map((row) => row.relative_length_mm);
    const y = rows.map((row) => row.transmission_db);
    const minX = Math.min(...x);
    const maxX = Math.max(...x);

    return {
      data: [
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
          x: [minX, maxX],
          y: [fit.slope * minX + fit.intercept, fit.slope * maxX + fit.intercept],
          line: { color: "#0f8a83", width: 3 },
          hovertemplate: "Fit transmission: %{y:.2f} dB<extra></extra>"
        }
      ],
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
          title: "Transmission (dB)",
          zeroline: false,
          gridcolor: "#e3ecef",
          linecolor: "#9db2b8",
          ticks: "outside"
        },
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
      height={360}
    />
  );
}

export function InteractivePropagationSpectrumPlot({ series, targetWavelengthNm, windowNm, spectralStepNm, chipId }) {
  const plot = useMemo(() => {
    if (!series.length) return null;

    const x = series.map((point) => point.wavelengthNm);
    const bandStart = Math.max(targetWavelengthNm - windowNm, Math.min(...x));
    const bandEnd = Math.min(targetWavelengthNm + windowNm, Math.max(...x));

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
      height={300}
    />
  );
}

export function InteractiveTransmissionSpectrumPlot({ series, targetWavelengthNm, chipId }) {
  const plot = useMemo(() => {
    if (!series.length) return null;

    const palette = ["#4f8df3", "#ff8f45", "#0f8a83", "#9d5cf6", "#d6658f", "#2f7d68"];
    const minWavelength = Math.min(...series.flatMap((item) => item.points.map((point) => point.wavelengthNm)));

    return {
      data: series.map((item, index) => ({
        type: "scatter",
        mode: "lines",
        name: item.waveguideId,
        x: item.points.map((point) => point.wavelengthNm),
        y: item.points.map((point) => point.transmissionDb),
        line: { color: palette[index % palette.length], width: 2.4 },
        hovertemplate: `${item.waveguideId}<br>Wavelength: %{x:.2f} nm<br>Transmission: %{y:.2f} dB<extra></extra>`
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
          title: "Transmission (dB)",
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
      height={300}
    />
  );
}

