import React from "react";

function buildErrorCode(error) {
  const base = `${error?.name || "Error"}:${error?.message || "Unknown"}`;
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
  }
  return `WPS-${hash.toString(16).toUpperCase().padStart(8, "0")}`;
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorCode: null };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
      errorCode: buildErrorCode(error)
    };
  }

  componentDidCatch(error, info) {
    const detail = {
      code: buildErrorCode(error),
      name: error?.name || "Error",
      message: error?.message || "Unknown render error.",
      stack: error?.stack || "",
      componentStack: info?.componentStack || ""
    };
    window.__WPS_LAST_ERROR__ = detail;
    console.error("Wafer Post-Processing Suite crash", detail);
  }

  render() {
    const { error, errorCode } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="app-shell crash-shell">
        <section className="analysis-card crash-card">
          <div className="analysis-card-head stacked">
            <div>
              <h1>Application Error</h1>
              <p>The page crashed before it could finish rendering. The error code below should help track exactly where it failed.</p>
            </div>
          </div>
          <div className="translator-metrics crash-metrics">
            <div><strong>{errorCode}</strong><span>Error code</span></div>
            <div><strong>{error.name || "Error"}</strong><span>Type</span></div>
          </div>
          <div className="chart-empty crash-detail">
            <strong>{error.message || "Unknown render error."}</strong>
            <span>{error.stack?.split("\n").slice(0, 2).join(" ") || "No stack trace available."}</span>
          </div>
          <div className="library-action-row">
            <button type="button" onClick={() => window.location.reload()}>Reload App</button>
          </div>
        </section>
      </main>
    );
  }
}
