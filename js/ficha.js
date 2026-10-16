// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados da FICHA DE ATENDIMENTO (lado da PROFISSIONAL, logada).
// Tabela `fichas` (RLS: só a dona) + `agenda_config.ficha_cfg` (profissão,
// tipos de massagem). O cliente envia pela página pública (ficha-publica.js).
// SQL: sql/ficha.sql
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

// === BLOCO 1: AJUDANTES ===
function _uid() { return auth.currentUser?.uid || null; }
function _codigo() {
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}
const _dig = s => String(s || '').replace(/\D/g, '');

// === BLOCO 2: LEITURA ===
export async function getFichas() {
  const { data, error } = await supabase.from('fichas')
    .select('id, codigo, modelo, cliente_nome, cliente_contato, cliente_digitos, respostas, mapa, respondida_em, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// === BLOCO 3: ESCRITA ===
// Ficha "convite" de um cliente (sem respostas ainda) → gera o link com código único.
export async function criarConviteFicha({ nome, contato, modelo }) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const row = { owner_id: uid, codigo: _codigo(), modelo: modelo || 'massoterapia',
    cliente_nome: (nome || '').trim() || null, cliente_contato: (contato || '').trim() || null, cliente_digitos: _dig(contato) || null };
  const { data, error } = await supabase.from('fichas').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}
// Liga uma ficha (que chegou pelo link geral) a um cliente da Agenda.
export async function ligarFichaCliente(id, { nome, contato }) {
  const { error } = await supabase.from('fichas')
    .update({ cliente_nome: nome || null, cliente_contato: contato || null, cliente_digitos: _dig(contato) || null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
export async function excluirFicha(id) {
  const { error } = await supabase.from('fichas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
// Config da ficha (profissão, tipos desligados/extras) — salva na hora, separada do "Salvar" da Agenda.
export async function salvarFichaCfg(cfg) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const { error } = await supabase.from('agenda_config').update({ ficha_cfg: cfg || {} }).eq('user_id', uid);
  if (error) throw new Error(/ficha_cfg/i.test(error.message || '') ? 'Falta rodar o SQL da ficha (sql/ficha.sql)' : error.message);
}

// === BLOCO 4: SESSÕES (registro de cada atendimento: palpação, medidas, observações) ===
export async function getSessoes() {
  const { data, error } = await supabase.from('ficha_sessoes')
    .select('id, cliente_nome, cliente_contato, cliente_digitos, data, palpacao, medidas, observacoes, created_at')
    .order('data', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
export async function salvarSessao(s) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const row = { owner_id: uid, cliente_nome: s.cliente_nome || null, cliente_contato: s.cliente_contato || null,
    cliente_digitos: _dig(s.cliente_contato) || null, data: s.data, palpacao: s.palpacao || {}, medidas: s.medidas || {},
    observacoes: (s.observacoes || '').trim() || null, updated_at: new Date().toISOString() };
  const q = s.id ? supabase.from('ficha_sessoes').update(row).eq('id', s.id) : supabase.from('ficha_sessoes').insert(row);
  const { data, error } = await q.select('*').single();
  if (error) throw new Error(/ficha_sessoes/i.test(error.message || '') ? 'Falta rodar o SQL das sessões (sql/ficha-sessoes.sql)' : error.message);
  return data;
}
export async function excluirSessao(id) {
  const { error } = await supabase.from('ficha_sessoes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
