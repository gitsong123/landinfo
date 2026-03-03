const CACHE_NAME = 'landinfo-v3.0.4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json',
  './icon.png',
  './config.js'
];

// 설치 시 에셋 캐싱
self.addEventListener('install', (e) => {
  self.skipWaiting(); // 즉시 활성화
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 구버전 캐시 삭제
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 네트워크 우선 전략 (최신 데이터 확보 우선)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
