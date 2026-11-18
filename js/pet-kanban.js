// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Kanban pessoal: entende "põe X no kanban", "move X pra fazendo",
// "apaga X do kanban", "o que tem no meu kanban?".
// Só INTERPRETA (sem banco, sem DOM). Quem grava é o assistente-ia.js
// (BLOCO 8.20), sempre depois do card de confirmação.
// BLOCO 1 — NORMALIZAÇÃO
// BLOCO 2 — PEDIDO
// BLOCO 3 — ACHAR O CARD
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: NORMALIZAÇÃO ===
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Coluna citada na frase ('afazer' | 'fazendo' | 'feito' | null)
export function colunaDaFrase(t) {
  if (/\bfazendo\b|\bem andamento\b/.test(t)) return 'fazendo';
  if (/\ba fazer\b|\bafazer\b|\bto do\b|\btodo\b/.test(t)) return 'afazer';
  if (/\b(feito|feitos|concluid\w*|pronto|prontos)\b/.test(t)) return 'feito';
  return null;
}

// === BLOCO 2: PEDIDO ===
const DESTINO_RE = /\b(?:pra|pro|para|para o|pra coluna|na coluna|no|na|em)\s+(?:o\s+|a\s+)?(?:coluna\s+)?(fazendo|feito|feitos|a fazer|afazer|concluido|em andamento)\b/;

// { acao: 'ver'|'criar'|'mover'|'apagar', itens: [texto], coluna } ou null.
export function lerKanban(texto) {
  const t = norm(texto);
  const falaKanban = /\bkanban\b/.test(t) || (/\bcards?\b/.test(t) && !/\bcartao do dia\b/.test(t));
  const destino = t.match(DESTINO_RE) || t.match(/\bkanban\s+(?:na\s+|no\s+|em\s+)?(?:coluna\s+)?(fazendo|feito|a fazer)\b/);
  const verboMover = /\b(mov\w*|pass\w*|mud\w*|lev\w*|mand\w*|arrast\w*|jog\w*|empurr\w*)\b/.test(t);
  // Sem a palavra kanban, só entra "move X pra fazendo" (coluna dita com verbo de mover)
  if (!falaKanban && !(verboMover && destino && /fazendo|a fazer|afazer|andamento/.test(destino[1]) || verboMover && destino && /\bcoluna\b/.test(t))) return null;

  let acao;
  if (/\b(apag\w*|exclu\w*|remov\w*|tir\w*|delet\w*)\b/.test(t)) acao = 'apagar';
  else if (verboMover && (destino || !/\b(poe|pon\w*|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add)\b/.test(t))) acao = 'mover';
  else if (/\b(poe|pon\w*|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add|acrescent\w*)\b/.test(t)) acao = 'criar';
  else acao = 'ver';

  const coluna = destino ? colunaDaFrase(destino[0]) : (acao === 'ver' ? colunaDaFrase(t) : null);
  const itens = acao === 'ver' ? [] : itensDaFrase(texto);
  if (acao !== 'ver' && !itens.length && acao !== 'criar') return { acao, itens, coluna };
  return { acao, itens, coluna: coluna || (acao === 'criar' ? 'afazer' : null) };
}

// Tira verbo, "no kanban", destino e artigos; separa por vírgula e " e "
export function itensDaFrase(texto) {
  let s = ' ' + String(texto || '').replace(/["“”]/g, ' ').replace(/[.!?]+\s*$/, '') + ' ';
  s = s.replace(/^\s*(?:falcon|pet)[,\s]+/i, ' ');
  s = s.replace(/\s(?:por favor|pra mim|para mim|a[ií])\b/gi, ' ');
  s = s.replace(/(kanban)\s+(?:n[oa]\s+|em\s+)?(?:coluna\s+)?(?:fazendo|feitos?|a fazer)\b/gi, '$1');
  s = s.replace(/\s(?:n[oa]|d[oa]|pr[oa]|para o|pro meu|no meu|do meu|ao)\s+(?:meu\s+)?kanban(?:\s+pessoal)?\b/gi, ' ');
  s = s.replace(/\skanban\b/gi, ' ');
  s = s.replace(/\s(?:pra|pro|para|para o|na|no|em)\s+(?:o\s+|a\s+)?(?:coluna\s+)?(?:fazendo|feitos?|a fazer|afazer|conclu[ií]do|em andamento)\b/gi, ' ');
  s = s.replace(/^\s*(?:(?:eu\s+)?(?:quero|preciso|queria)\s+(?:que\s+(?:tu|voc[eê])\s+)?)?(?:me\s+)?(?:p[oõ]e|ponha|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add|acrescent\w*|mov\w*|pass\w*|mud\w*|lev\w*|mand\w*|arrast\w*|jog\w*|empurr\w*|apag\w*|exclu\w*|remov\w*|tir\w*|delet\w*)\s+/i, ' ');
  s = s.replace(/^\s*(?:o|a|os|as|um|uma)?\s*(?:cards?|cart[aã]o|cart[oõ]es|tarefas?|itens?|item)\s+(?:de\s+|do\s+|da\s+)?/i, ' ');
  return s.split(/\s*,\s*|\s+e\s+/i)
    .map(x => x.replace(/^[\s:;\-–]+/, '').replace(/^\s*(?:o|a|os|as)\s+/i, '').trim())
    .filter(x => x && x.length <= 200 && norm(x).length > 0);
}

// === BLOCO 3: ACHAR O CARD ===
// Igual > começa com > contém (sem acento)
export function acharCard(cards, alvo) {
  const a = norm(alvo);
  if (!a) return null;
  return cards.find(c => norm(c.titulo) === a)
    || cards.find(c => norm(c.titulo).startsWith(a))
    || cards.find(c => norm(c.titulo).includes(a))
    || cards.find(c => a.includes(norm(c.titulo)) && norm(c.titulo).length >= 3)
    || null;
}
