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
//
// AudioContext no mobile exige gesto do usuário para desbloquear.
// Solução: contexto compartilhado desbloqueado no primeiro toque (unlockAudio).
// playFalconCry só roda se o contexto já foi desbloqueado.
// ═══════════════════════════════════════════════════════════════
let _audioCtx = null;

// Chame no primeiro clique/toque do usuário — desbloqueia o áudio no mobile
export function unlockAudio() {
  if (_audioCtx) { if (_audioCtx.state === 'suspended') _audioCtx.resume(); return; }
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Buffer silencioso: destrava a política de autoplay do browser
    const buf = _audioCtx.createBuffer(1, 1, _audioCtx.sampleRate);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
  } catch (_) {}
}

export function playFalconCry() {
  if (getNotifMuted()) return;
  if (!_audioCtx || _audioCtx.state !== 'running') return; // sem gesto = sem som (policy)
  try {
    const ctx = _audioCtx;
    const now = ctx.currentTime + 0.01;
    const DUR = 1.30;
    const t   = now;

    // Ruído branco — textura áspera de ave real
    const noiseLen = Math.ceil(ctx.sampleRate * 2.0);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let j = 0; j < noiseLen; j++) nd[j] = Math.random() * 2 - 1;

    // HPF para remover graves artificiais
    const hpf1 = ctx.createBiquadFilter();
    const hpf2 = ctx.createBiquadFilter();
    hpf1.type = hpf2.type = 'highpass';
    hpf1.frequency.value = hpf2.frequency.value = 1000;

    // Osc principal (square — brilhante e cortante como falcão peregrino)
    const osc  = ctx.createOscillator();
    const gOsc = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2000, t);
    osc.frequency.exponentialRampToValueAtTime(4600, t + 0.022); // pico "ki!"
    osc.frequency.exponentialRampToValueAtTime(4000, t + 0.09);  // assenta
    osc.frequency.exponentialRampToValueAtTime(3500, t + 0.45);  // sustain lento
    osc.frequency.exponentialRampToValueAtTime(2900, t + 0.88);  // começa cauda
    osc.frequency.exponentialRampToValueAtTime(2300, t + 1.28);  // "aaaa" final
    // Vibrato 8Hz — entra suave, cresce no sustain, recua na cauda
    const lfo  = ctx.createOscillator();
    const gLFO = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 8;
    gLFO.gain.setValueAtTime(0,   t + 0.08);
    gLFO.gain.linearRampToValueAtTime(130, t + 0.20);
    gLFO.gain.setValueAtTime(130, t + 0.75);
    gLFO.gain.linearRampToValueAtTime(55,  t + 1.22);
    lfo.connect(gLFO);
    gLFO.connect(osc.frequency);
    lfo.start(t + 0.08);
    lfo.stop(t + DUR + 0.05);
    gOsc.gain.setValueAtTime(0,    t);
    gOsc.gain.linearRampToValueAtTime(0.32, t + 0.006);
    gOsc.gain.setValueAtTime(0.28, t + 0.09);
    gOsc.gain.setValueAtTime(0.24, t + 0.60);
    gOsc.gain.exponentialRampToValueAtTime(0.001, t + DUR);
    osc.connect(hpf1);
    hpf1.connect(gOsc);
    gOsc.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + DUR + 0.06);

    // Osc2 sawtooth desafinado (×1.51) — rouquidão/aspereza
    const osc2  = ctx.createOscillator();
    const gOsc2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(2000 * 1.51, t);
    osc2.frequency.exponentialRampToValueAtTime(4000 * 1.51, t + 0.09);
    osc2.frequency.exponentialRampToValueAtTime(2900 * 1.51, t + 0.88);
    osc2.frequency.exponentialRampToValueAtTime(2300 * 1.51, t + 1.28);
    gOsc2.gain.setValueAtTime(0,    t);
    gOsc2.gain.linearRampToValueAtTime(0.09, t + 0.08);
    gOsc2.gain.setValueAtTime(0.11, t + 0.45);
    gOsc2.gain.exponentialRampToValueAtTime(0.001, t + DUR);
    osc2.connect(hpf2);
    hpf2.connect(gOsc2);
    gOsc2.connect(ctx.destination);
    osc2.start(t);
    osc2.stop(t + DUR + 0.06);

    // Ruído filtrado (textura áspera de ave)
    const nSrc   = ctx.createBufferSource();
    const nBPF   = ctx.createBiquadFilter();
    const gNoise = ctx.createGain();
    nSrc.buffer = noiseBuf;
    nBPF.type   = 'bandpass';
    nBPF.Q.value = 0.8;
    nBPF.frequency.setValueAtTime(4200, t);
    nBPF.frequency.exponentialRampToValueAtTime(5600, t + 0.022);
    nBPF.frequency.exponentialRampToValueAtTime(4300, t + 0.09);
    nBPF.frequency.exponentialRampToValueAtTime(3400, t + 0.88);
    nBPF.frequency.exponentialRampToValueAtTime(2700, t + 1.28);
    gNoise.gain.setValueAtTime(0,    t);
    gNoise.gain.linearRampToValueAtTime(0.22, t + 0.006);
    gNoise.gain.setValueAtTime(0.18, t + 0.09);
    gNoise.gain.setValueAtTime(0.15, t + 0.60);
    gNoise.gain.exponentialRampToValueAtTime(0.001, t + DUR);
    nSrc.connect(nBPF);
    nBPF.connect(gNoise);
    gNoise.connect(ctx.destination);
    nSrc.start(t);
    nSrc.stop(t + DUR + 0.06);

    // não fecha — contexto compartilhado precisa ficar aberto para próxima notificação
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
let _pushListenerStarted = false;
export function startForegroundPushListener(onPush) {
  if (!('serviceWorker' in navigator) || _pushListenerStarted) return;
  _pushListenerStarted = true;
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
