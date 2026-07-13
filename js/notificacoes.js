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
  if (result === 'granted') {
    startNotifChecker(); // inicia checker se ainda não estava rodando
    showNotifPopupGuide(); // guia 1x: como ativar pop-up + vibração no SO (web não abre as configs sozinho)
  }
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

  // Prefixo ⏰ no título — "tá na hora". Evita duplicar se já vier com o relógio.
  title = (title || 'Falcon');
  if (!title.startsWith('⏰')) title = '⏰ ' + title;

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
        icon: './icons/icon-192.png', badge: './icons/falcon-badge.png?v=175',
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
// BLOCO 3.5: FALCON CRY — Red-tailed Hawk real via Web Audio API
// Toca quando a notificação dispara com o app aberto (foreground).
// Background/fechado usa som padrão do sistema (limitação da plataforma).
//
// Fluxo: unlockAudio() no primeiro toque → pré-carrega o WAV →
//        playFalconCry() toca o buffer decodificado instantaneamente.
// ═══════════════════════════════════════════════════════════════
let _audioCtx    = null;
let _cryBuffer   = null; // buffer decodificado do WAV real
let _cryLoading  = false;

async function _loadCryBuffer() {
  if (_cryBuffer || _cryLoading || !_audioCtx) return;
  _cryLoading = true;
  try {
    const res = await fetch('./sounds/falcon-cry.wav');
    const ab  = await res.arrayBuffer();
    _cryBuffer = await _audioCtx.decodeAudioData(ab);
  } catch (e) { console.warn('[falcon] WAV load failed:', e); }
  _cryLoading = false;
}

// Chame no primeiro clique/toque do usuário — desbloqueia o áudio no mobile
export function unlockAudio() {
  if (_audioCtx) {
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    _loadCryBuffer();
    return;
  }
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Buffer silencioso: destrava a política de autoplay do browser
    const buf = _audioCtx.createBuffer(1, 1, _audioCtx.sampleRate);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
    _loadCryBuffer(); // pré-carrega o WAV logo após desbloquear
  } catch (_) {}
}

export async function playFalconCry() {
  if (getNotifMuted()) return;
  if ('vibrate' in navigator) navigator.vibrate([500, 100, 500, 100, 500, 100, 500, 100, 1000]);
  if (!_audioCtx || _audioCtx.state !== 'running') return;
  // Aguarda o buffer se ainda não carregou (máx ~3s antes de desistir)
  if (!_cryBuffer) {
    await _loadCryBuffer();
    if (!_cryBuffer) return;
  }
  try {
    const ctx = _audioCtx;
    const src = ctx.createBufferSource();
    src.buffer = _cryBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 15.0;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(ctx.currentTime + 0.01);
  } catch (_) {}
}

// Síntese fallback (mantida caso o WAV não carregue — não deve ser chamada normalmente)
function _playFalconCrySynth() {
  if (!_audioCtx || _audioCtx.state !== 'running') return;
  try {
    const ctx = _audioCtx;
    const t   = ctx.currentTime + 0.01;
    const DUR = 1.65; // grito longo e imponente

    // ── Reverb sintético (0.6s — simula espaço aberto, sem arquivo externo) ──
    // IR gerado por ruído branco com decaimento exponencial
    const irLen = Math.ceil(ctx.sampleRate * 0.60);
    const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.0);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = irBuf;
    const gWet = ctx.createGain();
    gWet.gain.value = 0.22; // mix reverb: 22% wet
    convolver.connect(gWet);
    gWet.connect(ctx.destination);

    // ── WaveShaper — saturação tanh (grit orgânico, sem clipping digital) ──
    const shaper = ctx.createWaveShaper();
    const cLen   = 512;
    const sCurve = new Float32Array(cLen);
    for (let i = 0; i < cLen; i++) {
      const x = (i / (cLen - 1)) * 2 - 1;
      sCurve[i] = Math.tanh(x * 2.4); // k=2.4: saturação moderada/agressiva
    }
    shaper.curve = sCurve;
    shaper.oversample = '4x'; // anti-aliasing na saturação

    // ── HPF baixo — mantém corpo da ave grande (corta abaixo de 550 Hz) ──
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 550;

    // Sinal seco direto
    const gDry = ctx.createGain();
    gDry.gain.value = 0.88;

    // Chain: [osciladores] → [tremolo] → [shaper] → [hpf] → [gDry] → destination
    //                                              → [hpf] → [convolver] → [gWet] → destination

    // ── Tremolo 22 Hz — cria textura "krrr" interna (modulação de amplitude) ──
    const tBase = ctx.createGain();
    tBase.gain.value = 0.70; // DC offset

    const tLFO = ctx.createOscillator();
    const tMod = ctx.createGain();
    tLFO.type = 'sine';
    tLFO.frequency.value = 22; // 22 ciclos/s = aspereza realista de rapinante
    tMod.gain.value = 0.30;   // profundidade: oscila entre 40% e 100%
    tLFO.connect(tMod);
    tMod.connect(tBase.gain);
    tLFO.start(t);
    tLFO.stop(t + DUR + 0.1);

    tBase.connect(shaper);
    shaper.connect(hpf);
    hpf.connect(gDry);
    gDry.connect(ctx.destination);
    hpf.connect(convolver);

    // ── 3 Osciladores sawtooth desafinados ──
    // Sawtooth: todos os harmônicos → som raspado e agressivo (≠ square, que é oco)
    // Detuning cria batimentos naturais — sem isso soa sintético
    // Sweep: ataque rápido (65ms), desce lentamente como rapinante real (Red-tailed Hawk model)
    // Frequência MÁXIMA = 3000 Hz (não 4600 — acima de 3.5k soa piado fino)
    const oscDefs = [
      { detune:  0,  vol: 0.26 }, // fundamental
      { detune: -9,  vol: 0.19 }, // -9 cents: corpo/calor
      { detune: +7,  vol: 0.15 }, // +7 cents: brilho/presença
    ];

    for (const { detune, vol } of oscDefs) {
      const osc  = ctx.createOscillator();
      const gOsc = ctx.createGain();
      osc.type = 'sawtooth';
      osc.detune.value = detune;

      // Sweep de frequência: modelo Red-tailed Hawk (Hollywood raptor sound)
      //   1200 Hz → 3000 Hz em 65ms (ataque marcante)
      //   3000 → 2200 Hz (assenta no grito)
      //   2200 → 1400 Hz (descida orgânica — o "corpo" do grito)
      //   1400 → 900 Hz (cauda grave — peso e dominância)
      //   900 → 1050 Hz (upturn final — grito selvagem não cai em linha reta)
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(3000, t + 0.065);
      osc.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
      osc.frequency.exponentialRampToValueAtTime(1400, t + 0.75);
      osc.frequency.exponentialRampToValueAtTime(900,  t + 1.35);
      osc.frequency.exponentialRampToValueAtTime(1050, t + 1.62);

      // Envelope: ataque 60ms → sustain → fade natural (sem corte seco)
      gOsc.gain.setValueAtTime(0,            t);
      gOsc.gain.linearRampToValueAtTime(vol,       t + 0.060);
      gOsc.gain.setValueAtTime(vol * 0.86,   t + 0.22);
      gOsc.gain.setValueAtTime(vol * 0.72,   t + 0.90);
      gOsc.gain.exponentialRampToValueAtTime(0.001, t + DUR);

      osc.connect(gOsc);
      gOsc.connect(tBase); // → tremolo → shaper → hpf → saída
      osc.start(t);
      osc.stop(t + DUR + 0.08);
    }

    // ── Ruído bandpass (breathiness — textura aérea e raspada) ──
    // Segue a frequência dos osciladores para soar coeso
    const nLen = Math.ceil(ctx.sampleRate * 2.0);
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd   = nBuf.getChannelData(0);
    for (let j = 0; j < nLen; j++) nd[j] = Math.random() * 2 - 1;

    const nSrc   = ctx.createBufferSource();
    const nBPF   = ctx.createBiquadFilter();
    const gNoise = ctx.createGain();
    nSrc.buffer  = nBuf;
    nBPF.type    = 'bandpass';
    nBPF.Q.value = 0.55; // Q baixo = faixa larga = mais aéreo e natural
    nBPF.frequency.setValueAtTime(2400, t);
    nBPF.frequency.exponentialRampToValueAtTime(3000, t + 0.065);
    nBPF.frequency.exponentialRampToValueAtTime(1800, t + 0.75);
    nBPF.frequency.exponentialRampToValueAtTime(1100, t + 1.55);
    gNoise.gain.setValueAtTime(0,     t);
    gNoise.gain.linearRampToValueAtTime(0.24, t + 0.060);
    gNoise.gain.setValueAtTime(0.20,  t + 0.22);
    gNoise.gain.setValueAtTime(0.16,  t + 0.90);
    gNoise.gain.exponentialRampToValueAtTime(0.001, t + DUR);
    nSrc.connect(nBPF);
    nBPF.connect(gNoise);
    gNoise.connect(ctx.destination); // ruído vai direto — já é aéreo
    nSrc.start(t);
    nSrc.stop(t + DUR + 0.08);

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
          body:    n.body,
          icon:    './icons/icon-192.png',
          badge:   './icons/falcon-badge.png?v=175',
          tag:     n.tag,
          vibrate: muted ? [] : [300],
          renotify: true,
          silent:  muted,
          data:    { url: '/' },
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
    if (e.data?.type === 'PUSH_FOREGROUND') {
      if (!getNotifMuted() && 'vibrate' in navigator) {
        const ok = navigator.vibrate([500, 100, 500, 100, 500, 100, 500, 100, 1000]);
        console.log('[falcon] vibrate result:', ok, 'muted:', getNotifMuted());
      }
      playFalconCry();
      onPush(e.data);
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: TAG ÚNICA
// ═══════════════════════════════════════════════════════════════
export function notifTag(dayDocId, title) {
  return `visao-${dayDocId}-${title.slice(0, 30).replace(/\s+/g, '-')}`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 8: GUIA DE NOTIFICAÇÃO (platform-aware: iOS x Android)
// Web/PWA não consegue abrir as configs do SO por código → mostramos passo a passo.
// Auto: 1x após conceder permissão (Android/iOS instalado).
// Não instalado (iOS Safari ou Android no navegador): maybeInstallHint() avisa como instalar.
// Manual: botão em Ajustes chama showNotifPopupGuide(true).
// ═══════════════════════════════════════════════════════════════
const NOTIF_GUIDE_KEY = 'visao_notif_guide_shown';
const IOS_INSTALL_KEY = 'visao_ios_install_hint';

function _isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1); // iPad iPadOS
}
function _isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

// ── PWA install prompt (beforeinstallprompt) — botão "Instalar" próprio ──
// Muitos usuários não acham a opção de instalar no menu do Chrome (muda por versão),
// então capturamos o evento e oferecemos um botão direto no app / no pet.
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();       // segura o mini-infobar; disparamos no nosso próprio botão
  _installPrompt = e;
});
export function canInstallApp() { return !!_installPrompt && !_isStandalone(); }
export async function promptInstallApp() {
  if (!_installPrompt) return 'unavailable';
  _installPrompt.prompt();
  let outcome = 'dismissed';
  try { outcome = (await _installPrompt.userChoice).outcome; } catch {}
  _installPrompt = null;
  return outcome; // 'accepted' | 'dismissed' | 'unavailable'
}

function _guideContent() {
  const ios = _isIOS();
  const standalone = _isStandalone();

  if (ios && !standalone) {
    return {
      icon: '📲',
      title: 'Instale o Falcon pra receber lembretes',
      steps: `
        <li>Toque no botão <strong>Compartilhar</strong> (o quadrado com seta ↑) na barra do Safari</li>
        <li>Escolha <strong>“Adicionar à Tela de Início”</strong></li>
        <li>Abra o Falcon pelo ícone novo na tela inicial</li>
        <li>Permita as notificações quando o app pedir</li>`,
      footer: 'No iPhone as notificações só funcionam com o app na Tela de Início — o Safari sozinho não recebe. Precisa de iOS 16.4 ou mais novo.',
    };
  }
  if (ios) {
    return {
      icon: '🔔',
      title: 'Notificações ativadas!',
      steps: `
        <li>Os lembretes já aparecem como <strong>banner</strong> e tocam som automaticamente</li>
        <li>Pra ajustar estilo/som: <strong>Ajustes do iPhone → Notificações → Falcon</strong></li>`,
      footer: 'A vibração segue os ajustes de toque/haptics do próprio iPhone.<br><br>Ainda sem som/vibração/banner? Toque no 👁️ do falcão aqui embaixo e pergunte <strong>“notificação”</strong>.',
    };
  }
  if (!standalone) {
    // Android (ou desktop) rodando no navegador, sem instalar.
    // Vários caminhos porque a opção muda de lugar/nome por versão do Chrome.
    return {
      icon: '📲',
      title: 'Instale o Falcon pra receber lembretes',
      steps: `
        <li>Menu do Chrome (<strong>⋮</strong> em cima) → <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong></li>
        <li>Em alguns celulares aparece um ícone de <strong>instalar (⊕ / ↓)</strong> na barra de endereço — toque nele</li>
        <li>Ou o menu mostra <strong>“Adicionar ao Início”</strong></li>
        <li>Abra o Falcon pelo ícone novo e permita as notificações</li>`,
      footer: 'Por enquanto o Falcon é um web app — logo vira aplicativo. Se não achar a opção no menu, use o botão abaixo 👇',
      installBtn: true,
    };
  }
  return {
    icon: '🔔',
    title: 'Ativar pop-up e vibração',
    steps: `
      <li>Configurações do Android → <strong>Apps → Falcon</strong></li>
      <li>Toque em <strong>Notificações</strong></li>
      <li>Abra a categoria <strong>Geral</strong></li>
      <li>Ative <strong>Mostrar como pop-up</strong> e <strong>Vibrar</strong></li>`,
    footer: '⚡ Atalho: segure o dedo numa notificação do Falcon → toque na engrenagem ⚙️ ou em “Configurações” → Geral.<br><br>Ainda sem som/vibração/banner? Toque no 👁️ do falcão aqui embaixo e pergunte <strong>“notificação”</strong>.',
  };
}

export function showNotifPopupGuide(force = false) {
  if (!force && localStorage.getItem(NOTIF_GUIDE_KEY) === '1') return;
  localStorage.setItem(NOTIF_GUIDE_KEY, '1');

  const c = _guideContent();
  const showInstall = c.installBtn && canInstallApp();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div style="font-size:38px;text-align:center;margin-bottom:4px">${c.icon}</div>
      <div class="modal-title" style="text-align:center">${c.title}</div>
      <ol style="margin:14px 0 14px 20px;padding:0;line-height:1.8;font-size:14px">${c.steps}</ol>
      <div class="modal-hint" style="font-size:12px;margin-bottom:16px">${c.footer}</div>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        ${showInstall ? '<button class="btn-primary" id="notif-guide-install" style="width:100%">📲 Instalar Falcon agora</button>' : ''}
        <button class="${showInstall ? 'btn-secondary' : 'btn-primary'}" id="notif-guide-ok" style="width:100%">Entendi</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#notif-guide-ok').onclick = () => overlay.remove();
  const installBtn = overlay.querySelector('#notif-guide-install');
  if (installBtn) {
    installBtn.onclick = async () => {
      installBtn.disabled = true;
      installBtn.textContent = 'Abrindo instalação…';
      const outcome = await promptInstallApp();
      if (outcome === 'accepted') overlay.remove();
      else { installBtn.disabled = false; installBtn.textContent = '📲 Instalar Falcon agora'; }
    };
  }
}

// Não instalado (iOS no Safari OU Android no navegador): mostra o guia de instalação 1x.
// iOS: push é impossível sem instalar. Android: funciona no navegador, mas instalado é
// bem mais confiável (e logo vira app). Chamado da Home, com usuário já logado e engajado.
export function maybeInstallHint() {
  if (_isStandalone()) return; // já instalado
  if (localStorage.getItem(IOS_INSTALL_KEY) === '1') return;
  localStorage.setItem(IOS_INSTALL_KEY, '1');
  localStorage.removeItem(NOTIF_GUIDE_KEY); // garante que o guia (branch de instalação) apareça
  showNotifPopupGuide(true);
}
