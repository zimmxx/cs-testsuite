const format = (value, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

export default function ElectricalDeviceTable({ devices, selectedKey, layout, expanded, comparisonKeys, onCompare, onInspect }) {
  return <div className="dashboard-table-wrap electrical-summary-scroll"><table className="electrical-summary-table"><thead><tr>
    <th>Plot</th><th>Chip</th><th>Device</th>{expanded ? <><th>Location (X,Y)</th><th>Points</th></> : null}<th>Rfit (Ω)</th>{expanded ? <th>Median V/I (Ω)</th> : null}<th>R²</th><th>Peak power (mW)</th>{expanded ? <th>Max |I| (mA)</th> : null}<th>Review</th><th>Inspect</th>
  </tr></thead><tbody>{devices.length ? devices.map((trace) => {
    const slot = layout.find((item) => item.chipId === trace.chipId);
    return <tr key={trace.key} className={trace.key === selectedKey ? "electrical-selected-row" : ""}>
      <td><input type="checkbox" aria-label={`Plot ${trace.chipId} ${trace.deviceId}`} checked={comparisonKeys.includes(trace.key)} onChange={(event) => onCompare(trace.key, event.target.checked)} /></td>
      <td>{trace.chipId}</td><td>{trace.deviceId}</td>{expanded ? <><td>{slot ? `(${slot.dieX}, ${slot.dieY})` : "Unmapped"}</td><td>{trace.points.length}</td></> : null}
      <td>{format(trace.fit?.resistanceOhm)}</td>{expanded ? <td>{format(trace.medianResistanceOhm)}</td> : null}<td>{format(trace.fit?.rSquared, 4)}</td><td>{format(trace.peakPowerPoint?.powerMw)}</td>{expanded ? <td>{format(trace.maxAbsCurrentMa)}</td> : null}
      <td>{trace.fit?.resistanceOhm == null ? "Fit unavailable" : trace.warnings.length ? `${trace.warnings.length} flag(s)` : "No flags"}</td>
      <td><button type="button" className="ghost-action" aria-label={`Inspect ${trace.chipId} ${trace.deviceId}`} onClick={() => onInspect(trace)}>Inspect</button></td>
    </tr>;
  }) : <tr><td colSpan={expanded ? 12 : 8}>No devices match the current filters. Upload files or reset the filters.</td></tr>}</tbody></table></div>;
}
