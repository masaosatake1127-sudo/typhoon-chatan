/* 奥やんばるの里プラン Service Worker
   キャッシュ名にバージョンを付け、activate時に古いものを必ず削除する。
   更新時は CACHE の日付部分を上げるだけでよい。 */
const PREFIX = 'yanbaru-';
const CACHE  = PREFIX + 'v3-2026-08-09b';

/* スコープ配下の相対パスで登録する（サブフォルダ配信に対応） */
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })   // 新SWを即座に待機解除
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          /* ⚠ 同一オリジン(github.io)には他アプリのキャッシュも同居する。
             必ず自分の接頭辞のものだけを消すこと。全消しすると
             同じリポジトリで公開している別アプリのオフライン機能を壊す。 */
          return k.indexOf(PREFIX) === 0 && k !== CACHE;
        }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })   // 既存タブもすぐ新SW配下へ
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  /* HTMLはネット優先（更新を取り逃さない）→ 失敗したらキャッシュ（オフライン） */
  var isHTML = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isHTML) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }

  /* それ以外（アイコン等）はキャッシュ優先で高速に */
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});

/* ページから {type:'SKIP_WAITING'} を送れば即更新できる */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
