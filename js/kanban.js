// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados do KANBAN pessoal e profissional individual (tabela kanban_cards, SQL: sql/kanban.sql).
// Só banco — sem tela (a tela é screens/tela-kanban.js; o Pet usa daqui).
// BLOCO 1 — COLUNAS E AJUDANTES
// BLOCO 2 — LER / CRIAR / MUDAR / APAGAR
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// === BLOCO 1: COLUNAS E AJUDANTES ===
export const COLUNAS = [
  { k: 'afazer',  nome: 'A fazer', ic: '📝' },
  { k: 'fazendo', nome: 'Fazendo', ic: '⚡' },
  { k: 'feito',   nome: 'Feito',   ic: '✅' },
];
export const QUADROS = [
  { k: 'pessoal',      nome: 'Pessoal',      ic: '👤' },
  { k: 'profissional', nome: 'Profissional', ic: '💼' },
];
export const nomeQuadro = (k) => QUADROS.find(q => q.k === k)?.nome || k;
export const nomeColuna = (k) => COLUNAS.find(c => c.k === k)?.nome || k;

const _erro = (e) => new Error(/kanban_cards/i.test(e?.message || '') && /does not exist|schema cache|relation/i.test(e?.message || '')
  ? 'Falta rodar o SQL do Kanban (sql/kanban.sql)' : (/Limite de 500/.test(e?.message || '') ? 'Teu Kanban chegou em 500 cards (pessoal + profissional). Apaga alguns feitos pra liberar.' : (e?.message || 'Erro')));

// === BLOCO 2: LER / CRIAR / MUDAR / APAGAR ===
export async function lerCards(quadro = 'pessoal') {
  const { data, error } = await supabase.from('kanban_cards').select('id, quadro, titulo, descricao, coluna, ordem, updated_at')
    .is('equipe_id', null).eq('quadro', quadro).order('ordem', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

// Card novo entra no TOPO da coluna (ordem menor que o primeiro)
export async function criarCard({ titulo, descricao = null, coluna = 'afazer', quadro = 'pessoal' }, cards = null) {
  const lista = cards || await lerCards(quadro);
  const daColuna = lista.filter(c => c.coluna === coluna);
  const ordem = daColuna.length ? Math.min(...daColuna.map(c => c.ordem)) - 1 : 0;
  const { data, error } = await supabase.from('kanban_cards')
    .insert({ quadro, titulo: String(titulo).trim().slice(0, 200), descricao: descricao ? String(descricao).slice(0, 2000) : null, coluna, ordem })
    .select('id, quadro, titulo, descricao, coluna, ordem, updated_at').single();
  if (error) throw _erro(error);
  return data;
}

export async function mudarCard(id, patch) {
  const { error } = await supabase.from('kanban_cards').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw _erro(error);
}

export async function apagarCard(id) {
  const { error } = await supabase.from('kanban_cards').delete().eq('id', id);
  if (error) throw _erro(error);
}

// Ordem entre dois vizinhos (sem renumerar a coluna toda)
export function ordemEntre(antes, depois) {
  if (antes == null && depois == null) return 0;
  if (antes == null) return depois - 1;
  if (depois == null) return antes + 1;
  return (antes + depois) / 2;
}
