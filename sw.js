// Сервис-воркер: приложение работает без интернета.
// При изменении файлов увеличьте номер версии — телефон скачает обновление.
const VERSION = 'v2.5.0';
const CACHE = 'tancy-' + VERSION;
const FONTS = 'tancy-fonts';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/logic.js',
  'js/ui.js',
  'js/util.js',
  'js/uistate.js',
  'js/components.js',
  'js/views/home.js',
  'js/views/students.js',
  'js/views/calendar.js',
  'js/views/payments.js',
  'js/views/payment.js',
  'js/views/settings.js',
  'js/views/notifications.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tancy-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Шрифт с Google Fonts: один раз скачали — дальше всегда из памяти
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }).catch(() => new Response('', { status: 504 })));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Свои файлы: сразу из кэша (быстро и офлайн), в фоне обновляем кэш из сети
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => cached || (req.mode === 'navigate' ? cache.match('./') : undefined));
    if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
    return network;
  })());
});
