// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Kanban (formato Trello: quadros → listas → cards): entende
// "põe X no kanban", "põe X no quadro Casa", "move X pra fazendo",
// "passa X pra lista Revisão", "arquiva X do kanban", "o que tem no meu kanban?".
// "apagar" vira ARQUIVAR (dá pra restaurar no ⋮ do quadro).
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

// Lista do quadro que corresponde ao que a pessoa disse: nome igual/parecido
// ou o apelido ("fazendo" = Em andamento, "feito" = Concluído)
const APELIDO = { afazer: /\b(a fazer|afazer|to do|todo|pendente\w*|backlog)\b/, fazendo: /\b(andamento|fazendo|doing|progresso)\b/, feito: /\b(conclu\w*|feito\w*|pronto\w*|done|finalizad\w*)\b/ };
export function acharLista(listas, falado) {
  const a = norm(falado);
  if (!a) return null;
  const porNome = listas.find(l => norm(l.nome) === a) || listas.find(l => norm(l.nome).startsWith(a)) || listas.find(l => norm(l.nome).includes(a) && a.length >= 3);
  if (porNome) return porNome;
  const k = colunaDaFrase(a);
  return k ? listas.find(l => APELIDO[k].test(norm(l.nome))) || null : null;
}

// Quadro pelo nome (igual > começa > contém)
export function acharQuadro(quadros, falado) {
  const a = norm(falado);
  if (!a) return null;
  return quadros.find(q => norm(q.nome) === a) || quadros.find(q => norm(q.nome).startsWith(a))
    || quadros.find(q => norm(q.nome).includes(a)) || quadros.find(q => a.includes(norm(q.nome)) && norm(q.nome).length >= 3) || null;
}

// === BLOCO 2: PEDIDO ===
const DESTINO_RE = /\b(?:pra|pro|para|para o|pra coluna|na coluna|no|na|em)\s+(?:o\s+|a\s+)?(?:coluna\s+)?(fazendo|feito|feitos|a fazer|afazer|concluido|em andamento)\b/;

const LISTA_RE = /\b(?:pra|pro|para|na|no|em)\s+(?:a\s+)?lista\s+(.+?)(?=\s+(?:d[oa]|n[oa])\s+(?:quadro|kanban)\b|$)/;
const QUADRO_RE = /\b(?:n[oa]|d[oa]|pr[oa]|para o|em)\s+(?:meu\s+)?quadro\s+(?:d[oa]s?\s+|de\s+)?(.+?)(?=\s+(?:na|no|pra|pro|em)\s+(?:a\s+)?(?:lista|coluna)\b|\s+(?:pra|pro|para|na|no|em)\s+(?:fazendo|feitos?|a fazer|afazer|conclu\w*|em andamento)\b|$)/;

// { acao: 'ver'|'criar'|'mover'|'apagar', itens, coluna, lista, quadro (área), quadroNome } ou null.
export function lerKanban(texto) {
  const t = norm(texto);
  const falaKanban = /\bkanban\b/.test(t) || (/\bcards?\b/.test(t) && !/\bcartao do dia\b/.test(t)) || QUADRO_RE.test(t);
  const destino = t.match(DESTINO_RE) || t.match(/\bkanban\s+(?:(?:pessoal|profissional|do trabalho|de trabalho|da empresa)\s+)?(?:na\s+|no\s+|em\s+)?(?:coluna\s+)?(fazendo|feito|a fazer)\b/);
  const verboMover = /\b(mov\w*|pass\w*|mud\w*|lev\w*|mand\w*|arrast\w*|jog\w*|empurr\w*)\b/.test(t);
  // Sem a palavra kanban/card/quadro, só entra "move X pra fazendo" ou "pra coluna/lista X"
  const soMover = verboMover && (destino && /fazendo|a fazer|afazer|andamento/.test(destino[1]) || destino && /\bcoluna\b/.test(t));
  if (!falaKanban && !soMover) return null;

  let acao;
  if (/\b(apag\w*|exclu\w*|remov\w*|tir\w*|delet\w*|arquiv\w*)\b/.test(t)) acao = 'apagar';
  else if (verboMover && (destino || !/\b(poe|pon\w*|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add)\b/.test(t))) acao = 'mover';
  else if (/\b(poe|pon\w*|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add|acrescent\w*)\b/.test(t)) acao = 'criar';
  else acao = 'ver';

  // Quadro: "kanban profissional", "kanban do trabalho" (null = não disse)
  const quadro = /\bkanban\s+(?:profissional|do trabalho|de trabalho|da empresa)\b|\b(?:profissional|trabalho)\b.*\bkanban\b/.test(t) ? 'profissional'
    : (/\bkanban\s+pessoal\b/.test(t) ? 'pessoal' : null);
  const lista = (t.match(LISTA_RE) || [])[1] || null;
  const quadroNome = (t.match(QUADRO_RE) || [])[1]?.trim() || null;
  const coluna = destino ? colunaDaFrase(destino[0]) : (acao === 'ver' ? colunaDaFrase(t) : null);
  const itens = acao === 'ver' ? [] : itensDaFrase(texto);
  return { acao, itens, coluna, lista, quadro, quadroNome };
}

// Tira verbo, "no kanban", destino e artigos; separa por vírgula e " e "
export function itensDaFrase(texto) {
  let s = ' ' + String(texto || '').replace(/["“”]/g, ' ').replace(/[.!?]+\s*$/, '') + ' ';
  s = s.replace(/^\s*(?:falcon|pet)[,\s]+/i, ' ');
  s = s.replace(/\s(?:por favor|pra mim|para mim|a[ií])\b/gi, ' ');
  s = s.replace(/(kanban)\s+(?:pessoal|profissional|do trabalho|de trabalho|da empresa)\b/gi, '$1');
  s = s.replace(/(kanban)\s+(?:n[oa]\s+|em\s+)?(?:coluna\s+)?(?:fazendo|feitos?|a fazer)\b/gi, '$1');
  s = s.replace(/\s(?:n[oa]|d[oa]|pr[oa]|para o|pro meu|no meu|do meu|ao)\s+(?:meu\s+)?kanban(?:\s+(?:pessoal|profissional|do trabalho|de trabalho|da empresa))?\b/gi, ' ');
  s = s.replace(/\s(?:n[oa]|d[oa]|pr[oa]|para o|em)\s+(?:meu\s+)?quadro\s+(?:d[oa]s?\s+|de\s+)?.+?(?=\s(?:na|no|pra|pro|em)\s+(?:a\s+)?(?:lista|coluna)\b|\s(?:pra|pro|para|na|no|em)\s+(?:fazendo|feitos?|a fazer|afazer|conclu\S*|em andamento)\b|$)/gi, ' ');
  s = s.replace(/\s(?:pra|pro|para|na|no|em)\s+(?:a\s+)?lista\s+.+$/gi, ' ');
  s = s.replace(/\skanban\b/gi, ' ');
  s = s.replace(/\s(?:pra|pro|para|para o|na|no|em)\s+(?:o\s+|a\s+)?(?:coluna\s+)?(?:fazendo|feitos?|a fazer|afazer|conclu[ií]do|em andamento)\b/gi, ' ');
  s = s.replace(/^\s*(?:(?:eu\s+)?(?:quero|preciso|queria)\s+(?:que\s+(?:tu|voc[eê])\s+)?)?(?:me\s+)?(?:p[oõ]e|ponha|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add|acrescent\w*|mov\w*|pass\w*|mud\w*|lev\w*|mand\w*|arrast\w*|jog\w*|empurr\w*|apag\w*|exclu\w*|remov\w*|tir\w*|delet\w*|arquiv\w*)\s+/i, ' ');
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
