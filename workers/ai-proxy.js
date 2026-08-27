import { onRequestOptions, onRequestPost } from "../functions/api/ai.js";

export default {
  fetch(request, env) {
    const context = { request, env };
    if (request.method === "OPTIONS") return onRequestOptions(context);
    if (request.method === "POST") return onRequestPost(context);
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST, OPTIONS" }
    });
  }
};
