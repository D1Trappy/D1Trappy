// Checks every study pack in docs/decks/ and rebuilds docs/decks/index.json.
// Run after adding or editing a deck:  node scripts/build-index.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'decks');
const errors = [];
const decks = [];

const isStr = x => typeof x === 'string' && x.trim().length > 0;
const checkMc = (items, where) => items.forEach((it, i) => {
  if (!Array.isArray(it.o) || it.o.length < 2) errors.push(`${where}[${i}]: needs at least 2 options in "o"`);
  else if (!Number.isInteger(it.a) || it.a < 0 || it.a >= it.o.length) errors.push(`${where}[${i}]: "a" must be the index of the right option`);
  if (!isStr(it.e)) errors.push(`${where}[${i}]: missing explanation "e"`);
});

for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const id = file.replace(/\.json$/, '');
  const where = file;
  let d;
  try { d = JSON.parse(readFileSync(join(dir, file), 'utf8')); }
  catch (e) { errors.push(`${where}: not valid JSON (${e.message})`); continue; }
  if (!/^[a-z0-9-]+$/.test(id)) errors.push(`${where}: file name must use only a-z, 0-9 and -`);
  if (d.id !== id) errors.push(`${where}: "id" must be "${id}"`);
  for (const k of ['title', 'subject', 'added']) if (!isStr(d[k])) errors.push(`${where}: missing "${k}"`);
  if (!Array.isArray(d.sections) || !d.sections.length) errors.push(`${where}: needs "sections"`);
  if (!Array.isArray(d.flashcards) || d.flashcards.some(c => !Array.isArray(c) || c.length !== 2)) errors.push(`${where}: "flashcards" must be [term, definition] pairs`);
  checkMc(d.quiz || [], `${where} quiz`);
  checkMc((d.apply && d.apply.items) || [], `${where} apply.items`);
  (d.exam || []).forEach((q, i) => {
    if (!isStr(q.q)) errors.push(`${where} exam[${i}]: missing "q"`);
    if (!Number.isInteger(q.m) || q.m < 1) errors.push(`${where} exam[${i}]: "m" (marks) must be a whole number`);
    if (!Array.isArray(q.pts) || !q.pts.length) errors.push(`${where} exam[${i}]: needs marking points "pts"`);
  });
  decks.push({ id, title: d.title, code: d.code || '', subject: d.subject, added: d.added });
}

if (errors.length) {
  console.error('Problems found:\n- ' + errors.join('\n- '));
  process.exit(1);
}
// Sort by title in natural number order, so "Lesson 2" comes before "Lesson 10".
decks.sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true, sensitivity: 'base' }) || a.added.localeCompare(b.added));
writeFileSync(join(dir, 'index.json'), JSON.stringify({ decks }, null, 1) + '\n');
console.log(`OK: ${decks.length} deck(s) listed in docs/decks/index.json`);
