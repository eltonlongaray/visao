// ═══════════════════════════════════════════════════════════════
// VISÃO · Service Worker — cache offline básico
// Estratégia:
//   - assets locais (HTML/CSS/JS/imagens) → cache-first
//   - Firebase/Firestore/CDN → sempre rede (não cacheia)
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'visao-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: INSTALL — pré-cache dos assets essenciais
// ═══════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_ASSETS).catch((err) => console.warn('[SW] install partial:', err))
    )
  );
  self.skipWaiting();
});


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ACTIVATE — limpa caches antigos
// ═══════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: FETCH — cache-first pra mesmo origin, network pra externo
// ═══════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não interceptar: Firebase, gstatic CDN, qualquer cross-origin
  if (url.origin !== self.location.origin) return;

  // Apenas GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        // Salva no cache pra próxima
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html')); // fallback offline
    })
  );
});
