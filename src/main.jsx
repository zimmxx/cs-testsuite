import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./styles.css";

window.addEventListener("error", (event) => {
  const error = event.error || new Error(event.message || "Window error");
  window.__WPS_LAST_ERROR__ = {
    code: "WPS-WINDOW",
    name: error.name || "Error",
    message: error.message || "Window error",
    stack: error.stack || ""
  };
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Unhandled promise rejection"));
  window.__WPS_LAST_ERROR__ = {
    code: "WPS-PROMISE",
    name: reason.name || "Error",
    message: reason.message || "Unhandled promise rejection",
    stack: reason.stack || ""
  };
  console.error("Unhandled promise rejection", window.__WPS_LAST_ERROR__);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
