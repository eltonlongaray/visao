// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getShifts, getCategories, getActivities,
  getDay, setDayMeta, getDayTasks, addDayTask, updateDayTask, deleteDayTask, dayId,
  getProfile, parseTime,
  getWeekdayTemplate, setWeekdayTemplate,
  saveCategory
} from '../store.js';
import { bottomNav } from '../components/bottom-nav.js';
import { showToast, showLocalToast, confirmModal } from '../toast.js';
import { playDone, playUndone, playDelete } from '../sounds.js';
import { openTimePicker } from '../time-picker.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONSTANTES (labels de data + frases motivacionais)
// ═══════════════════════════════════════════════════════════════
const WEEKDAYS_FULL = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Mensagens aleatórias quando tarefa é marcada feita (clássico + gym bro)
const DONE_MESSAGES = [
  'BORAAA! 🚀',
  'Mandou bem! 💪',
  'Mitou! 🔥',
  'Olha o foco! 🎯',
  'FERAAA! 🏆',
  'Tá voando! ✈️',
  'Tô orgulhoso, monstro 😎',
  'Animal! 🦁',
  'Foco, força e fé! ⚡',
  'Disciplina é tudo 🧘',
  'Tá rachando! 💥',
  'TÁ MARCANDO! 📌',
  // +15 novas
  'Mais um na conta! 📈',
  'Sequência boa! 🌊',
  'Imparável! 🏃',
  'Não é sorte, é treino! 🧠',
  'BICHO! 🐺',
  'Tá trincado! 💎',
  'Outro level! 🆙',
  'Crescendo a cada dia 🌱',
  'Mostrando serviço! 🛠️',
  'Você é foda! 💯',
  'Boa, atleta! 🏅',
  'Olha o craque! ⭐',
  'Vai derrubar a meta! 🏁',
  'Constância é a chave 🔑',
  'Sem desculpa, hein! 🚫'
];
function randomDoneMessage() {
  return DONE_MESSAGES[Math.floor(Math.random() * DONE_MESSAGES.length)];
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESTADO DO MÓDULO
// ═══════════════════════════════════════════════════════════════
let shifts = [], categories = [], activities = [], profile = {};
let weekStart = getWeekStart(new Date());  // Domingo da semana exibida
let weekData = [];                          // [{ date, id, meta, tasks }, ...7]
const expanded = new Set();                 // ids dos dias abertos
const saveTimers = {};                      // debounce de save por dayId+field
let handlersAttached = false;               // FIX: evita listeners duplicados ao re-renderizar


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: HELPERS DE DATA
// ═══════════════════════════════════════════════════════════════
function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Semana começa na SEGUNDA. Domingo (getDay=0) recua 6 dias; Seg=0; Ter=1; ...
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  return d;
}

function isSameWeek(a, b) {
  return getWeekStart(a).getTime() === getWeekStart(b).getTime();
}

function weekOfMonth(date) {
  // Considera semana iniciando na Segunda (ISO-style)
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDow = firstDay.getDay();
  const firstOffset = firstDow === 0 ? 6 : firstDow - 1; // dom=6, seg=0, ...
  return Math.ceil((date.getDate() + firstOffset) / 7);
}

function pctClass(p) { return p >= 80 ? 'high' : p >= 60 ? 'mid' : 'low'; }

function hydrationMsg(ml, goal) {
  if (!ml) return 'comece com 1 copo (250ml)';
  if (!goal || goal <= 0) goal = 2000;
  const pct = (ml / goal) * 100;
  if (pct >= 200) return `${Math.round(pct)}% — exagerou um pouco hein 😅`;
  if (pct >= 120) return `${Math.round(pct)}% — passou da meta, ótimo!`;
  if (pct >= 100) return `meta batida! 💪`;
  if (pct >= 75) return `${Math.round(pct)}% — quase lá`;
  if (pct >= 50) return `${Math.round(pct)}% — bom ritmo`;
  return `${Math.round(pct)}% — ainda tem que beber bastante`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: LABELS DA SEMANA / MÊS
// ═══════════════════════════════════════════════════════════════
function computeMonthLabel() {
  // Mostra só o ano — o mês já aparece no range de datas abaixo (ex: "31 Mai → 06 Jun")
  const rep = weekData[3].date; // quinta-feira (meio da semana Seg→Dom)
  return String(rep.getFullYear());
}

function weekRangeLabel() {
  const rep = weekData[3].date; // quinta-feira (meio da semana Seg→Dom)
  const w = weekOfMonth(rep);
  const s = weekData[0].date, e = weekData[6].date;
  return `${w}ª semana · ${String(s.getDate()).padStart(2,'0')} ${MONTHS[s.getMonth()]} → ${String(e.getDate()).padStart(2,'0')} ${MONTHS[e.getMonth()]}`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6: DATA LOADING (Firestore)
// ═══════════════════════════════════════════════════════════════
async function loadWeek() {
  const promises = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const id = dayId(d);
    promises.push((async () => {
      const [meta, tasks] = await Promise.all([getDay(id), getDayTasks(id)]);
      // FIX: sempre aplica defaults — se Firestore tem meta parcial (ex: só wake/sleep
      // gravado antes da feature de hidratação), os campos faltantes voltam ao padrão.
      const fullMeta = {
        wakeTime: '', sleepTime: '',
        hydrationMl: 0, hydrationGoal: 2000,
        notes: '',
        ...(meta || {})
      };
      // Se hydrationGoal ainda for 0/undefined/NaN, força 2000
      if (!fullMeta.hydrationGoal || fullMeta.hydrationGoal <= 0) {
        fullMeta.hydrationGoal = 2000;
      }
      return { date: d, id, meta: fullMeta, tasks };
    })());
  }
  weekData = await Promise.all(promises);
  // Após carregar, auto-gera tarefas dos dias virgens
  await autoGenerateMissingTasks();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6.5: AUTO-GERAÇÃO DE TAREFAS
//
// Estratégia em 2 camadas:
//   1. Se HÁ template salvo pra esse dia-da-semana (Mon/Tue/...): usa ele
//      (replica o padrão que o usuário criou em ocorrências anteriores)
//   2. Senão: gera das atividades-categoria cuja daysOfWeek inclui esse dow
//      (auto-gen baseado em recorrência declarada na Home)
//
// + Tarefas auto-geradas já processadas ficam em `autoGeneratedFor`
//   pra não duplicar quando o usuário adicionar nova atividade.
// ═══════════════════════════════════════════════════════════════
async function autoGenerateMissingTasks() {
  const todayId = dayId(new Date());
  for (const day of weekData) {
    const dow = day.date.getDay();
    const template = profile?.weekdayTemplates?.[String(dow)];

    // ────── 1) Dia virgem (sem tarefas + nunca gerado) ──────
    if (day.tasks.length === 0 && !day.meta.generated) {
      if (Array.isArray(template) && template.length > 0) {
        await addTemplateTasksToDay(day, template, 0);
      } else {
        // Fallback: gera das atividades com esse dow
        const eligible = categories.filter(a =>
          Array.isArray(a.daysOfWeek) && a.daysOfWeek.includes(dow)
        );
        let order = 0;
        for (const a of eligible) {
          const newTask = {
            activityId: null, title: a.name, desc: '', startTime: '',
            shiftId: shifts[0]?.id || null, categoryId: a.id,
            done: false, order: order++, autoGenerated: true
          };
          const tid = await addDayTask(day.id, newTask);
          day.tasks.push({ id: tid, ...newTask });
        }
      }
      await setDayMeta(day.id, { generated: true });
      day.meta.generated = true;
      continue;
    }

    // ────── 2) Dia já gerado: sincroniza FALTANTES do template ──────
    // (só pra HOJE em diante — não bagunça o passado)
    if (day.meta.generated && Array.isArray(template) && template.length > 0 && day.id >= todayId) {
      const existing = new Set(day.tasks.map(t => keyOf(t)));
      const missing = template.filter(tmpl => !existing.has(keyOf(tmpl)));
      if (missing.length > 0) {
        await addTemplateTasksToDay(day, missing, day.tasks.length);
      }
    }
  }
}

// Helper: insere tarefas do template a partir de uma posição (order)
async function addTemplateTasksToDay(day, templateTasks, startOrder) {
  let order = startOrder;
  for (const tmpl of templateTasks) {
    const newTask = {
      activityId: tmpl.activityId || null,
      title: tmpl.title || 'Sem título',
      desc: tmpl.desc || '',
      startTime: tmpl.startTime || '',
      shiftId: tmpl.shiftId || shifts[0]?.id || null,
      categoryId: tmpl.categoryId || null,
      icon: tmpl.icon || '',
      reminderEnabled: tmpl.reminderEnabled || false,
      done: false,
      order: order++
    };
    const tid = await addDayTask(day.id, newTask);
    day.tasks.push({ id: tid, ...newTask });
  }
}

// Chave de identidade da tarefa: categoria + título + turno + horário
// Usada pra evitar duplicar quando sincroniza template em dias já gerados
function keyOf(t) {
  return `${t.categoryId || ''}|${t.title || ''}|${t.shiftId || ''}|${t.startTime || ''}`;
}

// Sincroniza o template do dia-da-semana com o estado ATUAL do dia.
// Chamado depois de cada modificação (add/edit/delete/dup/reorder).
async function syncTemplateForDay(dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  const dow = day.date.getDay();
  const templates = day.tasks
    .slice()
    .sort(taskSort)
    .map(t => ({
      activityId: t.activityId || null,
      title: t.title,
      desc: t.desc || '',
      startTime: t.startTime || '',
      shiftId: t.shiftId || null,
      categoryId: t.categoryId || null,
      icon: t.icon || '',
      reminderEnabled: t.reminderEnabled || false
    }));
  try {
    await setWeekdayTemplate(dow, templates);
    if (!profile.weekdayTemplates) profile.weekdayTemplates = {};
    profile.weekdayTemplates[String(dow)] = templates;
  } catch (err) {
    console.error('[Visão] Erro ao salvar template:', err);
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: ENTRY POINT — render principal da tela Ritual
// ═══════════════════════════════════════════════════════════════
export async function renderRitual(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">Carregando ritual...</div>`;
  // Sempre que abre o Ritual, volta pra semana de HOJE (evita ficar preso em semanas longe)
  weekStart = getWeekStart(new Date());
  try {
    [shifts, categories, activities, profile] = await Promise.all([
      getShifts(), getCategories(), getActivities(), getProfile()
    ]);
    profile = profile || {};
  } catch (err) {
    app.innerHTML = `<div style="padding:40px;text-align:center"><p style="color:var(--red)">${err.message}</p></div>`;
    return;
  }
  if (expanded.size === 0) expanded.add(dayId(new Date()));
  await loadWeek();
  renderUI(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 8: RENDER DA UI (HTML estático)
// ═══════════════════════════════════════════════════════════════
function renderUI(app) {
  const onCurrentWeek = isSameWeek(weekStart, new Date());
  app.innerHTML = `
    <div class="screen-pad ritual-screen">
      <div class="ritual-month-label">
        ${computeMonthLabel()}
        ${!onCurrentWeek ? '<button class="back-to-today" id="back-today">↺ Voltar pra hoje</button>' : ''}
      </div>

      <div class="week-pager">
        <button class="swipe-arrow" data-nav="prev-week">‹</button>
        <div class="day-info-center">
          <div class="dt">${weekRangeLabel()}</div>
          <div class="meta">use as setas pra trocar de semana</div>
        </div>
        <button class="swipe-arrow" data-nav="next-week">›</button>
      </div>

      <div class="days-list">
        ${weekData.map(d => dayCard(d)).join('')}
      </div>
    </div>
    ${bottomNav('ritual')}
  `;
  attachHandlers(app);
  initTaskSortables();  // habilita drag-drop em cada task-list
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.5: DRAG-DROP DE TAREFAS (SortableJS)
// Reordena dentro do mesmo turno; persiste a nova ordem no Firestore
// ═══════════════════════════════════════════════════════════════
function initTaskSortables() {
  if (typeof Sortable === 'undefined') return; // CDN ainda não carregou
  document.querySelectorAll('.task-list').forEach(list => {
    new Sortable(list, {
      animation: 180,
      filter: '.task-thumb, .task-menu-btn-corner, button, input, textarea, select, a',
      preventOnFilter: false,
      delay: 250,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      // Auto-scroll perto da borda
      scroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 18,
      ghostClass: 'task-ghost',
      dragClass: 'task-dragging',
      // Sem chosenClass (transform interferia no clone) — feedback fica só pelo onChoose
      onChoose: () => {
        if (navigator.vibrate) navigator.vibrate(15);
      },
      onEnd: async (evt) => {
        const taskEls = Array.from(evt.to.querySelectorAll('[data-task-id]'));
        const dayDocId = taskEls[0]?.dataset.day;
        if (!dayDocId) return;
        const day = weekData.find(d => d.id === dayDocId);
        if (!day) return;
        // Atualiza order de cada tarefa daquele turno
        const updates = [];
        taskEls.forEach((el, idx) => {
          const tid = el.dataset.taskId;
          const t = day.tasks.find(x => x.id === tid);
          if (t && t.order !== idx) {
            t.order = idx;
            updates.push(updateDayTask(dayDocId, tid, { order: idx }));
          }
        });
        await Promise.all(updates);
        // Reordenou — atualiza template do dia-da-semana
        syncTemplateForDay(dayDocId);
      }
    });
  });
}

function dayCard(d) {
  const isExpanded = expanded.has(d.id);
  const isToday = d.id === dayId(new Date());
  const total = d.tasks.length;
  const done = d.tasks.filter(t => t.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return `
    <div class="day-card ${isExpanded ? 'open' : ''} ${isToday ? 'today' : ''}" data-day-id="${d.id}" data-dow="${d.date.getDay()}">
      <button class="day-card-header" data-toggle-day="${d.id}">
        <div class="day-card-name">
          <span class="dow">${WEEKDAYS_FULL[d.date.getDay()]}</span>
          <span class="dnum">${String(d.date.getDate()).padStart(2,'0')} ${MONTHS[d.date.getMonth()]}</span>
          ${isToday ? '<span class="today-badge">HOJE</span>' : ''}
        </div>
        <div class="day-card-stats">${statsHtml(total, done, pct)}</div>
        <span class="day-card-chevron">▾</span>
      </button>
      <div class="day-card-content">${renderDayContent(d)}</div>
    </div>
  `;
}

function statsHtml(total, done, pct) {
  if (!total) return '<small class="day-empty-tag">vazio</small>';
  return `<span class="pct ${pctClass(pct)}">${pct}%</span><small>${done}/${total}</small>`;
}

function renderDayContent(d) {
  const hydPct = Math.min(100, Math.round((d.meta.hydrationMl / d.meta.hydrationGoal) * 100 || 0));
  const wakePh = profile.defaultWakeTime ? toHHMM(profile.defaultWakeTime) : '';
  const sleepPh = profile.defaultSleepTime ? toHHMM(profile.defaultSleepTime) : '';
  return `
    <div class="time-pills">
      <label class="time-pill">
        <span class="time-pill-label">🌅 Acordei</span>
        <button type="button" class="time-pill-input tp-pill-trigger" data-meta="wakeTime" data-day="${d.id}" data-time="${toHHMM(d.meta.wakeTime) || ''}">${toHHMM(d.meta.wakeTime) || wakePh || '--:--'}</button>
      </label>
      <label class="time-pill">
        <span class="time-pill-label">🌙 Dormi</span>
        <button type="button" class="time-pill-input tp-pill-trigger" data-meta="sleepTime" data-day="${d.id}" data-time="${toHHMM(d.meta.sleepTime) || ''}">${toHHMM(d.meta.sleepTime) || sleepPh || '--:--'}</button>
      </label>
    </div>

    ${renderShiftsForDay(d)}

    <div class="hydration">
      <div class="hydration-top">
        <div class="hydration-label">💧 Hidratação</div>
        <div class="hydration-goal-label">meta: ${d.meta.hydrationGoal} ml</div>
      </div>
      <div class="hydration-stepper">
        <button class="hyd-btn" data-hyd-step="-250" data-day="${d.id}" title="−250ml">−</button>
        <div class="hyd-value">
          <span class="hyd-ml" data-day="${d.id}">${d.meta.hydrationMl || 0}</span><small>ml</small>
        </div>
        <button class="hyd-btn" data-hyd-step="250" data-day="${d.id}" title="+250ml">+</button>
      </div>
      <div class="hydration-bar"><div class="hydration-fill" data-day="${d.id}" style="width:${hydPct}%"></div></div>
      <div class="hydration-msg" data-day="${d.id}">${hydrationMsg(d.meta.hydrationMl, d.meta.hydrationGoal)}</div>
    </div>

    <div class="day-note-wrap" data-day="${d.id}">
      ${renderDayNoteButton(d)}
    </div>
  `;
}

function renderDayNoteButton(d) {
  const note = d.meta.dayNote;
  const hasNote = note && (note.prideFail || note.improve || note.daySleepHours || note.nightWakes || note.done || note.daySleep);
  if (hasNote) {
    const preview = (note.prideFail || note.done || note.improve || '').trim().slice(0, 80);
    return `
      <button class="day-note-btn registered" data-action="open-note" data-day="${d.id}">
        <span class="dnote-ic">✅</span>
        <span class="dnote-body">
          <strong>Nota registrada</strong>
          <small>${escape(preview)}${preview.length >= 80 ? '...' : ''}</small>
        </span>
        <span class="dnote-edit">✏️</span>
      </button>
    `;
  }
  return `
    <button class="day-note-btn" data-action="open-note" data-day="${d.id}">
      <span class="dnote-ic">📝</span>
      <span class="dnote-body">
        <strong>Registrar nota</strong>
        <small>Responda 3 perguntas pra fechar o dia</small>
      </span>
      <span class="dnote-edit">›</span>
    </button>
  `;
}

function renderShiftsForDay(d) {
  const byShift = {};
  for (const s of shifts) byShift[s.id] = [];
  byShift['_none'] = [];
  for (const t of d.tasks) (byShift[t.shiftId] || byShift['_none']).push(t);

  if (shifts.length === 0) {
    return `<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">
      Sem turnos. Vai pra <a href="#/home" style="color:var(--accent)">Home</a> configurar.
    </div>`;
  }

  // Sugestão: copiar do dia anterior preenchido na semana
  const copyBanner = renderCopyDayBanner(d);

  return copyBanner + shifts.map(s => `
    <div class="shift" data-shift-id="${s.id}" data-day-shift="${d.id}">
      <div class="shift-header">
        <div class="shift-icon" style="background:${s.gradient || 'linear-gradient(135deg,#a78bfa,#60a5fa)'}">${s.icon || '🕐'}</div>
        <div class="shift-title">${escape(s.name)}</div>
        <div class="shift-count">${byShift[s.id].length} tarefas</div>
        <button class="shift-add" data-add-to="${s.id}" data-day="${d.id}" title="Adicionar atividade">+</button>
      </div>
      <div class="task-list">
        ${byShift[s.id].sort(taskSort).map(t => taskCard(t, d.id)).join('') || '<div class="empty-shift">vazio — toque em + pra adicionar</div>'}
      </div>
    </div>
  `).join('');
}

// Banner "Trazer dados de [dia anterior]" — em dia vazio com dias anteriores preenchidos
const WEEKDAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const WEEKDAY_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const dismissedCopyBanners = new Set();  // ids de dia que o usuário dispensou na sessão

function renderCopyDayBanner(d) {
  if (d.tasks.length > 0) return '';
  if (dismissedCopyBanners.has(d.id)) return '';
  const prevDays = findAllPrevDaysWithTasks(d.id);
  if (prevDays.length === 0) return '';

  // ── Caso 1: apenas 1 dia anterior preenchido → pergunta direta Sim/Não ──
  if (prevDays.length === 1) {
    const prev = prevDays[0];
    const n = prev.tasks.length;
    return `
      <div class="copy-day-banner">
        <div class="copy-day-ic">📋</div>
        <div class="copy-day-body">
          <strong>Trazer dados de ${WEEKDAY_NAMES[prev.date.getDay()]}?</strong>
          <small>${n} tarefa${n === 1 ? '' : 's'} pra reaproveitar</small>
        </div>
        <div class="copy-day-actions">
          <button class="copy-day-btn" data-copy-from="${prev.id}" data-copy-to="${d.id}">Sim, trazer</button>
          <button class="copy-day-no" data-copy-no="${d.id}">Não</button>
        </div>
      </div>
    `;
  }

  // ── Caso 2: 2+ dias anteriores → chips pra escolher qual dia copiar ──
  const dayList = prevDays.map(p => WEEKDAY_NAMES[p.date.getDay()]);
  const dayListStr = dayList.length === 2
    ? dayList.join(' ou ')
    : dayList.slice(0, -1).join(', ') + ' ou ' + dayList[dayList.length - 1];

  const chips = prevDays.map(p =>
    `<button class="copy-day-chip" data-copy-from="${p.id}" data-copy-to="${d.id}" title="${p.tasks.length} tarefa${p.tasks.length===1?'':'s'}">
       ${WEEKDAY_SHORT[p.date.getDay()]} <small>(${p.tasks.length})</small>
     </button>`
  ).join('');

  return `
    <div class="copy-day-banner copy-day-banner-multi">
      <div class="copy-day-ic">📋</div>
      <div class="copy-day-body">
        <strong>Trazer atividades de ${dayListStr}?</strong>
        <small>Se sim, toque no dia:</small>
        <div class="copy-day-chips">${chips}</div>
      </div>
      <button class="copy-day-no copy-day-no-corner" data-copy-no="${d.id}" title="Dispensar">×</button>
    </div>
  `;
}

function findAllPrevDaysWithTasks(dayId) {
  const idx = weekData.findIndex(d => d.id === dayId);
  if (idx <= 0) return [];
  return weekData.slice(0, idx).filter(d => d.tasks.length > 0);
}

async function copyDayTasksTo(fromId, toId) {
  const fromDay = weekData.find(d => d.id === fromId);
  const toDay   = weekData.find(d => d.id === toId);
  if (!fromDay || !toDay) return 0;

  const sorted = fromDay.tasks.slice().sort(taskSort);
  let order = 0;
  for (const t of sorted) {
    const newTask = {
      activityId: t.activityId || null,
      title: t.title,
      desc: t.desc || '',
      startTime: t.startTime || '',
      shiftId: t.shiftId || (shifts[0]?.id || null),
      categoryId: t.categoryId || null,
      icon: t.icon || '',
      done: false,
      order: order++,
      reminderEnabled: t.reminderEnabled || false
    };
    const tid = await addDayTask(toId, newTask);
    toDay.tasks.push({ id: tid, ...newTask });
  }
  await setDayMeta(toId, { generated: true });
  toDay.meta.generated = true;
  return sorted.length;
}


// Mapeia HH:MM → nome de turno padrão (Manhã 5-12, Tarde 12-19, Noite 19-5)
function shiftNameFromTime(timeStr) {
  if (!timeStr) return null;
  const [hh] = timeStr.split(':').map(Number);
  if (isNaN(hh)) return null;
  if (hh >= 5 && hh < 12) return 'Manhã';
  if (hh >= 12 && hh < 19) return 'Tarde';
  return 'Noite';
}


function taskSort(a, b) {
  const ta = parseTime(a.startTime);
  const tb = parseTime(b.startTime);
  if (ta !== null && tb !== null) return ta - tb;
  if (ta !== null) return -1;
  if (tb !== null) return 1;
  return (a.order || 0) - (b.order || 0);
}

function taskCard(t, dayDocId) {
  const cat = categories.find(c => c.id === t.categoryId);
  // Ícone próprio sobrescreve, senão usa o da categoria (fallback)
  const taskIcon = t.icon || cat?.icon || '🏷️';
  return `
    <div class="task ${t.done ? 'done' : ''} ${t.reminderEnabled ? 'has-reminder' : ''}" data-task-id="${t.id}" data-day="${dayDocId}">
      <button class="task-menu-btn-corner" data-action="menu" title="Editar / Duplicar / Excluir">⋮</button>
      <span class="task-drag" title="Arraste pra reordenar">⋮⋮</span>
      <button class="task-thumb ${t.done ? 'done' : ''}" data-action="check" title="${t.done ? 'Feito!' : 'Marcar como feito'}">${t.done ? '👍' : '👎'}</button>
      <div class="task-body">
        <div class="task-title">
          <span class="task-icon-inline">${taskIcon}</span>${t.startTime ? `<span class="task-time">${escape(t.startTime)}</span>` : ''}${escape(t.title)}${t.reminderEnabled ? '<span class="task-reminder-indicator" title="Lembrete ativado">🔔</span>' : ''}
        </div>
        ${t.desc ? `<div class="task-sub">${escape(t.desc)}</div>` : ''}
        ${cat ? `<span class="task-tag" style="color:${cat.color};background:${hexA(cat.color,0.15)}">${escape(cat.name)}</span>` : ''}
      </div>
    </div>
  `;
}

// Lista de ícones disponível pra escolher por tarefa (espelha a da Home)
const TASK_ICONS = [
  '🏷️','💧','🥗','💪','⚽','🏃','📚','🌙','💼','🧘','🥋','💰','🎨','🧹','📞','🛒','✈️','💝',
  '💇🏻‍♀️','🧖🏻‍♀️','💄','🪒','👚','🛍️',
  '👩🏻‍❤️‍💋‍👨🏻','🐕','🐈‍⬛','🎁',
  '🏋🏻‍♀️','🛼','🪘','🃏','🔮',
  '🛠️','🧺','🩺','🏖️','🗺️','🚨'
];

// Menu popover ao clicar no emoji da tarefa
function openTaskMenu(triggerEl) {
  // Fecha qualquer menu anterior
  document.querySelectorAll('.task-menu-pop').forEach(m => m.remove());

  const taskEl = triggerEl.closest('[data-task-id]');
  if (!taskEl) return;

  const menu = document.createElement('div');
  menu.className = 'task-menu-pop';
  menu.innerHTML = `
    <button class="task-menu-item" data-menu-action="edit">✏️ Editar</button>
    <button class="task-menu-item" data-menu-action="dup">📑 Duplicar</button>
    <button class="task-menu-item danger" data-menu-action="del">🗑️ Excluir</button>
  `;
  document.body.appendChild(menu);

  // Posiciona ao lado do trigger
  const r = triggerEl.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let top = r.bottom + 6;
  let left = r.right - mr.width;
  if (top + mr.height > window.innerHeight - 80) top = r.top - mr.height - 6;
  if (left < 8) left = 8;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  // Click fora fecha
  const close = () => {
    menu.remove();
    document.removeEventListener('click', onDoc, true);
  };
  const onDoc = (e) => {
    if (!menu.contains(e.target) && e.target !== triggerEl) close();
  };
  setTimeout(() => document.addEventListener('click', onDoc, true), 60);

  // Click em item → dispara ação no handler existente via botão sintético
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu-action]');
    if (!item) return;
    const action = item.dataset.menuAction;
    close();
    const synth = document.createElement('button');
    synth.dataset.action = action;
    synth.style.display = 'none';
    taskEl.appendChild(synth);
    synth.click();
    synth.remove();
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 9: HANDLERS DE EVENTOS (clicks, inputs, swipe)
// FIX: anexa só 1 vez por sessão (evita duplicação ao re-renderizar)
// ═══════════════════════════════════════════════════════════════
function attachHandlers(app) {
  if (handlersAttached) return;
  handlersAttached = true;
  app.addEventListener('click', async (e) => {
    // Voltar pra hoje
    if (e.target.closest('#back-today')) {
      weekStart = getWeekStart(new Date());
      expanded.clear(); expanded.add(dayId(new Date()));
      await loadWeek();
      renderUI(app);
      return;
    }

    // Toggle expand/collapse de dia
    const toggle = e.target.closest('[data-toggle-day]');
    if (toggle) {
      const id = toggle.dataset.toggleDay;
      const card = toggle.closest('.day-card');
      if (expanded.has(id)) { expanded.delete(id); card.classList.remove('open'); }
      else { expanded.add(id); card.classList.add('open'); }
      return;
    }

    // Navegação por semana (±7 dias)
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const dir = nav.dataset.nav;
      const newStart = new Date(weekStart);
      newStart.setDate(weekStart.getDate() + (dir === 'next-week' ? 7 : -7));
      weekStart = newStart;
      await loadWeek();
      renderUI(app);
      return;
    }

    // Adicionar tarefa da biblioteca
    const addBtn = e.target.closest('[data-add-to]');
    if (addBtn) {
      openActivityPicker(app, addBtn.dataset.day, addBtn.dataset.addTo);
      return;
    }

    // Marcar tarefa feita (👍 ↔ 👎)
    const check = e.target.closest('[data-action="check"]');
    if (check) {
      const taskEl = check.closest('[data-task-id]');
      const day = weekData.find(d => d.id === taskEl.dataset.day);
      const t = day?.tasks.find(x => x.id === taskEl.dataset.taskId);
      if (!t) return;
      const wasDone = t.done;
      t.done = !t.done;
      check.classList.toggle('done', t.done);
      check.textContent = t.done ? '👍' : '👎';
      check.title = t.done ? 'Feito!' : 'Marcar como feito';
      taskEl.classList.toggle('done', t.done);
      await updateDayTask(taskEl.dataset.day, taskEl.dataset.taskId, { done: t.done });
      updateDayCardStats(taskEl.dataset.day, false); // sem sync de template — done não vira modelo
      // Som + toast motivacional (só ao marcar feito); ao desmarcar, plop
      if (!wasDone && t.done) {
        playDone();
        showLocalToast(taskEl,
          `<span class="done-check-big">✓</span><span class="done-check-text">${randomDoneMessage()}</span>`,
          'success'
        );
      } else if (wasDone && !t.done) {
        playUndone();
      }
      return;
    }

    // Abrir menu de opções da tarefa (emoji-trigger)
    const menuBtn = e.target.closest('[data-action="menu"]');
    if (menuBtn) {
      openTaskMenu(menuBtn);
      return;
    }

    // Abrir modal de nota do dia
    const noteBtn = e.target.closest('[data-action="open-note"]');
    if (noteBtn) {
      openDayNoteModal(noteBtn.dataset.day);
      return;
    }

    // Editar tarefa
    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) {
      const taskEl = editBtn.closest('[data-task-id]');
      openTaskEditor(app, taskEl.dataset.day, taskEl.dataset.taskId);
      return;
    }

    // Dispensar banner de copiar
    const noBtn = e.target.closest('[data-copy-no]');
    if (noBtn) {
      const dId = noBtn.dataset.copyNo;
      dismissedCopyBanners.add(dId);
      const dayCardEl = document.querySelector(`.day-card[data-day-id="${dId}"]`);
      const day = weekData.find(d => d.id === dId);
      if (dayCardEl && day) {
        dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      }
      return;
    }

    // Copiar tarefas do dia anterior preenchido
    const copyBtn = e.target.closest('[data-copy-from]');
    if (copyBtn) {
      const fromId = copyBtn.dataset.copyFrom;
      const toId   = copyBtn.dataset.copyTo;
      copyBtn.disabled = true;
      copyBtn.textContent = 'Copiando...';
      try {
        const n = await copyDayTasksTo(fromId, toId);
        const dayCardEl = document.querySelector(`.day-card[data-day-id="${toId}"]`);
        const toDay = weekData.find(d => d.id === toId);
        if (dayCardEl && toDay) {
          dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(toDay);
          updateDayCardStats(toId);
          initTaskSortables();
        }
        playDone();
        showToast(`${n} tarefa${n === 1 ? '' : 's'} copiada${n === 1 ? '' : 's'}!`, 'success');
      } catch (err) {
        console.error('[ritual] copy day failed:', err);
        showToast('Erro ao copiar.', 'error');
        copyBtn.disabled = false;
        copyBtn.textContent = '📥 Copiar';
      }
      return;
    }

    // Duplicar tarefa LOGO ABAIXO da original (renumera os seguintes)
    const dupBtn = e.target.closest('[data-action="dup"]');
    if (dupBtn) {
      const taskEl = dupBtn.closest('[data-task-id]');
      const dayDocId = taskEl.dataset.day;
      const day = weekData.find(d => d.id === dayDocId);
      const t = day?.tasks.find(x => x.id === taskEl.dataset.taskId);
      if (!t) return;

      // Lista do turno na ordem que aparece na tela
      const sameShift = day.tasks.filter(x => x.shiftId === t.shiftId).sort(taskSort);
      const currentIdx = sameShift.findIndex(x => x.id === t.id);
      const insertOrder = currentIdx + 1;

      // Empurra todos os que vêm DEPOIS do atual +1 (no Firestore e em memória)
      const updates = [];
      for (let i = currentIdx + 1; i < sameShift.length; i++) {
        const task = sameShift[i];
        const newOrder = i + 1;
        if (task.order !== newOrder) {
          task.order = newOrder;
          updates.push(updateDayTask(dayDocId, task.id, { order: newOrder }));
        }
      }
      await Promise.all(updates);

      // Cria a cópia com order = posição logo após o original
      const newTask = {
        activityId: t.activityId || null,
        title: t.title, desc: t.desc || '', startTime: t.startTime || '',
        shiftId: t.shiftId, categoryId: t.categoryId || null,
        icon: t.icon || '',
        done: false, order: insertOrder
      };
      const tid = await addDayTask(dayDocId, newTask);
      day.tasks.push({ id: tid, ...newTask });

      playDone();

      const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
      if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId);

      // Pisca a tarefa nova pra deixar claro qual foi a duplicada
      requestAnimationFrame(() => {
        const newEl = dayCardEl?.querySelector(`[data-task-id="${tid}"]`);
        if (newEl) {
          newEl.classList.add('task-flash');
          newEl.addEventListener('animationend', () => newEl.classList.remove('task-flash'), { once: true });
        }
      });

      showToast('Tarefa duplicada', 'success');
      return;
    }


    // Hidratação: botões − / +
    const hydBtn = e.target.closest('[data-hyd-step]');
    if (hydBtn) {
      e.preventDefault();
      const dayDocId = hydBtn.dataset.day;
      const step = parseInt(hydBtn.dataset.hydStep);
      const day = weekData.find(d => d.id === dayDocId);
      if (!day) return;
      const newMl = Math.max(0, (day.meta.hydrationMl || 0) + step);
      day.meta.hydrationMl = newMl;
      // Atualiza UI
      const card = hydBtn.closest('.day-card');
      const valEl = card.querySelector(`.hyd-ml[data-day="${dayDocId}"]`);
      const fillEl = card.querySelector(`.hydration-fill[data-day="${dayDocId}"]`);
      const msgEl = card.querySelector(`.hydration-msg[data-day="${dayDocId}"]`);
      if (valEl) valEl.textContent = newMl;
      if (fillEl) fillEl.style.width = Math.min(100, Math.round((newMl / day.meta.hydrationGoal) * 100)) + '%';
      if (msgEl) msgEl.textContent = hydrationMsg(newMl, day.meta.hydrationGoal);
      // Debounce save
      const key = dayDocId + ':hydrationMl';
      clearTimeout(saveTimers[key]);
      saveTimers[key] = setTimeout(() => setDayMeta(dayDocId, { hydrationMl: newMl }), 600);
      return;
    }

    // Remover tarefa do dia — com confirmação
    const delBtn = e.target.closest('[data-action="del"]');
    if (delBtn) {
      const taskEl = delBtn.closest('[data-task-id]');
      const dayDocId = taskEl.dataset.day;
      const tid = taskEl.dataset.taskId;
      const day = weekData.find(d => d.id === dayDocId);
      const t = day?.tasks.find(x => x.id === tid);
      const ok = await confirmModal({
        title: 'Excluir tarefa?',
        message: `"${t?.title || 'Tarefa'}" será removida deste dia. A atividade na Home não muda.`,
        confirmText: 'Excluir',
        danger: true
      });
      if (!ok) return;
      playDelete();
      taskEl.style.transition = 'all 0.25s';
      taskEl.style.opacity = '0';
      taskEl.style.transform = 'translateX(40px)';
      setTimeout(async () => {
        await deleteDayTask(dayDocId, tid);
        day.tasks = day.tasks.filter(t => t.id !== tid);
        const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
        if (dayCardEl) {
          dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
          updateDayCardStats(dayDocId);
        }
      }, 250);
      return;
    }
  });

  // Inputs (acordei/dormi/hidratação/anotações) — debounce save
  app.addEventListener('input', (e) => {
    const inp = e.target;
    if (!inp.matches('[data-meta]')) return;
    const dayDocId = inp.dataset.day;
    const field = inp.dataset.meta;
    let value = inp.value;
    if (field === 'hydrationMl') value = parseInt(value) || 0;
    const day = weekData.find(d => d.id === dayDocId);
    if (!day) return;
    day.meta[field] = value;
    if (field === 'hydrationMl') {
      const card = inp.closest('.day-card');
      const fill = card?.querySelector('.hydration-fill');
      if (fill) fill.style.width = Math.min(100, Math.round((value / day.meta.hydrationGoal) * 100)) + '%';
    }
    const key = dayDocId + ':' + field;
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => setDayMeta(dayDocId, { [field]: value }), 600);
  });

  // Pills de horário (Acordei/Dormi) — abrem o time picker
  app.addEventListener('click', async (e) => {
    const trigger = e.target.closest('.tp-pill-trigger[data-meta]');
    if (!trigger) return;
    const result = await openTimePicker(trigger.dataset.time || '');
    if (!result) return;
    trigger.dataset.time = result;
    trigger.textContent = result;
    const dayDocId = trigger.dataset.day;
    const field = trigger.dataset.meta;
    const day = weekData.find(d => d.id === dayDocId);
    if (day) {
      day.meta[field] = result;
      try { await setDayMeta(dayDocId, { [field]: result }); }
      catch (err) { showToast('Erro ao salvar', 'error'); }
    }
  });

  // (Swipe entre semanas removido — só pelas setas ‹ ›)
}

function updateDayCardStats(dayDocId, syncTemplate = true) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  const card = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
  if (!card) return;
  const total = day.tasks.length;
  const done = day.tasks.filter(t => t.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const statsEl = card.querySelector('.day-card-stats');
  if (statsEl) statsEl.innerHTML = statsHtml(total, done, pct);
  card.querySelectorAll('[data-shift-id]').forEach(el => {
    const sid = el.dataset.shiftId;
    const count = day.tasks.filter(t => t.shiftId === sid).length;
    el.querySelector('.shift-count').textContent = `${count} tarefas`;
  });
  // Re-anexa Sortable nas task-lists recém-renderizadas
  initTaskSortables();
  // Salva o estado atual como template do dia-da-semana
  // (toda modificação que altera a lista — add/del/edit/dup/reorder)
  if (syncTemplate) syncTemplateForDay(dayDocId);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 10: MODAIS — picker de atividade e editor de tarefa
// ═══════════════════════════════════════════════════════════════
function openDayNoteModal(dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  const note = day.meta.dayNote || {
    prideFail: '', improve: '', daySleepHours: 0, nightWakes: 0
  };

  const nightAwakeInit = note.nightAwakeHours ?? note.nightWakes ?? 0;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal note-modal">
      <div class="modal-title">📝 Responda as Perguntas</div>
      <div class="modal-hint">Fecha o dia com 4 perguntas rápidas.</div>

      <label class="input-field">
        <div class="input-field-label">Do que me orgulho hoje e onde falhei?</div>
        <textarea id="note-pride-fail" rows="4" placeholder="Conquistas e tropeços do dia">${escape(note.prideFail || '')}</textarea>
      </label>

      <label class="input-field">
        <div class="input-field-label">Quais medidas tomarei pra fazer melhor amanhã?</div>
        <textarea id="note-improve" rows="4" placeholder="Ajustes concretos pra amanhã">${escape(note.improve || '')}</textarea>
      </label>

      <div class="input-field">
        <div class="input-field-label">Quantas horas dormi durante o dia? <small style="color:var(--muted);font-weight:500">(cochilos)</small></div>
        <div class="num-stepper" id="stp-daysleep" data-val="${note.daySleepHours || 0}" data-min="0" data-max="5" data-unit="h">
          <button type="button" class="step-arrow" data-step="-1" aria-label="diminuir">‹</button>
          <div class="step-val">${note.daySleepHours || 0}h</div>
          <button type="button" class="step-arrow" data-step="+1" aria-label="aumentar">›</button>
        </div>
      </div>

      <div class="input-field">
        <div class="input-field-label">Quantas horas fiquei acordado(a) na madrugada?</div>
        <div class="num-stepper" id="stp-nightawake" data-val="${nightAwakeInit}" data-min="0" data-max="5" data-unit="h">
          <button type="button" class="step-arrow" data-step="-1" aria-label="diminuir">‹</button>
          <div class="step-val">${nightAwakeInit}h</div>
          <button type="button" class="step-arrow" data-step="+1" aria-label="aumentar">›</button>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="note-cancel">Cancelar</button>
        <button class="btn-primary" id="note-register">✓ Registrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('#note-pride-fail').focus(), 80);

  const close = () => modal.remove();
  modal.querySelector('#note-cancel').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  // Wire steppers
  modal.querySelectorAll('.num-stepper').forEach(stp => {
    const valEl = stp.querySelector('.step-val');
    const unit = stp.dataset.unit;
    const min = parseInt(stp.dataset.min, 10);
    const max = parseInt(stp.dataset.max, 10);
    stp.querySelectorAll('.step-arrow').forEach(btn => {
      btn.addEventListener('click', () => {
        let v = parseInt(stp.dataset.val, 10);
        v += parseInt(btn.dataset.step, 10);
        if (v < min) v = min; if (v > max) v = max;
        stp.dataset.val = v;
        valEl.textContent = `${v}${unit}`;
        if (navigator.vibrate) navigator.vibrate(8);
      });
    });
  });

  modal.querySelector('#note-register').onclick = async () => {
    const data = {
      prideFail:        modal.querySelector('#note-pride-fail').value.trim(),
      improve:          modal.querySelector('#note-improve').value.trim(),
      daySleepHours:    parseInt(modal.querySelector('#stp-daysleep').dataset.val, 10) || 0,
      nightAwakeHours:  parseInt(modal.querySelector('#stp-nightawake').dataset.val, 10) || 0,
      registeredAt: new Date().toISOString()
    };

    try {
      day.meta.dayNote = data;
      await setDayMeta(dayDocId, { dayNote: data });

      // Sucesso: cartão verde + vibração + som + mensagem
      const card = modal.querySelector('.note-modal');
      card.classList.add('registered-success');
      card.innerHTML = `
        <div class="note-success-block">
          <div class="note-success-check">✓</div>
          <div class="note-success-title">Registrado!</div>
          <div class="note-success-sub">Bom dia fechado.</div>
        </div>
      `;
      if (navigator.vibrate) navigator.vibrate([20, 60, 40]);
      playDone();

      setTimeout(() => {
        close();
        // Re-render só o botão de nota no card
        const wrap = document.querySelector(`.day-note-wrap[data-day="${dayDocId}"]`);
        if (wrap) wrap.innerHTML = renderDayNoteButton(day);
      }, 1500);
    } catch (err) {
      console.error('[note] save erro:', err);
      showToast('Erro ao salvar a nota.', 'error');
    }
  };
}


function openActivityPicker(app, dayDocId, shiftId) {
  const day = weekData.find(d => d.id === dayDocId);
  const shift = shifts.find(s => s.id === shiftId);

  const catOpts = categories.map(c => `
    <option value="${c.id}" data-color="${c.color}">${escape(c.icon || '')} ${escape(c.name)}</option>
  `).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">Adicionar tarefa</div>
      <div class="modal-hint">No turno <strong>${escape(shift?.name || '')}</strong> de ${escape(WEEKDAYS_FULL[day.date.getDay()])} ${escape(String(day.date.getDate()).padStart(2,'0'))} ${escape(MONTHS[day.date.getMonth()])}.</div>

      <label class="input-field"><div class="input-field-label">Atividade</div>
        <select id="m-cat">
          <option value="">— sem atividade —</option>
          ${catOpts}
        </select></label>

      <label class="input-field"><div class="input-field-label">O que fazer</div>
        <input id="m-title" placeholder="Ex: Tomar chá de gengibre, treino de pernas, ler 30min..." /></label>

      <div class="input-field-label">Horário (opcional)</div>
      <button type="button" class="tp-trigger" id="m-time-trigger" data-time="">
        <span class="tp-trigger-icon">🕐</span>
        <span class="tp-trigger-time">— : —</span>
        <span class="tp-trigger-edit">›</span>
      </button>

      <label class="reminder-toggle">
        <input type="checkbox" id="m-reminder" />
        <span class="reminder-bell"></span>
        <div class="reminder-text">
          <span class="reminder-label">Lembrar com notificação</span>
          <span class="reminder-hint">notificação real será ativada quando o app virar PWA</span>
        </div>
      </label>

      ${categories.length === 0 ? `<div style="padding:8px 0;color:var(--muted);font-size:11px;text-align:center">
        Nenhuma atividade cadastrada. Vai na <a href="#/home" style="color:var(--accent)">Home</a> pra criar.
      </div>` : ''}

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">+ Adicionar ao dia</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('#m-title').focus(), 50);

  // Botão de horário → abre time picker
  modal.querySelector('#m-time-trigger')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const result = await openTimePicker(btn.dataset.time || '');
    if (result) {
      btn.dataset.time = result;
      btn.querySelector('.tp-trigger-time').textContent = result;
    }
  });

  modal.querySelector('#m-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.querySelector('#m-save').onclick = async () => {
    const categoryId = modal.querySelector('#m-cat').value || null;
    const cat = categoryId ? categories.find(c => c.id === categoryId) : null;
    let title = modal.querySelector('#m-title').value.trim();
    if (!title) {
      if (cat) title = cat.name; // se não tem título mas tem atividade, usa o nome da atividade
      else { showToast('Digite um título ou escolha uma atividade', 'info'); return; }
    }
    const startTime = modal.querySelector('#m-time-trigger')?.dataset.time || '';
    const reminderEnabled = modal.querySelector('#m-reminder').checked;
    const order = day.tasks.filter(t => t.shiftId === shiftId).length;
    const newTask = {
      activityId: null, title, desc: '',
      startTime, shiftId, categoryId,
      done: false, order, reminderEnabled
    };
    const tid = await addDayTask(dayDocId, newTask);
    day.tasks.push({ id: tid, ...newTask });
    await propagateReminderToCategory(categoryId, reminderEnabled);
    modal.remove();
    const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
    if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
    updateDayCardStats(dayDocId);
  };
}

function openTaskEditor(app, dayDocId, taskId) {
  const day = weekData.find(d => d.id === dayDocId);
  const t = day?.tasks.find(x => x.id === taskId);
  if (!t) return;
  const shiftOpts = shifts.map(s => `<option value="${s.id}" ${t.shiftId === s.id ? 'selected' : ''}>${escape(s.icon || '')} ${escape(s.name)}</option>`).join('');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">Editar tarefa</div>
      <div class="modal-hint">A edição vale só pra este dia. A atividade original na Home não muda.</div>
      <label class="input-field"><div class="input-field-label">Título</div>
        <input id="m-title" value="${escape(t.title)}" /></label>
      <label class="input-field"><div class="input-field-label">Descrição (opcional)</div>
        <input id="m-desc" value="${escape(t.desc || '')}" placeholder="detalhes do dia" /></label>

      <div class="input-field-label" style="margin-top:8px">Ícone <small style="color:var(--muted);font-weight:500">(vazio usa o da categoria)</small></div>
      <div class="task-icon-picker" id="m-icon-picker">
        <button type="button" class="task-icon-opt ${!t.icon ? 'sel' : ''}" data-icon="" title="Sem ícone próprio">∅</button>
        ${TASK_ICONS.map(ic => `<button type="button" class="task-icon-opt ${ic === t.icon ? 'sel' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
      </div>
      <label class="input-field"><div class="input-field-label">Turno</div>
        <select id="m-shift">${shiftOpts}</select></label>
      <div class="input-field-label">Horário de início (opcional)</div>
      <button type="button" class="tp-trigger" id="m-time-trigger" data-time="${toHHMM(t.startTime) || ''}">
        <span class="tp-trigger-icon">🕐</span>
        <span class="tp-trigger-time">${toHHMM(t.startTime) || '— : —'}</span>
        <span class="tp-trigger-edit">›</span>
      </button>

      <label class="reminder-toggle">
        <input type="checkbox" id="m-reminder" ${t.reminderEnabled ? 'checked' : ''} />
        <span class="reminder-bell"></span>
        <div class="reminder-text">
          <span class="reminder-label">Lembrar com notificação</span>
          <span class="reminder-hint">notificação real será ativada quando o app virar PWA</span>
        </div>
      </label>

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#m-cancel').onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  // Wire icon picker (seleção exclusiva)
  modal.querySelectorAll('#m-icon-picker .task-icon-opt').forEach(b => {
    b.addEventListener('click', () => {
      modal.querySelectorAll('#m-icon-picker .task-icon-opt.sel').forEach(s => s.classList.remove('sel'));
      b.classList.add('sel');
    });
  });

  // Wire time picker trigger (botão abre roleta)
  modal.querySelector('#m-time-trigger')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const result = await openTimePicker(btn.dataset.time || '');
    if (result) {
      btn.dataset.time = result;
      btn.querySelector('.tp-trigger-time').textContent = result;
    }
  });

  modal.querySelector('#m-save').onclick = async () => {
    const newTime = modal.querySelector('#m-time-trigger')?.dataset.time || '';
    let newShiftId = modal.querySelector('#m-shift').value || null;

    // Auto-ajuste: se o horário caiu em outro turno, move pra ele
    // (Manhã 5-12, Tarde 12-19, Noite 19-5)
    if (newTime) {
      const autoName = shiftNameFromTime(newTime);
      if (autoName) {
        const matchShift = shifts.find(s => (s.name || '').toLowerCase() === autoName.toLowerCase());
        if (matchShift) newShiftId = matchShift.id;
      }
    }

    const data = {
      title: modal.querySelector('#m-title').value.trim() || 'Sem título',
      desc: modal.querySelector('#m-desc').value.trim(),
      shiftId: newShiftId,
      startTime: newTime,
      icon: modal.querySelector('#m-icon-picker .task-icon-opt.sel')?.dataset.icon || '',
      reminderEnabled: modal.querySelector('#m-reminder').checked
    };
    Object.assign(t, data);
    await updateDayTask(dayDocId, taskId, data);
    await propagateReminderToCategory(t.categoryId, t.reminderEnabled);
    modal.remove();
    const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
    if (dayCardEl) {
      dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId);
    }
  };
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 11: HELPERS UTILITÁRIOS (escape, conversões)
// ═══════════════════════════════════════════════════════════════
// Marca a atividade (categoria) com reminderEnabled=true quando uma tarefa dela ativa lembrete.
// Aparece como indicador 🔔 na Home. Não desmarca automaticamente (usuário pode ter outras tarefas).
async function propagateReminderToCategory(categoryId, enabled) {
  if (!categoryId || !enabled) return;
  const cat = categories.find(c => c.id === categoryId);
  if (!cat || cat.reminderEnabled) return; // já tá marcada
  cat.reminderEnabled = true;
  try { await saveCategory(categoryId, { reminderEnabled: true }); } catch (e) { console.error(e); }
}

function escape(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function hexA(hex, a) {
  if (!hex) return `rgba(167,139,250,${a})`;
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0,2), 16), g = parseInt(m[1].slice(2,4), 16), b = parseInt(m[1].slice(4,6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function toHHMM(timeStr) {
  const t = parseTime(timeStr);
  if (t === null) return '';
  const h = Math.floor(t / 60), m = t % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
