# PDKMonitor analysis scripts

These standalone Python scripts are designed for the CORNERSTONE PDKMonitor
Pyodide runner. They do not modify or depend on the PDKMonitor repository.

## Scripts

- `plot_transmission_Aiman_W_v1.py` — run on one TXT test; plots raw optical
  power in watts.
- `plot_transmission_Aiman_dB_v1.py` — run on one TXT test; plots transmission
  in dB normalised to that trace's peak.
- `plot_multi_transmission_Aiman_v1.py` — run over a slot folder; creates one
  panel per chip, with WG routes shown in each legend and loss in dB.
- `plot_prop_loss_fit_Aiman_v1.py` — run over a slot folder; reads the uploaded
  `route-config.json`, fits every chip, applies the configured MSE criterion,
  plots the 95% confidence band, and reports propagation loss, its 95% slope
  confidence interval, MSE, R², wafer yield, and the filtered wafer average.
- `plot_prop_loss_spectrum_Aiman_v1.py` — run over a slot folder; creates one
  panel per chip with propagation loss (dB/cm) and MSE versus wavelength using
  the same interval-window regression method as `cs-testsuite`.

## PDKMonitor usage

1. Open the building block's **Scripts** tab and add each `.py` file as a saved
   Python script.
2. Use the two `plot_transmission` scripts from an individual TXT test card.
3. Use `plot_multi_transmission`, `plot_prop_loss_fit`, and
   `plot_prop_loss_spectrum` with **Run script over folder** on a
   `Slot#_Step#` folder.
4. Keep `route-config.json` in each slot folder used for propagation fitting.

Each script prints its diagnostics before calling `emit(fig)`. Keeping image
emission last avoids the current PDKMonitor stdout concatenation issue that can
otherwise corrupt the returned base64 PNG.
