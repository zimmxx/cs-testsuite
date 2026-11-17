export default function PropagationWaveguideReview({ chip, onChange }) {
  if (!chip) return null;
  const waveguides = chip.transmissionSeries || [];
  const excluded = chip.excludedWaveguideIds || [];
  return (
    <section className="propagation-waveguide-review" aria-label="Waveguides included in propagation fit">
      <details>
        <summary className="propagation-waveguide-summary">
          <strong>Waveguides in fit — {chip.chipId}</strong>
          <span>{waveguides.filter((item) => !excluded.includes(item.waveguideId)).length} of {waveguides.length} included</span>
        </summary>
      <div className="analysis-card-head">
        <div>
          <p>Uncheck a waveguide to exclude it from this chip’s fit at every wavelength. Original traces, WG numbers and assigned lengths are retained when saving.</p>
        </div>
        <button type="button" className="ghost-action" disabled={!excluded.length} onClick={() => onChange(chip.chipId, [])}>Include all waveguides</button>
      </div>
      <div className="propagation-waveguide-options">
        {waveguides.map((item) => (
          <label key={item.waveguideId} className={excluded.includes(item.waveguideId) ? "waveguide-choice excluded" : "waveguide-choice"}>
            <input type="checkbox" checked={!excluded.includes(item.waveguideId)}
              aria-label={`Include ${item.waveguideId} in fit for chip ${chip.chipId}`}
              onChange={(event) => onChange(chip.chipId, event.target.checked
                ? excluded.filter((id) => id !== item.waveguideId)
                : [...excluded, item.waveguideId])} />
            <span><strong>{item.waveguideId}</strong><small>{item.lengthMm == null ? "Length unavailable" : `${Number(item.lengthMm).toFixed(2)} mm`} · {excluded.includes(item.waveguideId) ? "Excluded" : "Included"}</small></span>
          </label>
        ))}
      </div>
      <p role="status">{waveguides.filter((item) => !excluded.includes(item.waveguideId)).length} of {waveguides.length} waveguides included. {chip.fit ? "Fit updated automatically." : "Fit unavailable: at least two included waveguides with distinct lengths and data in the wavelength window are required."}</p>
      </details>
    </section>
  );
}
