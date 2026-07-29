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
export const GRUPOS_PADRAO = [
  { nome: 'Casa',     icone: '🏠',       cor: '#2dd4bf' },
  { nome: 'Pessoal',  icone: '👤',       cor: '#3b82f6' },
  { nome: 'Trabalho', icone: '💼',       cor: '#f59e0b' },
  { nome: 'Família',  icone: '👨‍👩‍👧', cor: '#ec4899' },
  { nome: 'Amigos',   icone: '🤝',       cor: '#a78bfa' },
  { nome: 'Academia', icone: '🏋️',      cor: '#ef4444' },
];
const CORES_CUSTOM = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#c084fc', '#38bdf8', '#fb7185'];
function _corCustom(nome) {
  let h = 0; const s = String(nome || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CORES_CUSTOM[h % CORES_CUSTOM.length];
}

function _uid() { return auth.currentUser?.uid || null; }
function _falha(e) { if (e) throw new Error(e.message || 'Erro na caixa de ferramentas'); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: LEITURA
// ═══════════════════════════════════════════════════════════════
// Traz itens + seções + grupos custom de uma vez e monta a árvore no cliente.
// Cada grupo devolve { nome, icone, cor, custom, soltos:[...], secoes:[{id,nome,itens}] }.
export async function carregarFerramentas() {
  const [ri, rs, rg] = await Promise.all([
    supabase.from('ferramentas_itens').select('id, grupo, texto, feito, ord, secao_id').order('ord', { ascending: true }),
    supabase.from('ferramentas_secoes').select('id, grupo, nome, ord').order('ord', { ascending: true }),
    supabase.from('ferramentas_grupos').select('id, nome, icone, ord').order('ord', { ascending: true }),
  ]);
  _falha(ri.error); _falha(rs.error); _falha(rg.error);
  const itens = ri.data || [], secoes = rs.data || [], gruposCustom = rg.data || [];

  const porGrupo = new Map();
  const novoGrupo = (nome, icone, cor, custom, grupoId) =>
    ({ nome, icone, cor, custom: !!custom, grupoId: grupoId || null, soltos: [], secoes: [] });

  for (const g of GRUPOS_PADRAO) porGrupo.set(g.nome, novoGrupo(g.nome, g.icone, g.cor, false));
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
    if (!porGrupo.has(it.grupo)) porGrupo.set(it.grupo, novoGrupo(it.grupo, '📌', _corCustom(it.grupo), true));
    if (it.secao_id && secaoPorId.has(it.secao_id)) secaoPorId.get(it.secao_id).itens.push(it);
    else porGrupo.get(it.grupo).soltos.push(it);
  }
  return [...porGrupo.values()];
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
    .insert({ user_id: _uid(), grupo, texto: t.slice(0, 500), secao_id: secaoId, ord: Date.now() })
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
