const PRIVATE_API_BASE = "/api/private";
const PRIVATE_KEY_STORAGE = "wps.private-api-key.v1";

function storedApiKey() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(PRIVATE_KEY_STORAGE) || "";
}

function rememberApiKey(apiKey) {
  if (typeof window === "undefined") return;
  if (apiKey) window.sessionStorage.setItem(PRIVATE_KEY_STORAGE, apiKey);
  else window.sessionStorage.removeItem(PRIVATE_KEY_STORAGE);
}

async function privateRequest(path, options = {}) {
  const apiKey = options.apiKey ?? storedApiKey();
  const response = await fetch(`${PRIVATE_API_BASE}${path}`, {
    ...options,
    apiKey: undefined,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...options.headers
    },
    cache: "no-store"
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.error || `Private-library request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function clearPrivateApiKey() {
  rememberApiKey("");
}

export async function getPrivateSession() {
  try {
    return await privateRequest("/session");
  } catch (error) {
    if (error.status === 401) clearPrivateApiKey();
    throw error;
  }
}

export async function loginPrivateLibrary(apiKey) {
  const result = await privateRequest("/login", {
    method: "POST",
    apiKey: "",
    body: JSON.stringify({ apiKey })
  });
  rememberApiKey(apiKey);
  return result;
}

export async function bootstrapPrivateAdmin() {
  const result = await privateRequest("/bootstrap", { method: "POST", apiKey: "", body: "{}" });
  rememberApiKey(result.apiKey);
  return result;
}

export function fetchPrivateDatasetAsset(definition, fileName) {
  const query = new URLSearchParams({ datasetId: definition.id, file: fileName });
  return fetch(`${PRIVATE_API_BASE}/asset?${query}`, {
    headers: { Authorization: `Bearer ${storedApiKey()}` },
    cache: "no-store"
  });
}

export function listPrivateDatasets() {
  return privateRequest("/library");
}

export function updatePrivateDataset(id, patch) {
  return privateRequest("/dataset", { method: "PATCH", body: JSON.stringify({ id, patch }) });
}

export function listPrivateUsers() {
  return privateRequest("/users");
}

export function createPrivateUser(values) {
  return privateRequest("/users", { method: "POST", body: JSON.stringify(values) });
}

export function updatePrivateUser(values) {
  return privateRequest("/users", { method: "PATCH", body: JSON.stringify(values) });
}

export function rotatePrivateUserKey(id) {
  return updatePrivateUser({ id, action: "rotate" });
}
