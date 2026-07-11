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
