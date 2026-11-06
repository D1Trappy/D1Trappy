// Study Hub accounts: sign up / sign in / sign out, and syncing progress with /api/progress.
// Progress is still saved on the device first (so it works offline); when signed in, every
// change is also sent to the account, and signing in merges the device's and account's progress.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const PREFIX = 'sh-prog-';

  let me = null;           // signed-in username, or null
  let available = true;    // false on the GitHub Pages backup, or before the database is set up
  let offReason = 'no_accounts_here';
  let syncState = '';      // '', 'syncing', 'synced', 'offline', 'error'
  let lastSynced = 0;
  let mode = 'login';      // which form to show: login, signup, reset
  let notice = null;       // { kind, html } shown at the top of the account page
  let recovery = null;     // a recovery code to show once

  async function api(method, path, body) {
    try {
      const res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
      let data = {}; try { data = await res.json(); } catch (e) { data = { error: res.status === 404 ? 'no_accounts_here' : 'bad_reply' }; }
      return { ok: res.ok, status: res.status, data };
    } catch (e) { return { ok: false, status: 0, data: { error: 'offline' } }; }
  }

  // ---------- merging ----------
  const localIds = () => { const ids = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) ids.push(k.slice(PREFIX.length)); } } catch (e) {} return ids; };
  const hasContent = (e) => e && ((e.text && e.text.trim()) || (e.ticks && e.ticks.length) || e.ai);
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    const newer = (b._t || 0) > (a._t || 0) ? b : a, older = newer === a ? b : a;
    const out = { ...older, ...newer, answers: {} };
    for (const k of ['fcBest', 'qzBest', 'apBest']) out[k] = Math.max(a[k] || 0, b[k] || 0);
    const qids = new Set([...Object.keys(a.answers || {}), ...Object.keys(b.answers || {})]);
    for (const q of qids) {
      const n = (newer.answers || {})[q], o = (older.answers || {})[q];
      out.answers[q] = hasContent(n) ? n : (o || n);
    }
    out._t = Math.max(a._t || 0, b._t || 0);
    return out;
  }

  // ---------- pushing changes ----------
  const dirty = new Set(ls.get('sh-dirty', []));
  const keepDirty = () => ls.set('sh-dirty', [...dirty]);
  let pushTimer = null;
  function queue(id) { dirty.add(id); keepDirty(); clearTimeout(pushTimer); pushTimer = setTimeout(flush, 1500); }
  async function flush() {
    if (!me || !dirty.size) return true;
    setSync('syncing');
    for (const id of [...dirty]) {
      const data = ls.get(PREFIX + id, null) || { answers: {}, _t: Date.now() };
      const r = await api('POST', 'api/progress', { deckId: id, data });
      if (r.ok) { dirty.delete(id); keepDirty(); }
      else if (r.data.error === 'signed_out') { signedOut(); return false; }
      else { setSync(r.status === 0 ? 'offline' : 'error'); return false; }
    }
    lastSynced = Date.now(); setSync('synced'); return true;
  }
  window.onProgressSaved = (id) => { if (me) queue(id); };
  window.onProgressReset = (ids) => { if (me) ids.forEach(queue); };
  addEventListener('online', () => { if (me) flush(); });

  async function fullSync() {
    setSync('syncing');
    const r = await api('GET', 'api/progress');
    if (!r.ok) { if (r.data.error === 'signed_out') signedOut(); else setSync(r.status === 0 ? 'offline' : 'error'); return; }
    const server = r.data.decks || {};
    const ids = new Set([...localIds(), ...Object.keys(server)]);
    for (const id of ids) {
      const local = ls.get(PREFIX + id, null), remote = server[id] ? server[id].data : null;
      const merged = merge(local, remote);
      if (!merged) continue;
      ls.set(PREFIX + id, merged);
      if (JSON.stringify(merged) !== JSON.stringify(remote)) dirty.add(id);
    }
    keepDirty();
    if (window.studyHub) window.studyHub.reloadProgress();
    await flush();
  }

  function clearDevice() {
    localIds().forEach((id) => ls.del(PREFIX + id));
    dirty.clear(); keepDirty();
    if (window.studyHub) window.studyHub.reloadProgress();
  }

  // ---------- state ----------
  function setSync(s) { syncState = s; renderLink(); if (isOpen()) render(); }
  function signedIn(username) { me = username; ls.set('sh-user', username); renderLink(); }
  function signedOut() { me = null; ls.del('sh-user'); syncState = ''; renderLink(); if (isOpen()) render(); }
  const isOpen = () => !$('accountview').classList.contains('hidden');

  function renderLink() {
    const a = $('account-link');
    if (!a) return;
    const icon = syncState === 'syncing' ? '⟳' : syncState === 'offline' || syncState === 'error' ? '⚠' : '✓';
    a.textContent = me ? `👤 ${me} ${icon}` : 'Sign in';
    a.title = me ? syncLabel() : 'Sign in to sync your progress between devices';
  }
  function syncLabel() {
    if (syncState === 'syncing') return 'Syncing…';
    if (syncState === 'offline') return 'Offline. Your changes are saved on this device and will sync when you\'re back online.';
    if (syncState === 'error') return 'Couldn\'t sync just now. Your changes are saved on this device and will sync later.';
    return lastSynced ? `Synced at ${new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Synced';
  }

  // ---------- page ----------
  const errorText = {
    bad_username: 'Usernames are 3 to 20 characters: letters, numbers and _ only.',
    bad_password: 'Passwords need at least 8 characters.',
    taken: 'That username is taken. Try another.',
    wrong_login: 'That username and password don\'t match.',
    wrong_code: 'That username and recovery code don\'t match.',
    locked: 'Too many wrong tries. Wait 15 minutes, then try again.',
    rate_limited: 'Too many attempts. Wait a few minutes, then try again.',
    accounts_off: 'Accounts aren\'t switched on yet.',
    no_accounts_here: 'Accounts only work on the main site: nbastudyhub.pages.dev',
    offline: 'You\'re offline. Connect to the internet and try again.'
  };
  const say = (kind, text) => { notice = { kind, html: esc(text) }; };
  const privacy = `<p class="muted small-note">Your account stores only your username, a scrambled (hashed) password and your study progress. No email or real name needed, so please don't use your full name as your username.</p>`;

  function render() {
    const body = $('ac-body');
    let html = notice ? `<div class="ac-notice ${notice.kind}">${notice.html}</div>` : '';
    if (recovery) {
      html += `<div class="card ac-code"><h3>Your recovery code</h3>
        <p>If you ever forget your password, this code is the <strong>only</strong> way back into your account. Write it down or save it somewhere safe. It won't be shown again.</p>
        <p class="code-big" id="ac-code">${esc(recovery)}</p>
        <div class="row"><button class="btn ghost small" id="ac-copy" type="button">Copy code</button><span class="spacer"></span><button class="btn" id="ac-saved" type="button">I've saved it</button></div></div>`;
    } else if (!available) {
      html += `<div class="card"><p>${esc(errorText[offReason])}</p></div>`;
    } else if (me) {
      html += `<div class="card stack">
          <div><div class="code">SIGNED IN AS</div><h2 style="margin:0">👤 ${esc(me)}</h2><p class="muted" id="ac-sync">${esc(syncLabel())}</p></div>
          <p>Your flashcards, quiz and exam scores, written answers and AI marks are saved to your account, so they appear on any device you sign in on.</p>
          <div class="row"><button class="btn" id="ac-syncnow" type="button">Sync now</button><button class="btn ghost" id="ac-logout" type="button">Sign out</button></div>
          <p class="muted small-note">Signing out removes your progress from this device (it stays safe in your account). Good for shared computers.</p>
        </div>
        <details class="card"><summary><strong>Delete my account</strong></summary>
          <form class="stack" id="ac-del-form" style="margin-top:10px">
            <p>This permanently deletes your account and all its saved progress. Type your password to confirm.</p>
            <input class="ac-input" type="password" id="ac-del-pw" autocomplete="current-password" aria-label="Your password" placeholder="Your password">
            <div class="row"><button class="btn danger" type="submit">Delete my account</button></div>
          </form>
        </details>${privacy}`;
    } else {
      const tabs = `<div class="views ac-tabs">
        <button type="button" class="view-link" data-mode="login" aria-current="${mode === 'login' ? 'page' : 'false'}">Sign in</button>
        <button type="button" class="view-link" data-mode="signup" aria-current="${mode === 'signup' ? 'page' : 'false'}">Create account</button>
        <button type="button" class="view-link" data-mode="reset" aria-current="${mode === 'reset' ? 'page' : 'false'}">Forgot password</button></div>`;
      const intro = {
        login: 'Sign in to sync your progress between your phone and computer.',
        signup: 'Pick a username and password. Any progress already on this device will be added to your new account.',
        reset: 'Use the recovery code you saved when you created your account to set a new password.'
      }[mode];
      html += `<div class="card stack">${tabs}<p>${intro}</p>
        <form class="stack" id="ac-form">
          <label class="ac-label" for="ac-user">Username</label>
          <input class="ac-input" id="ac-user" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required>
          ${mode === 'reset' ? `<label class="ac-label" for="ac-rec">Recovery code</label>
          <input class="ac-input" id="ac-rec" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX" required>` : ''}
          <label class="ac-label" for="ac-pw">${mode === 'reset' ? 'New password' : 'Password'}</label>
          <input class="ac-input" id="ac-pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="${mode === 'login' ? 1 : 8}" maxlength="128" required>
          ${mode === 'login' ? '' : '<p class="muted small-note">Username: 3 to 20 letters, numbers or _. Password: at least 8 characters.</p>'}
          <div class="row"><button class="btn" type="submit" id="ac-submit">${{ login: 'Sign in', signup: 'Create account', reset: 'Set new password' }[mode]}</button></div>
        </form></div>${privacy}`;
    }
    body.innerHTML = html;
    wire();
  }

  function wire() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    document.querySelectorAll('.ac-tabs [data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; notice = null; render(); });
    on('ac-copy', async () => { try { await navigator.clipboard.writeText(recovery); $('ac-copy').textContent = 'Copied ✓'; } catch (e) { $('ac-copy').textContent = 'Select and copy it yourself'; } });
    on('ac-saved', () => { recovery = null; render(); });
    on('ac-syncnow', () => fullSync());
    on('ac-logout', logout);
    const form = $('ac-form');
    if (form) form.onsubmit = (e) => { e.preventDefault(); submit(); };
    const del = $('ac-del-form');
    if (del) del.onsubmit = async (e) => {
      e.preventDefault();
      const r = await api('POST', 'api/account/delete', { password: $('ac-del-pw').value });
      if (r.ok) { clearDevice(); signedOut(); say('ok', 'Your account and its saved progress have been deleted.'); render(); }
      else { say('bad', errorText[r.data.error] || 'Couldn\'t delete your account. Try again.'); render(); }
    };
  }

  async function submit() {
    const btn = $('ac-submit'); btn.disabled = true;
    const username = $('ac-user').value.trim().toLowerCase(), password = $('ac-pw').value;
    const r = mode === 'reset'
      ? await api('POST', 'api/account/reset', { username, recoveryCode: $('ac-rec').value, newPassword: password })
      : await api('POST', 'api/account/' + mode, { username, password });
    if (!r.ok) {
      if (r.data.error === 'no_accounts_here' || r.data.error === 'accounts_off') { available = false; offReason = r.data.error; notice = null; render(); return; }
      say('bad', errorText[r.data.error] || 'Something went wrong. Please try again.');
      render(); return;
    }
    signedIn(r.data.username);
    if (r.data.recoveryCode) recovery = r.data.recoveryCode;
    say('ok', mode === 'signup' ? `Welcome, ${r.data.username}! Your account is ready.` : mode === 'reset' ? 'Your password has been changed, and you\'ve been signed out on other devices. Here is your NEW recovery code.' : `Signed in as ${r.data.username}.`);
    render();
    await fullSync();
  }

  async function logout() {
    const btn = $('ac-logout');
    const synced = await flush();
    if (!synced && btn.dataset.sure !== '1') {
      btn.dataset.sure = '1'; btn.textContent = 'Some changes haven\'t synced. Tap again to sign out anyway';
      return;
    }
    await api('POST', 'api/account/logout');
    clearDevice(); signedOut();
    say('ok', 'You\'ve signed out, and your progress has been removed from this device.');
    render();
  }

  window.addEventListener('studyhub:view', (e) => { if (e.detail.view === 'account') { if (!me) notice = notice && notice.kind === 'ok' ? notice : null; render(); } });

  // ---------- start ----------
  (async function init() {
    const remembered = ls.get('sh-user', null);
    if (remembered) { me = remembered; renderLink(); } // show straight away; checked below
    const r = await api('GET', 'api/account/me');
    if (r.ok) { signedIn(r.data.username); fullSync(); }
    else if (r.status === 401) signedOut(); // sign-in expired: keep this device's progress; it merges back when you sign in
    else if (r.data.error === 'no_accounts_here' || r.data.error === 'accounts_off') { available = false; offReason = r.data.error; if (me) signedOut(); }
    else if (me) setSync('offline'); // offline: keep working on this device, sync later
    if (isOpen()) render();
  })();
})();
