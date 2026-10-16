// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · "📄 Conteúdo" do depoimento
// O vídeo da prova fica 7 dias. Pra não perder o que foi dito, logo depois do
// envio o app tira o som do vídeo, manda pro Worker (Whisper) em pedaços de
// 1 min, pede pra organizar (resumo + tópicos) e grava no check-in. Depois que
// o vídeo sai, a sala mostra o botão "📄 Conteúdo" (Élton, 16/10).
// Os trechos com tempo viram legenda automática no vídeo enquanto ele existe
// (conteudo.legendas = [[início s, fim s, texto], ...]).
// BLOCO 1 — SOM DO VÍDEO → PEDAÇOS WAV
// BLOCO 2 — WORKER (transcrever / organizar)
// BLOCO 3 — GERAR E GUARDAR
// BLOCO 4 — MOSTRAR
// BLOCO 5 — LEGENDA NO VÍDEO
// ─────────────────────────────────────────────────────────────
import { PET_IA_URL } from './pet-nuvem.js';
import { trapModalBack } from './modal-voltar.js';

const TAXA = 16000;      // o Whisper trabalha em 16 kHz mono
const PEDACO_SEG = 60;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: SOM DO VÍDEO → PEDAÇOS WAV
// ═══════════════════════════════════════════════════════════════
async function _somMono16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || typeof OfflineAudioContext === 'undefined') throw new Error('sem áudio');
  const ctx = new Ctx();
  let buf;
  try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); }
  finally { try { ctx.close(); } catch { /* ok */ } }
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * TAXA), TAXA);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

function _wavBase64(amostras) {
  const n = amostras.length;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, TAXA, true); v.setUint32(28, TAXA * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, amostras[i])) * 0x7fff, true);
  const bytes = new Uint8Array(v.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WORKER
// ═══════════════════════════════════════════════════════════════
async function _worker(corpo) {
  const { supabase } = await import('./config-supabase.js');
  const token = (await supabase.auth.getSession())?.data?.session?.access_token;
  if (!token || !PET_IA_URL) throw new Error('sem sessão');
  const r = await fetch(PET_IA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`worker ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: GERAR E GUARDAR
// ═══════════════════════════════════════════════════════════════
// Roda em segundo plano depois do envio; falhou (sem internet, cota da IA do
// dia), tenta de novo quando a pessoa abrir a sala (tentarConteudosPendentes).
const _rodando = new Set();
export async function gerarConteudo(checkinId, blob) {
  if (!checkinId || !blob || _rodando.has(checkinId)) return false;
  _rodando.add(checkinId);
  try {
    const som = await _somMono16k(blob);
    const passo = TAXA * PEDACO_SEG;
    const partes = [];
    const legendas = [];
    for (let i = 0; i < som.length; i += passo) {
      const pedaco = som.subarray(i, i + passo);
      if (pedaco.length < TAXA) break;   // menos de 1 s: só ruído
      const r = await _worker({ transcrever: _wavBase64(pedaco) });
      if (r?.texto) partes.push(r.texto);
      const base = i / TAXA;   // tempo do pedaço dentro do vídeo
      for (const g of (Array.isArray(r?.segmentos) ? r.segmentos : [])) {
        legendas.push([+(base + g.ini).toFixed(1), +(base + g.fim).toFixed(1), String(g.texto || '')]);
      }
    }
    const texto = partes.join(' ').trim();
    const conteudo = texto.length >= 10 ? await _worker({ organizarConteudo: texto }) : { resumo: '', pontos: [], texto };
    const salvar = { resumo: conteudo.resumo || '', pontos: conteudo.pontos || [], texto: (conteudo.texto || texto).slice(0, 12000), legendas };
    // O banco aceita até 20 mil letras: vídeo longo perde primeiro o texto
    // corrido (dá pra montar pela legenda), depois o fim da legenda
    if (JSON.stringify(salvar).length > 19000) salvar.texto = '';
    while (JSON.stringify(salvar).length > 19000 && salvar.legendas.length) salvar.legendas.pop();
    const { supabase } = await import('./config-supabase.js');
    const { error } = await supabase.rpc('desafio_checkin_conteudo', { p_checkin: checkinId, p_conteudo: salvar });
    return !error;
  } catch (e) {
    console.warn('[conteúdo da prova]', e?.message || e);
    return false;
  } finally {
    _rodando.delete(checkinId);
  }
}

// Minhas provas de depoimento ainda com vídeo e sem conteúdo: baixa o vídeo e
// gera (uma tentativa por prova enquanto o app está aberto).
const _tentadas = new Set();
export async function tentarConteudosPendentes(d, checks, uid, urlDoVideo) {
  if (d?.prova !== 'depoimento') return;
  const agora = Date.now();
  const pend = (checks || []).filter(c => c.user_id === uid && c.id && c.video_path && !c.conteudo
    && !_tentadas.has(c.id) && (!c.video_expira_em || new Date(c.video_expira_em).getTime() > agora));
  for (const c of pend.slice(0, 2)) {
    _tentadas.add(c.id);
    try {
      const url = await urlDoVideo(c.video_path);
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      await gerarConteudo(c.id, blob);
    } catch { /* tenta na próxima vez que abrir o app */ }
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: MOSTRAR
// ═══════════════════════════════════════════════════════════════
const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const _textoDaLegenda = (c) => (Array.isArray(c?.legendas) ? c.legendas.map(l => l?.[2] || '').join(' ').trim() : '');

export function temConteudo(c) {
  return !!(c && (c.resumo || (Array.isArray(c.pontos) && c.pontos.length) || c.texto || _textoDaLegenda(c)));
}

export function abrirConteudo(conteudo, { quem = '', quando = '' } = {}) {
  const c = { ...(conteudo || {}) };
  if (!c.texto) c.texto = _textoDaLegenda(c);
  const pontos = Array.isArray(c.pontos) ? c.pontos : [];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal pc-modal" style="max-width:440px;max-height:85vh;overflow:auto">
      <div class="modal-title">📄 Conteúdo${quem ? ` · ${_esc(quem)}` : ''}</div>
      ${quando ? `<div class="modal-hint">${_esc(quando)}</div>` : ''}
      ${c.resumo ? `<p class="pc-resumo" style="font-weight:600;line-height:1.5">${_esc(c.resumo)}</p>` : ''}
      ${pontos.map(p => `<div class="pc-ponto" style="margin:12px 0"><div style="font-weight:700;color:var(--accent,#a78bfa)">${_esc(p.titulo)}</div><div style="line-height:1.5">${_esc(p.texto)}</div></div>`).join('')}
      ${!c.resumo && !pontos.length && c.texto ? `<p style="line-height:1.5">${_esc(c.texto)}</p>` : ''}
      ${c.texto && (c.resumo || pontos.length) ? `<details style="margin-top:12px"><summary>Ver tudo o que foi dito</summary><p style="line-height:1.5;opacity:.85">${_esc(c.texto)}</p></details>` : ''}
      <div class="modal-actions"><button class="btn-primary" data-pc-fechar style="width:100%">Fechar</button></div>
    </div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-pc-fechar]').onclick = () => fechar();
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: LEGENDA NO VÍDEO
// ═══════════════════════════════════════════════════════════════
// Áudio ruim (fone, vento): a legenda mostra o que foi dito por cima do vídeo.
// Trecho longo é quebrado em linhas curtas, com o tempo dividido pelas palavras.
const _vttTempo = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, seg = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${seg.toFixed(3).padStart(6, '0')}`;
};
export function legendaVtt(conteudo, maxPalavras = 6) {
  const ls = Array.isArray(conteudo?.legendas) ? conteudo.legendas : [];
  const cues = [];
  for (const l of ls) {
    const [ini, fim, txt] = [Number(l?.[0]), Number(l?.[1]), String(l?.[2] || '').trim()];
    if (!txt || !(fim > ini)) continue;
    const pal = txt.split(/\s+/);
    const blocos = Math.ceil(pal.length / maxPalavras);
    const dur = (fim - ini) / blocos;
    for (let b = 0; b < blocos; b++) {
      const linha = pal.slice(b * maxPalavras, (b + 1) * maxPalavras).join(' ').replace(/-->/g, '→');
      cues.push(`${_vttTempo(ini + b * dur)} --> ${_vttTempo(ini + (b + 1) * dur)}\n${linha}`);
    }
  }
  return cues.length ? `WEBVTT\n\n${cues.join('\n\n')}\n` : '';
}
const _vttUrls = new Map();
export function urlDaLegenda(checkinId, conteudo) {
  if (!checkinId) return '';
  if (_vttUrls.has(checkinId)) return _vttUrls.get(checkinId);
  const vtt = legendaVtt(conteudo);
  if (!vtt) return '';
  const u = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
  _vttUrls.set(checkinId, u);
  return u;
}
