// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Kanban das tarefas do dia (Ferramentas › 📌 Kanban, 26/11).
// Entende: "põe comprar pão no kanban da casa", "move o relatório pra fazendo",
// "terminei o trabalho da faculdade" (vai pra Feito), "o que tem no meu kanban?",
// "quanto tempo levei nas tarefas da faculdade essa semana?", "abre o kanban".
// Só INTERPRETA (sem banco, sem DOM). Quem grava é o assistente-ia.js
// (BLOCO 8.20), sempre depois do card de confirmação.
// BLOCO 1 — NORMALIZAÇÃO E ACHADORES
// BLOCO 2 — PEDIDO
// BLOCO 3 — ITENS DA FRASE
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: NORMALIZAÇÃO E ACHADORES ===
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Coluna citada ('afazer' | 'fazendo' | 'feito' | null)
export function colunaDaFrase(t) {
  if (/\bfazendo\b|\bem andamento\b|\bandamento\b/.test(t)) return 'fazendo';
  if (/\ba fazer\b|\bafazer\b|\bpendentes?\b/.test(t)) return 'afazer';
  if (/\b(feito|feitos|feita|feitas|concluid\w*|pronto|prontos|finalizad\w*)\b/.test(t)) return 'feito';
  return null;
}

// Modalidade pelo nome, sem o emoji ("casa" acha "🏠 Casa")
export function acharModalidade(mods, falado) {
  const a = norm(falado);
  if (!a) return null;
  const n = (m) => norm(m.nome);
  return mods.find(m => n(m) === a) || mods.find(m => n(m).startsWith(a)) || mods.find(m => a.startsWith(n(m)) && n(m).length >= 3)
    || mods.find(m => n(m).includes(a) && a.length >= 3) || null;
}

// Modalidade citada em qualquer lugar da frase ("…da faculdade…")
export function modalidadeNaFrase(mods, texto) {
  const t = ' ' + norm(texto) + ' ';
  return mods.slice().sort((a, b) => norm(b.nome).length - norm(a.nome).length)
    .find(m => { const n = norm(m.nome); return n.length >= 3 && t.includes(' ' + n + ' '); }) || null;
}

// Tarefa pelo título: igual > começa com > contém (sem acento)
export function acharTarefa(tarefas, alvo, estrito = false) {
  const a = norm(alvo);
  if (!a) return null;
  const n = (c) => norm(c.titulo);
  const r = tarefas.find(c => n(c) === a) || tarefas.find(c => n(c).startsWith(a) && a.length >= 4);
  if (r || estrito) return r || null;
  return tarefas.find(c => n(c).includes(a) && a.length >= 4)
    || tarefas.find(c => a.includes(n(c)) && n(c).length >= 4) || null;
}

// === BLOCO 2: PEDIDO ===
const DESTINO_RE = /\b(?:pra|pro|para|para o|na|no|em)\s+(?:o\s+|a\s+)?(?:coluna\s+)?(fazendo|feitos?|a fazer|afazer|conclu\w+|em andamento|andamento)\b/;
// "no kanban da casa", "kanban do trabalho", "kanban pessoal"
const MOD_RE = /\bkanban\s+(?:d[oa]s?\s+|de\s+)?(?!(?:na|no|pra|pro|em)\b)([a-z0-9 ]+?)(?=\s+(?:na|no|pra|pro|para|em)\s+(?:a\s+)?(?:coluna\s+)?(?:fazendo|feitos?|a fazer|afazer|conclu\w*|andamento)\b|$)/;
const VERBO_CRIAR = /\b(poe|pon\w*|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add|acrescent\w*)\b/;
const VERBO_MOVER = /\b(mov\w*|pass\w*|mud\w*|lev\w*|mand\w*|arrast\w*|jog\w*|empurr\w*)\b/;
const VERBO_APAGAR = /\b(apag\w*|exclu\w*|remov\w*|delet\w*)\b/;
const VERBO_COMECEI = /^(?:eu\s+)?(?:ja\s+)?(?:comecei|to fazendo|estou fazendo|tou fazendo|iniciei)\b/;
const VERBO_TERMINEI = /^(?:eu\s+)?(?:ja\s+)?(?:terminei|conclui|finalizei|acabei)\b/;

// { acao: 'abrir'|'ver'|'criar'|'mover'|'apagar'|'tempo', itens, coluna, modalidade, porVerbo } ou null.
// porVerbo = "terminei X"/"comecei X" sem a palavra kanban: o assistente só
// aceita se X bater com uma tarefa do Kanban (senão é outra coisa do app).
export function lerKanban(texto) {
  const t = norm(texto);
  const falaKanban = /\bkanban\b/.test(t);
  const destino = t.match(DESTINO_RE);
  const verboMover = VERBO_MOVER.test(t);
  const terminei = VERBO_TERMINEI.test(t), comecei = VERBO_COMECEI.test(t);
  const tempo = /\bquanto tempo\b|\b(demorei|levei)\b/.test(t) && (falaKanban || /\btarefas?\b/.test(t));
  // Sem a palavra kanban só entra: "move X pra fazendo", "terminei X", "comecei X", "quanto tempo levei nas tarefas"
  const soMover = verboMover && destino && !VERBO_CRIAR.test(t);
  if (!falaKanban && !soMover && !terminei && !comecei && !tempo) return null;

  const modalidade = falaKanban ? ((t.match(MOD_RE) || [])[1] || '').trim() || null : null;
  let acao, coluna = null;
  if (tempo) acao = 'tempo';
  else if (falaKanban && /^(?:me\s+)?(?:abr\w*|mostr\w* a tela)\b/.test(t) && !VERBO_CRIAR.test(t)) acao = 'abrir';
  else if (VERBO_APAGAR.test(t)) acao = 'apagar';
  else if (terminei) { acao = 'mover'; coluna = 'feito'; }
  else if (comecei) { acao = 'mover'; coluna = 'fazendo'; }
  else if (verboMover && (destino || !VERBO_CRIAR.test(t))) { acao = 'mover'; coluna = destino ? colunaDaFrase(destino[0]) : null; }
  else if (VERBO_CRIAR.test(t)) { acao = 'criar'; coluna = destino ? colunaDaFrase(destino[0]) : null; }
  else { acao = 'ver'; coluna = colunaDaFrase(t.replace(/\bkanban\b.*?\b(?:d[oa]s?|de)\s+/, ' ')); }
  const itens = ['ver', 'abrir', 'tempo'].includes(acao) ? [] : itensDaFrase(texto);
  // Sem "kanban" na frase, só vale se o item bater com uma tarefa do Kanban
  // ("marca a academia como feito" é da Home)
  return { acao, itens, coluna, modalidade, porVerbo: !falaKanban };
}

// === BLOCO 3: ITENS DA FRASE ===
// Tira verbo, "no kanban da casa", destino e artigos; separa por vírgula e " e "
export function itensDaFrase(texto) {
  let s = ' ' + String(texto || '').replace(/["“”]/g, ' ').replace(/[.!?]+\s*$/, '') + ' ';
  s = s.replace(/^\s*(?:falcon|pet)[,\s]+/i, ' ');
  s = s.replace(/\s(?:por favor|pra mim|para mim|a[ií])\b/gi, ' ');
  // "no kanban da casa na coluna fazendo" → some tudo
  s = s.replace(/\s(?:n[oa]|d[oa]|pr[oa]|para o|pro meu|no meu|do meu|ao|em)?\s*(?:meu\s+)?kanban\b(?:\s+(?:d[oa]s?|de)\s+[^\s,]+|\s+(?!(?:na|no|pra|pro|para|em|e)\b)[^\s,]+)?(?=\s|$)/gi, ' ');
  s = s.replace(/\s(?:pra|pro|para|para o|na|no|em)\s+(?:o\s+|a\s+)?(?:coluna\s+)?(?:fazendo|feitos?|a fazer|afazer|conclu[ií]d[oa]s?|em andamento|andamento)\b/gi, ' ');
  s = s.replace(/^\s*(?:(?:eu\s+)?(?:quero|preciso|queria)\s+(?:que\s+(?:tu|voc[eê])\s+)?)?(?:me\s+)?(?:eu\s+)?(?:j[aá]\s+)?(?:p[oõ]e|ponha|coloc\w*|bot\w*|adicion\w*|cri\w*|anot\w*|inclu\w*|add|acrescent\w*|mov\w*|pass\w*|mud\w*|lev\w*|mand\w*|arrast\w*|jog\w*|empurr\w*|apag\w*|exclu\w*|remov\w*|delet\w*|terminei|conclu[ií]|finalizei|acabei|comecei|iniciei|(?:to|tou|estou)\s+fazendo)\s+/i, ' ');
  s = s.replace(/^\s*(?:o|a|os|as|um|uma)?\s*(?:cards?|cart[aã]o|cart[oõ]es|tarefas?|itens?|item)\s+(?:de\s+|do\s+|da\s+)?/i, ' ');
  return s.split(/\s*,\s*|\s+e\s+/i)
    .map(x => x.replace(/^[\s:;\-–]+/, '').replace(/^\s*(?:o|a|os|as)\s+/i, '').trim())
    .filter(x => x && x.length <= 200 && norm(x).length > 0);
}

// === BLOCO 4: LISTA COLADA (vários trabalhos de uma vez, Élton 26/11) ===
// Formato (a 1ª linha é "kanban"; cada trabalho vira uma modalidade e cada
// tarefa vai pra coluna escrita na frente, bem separado):
//   kanban
//   Larissa
//   A fazer: tarefa 1; tarefa 2
//   Fazendo: tarefa 3
//   Feito: tarefa 4
//   Alê
//   A fazer:
//   - tarefa 1
//   - tarefa 2
// "Larissa: t1; t2" numa linha só = tudo em A fazer.
// Devolve [{ modalidade, tarefas: [{ titulo, coluna }] }] ou null se não for lista.
const COLUNA_LINHA = /^(a fazer|afazer|pendentes?|fazendo|em andamento|andamento|feito|feitos|conclu[ií]d[oa]s?|pronto|prontos)\s*:?\s*(.*)$/i;
const _colunaDe = (s) => { const t = norm(s); return /fazendo|andamento/.test(t) ? 'fazendo' : /feito|conclu|pronto/.test(t) ? 'feito' : 'afazer'; };
const _limpaLinha = (s) => String(s || '').replace(/^\s*(?:[-–•*·▪◦]|\d+[.)])\s*/, '').replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
const _itens = (s) => String(s || '').split(/\s*;\s*/).map(x => x.replace(/[.;]+$/, '').trim()).filter(Boolean);

export function lerBloco(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2 || !/^kanban\b/i.test(_limpaLinha(linhas[0]).replace(/[:.!]+$/, '').trim())) return null;
  const grupos = []; let atual = null, col = 'afazer';
  const novo = (nome) => {
    const n = nome.replace(/[:.]+$/, '').trim().slice(0, 40);
    atual = grupos.find(g => norm(g.modalidade) === norm(n));
    if (!atual) { atual = { modalidade: n, tarefas: [] }; grupos.push(atual); }
    col = 'afazer';
  };
  const add = (titulo, coluna) => {
    const t = titulo.slice(0, 300);
    if (t && atual && !atual.tarefas.some(x => norm(x.titulo) === norm(t))) atual.tarefas.push({ titulo: t, coluna });
  };
  const resto = _limpaLinha(linhas[0]).replace(/^kanban\b[:\s]*/i, '').trim();
  const corpo = resto ? [resto, ...linhas.slice(1)] : linhas.slice(1);
  for (const bruta of corpo) {
    const marcador = /^\s*(?:[-–•*·▪◦]|\d+[.)])\s+/.test(bruta);
    const l = _limpaLinha(bruta);
    if (!l) continue;
    const c = l.match(COLUNA_LINHA);
    if (c && atual) { col = _colunaDe(c[1]); _itens(c[2]).forEach(x => add(x, col)); continue; }
    if (marcador && atual) { _itens(l).forEach(x => add(x, col)); continue; }
    // "Larissa: t1; t2" (trabalho e tarefas na mesma linha)
    const m = l.match(/^([^:]{1,40}):\s*(.+)$/);
    if (m) { novo(m[1]); _itens(m[2]).forEach(x => add(x, 'afazer')); continue; }
    if (l.length <= 40 && !/[;]/.test(l)) { novo(l); continue; }
    if (atual) _itens(l).forEach(x => add(x, col));
  }
  const ok = grupos.filter(g => g.modalidade);
  return ok.length ? ok : null;
}

// === BLOCO 5: MODALIDADES PELO PET ===
// "cria a modalidade Treino", "renomeia a modalidade Casa pra Lar",
// "muda a cor da Faculdade pra rosa", "apaga a modalidade Pessoal".
// Devolve { acao: 'criar'|'renomear'|'cor'|'apagar', nome, novo, cor } ou null.
const CORES_FALADAS = { azul: 'azul', roxo: 'roxo', roxa: 'roxo', lilas: 'roxo', verde: 'verde', laranja: 'laranja', rosa: 'rosa', pink: 'rosa', vermelho: 'vermelho', vermelha: 'vermelho', ciano: 'ciano', turquesa: 'ciano', 'azul claro': 'ciano', amarelo: 'amarelo', amarela: 'amarelo' };
export function corFalada(t) {
  const n = norm(t);
  const k = Object.keys(CORES_FALADAS).sort((a, b) => b.length - a.length).find(c => new RegExp(`\\b${c}\\b`).test(n));
  return k ? CORES_FALADAS[k] : null;
}
export function lerModalidadeCmd(texto) {
  const bruto = String(texto || '').trim().replace(/[.!?]+$/, '');
  const t = norm(bruto);
  if (!/\bmodalidades?\b/.test(t) && !/\bcor d[aoe]s?\b.*\bkanban\b|\bkanban\b.*\bcor\b/.test(t)) return null;
  if (/^(?:quais|que|me mostr\w*|mostr\w*|lista\w*|ver)\b.*\bmodalidades\b/.test(t)) return { acao: 'listar' };
  const nomeApos = (re) => { const m = bruto.match(re); return m ? m[1].trim().replace(/^["“]|["”]$/g, '') : ''; };
  if (/\b(cri\w*|nova|adicion\w*|add)\b/.test(t) && !/\b(mud\w*|troc\w*|renome\w*|apag\w*)\b/.test(t)) {
    const nome = nomeApos(/modalidade\s+(?:nova\s+)?(?:d[aeo]s?\s+|chamada\s+)?(.+?)(?:\s+(?:na|com a|de)\s+cor\s+.+)?$/i);
    return nome ? { acao: 'criar', nome: nome.slice(0, 40), cor: corFalada(bruto.replace(/^.*\bcor\b/i, '')) } : { acao: 'criar', nome: '' };
  }
  if (/\b(apag\w*|exclu\w*|remov\w*|delet\w*|tir\w*)\b/.test(t)) {
    return { acao: 'apagar', nome: nomeApos(/modalidade\s+(?:d[aeo]s?\s+)?(.+)$/i) };
  }
  if (/\bcor\b/.test(t)) {
    const m = bruto.match(/\bcor\s+(?:d[aeo]s?\s+)?(?:modalidade\s+)?(.+?)\s+(?:pra|para|pro|em|de)\s+(.+)$/i);
    return m ? { acao: 'cor', nome: m[1].replace(/\s+no kanban$/i, '').trim(), cor: corFalada(m[2]), corFalada: m[2].trim() } : null;
  }
  if (/\b(renome\w*|muda\w* o nome|troca\w* o nome|nome)\b/.test(t)) {
    const m = bruto.match(/modalidade\s+(?:d[aeo]s?\s+)?(.+?)\s+(?:pra|para|por)\s+(.+)$/i);
    return m ? { acao: 'renomear', nome: m[1].trim(), novo: m[2].trim().slice(0, 40) } : null;
  }
  return null;
}
