// ═══════════════════════════════════════════════════════════════
// VISÃO · Sons sintéticos via Web Audio API
// Sem dependências, sem arquivos — gera tudo em runtime.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — PLIM (joinha marcou — agudo curto, alegre)
// BLOCO 2 — PLOP (desfazendo o joinha — descendente, suave)
// BLOCO 3 — BRRRR (deletar — grave com vibrato/tremor)
// BLOCO 2.5 — DING (notificação de lembrete — triplo ascendente)
// ─────────────────────────────────────────────────────────────
let ctx = null;
let muted = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // Renderiza os cliques em segundo plano assim que houver contexto, pra o
  // primeiro clique real já sair com som (senão a primeira rolagem é muda).
  if (typeof _prepararCliques === 'function') _prepararCliques();
  return ctx;
}

export function setMuted(v) { muted = !!v; }
export function isMuted()   { return muted; }


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PLIM (joinha marcou — agudo curto, alegre)
// ═══════════════════════════════════════════════════════════════
export function playDone() {
  if (muted) return;
  const c = getCtx(); if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(1760, t + 0.10);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PLOP (desfazendo o joinha — descendente, suave)
// ═══════════════════════════════════════════════════════════════
export function playUndone() {
  if (muted) return;
  const c = getCtx(); if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, t);
  osc.frequency.exponentialRampToValueAtTime(220, t + 0.16);
  gain.gain.setValueAtTime(0.14, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: BRRRR (deletar — grave com vibrato/tremor)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// BLOCO 2.5: DING (notificação de lembrete — triplo ascendente)
// ═══════════════════════════════════════════════════════════════
export function playAlert() {
  if (muted) return;
  const c = getCtx(); if (!c) return;
  const notes = [523, 659, 784]; // C5 → E5 → G5
  notes.forEach((freq, i) => {
    const t = c.currentTime + i * 0.18;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}


export function playDelete() {
  if (muted) return;
  const c = getCtx(); if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();    // modulador (vibrato)
  const lfoGain = c.createGain();
  const gain = c.createGain();

  osc.type = 'sawtooth';
  osc.frequency.value = 120;

  lfo.type = 'sine';
  lfo.frequency.value = 16;              // vibrato 16Hz = tremor
  lfoGain.gain.value = 35;               // intensidade do vibrato (Hz)
  lfo.connect(lfoGain).connect(osc.frequency);

  gain.gain.setValueAtTime(0.20, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.20);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

  osc.connect(gain).connect(c.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.58);
  lfo.stop(t + 0.58);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: TRAVA (rolagem — tambor de revólver .38 girando)
// ═══════════════════════════════════════════════════════════════
// Duas camadas: o estalo metálico da trava (ruído em bandpass alto,
// decaimento quase instantâneo) + o corpo mecânico do tambor batendo
// no detente (queda grave e seca). A leve variação aleatória de tom
// evita o efeito "metralhadora" quando os cliques vêm em sequência.
// PRÉ-RENDERIZADO. Antes, cada clique montava 10 nós de áudio (ruído +
// filtro + 4 osciladores + 4 gains). Na rolagem rápida do cinturão eles vinham
// em rajada e:
//   • travavam o frame (os 10 nós criados no meio do scroll) → a "tremida"
//     dos ícones;
//   • sobrecarregavam o thread de áudio → cliques fora de tempo;
//   • alguns nem soavam, porque o contexto ainda estava resumindo.
// Agora o som é renderizado UMA vez em algumas variações e cada clique só
// dispara um buffer pronto (1 nó). Leve o bastante pra acompanhar a rolagem.
let _clickBufs = null;
let _ultimoClick = 0;

function _renderClickBuf(seed) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const sr = 44100, dur = 0.09;
  const oc = new AC(1, Math.ceil(sr * dur), sr);
  const t = 0;
  const rnd = (() => { let x = seed * 9973 + 1; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

  // estalo da trava — ruído em passa-banda alto
  const nd = Math.ceil(sr * 0.04);
  const buf = oc.createBuffer(1, nd, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < nd; i++) data[i] = (rnd() * 2 - 1) * Math.pow(1 - i / nd, 9);
  const src = oc.createBufferSource(); src.buffer = buf;
  const bp = oc.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = 4200 + rnd() * 900; bp.Q.value = 14;
  const ng = oc.createGain(); ng.gain.value = 0.20;
  src.connect(bp).connect(ng).connect(oc.destination); src.start(t);

  // ressonância metálica (parciais em razões não inteiras)
  const base = 1750 + rnd() * 180;
  for (const [razao, vol, decai] of [[1.00,0.085,0.16],[1.51,0.055,0.13],[2.13,0.038,0.10],[2.87,0.022,0.075]]) {
    const o = oc.createOscillator(); o.type = 'sine'; o.frequency.value = base * razao;
    const g = oc.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decai);
    o.connect(g).connect(oc.destination); o.start(t); o.stop(t + decai + 0.02);
  }
  // corpo do mecanismo
  const osc = oc.createOscillator(); osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, t); osc.frequency.exponentialRampToValueAtTime(140, t + 0.03);
  const og = oc.createGain(); og.gain.setValueAtTime(0.10, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  osc.connect(og).connect(oc.destination); osc.start(t); osc.stop(t + 0.05);

  return oc.startRendering();
}

async function _prepararCliques() {
  if (_clickBufs) return;
  _clickBufs = [];   // marca "em preparo" pra não renderizar duas vezes
  try {
    _clickBufs = await Promise.all([1, 2, 3, 4].map(_renderClickBuf));
  } catch { _clickBufs = null; }
}

export function playClick() {
  if (muted) return;
  const c = getCtx(); if (!c) return;

  // Trava anti-metralhadora: em rolagem muito rápida os cliques chegavam
  // colados e viravam ruído. 40ms deixa passar ~25/s, que ainda soa contínuo.
  const agora = performance.now();
  if (agora - _ultimoClick < 40) return;
  _ultimoClick = agora;

  if (!_clickBufs) { _prepararCliques(); return; }   // primeira vez: prepara e sai
  if (!_clickBufs.length) return;

  const buf = _clickBufs[(Math.random() * _clickBufs.length) | 0];
  const src = c.createBufferSource();
  src.buffer = buf;
  // leve variação de tom pra não soar idêntico a cada clique
  src.playbackRate.value = 0.97 + Math.random() * 0.06;
  src.connect(c.destination);
  src.start();
}
