// Study Hub AI helper: POST /api/ask
// Runs as a Cloudflare Pages Function; shared checks and the API client are in lib/shared.js.
import { MODEL, json, guard, readJson, loadDeck, loadTopics, newClient, apiError, textOf } from "../../lib/shared.js";

const MAX_QUESTION = 600;        // characters per question
const MAX_HISTORY = 8;           // earlier messages sent back for context
const MAX_HISTORY_TEXT = 2000;   // characters per earlier message

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

// One line per lesson: title, section headings and key terms, so the helper can say
// which lesson covers a topic. Built by scripts/build-index.mjs as docs/decks/topics.json.
export function courseIndex(topics, currentId) {
  return (topics || []).map((t) =>
    `- ${t.title}${t.id === currentId ? " (the lesson open now)" : ""}: ${[...(t.headings || []), ...(t.terms || [])].join("; ")}`
  ).join("\n");
}

export function systemPrompt(deck, topics = []) {
  return `You are the Study Hub revision helper. The students using you are mostly aged 16 to 18, in the UK, learning BTEC-style Information Technology (Unit 2: cyber security) for the first time and aiming for a Distinction*. The student is currently studying the lesson below; the notes come from their own lesson slides.

How to help:
- Explain clearly in plain UK English with short sentences, at a level a first-time learner can follow. Use examples from the lesson where you can.
- Keep answers short: usually 2 to 6 sentences, or a few bullet points starting with "- ". Don't use headings, tables or other formatting.
- Base your answers on the lesson notes. If something isn't covered in the notes or the course index, you can give a brief standard explanation, but say it wasn't in their slides and suggest checking with their teacher.
- For exam-style questions, help the student work it out themselves: explain what the command word wants, how to structure the answer (a point plus a linked reason, using the scenario), and give hints. Give feedback on attempts they share. Only show a full model answer after they've had a go, and then explain why it scores well.
- Explain attacks at the level of the lesson, for understanding and defence. Don't give step-by-step instructions for attacking real systems.
- Stay focused on studying. If asked about something unrelated, kindly steer back to the lesson.
- Never ask for personal details. If a student seems upset or unsafe, or mentions harm, respond kindly, encourage them to talk to a trusted adult or teacher, and mention Childline (0800 1111, childline.org.uk).
- If you're not sure about something, say so rather than guessing.
- The course index below lists every lesson in the student's course. If a question is about something taught in a different lesson, name that lesson exactly as it appears in the index and suggest they open it, then give a short explanation in line with that lesson's key terms. Only say a topic isn't in their slides when it isn't in the index either.

COURSE INDEX
${courseIndex(topics, deck.id)}`;
}

export function lessonPrompt(deck) {
  return `LESSON NOTES (the lesson open now)
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
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const body = await readJson(request);
  const question = body && typeof body.question === "string" ? body.question.trim() : "";
  if (!body || typeof body.deckId !== "string" || !/^[a-z0-9-]{1,120}$/.test(body.deckId) || !question || question.length > MAX_QUESTION) {
    return json({ error: "bad_request" }, 400);
  }
  const deck = await loadDeck(env, request.url, body.deckId);
  if (!deck) return json({ error: "unknown_lesson" }, 404);
  const topics = await loadTopics(env, request.url);

  const messages = cleanHistory(body.history);
  if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
  messages.push({ role: "user", content: question });

  try {
    const response = await newClient(env).messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" }, // reuse the instructions, index and lesson notes across a student's questions
      system: [
        { type: "text", text: systemPrompt(deck, topics) },
        { type: "text", text: lessonPrompt(deck) },
      ],
      messages,
    });
    if (response.stop_reason === "refusal") {
      return json({ answer: "Sorry, I can't help with that one. Try asking me something about this lesson." });
    }
    const answer = textOf(response);
    if (!answer) return json({ error: "empty" }, 502);
    return json({ answer });
  } catch (error) {
    return apiError(error);
  }
}
