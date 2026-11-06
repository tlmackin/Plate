/* Plate service worker: app files work offline; always fetches fresh files when online. */
const CACHE = 'plate-v1.7.0';
const NETWORK_WAIT_MS = 3000;
const SHELL = ['./', 'index.html', 'styles.css', 'core.js', 'app.js', 'lift-core.js', 'exercises.js', 'wods.js', 'lift.js', 'manifest.webmanifest', 'config.js', 'lib/supabase.js',
  'lib/html5-qrcode.min.js', 'lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'fonts/plus-jakarta-sans-latin-wght-normal.woff2'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // food APIs go straight to the network
  const net = fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  });
  e.waitUntil(net.catch(() => {})); // on a slow connection, let this finish so the next open is up to date
  e.respondWith((async () => {
    // Prefer fresh files, but on a weak signal (a gym basement) fall back to the saved copy rather than wait.
    const first = await Promise.race([net.catch(() => null), new Promise((res) => setTimeout(res, NETWORK_WAIT_MS))]);
    if (first) return first;
    const saved = await caches.match(e.request, { ignoreSearch: true });
    if (saved) return saved;
    try { return await net; } catch (err) { return caches.match('index.html'); }
  })());
});
