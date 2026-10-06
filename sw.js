/*
 * Офлайн-режим. При установке все файлы сайта сохраняются в кэш.
 * Запросы: сначала сеть (чтобы сразу видеть обновления), но если сеть молчит дольше
 * NET_TIMEOUT или её нет — ответ из кэша. Так сайт открывается и в метро, и в самолёте.
 * Данные колод хранятся в localStorage и от кэша не зависят.
 *
 * При изменении списка файлов или их содержимого увеличьте номер версии в CACHE.
 */
var CACHE = 'flash-cards-v2';
var NET_TIMEOUT = 3500;
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/sm2.js',
  './js/parse.js',
  './js/data.js',
  './js/importer.js',
  './js/quiz.js',
  './js/stats.js',
  './js/samples.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('flash-cards-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('./index.html');
    return undefined;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  var network = fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  });

  e.respondWith(new Promise(function (resolve, reject) {
    var done = false;
    function finish(res) {
      if (done || !res) return false;
      done = true;
      resolve(res);
      return true;
    }
    // Медленная сеть: через NET_TIMEOUT отдаём кэш, если он есть
    var timer = setTimeout(function () { fromCache(req).then(finish); }, NET_TIMEOUT);
    network.then(function (res) {
      clearTimeout(timer);
      finish(res);
    }).catch(function () {
      clearTimeout(timer);
      fromCache(req).then(function (hit) {
        if (!finish(hit) && !done) reject(new Error('offline'));
      });
    });
  }));
});
