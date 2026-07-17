/**
 * PressPass service worker.
 *
 * Strategy:
 *  - App shell (login/card pages, manifest, icons) is pre-cached on install.
 *  - Every successful GET response (same-origin pages/assets and the API
 *    `GET /card` call) is cached at runtime; when the network is unavailable
 *    the last cached response is served, so the most recently loaded card
 *    keeps working offline (SRS §11).
 *  - Non-GET requests are never intercepted.
 *  - The admin panel (/admin) is NEVER part of the installable PWA: it is a
 *    desktop-only, separate-domain app, so those requests bypass the worker
 *    and are never cached.
 */
const CACHE_NAME = 'presspass-v4';
const APP_SHELL = [
  '/',
  '/login',
  '/card',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  // Розширення браузера (chrome-extension:// тощо) кешувати не можна —
  // Cache.put кидає TypeError і ламає обробник.
  if (!request.url.startsWith('http')) {
    return;
  }
  // Адмінка не входить до PWA — не перехоплюємо й не кешуємо її сторінки
  // (вона живе на окремому домені для ПК).
  if (new URL(request.url).pathname.startsWith('/admin')) {
    return;
  }
  // Токенізовані QR-відповіді короткоживучі — кешувати їх немає сенсу.
  const isDynamicQr = request.url.includes('/card/qr');

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !isDynamicQr) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        // Navigation fallback: show the card screen shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/card');
          if (shell) {
            return shell;
          }
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
  );
});
