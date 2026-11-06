// Shared by the AI helper (functions/api/ask.js) and AI marking (functions/api/mark.js).
// The Anthropic API key is the Cloudflare secret ANTHROPIC_API_KEY, never in the website's code.
import Anthropic from "@anthropic-ai/sdk";

export { Anthropic };
export const MODEL = "claude-haiku-5-5"; // chosen by the owner for cost

const RATE_LIMIT = 20;                 // AI requests (questions + markings) per person…
const RATE_WINDOW_MS = 10 * 60 * 1000; // …per 10 minutes

// Best-effort limit per visitor. It resets when Cloudflare restarts the worker, so the
// monthly spend limit in the Anthropic Console is the real safety net.
const recent = new Map();
export function rateLimited(ip) {
  const now = Date.now();
  const times = (recent.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) { recent.set(ip, times); return true; }
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear();
  return false;
}

export function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "nbastudyhub.pages.dev" || host.endsWith(".nbastudyhub.pages.dev") ||
      host === "localhost" || host === "127.0.0.1";
  } catch { return false; }
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// Common checks for every AI request. Returns an error Response, or null if it may go ahead.
export function guard(request, env) {
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);
  if (rateLimited(request.headers.get("CF-Connecting-IP") || "unknown")) return json({ error: "rate_limited" }, 429);
  return null;
}

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

// Loads one lesson pack from the site's own files. Returns null if it isn't a real lesson.
export async function loadDeck(env, url, deckId) {
  if (typeof deckId !== "string" || !/^[a-z0-9-]{1,120}$/.test(deckId)) return null;
  const res = await env.ASSETS.fetch(new URL(`/decks/${deckId}.json`, url));
  if (!res.ok) return null;
  let deck;
  try { deck = await res.json(); } catch { return null; }
  return deck && deck.id === deckId && Array.isArray(deck.sections) ? deck : null;
}

let topicsCache = null;
export async function loadTopics(env, url) {
  if (topicsCache) return topicsCache;
  try {
    const res = await env.ASSETS.fetch(new URL("/decks/topics.json", url));
    if (res.ok) topicsCache = (await res.json()).topics || [];
  } catch { /* the helper still works with just the open lesson */ }
  return topicsCache || [];
}

export const newClient = (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 });

export function apiError(error) {
  if (error instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("Anthropic key problem:", error.status);
    return json({ error: "not_configured" }, 503);
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Anthropic API error:", error.status, error.message);
    return json({ error: "upstream" }, 502);
  }
  console.error("AI request error:", error);
  return json({ error: "upstream" }, 502);
}

export const textOf = (response) => response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
