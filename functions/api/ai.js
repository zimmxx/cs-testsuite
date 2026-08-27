const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const ALLOWED_MODELS = new Set([
  DEFAULT_GEMINI_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash"
]);
const MODEL_OUTPUT_LIMITS = new Map([
  ["gemini-3.1-flash-lite", 900],
  ["gemini-3.5-flash-lite", 700],
  ["gemini-3.6-flash", 900],
  ["gemini-3.7-flash", 1400]
]);
const BACKGROUND_GEMINI_MODELS = new Set(["gemini-3.6-flash", "gemini-3.7-flash"]);
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_POLL_LIMIT_MS = 75_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function readInteractionText(result) {
  return result?.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content || [])
    .filter((content) => content.type === "text")
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function geminiFetch(url, apiKey, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, ...options.headers }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function cleanupInteraction(apiKey, interaction) {
  if (!interaction?.id) return;
  const url = `${GEMINI_INTERACTIONS_URL}/${encodeURIComponent(interaction.id)}`;
  try {
    if (interaction.status === "in_progress") {
      await geminiFetch(`${url}/cancel`, apiKey, { method: "POST", headers: { "Api-Revision": "2026-05-20" } }, 10_000);
    }
    await geminiFetch(url, apiKey, { method: "DELETE", headers: { "Api-Revision": "2026-05-20" } }, 10_000);
  } catch {
    // Cleanup is best-effort and must not hide the analysis result.
  }
}

async function runGeminiInteraction(apiKey, model, prompt, storeAnalysis) {
  const useBackground = BACKGROUND_GEMINI_MODELS.has(model);
  const createResponse = await geminiFetch(GEMINI_INTERACTIONS_URL, apiKey, {
    method: "POST",
    body: JSON.stringify({
      model,
      input: prompt,
      store: useBackground || storeAnalysis,
      background: useBackground,
      generation_config: { temperature: 0.2, max_output_tokens: MODEL_OUTPUT_LIMITS.get(model) || 900 }
    })
  });
  let interaction = await createResponse.json();
  if (!createResponse.ok) throw new Error(interaction?.error?.message || `Gemini request failed (${createResponse.status}).`);
  if (!useBackground) {
    if (interaction.status !== "completed" && interaction.status !== "incomplete") {
      throw new Error(interaction?.error?.message || `Gemini interaction ended with status: ${interaction.status || "unknown"}.`);
    }
    return interaction;
  }

  const deadline = Date.now() + GEMINI_POLL_LIMIT_MS;
  try {
    while (interaction.status === "in_progress" && Date.now() < deadline) {
      await wait(1500);
      const pollResponse = await geminiFetch(`${GEMINI_INTERACTIONS_URL}/${encodeURIComponent(interaction.id)}`, apiKey, { method: "GET" });
      interaction = await pollResponse.json();
      if (!pollResponse.ok) throw new Error(interaction?.error?.message || `Gemini status check failed (${pollResponse.status}).`);
    }
    if (interaction.status === "in_progress") throw new Error("Gemini is taking longer than 75 seconds. Please try again shortly.");
    if (interaction.status !== "completed" && interaction.status !== "incomplete") {
      throw new Error(interaction?.error?.message || `Gemini interaction ended with status: ${interaction.status || "unknown"}.`);
    }
    return interaction;
  } finally {
    if (!storeAnalysis) await cleanupInteraction(apiKey, interaction);
  }
}

export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "Gemini is not configured. Add GEMINI_API_KEY as a server-side secret; local diagnostics are still available." }, 503);
  try {
    const body = await context.request.json();
    if (body.provider !== "gemini") return json({ error: "This provider is not enabled yet." }, 400);
    const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_GEMINI_MODEL;
    const storeAnalysis = body.storeAnalysis === true;
    const prompt = `You are a cautious silicon-photonics wafer diagnostics assistant. Use only the supplied evidence. Distinguish observations, hypotheses, confidence, and recommended verification. Never claim that sidewall roughness, lithography, etch, contamination, coupling, or instrumentation is proven from spectra alone. Return a concise engineering summary with: Priority findings; Possible explanations; Checks to run next; MPW comparison when present. Evidence JSON:\n${JSON.stringify(body.payload)}`;
    const result = await runGeminiInteraction(apiKey, model, prompt, storeAnalysis);
    const text = readInteractionText(result);
    return json({ provider: "gemini", model, text: text || "Gemini returned an empty response.", stored: storeAnalysis });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to process the AI request." }, 500);
  }
}
