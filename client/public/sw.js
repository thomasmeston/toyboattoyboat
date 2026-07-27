/* Thin shell SW — caches HTML/JS/CSS/icons only; never precaches GLBs/audio. */
const CACHE = 'tbtb-shell-v1';

function shouldCache(request, response) {
  if (!response || !response.ok) return false;
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (/\.(glb|gltf|mp3|wav|ogg)$/i.test(path)) return false;
  if (/\/models\/backup-/i.test(path)) return false;
  if (/\/models\/refs\//i.test(path)) return false;
  const dest = request.destination;
  return (
    dest === 'document' ||
    dest === 'script' ||
    dest === 'style' ||
    dest === 'manifest' ||
    dest === 'image' ||
    path.endsWith('manifest.webmanifest') ||
    path.includes('/icons/') ||
    path.includes('/ui/previews/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (shouldCache(request, response)) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await cache.match('./') || await cache.match('./index.html');
          if (shell) return shell;
        }
        throw new Error('offline');
      }
    })(),
  );
});
