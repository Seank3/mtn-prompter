// ---------------------------------------------------------------------------
// sw.js — offline shell. Cache-first for the app's own files so the prompter
// works in a shop with no data. Never caches anything else.
// ---------------------------------------------------------------------------

const VERSION = 'mmt-prompter-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/util.js',
  './js/store.js',
  './js/config.js',
  './js/flows.js',
  './js/prompter.js',
  './js/ledger.js',
  './js/float.js',
  './js/report.js',
  './js/settings.js',
  './js/brands.js',
  // Brand artwork. Only the square marks are precached — they are the ones
  // used in lists, tabs and the prompter header. The lockups are larger and
  // only appear in a few places, so they are fetched normally.
  './assets/brands/airtel-mark.png',
  './assets/brands/mtn-mark.png',
  './assets/brands/visa-mark.png',
  './assets/brands/mastercard-mark.png',
  './assets/brands/airtel-lockup.png',
  './assets/brands/mtn-lockup.png',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // Individually so one 404 cannot abort the whole install.
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a deploy is picked up, cache as the fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Everything else: cache first.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit)),
  );
});
