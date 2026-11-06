// Checks every study pack in docs/decks/ and rebuilds docs/decks/index.json, topics.json and glossary.json.
// Run after adding or editing a deck:  node scripts/build-index.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'decks');
const errors = [];
const GENERATED = ['index.json', 'topics.json', 'glossary.json'];
const diagrams = new Set(); // every diagram used, so the app can save them for offline use
const decks = [];
const glossary = []; // every key term, for the Glossary page
const topics = []; // course index for the AI helper (functions/api/ask.js)

const isStr = x => typeof x === 'string' && x.trim().length > 0;
const checkMc = (items, where) => items.forEach((it, i) => {
  if (!Array.isArray(it.o) || it.o.length < 2) errors.push(`${where}[${i}]: needs at least 2 options in "o"`);
  else if (!Number.isInteger(it.a) || it.a < 0 || it.a >= it.o.length) errors.push(`${where}[${i}]: "a" must be the index of the right option`);
  if (!isStr(it.e)) errors.push(`${where}[${i}]: missing explanation "e"`);
});

for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && !GENERATED.includes(f)).sort()) {
  const id = file.replace(/\.json$/, '');
  const where = file;
  let d;
  try { d = JSON.parse(readFileSync(join(dir, file), 'utf8')); }
  catch (e) { errors.push(`${where}: not valid JSON (${e.message})`); continue; }
  if (!/^[a-z0-9-]+$/.test(id)) errors.push(`${where}: file name must use only a-z, 0-9 and -`);
  if (d.id !== id) errors.push(`${where}: "id" must be "${id}"`);
  for (const k of ['title', 'subject', 'added']) if (!isStr(d[k])) errors.push(`${where}: missing "${k}"`);
  if (!Array.isArray(d.sections) || !d.sections.length) errors.push(`${where}: needs "sections"`);
  (d.sections || []).forEach((s, i) => {
    if (!s.diagram) return;
    if (!isStr(s.diagram.src) || !/^diagrams\/[a-z0-9-]+\.svg$/.test(s.diagram.src)) errors.push(`${where} sections[${i}]: diagram "src" must look like diagrams/name.svg`);
    else if (!existsSync(join(dir, '..', s.diagram.src))) errors.push(`${where} sections[${i}]: ${s.diagram.src} doesn't exist (run python3 scripts/make-diagrams.py)`);
    else diagrams.add(s.diagram.src);
    if (!isStr(s.diagram.alt)) errors.push(`${where} sections[${i}]: diagram needs "alt" text describing it`);
  });
  if (!Array.isArray(d.flashcards) || d.flashcards.some(c => !Array.isArray(c) || c.length !== 2)) errors.push(`${where}: "flashcards" must be [term, definition] pairs`);
  checkMc(d.quiz || [], `${where} quiz`);
  checkMc((d.apply && d.apply.items) || [], `${where} apply.items`);
  (d.exam || []).forEach((q, i) => {
    if (!isStr(q.q)) errors.push(`${where} exam[${i}]: missing "q"`);
    if (!Number.isInteger(q.m) || q.m < 1) errors.push(`${where} exam[${i}]: "m" (marks) must be a whole number`);
    if (!Array.isArray(q.pts) || !q.pts.length) errors.push(`${where} exam[${i}]: needs marking points "pts"`);
  });
  // Totals for the progress tracker.
  const counts = { cards: (d.flashcards || []).length, quiz: (d.quiz || []).length, apply: ((d.apply && d.apply.items) || []).length, marks: (d.exam || []).reduce((t, q) => t + (q.m || 0), 0) };
  decks.push({ id, title: d.title, code: d.code || '', subject: d.subject, added: d.added, ...counts });
  for (const [term, def] of d.flashcards || []) glossary.push({ term, def, id });
  topics.push({ id, title: d.title, headings: (d.sections || []).map(x => x.heading), terms: (d.flashcards || []).map(c => c[0]) });
}

if (errors.length) {
  console.error('Problems found:\n- ' + errors.join('\n- '));
  process.exit(1);
}
// Sort by title in natural number order, so "Lesson 2" comes before "Lesson 10".
decks.sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true, sensitivity: 'base' }) || a.added.localeCompare(b.added));
writeFileSync(join(dir, 'index.json'), JSON.stringify({ decks, diagrams: [...diagrams].sort() }, null, 1) + '\n');
const order = new Map(decks.map((d, i) => [d.id, i]));
topics.sort((a, b) => order.get(a.id) - order.get(b.id));
writeFileSync(join(dir, 'topics.json'), JSON.stringify({ topics }) + '\n');
glossary.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base', numeric: true }) || order.get(a.id) - order.get(b.id));
writeFileSync(join(dir, 'glossary.json'), JSON.stringify({ terms: glossary }) + '\n');
console.log(`OK: ${decks.length} deck(s) listed in docs/decks/index.json (plus topics.json for the AI helper and glossary.json with ${glossary.length} terms)`);
