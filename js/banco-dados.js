// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — HELPERS DE REFERÊNCIA (uid + refs)
// BLOCO 3 — PROFILE (config do usuário)
// BLOCO 3.5 — WEEKDAY TEMPLATES — padrão por dia da semana
// BLOCO 4 — SHIFTS (turnos)
// BLOCO 5 — CATEGORIES
// BLOCO 6 — ACTIVITIES (biblioteca)
// BLOCO 6.5 — WEEK NOTES (reflexões semanais — usado em Desempenho)
// BLOCO 7 — DAYS (registros por dia + tarefas do dia)
// BLOCO 8 — HELPERS DE TEMPO (parse, format, duração de sono)
// BLOCO 9 — STATS / AGREGAÇÕES (usado pelo Desempenho)
// BLOCO 10 — SEED do template "Organização Pessoal"
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Data layer — abstrai todo CRUD do Firestore por trás de helpers semânticos.
// Cada usuário tem: /users/{uid}/{shifts|categories|activities|days}
import {
  auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, orderBy, where, serverTimestamp
} from './autenticacao.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: HELPERS DE REFERÊNCIA (uid + refs)
// ═══════════════════════════════════════════════════════════════
function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error('Usuário não autenticado');
  return u.uid;
}
function userRef() { return doc(db, 'users', uid()); }
function colRef(name) { return collection(db, 'users', uid(), name); }
function itemRef(name, id) { return doc(db, 'users', uid(), name, id); }


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: PROFILE (config do usuário)
// ═══════════════════════════════════════════════════════════════
export async function getProfile() {
  const snap = await getDoc(userRef());
  return snap.exists() ? snap.data() : null;
}
export async function setProfile(data) {
  await setDoc(userRef(), data, { merge: true });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3.5: WEEKDAY TEMPLATES — padrão por dia da semana
// Quando o usuário modifica um dia, o estado vira modelo da próxima vez
// que abrir o mesmo dia-da-semana. Salvo em profile.weekdayTemplates.
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
// BLOCO 4: SHIFTS (turnos)
// ═══════════════════════════════════════════════════════════════
export async function getShifts() {
  const q = query(colRef('shifts'), orderBy('order'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveShift(id, data) {
  if (id) await updateDoc(itemRef('shifts', id), data);
  else { const ref = await addDoc(colRef('shifts'), data); return ref.id; }
}
export async function deleteShift(id) { await deleteDoc(itemRef('shifts', id)); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: CATEGORIES
// ═══════════════════════════════════════════════════════════════
export async function getCategories() {
  const q = query(colRef('categories'), orderBy('order'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveCategory(id, data) {
  if (id) await updateDoc(itemRef('categories', id), data);
  else { const ref = await addDoc(colRef('categories'), data); return ref.id; }
}
export async function deleteCategory(id) { await deleteDoc(itemRef('categories', id)); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: ACTIVITIES (biblioteca)
// ═══════════════════════════════════════════════════════════════
export async function getActivities() {
  const snap = await getDocs(colRef('activities'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveActivity(id, data) {
  if (id) await updateDoc(itemRef('activities', id), data);
  else { const ref = await addDoc(colRef('activities'), { ...data, createdAt: serverTimestamp() }); return ref.id; }
}
export async function deleteActivity(id) { await deleteDoc(itemRef('activities', id)); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 6.5: WEEK NOTES (reflexões semanais — usado em Desempenho)
// Identificado pelo ID da Segunda da semana (YYYY-MM-DD)
// ═══════════════════════════════════════════════════════════════
export async function getWeekNote(mondayId) {
  const ref = doc(db, 'users', uid(), 'weeks', mondayId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function setWeekNote(mondayId, data) {
  const ref = doc(db, 'users', uid(), 'weeks', mondayId);
  await setDoc(ref, data, { merge: true });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: DAYS (registros por dia + tarefas do dia)
// ═══════════════════════════════════════════════════════════════
export function dayId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getDay(id) {
  const snap = await getDoc(itemRef('days', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}
export async function setDayMeta(id, data) {
  await setDoc(itemRef('days', id), data, { merge: true });
}

// Tasks de um dia (sub-subcollection)
export async function getDayTasks(dayDocId) {
  const q = query(collection(db, 'users', uid(), 'days', dayDocId, 'tasks'), orderBy('order'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
let _streakOriginChecked = false; // evita leitura extra a cada task após o primeiro check

export async function addDayTask(dayDocId, task) {
  await setDoc(itemRef('days', dayDocId), { hasActivity: true }, { merge: true });
  if (!_streakOriginChecked) {
    _streakOriginChecked = true;
    const snap = await getDoc(userRef());
    if (!snap.exists() || !snap.data()?.streakOrigin) {
      await setDoc(userRef(), { streakOrigin: dayDocId }, { merge: true });
    }
  }
  const ref = await addDoc(collection(db, 'users', uid(), 'days', dayDocId, 'tasks'), task);
  return ref.id;
}
export async function updateDayTask(dayDocId, taskId, data) {
  await updateDoc(doc(db, 'users', uid(), 'days', dayDocId, 'tasks', taskId), data);
}
export async function deleteDayTask(dayDocId, taskId) {
  await deleteDoc(doc(db, 'users', uid(), 'days', dayDocId, 'tasks', taskId));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8: HELPERS DE TEMPO (parse, format, duração de sono)
// ═══════════════════════════════════════════════════════════════
// Aceita "5h", "5h00", "5h30", "22h", "22:30", "5:30"
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
  return `${h}h${String(m).padStart(2,'0')}`;
}

// Duração entre dormir → acordar (em minutos)
export function sleepDuration(sleepStr, wakeStr) {
  const s = parseTime(sleepStr);
  const w = parseTime(wakeStr);
  if (s === null || w === null) return null;
  let dur = w - s;
  if (dur <= 0) dur += 24 * 60; // atravessa meia-noite
  return dur;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 9: STATS / AGREGAÇÕES (usado pelo Desempenho)
// ═══════════════════════════════════════════════════════════════
// Busca todos os dias entre start e end (inclusive), com suas tasks.
// Retorna { days: [{id, ...meta, tasks: [...]}] }
export async function fetchDaysRange(startDate, endDate) {
  const startId = dayId(startDate);
  const endId = dayId(endDate);
  const q = query(colRef('days'), where('__name__', '>=', startId), where('__name__', '<=', endId));
  const snap = await getDocs(q);
  const days = [];
  for (const d of snap.docs) {
    const tasksSnap = await getDocs(collection(db, 'users', uid(), 'days', d.id, 'tasks'));
    days.push({ id: d.id, ...d.data(), tasks: tasksSnap.docs.map(t => ({ id: t.id, ...t.data() })) });
  }
  return days;
}

// Agregação por categoria
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

// Total global de um conjunto de dias
export function aggregateTotal(days) {
  let done = 0, total = 0;
  for (const d of days) {
    for (const t of (d.tasks || [])) {
      total++;
      if (t.done) done++;
    }
  }
  return { done, total, pct: total ? Math.round(done / total * 100) : 0, pendentes: total - done };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 10: SEED do template "Organização Pessoal"
// ═══════════════════════════════════════════════════════════════
// Cria turnos + categorias padrão (atividades vêm na Fase 4 via migração)
export async function seedOrganizacaoPessoal() {
  const existingShifts = await getShifts();
  if (existingShifts.length > 0) return; // já tem dados, não duplica

  const shifts = [
    { name: 'Manhã', desc: 'das 05h até o almoço', icon: '🌅', order: 1, gradient: 'linear-gradient(135deg, #fbbf24, #f97316)' },
    { name: 'Tarde', desc: 'do almoço até o jantar', icon: '☀️', order: 2, gradient: 'linear-gradient(135deg, #60a5fa, #818cf8)' },
    { name: 'Noite', desc: 'do jantar até dormir',  icon: '🌙', order: 3, gradient: 'linear-gradient(135deg, #6366f1, #a78bfa)' }
  ];
  for (const s of shifts) await addDoc(colRef('shifts'), s);

  const ALL_DAYS = [0,1,2,3,4,5,6];
  const cats = [
    { name: 'Hidratação',  icon: '💧', color: '#60a5fa', order: 1, daysOfWeek: ALL_DAYS },
    { name: 'Alimentação', icon: '🥗', color: '#34d399', order: 2, daysOfWeek: ALL_DAYS },
    { name: 'Treino',      icon: '💪', color: '#f472b6', order: 3, daysOfWeek: [1,2,3,4] }, // Seg-Qui
    { name: 'Estudo',      icon: '📚', color: '#a78bfa', order: 4, daysOfWeek: [1,2,3,4,5] } // Seg-Sex
  ];
  for (const c of cats) await addDoc(colRef('categories'), c);
}
