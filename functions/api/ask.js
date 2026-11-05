// Study Hub AI helper: POST /api/ask
// Runs as a Cloudflare Pages Function. The Anthropic API key lives in the Cloudflare
// project's settings as the secret ANTHROPIC_API_KEY, never in the website's code.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-5-5";
const MAX_QUESTION = 600;        // characters per question
const MAX_HISTORY = 8;           // earlier messages sent back for context
const MAX_HISTORY_TEXT = 2000;   // characters per earlier message
const RATE_LIMIT = 15;           // questions per person…
const RATE_WINDOW_MS = 10 * 60 * 1000; // …per 10 minutes

// Best-effort limit per visitor. It resets when Cloudflare restarts the worker, so the
// monthly spend limit in the Anthropic Console is the real safety net.
const recent = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const times = (recent.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) { recent.set(ip, times); return true; }
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear();
  return false;
}

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "nbastudyhub.pages.dev" || host.endsWith(".nbastudyhub.pages.dev") ||
      host === "localhost" || host === "127.0.0.1";
  } catch { return false; }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// Turn a study pack into plain-text notes for the system prompt.
export function lessonNotes(deck) {
  const out = [];
  out.push(`Lesson: ${deck.title} (${deck.code || deck.subject || ""})`);
  if (deck.bigQuestion) out.push(`Big question: ${deck.bigQuestion}`);
  for (const s of deck.sections || []) {
    out.push(`\n## ${s.heading}`);
    if (s.text) out.push(s.text);
    for (const p of s.points || []) out.push(`- ${p}`);
    if (s.table) {
      out.push(s.table.head.join(" | "));
      for (const r of s.table.rows) out.push(r.join(" | "));
    }
  }
  if (deck.keyIdea) out.push(`\nKey idea: ${deck.keyIdea}`);
  if (deck.flashcards?.length) {
    out.push("\n## Key terms");
    for (const [t, d] of deck.flashcards) out.push(`- ${t}: ${d}`);
  }
  return out.join("\n");
}

export function systemPrompt(deck) {
  return `You are the Study Hub revision helper. The students using you are mostly aged 16 to 18, in the UK, learning BTEC-style Information Technology (Unit 2: cyber security) for the first time and aiming for a Distinction*. The student is currently studying the lesson below; the notes come from their own lesson slides.

How to help:
- Explain clearly in plain UK English with short sentences, at a level a first-time learner can follow. Use examples from the lesson where you can.
- Keep answers short: usually 2 to 6 sentences, or a few bullet points starting with "- ". Don't use headings, tables or other formatting.
- Base your answers on the lesson notes. If something isn't covered there, you can give a brief standard explanation, but say it wasn't in their slides and suggest checking with their teacher.
- For exam-style questions, help the student work it out themselves: explain what the command word wants, how to structure the answer (a point plus a linked reason, using the scenario), and give hints. Give feedback on attempts they share. Only show a full model answer after they've had a go, and then explain why it scores well.
- Explain attacks at the level of the lesson, for understanding and defence. Don't give step-by-step instructions for attacking real systems.
- Stay focused on studying. If asked about something unrelated, kindly steer back to the lesson.
- Never ask for personal details. If a student seems upset or unsafe, or mentions harm, respond kindly, encourage them to talk to a trusted adult or teacher, and mention Childline (0800 1111, childline.org.uk).
- If you're not sure about something, say so rather than guessing.

LESSON NOTES
${lessonNotes(deck)}`;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const msgs = history.slice(-MAX_HISTORY)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role, content: m.text.slice(0, MAX_HISTORY_TEXT) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift(); // must start with the student
  // roles must alternate; drop any repeats
  return msgs.filter((m, i) => i === 0 || m.role !== msgs[i - 1].role);
}

export async function onRequestPost({ request, env }) {
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const deckId = typeof body.deckId === "string" ? body.deckId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!/^[a-z0-9-]{1,120}$/.test(deckId) || !question || question.length > MAX_QUESTION) {
    return json({ error: "bad_request" }, 400);
  }

  const deckRes = await env.ASSETS.fetch(new URL(`/decks/${deckId}.json`, request.url));
  if (!deckRes.ok) return json({ error: "unknown_lesson" }, 404);
  let deck;
  try { deck = await deckRes.json(); } catch { return json({ error: "unknown_lesson" }, 404); }

  const messages = cleanHistory(body.history);
  if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
  messages.push({ role: "user", content: question });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" }, // reuse the lesson notes across a student's questions
      system: systemPrompt(deck),
      messages,
    });
    if (response.stop_reason === "refusal") {
      return json({ answer: "Sorry, I can't help with that one. Try asking me something about this lesson." });
    }
    const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!answer) return json({ error: "empty" }, 502);
    return json({ answer });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("Anthropic key problem:", error.status);
      return json({ error: "not_configured" }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message);
      return json({ error: "upstream" }, 502);
    }
    console.error("Helper error:", error);
    return json({ error: "upstream" }, 502);
  }
}
