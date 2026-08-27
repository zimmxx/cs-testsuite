# AI Diagnostics Intelligence

This document describes the AI Diagnostics feature in the CORNERSTONE Wafer Post-Processing Suite, the Gemini models currently enabled, expected token and quota trade-offs, API-key setup, logging behaviour, and the recommended GitHub deployment architecture.

**Last reviewed:** 27 August 2026

## Purpose and scope

AI Diagnostics combines two separate layers:

1. **Local deterministic screening** identifies failed propagation fits and transmission-spectrum indicators. This part runs in the browser and does not require Gemini.
2. **Gemini interpretation** receives compact metrics and flagged evidence, then produces a cautious engineering summary and recommended checks.

The local screening currently checks:

- failed propagation fits using the configured MSE criterion
- residual ripple or oscillation
- abrupt spectral discontinuities
- high detrended spectral roughness
- combined high propagation loss and spectral roughness
- differences in average propagation loss and yield between selected MPW datasets

These indicators are screening evidence, not proof of a fabrication root cause. In particular, sidewall roughness, lithography, etch variation, contamination, coupling instability, reflections, polarisation drift, and instrument problems must be distinguished using repeat measurements and independent process evidence.

The complete raw spectra are not sent to Gemini. The request contains compact wafer totals, chip identifiers and coordinates, fit results, anomaly metrics, hypothesis labels, and optional MPW comparison summaries. These summaries may still be sensitive, so institutional data-handling rules still apply.

## Implemented Gemini models

The application uses the Gemini Interactions API. These are the exact model IDs currently allowed by both the local Vite proxy and the deployment function.

| Model | App role | App output limit | Request mode | Relative consumption | Recommended use |
| --- | --- | ---: | --- | --- | --- |
| `gemini-3.1-flash-lite` | Default, fast | 900 tokens | Synchronous | Lowest published paid unit price of the implemented models | Routine chip triage and most MPW summaries |
| `gemini-3.5-flash-lite` | Lowest-output option | 700 tokens | Synchronous | Smallest app output ceiling; slightly higher unit price than 3.1 Flash-Lite | Short summaries when conserving output tokens is the priority |
| `gemini-3.6-flash` | Balanced Flash option | 900 tokens | Background | Higher unit price and usually lower free quota than Lite models | A second opinion on more difficult evidence |
| `gemini-3.7-flash` | Highest-capability option | 1,400 tokens | Background | Highest configured output allowance; thinking tokens can increase usage | Complex comparisons or final review of an ambiguous case |

The output limits above are application controls in `vite.config.js` and `functions/api/ai.js`; they are deliberately much smaller than each model's platform maximum.

### Cost and consumption comparison

Google's published standard paid-tier prices, as reviewed on 27 August 2026, are useful for relative comparison even when the project is currently using the free tier:

| Model | Input per 1M tokens | Output per 1M tokens | Practical conclusion |
| --- | ---: | ---: | --- |
| Gemini 3.1 Flash-Lite | USD 0.25 | USD 1.50 | Best default for low cost and good diagnostic summaries |
| Gemini 3.5 Flash-Lite | USD 0.30 | USD 2.50 | Use when its lower 700-token app ceiling is more important than unit price |
| Gemini 3.6 Flash | USD 0.75* | USD 3.75* | More capable than Lite, but not the first choice for routine volume |
| Gemini 3.7 Flash | USD 0.75* | USD 3.75* | Best capability in the current selector; reserve for difficult cases |

\* Introductory 3.6/3.7 pricing is published through 31 December 2026. Google states that standard pricing changes on 1 January 2027. Always check the current pricing page before making a budget decision.

For the same diagnostic request, input token use is broadly driven by the size of the compact evidence JSON rather than the model name. Output use varies with the response and may include thinking tokens. Therefore:

- use **Gemini 3.1 Flash-Lite** as the normal default
- use **Gemini 3.5 Flash-Lite** for the shortest bounded response
- escalate selected ambiguous cases to **Gemini 3.7 Flash**
- avoid sending the same case repeatedly when a saved result is already adequate
- compare model quality on a labelled evaluation set before changing the production default

Free-tier availability is quota-limited, not unlimited. Rate limits are enforced per Google Cloud project across RPM (requests per minute), TPM (input tokens per minute), and RPD (requests per day). Limits vary by model, project, tier, and time. The authoritative values are the project's **Google AI Studio > Rate Limit** page; do not hard-code quota numbers into the application documentation.

## Local API-key setup

1. Create or select a project in [Google AI Studio](https://aistudio.google.com/).
2. Open **API Keys** and create a Gemini API key.
3. In the repository root, copy the template:

```powershell
Copy-Item .env.example .env.local
```

4. Edit `.env.local` and add the key:

```dotenv
GEMINI_API_KEY=your_key_here
```

5. Restart the development server:

```powershell
pnpm dev
```

6. Open AI Diagnostics and run a small test.

The local key is read only by the Vite development proxy in `vite.config.js`. It is not deliberately returned to the browser.

### Rules for the key

- Never paste the real key into `README.md`, source code, screenshots, issues, commits, or pull requests.
- Never rename it to `VITE_GEMINI_API_KEY`. Vite exposes `VITE_*` variables to browser code.
- Keep `.env.local` local. It is already covered by `.gitignore`.
- Treat the key like a password. Rotate it immediately in AI Studio if it is exposed.
- For production, store it as a secret/environment variable on the server-side host.
- If billing is enabled later, configure quota controls and billing alerts before wider deployment.

The empty `.env.example` file is safe to commit because it documents the variable name without containing a credential.

## GitHub and production deployment

### What can be committed to the main GitHub repository

Safe to commit:

- the React AI Diagnostics UI
- the deterministic screening logic
- `vite.config.js`
- `functions/api/ai.js`
- `.env.example` with an empty value
- this documentation

Never commit:

- `.env.local`
- an actual Gemini API key
- a key embedded in JavaScript, JSON, YAML, HTML, or a GitHub Pages build artifact

Pushing the application code to `main` does not push `.env.local` because it is ignored. Verify this before every AI-related commit with:

```powershell
git status --short
git check-ignore -v .env.local
```

### Using a personal key in the public app

AI Diagnostics can accept a Gemini key directly from the user interface. The field is masked and, by default, the value remains in page memory only. A user may choose **Remember only in this browser** to store it in that browser profile and may remove it with **Clear key**. The **Test connection** button checks the selected model before any wafer evidence is submitted.

This is useful for individual testing on GitHub Pages, but it is not equivalent to managed production credential storage. A browser-stored key can be read by someone with access to the same browser profile or by malicious code running on the same origin. Use a restricted Google API key and do not enable browser persistence on shared computers.

When a user supplies a key, compact diagnostic evidence is sent directly from their browser to Google Gemini. The key is never sent to GitHub, committed to the repository, or sent to the optional CORNERSTONE backend.

### Why GitHub Pages cannot hold a shared key

GitHub Pages serves static HTML, CSS, and JavaScript. Every value bundled into that frontend can be downloaded and inspected by a visitor. GitHub repository secrets can protect a value while an Action is running, but injecting a Gemini key into the Vite build would place it in the public JavaScript output.

The current live GitHub Pages site therefore needs either a user-supplied key or a server-side API if Gemini is to work in production.

### Recommended production architecture

The simplest secure route is to deploy the full repository to a server-capable static host such as Cloudflare Pages:

```text
Browser
  -> same-origin POST /api/ai
  -> functions/api/ai.js
  -> GEMINI_API_KEY from the host's secret store
  -> Google Gemini Interactions API
```

For Cloudflare Pages, configure `GEMINI_API_KEY` as an encrypted project secret/environment variable. The repository contains only the function code, not the value.

If the frontend remains on GitHub Pages, deploy the API function separately and set `VITE_AI_API_URL` to the public API endpoint during the frontend build. `VITE_AI_API_URL` is safe to expose because it is only an address, not a credential. Before using a separate origin, the backend must also implement:

- an explicit CORS allow-list for the CORNERSTONE GitHub Pages origin
- `OPTIONS` preflight handling
- request-size limits
- rate limiting or authentication to prevent public users consuming the project quota
- server-side model allow-listing, which is already present

The current `functions/api/ai.js` is best suited to same-origin hosting; cross-origin CORS and public-abuse protection should be completed before connecting it to the public GitHub Pages site.

The repository now includes a Cloudflare Worker wrapper and CORS/preflight handling for the separate-backend route. Follow [AI Backend Deployment](AI_BACKEND_DEPLOYMENT.md) to deploy it and configure the GitHub Pages `VITE_AI_API_URL` repository variable. Until that variable exists, the public app uses a user-entered key when supplied; otherwise it deliberately shows a configuration message instead of calling the static `/api/ai` path and receiving a `405`.

## Logs, evaluation datasets, and training

The UI includes **Save to Gemini logs for evaluation**, enabled by default.

- Enabled: the prompt and response are retained as a stored Gemini interaction and may appear in Google AI Studio Logs.
- Disabled with a Lite model: the request uses `store: false`.
- Disabled with a background Flash model: temporary storage is required for polling, then the application requests deletion after completion.

Saving a log does **not** automatically train or fine-tune Gemini. Logs can be reviewed, labelled, and manually added to an evaluation dataset. A recommended evaluation record includes:

- anonymised dataset and chip reference
- model ID and date
- local flags and quantitative evidence
- AI response
- engineer verdict: correct, partly correct, or incorrect
- confirmed root cause, when independently established
- unsafe or overconfident claims

Do not use model-generated explanations as training labels unless an engineer has verified them. Build the evaluation set around independently confirmed cases, including clean traces, measurement artefacts, coupling problems, reflections, sidewall roughness, CD non-uniformity, and genuinely unresolved examples.

Google's pricing documentation currently states that free-tier content may be used to improve Google products, while paid-tier content is not used for that purpose. This is separate from the application's log toggle and may change. Do not submit confidential fabrication or customer data until the chosen tier and institutional policy have been reviewed.

## Production-readiness checklist

- [ ] Keep Gemini 3.1 Flash-Lite as the default until evaluation results justify a change.
- [ ] Create a labelled test set with known clean, failed-fit, instrument-artefact, and fabrication-related examples.
- [ ] Compare accuracy, false positives, response time, input tokens, output tokens, and RPD consumption by model.
- [ ] Add server-side rate limiting and access control before public deployment.
- [ ] Store `GEMINI_API_KEY` only in the deployment platform's secret manager.
- [ ] For browser-entered keys, use Google API-key restrictions and avoid shared-browser persistence.
- [ ] Confirm the production data-retention and Google product-improvement terms.
- [ ] Add a visible data-sharing notice for users handling restricted datasets.
- [ ] Keep deterministic flags and measurements visible alongside every AI conclusion.
- [ ] Treat AI output as advisory and require engineering verification.

## Relevant source files

- [`src/components/AiDiagnosticsPanel.jsx`](../src/components/AiDiagnosticsPanel.jsx) — model selector, logging control, MPW selection, and results UI
- [`src/lib/aiDiagnostics.js`](../src/lib/aiDiagnostics.js) — deterministic spectral screening and compact AI evidence payload
- [`vite.config.js`](../vite.config.js) — local server-side Gemini proxy and model allow-list
- [`functions/api/ai.js`](../functions/api/ai.js) — production server-side API handler
- [`workers/ai-proxy.js`](../workers/ai-proxy.js) — Cloudflare Worker entry point for a GitHub Pages frontend
- [`wrangler.jsonc`](../wrangler.jsonc) — Cloudflare Worker deployment configuration
- [`.env.example`](../.env.example) — safe local configuration template
- [`.gitignore`](../.gitignore) — excludes local secret files

## Official references

- [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Using Gemini API keys securely](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini Interactions API and storage](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing)
