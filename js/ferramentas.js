// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + GRUPOS PADRÃO
// BLOCO 2 — LEITURA (itens + seções + grupos custom)
// BLOCO 3 — ITENS
// BLOCO 4 — SEÇÕES
// BLOCO 5 — GRUPOS
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + GRUPOS PADRÃO
// ═══════════════════════════════════════════════════════════════
// Caixa de Ferramentas: listas de recados por contexto, sem data nem hora.
// Dentro de um grupo dá pra criar SEÇÕES (títulos, ex.: Cozinha) e cada uma tem
// sua lista de checkbox. Camada de dados. À parte de tudo — não toca Ritual.
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

// Grupos sugeridos (ficam no código; aparecem mesmo vazios). Cor pinta o ícone
// num círculo — "Pessoal" em azul, a pedido. Custom entram na tabela.
// "Pessoal" usa SVG (não emoji): o emoji 👤 é um glifo cinza que ignora a cor
// CSS e ficava tosco. O SVG pega a cor do círculo e fica azul de verdade.
const SVG_PESSOA = '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/>';
export const GRUPOS_PADRAO = [
  { nome: 'Casa',     icone: '🏠',       cor: '#2dd4bf' },
  { nome: 'Pessoal',  icone: '👤', svg: SVG_PESSOA, cor: '#3b82f6' },
  { nome: 'Trabalho', icone: '💼',       cor: '#f59e0b' },
  { nome: 'Família',  icone: '👨‍👩‍👧', cor: '#ec4899' },
  { nome: 'Amigos',   icone: '🤝',       cor: '#a78bfa' },
  { nome: 'Academia', icone: '🏋️',      cor: '#ef4444' },
];
// Categorias que já vêm prontas em cada grupo padrão (a pessoa pode remover ou
// criar mais; o GRUPO em si não se apaga). Semeadas 1x por conta.
const CATEGORIAS_PADRAO = {
  'Casa':     ['Reforma', 'Mercado', 'Limpeza'],
  'Pessoal':  ['Alimentação', 'Lazer', 'Saúde'],
  'Trabalho': ['Reuniões', 'Projetos', 'Prazos'],
  'Família':  ['Lazer', 'Compromissos', 'Compras'],
  'Amigos':   ['Rolês', 'Aniversários', 'Combinar'],
  'Academia': ['Treino A', 'Treino B', 'Cardio'],
};
const CORES_CUSTOM = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#c084fc', '#38bdf8', '#fb7185'];
function _corCustom(nome) {
  let h = 0; const s = String(nome || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CORES_CUSTOM[h % CORES_CUSTOM.length];
}

// Grupos que nascem pelas ⭐ Prioridades (ver adicionarPrioridade)
const _ICONE_PRIO = { 'Atividades': '🔥', 'Realizar e Comprar': '🛒' };

function _uid() { return auth.currentUser?.uid || null; }
function _falha(e) { if (e) throw new Error(e.message || 'Erro na caixa de ferramentas'); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: LEITURA
// ═══════════════════════════════════════════════════════════════
// Traz itens + seções + grupos custom de uma vez e monta a árvore no cliente.
// Cada grupo devolve { nome, icone, cor, custom, soltos:[...], secoes:[{id,nome,itens}] }.
export async function carregarFerramentas() {
  const [ri, rs, rg] = await Promise.all([
    _lerItens(),
    supabase.from('ferramentas_secoes').select('id, grupo, nome, ord').order('ord', { ascending: true }),
    supabase.from('ferramentas_grupos').select('id, nome, icone, ord').order('ord', { ascending: true }),
  ]);
  _falha(ri.error); _falha(rs.error); _falha(rg.error);
  const itens = ri.data || [], secoes = rs.data || [], gruposCustom = rg.data || [];

  // Semeia as categorias padrão 1x por conta (idempotente: só cria as que ainda
  // não existem, então apagar uma não a faz voltar no mesmo aparelho).
  if (!localStorage.getItem('falcon_ferr_seed')) {
    try {
      const novas = await _semearCategorias(secoes);
      if (novas.length) secoes.push(...novas);
      localStorage.setItem('falcon_ferr_seed', '1');
    } catch (e) { console.warn('[ferramentas] seed:', e?.message || e); }
  }

  const porGrupo = new Map();
  const novoGrupo = (nome, icone, cor, custom, grupoId, svg) =>
    ({ nome, icone, svg: svg || null, cor, custom: !!custom, grupoId: grupoId || null, soltos: [], secoes: [] });

  for (const g of GRUPOS_PADRAO) porGrupo.set(g.nome, novoGrupo(g.nome, g.icone, g.cor, false, null, g.svg));
  for (const g of gruposCustom) if (!porGrupo.has(g.nome)) porGrupo.set(g.nome, novoGrupo(g.nome, g.icone || '📌', _corCustom(g.nome), true, g.id));

  // seções por grupo (com um índice id->objeto pra pendurar os itens)
  const secaoPorId = new Map();
  for (const s of secoes) {
    if (!porGrupo.has(s.grupo)) porGrupo.set(s.grupo, novoGrupo(s.grupo, '📌', _corCustom(s.grupo), true));
    const obj = { id: s.id, nome: s.nome, itens: [] };
    secaoPorId.set(s.id, obj);
    porGrupo.get(s.grupo).secoes.push(obj);
  }

  for (const it of itens) {
    if (!porGrupo.has(it.grupo)) porGrupo.set(it.grupo, novoGrupo(it.grupo, _ICONE_PRIO[it.grupo] || '📌', _corCustom(it.grupo), true));
    if (it.secao_id && secaoPorId.has(it.secao_id)) secaoPorId.get(it.secao_id).itens.push(it);
    else porGrupo.get(it.grupo).soltos.push(it);
  }
  return [...porGrupo.values()];
}

// Itens com a coluna da ⭐ (prioridade). Antes do SQL dela rodar, lê sem.
let _semPrioridade = false;
async function _lerItens() {
  const base = 'id, grupo, texto, feito, ord, secao_id';
  if (!_semPrioridade) {
    const r = await supabase.from('ferramentas_itens').select(base + ', prioridade').order('ord', { ascending: true });
    if (!r.error || !/prioridade/i.test(r.error.message || '')) return r;
    _semPrioridade = true;
  }
  return supabase.from('ferramentas_itens').select(base).order('ord', { ascending: true });
}
export const prioridadePronta = () => !_semPrioridade;

// Insere as categorias padrão que ainda não existem pra este usuário.
async function _semearCategorias(secoesExistentes) {
  const existe = new Set((secoesExistentes || []).map(s => s.grupo + '|' + (s.nome || '').toLowerCase()));
  const novas = [];
  for (const [grupo, cats] of Object.entries(CATEGORIAS_PADRAO)) {
    cats.forEach((nome, i) => {
      if (!existe.has(grupo + '|' + nome.toLowerCase())) novas.push({ user_id: _uid(), grupo, nome, ord: i });
    });
  }
  if (!novas.length) return [];
  const { data, error } = await supabase.from('ferramentas_secoes').insert(novas).select('id, grupo, nome, ord');
  if (error) throw error;
  return data || [];
}

// Nº de pendentes (badge do card na Home) — sem baixar tudo.
export async function contarPendentes() {
  const { count, error } = await supabase
    .from('ferramentas_itens').select('id', { count: 'exact', head: true }).eq('feito', false);
  if (error) { console.warn('[ferramentas] contar:', error.message); return 0; }
  return count || 0;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ITENS
// ═══════════════════════════════════════════════════════════════
export async function adicionarItem(grupo, texto, secaoId = null) {
  const t = (texto || '').trim();
  if (!t) return null;
  const { data, error } = await supabase
    .from('ferramentas_itens')
    // ord negativo e cada vez menor: o item novo entra em PRIMEIRO na lista
    .insert({ user_id: _uid(), grupo, texto: t.slice(0, 500), secao_id: secaoId, ord: -Date.now() })
    .select('id, grupo, texto, feito, ord, secao_id')
    .single();
  _falha(error);
  return data;
}

export async function marcarItem(id, feito) {
  const { error } = await supabase.from('ferramentas_itens').update({ feito: !!feito }).eq('id', id);
  _falha(error);
}

export async function editarItem(id, texto) {
  const t = (texto || '').trim();
  if (!t) return;
  const { error } = await supabase.from('ferramentas_itens').update({ texto: t.slice(0, 500) }).eq('id', id);
  _falha(error);
}

export async function apagarItem(id) {
  const { error } = await supabase.from('ferramentas_itens').delete().eq('id', id);
  _falha(error);
}

// Nova ordem (arrastar na tela): grava a posição de cada item da lista
export async function reordenarItens(ids) {
  const r = await Promise.all((ids || []).map((id, i) =>
    supabase.from('ferramentas_itens').update({ ord: i }).eq('id', id)));
  _falha(r.find(x => x.error)?.error);
}

// ⭐ Prioridade: liga entra no fim da lista de prioridades; desliga = null
export async function marcarPrioridade(id, ligar) {
  if (_semPrioridade) throw new Error('As prioridades ainda não foram ligadas no banco (falta rodar o SQL).');
  const { error } = await supabase.from('ferramentas_itens').update({ prioridade: ligar ? Date.now() : null }).eq('id', id);
  _falha(error);
}
// Nova ordem do card Prioridades (arrastar)
export async function reordenarPrioridades(ids) {
  const r = await Promise.all((ids || []).map((id, i) =>
    supabase.from('ferramentas_itens').update({ prioridade: i }).eq('id', id)));
  _falha(r.find(x => x.error)?.error);
}

// ⭐ Prioridades em duas listas (Élton, 26/10): o que vai FAZER com o tempo
// (vira atividade no Ritual) e o que vai fazer ou comprar (tem R$). O tipo é o
// grupo do item: quem está em "Atividades" é atividade; o resto é fazer/comprar.
export const GRUPO_PRIO_ATIV = 'Atividades';
export const GRUPO_PRIO_COMPRA = 'Realizar e Comprar';
export const ehPrioAtividade = (item) => item?.grupo === GRUPO_PRIO_ATIV;

// Escreve direto numa das listas de Prioridades: o item nasce com a ⭐
export async function adicionarPrioridade(texto, atividade) {
  const novo = await adicionarItem(atividade ? GRUPO_PRIO_ATIV : GRUPO_PRIO_COMPRA, texto);
  if (!novo) return null;
  await marcarPrioridade(novo.id, true);
  return novo;
}
// Passa o item de uma lista pra outra (sai da categoria em que estava)
export async function moverPrioridade(id, atividade) {
  const { error } = await supabase.from('ferramentas_itens')
    .update({ grupo: atividade ? GRUPO_PRIO_ATIV : GRUPO_PRIO_COMPRA, secao_id: null }).eq('id', id);
  _falha(error);
}

// Preço escrito no item: "Leite R$ 6", "arroz 25,90 reais", "2x R$ 4,50" (= 9).
// Devolve o valor em reais ou null (sem preço).
export function valorDoItem(texto) {
  const t = String(texto || '');
  const num = (s) => Number(s.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  let m = t.match(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!m) m = t.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|pila)\b/i);
  if (!m) return null;
  const v = num(m[1]);
  if (!isFinite(v) || v <= 0) return null;
  const q = t.slice(0, m.index).match(/(\d{1,3})\s*x\s*$/i);
  return Math.round(v * (q ? Number(q[1]) : 1) * 100) / 100;
}
export const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Limpa os CONCLUÍDOS de um grupo inteiro (soltos + de todas as seções).
export async function limparFeitos(grupo) {
  const { error } = await supabase.from('ferramentas_itens').delete().eq('grupo', grupo).eq('feito', true);
  _falha(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: SEÇÕES
// ═══════════════════════════════════════════════════════════════
export async function adicionarSecao(grupo, nome) {
  const n = (nome || '').trim();
  if (!n) return null;
  const { data, error } = await supabase
    .from('ferramentas_secoes')
    .insert({ user_id: _uid(), grupo, nome: n.slice(0, 60), ord: Date.now() })
    .select('id, grupo, nome, ord')
    .single();
  _falha(error);
  return data;
}

export async function renomearSecao(id, nome) {
  const n = (nome || '').trim();
  if (!n) return;
  const { error } = await supabase.from('ferramentas_secoes').update({ nome: n.slice(0, 60) }).eq('id', id);
  _falha(error);
}

// Apaga a seção; os itens dela vão junto (cascade no banco).
export async function apagarSecao(id) {
  const { error } = await supabase.from('ferramentas_secoes').delete().eq('id', id);
  _falha(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: GRUPOS
// ═══════════════════════════════════════════════════════════════
export async function criarGrupo(nome, icone = '📌') {
  const n = (nome || '').trim();
  if (!n) return null;
  const { data, error } = await supabase
    .from('ferramentas_grupos')
    .insert({ user_id: _uid(), nome: n.slice(0, 40), icone, ord: Date.now() })
    .select('id, nome, icone, ord')
    .single();
  _falha(error);
  return data;
}

// Só grupos custom têm id; padrão não se apaga. Apaga o grupo e, junto, seus
// itens e seções (limpeza explícita porque não há FK do grupo pro item).
export async function apagarGrupo(grupoId, nome) {
  if (!grupoId) return;
  await supabase.from('ferramentas_itens').delete().eq('grupo', nome);
  await supabase.from('ferramentas_secoes').delete().eq('grupo', nome);
  const { error } = await supabase.from('ferramentas_grupos').delete().eq('id', grupoId);
  _falha(error);
}

// Renomeia o grupo inteiro (itens + seções + registro do grupo) num passo.
export async function renomearGrupo(de, para) {
  const p = (para || '').trim();
  if (!p || p === de) return;
  const { error } = await supabase.rpc('ferramentas_renomear_grupo', { de, para: p });
  _falha(error);
}
