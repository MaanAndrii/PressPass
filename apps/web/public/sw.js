/**
 * PressPass service worker.
 *
 * Strategy:
 *  - App shell (login/card pages, manifest, icons) is pre-cached on install.
 *  - Public same-origin pages/assets may be cached at runtime. Authorized,
 *    encrypted-media, unlock and private/no-store responses are never cached.
 *  - Non-GET requests are never intercepted.
 *  - The admin panel (/admin) is NEVER part of the installable PWA: it is a
 *    desktop-only, separate-domain app, so those requests bypass the worker
 *    and are never cached.
 */
const CACHE_NAME = 'presspass-v5';
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
  const path = new URL(request.url).pathname;
  const isDynamicQr = path.includes('/card/qr');
  const isPrivate =
    request.headers.has('Authorization') ||
    path.includes('/media/') ||
    path.includes('/encryption/');

  event.respondWith(
    fetch(request)
      .then((response) => {
        const noStore = /(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(
          response.headers.get('Cache-Control') || '',
        );
        if (response.ok && !isDynamicQr && !isPrivate && !noStore) {
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
