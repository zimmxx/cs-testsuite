import { useMemo, useRef } from "react";

function formatNumber(value, digits = 2, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

export default function HeaterEfficiencyPanel({
  sourceMeta,
  heaterMetrics,
  statusMessage,
  isUploading,
  onFolderUpload,
  onFileUpload,
  onConfigChange
}) {
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const summary = useMemo(() => {
    const chips = heaterMetrics?.byChip || [];
    const average = (values) => {
      const clean = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
      if (!clean.length) return null;
      return clean.reduce((sum, value) => sum + value, 0) / clean.length;
    };
    return {
      chips: chips.length,
      meanPiPowerMw: average(chips.map((item) => item.piPowerMw)),
      meanVpiV: average(chips.map((item) => item.voltageAtPiV)),
      meanFsrNm: average(chips.map((item) => item.fsrNm)),
      maxPhaseShiftPi: average(chips.map((item) => item.maxPhaseShiftPi))
    };
  }, [heaterMetrics]);

  return (
    <section className="analysis-card heater-upload-card">
      <div className="analysis-card-head">
        <div>
          <h2>Heater Measurement Workspace</h2>
          <p>Upload a heater folder containing <code>Power.xlsx</code> and the bias sweep workbooks such as <code>0V.xlsx</code>, <code>1V.xlsx</code>, and <code>2V.xlsx</code>. The app tracks one MZI fringe, extracts FSR, and fits heater tuning directly in the browser.</p>
        </div>
        <div className="library-action-row">
          <button type="button" onClick={() => folderInputRef.current?.click()} disabled={isUploading}>{isUploading ? "Reading..." : "Upload Heater Folder"}</button>
          <button type="button" className="ghost-action" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>{isUploading ? "Reading..." : "Upload Excel Files"}</button>
        </div>
      </div>

      <input ref={folderInputRef} hidden type="file" multiple webkitdirectory="" directory="" onChange={onFolderUpload} />
      <input ref={fileInputRef} hidden type="file" multiple accept=".xlsx,.xls" onChange={onFileUpload} />

      <div className="settings-grid settings-grid-extended heater-settings-grid">
        <label className="mapping-field">
          <span>Tracking wavelength (nm)</span>
          <input type="number" value={sourceMeta.heaterTrackingWavelengthNm ?? 1550} onChange={(event) => onConfigChange("heaterTrackingWavelengthNm", Number(event.target.value) || 1550)} />
        </label>
        <label className="mapping-field">
          <span>Peak prominence (dB)</span>
          <input type="number" min="0" step="0.1" value={sourceMeta.heaterPeakProminenceDb ?? 5} onChange={(event) => onConfigChange("heaterPeakProminenceDb", Math.max(Number(event.target.value) || 0, 0))} />
        </label>
        <label className="mapping-field">
          <span>Current unit in Power.xlsx</span>
          <select value={sourceMeta.heaterCurrentUnit || "auto"} onChange={(event) => onConfigChange("heaterCurrentUnit", event.target.value)}>
            <option value="auto">Auto-detect</option>
            <option value="a">Amps (A)</option>
            <option value="ma">Milliamps (mA)</option>
          </select>
        </label>
        <label className="mapping-field">
          <span>Expected wavelength drift</span>
          <select value={sourceMeta.heaterShiftDirection || "increasing"} onChange={(event) => onConfigChange("heaterShiftDirection", event.target.value)}>
            <option value="increasing">Increasing wavelength</option>
            <option value="decreasing">Decreasing wavelength</option>
            <option value="auto">Nearest peak only</option>
          </select>
        </label>
      </div>

      <div className="translator-metrics heater-summary-grid">
        <div><strong>{summary.chips}</strong><span>Heater chips</span></div>
        <div><strong>{formatNumber(summary.meanPiPowerMw, 2, " mW/pi")}</strong><span>Mean Ppi</span></div>
        <div><strong>{formatNumber(summary.meanVpiV, 2, " V")}</strong><span>Mean Vpi</span></div>
        <div><strong>{formatNumber(summary.meanFsrNm, 3, " nm")}</strong><span>Mean FSR</span></div>
        <div><strong>{formatNumber(summary.maxPhaseShiftPi, 2, " pi")}</strong><span>Average max phase</span></div>
      </div>

      <div className="chart-empty compact heater-status-card">{statusMessage}</div>
    </section>
  );
}
