// ═══════════════════════════════════════════════════════════════
// VISÃO · Notifications
// Entrega notificações via Cloudflare Worker (Web Push + VAPID).
// Fallback: localStorage + dynamic setTimeout quando app está aberto.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — SUPORTE
// BLOCO 2 — PERMISSÃO + ASSINATURA WEB PUSH
// BLOCO 3 — AGENDAR VIA WORKER
// BLOCO 3.5 — FALCON CRY — som sintetizado via Web Audio API
// BLOCO 4 — FALLBACK LOCAL (app aberto)
// BLOCO 6.5 — MUTE GLOBAL
// BLOCO 5 — FOREGROUND PUSH LISTENER
// BLOCO 7 — TAG ÚNICA
// ─────────────────────────────────────────────────────────────

import { auth } from './autenticacao.js';

// ── Config ───────────────────────────────────────────────────
const WORKER_URL    = 'https://visao-push-worker.eltonvisao.workers.dev';
const WORKER_API_KEY = 'yL1qvOpajATNWrhB2l8ZutoRPU6MJ4QmCeIFY9n0';
const VAPID_PUBLIC_KEY = 'BHpOJJHb1-0cA7RuvguRjD9a5xNNIO1nivGUwmeiWdgwdU7LqCqxs4mLkamFLTSjCnBON2Asj9eM98FU8v1iwnQ';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: SUPORTE
// ═══════════════════════════════════════════════════════════════
export function notifSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function permissionStatus() {
  if (!notifSupported()) return 'unsupported';
  return Notification.permission;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PERMISSÃO + ASSINATURA WEB PUSH
// ═══════════════════════════════════════════════════════════════
export async function requestPermission() {
  if (!notifSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  const result = await Notification.requestPermission();
  if (result === 'granted') startNotifChecker(); // inicia checker se ainda não estava rodando
  return result;
}

// Converte VAPID public key de base64url para Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Retorna o userId atual — usa auth importado diretamente, sem depender de globalThis
function getUserId() {
  return auth?.currentUser?.uid || null;
}

const VAPID_KEY_STORE = 'visao_vapid_key';

// Assina no PushManager e registra o subscription no Worker.
// Re-inscreve automaticamente se a VAPID key mudou (ex: após rotação de chaves).
export async function subscribeToPush() {
  if (!notifSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (WORKER_URL.includes('REPLACE')) return;

  const userId = getUserId();
  if (!userId) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    // Se a chave VAPID mudou, força nova subscription
    if (sub && localStorage.getItem(VAPID_KEY_STORE) !== VAPID_PUBLIC_KEY) {
      await sub.unsubscribe();
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      localStorage.setItem(VAPID_KEY_STORE, VAPID_PUBLIC_KEY);
    }

    // Envia assinatura ao Worker
    await fetch(`${WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    });
  } catch (err) {
    console.warn('[notif] subscribeToPush:', err.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: AGENDAR VIA WORKER
// ═══════════════════════════════════════════════════════════════
export async function scheduleNotif({ title, body, tag, timestamp }) {
  if (!notifSupported())       return 'unsupported';
  if (timestamp <= Date.now()) return 'past';

  const perm = await requestPermission();
  if (perm !== 'granted')      return 'denied';

  const userId = getUserId();

  // ── Via Worker (notificação mesmo com app fechado) ───────────
  if (userId && !WORKER_URL.includes('REPLACE')) {
    try {
      await subscribeToPush(); // garante que a subscription existe
      await fetch(`${WORKER_URL}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
        body: JSON.stringify({ userId, title, body, tag, timestamp }),
      });
    } catch (err) {
      console.warn('[notif] worker schedule falhou:', err.message);
    }
  }

  // ── SW setTimeout — disparo exato em até 60 min (funciona com app em background/fechado parcial) ──
  const delayMs = timestamp - Date.now();
  if (delayMs > 0 && delayMs < 60 * 60_000) {
    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({
        type: 'SCHEDULE_NOTIF', title, body, tag, delayMs,
        icon: '/icons/icon-192.png', badge: '/icons/falcon-badge.png',
      });
    }).catch(() => {});
  }

  // ── Fallback: dynamic timer, funciona enquanto app aberto ──
  _saveLocal({ title, body, tag, timestamp });
  return 'scheduled';
}

// ─── Cancelar ─────────────────────────────────────────────────
export async function cancelNotif(tag) {
  _removeLocal(tag);
  const userId = getUserId();
  if (userId && !WORKER_URL.includes('REPLACE')) {
    fetch(`${WORKER_URL}/schedule`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
      body: JSON.stringify({ tag }),
    }).catch(() => {});
  }
  // Cancela do SW (se TimestampTrigger ou pushManager)
  try {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({ tag, includeTriggered: true });
    list.forEach(n => n.close());
  } catch {}
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3.5: FALCON CRY — som sintetizado via Web Audio API
// Toca quando a notificação dispara com o app aberto (foreground).
// Background/fechado usa som padrão do sistema (limitação da plataforma).
// ═══════════════════════════════════════════════════════════════
export function playFalconCry() {
  if (getNotifMuted()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Falcão peregrino: 3 gritos rápidos "kree-kree-kree"
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.19;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      const flt  = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1500, t);
      osc.frequency.exponentialRampToValueAtTime(2700, t + 0.045);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.13);

      flt.type = 'bandpass';
      flt.frequency.value = 2100;
      flt.Q.value = 1.8;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.012);
      gain.gain.setValueAtTime(0.28, t + 0.085);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      osc.connect(flt);
      flt.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    }

    setTimeout(() => ctx.close(), 1500);
  } catch (_) {}
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: FALLBACK LOCAL (app aberto)
// ═══════════════════════════════════════════════════════════════
const SCHED_KEY = 'visao_notif_schedule';

function _saveLocal(entry) {
  const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
  const filtered = list.filter(n => n.tag !== entry.tag);
  filtered.push(entry);
  localStorage.setItem(SCHED_KEY, JSON.stringify(filtered));
}

function _removeLocal(tag) {
  const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
  localStorage.setItem(SCHED_KEY, JSON.stringify(list.filter(n => n.tag !== tag)));
}

let _checkerStarted = false;

export async function startNotifChecker() {
  if (_checkerStarted) return;
  if (!notifSupported() || Notification.permission !== 'granted') return;
  _checkerStarted = true;

  const check = async () => {
    const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
    if (!list.length) return;
    const now = Date.now();
    const due = list.filter(n => n.timestamp <= now);
    if (!due.length) return;
    localStorage.setItem(SCHED_KEY, JSON.stringify(list.filter(n => n.timestamp > now)));
    playFalconCry();
    try {
      const reg = await navigator.serviceWorker.ready;
      for (const n of due) {
        const muted = getNotifMuted();
        await reg.showNotification(n.title, {
          body:               n.body,
          icon:               '/icons/icon-192.png',
          badge:              '/icons/favicon-32.png',
          tag:                n.tag,
          vibrate:            muted ? [] : [300, 150, 300, 150, 300],
          requireInteraction: true,
          renotify:           true,
          silent:             muted,
          data:               { url: '/' },
        });
      }
    } catch (err) { console.warn('[notif-checker]', err); }
  };

  await check();

  // Timer dinâmico: acorda exatamente no horário do próximo evento
  let _nextTimer = null;
  function _scheduleNext() {
    clearTimeout(_nextTimer);
    const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
    if (!list.length) { _nextTimer = setTimeout(_scheduleNext, 60_000); return; }
    const nextTs = Math.min(...list.map(n => n.timestamp));
    const delay  = Math.max(300, nextTs - Date.now() + 100);
    _nextTimer = setTimeout(async () => { await check(); _scheduleNext(); }, delay);
  }
  _scheduleNext();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { check(); _scheduleNext(); }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6.5: MUTE GLOBAL
// ═══════════════════════════════════════════════════════════════
const MUTE_KEY = 'visao_notif_muted';

export function getNotifMuted() {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setNotifMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  navigator.serviceWorker?.ready.then(reg => {
    reg.active?.postMessage({ type: 'SET_MUTED', muted: !!muted });
  }).catch(() => {});
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: FOREGROUND PUSH LISTENER
// Quando o SW recebe push e o app está aberto, o SW manda postMessage.
// Aqui registramos o listener e chamamos o callback com { title, body, tag }.
// ═══════════════════════════════════════════════════════════════
export function startForegroundPushListener(onPush) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'PUSH_FOREGROUND') { playFalconCry(); onPush(e.data); }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: TAG ÚNICA
// ═══════════════════════════════════════════════════════════════
export function notifTag(dayDocId, title) {
  return `visao-${dayDocId}-${title.slice(0, 30).replace(/\s+/g, '-')}`;
}
