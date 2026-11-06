// Study Hub offline support. Network first, so you always get the newest lessons when online;
// the saved copy is used only when there's no connection. The AI (/api/) always needs internet.
const CACHE = 'study-hub-v2';
const CORE = ['./', 'index.html', 'style.css?v=6', 'app.js?v=6', 'assistant.js?v=6', 'account.js?v=6', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'decks/index.json', 'decks/topics.json', 'decks/glossary.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // Save every lesson too, so all of them work offline.
    try {
      const list = await (await fetch('decks/index.json', { cache: 'no-cache' })).json();
      await cache.addAll((list.decks || []).map((d) => `decks/${d.id}.json`));
    } catch (e) { /* lessons are still saved as you open them */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const saved = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (saved) return saved;
      if (req.mode === 'navigate') return (await cache.match('./')) || (await cache.match('index.html'));
      throw e;
    }
  })());
});
