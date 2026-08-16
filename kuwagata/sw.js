/* =====================================================================
   やんばる クワガタ＆さかな ずかん  —  Service Worker
   ---------------------------------------------------------------------
   ⚠️ 重要 / IMPORTANT
   このリポジトリ（private-apps）には他のアプリも同居しています。
   このSWは「kuwagata-」で始まるキャッシュ以外には絶対に触れません。
   他アプリ（献立・台風ウォッチ 等）のキャッシュを削除しないこと。
   ===================================================================== */

const CACHE_PREFIX  = 'kuwagata-';
const CACHE_VERSION = 'v2';
const CACHE_NAME    = CACHE_PREFIX + CACHE_VERSION;

/* このSWが置かれたディレクトリ配下だけを対象にする（相対パス） */
const SCOPE_PATH = new URL('./', self.location).pathname;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

/* ---------- install : 全アセットを先読みキャッシュ ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 1つ失敗しても install 全体を落とさない
    await Promise.all(ASSETS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[kuwagata sw] precache skipped:', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- activate : 自分の古い世代だけを掃除 ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      // ★ 他アプリのキャッシュは絶対に消さない
      if (!key.startsWith(CACHE_PREFIX)) return Promise.resolve();
      if (key === CACHE_NAME) return Promise.resolve();
      console.log('[kuwagata sw] deleting own old cache:', key);
      return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

/* ---------- fetch : cache-first（オフライン最優先） ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 別オリジンには一切関与しない
  if (url.origin !== self.location.origin) return;

  // ★ 自分のフォルダ配下以外（＝他アプリ）には一切関与しない
  if (!url.pathname.startsWith(SCOPE_PATH)) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // 裏でこっそり更新（次回起動時に最新になる）
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, fresh.clone());
          }
        } catch (_) { /* オフライン: 何もしない */ }
      })());
      return cached;
    }

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // オフラインで未キャッシュ → ページ要求なら index.html を返す
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});

/* ---------- 手動更新用 ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
