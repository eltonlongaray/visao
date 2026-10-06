// ─── ÍNDICE ──────────────────────────────────────────────────
// Nota do dia pelo Pet: entende a fala sobre o sono ("dormi 23h30, cochilei
// 20 min e fiquei 1h acordado de madrugada") e diz o que falta na nota.
// Só funções puras (sem banco, sem DOM); quem conversa e grava é o
// assistente-ia.js (BLOCO 8.10). Os campos são os mesmos do modal da nota
// (tela-ritual.js): prideFail, improve, daySleepMinutes, nightAwakeMinutes.
// BLOCO 1 — NÚMEROS E DURAÇÕES FALADOS
// BLOCO 2 — LER O SONO DA FRASE
// BLOCO 3 — O QUE FALTA NA NOTA
// ─────────────────────────────────────────────────────────────

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NÚMEROS E DURAÇÕES FALADOS
// ═══════════════════════════════════════════════════════════════
const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };
const NUM_RE = new RegExp(`\\b(${Object.keys(NUM).join('|')})\\b`, 'g');

// "uma hora e meia" → "1h30", "meia noite e meia" → "00:30", "vinte minutos" → "20 minutos"
function normalizar(texto) {
  return semAcento(texto)
    .replace(/meia[\s-]noite e meia/g, '00:30')
    .replace(/meia[\s-]noite/g, '00:00')
    .replace(/\bmeia hora\b/g, '30 min')
    .replace(/\bvinte e cinco\b/g, '25').replace(/\btrinta e cinco\b/g, '35').replace(/\bquarenta e cinco\b/g, '45')
    .replace(NUM_RE, (_, w) => String(NUM[w]))
    .replace(/(\d{1,2})\s*(?:h|horas?)\s*e\s*meia\b/g, '$1h30')
    .replace(/(\d{1,2})\s*e\s*meia\b/g, '$1:30')
    .replace(/(\d{1,2})\s*(?:h|horas?)\s*e\s*(\d{1,2})\s*(?:min\w*)?/g, '$1h$2');
}

// Duração dentro de um trecho, em minutos (null = não falou nenhuma)
function duracao(trecho) {
  // "das 3 às 4", "das 2h30 até as 3h"
  const r = trecho.match(/\bdas?\s+(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*h?\s+(?:as|ate(?: as)?)\s+(\d{1,2})(?:\s*[:h]\s*(\d{2}))?/);
  if (r) { let d = (Number(r[3]) * 60 + Number(r[4] || 0)) - (Number(r[1]) * 60 + Number(r[2] || 0)); if (d <= 0) d += 720; return d; }
  const hm = trecho.match(/(\d{1,2})\s*h(?:oras?)?\s*(\d{1,2})\b/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const h = trecho.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:h|horas?)\b/);
  const m = trecho.match(/(\d{1,3})\s*(?:min\w*|m)\b/);
  if (!h && !m) return null;
  return Math.round((h ? Number(h[1].replace(',', '.')) * 60 : 0) + (m ? Number(m[1]) : 0));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: LER O SONO DA FRASE
// ═══════════════════════════════════════════════════════════════
const COCHILO_RE = /\b(cochil\w*|soneca|sesta|tirei um\w*|dormi (?:de|a|durante a|no) (?:tarde|dia)|durante o dia|de tarde|a tarde)\b/;
const MADRUGADA_RE = /\b(madrugada|acordad[oa]|fiquei acordad\w*|insonia|perdi o sono|sem sono|acordei (?:de|na|no meio)|levantei de noite)\b/;
const NEGA_RE = /\b(nao|sem|nenhum\w*|nada|zero)\b/;
const DORMIR_RE = /\b(dorm\w*|deitei|deitar|fui pra cama|apaguei|peguei no sono|capotei)\b/;

// Hora de dormir dita ("23h30", "11 da noite", "1 da manha", "meia noite") → 'HH:MM'
function horaDeDormir(trecho) {
  const m = trecho.match(/(?:^|\D)(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(?:h(?:oras?)?)?\s*(da noite|da manha|da madrugada|de madrugada|da tarde)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mn = Number(m[2] || 0);
  if (h > 23 || mn > 59) return null;
  const periodo = m[3] || '';
  if (/noite|tarde/.test(periodo) && h < 12) h += 12;
  // Bedtime sem período: 6–11 é da noite ("dormi as 11" = 23h); 0–5 é madrugada
  else if (!periodo && h >= 6 && h <= 11) h += 12;
  if (h === 24) h = 0;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

// Devolve { dormiu: 'HH:MM'|null, cochiloMin: n|null, madrugadaMin: n|null }.
// null = a pessoa não falou daquilo; 0 = falou que não teve.
export function lerSono(texto) {
  const t = normalizar(texto);
  const out = { dormiu: null, cochiloMin: null, madrugadaMin: null };
  // Quebra em trechos: vírgula, ponto, "e", "mas", "depois"
  const trechos = t.split(/[,;.!?]|\s+e\s+|\s+mas\s+|\s+depois\s+/).map(s => s.trim()).filter(Boolean);
  let ultimo = null;   // "cochilei... uns 20 min" — duração no trecho seguinte
  for (const tr of trechos) {
    if (COCHILO_RE.test(tr)) {
      ultimo = 'cochiloMin';
      out.cochiloMin = NEGA_RE.test(tr) ? 0 : (duracao(tr) ?? out.cochiloMin ?? null);
      continue;
    }
    if (MADRUGADA_RE.test(tr)) {
      ultimo = 'madrugadaMin';
      out.madrugadaMin = NEGA_RE.test(tr) && !/\bnao consegui (?:dormir|voltar)/.test(tr) ? 0 : (duracao(tr) ?? out.madrugadaMin ?? null);
      continue;
    }
    // "deitei 22h mas só peguei no sono 23h": a hora que pegou no sono vale mais
    const pegou = /\b(peguei no sono|consegui dormir|apaguei|capotei)\b/.test(tr);
    if ((!out.dormiu || pegou) && (DORMIR_RE.test(tr) || /^\D*\d{1,2}(?:\s*[:h]\s*\d{2})?\s*(?:h|horas?)?\s*(?:da noite|da manha|da madrugada)?\s*$/.test(tr))) {
      const h = horaDeDormir(tr);
      if (h && !/\bmin/.test(tr)) { out.dormiu = h; ultimo = null; continue; }
    }
    // Só a duração ("uns 20 min"): completa o assunto do trecho anterior
    if (ultimo && out[ultimo] == null) { const d = duracao(tr); if (d != null) out[ultimo] = d; }
  }
  for (const k of ['cochiloMin', 'madrugadaMin']) if (out[k] != null) out[k] = Math.max(0, Math.min(360, out[k]));
  return out;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: O QUE FALTA NA NOTA
// ═══════════════════════════════════════════════════════════════
// `dia` = dia do fetchDaysRange (meta no topo: dayNote, sleepTime…)
export function notaDoDia(dia) {
  const n = dia?.dayNote || {};
  const temTexto = !!(String(n.prideFail || '').trim() || String(n.improve || '').trim());
  const temNota = temTexto || !!(n.daySleepHours || n.daySleepMinutes || n.nightWakes || n.nightAwakeHours || n.nightAwakeMinutes);
  return { temNota, temTexto, temSono: !!dia?.sleepTime };
}

// "1h30", "20 min", "nada"
export function fmtMin(min) {
  if (!min) return 'nada';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}
