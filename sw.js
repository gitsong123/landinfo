const CACHE_NAME = 'landinfo-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/icon.png',
  '/manifest.json'
];

// 서비스 워커 설치 시 에셋 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all: app shell and content');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 기존 캐시 삭제 및 활성화
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 네트워크 요청 인터셉트 및 캐시 서빙
self.addEventListener('fetch', (event) => {
  // 데이터 API 요청 등은 캐시하지 않음 (VWorld WFS 등)
  if (event.request.url.includes('api.vworld.kr') || event.request.url.includes('ecvam.neins.go.kr')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // 캐시에 있으면 반환, 없으면 네트워크 요청
      return response || fetch(event.request).then((fetchResponse) => {
        // 네트워크 요청 성공 시 캐시에 추가 (동적으로 캐시 확장)
        return caches.open(CACHE_NAME).then((cache) => {
          // 일부 리소스만 동적 캐싱 (예: 같은 도메인의 정적 파일)
          if (event.request.url.startsWith(self.location.origin)) {
            cache.put(event.request, fetchResponse.clone());
          }
          return fetchResponse;
        });
      });
    }).catch(() => {
      // 오프라인 상태에서 요청 실패 시 기본 페이지 반환
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
