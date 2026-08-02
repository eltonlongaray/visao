// ═══════════════════════════════════════════════════════════════
// VISÃO · Service Worker — cache híbrido
// Estratégia:
//   - HTML + JS  → network-first (sempre pega versão fresca, fallback cache offline)
//   - CSS/imgs/manifest → cache-first (rápido, raramente muda)
//   - Firebase/CDN → sempre rede (não cacheia)
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'visao-v513';

// Estado de mute — atualizado via postMessage do app principal
let _muted = false;
const CORE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  './icons/icon-192.png?v=95',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/falcon-badge.png?v=175',
  './sounds/falcon-cry.wav',
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
// BLOCO 3: FETCH — network-first pra HTML/JS, cache-first pro resto
// ═══════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não interceptar: Firebase, gstatic CDN, qualquer cross-origin
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  const path = url.pathname;
  const isHtml = path.endsWith('/') || path.endsWith('.html');
  const isJs = path.endsWith('.js');
  const isNavigate = event.request.mode === 'navigate';

  // ── Network-first pra HTML/JS (código que muda a cada deploy) ──
  if (isHtml || isJs || isNavigate) {
    event.respondWith(
      fetch(isJs ? new Request(event.request, { cache: 'no-store' }) : event.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  // ── Cache-first pra CSS/imgs/manifest (raramente mudam) ──
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      }).catch(() =>
        // NÃO cair pro index.html aqui: devolver HTML no lugar de uma imagem
        // faz o navegador tratá-la como quebrada, e o fundo da conversa
        // simplesmente sumia. Sem rede e sem cache, melhor falhar limpo.
        caches.match(event.request).then((c) => c || Response.error())
      );
    })
  );
});


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: AGENDAR via SW setTimeout (fallback quando TimestampTrigger indisponível)
// O main thread manda { type:'SCHEDULE_NOTIF', title, body, tag, icon, badge, delayMs }
// ═══════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_MUTED') {
    _muted = !!event.data.muted;
    return;
  }
  if (event.data?.type !== 'SCHEDULE_NOTIF') return;
  const { title, body, tag, icon, badge, delayMs } = event.data;
  // Mantém o SW vivo durante o delay (até 5 min; além disso o SO pode matar o SW)
  event.waitUntil(
    new Promise(resolve => {
      setTimeout(async () => {
        await self.registration.showNotification(title, {
          body, icon, badge, tag,
          vibrate:            _muted ? [] : [500, 100, 500, 100, 500, 100, 500, 100, 1000],
          requireInteraction: true,
          renotify:           true,
          silent:             _muted,
          // o dia vai junto pra que o clique saiba pra onde levar mesmo se a
          // tag mudar de formato um dia
          data:               { day: _dayFromTag(tag) },
        });
        resolve();
      }, delayMs);
    })
  );
});


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: PUSH — recebe notificação do Worker e exibe
// ═══════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = data.title || 'Falcon';
  const body  = data.body  || 'You have a reminder';
  const tag   = data.tag   || 'visao-notif';
  // day explícito no payload: não depende do formato da tag
  const day   = data.day   || _dayFromTag(tag);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon:               './icons/icon-192.png',
        badge:              './icons/falcon-badge.png?v=175',
        tag,
        vibrate:            _muted ? [] : [300, 150, 300, 150, 300],
        requireInteraction: true,
        renotify:           true,
        silent:             _muted,
        data:               { day },
      }),
      // Notifica o app aberto (foreground) para mostrar banner + som internamente
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'PUSH_FOREGROUND', title, body, tag }));
      }),
    ])
  );
});


// ═══════════════════════════════════════════════════════════════
// BLOCO 6: NOTIFICATIONCLICK — abre o app ao tocar na notificação
// ═══════════════════════════════════════════════════════════════
// Deriva o dayId (YYYY-MM-DD) da tag: visao-<dayId>-<slug>
function _dayFromTag(tag) {
  const m = /^visao-(\d{4}-\d{2}-\d{2})-/.exec(tag || '');
  return m ? m[1] : null;
}

// Grava o alvo do clique num IndexedDB. É a rede de segurança: no cold-start
// alguns Android IGNORAM a URL do openWindow e abrem no start_url, perdendo o
// hash — aí o app lê este alvo ao abrir e navega mesmo assim.
function _saveClickTarget(day, tag) {
  return new Promise((resolve) => {
    let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
    try {
      const req = indexedDB.open('falcon-notif', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('kv'); } catch {} };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ day, tag, ts: Date.now() }, 'clickTarget');
          tx.oncomplete = () => { db.close(); fin(); };
          tx.onerror = () => { try { db.close(); } catch {} fin(); };
        } catch { fin(); }
      };
      req.onerror = () => fin();
      setTimeout(fin, 500);
    } catch { fin(); }
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tag  = event.notification.tag || '';
  // O dia vem primeiro do PAYLOAD e só depois da tag. Push do Worker sem
  // tag no formato esperado caía em 'visao-notif', o dia saía nulo e a
  // notificação abria o Ritual sem levar a lugar nenhum dentro dele.
  const day  = event.notification.data?.day || _dayFromTag(tag);
  const qs   = day ? `?day=${day}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}` : '';
  const hash = `#/ritual${qs}`;
  const alvo = new URL('./' + hash, self.location.href).href;

  event.waitUntil((async () => {
    await _saveClickTarget(day, tag);   // rede de segurança contra hash perdido
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (!client.url.includes(self.location.origin)) continue;

      // NAVEGAR é o caminho principal, não avisar por mensagem. Antes isto
      // dependia de o app receber um postMessage; quando ele não chegava — e
      // não chega logo depois de o service worker ser trocado, o que ocorre a
      // cada atualização — o focus() só trazia a janela de volta na tela em
      // que ela estava, que costuma ser a Home. Ninguém navegava e parecia
      // que a notificação levava pro lugar errado.
      try {
        if ('navigate' in client) await client.navigate(alvo);
      } catch { /* navigate falha se o cliente não for controlado por nós */ }

      // A mensagem continua, agora como reforço: se o app já estiver na rota
      // certa, ela força o redesenho no dia/tarefa do compromisso.
      try { client.postMessage({ type: 'OPEN_RITUAL_DAY', day, tag }); } catch {}
      if ('focus' in client) return client.focus();
      return;
    }
    // App fechado: abre direto no Ritual naquele dia
    return clients.openWindow(alvo);
  })());
});
