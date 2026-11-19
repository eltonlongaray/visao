// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados do KANBAN no formato Trello (SQL: sql/kanban.sql).
// Só banco — sem tela (a tela é screens/tela-kanban.js; o Pet usa daqui).
// BLOCO 1 — CONSTANTES (áreas, cores, listas iniciais)
// BLOCO 2 — QUADROS
// BLOCO 3 — LISTAS
// BLOCO 4 — CARTÕES
// BLOCO 5 — AJUDANTES (ordem, prazo)
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// === BLOCO 1: CONSTANTES ===
export const AREAS = [
  { k: 'pessoal',      nome: 'Pessoal',      ic: '👤' },
  { k: 'profissional', nome: 'Profissional', ic: '💼' },
];
export const nomeArea = (k) => AREAS.find(a => a.k === k)?.nome || k;

// Cores das etiquetas (card inteiro pintado) e dos quadros
export const CORES = [
  { k: 'verde',    hex: '#4bce97', nome: 'Verde' },
  { k: 'amarelo',  hex: '#e2b203', nome: 'Amarelo' },
  { k: 'laranja',  hex: '#fea362', nome: 'Laranja' },
  { k: 'vermelho', hex: '#f87168', nome: 'Vermelho' },
  { k: 'roxo',     hex: '#9f8fef', nome: 'Roxo' },
  { k: 'azul',     hex: '#579dff', nome: 'Azul' },
];
export const corHex = (k) => CORES.find(c => c.k === k)?.hex || null;
// Nome da etiqueta no quadro ("Rápido") ou o nome da cor
export const nomeEtiqueta = (quadro, k) => (quadro?.etiquetas?.[k] || '').trim() || CORES.find(c => c.k === k)?.nome || '';

export const LISTAS_INICIAIS = ['A fazer', 'Em andamento', 'Concluído'];

const _erro = (e) => {
  const m = e?.message || '';
  if (/kanban_(quadros|listas|cartoes)/i.test(m) && /does not exist|schema cache|relation/i.test(m)) return new Error('Falta rodar o SQL do Kanban (sql/kanban.sql)');
  if (/Limite de/.test(m)) return new Error(m.replace(/^.*?(Limite de[^"]*).*$/, '$1') + '.');
  return new Error(m || 'Erro');
};
const _agora = () => new Date().toISOString();

// === BLOCO 2: QUADROS ===
export async function lerQuadros(area = null) {
  let q = supabase.from('kanban_quadros').select('*');
  if (area) q = q.eq('area', area);
  const { data, error } = await q.order('ordem', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

// Cria o quadro já com as 3 listas iniciais
export async function criarQuadro({ area, nome, cor = 'roxo' }) {
  const { data, error } = await supabase.from('kanban_quadros')
    .insert({ area, nome: String(nome).trim().slice(0, 80), cor }).select('*').single();
  if (error) throw _erro(error);
  const { error: e2 } = await supabase.from('kanban_listas')
    .insert(LISTAS_INICIAIS.map((n, i) => ({ quadro_id: data.id, nome: n, ordem: i })));
  if (e2) throw _erro(e2);
  return data;
}

export async function mudarQuadro(id, patch) {
  const { error } = await supabase.from('kanban_quadros').update({ ...patch, updated_at: _agora() }).eq('id', id);
  if (error) throw _erro(error);
}

export async function apagarQuadro(id) {
  const { error } = await supabase.from('kanban_quadros').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 3: LISTAS ===
export async function lerListas(quadroId) {
  const { data, error } = await supabase.from('kanban_listas').select('*')
    .eq('quadro_id', quadroId).order('ordem', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

export async function criarLista(quadroId, nome, ordem) {
  const { data, error } = await supabase.from('kanban_listas')
    .insert({ quadro_id: quadroId, nome: String(nome).trim().slice(0, 60), ordem }).select('*').single();
  if (error) throw _erro(error);
  return data;
}

export async function mudarLista(id, patch) {
  const { error } = await supabase.from('kanban_listas').update(patch).eq('id', id);
  if (error) throw _erro(error);
}

export async function apagarLista(id) {
  const { error } = await supabase.from('kanban_listas').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 4: CARTÕES ===
const CAMPOS = 'id, quadro_id, lista_id, titulo, descricao, cor, concluido, prazo, ordem, arquivado, updated_at';

export async function lerCartoes(quadroId, { arquivados = false } = {}) {
  const { data, error } = await supabase.from('kanban_cartoes').select(CAMPOS)
    .eq('quadro_id', quadroId).eq('arquivado', arquivados)
    .order('ordem', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

// Todos os cards (não arquivados) de vários quadros — pro Pet procurar
export async function lerCartoesDe(quadroIds) {
  if (!quadroIds.length) return [];
  const { data, error } = await supabase.from('kanban_cartoes').select(CAMPOS)
    .in('quadro_id', quadroIds).eq('arquivado', false).order('ordem', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

// Card novo entra no FIM da lista (igual o "+ Adicionar" do Trello)
export async function criarCartao({ quadro_id, lista_id, titulo, descricao = null, cor = null, prazo = null }, cartoesDaLista = []) {
  const ordem = cartoesDaLista.length ? Math.max(...cartoesDaLista.map(c => c.ordem)) + 1 : 0;
  const { data, error } = await supabase.from('kanban_cartoes')
    .insert({ quadro_id, lista_id, titulo: String(titulo).trim().slice(0, 300), descricao: descricao ? String(descricao).slice(0, 4000) : null, cor, prazo, ordem })
    .select(CAMPOS).single();
  if (error) throw _erro(error);
  return data;
}

export async function mudarCartao(id, patch) {
  const { error } = await supabase.from('kanban_cartoes').update({ ...patch, updated_at: _agora() }).eq('id', id);
  if (error) throw _erro(error);
}

export async function apagarCartao(id) {
  const { error } = await supabase.from('kanban_cartoes').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 5: AJUDANTES ===
// Ordem entre dois vizinhos (sem renumerar a lista toda)
export function ordemEntre(antes, depois) {
  if (antes == null && depois == null) return 0;
  if (antes == null) return depois - 1;
  if (depois == null) return antes + 1;
  return (antes + depois) / 2;
}

// 'atrasado' | 'hoje' | 'breve' (até 2 dias) | 'ok' | null
export function situacaoPrazo(prazo, concluido = false) {
  if (!prazo || concluido) return prazo ? 'ok' : null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(prazo + 'T00:00:00');
  const dias = Math.round((d - hoje) / 86400000);
  if (dias < 0) return 'atrasado';
  if (dias === 0) return 'hoje';
  if (dias <= 2) return 'breve';
  return 'ok';
}
export function textoPrazo(prazo) {
  if (!prazo) return '';
  const d = new Date(prazo + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}
