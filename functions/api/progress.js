// Study Hub progress sync: GET /api/progress (all of the signed-in user's lessons),
// POST /api/progress { deckId, data } (save one lesson's progress).
import { json, allowedOrigin, rateLimited, readJson } from "../../lib/shared.js";
import { ensureSchema, currentUser } from "../../lib/auth.js";

const MAX_DATA = 100000; // characters of saved progress per lesson
const MAX_DECKS = 300;   // lessons per account

async function user(env, request) {
  if (!env.DB) return { error: json({ error: "accounts_off" }, 503) };
  await ensureSchema(env.DB);
  const me = await currentUser(env.DB, request);
  return me ? { me } : { error: json({ error: "signed_out" }, 401) };
}

export async function onRequestGet({ env, request }) {
  const { me, error } = await user(env, request);
  if (error) return error;
  const { results } = await env.DB.prepare("SELECT deck_id, data, updated_at FROM progress WHERE user_id = ?").bind(me.id).all();
  const decks = {};
  for (const r of results || []) {
    try { decks[r.deck_id] = { data: JSON.parse(r.data), updated: r.updated_at }; } catch { /* skip a damaged row */ }
  }
  return json({ username: me.username, decks });
}

export async function onRequestPost({ env, request }) {
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  const { me, error } = await user(env, request);
  if (error) return error;
  if (rateLimited("sync:" + me.id, 300)) return json({ error: "rate_limited" }, 429);
  const body = await readJson(request);
  if (!body || typeof body.deckId !== "string" || !/^[a-z0-9-]{1,120}$/.test(body.deckId) || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return json({ error: "bad_request" }, 400);
  }
  const data = JSON.stringify(body.data);
  if (data.length > MAX_DATA) return json({ error: "too_big" }, 413);
  const existing = await env.DB.prepare("SELECT 1 FROM progress WHERE user_id = ? AND deck_id = ?").bind(me.id, body.deckId).first();
  if (!existing) {
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM progress WHERE user_id = ?").bind(me.id).first();
    if (n >= MAX_DECKS) return json({ error: "too_many" }, 413);
  }
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO progress (user_id, deck_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, deck_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(me.id, body.deckId, data, now).run();
  return json({ ok: true, updated: now });
}
