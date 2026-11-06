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
// Lets the AI helper (assistant.js) see which lesson is open.
window.studyHub = { get deck() { return current; } };
const cache = {};

// ---------- Shelf ----------
function renderShelf() {
  const q = $('search').value.trim().toLowerCase();
  const list = index.filter(d => !q || [d.title, d.code, d.subject].join(' ').toLowerCase().includes(q));
  $('shelf').innerHTML = list.length
    ? list.map(d => `<button class="deck" data-id="${esc(d.id)}" aria-pressed="${current && current.id === d.id}"><small>${esc(d.code || d.subject || 'Topic')}</small>${esc(d.title)}</button>`).join('')
    : '<p class="muted">No topics match that search.</p>';
  $('shelf').querySelectorAll('.deck').forEach(b => b.onclick = () => { location.hash = b.dataset.id; });
}

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
  if (view === 'lessons') document.title = current.title + ' · Study Hub';
  renderShelf();
  $('d-code').textContent = current.code || current.subject || '';
  $('d-title').textContent = current.title;
  $('d-q').textContent = current.bigQuestion || '';
  renderLearn(); fcStart(); qzStart(); apStart(); renderExam(); showTab(tab);
  window.dispatchEvent(new CustomEvent('studyhub:deck', { detail: { id, title: current.title } }));
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
$('fc-know').onclick = () => {
  fcDeck.splice(fcIdx, 1); fcKnown++; if (fcIdx >= fcDeck.length) fcIdx = 0; fcFlipped = false; fcRender();
  if (fcKnown > (progress.fcBest || 0)) { progress.fcBest = fcKnown; save(); }
};
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
      if (score > (progress[pre + 'Best'] || 0)) { progress[pre + 'Best'] = score; save(); }
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
// Exam score for one question: the AI's mark if it has marked it, otherwise the ticked points.
const qScore = (item, st) => !st ? 0 : Math.min(item.m, st.ai ? st.ai.score : (st.ticks || []).length);
function aiResultHtml(item, r) {
  return `<div class="row"><strong>AI mark</strong><span class="spacer"></span><span class="big score" style="font-size:28px">${r.score} / ${r.max}</span></div>
    ${r.awarded.length ? `<p class="ai-h">Points you earned</p><ul class="tight">${r.awarded.map(i => `<li>✓ ${esc(item.pts[i])}</li>`).join('')}</ul>` : ''}
    ${r.feedback ? `<p class="ai-h">What went well</p><p>${esc(r.feedback)}</p>` : ''}
    ${r.score < r.max && r.improve ? `<p class="ai-h">To get full marks</p><p>${esc(r.improve)}</p>` : ''}
    <p class="muted small-note">AI marking can make mistakes. Check it against the mark scheme, and go with your teacher if they disagree.</p>`;
}
function aiErrorText(status, code) {
  if (status === 404 && !code) return 'AI marking only works on the main site: nbastudyhub.pages.dev';
  if (code === 'not_configured') return 'AI marking isn\'t switched on yet.';
  if (code === 'rate_limited') return 'You\'ve used the AI a lot in the last few minutes. Try again shortly.';
  if (code === 'busy') return 'Lots of people are using the AI right now. Try again in a minute.';
  if (code === 'bad_request') return 'Your answer is too long to mark. Keep it under 3,000 characters.';
  return 'Sorry, the AI couldn\'t mark that. Please try again.';
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
        <button class="btn small" data-act="ai">Mark my answer with AI</button>
        <span class="status" data-role="ainote"></span>
      </div>
      <div class="ai-result ${st.ai ? '' : 'hidden'}" data-role="ai">${st.ai ? aiResultHtml(item, st.ai) : ''}</div>
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
      const e = entry(), i = +cb.dataset.i; e.ticks = e.ticks.filter(x => x !== i); if (cb.checked) e.ticks.push(i);
      if (e.ai) e.ai.score = Math.min(item.m, e.ticks.length); // your own ticks win
      save(); exTotal();
    });
    const note = c.querySelector('[data-role=ainote]'), aiBox = c.querySelector('[data-role=ai]'), aiBtn = c.querySelector('[data-act=ai]');
    aiBtn.onclick = async () => {
      if (!ta.value.trim()) { note.textContent = 'Write an answer first.'; return; }
      const deckId = current.id;
      aiBtn.disabled = true; note.textContent = 'Marking…';
      try {
        const res = await fetch('api/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deckId, index: idx, answer: ta.value }) });
        let r = {}; try { r = await res.json(); } catch (e) {}
        if (!current || current.id !== deckId) return; // moved to another lesson meanwhile
        if (res.ok && Number.isInteger(r.score)) {
          const e = entry(); e.ai = { score: r.score, max: r.max, awarded: r.awarded, feedback: r.feedback, improve: r.improve, text: ta.value };
          e.ticks = r.awarded.slice();
          c.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = e.ticks.includes(+cb.dataset.i); });
          aiBox.innerHTML = aiResultHtml(item, e.ai); aiBox.classList.remove('hidden');
          note.textContent = ''; save(); exTotal();
        } else note.textContent = aiErrorText(res.status, r.error);
      } catch (e) { note.textContent = 'Couldn\'t connect. Check your internet and try again.'; }
      aiBtn.disabled = false; aiBtn.textContent = 'Mark again';
    };
    if (st.ai) aiBtn.textContent = 'Mark again';
  });
  exTotal();
}
function exTotal() {
  let t = 0, m = 0;
  (current.exam || []).forEach((it, i) => { m += it.m; t += qScore(it, progress.answers['e' + i]); });
  $('ex-total').textContent = t; $('ex-max').textContent = '/ ' + m;
  if (progress.examScore !== t) { progress.examScore = t; save(); } // for the progress page
}

// ---------- Pages: lessons / progress / glossary ----------
let view = 'lessons';
function showView(v) {
  view = v;
  $('deckview').classList.toggle('hidden', v !== 'lessons');
  $('shelf').classList.toggle('hidden', v !== 'lessons');
  $('search').classList.toggle('hidden', v !== 'lessons');
  $('progressview').classList.toggle('hidden', v !== 'progress');
  $('glossaryview').classList.toggle('hidden', v !== 'glossary');
  document.querySelectorAll('.view-link').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
  if (v === 'progress') { renderProgress(); document.title = 'My progress · Study Hub'; }
  if (v === 'glossary') { renderGlossary(); document.title = 'Glossary · Study Hub'; }
  if (v === 'lessons' && current) document.title = current.title + ' · Study Hub';
  window.scrollTo(0, 0);
}
document.querySelector('.view-link[data-view=lessons]').onclick = e => {
  e.preventDefault();
  const id = (current && current.id) || ls.get('sh-last', null) || (index[0] && index[0].id);
  if (id) location.hash = id;
};

// ---------- My progress ----------
const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : null;
function lessonStats(d) {
  const p = ls.get('sh-prog-' + d.id, {});
  const parts = [
    ['Flashcards', p.fcBest || 0, d.cards],
    ['Quiz', p.qzBest || 0, d.quiz],
    ['Apply it', p.apBest || 0, d.apply],
    ['Exam', p.examScore || 0, d.marks]
  ].filter(x => x[2]);
  const ps = parts.map(x => pct(x[1], x[2]));
  const overall = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : 0;
  const started = parts.some(x => x[1] > 0) || Object.keys(p.answers || {}).length > 0;
  return { parts, overall, started };
}
const level = n => n >= 80 ? 'good' : n >= 50 ? 'mid' : 'low';
function renderProgress() {
  const stats = index.map(d => ({ d, ...lessonStats(d) }));
  const started = stats.filter(x => x.started).length;
  const avg = stats.length ? Math.round(stats.reduce((a, x) => a + x.overall, 0) / stats.length) : 0;
  // Revise next: the weakest lesson you've started; if none started yet, the first lesson.
  const pool = stats.filter(x => x.started && x.overall < 100);
  const next = pool.length ? pool.reduce((a, b) => b.overall < a.overall ? b : a) : stats.find(x => !x.started) || null;
  const weakest = next && next.parts.length ? next.parts.reduce((a, b) => pct(b[1], b[2]) < pct(a[1], a[2]) ? b : a) : null;
  $('pv-next').innerHTML = `<div class="row"><div><div class="code">OVERALL</div><div class="big score">${avg}%</div><div class="muted">${started} of ${stats.length} lessons started</div></div><span class="spacer"></span>
    ${next ? `<div class="next-box"><div class="code">REVISE NEXT</div><strong>${esc(next.d.title)}</strong><div class="muted">${next.started ? `Weakest area: ${esc(weakest[0])} (${pct(weakest[1], weakest[2])}%)` : 'You haven\'t started this one yet.'}</div><a class="btn small" href="#${esc(next.d.id)}">Open lesson</a></div>` : '<div class="next-box"><strong>Everything is at 100%. Amazing work!</strong></div>'}</div>`;
  $('pv-list').innerHTML = stats.map(x => `
    <div class="card pv-card">
      <div class="row"><a class="pv-title" href="#${esc(x.d.id)}">${esc(x.d.title)}</a><span class="spacer"></span><span class="pill ${level(x.overall)}">${x.overall}%</span></div>
      <div class="pv-bars">${x.parts.map(([name, got, of]) => { const n = pct(got, of); return `
        <div class="pv-bar"><span>${name}</span><div class="progress"><div class="${level(n)}" style="width:${n}%"></div></div><span class="score">${got}/${of}</span></div>`; }).join('')}
      </div>
    </div>`).join('');
}
$('pv-reset').onclick = () => {
  const b = $('pv-reset');
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to delete all progress and answers'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Reset all progress'; }, 4000); return; }
  index.forEach(d => { try { localStorage.removeItem('sh-prog-' + d.id); } catch (e) {} });
  if (current) { progress = { answers: {} }; renderExam(); }
  b.dataset.sure = ''; b.textContent = 'Reset all progress'; renderProgress();
};

// ---------- Glossary ----------
let glossary = null;
async function renderGlossary() {
  if (!glossary) {
    $('gv-list').innerHTML = '<p class="muted">Loading…</p>';
    try { glossary = (await (await fetch('decks/glossary.json', { cache: 'no-cache' })).json()).terms || []; }
    catch (e) { $('gv-list').innerHTML = '<p class="muted">Couldn\'t load the glossary. Check your connection and try again.</p>'; return; }
  }
  const titles = Object.fromEntries(index.map(d => [d.id, d.title]));
  const q = $('gv-search').value.trim().toLowerCase();
  // Terms whose name matches come first, then terms that only mention it in the definition.
  const list = !q ? glossary : [...glossary.filter(g => g.term.toLowerCase().includes(q)), ...glossary.filter(g => !g.term.toLowerCase().includes(q) && g.def.toLowerCase().includes(q))];
  $('gv-count').textContent = q ? `${list.length} term${list.length === 1 ? '' : 's'} match "${$('gv-search').value.trim()}"` : `${glossary.length} key terms from ${index.length} lessons`;
  let letter = '';
  $('gv-list').innerHTML = list.length ? list.map(g => {
    const L = /[a-z]/i.test(g.term[0]) ? g.term[0].toUpperCase() : '#';
    const head = !q && L !== letter ? `<h2 class="gv-letter">${letter = L}</h2>` : '';
    return `${head}<div class="gv-item"><dt>${esc(g.term)}</dt><dd>${esc(g.def)} <a class="gv-from" href="#${esc(g.id)}">${esc(titles[g.id] || 'Open lesson')}</a></dd></div>`;
  }).join('') : '<p class="muted">No key terms match that. Try a shorter word, or ask the AI helper.</p>';
}
$('gv-search').oninput = () => renderGlossary();

// ---------- Install as an app ----------
let installEvent = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('install-btn').classList.remove('hidden'); });
if (!isStandalone() && /iphone|ipad|ipod/i.test(navigator.userAgent)) $('install-btn').classList.remove('hidden');
$('install-btn').onclick = async () => {
  if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; $('install-btn').classList.add('hidden'); }
  else $('install-tip').classList.toggle('hidden');
};
addEventListener('appinstalled', () => $('install-btn').classList.add('hidden'));
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------- Start ----------
function route() {
  const h = location.hash.slice(1);
  if (h === 'progress' || h === 'glossary') return showView(h);
  if (h && index.some(d => d.id === h)) { showView('lessons'); return openDeck(h); }
  showView('lessons');
}
window.addEventListener('hashchange', route);
(async function init() {
  try {
    const r = await fetch('decks/index.json', { cache: 'no-cache' });
    index = (await r.json()).decks || [];
  } catch (e) { $('d-title').textContent = 'Couldn\'t load the topic list. Check your connection and refresh to try again.'; return; }
  renderShelf();
  const h = location.hash.slice(1), last = ls.get('sh-last', null);
  const id = [h, last].find(x => x && index.some(d => d.id === x)) || (index[0] && index[0].id);
  if (id) openDeck(id); else $('d-title').textContent = 'No topics yet.';
  if (h === 'progress' || h === 'glossary') showView(h); else showView('lessons');
})();
