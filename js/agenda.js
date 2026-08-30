// ─── ÍNDICE ──────────────────────────────────────────────────
// Camada de dados da AGENDA ONLINE (tipo Calendly integrado ao Ritual).
// BLOCO 1 — DONO: config (disponibilidade, duração, slug) + agendamentos recebidos
// BLOCO 2 — PÚBLICO: ler agenda por slug, slots ocupados (RPC), criar agendamento
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { getShifts, getDayTasks, addDayTask } from './banco-dados.js';

function _uid() { return auth.currentUser?.uid || null; }
// Código curto do link: 1 letra (A–Z) + N dígitos (ex.: A01). Começa com 2 dígitos
// (2600 combos) e o número CRESCE sozinho conforme o espaço enche (3, 4, 5 dígitos…).
function _codigoCurto(digitos = 2) {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l = L[Math.floor(Math.random() * L.length)];
  const n = String(Math.floor(Math.random() * 10 ** digitos)).padStart(digitos, '0');
  return l + n;
}
// mais colisões → mais dígitos (a cada 6 tentativas, +1 dígito)
const _codigoNaTentativa = i => _codigoCurto(2 + Math.floor(i / 6));
const _ehCodigoCurto = s => /^[A-Z]\d{2,}$/.test(s || '');
// Troca o slug do dono por um código curto livre (retry em colisão). Retorna o novo.
async function _slugCurtoLivre(uid) {
  for (let i = 0; i < 40; i++) {
    const code = _codigoNaTentativa(i);
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
  // primeira vez: cria desativada, com código curto livre (retry em colisão, dígitos crescem)
  for (let i = 0; i < 40; i++) {
    const novo = { user_id: uid, slug: _codigoNaTentativa(i), titulo: 'Agende comigo', duracao_min: 60, disponibilidade: {}, ativo: false };
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
    .select('id, data, hora, cliente_nome, cliente_contato, servico, preco, duracao_min, status, created_at')
    .eq('owner_id', uid).eq('status', 'confirmado').gte('data', hoje)
    .order('data', { ascending: true }).order('hora', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function cancelarAgendamento(id) {
  const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Soma minutos a "HH:MM" → "HH:MM" (fim do atendimento).
function _addMin(hora, min) {
  const [h, m] = (hora || '00:00').split(':').map(Number);
  const t = h * 60 + m + (min || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Turno pelo horário (mesma lógica do pet), pra encaixar no card certo do Ritual.
function _pickShift(shifts, time) {
  if (!shifts.length) return null;
  if (!time) return shifts[0].id;
  const [h] = time.split(':').map(Number);
  const name = h >= 5 && h < 12 ? 'Manhã' : h >= 12 && h < 19 ? 'Tarde' : 'Noite';
  return (shifts.find(s => s.name === name) || shifts[0]).id;
}

// FASE C: cada agendamento confirmado vira um COMPROMISSO "Agenda Online" no Ritual
// do dono, com lembrete (bolinha vermelha). Idempotente via extra.agendamentoId —
// pode rodar quantas vezes quiser que não duplica. Retorna quantos criou.
export async function sincronizarCompromissos() {
  const ags = await getAgendamentos().catch(() => []);
  if (!ags.length) return 0;
  const shifts = await getShifts().catch(() => []);
  const porDia = {};
  for (const a of ags) (porDia[a.data] ||= []).push(a);
  let criados = 0;
  for (const dia of Object.keys(porDia)) {
    const existentes = await getDayTasks(dia).catch(() => []);
    const jaSync = new Set(existentes.filter(t => t.agendamentoId).map(t => t.agendamentoId));
    for (const a of porDia[dia]) {
      if (jaSync.has(a.id)) continue;
      const partes = [a.cliente_nome];
      if (a.servico) partes.push(a.servico);
      if (a.cliente_contato) partes.push(a.cliente_contato);
      const desc = partes.join(' · ');
      await addDayTask(dia, {
        title: 'Agenda Online',
        desc,
        kind: 'commitment',
        startTime: a.hora,
        ...(a.duracao_min ? { horaFim: _addMin(a.hora, a.duracao_min) } : {}),
        order: existentes.length + criados,
        icon: '📅',
        categoryId: null,
        shiftId: _pickShift(shifts, a.hora),
        reminderEnabled: true,   // bolinha vermelha
        done: false,
        agendamentoId: a.id,     // vai pro extra → idempotência
      });
      criados++;
    }
  }
  return criados;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PÚBLICO (página do link — sem login)
// Mora em agenda-publica-dados.js pra a página leve não arrastar o app.
// ═══════════════════════════════════════════════════════════════
export { getAgendaPublica, getSlotsOcupados, criarAgendamento } from './agenda-publica-dados.js';
