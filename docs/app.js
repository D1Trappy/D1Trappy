// Study Hub: static site. Decks live in decks/*.json and are listed in decks/index.json.
// Progress is saved in this browser (localStorage) only.

const $ = id => document.getElementById(id);
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

let index = [], current = null, progress = { answers: {} }, tab = 'learn';
const cache = {};

// ---------- Shelf ----------
function renderShelf() {
  const q = $('search').value.trim().toLowerCase();
  const list = index.filter(d => !q || [d.title, d.code, d.subject].join(' ').toLowerCase().includes(q));
  $('shelf').innerHTML = list.length
    ? list.map(d => `<button class="deck" data-id="${esc(d.id)}" aria-pressed="${current && current.id === d.id}"><small>${esc(d.code || d.subject || 'Topic')}</small>${esc(d.title)}</button>`).join('')
    : '<p class="muted">No topics match that search.</p>';
  $('shelf').insertAdjacentHTML('beforeend', `<button class="deck add" id="add-btn" aria-pressed="${addOpen()}">+ Add a lesson</button>`);
  $('shelf').querySelectorAll('.deck[data-id]').forEach(b => b.onclick = () => { location.hash = b.dataset.id; });
  $('add-btn').onclick = () => { location.hash = 'add-lesson'; };
}

// ---------- Add a lesson ----------
const addOpen = () => !$('addview').classList.contains('hidden');
function showAdd(on) {
  $('addview').classList.toggle('hidden', !on);
  $('deckview').classList.toggle('hidden', on);
  if (on) { document.title = 'Add a lesson · Study Hub'; window.scrollTo(0, 0); }
  renderShelf();
}
$('copy-msg').onclick = async () => {
  const text = $('add-msg').textContent;
  try { await navigator.clipboard.writeText(text); $('copy-status').textContent = 'Copied. Paste it into Claude with your slides.'; }
  catch (e) {
    const r = document.createRange(); r.selectNodeContents($('add-msg'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    $('copy-status').textContent = 'Selected. Copy it with your keyboard or long-press.';
  }
};
$('add-back').onclick = () => { const last = ls.get('sh-last', null); location.hash = last || (index[0] && index[0].id) || ''; };
$('search').oninput = renderShelf;

async function loadDeck(id) {
  if (!cache[id]) {
    const r = await fetch(`decks/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('missing');
    cache[id] = await r.json();
  }
  return cache[id];
}

async function openDeck(id) {
  try { current = await loadDeck(id); current.id = id; }
  catch (e) { $('d-title').textContent = 'That topic could not be loaded.'; return; }
  progress = ls.get('sh-prog-' + id, { answers: {} });
  if (!progress.answers) progress.answers = {};
  ls.set('sh-last', id);
  showAdd(false);
  document.title = current.title + ' · Study Hub';
  renderShelf();
  $('d-code').textContent = current.code || current.subject || '';
  $('d-title').textContent = current.title;
  $('d-q').textContent = current.bigQuestion || '';
  renderLearn(); fcStart(); qzStart(); apStart(); renderExam(); showTab(tab);
}

// ---------- Tabs ----------
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) {
  tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.id !== t));
}

// ---------- Learn ----------
function renderLearn() {
  const p = current;
  $('learn').innerHTML = (p.sections || []).map(s => `
    <div class="card sec ${s.table ? 'tablebox' : ''}">
      <h3>${esc(s.heading)}</h3>
      ${s.text ? `<p>${esc(s.text)}</p>` : ''}
      ${s.points && s.points.length ? `<ul class="tight">${s.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${s.table ? `<table><thead><tr>${s.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
    </div>`).join('')
    + (p.keyIdea ? `<div class="callout"><strong>Key idea:</strong> ${esc(p.keyIdea)}</div>` : '')
    + `<div class="row"><span class="spacer"></span><button class="btn" id="to-flash">Next: Flashcards →</button></div>`;
  $('to-flash').onclick = () => { showTab('flash'); window.scrollTo(0, 0); };
}

// ---------- Flashcards ----------
let fcDeck = [], fcIdx = 0, fcFlipped = false, fcKnown = 0, fcTotal = 0;
const fcCard = $('fc-card');
function fcStart() { const c = current.flashcards || []; fcTotal = c.length; fcDeck = shuffle(c); fcIdx = 0; fcKnown = 0; fcFlipped = false; fcRender(); }
function fcRender() {
  $('fc-count').textContent = `Known: ${fcKnown} / ${fcTotal}`;
  $('fc-bar').style.width = (fcTotal ? fcKnown / fcTotal * 100 : 0) + '%';
  if (!fcDeck.length) {
    fcCard.className = 'flash back';
    fcCard.innerHTML = `<div><div class="term">All ${fcTotal} cards done</div><span class="hint">Press "Start again" to go round once more, or try the Quiz.</span></div>`;
    $('fc-actions').classList.add('hidden'); return;
  }
  $('fc-actions').classList.remove('hidden');
  const [t, d] = fcDeck[fcIdx];
  fcCard.className = 'flash' + (fcFlipped ? ' back' : '');
  fcCard.innerHTML = fcFlipped ? `<div><div class="def">${esc(d)}</div><span class="hint">${esc(t)}</span></div>` : `<div><div class="term">${esc(t)}</div><span class="hint">Tap or press Space to flip</span></div>`;
  $('fc-know').disabled = $('fc-again').disabled = !fcFlipped;
}
function fcFlip() { if (fcDeck.length) { fcFlipped = !fcFlipped; fcRender(); } }
fcCard.onclick = fcFlip;
fcCard.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fcFlip(); } };
$('fc-know').onclick = () => { fcDeck.splice(fcIdx, 1); fcKnown++; if (fcIdx >= fcDeck.length) fcIdx = 0; fcFlipped = false; fcRender(); };
$('fc-again').onclick = () => { fcDeck.push(fcDeck.splice(fcIdx, 1)[0]); if (fcIdx >= fcDeck.length) fcIdx = 0; fcFlipped = false; fcRender(); };
$('fc-reset').onclick = fcStart;

// ---------- Multiple-choice runner (Quiz + Apply) ----------
function makeRunner(pre, getItems, qText) {
  let order = [], i = 0, score = 0;
  function start() { order = shuffle(getItems()); i = 0; score = 0; render(); }
  function render() {
    const box = $(pre + '-box');
    $(pre + '-score').textContent = `Score: ${score}`;
    $(pre + '-bar').style.width = (order.length ? i / order.length * 100 : 0) + '%';
    if (!order.length) { box.innerHTML = '<p class="muted">No questions in this topic yet.</p>'; $(pre + '-pos').textContent = ''; return; }
    if (i >= order.length) {
      $(pre + '-pos').textContent = 'Finished';
      const pct = Math.round(score / order.length * 100);
      box.innerHTML = `<div class="big">${score} / ${order.length}</div><p>${pct >= 85 ? 'Excellent. You\'re ready for the next section.' : pct >= 60 ? 'Good work. Re-read the Learn tab for the ones you missed, then try again.' : 'Keep going. Go back through Learn and the Flashcards, then retry.'}</p><div class="row"><button class="btn" id="${pre}-again">Try again</button></div>`;
      $(pre + '-again').onclick = start; return;
    }
    const it = order[i];
    $(pre + '-pos').textContent = `Question ${i + 1} of ${order.length}`;
    box.innerHTML = `<h3 style="white-space:pre-line">${esc(qText(it))}</h3><div class="options">${it.o.map((o, j) => `<button class="opt" data-i="${j}">${esc(o)}</button>`).join('')}</div><div id="${pre}-fb"></div>`;
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
  }
  function answer(j) {
    const it = order[i], btns = $(pre + '-box').querySelectorAll('.opt');
    if (btns[0].disabled) return;
    btns.forEach((b, k) => { b.disabled = true; if (k === it.a) b.classList.add('right'); else if (k === j) b.classList.add('wrong'); });
    const ok = j === it.a; if (ok) score++;
    $(pre + '-score').textContent = `Score: ${score}`;
    $(pre + '-fb').innerHTML = `<div class="feedback"><strong>${ok ? 'Correct.' : 'Not quite.'}</strong> ${esc(it.e)}</div><div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" id="${pre}-next">Next →</button></div>`;
    const nx = $(pre + '-next'); nx.focus(); nx.onclick = () => { i++; render(); };
  }
  return start;
}
const qzStart = makeRunner('qz', () => current.quiz || [], it => it.q);
const apRun = makeRunner('ap', () => (current.apply && current.apply.items) || [], it => it.task);
function apStart() {
  const a = current.apply || {};
  $('ap-title').textContent = a.title || 'Apply it';
  $('ap-intro').textContent = a.intro || 'Use what you\'ve learned on real situations.';
  apRun();
}

// ---------- Exam ----------
let saveTimer = null, pendingSave = null;
function save() {
  clearTimeout(saveTimer);
  const id = current.id, p = progress;
  pendingSave = () => { ls.set('sh-prog-' + id, p); pendingSave = null; };
  saveTimer = setTimeout(pendingSave, 500);
}
// Save straight away if the page is closed or hidden mid-typing.
const flushSave = () => { if (pendingSave) { clearTimeout(saveTimer); pendingSave(); } };
addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
function markingText(item, answer) {
  return `Please mark my exam answer like a strict examiner, then tell me how to get full marks.\n\n${item.sc ? 'Scenario: ' + item.sc + '\n\n' : ''}Question (${item.m} marks): ${item.q}\n\nMark scheme:\n${item.pts.map(p => '- ' + p).join('\n')}\n\nMy answer:\n${answer}`;
}
function renderExam() {
  const list = $('exam-list'); list.innerHTML = '';
  let lastSc = null;
  (current.exam || []).forEach((item, idx) => {
    const qid = 'e' + idx;
    if (item.sc && item.sc !== lastSc) { const s = document.createElement('div'); s.className = 'scenario'; s.innerHTML = `<strong>Scenario:</strong> ${esc(item.sc)}`; list.appendChild(s); }
    lastSc = item.sc || lastSc;
    const st = progress.answers[qid] || { text: '', ticks: [] };
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `
      <div class="row" style="align-items:flex-start"><h3 style="white-space:pre-line;flex:1">${esc(item.q)}</h3><span class="marks">(${item.m} mark${item.m > 1 ? 's' : ''})</span></div>
      <textarea aria-label="Your answer" placeholder="Write your answer here first…">${esc(st.text)}</textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost small" data-act="scheme">Show mark scheme</button>
        <button class="btn ghost small" data-act="copy">Copy to get it marked</button>
        <span class="status" data-role="copied"></span>
      </div>
      <div class="scheme hidden" data-role="scheme">
        <p style="margin:0 0 4px"><strong>Mark scheme</strong> (tick what you got${item.pts.length > item.m ? `, max ${item.m}` : ''}):</p>
        ${item.pts.map((pt, i) => `<label><input type="checkbox" data-i="${i}" ${st.ticks.includes(i) ? 'checked' : ''}><span>${esc(pt)}</span></label>`).join('')}
        ${item.tip ? `<div class="dstar"><strong>Top-grade tip:</strong> ${esc(item.tip)}</div>` : ''}
      </div>`;
    list.appendChild(c);
    const entry = () => (progress.answers[qid] = progress.answers[qid] || { text: '', ticks: [] });
    const ta = c.querySelector('textarea');
    ta.oninput = () => { entry().text = ta.value; save(); };
    const sch = c.querySelector('[data-role=scheme]'), sb = c.querySelector('[data-act=scheme]');
    sb.onclick = () => { const h = sch.classList.toggle('hidden'); sb.textContent = h ? 'Show mark scheme' : 'Hide mark scheme'; };
    c.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
      const e = entry(), i = +cb.dataset.i; e.ticks = e.ticks.filter(x => x !== i); if (cb.checked) e.ticks.push(i); save(); exTotal();
    });
    const note = c.querySelector('[data-role=copied]');
    c.querySelector('[data-act=copy]').onclick = async () => {
      if (!ta.value.trim()) { note.textContent = 'Write an answer first.'; return; }
      try { await navigator.clipboard.writeText(markingText(item, ta.value)); note.textContent = 'Copied. Paste it into Claude to get it marked.'; }
      catch (e) { note.textContent = 'Couldn\'t copy. Select your answer and copy it yourself.'; }
    };
  });
  exTotal();
}
function exTotal() {
  let t = 0, m = 0;
  (current.exam || []).forEach((it, i) => { m += it.m; const s = progress.answers['e' + i]; t += Math.min(it.m, s ? s.ticks.length : 0); });
  $('ex-total').textContent = t; $('ex-max').textContent = '/ ' + m;
}

// ---------- Start ----------
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id === 'add-lesson') showAdd(true);
  else if (id && index.some(d => d.id === id)) openDeck(id);
});
(async function init() {
  try {
    const r = await fetch('decks/index.json', { cache: 'no-cache' });
    index = (await r.json()).decks || [];
  } catch (e) { $('d-title').textContent = 'Couldn\'t load the topic list. Refresh the page to try again.'; return; }
  renderShelf();
  const fromHash = location.hash.slice(1), last = ls.get('sh-last', null);
  const id = [fromHash, last].find(x => x && index.some(d => d.id === x)) || (index[0] && index[0].id);
  if (fromHash === 'add-lesson') showAdd(true);
  else if (id) openDeck(id); else $('d-title').textContent = 'No topics yet.';
})();
