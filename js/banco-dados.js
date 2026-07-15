// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + HELPER DE UID
// BLOCO 2 — MAPEADORES (row do Postgres <-> shape que as telas usam)
// BLOCO 3 — PROFILE
// BLOCO 3.5 — WEEKDAY TEMPLATES
// BLOCO 4 — SHIFTS
// BLOCO 5 — CATEGORIES
// BLOCO 6 — ACTIVITIES
// BLOCO 6.5 — WEEK NOTES
// BLOCO 7 — DAYS + TASKS
// BLOCO 8 — HELPERS DE TEMPO (puros)
// BLOCO 9 — STATS / AGREGAÇÕES (puros)
// BLOCO 10 — SEED "Organização Pessoal"
// ─────────────────────────────────────────────────────────────
// Data layer — agora sobre Supabase/Postgres. Mesmas assinaturas de antes.
// Segurança e escopo por usuário: RLS (user_id = auth.uid()). Inserts preenchem
// user_id sozinho (default auth.uid()); leituras já vêm filtradas pelo RLS.
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + HELPER DE UID
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error('Usuário não autenticado');
  return u.uid;
}
function _fail(error) { if (error) throw new Error(error.message || 'Erro no banco'); }


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: MAPEADORES
// ═══════════════════════════════════════════════════════════════
function _profileFromRow(r) {
  if (!r) return null;
  return {
    defaultWakeTime:    r.default_wake_time,
    defaultSleepTime:   r.default_sleep_time,
    template:           r.template,
    streakOrigin:       r.streak_origin,
    weekdayTemplates:   r.weekday_templates || {},
    monthlyCommitments: r.monthly_commitments || [],
    fullName:           r.full_name,
    preferredName:      r.preferred_name,
    birthDate:          r.birth_date,
    phone:              r.phone,
    isAdmin:            !!r.is_admin,   // só leitura — nunca gravado pelo cliente
    createdAt:          r.created_at,
    ...(r.extra || {}),
  };
}
function _profileToRow(d) {
  const row = {}, extra = {};
  const map = {
    defaultWakeTime: 'default_wake_time', defaultSleepTime: 'default_sleep_time',
    template: 'template', streakOrigin: 'streak_origin',
    weekdayTemplates: 'weekday_templates', monthlyCommitments: 'monthly_commitments',
    fullName: 'full_name', preferredName: 'preferred_name', birthDate: 'birth_date', phone: 'phone',
    createdAt: 'created_at',
  };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'isAdmin') continue;   // read-only: privilégio nunca sai do cliente
    if (k in map) row[map[k]] = v; else extra[k] = v;
  }
  if (Object.keys(extra).length) row.extra = extra;
  return row;
}

function _shiftFromRow(r) { return { id: r.id, name: r.name, desc: r.description, icon: r.icon, order: r.ord, gradient: r.gradient }; }
function _shiftToRow(d)   { return { name: d.name, description: d.desc, icon: d.icon, ord: d.order, gradient: d.gradient }; }

function _catFromRow(r) {
  const { id, name, icon, color, ord, days_of_week, extra } = r;
  return { id, name, icon, color, order: ord, daysOfWeek: days_of_week || [], ...(extra || {}) };
}
function _catToRow(d) {
  const { id, name, icon, color, order, daysOfWeek, ...rest } = d;
  const row = { name, icon, color, ord: order, days_of_week: daysOfWeek || [] };
  if (Object.keys(rest).length) row.extra = rest;
  return row;
}

const _TASK_MAP = {
  activityId: 'activity_id', title: 'title', desc: 'description', kind: 'kind',
  startTime: 'start_time', shiftId: 'shift_id', categoryId: 'category_id', icon: 'icon',
  reminderEnabled: 'reminder_enabled', done: 'done', order: 'ord',
  recurrenceGroupId: 'recurrence_group_id', recurrenceType: 'recurrence_type',
  cancelled: 'cancelled', rescheduled: 'rescheduled', rescheduleCount: 'reschedule_count',
};
function _taskFromRow(r) {
  const t = {
    id: r.id,
    activityId: r.activity_id ?? null,
    title: r.title ?? '',
    desc: r.description ?? '',
    kind: r.kind ?? 'task',
    startTime: r.start_time ?? '',
    shiftId: r.shift_id ?? null,
    categoryId: r.category_id ?? null,
    icon: r.icon ?? '',
    reminderEnabled: !!r.reminder_enabled,
    done: !!r.done,
    order: r.ord ?? 0,
    cancelled: !!r.cancelled,
    rescheduled: !!r.rescheduled,
    rescheduleCount: r.reschedule_count ?? 0,
    ...(r.extra || {}),
  };
  if (r.recurrence_group_id) t.recurrenceGroupId = r.recurrence_group_id;
  if (r.recurrence_type)     t.recurrenceType    = r.recurrence_type;
  return t;
}
// Novo task inteiro → row (pra insert)
function _taskToRow(t, dayDocId) {
  const known = new Set(Object.keys(_TASK_MAP));
  const extra = {};
  for (const [k, v] of Object.entries(t)) if (!known.has(k) && k !== 'id') extra[k] = v;
  const row = {
    day: dayDocId,
    activity_id: t.activityId ?? null,
    title: t.title ?? '',
    description: t.desc ?? '',
    kind: t.kind ?? 'task',
    start_time: t.startTime ?? '',
    shift_id: t.shiftId ?? null,
    category_id: t.categoryId ?? null,
    icon: t.icon ?? '',
    reminder_enabled: !!t.reminderEnabled,
    done: !!t.done,
    ord: t.order ?? 0,
    recurrence_group_id: t.recurrenceGroupId ?? null,
    recurrence_type: t.recurrenceType ?? null,
    cancelled: !!t.cancelled,
    rescheduled: !!t.rescheduled,
    reschedule_count: t.rescheduleCount ?? 0,
    extra,
  };
  return row;
}
// Patch parcial (update) → row (só as chaves passadas)
function _taskPatchToRow(data) {
  const row = {}; let extraKeys = null;
  for (const [k, v] of Object.entries(data)) {
    if (k in _TASK_MAP) row[_TASK_MAP[k]] = v;
    else (extraKeys ||= {})[k] = v;
  }
  return { row, extraKeys };
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: PROFILE
// ═══════════════════════════════════════════════════════════════
export async function getProfile() {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  _fail(error);
  return _profileFromRow(data);
}
export async function setProfile(dataIn) {
  const { data: cur } = await supabase.from('profiles').select('*').maybeSingle();
  const merged = { ...(_profileFromRow(cur) || {}), ...dataIn };
  const row = _profileToRow(merged);
  row.user_id = uid();
  const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' });
  _fail(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3.5: WEEKDAY TEMPLATES (dentro de profile.weekday_templates)
// ═══════════════════════════════════════════════════════════════
export async function getWeekdayTemplate(dow) {
  const p = await getProfile();
  return p?.weekdayTemplates?.[String(dow)] || null;
}
export async function setWeekdayTemplate(dow, taskTemplates) {
  const p = (await getProfile()) || {};
  const templates = { ...(p.weekdayTemplates || {}) };
  templates[String(dow)] = taskTemplates;
  await setProfile({ weekdayTemplates: templates });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: SHIFTS
// ═══════════════════════════════════════════════════════════════
export async function getShifts() {
  const { data, error } = await supabase.from('shifts').select('*').order('ord');
  _fail(error);
  return (data || []).map(_shiftFromRow);
}
export async function saveShift(id, data) {
  if (id) { const { error } = await supabase.from('shifts').update(_shiftToRow(data)).eq('id', id); _fail(error); }
  else    { const { data: r, error } = await supabase.from('shifts').insert(_shiftToRow(data)).select('id').single(); _fail(error); return r.id; }
}
export async function deleteShift(id) { const { error } = await supabase.from('shifts').delete().eq('id', id); _fail(error); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: CATEGORIES
// ═══════════════════════════════════════════════════════════════
export async function getCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('ord');
  _fail(error);
  return (data || []).map(_catFromRow);
}
export async function saveCategory(id, data) {
  if (id) { const { error } = await supabase.from('categories').update(_catToRow(data)).eq('id', id); _fail(error); }
  else    { const { data: r, error } = await supabase.from('categories').insert(_catToRow(data)).select('id').single(); _fail(error); return r.id; }
}
export async function deleteCategory(id) { const { error } = await supabase.from('categories').delete().eq('id', id); _fail(error); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: ACTIVITIES (biblioteca — guardada como JSONB `data`)
// ═══════════════════════════════════════════════════════════════
export async function getActivities() {
  const { data, error } = await supabase.from('activities').select('*');
  _fail(error);
  return (data || []).map(r => ({ id: r.id, ...(r.data || {}) }));
}
export async function saveActivity(id, data) {
  if (id) { const { error } = await supabase.from('activities').update({ data }).eq('id', id); _fail(error); }
  else    { const { data: r, error } = await supabase.from('activities').insert({ data }).select('id').single(); _fail(error); return r.id; }
}
export async function deleteActivity(id) { const { error } = await supabase.from('activities').delete().eq('id', id); _fail(error); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 6.5: WEEK NOTES (reflexões semanais)
// ═══════════════════════════════════════════════════════════════
export async function getWeekNote(mondayId) {
  const { data, error } = await supabase.from('week_notes').select('data').eq('monday', mondayId).maybeSingle();
  _fail(error);
  return data ? data.data : null;
}
export async function setWeekNote(mondayId, dataIn) {
  const { data: cur } = await supabase.from('week_notes').select('data').eq('monday', mondayId).maybeSingle();
  const merged = { ...(cur?.data || {}), ...dataIn };
  const { error } = await supabase.from('week_notes').upsert({ user_id: uid(), monday: mondayId, data: merged }, { onConflict: 'user_id,monday' });
  _fail(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: DAYS + TASKS
// ═══════════════════════════════════════════════════════════════
export function dayId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getDay(id) {
  const { data, error } = await supabase.from('days').select('meta').eq('day', id).maybeSingle();
  _fail(error);
  return data ? { id, ...(data.meta || {}) } : null;
}
export async function setDayMeta(id, dataIn) {
  const { data: cur } = await supabase.from('days').select('meta').eq('day', id).maybeSingle();
  const meta = { ...(cur?.meta || {}), ...dataIn };
  const { error } = await supabase.from('days').upsert({ user_id: uid(), day: id, meta }, { onConflict: 'user_id,day' });
  _fail(error);
}

export async function getDayTasks(dayDocId) {
  const { data, error } = await supabase.from('tasks').select('*').eq('day', dayDocId).order('ord');
  _fail(error);
  return (data || []).map(_taskFromRow);
}

let _streakOriginChecked = false;
export async function addDayTask(dayDocId, task) {
  await setDayMeta(dayDocId, { hasActivity: true });
  if (!_streakOriginChecked) {
    _streakOriginChecked = true;
    const p = await getProfile();
    if (!p?.streakOrigin) await setProfile({ streakOrigin: dayDocId });
  }
  const { data, error } = await supabase.from('tasks').insert(_taskToRow(task, dayDocId)).select('id').single();
  _fail(error);
  return data.id;
}
export async function updateDayTask(dayDocId, taskId, data) {
  const { row, extraKeys } = _taskPatchToRow(data);
  if (extraKeys) {
    const { data: cur } = await supabase.from('tasks').select('extra').eq('id', taskId).maybeSingle();
    row.extra = { ...(cur?.extra || {}), ...extraKeys };
  }
  const { error } = await supabase.from('tasks').update(row).eq('id', taskId);
  _fail(error);
}
export async function deleteDayTask(dayDocId, taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  _fail(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8: HELPERS DE TEMPO (puros — sem banco)
// ═══════════════════════════════════════════════════════════════
export function parseTime(s) {
  if (!s) return null;
  const str = String(s).trim().toLowerCase();
  const m = str.match(/^(\d{1,2})\s*[h:]?\s*(\d{0,2})$/);
  if (!m) return null;
  const h = parseInt(m[1]);
  const mn = parseInt(m[2] || '0');
  if (isNaN(h) || isNaN(mn) || h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}
export function formatTime(mins) {
  if (mins === null || mins === undefined) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}
export function sleepDuration(sleepStr, wakeStr) {
  const s = parseTime(sleepStr);
  const w = parseTime(wakeStr);
  if (s === null || w === null) return null;
  let dur = w - s;
  if (dur <= 0) dur += 24 * 60;
  return dur;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 9: STATS / AGREGAÇÕES
// ═══════════════════════════════════════════════════════════════
// Busca todos os dias entre start e end (inclusive), com suas tasks.
// 2 queries (dias + tasks) e agrupa — evita N+1 do Firestore.
export async function fetchDaysRange(startDate, endDate) {
  const startId = dayId(startDate);
  const endId = dayId(endDate);
  const [dRes, tRes] = await Promise.all([
    supabase.from('days').select('day, meta').gte('day', startId).lte('day', endId),
    supabase.from('tasks').select('*').gte('day', startId).lte('day', endId).order('ord'),
  ]);
  _fail(dRes.error); _fail(tRes.error);
  const map = new Map();
  for (const d of (dRes.data || [])) map.set(d.day, { id: d.day, ...(d.meta || {}), tasks: [] });
  for (const t of (tRes.data || [])) {
    if (!map.has(t.day)) map.set(t.day, { id: t.day, tasks: [] });
    map.get(t.day).tasks.push(_taskFromRow(t));
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function aggregateByCategory(days, categories) {
  const totals = { _none: { done: 0, total: 0 } };
  for (const c of categories) totals[c.id] = { done: 0, total: 0 };
  for (const d of days) {
    for (const t of (d.tasks || [])) {
      const key = t.categoryId || '_none';
      if (!totals[key]) totals[key] = { done: 0, total: 0 };
      totals[key].total++;
      if (t.done) totals[key].done++;
    }
  }
  return totals;
}
export function aggregateTotal(days) {
  let done = 0, total = 0;
  for (const d of days) {
    for (const t of (d.tasks || [])) { total++; if (t.done) done++; }
  }
  return { done, total, pct: total ? Math.round(done / total * 100) : 0, pendentes: total - done };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 10: SEED "Organização Pessoal"
// ═══════════════════════════════════════════════════════════════
export async function seedOrganizacaoPessoal() {
  const existing = await getShifts();
  if (existing.length > 0) return; // já tem dados, não duplica

  const shifts = [
    { name: 'Manhã', desc: 'das 05h até o almoço', icon: '🌅', order: 1, gradient: 'linear-gradient(135deg, #fbbf24, #f97316)' },
    { name: 'Tarde', desc: 'do almoço até o jantar', icon: '☀️', order: 2, gradient: 'linear-gradient(135deg, #60a5fa, #818cf8)' },
    { name: 'Noite', desc: 'do jantar até dormir',  icon: '🌙', order: 3, gradient: 'linear-gradient(135deg, #6366f1, #a78bfa)' },
  ];
  const { error: se } = await supabase.from('shifts').insert(shifts.map(_shiftToRow));
  _fail(se);

  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const cats = [
    { name: 'Hidratação',  icon: '💧', color: '#60a5fa', order: 1, daysOfWeek: ALL_DAYS },
    { name: 'Alimentação', icon: '🥗', color: '#34d399', order: 2, daysOfWeek: ALL_DAYS },
    { name: 'Treino',      icon: '💪', color: '#f472b6', order: 3, daysOfWeek: [1, 2, 3, 4] },
    { name: 'Estudo',      icon: '📚', color: '#a78bfa', order: 4, daysOfWeek: [1, 2, 3, 4, 5] },
  ];
  const { error: ce } = await supabase.from('categories').insert(cats.map(_catToRow));
  _fail(ce);
}
