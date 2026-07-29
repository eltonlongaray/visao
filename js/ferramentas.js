// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + GRUPOS PADRÃO
// BLOCO 2 — LEITURA
// BLOCO 3 — ESCRITA
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + GRUPOS PADRÃO
// ═══════════════════════════════════════════════════════════════
// Caixa de Ferramentas: listas de recados por contexto, sem data nem hora.
// Camada de dados. À parte de tudo — não toca Ritual, Desempenho nem objetivos.
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

// Grupos sugeridos. Aparecem mesmo vazios (pra pessoa saber onde botar as
// coisas) e são editáveis. "Pessoal" no lugar de "mim", que soava estranho
// como rótulo.
export const GRUPOS_PADRAO = [
  { nome: 'Casa',     icone: '🏠' },
  { nome: 'Pessoal',  icone: '👤' },
  { nome: 'Trabalho', icone: '💼' },
  { nome: 'Família',  icone: '👨‍👩‍👧' },
  { nome: 'Amigos',   icone: '🤝' },
];

function _uid() { return auth.currentUser?.uid || null; }
function _falha(e) { if (e) throw new Error(e.message || 'Erro na caixa de ferramentas'); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: LEITURA
// ═══════════════════════════════════════════════════════════════
// Traz todos os itens de uma vez e agrupa no cliente. Um select por grupo
// seriam N idas ao banco a cada abertura.
export async function carregarFerramentas() {
  const { data, error } = await supabase
    .from('ferramentas_itens')
    .select('id, grupo, texto, feito, ord')
    .order('ord', { ascending: true });
  _falha(error);

  const porGrupo = new Map();
  // começa com os padrão, na ordem, pra eles aparecerem mesmo sem item
  for (const g of GRUPOS_PADRAO) porGrupo.set(g.nome, { nome: g.nome, icone: g.icone, itens: [] });
  for (const it of (data || [])) {
    if (!porGrupo.has(it.grupo)) porGrupo.set(it.grupo, { nome: it.grupo, icone: '📌', itens: [] });
    porGrupo.get(it.grupo).itens.push(it);
  }
  return [...porGrupo.values()];
}

// Só o número de pendentes, pra badge do card na Home — sem baixar tudo.
export async function contarPendentes() {
  const { count, error } = await supabase
    .from('ferramentas_itens')
    .select('id', { count: 'exact', head: true })
    .eq('feito', false);
  if (error) { console.warn('[ferramentas] contar:', error.message); return 0; }
  return count || 0;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESCRITA
// ═══════════════════════════════════════════════════════════════
export async function adicionarItem(grupo, texto) {
  const t = (texto || '').trim();
  if (!t) return null;
  const { data, error } = await supabase
    .from('ferramentas_itens')
    .insert({ user_id: _uid(), grupo, texto: t.slice(0, 500), ord: Date.now() })
    .select('id, grupo, texto, feito, ord')
    .single();
  _falha(error);
  return data;
}

export async function marcarItem(id, feito) {
  const { error } = await supabase
    .from('ferramentas_itens').update({ feito: !!feito }).eq('id', id);
  _falha(error);
}

export async function editarItem(id, texto) {
  const t = (texto || '').trim();
  if (!t) return;
  const { error } = await supabase
    .from('ferramentas_itens').update({ texto: t.slice(0, 500) }).eq('id', id);
  _falha(error);
}

export async function apagarItem(id) {
  const { error } = await supabase.from('ferramentas_itens').delete().eq('id', id);
  _falha(error);
}

// Limpa os CONCLUÍDOS de um grupo. O item riscado fica até a pessoa mandar
// limpar — some sem querer é o que ela pediu pra evitar.
export async function limparFeitos(grupo) {
  const { error } = await supabase
    .from('ferramentas_itens').delete()
    .eq('grupo', grupo).eq('feito', true);
  _falha(error);
}

// Renomeia o grupo inteiro num passo (função no banco). O item guarda o nome
// do grupo, então renomear é atualizar todos de uma vez.
export async function renomearGrupo(de, para) {
  const p = (para || '').trim();
  if (!p || p === de) return;
  const { error } = await supabase.rpc('ferramentas_renomear_grupo', { de, para: p });
  _falha(error);
}
