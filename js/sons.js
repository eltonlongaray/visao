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
export function playClick() {
  if (muted) return;
  const c = getCtx(); if (!c) return;
  const t = c.currentTime;

  // 1) Estalo da trava — ruído num passa-banda alto e bem estreito.
  //    Frequência mais alta e Q maior que antes: em vez de "toc" abafado,
  //    sai o "tec" seco de metal batendo em metal.
  const dur = 0.04;
  const buf = c.createBuffer(1, Math.max(1, Math.ceil(c.sampleRate * dur)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 9);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 4200 + Math.random() * 900;
  bp.Q.value = 14;
  const ng = c.createGain();
  ng.gain.value = 0.20;
  src.connect(bp).connect(ng).connect(c.destination);
  src.start(t);

  // 2) A RESSONÂNCIA DO METAL — o que faz soar metálico e não seco.
  //    Parciais em razões NÃO inteiras (1 : 1,51 : 2,13 : 2,87), como numa
  //    barra de metal percutida. Razões inteiras soariam afinadas, tipo sino
  //    de brinquedo; as quebradas é que dão o timbre de aço.
  const base = 1750 + Math.random() * 180;
  const parciais = [
    [1.00, 0.085, 0.16],
    [1.51, 0.055, 0.13],
    [2.13, 0.038, 0.10],
    [2.87, 0.022, 0.075],
  ];
  for (const [razao, vol, decai] of parciais) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * razao;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decai);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + decai + 0.02);
  }

  // 3) Corpo do mecanismo — bem curto e discreto, só pra dar peso ao impacto.
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.03);
  const og = c.createGain();
  og.gain.setValueAtTime(0.10, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}
