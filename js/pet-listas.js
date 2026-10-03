// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Caixa de Ferramentas: entende pedidos sobre as listas.
// Só INTERPRETA (sem banco, sem DOM): recebe a árvore que carregarFerramentas()
// devolve e o texto, e diz qual ação, em qual lista e em qual item. Quem grava
// é o assistente-ia.js, sempre depois do card de confirmação.
// BLOCO 1 — NORMALIZAÇÃO
// BLOCO 2 — AÇÃO (o que a pessoa quer fazer)
// BLOCO 3 — ALVO (qual grupo / categoria)
// BLOCO 4 — ITENS (qual item já existente)
// BLOCO 5 — TEXTO NOVO (o que adicionar / pra que trocar)
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NORMALIZAÇÃO
// ═══════════════════════════════════════════════════════════════
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Palavras que não identificam item nenhum ("marca O arroz COMO feito NA lista")
const VAZIAS = new Set(('a o as os um uma uns umas de do da dos das no na nos nas em pra para pro ' +
  'por com e que como meu minha meus minhas teu tua lista listas item itens feito feita check ' +
  'marca marcar marque desmarca desmarcar apaga apagar remove remover tira tirar exclui excluir ' +
  'deleta deletar troca trocar muda mudar edita editar corrige corrigir renomeia renomear ' +
  'adiciona adicionar coloca colocar bota botar poe por inclui incluir anota anotar acrescenta ' +
  'acrescentar add ja nao mais pet falcon favor pfv ai aqui la ok concluido concluida comprei ' +
  'fiz resolvi terminei acabei pronto pronta caixa ferramentas dar hoje agora').split(' '));

function palavras(s) {
  return norm(s).split(' ').filter(p => p && !VAZIAS.has(p));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: AÇÃO
// ═══════════════════════════════════════════════════════════════
// Frase "de lista": fala em lista/check/caixa de ferramentas. Sem isso, só
// entra se nomear uma lista da pessoa E não tiver data/hora (ver acharAlvo):
// "marca academia amanhã às 7" é agenda, não a lista Academia.
export const DICA_LISTA = /\blistas?\b|\bcheck\b|caixa de ferramentas|\bcomo (feit[oa]|conclu[ií]d[oa])\b|\bdesmarc/i;

export function detectarAcao(text) {
  const t = norm(text);
  if (/\b(cria|criar|crie|nova|novo|faz|faca|monta|montar|abre|abrir)\b.*\blista\b/.test(t)) return 'criar';
  if (/\b(desmarca|desmarcar|desmarque|tira o check|tirar o check|volta|voltar|reabre|nao (fiz|comprei|resolvi))\b/.test(t)) return 'desmarcar';
  if (/\b(marca|marcar|marque|da (um )?check|dar (um )?check|check|conclui|concluir|conclua|comprei|fiz|resolvi|terminei|acabei)\b/.test(t)) return 'marcar';
  if (/\b(troca|trocar|muda|mudar|edita|editar|corrige|corrigir|renomeia|renomear|altera|alterar)\b.*\b(por|pra|para)\b/.test(t)) return 'editar';
  if (/\b(apaga|apagar|apague|remove|remover|tira|tirar|exclui|excluir|deleta|deletar)\b/.test(t)) return 'apagar';
  if (/\b(adiciona|adicionar|adicione|coloca|colocar|coloque|bota|botar|poe|inclui|incluir|anota|anotar|acrescenta|acrescentar|add|insere|inserir)\b/.test(t)) return 'adicionar';
  if (/\b(mostra|mostrar|ver|veja|quais|qual|o que tem|que tem|abre|abrir|lista)\b/.test(t)) return 'ver';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ALVO
// ═══════════════════════════════════════════════════════════════
// Procura no texto o nome de uma categoria (seção) e/ou de um grupo. Nomes
// mais longos primeiro ("Treino A" antes de "Treino"). Categoria com o mesmo
// nome em dois grupos ("Lazer" em Pessoal e em Família) volta como ambígua,
// a não ser que o grupo também apareça na frase.
// Devolve { grupo, secao, trechos, candidatos } (grupo/secao podem ser null).
export function acharAlvo(arvore, text) {
  const t = ' ' + norm(text) + ' ';
  const achados = [];
  for (const g of arvore) {
    const ng = norm(g.nome);
    if (ng && t.includes(' ' + ng + ' ')) achados.push({ tipo: 'grupo', g, nome: ng });
    for (const s of g.secoes) {
      const ns = norm(s.nome);
      if (ns && t.includes(' ' + ns + ' ')) achados.push({ tipo: 'secao', g, s, nome: ns });
    }
  }
  const secoes = achados.filter(a => a.tipo === 'secao');
  const grupos = achados.filter(a => a.tipo === 'grupo');
  const trechos = achados.map(a => a.nome);

  if (secoes.length) {
    // Fica com o(s) nome(s) mais longo(s): "treino a" vence "treino"
    const maior = Math.max(...secoes.map(a => a.nome.length));
    let melhores = secoes.filter(a => a.nome.length === maior);
    if (grupos.length) {
      const doGrupo = melhores.filter(a => grupos.some(gr => gr.g === a.g));
      if (doGrupo.length) melhores = doGrupo;
    }
    if (melhores.length === 1) return { grupo: melhores[0].g, secao: melhores[0].s, trechos, candidatos: [] };
    return { grupo: null, secao: null, trechos, candidatos: melhores.map(a => ({ grupo: a.g, secao: a.s })) };
  }
  if (grupos.length) {
    const maior = grupos.sort((a, b) => b.nome.length - a.nome.length)[0];
    return { grupo: maior.g, secao: null, trechos, candidatos: [] };
  }
  return { grupo: null, secao: null, trechos, candidatos: [] };
}

// Todos os itens (com onde estão), opcionalmente só de um grupo/categoria
export function todosItens(arvore, alvo = {}) {
  const out = [];
  for (const g of arvore) {
    if (alvo.grupo && g !== alvo.grupo) continue;
    if (!alvo.secao) for (const it of g.soltos) out.push({ item: it, grupo: g, secao: null });
    for (const s of g.secoes) {
      if (alvo.secao && s !== alvo.secao) continue;
      for (const it of s.itens) out.push({ item: it, grupo: g, secao: s });
    }
  }
  return out;
}

export function ondeTexto(grupo, secao) {
  return secao ? `${grupo.nome} › ${secao.nome}` : grupo.nome;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ITENS
// ═══════════════════════════════════════════════════════════════
// Nota de cada item = palavras da frase que aparecem no texto do item (fora as
// vazias e os nomes de lista). Empate no topo = ambíguo, o Pet pergunta.
// `filtro`: 'pendentes' (pra marcar) | 'feitos' (pra desmarcar) | null.
export function acharItens(arvore, text, alvo = {}, filtro = null) {
  const fora = new Set((alvo.trechos || []).flatMap(n => n.split(' ')));
  const busca = palavras(text).filter(p => !fora.has(p));
  if (!busca.length) return [];
  const lista = todosItens(arvore, alvo).filter(({ item }) =>
    filtro === 'pendentes' ? !item.feito : filtro === 'feitos' ? !!item.feito : true);
  const notas = lista.map(x => {
    const doItem = new Set(norm(x.item.texto).split(' '));
    let nota = 0;
    for (const p of busca) {
      if (doItem.has(p)) nota += 1;
      else if (p.length >= 4 && [...doItem].some(w => w.startsWith(p) || p.startsWith(w) && w.length >= 4)) nota += 0.6;
    }
    // Frase que bate o item inteiro ganha desempate
    if (norm(text).includes(norm(x.item.texto))) nota += 0.5;
    return { ...x, nota };
  }).filter(x => x.nota > 0).sort((a, b) => b.nota - a.nota);
  if (!notas.length) return [];
  const topo = notas[0].nota;
  return notas.filter(x => x.nota >= topo - 0.01);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: TEXTO NOVO
// ═══════════════════════════════════════════════════════════════
const VERBO_ADD = /^(?:(?:pet|falcon)[,\s]+)?(?:por favor\s+|pode\s+)?(?:adiciona\w*|coloca\w*|bota\w*|p[õo]e|inclui\w*|anota\w*|acrescenta\w*|add|insere\w*)\s+(?:a[ií]\s+)?/i;

function tirarAlvo(texto, trechos) {
  let t = ' ' + texto + ' ';
  for (const nome of trechos) {
    // "na lista do mercado", "no mercado", "em casa", "pra academia" (com ou sem acento)
    const nomeRe = nome.split(' ').map(w => w.replace(/[aeiouc]/g, c => `[${c}${ACENTOS[c]}]`)).join('\\s+');
    t = t.replace(new RegExp(`\\s(?:(?:n[ao]s?|em|pr[ao]|para|d[ao]s?)\\s+)?(?:(?:minha\\s+)?lista\\s+(?:d[aoe]s?\\s+)?)?(?:(?:grupo|categoria)\\s+(?:d[aoe]s?\\s+)?)?${nomeRe}(?=[\\s,.!?])`, 'gi'), ' ');
  }
  return t.replace(/\s(?:n[ao]|em|pra|para)\s+(?:minha\s+)?lista(?=[\s,.!?])/gi, ' ').trim();
}
const ACENTOS = { a: 'áàâã', e: 'éê', i: 'í', o: 'óôõ', u: 'ú', c: 'ç' };

function limparPontas(s) {
  return String(s || '').replace(/^[\s,.:;-]+|[\s,.:;!?-]+$/g, '')
    .replace(/\s+(?:por favor|pfv|a[ií])$/i, '').trim();
}

// "adiciona arroz e feijão na lista do mercado" → "arroz e feijão"
export function textoParaAdicionar(text, alvo = {}) {
  let t = String(text || '').replace(VERBO_ADD, '');
  t = tirarAlvo(t, alvo.trechos || []);
  t = t.replace(/^(?:o|a|os|as|um|uma|item)\s+/i, '');
  return limparPontas(t);
}

// "troca arroz por arroz integral" → { antigo: "arroz", novo: "arroz integral" }
export function partesEdicao(text, alvo = {}) {
  const t = tirarAlvo(String(text || ''), alvo.trechos || [])
    .replace(/^(?:(?:pet|falcon)[,\s]+)?(?:troca\w*|muda\w*|edita\w*|corrige\w*|renomeia\w*|altera\w*)\s+(?:o\s+|a\s+)?(?:item\s+)?/i, '');
  const m = t.match(/^(.+?)\s+(?:por|pra|para)\s+(.+)$/i);
  if (!m) return null;
  return { antigo: limparPontas(m[1]), novo: limparPontas(m[2]) };
}

// "cria uma lista de viagem no pessoal" → "Viagem"
export function nomeNovaLista(text, alvo = {}) {
  const m = String(text || '').match(/\blista\s+(?:nova\s+)?(?:(?:d[aoe]s?|chamada|com o nome|pra|para)\s+)?(.+)$/i);
  if (!m) return '';
  // tira o grupo se veio depois ("... de viagem no Pessoal")
  const grupoTrechos = alvo.grupo ? [norm(alvo.grupo.nome)] : [];
  const nome = limparPontas(tirarAlvo(m[1], grupoTrechos));
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : '';
}
