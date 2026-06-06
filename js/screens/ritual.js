// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getShifts, getCategories, getActivities,
  getDay, setDayMeta, getDayTasks, addDayTask, updateDayTask, deleteDayTask, dayId,
  getProfile, parseTime,
  getWeekdayTemplate, setWeekdayTemplate,
  saveCategory, fetchDaysRange
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
const prevNoteCache = new Map();             // cache: dayId -> hasNote (evita refetch a cada check)


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

// Calcula o dayId (YYYY-MM-DD) anterior ao informado
function prevDayId(idStr) {
  const [y, m, d] = idStr.split('-').map(n => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dayId(dt);
}

// Retorna { complete, missing[] } do dia anterior. Usa cache em memória.
async function previousDayStatus(dayDocId) {
  const prevId = prevDayId(dayDocId);
  if (prevNoteCache.has(prevId)) return prevNoteCache.get(prevId);

  // 1) Tenta no weekData (evita Firestore se possível)
  const inWeek = weekData.find(d => d.id === prevId);
  if (inWeek) {
    const st = dayCompletionStatus(inWeek);
    prevNoteCache.set(prevId, st);
    return st;
  }

  // 2) Fallback: busca no Firestore
  try {
    const data = await getDay(prevId);
    if (!data) {
      const st = { complete: true, missing: [], hasNote: true, hasSleep: true, hasHydration: true };
      prevNoteCache.set(prevId, st); // dia inexistente = nada a cobrar
      return st;
    }
    const st = dayCompletionStatus(data);
    prevNoteCache.set(prevId, st);
    return st;
  } catch (err) {
    console.warn('[prev-status] erro ao buscar:', err);
    return { complete: true, missing: [], hasNote: true, hasSleep: true, hasHydration: true };
  }
}

// Aviso de dia anterior pendente — dispara o fluxo completo (nota → sono → água)
async function warnPreviousDayMissing(app, currentDayId, status) {
  const prevId = prevDayId(currentDayId);
  const [y, m, d] = prevId.split('-').map(n => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const labelDia = WEEKDAYS_FULL[dt.getDay()];
  const dataFmt = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  const faltaTxt = status.missing.length === 1
    ? `falta preencher ${status.missing[0]}`
    : `faltam: ${status.missing.join(', ')}`;
  const ok = await confirmModal({
    title: 'Fechamento pendente',
    message: `Em ${labelDia.toLowerCase()} (${dataFmt}) ${faltaTxt}. Quer preencher agora?`,
    confirmText: 'Preencher agora',
    cancelText: 'Depois'
  });
  if (ok) {
    const completed = await runDayCompletionFlow(app, prevId);
    // Invalida cache do dia anterior pra refletir o estado atualizado
    prevNoteCache.delete(prevId);
    if (!completed) {
      // Não terminou — re-mostra aviso com o que ainda falta no próximo check (cache será refeito)
    }
  }
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
        <div class="day-info-center" id="week-pager-center">
          <div class="dt">${weekRangeLabel()}</div>
          <div class="meta">Use as setas pra trocar de semana</div>
          <div class="meta">Dê 2 toques para abrir o calendário</div>
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

    <div class="day-clear-wrap">
      <button type="button" class="day-clear-btn" data-action="clear-day" data-day="${d.id}">
        🗑️ Limpar dados do dia
      </button>
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


// Modal de escolha pra exclusão de tarefa recorrente
// Retorna 'one' | 'all' | null (cancelado)
function askDeleteScope(taskTitle, otherCount, hasTemplateRecurrence) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const subInfo = hasTemplateRecurrence
      ? 'Esta tarefa também se repete em semanas futuras (template).'
      : `Aparece em mais ${otherCount} dia${otherCount === 1 ? '' : 's'} desta semana.`;
    modal.innerHTML = `
      <div class="modal" style="max-width:340px">
        <div class="modal-title" style="text-align:center">⚠️ Excluir tarefa recorrente?</div>
        <div class="modal-hint" style="text-align:center">
          <strong>"${escape(taskTitle)}"</strong><br>
          ${subInfo}
        </div>
        <button class="del-scope-btn" data-scope="one" type="button">
          <strong>📌 Somente este dia</strong>
          <small>Mantém nos outros dias e nas próximas semanas</small>
        </button>
        <button class="del-scope-btn danger" data-scope="all" type="button">
          <strong>🗑️ Toda a recorrência</strong>
          <small>Remove desta semana e das próximas (limpa o template)</small>
        </button>
        <div class="modal-actions">
          <button class="btn-secondary" id="del-cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = (v) => { modal.remove(); resolve(v); };
    modal.onclick = (e) => { if (e.target === modal) close(null); };
    modal.querySelector('#del-cancel').onclick = () => close(null);
    modal.querySelectorAll('.del-scope-btn').forEach(b =>
      b.addEventListener('click', () => close(b.dataset.scope))
    );
  });
}

// Label da recorrência semanal respeitando gênero (sábado/domingo masculinos)
function recurWeeklyLabel(dow) {
  const names = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const isMasc = (dow === 0 || dow === 6); // Domingo e Sábado
  return `${isMasc ? 'Todo' : 'Toda'} ${names[dow].toLowerCase()}`;
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
      <button class="task-thumb ${t.done ? 'done' : ''}" data-action="check" title="${t.done ? 'Feito!' : 'Marcar como feito'}">${t.done ? '👍' : '👎'}</button>
      <div class="task-body">
        <div class="task-title">
          <span class="task-icon-inline">${taskIcon}</span>${t.startTime ? `<span class="task-time">${escape(t.startTime)}</span>` : ''}${escape(t.title)}
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
// CALENDÁRIO DO RITUAL — escolha qualquer dia pra ir direto na semana
// ═══════════════════════════════════════════════════════════════
function openRitualCalendar(app) {
  const today = new Date();
  let viewYear = weekData[0]?.date?.getFullYear() || today.getFullYear();
  let viewMonth = weekData[0]?.date?.getMonth() ?? today.getMonth();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  // Set de dias (YYYY-MM-DD) com pelo menos 1 tarefa com lembrete
  // Será preenchido por fetch sob demanda pra cada mês visualizado
  const daysWithReminder = new Set();

  modal.innerHTML = `
    <div class="modal cal-modal">
      <div class="cal-header">
        <button type="button" class="cal-nav" data-cal-nav="-1" aria-label="Mês anterior">‹</button>
        <div class="cal-title" id="cal-title"></div>
        <button type="button" class="cal-nav" data-cal-nav="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal-weekdays">
        <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
      </div>
      <div class="cal-grid" id="cal-grid"></div>
      <div class="cal-hint">Toque num dia pra abrir a semana correspondente.</div>
      <div class="modal-actions">
        <button class="btn-secondary" id="cal-back" type="button" style="flex:1">← Voltar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const renderGrid = () => {
    const titleEl = modal.querySelector('#cal-title');
    const gridEl = modal.querySelector('#cal-grid');
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    titleEl.textContent = `${monthNames[viewMonth]} ${viewYear}`;

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const todayId = dayId(today);

    let html = '';
    for (let i = 0; i < startDow; i++) html += '<span class="cal-cell empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const idStr = dayId(date);
      const isToday = idStr === todayId;
      const hasReminder = daysWithReminder.has(idStr);
      html += `<button type="button" class="cal-cell ${isToday ? 'today' : ''}" data-cal-day="${idStr}">
        ${d}${hasReminder ? '<span class="cal-pin">📌</span>' : ''}
      </button>`;
    }
    gridEl.innerHTML = html;
  };

  // Busca dias do mês visualizado e identifica os com lembrete real
  const loadRemindersFor = async (year, month) => {
    try {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      const days = await fetchDaysRange(start, end);
      for (const dd of days) {
        if ((dd.tasks || []).some(t => t.reminderEnabled)) {
          daysWithReminder.add(dd.id);
        }
      }
    } catch (err) {
      console.warn('[cal] erro ao buscar lembretes:', err);
    }
  };

  // Render inicial + busca dos lembretes
  renderGrid();
  loadRemindersFor(viewYear, viewMonth).then(renderGrid);

  const close = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) close(); };
  modal.querySelector('#cal-back').onclick = close;
  modal.querySelectorAll('[data-cal-nav]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const delta = parseInt(btn.dataset.calNav, 10);
      viewMonth += delta;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      else if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderGrid();
      await loadRemindersFor(viewYear, viewMonth);
      renderGrid();
    });
  });
  modal.addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-cal-day]');
    if (!cell) return;
    const id = cell.dataset.calDay;
    const [y, m, d] = id.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    weekStart = getWeekStart(picked);
    expanded.clear(); expanded.add(id);
    close();
    await loadWeek();
    renderUI(app);
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

    // Dois toques rápidos no header da semana → abre calendário
    const wkCenter = e.target.closest('#week-pager-center');
    if (wkCenter) {
      const now = Date.now();
      if (wkCenter._lastTap && now - wkCenter._lastTap < 400) {
        wkCenter._lastTap = 0;
        openRitualCalendar(app);
        return;
      }
      wkCenter._lastTap = now;
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
        // Aviso: dia anterior pendente (nota, sono ou hidratação) — sempre dispara após o ✓
        const dayKey = taskEl.dataset.day;
        previousDayStatus(dayKey).then(st => {
          if (!st.complete) setTimeout(() => warnPreviousDayMissing(app, dayKey, st), 900);
        });
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

    // Abrir modal de nota do dia → após registrar, encadeia sono + água
    const noteBtn = e.target.closest('[data-action="open-note"]');
    if (noteBtn) {
      const dayKey = noteBtn.dataset.day;
      (async () => {
        const registered = await openDayNoteModal(dayKey);
        if (!registered) return;
        // Pequena pausa pra animação de "Registrado!" sumir
        await new Promise(r => setTimeout(r, 200));
        // Continua o fluxo: sleep (confirma ou edita) → água (só se faltar)
        const day = weekData.find(d => d.id === dayKey);
        await confirmOrEditSleep(dayKey);
        const st2 = dayCompletionStatus(day);
        if (!st2.hasHydration) await promptHydrationFor(dayKey);
        // Invalida cache se esse dia for "anterior" de outro
        prevNoteCache.delete(dayKey);
      })();
      return;
    }

    // Limpar dados do dia
    const clearBtn = e.target.closest('[data-action="clear-day"]');
    if (clearBtn) {
      openClearDayModal(app, clearBtn.dataset.day);
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
      if (!t) return;

      // Detecta se essa tarefa se repete em outros dias DA SEMANA (mesmo título)
      const recurringDays = weekData.filter(d =>
        d.id !== dayDocId && d.tasks.some(x => (x.title || '').trim().toLowerCase() === (t.title || '').trim().toLowerCase())
      );
      // Também detecta se a tarefa está em algum weekdayTemplate (recorrência futura)
      const tpls = profile?.weekdayTemplates || {};
      const recurringInTemplates = Object.keys(tpls).filter(dow => {
        const arr = tpls[dow];
        if (!Array.isArray(arr)) return false;
        return arr.some(x => (x.title || '').trim().toLowerCase() === (t.title || '').trim().toLowerCase());
      });
      const isRecurring = recurringDays.length > 0 || recurringInTemplates.length > 0;

      let scope = 'one'; // 'one' | 'all'
      if (isRecurring) {
        // Mostra o total de ocorrências (na semana atual + templates futuros)
        const totalOther = recurringDays.length + (recurringInTemplates.length > 0 ? 1 : 0);
        scope = await askDeleteScope(t.title, totalOther, recurringInTemplates.length > 0);
        if (!scope) return; // cancelado
      } else {
        const ok = await confirmModal({
          title: 'Excluir tarefa?',
          message: `"${t.title}" será removida deste dia.`,
          confirmText: 'Excluir',
          danger: true
        });
        if (!ok) return;
      }

      playDelete();
      taskEl.style.transition = 'all 0.25s';
      taskEl.style.opacity = '0';
      taskEl.style.transform = 'translateX(40px)';

      setTimeout(async () => {
        await deleteDayTask(dayDocId, tid);
        day.tasks = day.tasks.filter(x => x.id !== tid);

        if (scope === 'all') {
          const titleLc = (t.title || '').trim().toLowerCase();
          // 1) Apaga das outras ocorrências da semana
          for (const otherDay of recurringDays) {
            const matches = otherDay.tasks.filter(x => (x.title || '').trim().toLowerCase() === titleLc);
            for (const m of matches) {
              try { await deleteDayTask(otherDay.id, m.id); } catch {}
              otherDay.tasks = otherDay.tasks.filter(x => x.id !== m.id);
            }
            const otherEl = document.querySelector(`.day-card[data-day-id="${otherDay.id}"]`);
            if (otherEl) {
              otherEl.querySelector('.day-card-content').innerHTML = renderDayContent(otherDay);
              updateDayCardStats(otherDay.id, false);
            }
          }
          // 2) Limpa dos templates de TODOS os dias-da-semana onde aparece
          try {
            const tplsCur = profile?.weekdayTemplates || {};
            for (const dow of Object.keys(tplsCur)) {
              const arr = tplsCur[dow];
              if (!Array.isArray(arr)) continue;
              const filtered = arr.filter(x => (x.title || '').trim().toLowerCase() !== titleLc);
              if (filtered.length !== arr.length) {
                await setWeekdayTemplate(parseInt(dow, 10), filtered);
                profile.weekdayTemplates[dow] = filtered;
              }
            }
          } catch (err) {
            console.warn('[del-recurring] template cleanup:', err);
          }
          showToast(`Removido de ${recurringDays.length + 1} dia${recurringDays.length === 0 ? '' : 's'} + recorrências futuras`, 'success');
        }

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
// ═══════════════════════════════════════════════════════════════
// BLOCO 9.4: LIMPAR DADOS DO DIA — zera tudo (tarefas + relógio + hidratação + nota)
// ═══════════════════════════════════════════════════════════════
async function openClearDayModal(app, dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  const dayLabel = `${WEEKDAYS_FULL[day.date.getDay()]}, ${String(day.date.getDate()).padStart(2,'0')}/${String(day.date.getMonth()+1).padStart(2,'0')}`;
  const ok = await confirmModal({
    title: 'Limpar tudo do dia?',
    message: `Vai apagar todas as tarefas, horário de acordar/dormir, hidratação e nota de ${dayLabel}. Não dá pra desfazer.`,
    confirmText: 'Apagar tudo',
    cancelText: 'Cancelar',
    danger: true
  });
  if (!ok) return;
  await clearDayAll(app, dayDocId);
}

async function clearDayAll(app, dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  try {
    // Apaga todas as tarefas
    await Promise.all(day.tasks.map(t => deleteDayTask(dayDocId, t.id)));
    day.tasks = [];

    // Reseta meta: relógio + hidratação + nota + flag de auto-gen
    const reset = {
      wakeTime: '',
      sleepTime: '',
      hydrationMl: 0,
      dayNote: null,
      generated: false,
      autoGeneratedFor: []
    };
    await setDayMeta(dayDocId, reset);
    Object.assign(day.meta, reset);

    // Cache do aviso de pendência também invalida
    prevNoteCache.delete(dayDocId);

    // Sincroniza template (agora vazio) — opcional: o usuário pode querer
    // manter o template antigo. Por segurança NÃO sincronizo aqui pra
    // não bagunçar a recorrência futura.

    renderUI(app);
    playDelete();
    showToast('Dia limpo por completo', 'success');
  } catch (err) {
    console.error('[clear-all] erro:', err);
    showToast('Erro ao limpar o dia', 'error');
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 9.5: FECHAMENTO DE DIA — Helpers de "dia completo"
//   - Nota preenchida + sleepTime + hydrationMl > 0
//   - Chained flow: nota → relógio dormir → água → fim
// ═══════════════════════════════════════════════════════════════
function dayCompletionStatus(d) {
  // d pode ser do weekData ({meta:{...}}) ou raw doc do Firestore (campos no top-level)
  const src = d?.meta || d || {};
  const n = src.dayNote;
  const hasNote = !!(n && (n.prideFail || n.improve || n.daySleepHours || n.daySleepMinutes || n.nightWakes || n.nightAwakeHours || n.nightAwakeMinutes));
  const hasSleep = !!src.sleepTime;
  const hasHydration = (src.hydrationMl || 0) > 0;
  return {
    hasNote, hasSleep, hasHydration,
    complete: hasNote && hasSleep && hasHydration,
    missing: [
      !hasNote && 'a nota',
      !hasSleep && 'a hora de dormir',
      !hasHydration && 'a hidratação'
    ].filter(Boolean)
  };
}

// Abre o relógio pra sleepTime do dia e persiste no Firestore + UI
// Monta a pergunta contextual do relógio dependendo de qual dia é
function sleepPromptTitle(dayDocId) {
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const todayStr = dayId(todayDate);
  if (dayDocId === todayStr) return 'Que horas você está indo dormir hoje?';
  const [y, m, dd] = dayDocId.split('-').map(n => parseInt(n, 10));
  const that = new Date(y, m - 1, dd); that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((todayDate - that) / 86400000);
  if (diffDays === 1) return 'Que horas você foi dormir ontem?';
  const dataFmt = `${String(dd).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
  return `Que horas você foi dormir em ${dataFmt}?`;
}

async function promptSleepTimeFor(dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return false;
  const initial = day.meta.sleepTime || profile?.defaultSleepTime || '';
  const result = await openTimePicker(initial, { title: sleepPromptTitle(dayDocId) });
  if (!result) return false;
  day.meta.sleepTime = result;
  try {
    await setDayMeta(dayDocId, { sleepTime: result });
    // Atualiza botão da pílula se estiver visível
    const btn = document.querySelector(`.tp-pill-trigger[data-meta="sleepTime"][data-day="${dayDocId}"]`);
    if (btn) { btn.dataset.time = result; btn.textContent = result; }
  } catch (err) { showToast('Erro ao salvar a hora de dormir', 'error'); return false; }
  return true;
}

// Confirma a hora de dormir (caso já tenha valor) ou abre o relógio (caso vazio).
// Retorna true se o usuário confirmou/salvou algo válido pra prosseguir o flow.
async function confirmOrEditSleep(dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return false;
  const current = day.meta.sleepTime;
  // Sem valor → abre relógio direto
  if (!current) {
    return await promptSleepTimeFor(dayDocId);
  }
  // Já tem valor → pergunta se foi esse mesmo (pode ter sido auto-preenchido)
  const yes = await confirmModal({
    title: 'Confere a hora de dormir',
    message: `Você dormiu às ${current}?`,
    confirmText: 'Sim, foi isso',
    cancelText: 'Ajustar'
  });
  if (yes) return true;
  // "Ajustar" → abre relógio; mesmo se cancelar, mantém valor anterior e segue
  await promptSleepTimeFor(dayDocId);
  return true;
}

// Modal mínimo de hidratação — força ao menos 250ml antes de confirmar
function promptHydrationFor(dayDocId) {
  return new Promise((resolve) => {
    const day = weekData.find(d => d.id === dayDocId);
    if (!day) { resolve(false); return; }
    let valMl = day.meta.hydrationMl || 0;
    const goal = day.meta.hydrationGoal || 2000;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-title">💧 Quanta água você bebeu?</div>
        <div class="modal-hint">Marca pelo menos um copo (250ml) pra fechar o dia.</div>

        <div class="hydration" style="margin:18px 0 8px">
          <div class="hydration-top">
            <div class="hydration-label">Total</div>
            <div class="hydration-goal-label">meta: ${goal} ml</div>
          </div>
          <div class="hydration-stepper">
            <button class="hyd-btn" id="hyd-mini-minus" title="−250ml">−</button>
            <div class="hyd-value"><span id="hyd-mini-val">${valMl}</span><small>ml</small></div>
            <button class="hyd-btn" id="hyd-mini-plus" title="+250ml">+</button>
          </div>
          <div class="hydration-bar"><div class="hydration-fill" id="hyd-mini-fill" style="width:${Math.min(100, Math.round(valMl/goal*100))}%"></div></div>
          <div class="hydration-msg" id="hyd-mini-msg">${hydrationMsg(valMl, goal)}</div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="hyd-mini-cancel">Cancelar</button>
          <button class="btn-primary" id="hyd-mini-save" ${valMl <= 0 ? 'disabled' : ''}>✓ Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Back button: trata como cancelar
    let popped = false, cameFromPop = false;
    const onPop = () => { cameFromPop = true; finish(false); };
    window.addEventListener('popstate', onPop);
    history.pushState({ hydModal: true }, '');

    const finish = (saved) => {
      if (popped) return;
      popped = true;
      window.removeEventListener('popstate', onPop);
      modal.remove();
      if (!cameFromPop) setTimeout(() => { try { history.back(); } catch {} }, 0);
      resolve(!!saved);
    };

    const valEl = modal.querySelector('#hyd-mini-val');
    const fillEl = modal.querySelector('#hyd-mini-fill');
    const msgEl = modal.querySelector('#hyd-mini-msg');
    const saveBtn = modal.querySelector('#hyd-mini-save');
    const update = (delta) => {
      valMl = Math.max(0, valMl + delta);
      valEl.textContent = valMl;
      fillEl.style.width = Math.min(100, Math.round(valMl/goal*100)) + '%';
      msgEl.textContent = hydrationMsg(valMl, goal);
      saveBtn.disabled = valMl <= 0;
    };
    modal.querySelector('#hyd-mini-minus').onclick = () => update(-250);
    modal.querySelector('#hyd-mini-plus').onclick  = () => update(+250);
    modal.querySelector('#hyd-mini-cancel').onclick = () => finish(false);
    modal.querySelector('#hyd-mini-save').onclick = async () => {
      if (valMl <= 0) return;
      day.meta.hydrationMl = valMl;
      try {
        await setDayMeta(dayDocId, { hydrationMl: valMl });
        // Atualiza UI no card se visível
        const card = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
        if (card) {
          const mlEl = card.querySelector(`.hyd-ml[data-day="${dayDocId}"]`);
          const cardFill = card.querySelector(`.hydration-fill[data-day="${dayDocId}"]`);
          const cardMsg = card.querySelector(`.hydration-msg[data-day="${dayDocId}"]`);
          if (mlEl) mlEl.textContent = valMl;
          if (cardFill) cardFill.style.width = Math.min(100, Math.round(valMl/goal*100)) + '%';
          if (cardMsg) cardMsg.textContent = hydrationMsg(valMl, goal);
        }
        finish(true);
      } catch (err) { showToast('Erro ao salvar hidratação', 'error'); }
    };
    modal.addEventListener('click', e => { if (e.target === modal) finish(false); });
  });
}

// Orquestra o fluxo de fechamento — só pede o que ainda falta. Retorna se completou.
async function runDayCompletionFlow(app, dayDocId) {
  // Garante que o dia tá em weekData (pode ser dia de outra semana)
  let day = weekData.find(d => d.id === dayDocId);
  if (!day) {
    const [y, mo, dd] = dayDocId.split('-').map(n => parseInt(n, 10));
    weekStart = getWeekStart(new Date(y, mo - 1, dd));
    await loadWeek();
    renderUI(app);
    day = weekData.find(d => d.id === dayDocId);
    if (!day) return false;
  }
  // Expande o card pra ela ver o progresso
  expanded.add(dayDocId);

  // 1) Nota
  let st = dayCompletionStatus(day);
  if (!st.hasNote) {
    const ok = await openDayNoteModal(dayDocId);
    if (!ok) return false;
    st = dayCompletionStatus(day);
  }

  // 2) Hora de dormir — pergunta sempre (pode ter sido auto-preenchido)
  {
    const ok = await confirmOrEditSleep(dayDocId);
    if (!ok) return false;
    st = dayCompletionStatus(day);
  }

  // 3) Hidratação
  if (!st.hasHydration) {
    const ok = await promptHydrationFor(dayDocId);
    if (!ok) return false;
  }

  // Re-render do card visível pra refletir tudo
  const wrap = document.querySelector(`.day-note-wrap[data-day="${dayDocId}"]`);
  if (wrap) wrap.innerHTML = renderDayNoteButton(day);
  return true;
}


function openDayNoteModal(dayDocId) {
  return new Promise((resolve) => {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) { resolve(false); return; }
  const existingNote = day.meta.dayNote;
  const isEditing = !!(existingNote && (existingNote.prideFail || existingNote.improve || existingNote.daySleepMinutes || existingNote.daySleepHours || existingNote.nightAwakeMinutes || existingNote.nightAwakeHours || existingNote.nightWakes));
  const note = existingNote || {
    prideFail: '', improve: '', daySleepMinutes: 0, nightAwakeMinutes: 0
  };

  // Backward compat: lê em minutos preferencialmente; fallback pra hours*60
  const daySleepInit = (note.daySleepMinutes != null)
    ? note.daySleepMinutes
    : (note.daySleepHours || 0) * 60;
  const nightAwakeInit = (note.nightAwakeMinutes != null)
    ? note.nightAwakeMinutes
    : ((note.nightAwakeHours ?? note.nightWakes ?? 0) * 60);

  // Formata minutos: 0→"0", 15→"15min", 30→"30min", 60→"1h", 75→"1h15", 90→"1h30"...
  const fmtMin = (m) => {
    if (m <= 0) return '0';
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h${String(rem).padStart(2,'0')}`;
  };

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
        <div class="input-field-label">Quanto tempo dormi durante o dia? <small style="color:var(--muted);font-weight:500">(cochilos)</small></div>
        <div class="num-stepper" id="stp-daysleep" data-val="${daySleepInit}" data-min="0" data-max="360" data-step-size="15">
          <button type="button" class="step-arrow" data-step="-1" aria-label="diminuir">‹</button>
          <div class="step-val">${fmtMin(daySleepInit)}</div>
          <button type="button" class="step-arrow" data-step="+1" aria-label="aumentar">›</button>
        </div>
      </div>

      <div class="input-field">
        <div class="input-field-label">Quanto tempo fiquei acordado(a) na madrugada?</div>
        <div class="num-stepper" id="stp-nightawake" data-val="${nightAwakeInit}" data-min="0" data-max="360" data-step-size="15">
          <button type="button" class="step-arrow" data-step="-1" aria-label="diminuir">‹</button>
          <div class="step-val">${fmtMin(nightAwakeInit)}</div>
          <button type="button" class="step-arrow" data-step="+1" aria-label="aumentar">›</button>
        </div>
      </div>

      <div class="note-validate-msg" id="note-validate-msg" hidden>Preenche as duas perguntas pra registrar.</div>
      <div class="modal-actions">
        <button class="btn-secondary" id="note-cancel">Cancelar</button>
        <button class="btn-primary" id="note-register" disabled>✓ Registrar</button>
      </div>
      ${isEditing ? `
        <div class="note-delete-wrap">
          <button type="button" class="note-delete-btn" id="note-delete">🗑️ Excluir nota</button>
        </div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('#note-pride-fail').focus(), 80);

  // Validação: trava Registrar enquanto as duas perguntas não estiverem preenchidas
  const tPride   = modal.querySelector('#note-pride-fail');
  const tImprove = modal.querySelector('#note-improve');
  const regBtn   = modal.querySelector('#note-register');
  const valMsg   = modal.querySelector('#note-validate-msg');
  const checkValid = () => {
    const ok = tPride.value.trim().length > 0 && tImprove.value.trim().length > 0;
    regBtn.disabled = !ok;
    return ok;
  };
  tPride.addEventListener('input', () => {
    tPride.classList.toggle('invalid', !tPride.value.trim());
    checkValid();
    if (checkValid()) valMsg.hidden = true;
  });
  tImprove.addEventListener('input', () => {
    tImprove.classList.toggle('invalid', !tImprove.value.trim());
    checkValid();
    if (checkValid()) valMsg.hidden = true;
  });
  // Inicializa (caso já venha preenchido vindo do Firestore)
  checkValid();

  // Back button do celular fecha o modal sem sair do Ritual
  let popped = false, cameFromPop = false;
  const onPop = () => { cameFromPop = true; finish(false); };
  window.addEventListener('popstate', onPop);
  history.pushState({ noteModal: true }, '');

  const finish = (registered) => {
    if (popped) return;
    popped = true;
    window.removeEventListener('popstate', onPop);
    modal.remove();
    if (!cameFromPop) setTimeout(() => { try { history.back(); } catch {} }, 0);
    resolve(!!registered);
  };
  const close = () => finish(false);
  modal.querySelector('#note-cancel').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  // Excluir nota (só aparece em modo de edição)
  const delBtn = modal.querySelector('#note-delete');
  if (delBtn) {
    delBtn.onclick = async () => {
      const ok = await confirmModal({
        title: 'Excluir nota?',
        message: 'Vai apagar essa nota do dia. Você pode registrar uma nova depois.',
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        danger: true
      });
      if (!ok) return;
      try {
        day.meta.dayNote = null;
        await setDayMeta(dayDocId, { dayNote: null });
        prevNoteCache.delete(dayDocId);
        playDelete();
        showToast('Nota excluída', 'success');
        // Re-render do botão de nota no card
        const wrap = document.querySelector(`.day-note-wrap[data-day="${dayDocId}"]`);
        if (wrap) wrap.innerHTML = renderDayNoteButton(day);
        finish(false);
      } catch (err) {
        console.error('[note-del] erro:', err);
        showToast('Erro ao excluir a nota', 'error');
      }
    };
  }

  // Wire steppers — suporta data-step-size (ex: 15 pra incrementos de 15min)
  // Se data-unit existir (legado), usa unidade textual; senão usa fmtMin
  modal.querySelectorAll('.num-stepper').forEach(stp => {
    const valEl = stp.querySelector('.step-val');
    const unit = stp.dataset.unit;
    const stepSize = parseInt(stp.dataset.stepSize, 10) || 1;
    const min = parseInt(stp.dataset.min, 10);
    const max = parseInt(stp.dataset.max, 10);
    const fmt = unit ? (v) => `${v}${unit}` : fmtMin;
    stp.querySelectorAll('.step-arrow').forEach(btn => {
      btn.addEventListener('click', () => {
        let v = parseInt(stp.dataset.val, 10);
        v += parseInt(btn.dataset.step, 10) * stepSize;
        if (v < min) v = min; if (v > max) v = max;
        stp.dataset.val = v;
        valEl.textContent = fmt(v);
        if (navigator.vibrate) navigator.vibrate(8);
      });
    });
  });

  modal.querySelector('#note-register').onclick = async () => {
    // Guard: campos obrigatórios
    if (!checkValid()) {
      valMsg.hidden = false;
      if (!tPride.value.trim()) {
        tPride.classList.add('invalid');
        tPride.focus();
      } else if (!tImprove.value.trim()) {
        tImprove.classList.add('invalid');
        tImprove.focus();
      }
      if (navigator.vibrate) navigator.vibrate(40);
      return;
    }
    const dsMin = parseInt(modal.querySelector('#stp-daysleep').dataset.val, 10) || 0;
    const naMin = parseInt(modal.querySelector('#stp-nightawake').dataset.val, 10) || 0;
    const data = {
      prideFail:          modal.querySelector('#note-pride-fail').value.trim(),
      improve:            modal.querySelector('#note-improve').value.trim(),
      daySleepMinutes:    dsMin,
      nightAwakeMinutes:  naMin,
      // Mantém compat com leituras antigas (Desempenho usa daySleepHours)
      daySleepHours:      Math.round(dsMin / 60 * 10) / 10,
      nightAwakeHours:    Math.round(naMin / 60 * 10) / 10,
      registeredAt: new Date().toISOString()
    };

    try {
      day.meta.dayNote = data;
      await setDayMeta(dayDocId, { dayNote: data });
      // Atualiza cache: esse dia agora tem nota → não dispara mais o aviso
      prevNoteCache.set(dayDocId, true);

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
        finish(true);
        // Re-render só o botão de nota no card
        const wrap = document.querySelector(`.day-note-wrap[data-day="${dayDocId}"]`);
        if (wrap) wrap.innerHTML = renderDayNoteButton(day);
      }, 1500);
    } catch (err) {
      console.error('[note] save erro:', err);
      showToast('Erro ao salvar a nota.', 'error');
    }
  };
  }); // end Promise
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

      <div class="input-field-label" style="margin-top:8px">Repetir</div>
      <div class="recur-chips" id="recur-chips">
        <button type="button" class="recur-chip" data-recur="today">📌 Somente hoje</button>
        <button type="button" class="recur-chip active" data-recur="weekly">🔁 ${recurWeeklyLabel(day.date.getDay())}</button>
        <button type="button" class="recur-chip" data-recur="daily">📅 Todos os dias</button>
      </div>

      ${categories.length === 0 ? `<div style="padding:8px 0;color:var(--muted);font-size:11px;text-align:center">
        Nenhuma atividade cadastrada. Vai na <a href="#/home" style="color:var(--accent)">Home</a> pra criar.
      </div>` : ''}

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">+ Adicionar</button>
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

  // Wire dos chips de recorrência (seleção exclusiva)
  modal.querySelectorAll('.recur-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      modal.querySelectorAll('.recur-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  modal.querySelector('#m-save').onclick = async () => {
    const categoryId = modal.querySelector('#m-cat').value || null;
    const cat = categoryId ? categories.find(c => c.id === categoryId) : null;
    let title = modal.querySelector('#m-title').value.trim();
    if (!title) {
      if (cat) title = cat.name;
      else { showToast('Digite um título ou escolha uma atividade', 'info'); return; }
    }
    const startTime = modal.querySelector('#m-time-trigger')?.dataset.time || '';
    const reminderEnabled = modal.querySelector('#m-reminder').checked;
    const recur = modal.querySelector('.recur-chip.active')?.dataset.recur || 'weekly';

    const baseTask = {
      activityId: null, title, desc: '',
      startTime, shiftId, categoryId,
      done: false, reminderEnabled
    };

    try {
      // Sempre adiciona no dia atual
      const order = day.tasks.filter(t => t.shiftId === shiftId).length;
      const tid = await addDayTask(dayDocId, { ...baseTask, order });
      day.tasks.push({ id: tid, ...baseTask, order });
      await propagateReminderToCategory(categoryId, reminderEnabled);

      // RECORRÊNCIA
      if (recur === 'daily') {
        // Adiciona em todos os outros dias da semana atual
        for (const otherDay of weekData) {
          if (otherDay.id === dayDocId) continue;
          const otherOrder = otherDay.tasks.filter(t => t.shiftId === shiftId).length;
          const oid = await addDayTask(otherDay.id, { ...baseTask, order: otherOrder });
          otherDay.tasks.push({ id: oid, ...baseTask, order: otherOrder });
        }
        // Salva no template de TODOS os 7 dias-da-semana
        const templateTask = {
          activityId: null, title, desc: '',
          startTime, shiftId: shiftId || null, categoryId: categoryId || null,
          icon: '', reminderEnabled
        };
        for (let dow = 0; dow < 7; dow++) {
          const existing = (await getWeekdayTemplate(dow)) || [];
          existing.push(templateTask);
          await setWeekdayTemplate(dow, existing);
        }
      } else if (recur === 'today') {
        // Somente hoje — sem sync de template
        modal.remove();
        const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
        if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
        updateDayCardStats(dayDocId, false); // false = NÃO sincroniza template
        return;
      }
      // 'weekly' (default) — sync padrão pro DOW de hoje
      modal.remove();
      const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
      if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId); // default true = sync template do DOW atual

      // Se 'daily', re-renderiza outros day cards também
      if (recur === 'daily') {
        weekData.forEach(other => {
          if (other.id === dayDocId) return;
          const otherEl = document.querySelector(`.day-card[data-day-id="${other.id}"]`);
          if (otherEl) otherEl.querySelector('.day-card-content').innerHTML = renderDayContent(other);
          updateDayCardStats(other.id, false);
        });
        showToast('Tarefa adicionada em todos os dias!', 'success');
      }
    } catch (err) {
      console.error('[add-task] erro:', err);
      showToast('Erro ao salvar.', 'error');
    }
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

      <div class="input-field-label" style="margin-top:8px">Aplicar mudança a</div>
      <div class="recur-chips" id="recur-chips">
        <button type="button" class="recur-chip active" data-recur="today">📌 Somente este dia</button>
        <button type="button" class="recur-chip" data-recur="weekly">🔁 ${recurWeeklyLabel(day.date.getDay())}</button>
        <button type="button" class="recur-chip" data-recur="daily">📅 Todos os dias da semana</button>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#m-cancel').onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  // Wire chips de recorrência (seleção exclusiva)
  modal.querySelectorAll('.recur-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      modal.querySelectorAll('.recur-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
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
    const recur = modal.querySelector('.recur-chip.active')?.dataset.recur || 'today';

    Object.assign(t, data);
    await updateDayTask(dayDocId, taskId, data);
    await propagateReminderToCategory(t.categoryId, t.reminderEnabled);

    // RECORRÊNCIA: replica a edição nos outros dias se o usuário pediu
    if (recur === 'daily') {
      // Aplica a TODOS os outros dias da semana com tarefa de mesmo título/categoria
      // Se algum dia não tiver, adiciona
      for (const otherDay of weekData) {
        if (otherDay.id === dayDocId) continue;
        const existing = otherDay.tasks.find(x => x.title === t.title && x.categoryId === t.categoryId);
        const baseTask = {
          activityId: t.activityId || null,
          title: data.title, desc: data.desc,
          startTime: data.startTime,
          shiftId: data.shiftId,
          categoryId: t.categoryId || null,
          icon: data.icon || '',
          reminderEnabled: data.reminderEnabled,
          done: existing?.done || false,
        };
        if (existing) {
          await updateDayTask(otherDay.id, existing.id, baseTask);
          Object.assign(existing, baseTask);
        } else {
          const order = otherDay.tasks.filter(x => x.shiftId === baseTask.shiftId).length;
          const newId = await addDayTask(otherDay.id, { ...baseTask, order });
          otherDay.tasks.push({ id: newId, ...baseTask, order });
        }
      }
    }
    // Sync template do DOW pra 'weekly' (e 'daily', que sobrescreve abaixo)
    // 'today' não sincroniza nada
    if (recur === 'weekly' || recur === 'daily') {
      // syncTemplateForDay vai rodar via updateDayCardStats(default true)
    }

    modal.remove();
    const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
    if (dayCardEl) {
      dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId, recur !== 'today');
    }

    // Re-renderiza outros dias se 'daily'
    if (recur === 'daily') {
      // Sincroniza template em TODOS os DOWs
      for (const otherDay of weekData) {
        if (otherDay.id === dayDocId) continue;
        const otherEl = document.querySelector(`.day-card[data-day-id="${otherDay.id}"]`);
        if (otherEl) otherEl.querySelector('.day-card-content').innerHTML = renderDayContent(otherDay);
        updateDayCardStats(otherDay.id, true);
      }
      showToast('Aplicado em todos os dias da semana', 'success');
    } else if (recur === 'weekly') {
      showToast('Aplicado nesta semana', 'success');
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
