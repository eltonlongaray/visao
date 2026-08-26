// ─── ÍNDICE ──────────────────────────────────────────────────
// Camada de dados da AGENDA ONLINE (tipo Calendly integrado ao Ritual).
// BLOCO 1 — DONO: config (disponibilidade, duração, slug) + agendamentos recebidos
// BLOCO 2 — PÚBLICO: ler agenda por slug, slots ocupados (RPC), criar agendamento
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

function _uid() { return auth.currentUser?.uid || null; }
// Código curto do link: 1 letra + 2 dígitos (ex.: A01). Sem I/O pra não confundir.
function _codigoCurto() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const l = L[Math.floor(Math.random() * L.length)];
  const n = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return l + n;
}
const _ehCodigoCurto = s => /^[A-Z]\d{2}$/.test(s || '');
// Troca o slug do dono por um código curto livre (retry em colisão). Retorna o novo.
async function _slugCurtoLivre(uid) {
  for (let i = 0; i < 24; i++) {
    const code = _codigoCurto();
    const { error } = await supabase.from('agenda_config').update({ slug: code }).eq('user_id', uid);
    if (!error) return code;
    if (!/duplicate|unique|23505/i.test(error.message || '')) throw new Error(error.message);
  }
  throw new Error('sem código curto livre');
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: DONO DA AGENDA
// ═══════════════════════════════════════════════════════════════
// Config do dono. Cria uma na primeira vez, já com um slug (o código do link).
export async function getAgendaConfig() {
  const uid = _uid(); if (!uid) return null;
  const { data, error } = await supabase.from('agenda_config').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    // migra códigos no formato antigo (aleatório) pro curto A01
    if (!_ehCodigoCurto(data.slug)) { try { data.slug = await _slugCurtoLivre(uid); } catch {} }
    return data;
  }
  // primeira vez: cria desativada, com código curto livre (retry em colisão)
  for (let i = 0; i < 24; i++) {
    const novo = { user_id: uid, slug: _codigoCurto(), titulo: 'Agende comigo', duracao_min: 60, disponibilidade: {}, ativo: false };
    const ins = await supabase.from('agenda_config').insert(novo).select('*').single();
    if (!ins.error) return ins.data;
    // corrida no user_id (2 abas) → lê a que ficou
    const re = await supabase.from('agenda_config').select('*').eq('user_id', uid).maybeSingle();
    if (re.data) return re.data;
    // senão foi colisão de slug → tenta outro código
    if (!/duplicate|unique|23505/i.test(ins.error.message || '')) throw new Error(ins.error.message);
  }
  throw new Error('sem código curto livre');
}

// Salva parcial (titulo, duracao_min, disponibilidade, ativo).
export async function salvarAgendaConfig(patch) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const { error } = await supabase.from('agenda_config')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

// Agendamentos que o dono recebeu (de hoje pra frente, confirmados).
export async function getAgendamentos() {
  const uid = _uid(); if (!uid) return [];
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('agendamentos')
    .select('id, data, hora, cliente_nome, cliente_contato, status, created_at')
    .eq('owner_id', uid).eq('status', 'confirmado').gte('data', hoje)
    .order('data', { ascending: true }).order('hora', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function cancelarAgendamento(id) {
  const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PÚBLICO (página do link — sem login)
// ═══════════════════════════════════════════════════════════════
// Lê a agenda de um dono pelo slug (só o que é público: título, duração, dias).
export async function getAgendaPublica(slug) {
  const { data, error } = await supabase.from('agenda_config')
    .select('slug, titulo, duracao_min, disponibilidade, ativo')
    .eq('slug', slug).eq('ativo', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

// Slots já ocupados (data+hora), via RPC que NÃO expõe nome/contato do cliente.
export async function getSlotsOcupados(slug, deISO, ateISO) {
  const { data, error } = await supabase.rpc('slots_ocupados', { p_slug: slug, p_from: deISO, p_to: ateISO });
  if (error) throw new Error(error.message);
  const set = new Set();
  for (const r of data || []) set.add(`${r.data}|${r.hora}`);
  return set;
}

// Cria um agendamento via RPC (valida disponibilidade + não estar ocupado).
// Retorna { ok } ou lança com a mensagem (ex.: horário já foi pego).
export async function criarAgendamento(slug, dataISO, hora, nome, contato) {
  const { data, error } = await supabase.rpc('criar_agendamento', {
    p_slug: slug, p_data: dataISO, p_hora: hora,
    p_nome: (nome || '').trim().slice(0, 120),
    p_contato: (contato || '').trim().slice(0, 60),
  });
  if (error) throw new Error(error.message);
  return data;
}
