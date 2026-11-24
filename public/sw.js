const CACHE = 'titan-academy-v6-stabilized-20261124';
const ROOT = new URL('./', self.location.href).pathname;
const core = [
  '', 'index.html', 'tokens.css', 'theme.js', 'academy.js', 'academy.css', 'client.js', 'ui.js',
  'editor.html', 'app.js', 'styles.css', 'project-archive.js', 'icon.svg', 'titan-emblem.webp', 'manifest.webmanifest'
].map(path => ROOT + path);
const optional = ['extensions.js','study-tools.js','learning-ui.js','pet-art.js','pet-ui.js','projects-ui.js','memory-ui.js','settings-ui.js','chat-ui.js','chat-stream.js','titan-hero.webp','teachers-ui.js','characters/nara.svg','characters/byte.svg','characters/lumi.svg','characters/koda.svg','characters/zuri.svg']
  .map(path => ROOT + path);
const publicAssets = new Set([...core, ...optional]);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(core)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key !== CACHE && (key.startsWith('titan-academy-') || key.startsWith('titan-ultimate-'))
  ).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !publicAssets.has(url.pathname)) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic' && !/\b(?:private|no-store)\b/i.test(response.headers.get('Cache-Control') || '')) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.pathname, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(url.pathname)) || new Response('Indisponível offline', { status: 503 })));
});
