# AI Backend Deployment for GitHub Pages

The public application at `https://zimmxx.github.io/cs-testsuite/` is static. It cannot run `POST /api/ai`, and it must never contain a shared `GEMINI_API_KEY` in its built JavaScript. Individual users can instead enter their own key in the masked AI Diagnostics field; this guide is for the optional shared, protected-backend route.

## What this repository now provides

- `functions/api/ai.js` — server-side Gemini handler for server-capable hosts.
- `workers/ai-proxy.js` and `wrangler.jsonc` — a deployable Cloudflare Worker wrapper for the existing handler.
- GitHub Pages workflow support for the public `VITE_AI_API_URL` repository variable.
- CORS preflight support, a 100 kB request-size limit, and an allowed-origin setting for a separately hosted backend.

## Deploy the backend to Cloudflare Workers

Run these commands from a machine authenticated to the intended Cloudflare account. They create no Git secret and never place the Gemini key in the frontend.

```powershell
pnpm dlx wrangler login
pnpm dlx wrangler secret put GEMINI_API_KEY
pnpm dlx wrangler secret put AI_ALLOWED_ORIGIN
pnpm dlx wrangler deploy
```

For `AI_ALLOWED_ORIGIN`, enter exactly:

```text
https://zimmxx.github.io
```

The final command prints a URL similar to:

```text
https://cs-testsuite-ai.<your-cloudflare-subdomain>.workers.dev
```

## Connect GitHub Pages to the backend

1. In GitHub, open **zimmxx/cs-testsuite → Settings → Secrets and variables → Actions → Variables**.
2. Create the repository variable `VITE_AI_API_URL`.
3. Set it to the HTTPS Worker URL printed by `wrangler deploy`, with no trailing slash.
4. Re-run the **Deploy GitHub Pages** workflow, or merge a commit to `main`.

`VITE_AI_API_URL` is safe to expose because it is only a public endpoint address. Do not put `GEMINI_API_KEY` in GitHub Actions variables, GitHub Pages, `.env.example`, or any `VITE_*` value.

## Confirm the fix

After the Pages workflow completes, open AI Diagnostics and submit an interpretation request.

- A configured backend returns Gemini output, or a meaningful backend error such as `503` when the server-side secret is missing.
- The browser should no longer call the static GitHub Pages `/api/ai` path or show `405`.
- The browser network panel should show an HTTPS Worker URL and a successful `OPTIONS` preflight followed by `POST`.

## Production safeguard still required

CORS protects which browser origins can read responses; it is not user authentication. Before making the Worker generally available, add authentication and durable per-user/IP rate limiting (for example Cloudflare Access, Turnstile plus a server-side rate limiter, or an institutional SSO gateway). This prevents unapproved public users from consuming Gemini quota.
