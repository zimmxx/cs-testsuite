import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const ALLOWED_GEMINI_MODELS = new Set([
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

function sendJson(response, data, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(data));
}

function readJsonBody(request, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error("AI request payload is too large."));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("AI request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

const PRIVATE_LIBRARY_RELATIVE_ROOT = path.join("private", "sample-data", "wst");
const PRIVATE_ACCESS_RELATIVE_PATH = path.join("private", "config", "access-control.json");

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function createApiKey() {
  return `cst_${randomBytes(30).toString("base64url")}`;
}

function publicUser(user) {
  if (!user) return null;
  const { apiKeyHash: _apiKeyHash, ...safeUser } = user;
  return safeUser;
}

function privateLibraryDevelopmentApi(projectRoot) {
  const libraryRoot = path.resolve(projectRoot, PRIVATE_LIBRARY_RELATIVE_ROOT);
  const manifestPath = path.join(libraryRoot, "library-index.json");
  const accessPath = path.resolve(projectRoot, PRIVATE_ACCESS_RELATIVE_PATH);

  async function ensurePrivateStorage() {
    await mkdir(libraryRoot, { recursive: true });
    await mkdir(path.dirname(accessPath), { recursive: true });
    if (!existsSync(manifestPath)) await writeFile(manifestPath, "[]\n", "utf8");
    if (!existsSync(accessPath)) {
      await writeFile(accessPath, `${JSON.stringify({ schemaVersion: 1, users: [] }, null, 2)}\n`, "utf8");
    }
  }

  async function readJsonFile(filePath, fallback) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return fallback;
    }
  }

  async function readAccessControl() {
    await ensurePrivateStorage();
    const value = await readJsonFile(accessPath, { schemaVersion: 1, users: [] });
    return { schemaVersion: 1, ...value, users: Array.isArray(value.users) ? value.users : [] };
  }

  async function writeAccessControl(value) {
    await writeFile(accessPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  async function readManifest() {
    await ensurePrivateStorage();
    const value = await readJsonFile(manifestPath, []);
    return Array.isArray(value) ? value : [];
  }

  async function writeManifest(value) {
    await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  function requestKey(request) {
    const authorization = String(request.headers.authorization || "");
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  }

  async function authenticatedUser(request) {
    const key = requestKey(request);
    if (!key) return null;
    const access = await readAccessControl();
    return access.users.find((user) => user.status !== "revoked" && user.apiKeyHash === sha256(key)) || null;
  }

  function canAccessDataset(user, dataset) {
    if (!user) return false;
    if (user.role === "admin") return true;
    const userGroups = new Set(Array.isArray(user.accessGroups) ? user.accessGroups : []);
    const datasetGroups = Array.isArray(dataset.accessGroups) ? dataset.accessGroups : [];
    return datasetGroups.some((group) => userGroups.has(group));
  }

  function canEditDataset(user, dataset) {
    if (!canAccessDataset(user, dataset)) return false;
    return user.role === "admin" || user.role === "editor";
  }

  function privateDatasetPayload(dataset, user) {
    return {
      ...dataset,
      privateLibrary: true,
      visibility: "private",
      canEdit: canEditDataset(user, dataset),
      source: dataset.source || "private-library"
    };
  }

  function requireUser(response, user) {
    if (user) return true;
    sendJson(response, { error: "A valid private-library API key is required." }, 401);
    return false;
  }

  function requireAdmin(response, user) {
    if (user?.role === "admin") return true;
    sendJson(response, { error: "Administrator access is required." }, 403);
    return false;
  }

  function safeDatasetFolder(dataset) {
    const relative = String(dataset.folder || "")
      .replace(/^private\//, "")
      .replace(/^sample-data[\\/]wst[\\/]/, "");
    const resolved = path.resolve(libraryRoot, relative);
    if (resolved !== libraryRoot && !resolved.startsWith(`${libraryRoot}${path.sep}`)) {
      throw new Error("Invalid private dataset folder.");
    }
    return resolved;
  }

  return {
    name: "private-library-development-api",
    configureServer(server) {
      server.middlewares.use("/api/private", async (request, response) => {
        try {
          const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
          const route = requestUrl.pathname.replace(/\/+$/, "") || "/";
          const user = await authenticatedUser(request);

          if (route === "/session" && request.method === "GET") {
            const access = await readAccessControl();
            sendJson(response, {
              user: publicUser(user),
              bootstrapAvailable: access.users.length === 0,
              mode: "local-development"
            });
            return;
          }

          if (route === "/login" && request.method === "POST") {
            const body = await readJsonBody(request);
            const access = await readAccessControl();
            const matched = access.users.find((entry) => entry.status !== "revoked" && entry.apiKeyHash === sha256(body.apiKey));
            if (!matched) {
              sendJson(response, { error: "The API key is invalid or revoked." }, 401);
              return;
            }
            matched.lastLoginAt = new Date().toISOString();
            await writeAccessControl(access);
            sendJson(response, { user: publicUser(matched) });
            return;
          }

          if (route === "/bootstrap" && request.method === "POST") {
            const access = await readAccessControl();
            if (access.users.length) {
              sendJson(response, { error: "An administrator already exists." }, 409);
              return;
            }
            const apiKey = createApiKey();
            const admin = {
              id: randomUUID(),
              name: "Aiman",
              role: "admin",
              status: "active",
              accessGroups: ["dtu", "internal"],
              apiKeyHash: sha256(apiKey),
              apiKeyHint: apiKey.slice(-6),
              createdAt: new Date().toISOString(),
              lastLoginAt: null
            };
            access.users.push(admin);
            await writeAccessControl(access);
            sendJson(response, { user: publicUser(admin), apiKey }, 201);
            return;
          }

          if (route === "/library" && request.method === "GET") {
            if (!requireUser(response, user)) return;
            const manifest = await readManifest();
            sendJson(response, manifest.filter((dataset) => canAccessDataset(user, dataset)).map((dataset) => privateDatasetPayload(dataset, user)));
            return;
          }

          if (route === "/asset" && request.method === "GET") {
            if (!requireUser(response, user)) return;
            const manifest = await readManifest();
            const dataset = manifest.find((entry) => String(entry.id || entry.datasetId) === requestUrl.searchParams.get("datasetId"));
            if (!dataset || !canAccessDataset(user, dataset)) {
              sendJson(response, { error: "Dataset not found or not authorised." }, 404);
              return;
            }
            const datasetRoot = safeDatasetFolder(dataset);
            const requestedFile = String(requestUrl.searchParams.get("file") || "").replace(/\\/g, "/");
            const resolvedFile = path.resolve(datasetRoot, requestedFile);
            if (!requestedFile || !resolvedFile.startsWith(`${datasetRoot}${path.sep}`)) {
              sendJson(response, { error: "Invalid private-library file path." }, 400);
              return;
            }
            const content = await readFile(resolvedFile);
            const extension = path.extname(resolvedFile).toLowerCase();
            response.statusCode = 200;
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Content-Type", extension === ".json" ? "application/json" : extension === ".md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8");
            response.end(content);
            return;
          }

          if (route === "/dataset" && request.method === "PATCH") {
            if (!requireUser(response, user)) return;
            const body = await readJsonBody(request);
            const manifest = await readManifest();
            const index = manifest.findIndex((entry) => String(entry.id || entry.datasetId) === String(body.id || ""));
            if (index < 0 || !canEditDataset(user, manifest[index])) {
              sendJson(response, { error: "Dataset not found or edit access was not granted." }, 403);
              return;
            }
            const allowedFields = ["label", "projectName", "mpw", "projectDisplayName", "projectCode", "waferName", "slot", "processStep", "measurementDate", "selectedDate", "platformLabel", "opticalMode", "buildingBlockLabel", "measurementType", "alignmentMode"];
            const next = { ...manifest[index] };
            for (const field of allowedFields) {
              if (Object.prototype.hasOwnProperty.call(body.patch || {}, field)) next[field] = body.patch[field];
            }
            next.updatedAt = new Date().toISOString();
            next.updatedBy = user.id;
            manifest[index] = next;
            await writeManifest(manifest);
            const metadataPath = path.join(safeDatasetFolder(next), "metadata.json");
            const metadata = await readJsonFile(metadataPath, {});
            await writeFile(metadataPath, `${JSON.stringify({ ...metadata, ...Object.fromEntries(allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(next, field)).map((field) => [field, next[field]])), updatedAt: next.updatedAt, updatedBy: user.id }, null, 2)}\n`, "utf8");
            sendJson(response, { dataset: privateDatasetPayload(next, user) });
            return;
          }

          if (route === "/users" && request.method === "GET") {
            if (!requireAdmin(response, user)) return;
            const access = await readAccessControl();
            sendJson(response, access.users.map(publicUser));
            return;
          }

          if (route === "/users" && request.method === "POST") {
            if (!requireAdmin(response, user)) return;
            const body = await readJsonBody(request);
            const access = await readAccessControl();
            const apiKey = createApiKey();
            const nextUser = {
              id: randomUUID(),
              name: String(body.name || "External user").trim(),
              role: ["viewer", "editor"].includes(body.role) ? body.role : "viewer",
              status: "active",
              accessGroups: [...new Set((Array.isArray(body.accessGroups) ? body.accessGroups : []).map((value) => String(value).trim().toLowerCase()).filter(Boolean))],
              apiKeyHash: sha256(apiKey),
              apiKeyHint: apiKey.slice(-6),
              createdAt: new Date().toISOString(),
              lastLoginAt: null
            };
            access.users.push(nextUser);
            await writeAccessControl(access);
            sendJson(response, { user: publicUser(nextUser), apiKey }, 201);
            return;
          }

          if (route === "/users" && request.method === "PATCH") {
            if (!requireAdmin(response, user)) return;
            const body = await readJsonBody(request);
            const access = await readAccessControl();
            const target = access.users.find((entry) => entry.id === body.id);
            if (!target) {
              sendJson(response, { error: "User not found." }, 404);
              return;
            }
            if (target.id === user.id && body.status === "revoked") {
              sendJson(response, { error: "You cannot revoke your own administrator key." }, 400);
              return;
            }
            if (body.action === "rotate") {
              const apiKey = createApiKey();
              target.apiKeyHash = sha256(apiKey);
              target.apiKeyHint = apiKey.slice(-6);
              target.status = "active";
              target.rotatedAt = new Date().toISOString();
              await writeAccessControl(access);
              sendJson(response, { user: publicUser(target), apiKey });
              return;
            }
            if (typeof body.name === "string") target.name = body.name.trim() || target.name;
            if (["viewer", "editor"].includes(body.role) && target.role !== "admin") target.role = body.role;
            if (["active", "revoked"].includes(body.status)) target.status = body.status;
            if (Array.isArray(body.accessGroups)) target.accessGroups = [...new Set(body.accessGroups.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
            target.updatedAt = new Date().toISOString();
            await writeAccessControl(access);
            sendJson(response, { user: publicUser(target) });
            return;
          }

          sendJson(response, { error: "Private-library endpoint not found." }, 404);
        } catch (error) {
          sendJson(response, { error: error instanceof Error ? error.message : "Private-library request failed." }, 500);
        }
      });
    }
  };
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

function geminiDevelopmentProxy(apiKey) {
  return {
    name: "gemini-development-proxy",
    configureServer(server) {
      server.middlewares.use("/api/ai", async (request, response, next) => {
        if (request.method !== "POST") return next();
        if (!apiKey) {
          sendJson(response, {
            error: "Gemini is not configured. Copy .env.example to .env.local, add GEMINI_API_KEY, and restart the dev server. Local diagnostics are still available."
          }, 503);
          return;
        }
        try {
          const body = await readJsonBody(request);
          if (body.provider !== "gemini") {
            sendJson(response, { error: "This AI provider is not enabled yet." }, 400);
            return;
          }
          const model = ALLOWED_GEMINI_MODELS.has(body.model) ? body.model : DEFAULT_GEMINI_MODEL;
          const storeAnalysis = body.storeAnalysis === true;
          const prompt = `You are a cautious silicon-photonics wafer diagnostics assistant. Use only the supplied evidence. Distinguish observations, hypotheses, confidence, and recommended verification. Never claim that sidewall roughness, lithography, etch, contamination, coupling, or instrumentation is proven from spectra alone. Return a concise engineering summary with: Priority findings; Possible explanations; Checks to run next; MPW comparison when present. Evidence JSON:\n${JSON.stringify(body.payload)}`;
          const result = await runGeminiInteraction(apiKey, model, prompt, storeAnalysis);
          const text = readInteractionText(result);
          sendJson(response, { provider: "gemini", model, text: text || "Gemini returned an empty response.", stored: storeAnalysis });
        } catch (error) {
          sendJson(response, { error: error instanceof Error ? error.message : "Unable to process the AI request." }, 500);
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "./",
    plugins: [react(), geminiDevelopmentProxy(env.GEMINI_API_KEY)]
  };
});
