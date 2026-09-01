// ─── ÍNDICE ──────────────────────────────────────────────────
// Camada de dados da AGENDA ONLINE (tipo Calendly integrado ao Ritual).
// BLOCO 1 — DONO: config (disponibilidade, duração, slug) + agendamentos recebidos
// BLOCO 2 — PÚBLICO: ler agenda por slug, slots ocupados (RPC), criar agendamento
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { getShifts, getDayTasks, addDayTask, updateDayTask, deleteDayTask } from './banco-dados.js';

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
    const novo = { user_id: uid, slug: _codigoNaTentativa(i), titulo: 'Agende comigo', duracao_min: 60, disponibilidade: {}, semanas: {}, ativo: false };
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

// Salva parcial (titulo, duracao_min, disponibilidade, semanas, ativo).
// `semanas` (exceções por semana) é opcional: se a coluna ainda não existir,
// tenta de novo sem ela pra não travar o resto da config.
export async function salvarAgendaConfig(patch) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const full = { ...patch, updated_at: new Date().toISOString() };
  let { error } = await supabase.from('agenda_config').update(full).eq('user_id', uid);
  if (error && /semanas/i.test(error.message || '') && ('semanas' in full)) {
    const { semanas, ...semSemanas } = full;
    ({ error } = await supabase.from('agenda_config').update(semSemanas).eq('user_id', uid));
    if (!error) throw new Error('Disponibilidade por semana precisa do SQL novo (coluna "semanas"). O resto foi salvo.');
  }
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

// TODOS os agendamentos do dono (passado + futuro, exceto cancelados) — pra montar
// a lista de Clientes e o histórico de cada um (inclui finalizados e faltas).
export async function getAgendamentosTodos() {
  const uid = _uid(); if (!uid) return [];
  const { data, error } = await supabase.from('agendamentos')
    .select('id, data, hora, cliente_nome, cliente_contato, servico, preco, duracao_min, status, created_at')
    .eq('owner_id', uid).neq('status', 'cancelado')
    .order('data', { ascending: false }).order('hora', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Um agendamento pelo id (pro detalhe aberto a partir do Ritual).
export async function getAgendamentoById(id) {
  const { data, error } = await supabase.from('agendamentos').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Atualiza o WhatsApp de um cliente em TODOS os atendimentos dele.
export async function atualizarContatoCliente(ids, contato) {
  if (!ids?.length) return;
  const { error } = await supabase.from('agendamentos').update({ cliente_contato: (contato || '').trim() || null }).in('id', ids);
  if (error) throw new Error(error.message);
}

// Atualiza NOME e/ou WhatsApp de um cliente em TODOS os atendimentos dele.
export async function atualizarCliente(ids, { nome, contato } = {}) {
  if (!ids?.length) return;
  const patch = {};
  if (nome != null) patch.cliente_nome = (nome || '').trim();
  if (contato != null) patch.cliente_contato = (contato || '').trim() || null;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('agendamentos').update(patch).in('id', ids);
  if (error) throw new Error(error.message);
}

// Muda o status de um atendimento: 'confirmado' | 'finalizado' | 'faltou' | 'cancelado'.
export async function atualizarStatusAgendamento(id, status) {
  const { error } = await supabase.from('agendamentos').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

// O PROFISSIONAL cria (sem id) ou edita (com id) um agendamento — migração, encaixe,
// ou completar dados (ex.: cadastrar o WhatsApp do cliente da migração).
export async function salvarAgendamentoManual(p) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const row = {
    data: p.data, hora: p.hora,
    cliente_nome: (p.cliente_nome || '').trim(),
    cliente_contato: (p.cliente_contato || '').trim() || null,
    servico: p.servico || null,
    preco: (p.preco == null || p.preco === '') ? null : Number(p.preco),
    duracao_min: p.duracao_min || null,
    status: 'confirmado',
  };
  if (p.id) {
    const { error } = await supabase.from('agendamentos').update(row).eq('id', p.id);
    if (error) throw new Error(error.message);
    return p.id;
  }
  row.owner_id = uid;
  const { data, error } = await supabase.from('agendamentos').insert(row).select('id').single();
  if (error) throw new Error(/duplicate|unique|23505/i.test(error.message) ? 'Já existe um agendamento nesse dia e horário' : error.message);
  return data.id;
}

// Reagendou/editou a TASK no Ritual (openTaskEditor) → reflete no agendamento
// (data/hora/duração), pra o link público liberar/ocupar o slot certo e o
// histórico do cliente bater. Silencioso: falha aqui não trava a edição da task.
export async function moverAgendamento(agId, { data, hora, duracao_min, cliente_nome, cliente_contato } = {}) {
  const uid = _uid(); if (!uid || !agId) return { ok: false };
  const patch = {};
  if (data) patch.data = data;
  if (hora) patch.hora = hora;
  if (duracao_min != null) patch.duracao_min = duracao_min;
  if (cliente_nome != null) patch.cliente_nome = cliente_nome;
  if (cliente_contato != null) patch.cliente_contato = cliente_contato || null;
  if (!Object.keys(patch).length) return { ok: true };
  const { error } = await supabase.from('agendamentos').update(patch).eq('id', agId).eq('owner_id', uid);
  if (error) return { ok: false, error: /duplicate|unique|23505/i.test(error.message) ? 'Já existe um atendimento nesse dia e horário' : error.message };
  return { ok: true };
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
      const desc = partes.join(' · ');   // só nome + serviço (o WhatsApp fica no atendimento)
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

// ── ESPELHO agendamento ↔ compromisso (Ritual) ────────────────────────────
// Acha o compromisso ligado a um agendamento, procurando nos dias candidatos.
async function _taskDoAgendamento(agId, datas) {
  for (const dia of datas) {
    if (!dia) continue;
    const tasks = await getDayTasks(dia).catch(() => []);
    const t = tasks.find(x => x.agendamentoId === agId);
    if (t) return { dia, task: t };
  }
  return null;
}

function _descAg(ag) {
  const p = [ag.cliente_nome];
  if (ag.servico) p.push(ag.servico);
  return p.join(' · ');   // só nome + serviço (WhatsApp fica no bloco de atendimento)
}

// EXCLUIR atendimento: cancela o agendamento E apaga o compromisso ligado no Ritual.
export async function excluirAtendimento(ag) {
  await cancelarAgendamento(ag.id);
  const found = await _taskDoAgendamento(ag.id, [ag.data]);
  if (found) await deleteDayTask(found.dia, found.task.id).catch(() => {});
}

// Apagou o compromisso no Ritual → cancela o agendamento ligado.
export async function cancelarAgendamentoDaTask(agId) {
  if (agId) await cancelarAgendamento(agId).catch(() => {});
}

// EDITOU o agendamento → deixa o compromisso igual (desc, hora, fim; move de dia se mudou).
// Autossuficiente: recria a task DIRETO com os dados do atendimento (funciona pra
// atendimento passado OU futuro — não depende do sincronizarCompromissos, que só
// olha os futuros). No MESMO dia atualiza no lugar; se MUDOU de dia, cria no dia
// novo ANTES de apagar o antigo, pra o compromisso NUNCA sumir por uma falha.
export async function sincronizarTaskDoAgendamento(ag, oldData) {
  const found = await _taskDoAgendamento(ag.id, [oldData, ag.data]);
  const desc = _descAg(ag);
  const horaFim = ag.duracao_min ? _addMin(ag.hora, ag.duracao_min) : null;
  if (found && found.dia === ag.data) {
    await updateDayTask(ag.data, found.task.id, { desc, startTime: ag.hora, horaFim: horaFim || null }).catch(() => {});
    return;
  }
  const doneAntigo = !!found?.task?.done;
  const shifts = await getShifts().catch(() => []);
  let criou = true;
  try {
    await addDayTask(ag.data, {
      title: 'Agenda Online', desc, kind: 'commitment', startTime: ag.hora,
      ...(horaFim ? { horaFim } : {}), icon: '📅', categoryId: null,
      shiftId: _pickShift(shifts, ag.hora), reminderEnabled: true, done: doneAntigo,
      agendamentoId: ag.id,
    });
  } catch (e) { criou = false; console.warn('[agenda] recriar task falhou:', e); }
  if (criou && found) await deleteDayTask(found.dia, found.task.id).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PÚBLICO (página do link — sem login)
// Mora em agenda-publica-dados.js pra a página leve não arrastar o app.
// ═══════════════════════════════════════════════════════════════
export { getAgendaPublica, getSlotsOcupados, criarAgendamento } from './agenda-publica-dados.js';
