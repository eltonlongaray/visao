// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getShifts, getCategories, getActivities,
  getDay, setDayMeta, getDayTasks, addDayTask, updateDayTask, deleteDayTask, dayId,
  getProfile, setProfile, parseTime,
  getWeekdayTemplate, setWeekdayTemplate,
  saveCategory, fetchDaysRange
} from '../store.js';
import { bottomNav } from '../components/bottom-nav.js';
import { showToast, showLocalToast, confirmModal } from '../toast.js';
import { playDone, playUndone, playDelete } from '../sounds.js';
import { openTimePicker } from '../time-picker.js';
import { trapModalBack } from '../modal-back.js';
import { isActive as tourIsActive } from '../tour.js';


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

// Mensagens específicas pra compromissos (tom mais formal/objetivo)
const COMMITMENT_DONE_MESSAGES = [
  'Missão cumprida ✓',
  'Tá feito!',
  'Registrado',
  'Resolvido',
  'Compromisso honrado 🤝',
  'Pago / entregue ✓',
  'Mais um na conta!',
  'Dever cumprido'
];
function randomCommitmentDoneMessage() {
  return COMMITMENT_DONE_MESSAGES[Math.floor(Math.random() * COMMITMENT_DONE_MESSAGES.length)];
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
const overdueShownThisSession = new Set();   // task ids permanentemente resolvidos (done/cancel/reagendado)
const overdueDismissed = new Set();           // dispensados sem ação — limpo ao entrar no ritual
let overdueCheckerTimer = null;
let overdueModalOpen = false;


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
    cancelText: 'Depois',
    chainedFlow: true  // evita que o history.back() deste modal feche o próximo da cadeia
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
// BLOCO 6.5: AUTO-GERAÇÃO DE TAREFAS (modelo simplificado)
//
// Fonte ÚNICA: weekdayTemplates (padrão por dia-da-semana).
// Esse template é atualizado AUTOMATICAMENTE pelo per-task recorrência
// (chips "🔁 Toda [dia]" / "📅 Todos os dias") no Ritual.
//
// REMOVIDO (dez/2026):
//   • Auto-gen baseado em categories.daysOfWeek — substituído pelo
//     mecanismo per-task no próprio Ritual.
// ═══════════════════════════════════════════════════════════════
async function autoGenerateMissingTasks() {
  const todayId = dayId(new Date());
  for (const day of weekData) {
    const dow = day.date.getDay();
    const template = profile?.weekdayTemplates?.[String(dow)];

    // Helper: filtra tarefas que o user excluiu (escopo "Só este dia") nesse dia
    const excludedGroups = Array.isArray(day.meta.excludedRecurrenceGroups) ? day.meta.excludedRecurrenceGroups : [];
    const excludedTitles = Array.isArray(day.meta.excludedRecurrenceTitles) ? day.meta.excludedRecurrenceTitles : [];
    const isExcluded = (tmpl) => {
      if (tmpl.recurrenceGroupId && excludedGroups.includes(tmpl.recurrenceGroupId)) return true;
      if (!tmpl.recurrenceGroupId) {
        const key = `${(tmpl.title || '').trim().toLowerCase()}::${tmpl.categoryId || ''}`;
        if (excludedTitles.includes(key)) return true;
      }
      return false;
    };

    // Dia virgem (sem tarefas + nunca gerado) → preenche do template do DOW (se houver)
    if (day.tasks.length === 0 && !day.meta.generated) {
      if (Array.isArray(template) && template.length > 0) {
        const tplFiltered = template.filter(x => !isExcluded(x));
        if (tplFiltered.length > 0) await addTemplateTasksToDay(day, tplFiltered, 0);
      }
      await setDayMeta(day.id, { generated: true });
      day.meta.generated = true;
      continue;
    }

    // Dia já gerado: sincroniza apenas tarefas FALTANTES do template (hoje em diante)
    if (day.meta.generated && Array.isArray(template) && template.length > 0 && day.id >= todayId) {
      const existing = new Set(day.tasks.map(t => keyOf(t)));
      const missing = template.filter(tmpl => !existing.has(keyOf(tmpl)) && !isExcluded(tmpl));
      if (missing.length > 0) {
        await addTemplateTasksToDay(day, missing, day.tasks.length);
      }
    }

    // ────── 3) Compromissos mensais: dia do mês bate com dayOfMonth do template ──────
    const monthly = profile?.monthlyCommitments;
    if (Array.isArray(monthly) && monthly.length > 0 && day.id >= todayId) {
      const dom = day.date.getDate();
      const matching = monthly.filter(m => m.dayOfMonth === dom && !isExcluded(m));
      if (matching.length > 0) {
        const existing = new Set(day.tasks.map(t => keyOf(t)));
        const toAdd = matching.filter(m => !existing.has(keyOf(m)));
        if (toAdd.length > 0) {
          await addTemplateTasksToDay(day, toAdd, day.tasks.length);
        }
      }
    }
  }
}

// Helper: insere tarefas do template a partir de uma posição (order)
// Se o template tem `order` definido, respeita ele (preserva posição em todas as semanas).
// Se tem recurrenceGroupId, propaga (pra reconhecer recorrencia em delete/edit).
async function addTemplateTasksToDay(day, templateTasks, startOrder) {
  let fallbackOrder = startOrder;
  for (const tmpl of templateTasks) {
    const orderToUse = (tmpl.order != null && tmpl.order !== '') ? tmpl.order : fallbackOrder++;
    const newTask = {
      activityId: tmpl.activityId || null,
      title: tmpl.title || 'Sem título',
      desc: tmpl.desc || '',
      kind: tmpl.kind || 'task',
      startTime: tmpl.startTime || '',
      shiftId: tmpl.shiftId || shifts[0]?.id || null,
      categoryId: tmpl.categoryId || null,
      icon: tmpl.icon || '',
      reminderEnabled: tmpl.reminderEnabled || false,
      done: false,
      order: orderToUse,
      ...(tmpl.recurrenceGroupId ? { recurrenceGroupId: tmpl.recurrenceGroupId } : {}),
      ...(tmpl.recurrenceType ? { recurrenceType: tmpl.recurrenceType } : {})
    };
    const tid = await addDayTask(day.id, newTask);
    day.tasks.push({ id: tid, ...newTask });
  }
}

// Chave de identidade da tarefa: categoria + título + turno + horário
// Usada pra evitar duplicar quando sincroniza template em dias já gerados
function keyOf(t) {
  // Se tem recurrenceGroupId, ele é a chave (instancias separadas com mesmo titulo
  // sao distinguidas). Senão, fallback pra combinacao classica.
  if (t.recurrenceGroupId) return `grp:${t.recurrenceGroupId}`;
  return `${t.categoryId || ''}|${t.title || ''}|${t.shiftId || ''}|${t.startTime || ''}`;
}

// Identidade pra recorrência:
//   - Se ambos têm recurrenceGroupId, match por groupId (instancias multiplas
//     com mesmo titulo no mesmo turno sao tratadas como recorrencias distintas).
//   - Senão, fallback pra titulo+categoryId (tarefas antigas sem grupo).
function sameTaskIdentity(a, b) {
  const ag = a?.recurrenceGroupId || '';
  const bg = b?.recurrenceGroupId || '';
  if (ag && bg) return ag === bg;
  // Se um tem grupo e o outro não → nao são a mesma recorrência
  if (ag || bg) return false;
  // Legado: titulo + categoria
  const at = (a?.title || '').trim().toLowerCase();
  const bt = (b?.title || '').trim().toLowerCase();
  if (!at || at !== bt) return false;
  const ac = a?.categoryId || '';
  const bc = b?.categoryId || '';
  return ac === bc;
}

// Gera UUID curto (8 chars hex) — suficiente pra evitar colisão dentro de 1 user
function genRecurId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'r_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return 'r_' + Math.random().toString(36).slice(2, 14);
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
      kind: t.kind || 'task',
      startTime: t.startTime || '',
      shiftId: t.shiftId || null,
      categoryId: t.categoryId || null,
      icon: t.icon || '',
      reminderEnabled: t.reminderEnabled || false,
      // PRESERVA recurrenceGroupId e recurrenceType na sincronização
      // (antes esses campos eram perdidos, quebrando detecção em edições)
      ...(t.recurrenceGroupId ? { recurrenceGroupId: t.recurrenceGroupId } : {}),
      ...(t.recurrenceType ? { recurrenceType: t.recurrenceType } : {})
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
  // Pop-up "Vamos começar o dia com soberania?" — 1x por dia
  // só dispara se as mensagens da manhã NÃO foram abertas hoje
  maybeShowSovereigntyPrompt();
}

const SOVEREIGNTY_KEY_PREFIX = 'visao_sovereignty_prompt_dismissed_';
function sovereigntyTodayKey() {
  const d = new Date();
  return `${SOVEREIGNTY_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function maybeShowSovereigntyPrompt() {
  // Durante o tour, não mostra esse modal (atrapalha a navegação guiada)
  if (tourIsActive()) return;
  // Se já dispensou hoje (ou abriu as mensagens), não mostra
  if (localStorage.getItem(sovereigntyTodayKey()) === '1') return;
  // hasUnreadToday() retorna true se NÃO leu hoje; queremos disparar se NÃO leu
  const { hasUnreadToday, openMorningMessages } = await import('../morning-messages.js');
  if (!hasUnreadToday()) {
    // Já leu as mensagens hoje — não precisa do prompt
    localStorage.setItem(sovereigntyTodayKey(), '1');
    return;
  }

  // Dá um respiro pra UI renderizar antes do modal
  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center">
        <div style="font-size:42px;margin-bottom:8px">👑</div>
        <div class="modal-title">Vamos começar o dia com soberania?</div>
        <div class="modal-hint" style="margin-bottom:16px">
          As 3 perguntas da manhã te ajudam a se posicionar e escolher a melhor versão de você hoje.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn-primary" id="sov-open">✨ Abrir mensagens</button>
          <button class="btn-secondary" id="sov-later">Deixar pra depois</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    // NÃO fecha ao clicar fora (omitido propositalmente)
    overlay.querySelector('#sov-open').onclick = () => {
      localStorage.setItem(sovereigntyTodayKey(), '1');
      close();
      setTimeout(() => openMorningMessages(), 150);
    };
    overlay.querySelector('#sov-later').onclick = () => {
      localStorage.setItem(sovereigntyTodayKey(), '1');
      close();
    };
  }, 600);
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
        ${commitmentsCard()}
      </div>
    </div>
    ${bottomNav('ritual')}
  `;
  attachHandlers(app);
  initTaskSortables();  // habilita drag-drop em cada task-list
  startOverdueChecker(app); // varre lembretes vencidos a cada 30s
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
      // GROUP compartilhado entre TODOS os turnos do mesmo dia → drag livre entre eles
      group: 'tasks',
      filter: '.task-thumb, .task-menu-btn-corner, button, input, textarea, select, a',
      preventOnFilter: false,
      delay: 250,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      scroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 18,
      ghostClass: 'task-ghost',
      dragClass: 'task-dragging',
      onChoose: () => {
        if (navigator.vibrate) navigator.vibrate(15);
      },
      onEnd: async (evt) => {
        const movedEl = evt.item;
        const taskId = movedEl?.dataset.taskId;
        const dayDocId = movedEl?.dataset.day;
        if (!taskId || !dayDocId) return;
        const day = weekData.find(d => d.id === dayDocId);
        if (!day) return;

        // Detecta novo turno baseado em onde o item caiu
        // evt.to é o container destino (.task-list dentro de .shift[data-shift-id])
        const destShiftEl = evt.to.closest('[data-shift-id]');
        const newShiftId = destShiftEl?.dataset.shiftId || null;
        const t = day.tasks.find(x => x.id === taskId);
        if (!t) return;

        const updates = [];
        // Se mudou de turno, atualiza o shiftId da task movida
        if (newShiftId && t.shiftId !== newShiftId) {
          t.shiftId = newShiftId;
          updates.push(updateDayTask(dayDocId, taskId, { shiftId: newShiftId }));
        }

        // Atualiza order do destino (todas as tarefas no turno destino)
        const destEls = Array.from(evt.to.querySelectorAll('[data-task-id]'));
        destEls.forEach((el, idx) => {
          const tid = el.dataset.taskId;
          const tt = day.tasks.find(x => x.id === tid);
          if (tt && tt.order !== idx) {
            tt.order = idx;
            updates.push(updateDayTask(dayDocId, tid, { order: idx }));
          }
        });

        // Se a tarefa saiu de um turno diferente, atualiza order do origem também
        if (evt.from !== evt.to) {
          const fromEls = Array.from(evt.from.querySelectorAll('[data-task-id]'));
          fromEls.forEach((el, idx) => {
            const tid = el.dataset.taskId;
            const tt = day.tasks.find(x => x.id === tid);
            if (tt && tt.order !== idx) {
              tt.order = idx;
              updates.push(updateDayTask(dayDocId, tid, { order: idx }));
            }
          });
          // Atualiza contadores dos shifts no DOM
          updateDayCardStats(dayDocId, false);
        }

        await Promise.all(updates);
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
  // Dot vermelho no header se tem QUALQUER tarefa com lembrete ainda pendente
  const hasPendingReminder = d.tasks.some(t => t.reminderEnabled && !t.done && !t.cancelled);
  return `
    <div class="day-card ${isExpanded ? 'open' : ''} ${isToday ? 'today' : ''} ${hasPendingReminder ? 'has-pending-reminder' : ''}" data-day-id="${d.id}" data-dow="${d.date.getDay()}">
      <button class="day-card-header" data-toggle-day="${d.id}">
        <div class="day-card-name">
          <span class="dow">${WEEKDAYS_FULL[d.date.getDay()]}${hasPendingReminder ? '<span class="day-reminder-dot" title="Tem tarefa com lembrete"></span>' : ''}</span>
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

// Coleta TODOS os compromissos (kind=='commitment') da semana ordenados por (dia, hora)
function getWeekCommitments() {
  const list = [];
  for (const day of weekData) {
    for (const t of day.tasks) {
      if (t.kind === 'commitment') list.push({ day, task: t });
    }
  }
  list.sort((a, b) => {
    if (a.day.id !== b.day.id) return a.day.id < b.day.id ? -1 : 1;
    const at = parseTime(a.task.startTime) ?? 1e9;
    const bt = parseTime(b.task.startTime) ?? 1e9;
    return at - bt;
  });
  return list;
}

// Sincroniza TODAS as instâncias do task no DOM (card do dia + aba Compromissos)
// Atualiza classes (done/cancelled), textContent do thumb, titulo
function syncTaskInDom(t) {
  const isCommitment = t.kind === 'commitment';
  let checkContent;
  if (t.cancelled) checkContent = '🚫';
  else if (isCommitment) checkContent = t.done ? '✓' : '';
  else checkContent = t.done ? '👍' : '👎';

  document.querySelectorAll(`.task[data-task-id="${t.id}"]`).forEach(el => {
    el.classList.toggle('done', !!t.done);
    el.classList.toggle('cancelled', !!t.cancelled);
    const thumb = el.querySelector('[data-action="check"]');
    if (thumb) {
      thumb.classList.toggle('done', !!t.done);
      thumb.classList.toggle('is-cancelled', !!t.cancelled);
      thumb.textContent = checkContent;
      thumb.title = t.cancelled ? 'Cancelada' : (t.done ? 'Feito!' : 'Marcar como feito');
    }
  });
}

// Re-renderiza o card de Compromissos no DOM (chamar após qualquer edit/delete/toggle)
function refreshCommitmentsCard() {
  const card = document.querySelector('.day-card.commitments-card');
  if (!card) return;
  const items = getWeekCommitments();
  const total = items.length;
  const done = items.filter(x => x.task.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const statsEl = card.querySelector('.day-card-stats');
  if (statsEl) statsEl.innerHTML = statsHtml(total, done, pct);
  const contentEl = card.querySelector('.day-card-content');
  if (contentEl) contentEl.innerHTML = renderCommitmentsContent(items);
}

function commitmentsCard() {
  const items = getWeekCommitments();
  const isExpanded = expanded.has('commitments');
  const total = items.length;
  const done = items.filter(x => x.task.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return `
    <div class="day-card commitments-card ${isExpanded ? 'open' : ''}" data-day-id="commitments">
      <button class="day-card-header" data-toggle-day="commitments">
        <div class="day-card-name">
          <span class="dow">📅 Compromissos</span>
          <span class="dnum">da semana</span>
        </div>
        <div class="day-card-stats">${statsHtml(total, done, pct)}</div>
        <span class="day-card-chevron">▾</span>
      </button>
      <div class="day-card-content">${renderCommitmentsContent(items)}</div>
    </div>
  `;
}

function renderCommitmentsContent(items) {
  if (items.length === 0) {
    return `
      <div style="padding:22px 14px;text-align:center;color:var(--muted);font-size:13px;line-height:1.5">
        Sem compromissos nesta semana.<br>
        <small>Crie um pelo + de qualquer dia escolhendo "📅 Compromisso".</small>
      </div>
    `;
  }
  const byDay = {};
  for (const it of items) {
    if (!byDay[it.day.id]) byDay[it.day.id] = { day: it.day, list: [] };
    byDay[it.day.id].list.push(it.task);
  }
  return Object.values(byDay).map(({ day, list }) => `
    <div class="commitments-day-group">
      <div class="commitments-day-label">
        ${WEEKDAYS_FULL[day.date.getDay()]} · ${String(day.date.getDate()).padStart(2,'0')}/${String(day.date.getMonth()+1).padStart(2,'0')}
      </div>
      <div class="task-list">
        ${list.sort(taskSort).map(t => taskCard(t, day.id)).join('')}
      </div>
    </div>
  `).join('');
}

function renderDayContent(d) {
  const hydPct = Math.min(100, Math.round((d.meta.hydrationMl / d.meta.hydrationGoal) * 100 || 0));
  const wakeReal = toHHMM(d.meta.wakeTime);
  const sleepReal = toHHMM(d.meta.sleepTime);
  // Vazio mostra '--:--' explicito; o default do perfil é usado só pra abrir o picker
  const wakeDisplay = wakeReal || '--:--';
  const sleepDisplay = sleepReal || '--:--';
  const wakeIsEmpty = !wakeReal;
  const sleepIsEmpty = !sleepReal;
  return `
    <div class="time-pills">
      <label class="time-pill">
        <span class="time-pill-label">🌅 Acordei</span>
        <button type="button" class="time-pill-input tp-pill-trigger ${wakeIsEmpty ? 'is-placeholder' : ''}" data-meta="wakeTime" data-day="${d.id}" data-time="${wakeReal || ''}">${wakeDisplay}</button>
      </label>
      <button class="pull-prev-day-pretty" data-action="pull-prev-day" data-day="${d.id}" title="Trazer atividades de outro dia">
        <span class="pull-prev-ic">📥</span>
      </button>
      <label class="time-pill">
        <span class="time-pill-label">🌙 Dormi</span>
        <button type="button" class="time-pill-input tp-pill-trigger ${sleepIsEmpty ? 'is-placeholder' : ''}" data-meta="sleepTime" data-day="${d.id}" data-time="${sleepReal || ''}">${sleepDisplay}</button>
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
        🗑️ Apagar tudo deste dia
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

  // Tasks sem turno vão pro primeiro shift (evita sumirem no _none não-renderizado)
  if (byShift['_none'].length > 0) {
    byShift[shifts[0].id].push(...byShift['_none']);
    byShift['_none'] = [];
  }

  // (Banner antigo "Trazer dia anterior" removido — agora usa o icone ↓ entre as pilulas)

  return shifts.map(s => `
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

// Abre modal pra escolher QUAL dia anterior trazer (últimos 7 dias com tarefas).
async function pullPrevDay(app, dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;

  // Coleta os últimos 7 dias anteriores que TÊM tarefas (mistura weekData + Firestore)
  const [y, m, dd] = dayDocId.split('-').map(n => parseInt(n, 10));
  const baseDate = new Date(y, m - 1, dd);

  // Tenta achar 7 candidatos com tarefas. Anda pra trás até 14 dias máximo
  const candidates = [];
  for (let back = 1; back <= 14 && candidates.length < 7; back++) {
    const dt = new Date(baseDate);
    dt.setDate(baseDate.getDate() - back);
    const id = dayId(dt);
    let tasks;
    const inWeek = weekData.find(x => x.id === id);
    if (inWeek) tasks = inWeek.tasks;
    else {
      try { tasks = await getDayTasks(id); }
      catch { tasks = []; }
    }
    if (tasks && tasks.length > 0) {
      candidates.push({ id, date: dt, tasks });
    }
  }

  if (candidates.length === 0) {
    showToast('Nenhum dia anterior com tarefas pra trazer', 'info');
    return;
  }

  // Modal com opções
  const choice = await pickPrevDayModal(candidates);
  if (!choice) return;

  // Delay pra deixar o history.back do trap do picker settle ANTES de abrir
  // o confirmModal — senão o pop chega no confirmModal e fecha ele silenciosamente
  await new Promise(r => setTimeout(r, 150));
  await replaceDayWithPrev(app, dayDocId, choice);
}

// Modal de escolha do dia anterior — lista os candidatos com data + count de tarefas
function pickPrevDayModal(candidates) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const items = candidates.map(c => {
      const dow = WEEKDAYS_FULL[c.date.getDay()];
      const dataFmt = `${String(c.date.getDate()).padStart(2,'0')}/${String(c.date.getMonth()+1).padStart(2,'0')}`;
      const n = c.tasks.length;
      return `
        <button type="button" class="pick-day-opt" data-id="${c.id}">
          <span class="pick-day-arrow">↓</span>
          <span class="pick-day-name">
            <strong>${dow}</strong>
            <small>${dataFmt}</small>
          </span>
          <span class="pick-day-count">${n} tarefa${n === 1 ? '' : 's'}</span>
        </button>
      `;
    }).join('');
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-title">Trazer qual dia pra cá?</div>
        <div class="modal-hint">As atividades serão ACRESCENTADAS às suas atuais (sem apagar nada).</div>
        <div class="pick-day-list">${items}</div>
        <div class="modal-actions">
          <button class="btn-secondary" id="pick-cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    let resolved = false;
    const finishClose = trapModalBack(() => {
      modal.remove();
      if (!resolved) { resolved = true; resolve(null); }
    });
    const pick = (val) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
      finishClose();
    };
    modal.querySelector('#pick-cancel').onclick = () => pick(null);
    modal.querySelectorAll('[data-id]').forEach(btn => {
      btn.onclick = () => {
        const c = candidates.find(x => x.id === btn.dataset.id);
        pick(c || null);
      };
    });
    // Clique fora NÃO fecha aqui também (consistente com criar/editar)
  });
}

// Executa a ADIÇÃO de tarefas do dia escolhido (sem apagar as atuais)
async function replaceDayWithPrev(app, dayDocId, choice) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  const dow = WEEKDAYS_FULL[choice.date.getDay()];
  const dataFmt = `${String(choice.date.getDate()).padStart(2,'0')}/${String(choice.date.getMonth()+1).padStart(2,'0')}`;
  const ok = await confirmModal({
    title: `Trazer ${dow.toLowerCase()} (${dataFmt})?`,
    message: `Vai ACRESCENTAR as ${choice.tasks.length} tarefas de ${dow.toLowerCase()} ${dataFmt} às suas atuais (sem apagar as que já existem).`,
    confirmText: 'Acrescentar',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  try {
    // Anti-dup ROBUSTO: por groupId (recorrentes) OU por título+categoria
    // Evita duplicar tarefas diárias/semanais que já estão no dia atual
    const matchesT = (a, b) => {
      if (a.recurrenceGroupId && b.recurrenceGroupId && a.recurrenceGroupId === b.recurrenceGroupId) return true;
      const at = (a.title || '').trim().toLowerCase();
      const bt = (b.title || '').trim().toLowerCase();
      if (!at || at !== bt) return false;
      return (a.categoryId || '') === (b.categoryId || '');
    };
    const toAdd = choice.tasks.filter(ct => !day.tasks.some(et => matchesT(et, ct)));
    if (toAdd.length === 0) {
      showToast('Essas tarefas já estão neste dia', 'info');
      return;
    }
    const sorted = toAdd.slice().sort(taskSort);
    // order começa a partir do final das tarefas existentes
    let order = day.tasks.length;
    for (const t of sorted) {
      const newTask = {
        activityId: t.activityId || null,
        title: t.title,
        desc: t.desc || '',
        kind: t.kind || 'task',
        startTime: t.startTime || '',
        shiftId: t.shiftId || (shifts[0]?.id || null),
        categoryId: t.categoryId || null,
        icon: t.icon || '',
        done: false,
        order: order++,
        reminderEnabled: t.reminderEnabled || false,
        ...(t.recurrenceGroupId ? { recurrenceGroupId: t.recurrenceGroupId } : {})
      };
      const tid = await addDayTask(dayDocId, newTask);
      day.tasks.push({ id: tid, ...newTask });
    }
    await setDayMeta(dayDocId, { generated: true });
    day.meta.generated = true;
    const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
    if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
    updateDayCardStats(dayDocId, false);
    showToast(`Acrescentadas ${sorted.length} tarefa${sorted.length === 1 ? '' : 's'} de ${dow.toLowerCase()} ${dataFmt}`, 'success');
  } catch (err) {
    console.error('[replace-day-with-prev] erro:', err);
    showToast('Erro ao trazer dia', 'error');
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6.7: LEMBRETES VENCIDOS — Checker + Modal de ação
//
// A cada 30s, varre as tarefas da semana atual procurando:
//   reminderEnabled === true
//   && !done
//   && !cancelled
//   && (data+hora do startTime já passou)
//   && não foi mostrada nessa sessão
// Pra cada uma, abre um modal com 3 opções:
//   1. Marcar como feito → done = true
//   2. Reagendar → abre time picker pra novo horário
//   3. Cancelar atividade → cancelled = true
// ═══════════════════════════════════════════════════════════════
function startOverdueChecker(app) {
  overdueDismissed.clear(); // re-entrou na tela → compromissos dispensados reaparecem
  if (overdueCheckerTimer) clearInterval(overdueCheckerTimer);
  const tick = () => checkOverdueReminders(app);
  // Roda agora + a cada 30s
  setTimeout(tick, 800);
  overdueCheckerTimer = setInterval(tick, 30000);
}

function stopOverdueChecker() {
  if (overdueCheckerTimer) {
    clearInterval(overdueCheckerTimer);
    overdueCheckerTimer = null;
  }
}

async function checkOverdueReminders(app) {
  if (overdueModalOpen) return;
  if (!location.hash.startsWith('#/ritual')) return;
  const now = Date.now();
  const todayStr = dayId(new Date());
  // SÓ verifica vencidos de HOJE — dias passados são histórico, não devem cobrar
  // Antes, tarefas diárias recorrentes com horário passado disparavam o modal pra
  // CADA instância semanal (1 por dia), enchendo o saco do usuário.
  const today = weekData.find(d => d.id === todayStr);
  if (!today) return;
  for (const t of today.tasks) {
    // compromissos com horário são sempre cobrados; tarefas só se reminderEnabled=true
    if (t.kind !== 'commitment' && !t.reminderEnabled) continue;
    if (t.done || t.cancelled) continue;
    if (!t.startTime) continue;
    if (overdueShownThisSession.has(t.id)) continue;
    if (overdueDismissed.has(t.id)) continue;
    const startMin = parseTime(t.startTime);
    if (startMin === null) continue;
    const [y, m, dd] = todayStr.split('-').map(n => parseInt(n, 10));
    const taskDt = new Date(y, m - 1, dd, Math.floor(startMin/60), startMin % 60);
    if (taskDt.getTime() <= now) {
      await showOverdueReminderModal(app, today, t);
      return;
    }
  }
}

// Abre sub-modal pra escolher tipo de recorrência. Retorna:
//   { recur: 'today'|'weekly'|'daily'|'monthly', daysOfMonth?: [int] }
//   ou null se cancelar
//
// options:
//   currentDate    — Date base (usado pra label "Toda quarta")
//   currentRecur   — recorrência atual (pré-seleciona visual)
//   isCommitment   — se true, mostra "Todo mês"
function openRecurrenceChooser(options = {}) {
  return new Promise((resolve) => {
    const currentDate = options.currentDate || new Date();
    const dow = currentDate.getDay();
    const dowLabel = recurWeeklyLabel(dow);
    const isCommitment = !!options.isCommitment;
    const initialRecur = options.currentRecur || 'today';
    const initialDays = Array.isArray(options.currentDaysOfMonth) ? options.currentDaysOfMonth.slice() : [];

    // Estado local: qual opção está selecionada + dias (se specific)
    // 'specific' significa monthly com dias customizados (não o dia atual)
    let selectedKey = initialRecur === 'monthly' && initialDays.length > 0 && !(initialDays.length === 1 && initialDays[0] === currentDate.getDate())
      ? 'specific'
      : initialRecur;
    let chosenDays = selectedKey === 'specific' ? initialDays.slice() : [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const renderSpecificLabel = () => {
      if (chosenDays.length === 0) return 'Abre calendário pra escolher dia(s) do mês';
      if (chosenDays.length === 1) return `Selecionado: dia ${chosenDays[0]}`;
      return `Selecionados: dias ${chosenDays.join(', ')}`;
    };

    const renderHTML = () => `
      <div class="modal recur-chooser-modal">
        <div class="modal-title">Repetir como?</div>
        <div class="modal-hint">Escolha uma frequência e clique em Confirmar.</div>

        <div class="recur-options">
          <button type="button" class="recur-opt ${selectedKey === 'today' ? 'sel' : ''}" data-recur="today">
            <span class="recur-opt-ic">📌</span>
            <span class="recur-opt-text">
              <strong>Somente este dia</strong>
              <small>Não repete</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
          <button type="button" class="recur-opt ${selectedKey === 'weekly' ? 'sel' : ''}" data-recur="weekly">
            <span class="recur-opt-ic">🔁</span>
            <span class="recur-opt-text">
              <strong>${escape(dowLabel)}</strong>
              <small>Repete no mesmo dia da semana</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
          <button type="button" class="recur-opt ${selectedKey === 'daily' ? 'sel' : ''}" data-recur="daily">
            <span class="recur-opt-ic">📅</span>
            <span class="recur-opt-text">
              <strong>Todos os dias</strong>
              <small>Repete todos os dias daqui em diante</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
          ${isCommitment ? `
            <button type="button" class="recur-opt ${selectedKey === 'monthly' ? 'sel' : ''}" data-recur="monthly">
              <span class="recur-opt-ic">📆</span>
              <span class="recur-opt-text">
                <strong>Todo dia ${currentDate.getDate()}</strong>
                <small>Mensal — todo mês neste dia</small>
              </span>
              <span class="recur-opt-check">✓</span>
            </button>
          ` : ''}
          <button type="button" class="recur-opt ${selectedKey === 'specific' ? 'sel' : ''}" data-recur="specific">
            <span class="recur-opt-ic">🗓️</span>
            <span class="recur-opt-text">
              <strong>Escolher dia específico</strong>
              <small>${escape(renderSpecificLabel())}</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="rc-cancel">Cancelar</button>
          <button class="btn-primary" id="rc-confirm">Confirmar</button>
        </div>
      </div>
    `;
    overlay.innerHTML = renderHTML();
    document.body.appendChild(overlay);

    let resolved = false;
    const trapClose = trapModalBack(() => {
      overlay.remove();
      if (!resolved) { resolved = true; resolve(null); }
    });
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
      trapClose();
    };

    const rerender = () => {
      overlay.innerHTML = renderHTML();
      wire();
    };

    const wire = () => {
      overlay.querySelector('#rc-cancel').onclick = () => finish(null);
      overlay.querySelector('#rc-confirm').onclick = () => {
        if (selectedKey === 'specific') {
          if (chosenDays.length === 0) {
            showToast('Toque em "Escolher dia específico" pra abrir o calendário', 'info');
            return;
          }
          finish({ recur: 'monthly', daysOfMonth: chosenDays });
        } else if (selectedKey === 'monthly') {
          finish({ recur: 'monthly' }); // usa day.date.getDate() no save
        } else {
          finish({ recur: selectedKey });
        }
      };
      overlay.querySelectorAll('[data-recur]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const choice = btn.dataset.recur;
          if (choice === 'specific') {
            // Abre calendário multi-select
            const dates = await openDatePicker(currentDate, {
              multiSelect: true,
              title: 'Escolha o(s) dia(s) do mês'
            });
            if (!dates || dates.length === 0) return; // mantém estado
            chosenDays = [...new Set(dates.map(d => d.getDate()))].sort((a,b) => a-b);
            selectedKey = 'specific';
            rerender();
          } else {
            selectedKey = choice;
            if (choice !== 'specific') chosenDays = [];
            rerender();
          }
        });
      });
    };
    wire();
  });
}

// Date picker: calendário pra escolher uma ou mais datas.
//   options.multiSelect=true → retorna array de Date (toggle on click)
//   senão                    → retorna 1 Date ou null
function openDatePicker(initialDate = new Date(), options = {}) {
  return new Promise((resolve) => {
    const multiSelect = !!options.multiSelect;
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    let viewYear = initialDate.getFullYear();
    let viewMonth = initialDate.getMonth();
    // No multi: array de YYYY-MM-DD; no single: 1 string
    let selectedIds = multiSelect ? new Set() : new Set([dayId(initialDate)]);
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal date-picker-modal">
        ${options.title ? `<div class="modal-title">${escape(options.title)}</div>` : ''}
        ${multiSelect ? '<div class="modal-hint">Toque pra selecionar/desselecionar. Pode escolher vários dias do mês.</div>' : ''}
        <div class="cal-header">
          <button type="button" class="cal-nav" data-dp-nav="-1">‹</button>
          <div class="cal-title" id="dp-title"></div>
          <button type="button" class="cal-nav" data-dp-nav="1">›</button>
        </div>
        <div class="cal-grid-wrap">
          <div class="cal-weekdays">
            <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
          </div>
          <div class="cal-grid" id="dp-grid"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="dp-cancel">Cancelar</button>
          <button class="btn-primary" id="dp-save">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const titleEl = overlay.querySelector('#dp-title');
    const gridEl = overlay.querySelector('#dp-grid');

    let resolved = false;
    const trapClose = trapModalBack(() => {
      overlay.remove();
      if (!resolved) { resolved = true; resolve(null); }
    });
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
      trapClose();
    };

    const renderGrid = () => {
      titleEl.textContent = `${monthNames[viewMonth]} ${viewYear}`;
      const firstDay = new Date(viewYear, viewMonth, 1);
      const lastDay = new Date(viewYear, viewMonth + 1, 0);
      const startDow = firstDay.getDay();
      const daysInMonth = lastDay.getDate();
      const todayIdStr = dayId(todayDate);
      let html = '';
      for (let i = 0; i < startDow; i++) html += '<span class="cal-cell empty"></span>';
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(viewYear, viewMonth, d);
        const idStr = dayId(dt);
        const isToday = idStr === todayIdStr;
        const isSelected = selectedIds.has(idStr);
        html += `<button type="button" class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-dp-day="${idStr}">${d}</button>`;
      }
      gridEl.innerHTML = html;
    };
    renderGrid();

    overlay.querySelectorAll('[data-dp-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.dpNav, 10);
        viewMonth += delta;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        else if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        renderGrid();
      });
    });

    gridEl.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-dp-day]');
      if (!cell) return;
      const id = cell.dataset.dpDay;
      if (multiSelect) {
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
      } else {
        selectedIds = new Set([id]);
      }
      renderGrid();
    });

    overlay.querySelector('#dp-cancel').onclick = () => finish(null);
    overlay.querySelector('#dp-save').onclick = () => {
      if (selectedIds.size === 0) {
        showToast('Escolha pelo menos um dia', 'info');
        return;
      }
      const dates = [...selectedIds].sort().map(id => {
        const [y, m, d] = id.split('-').map(n => parseInt(n, 10));
        return new Date(y, m - 1, d);
      });
      finish(multiSelect ? dates : dates[0]);
    };
  });
}

async function showOverdueReminderModal(app, day, t) {
  overdueModalOpen = true;
  const dataFmt = `${String(day.date.getDate()).padStart(2,'0')}/${String(day.date.getMonth()+1).padStart(2,'0')}`;
  const horaFmt = toHHMM(t.startTime) || '—';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-title">⏰ Lembrete vencido</div>
      <div class="modal-hint" style="text-align:center; line-height:1.55; padding: 6px 0">
        <strong>${escape(t.title)}</strong><br>
        agendada pra <strong>${dataFmt} às ${horaFmt}</strong> ainda não foi tratada.<br>
        <small style="color:var(--muted)">O que aconteceu?</small>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px">
        <button class="btn-primary" data-overdue="done">✅ Marcar como feito</button>
        <button class="btn-secondary" data-overdue="reschedule">🕐 Reagendar</button>
        <button class="btn-secondary" data-overdue="cancel">🚫 Atividade cancelada</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // close() limpa modal + history state. Usado tanto pelo back quanto pelas ações.
  let actionTaken = false;
  const close = trapModalBack(() => {
    modal.remove();
    overdueModalOpen = false;
    // Se fechou sem ação: entra em overdueDismissed (reaparece ao voltar para a tela)
    if (!actionTaken) overdueDismissed.add(t.id);
  });
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('[data-overdue="done"]').onclick = async () => {
    try {
      t.done = true;
      await updateDayTask(day.id, t.id, { done: true });
      playDone();
      syncTaskInDom(t); // atualiza day card + aba Compromissos
      updateDayCardStats(day.id, false);
      actionTaken = true;
      overdueShownThisSession.add(t.id);
      close();
      showToast('Marcado como feito ✓', 'success');
    } catch (err) {
      console.error('[overdue-done] erro:', err);
      showToast('Erro ao marcar feito', 'error');
    }
  };

  modal.querySelector('[data-overdue="reschedule"]').onclick = async () => {
    // Pega data e hora ANTES de fechar — close() dispara history.back() assíncrono
    // que mataria o calendário/relógio se abertos depois dele
    const newDate = await openDatePicker(day.date, { title: 'Reagendar pra qual dia?' });
    if (!newDate) return;
    const newTime = await openTimePicker(toHHMM(t.startTime) || '', { title: 'Reagendar pra qual horário?' });
    if (!newTime) return;
    // Só fecha o modal após confirmar data e hora
    actionTaken = true;
    overdueShownThisSession.add(t.id);
    close();
    try {
      const newDayId = dayId(newDate);
      const newCount = (t.rescheduleCount || 0) + 1;
      if (newDayId === day.id) {
        // Mesmo dia → só atualiza hora
        t.startTime = newTime;
        t.rescheduleCount = newCount;
        await updateDayTask(day.id, t.id, { startTime: newTime, rescheduleCount: newCount });
      } else {
        // Dia diferente → MOVE: apaga do dia antigo, cria no novo
        await deleteDayTask(day.id, t.id);
        day.tasks = day.tasks.filter(x => x.id !== t.id);
        // Garante que o dia destino existe no Firestore (se virgem) — addDayTask cria sob demanda
        const newTask = {
          activityId: t.activityId || null,
          title: t.title,
          desc: t.desc || '',
          kind: t.kind || 'task',
          startTime: newTime,
          shiftId: t.shiftId || null,
          categoryId: t.categoryId || null,
          icon: t.icon || '',
          done: false,
          cancelled: false,
          order: 0,
          reminderEnabled: t.reminderEnabled || false,
          rescheduleCount: newCount,
          ...(t.recurrenceGroupId ? { recurrenceGroupId: t.recurrenceGroupId } : {})
        };
        await addDayTask(newDayId, newTask);
        // Se o dia destino estava em weekData, adiciona localmente também
        const destInWeek = weekData.find(d => d.id === newDayId);
        if (destInWeek) {
          newTask.order = destInWeek.tasks.length;
          destInWeek.tasks.push({ ...newTask });
        }
      }
      const dayCardEl = document.querySelector(`.day-card[data-day-id="${day.id}"]`);
      if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(day.id, false);
      // Re-render do destino se na mesma semana
      const destDay = weekData.find(d => d.id === newDayId);
      if (destDay) {
        const destEl = document.querySelector(`.day-card[data-day-id="${newDayId}"]`);
        if (destEl) destEl.querySelector('.day-card-content').innerHTML = renderDayContent(destDay);
        updateDayCardStats(newDayId, false);
      }
      const dateLabel = `${String(newDate.getDate()).padStart(2,'0')}/${String(newDate.getMonth()+1).padStart(2,'0')}`;
      showToast(`Reagendado pra ${dateLabel} às ${newTime}`, 'success');
    } catch (err) {
      console.error('[overdue-resched] erro:', err);
      showToast('Erro ao reagendar', 'error');
    }
  };

  modal.querySelector('[data-overdue="cancel"]').onclick = async () => {
    try {
      t.cancelled = true;
      await updateDayTask(day.id, t.id, { cancelled: true });
      playUndone();
      syncTaskInDom(t); // atualiza day card + aba Compromissos (vira 🚫 em ambos)
      updateDayCardStats(day.id, false);
      actionTaken = true;
      overdueShownThisSession.add(t.id);
      close();
      showToast('Atividade marcada como cancelada', 'info');
    } catch (err) {
      console.error('[overdue-cancel] erro:', err);
      showToast('Erro ao cancelar', 'error');
    }
  };
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
    let resolved = false;
    const finishClose = trapModalBack(() => {
      modal.remove();
      if (!resolved) { resolved = true; resolve(null); }
    });
    const close = (v) => {
      if (resolved) return;
      resolved = true;
      resolve(v);
      finishClose();
    };
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
  const isCommitment = t.kind === 'commitment';
  // Compromissos usam check ✓ (vazio → verde); tarefas usam thumb 👎/👍
  // Conteudo do check: 🚫 se cancelado, ✓/vazio pra compromisso, 👍/👎 pra tarefa
  let checkContent;
  if (t.cancelled) checkContent = '🚫';
  else if (isCommitment) checkContent = t.done ? '✓' : '';
  else checkContent = t.done ? '👍' : '👎';

  const rescheduleBadge = (t.rescheduleCount > 0)
    ? `<span class="task-reschedule-badge" title="Reagendado ${t.rescheduleCount}x">↻${t.rescheduleCount}</span>`
    : '';

  return `
    <div class="task ${t.done ? 'done' : ''} ${t.cancelled ? 'cancelled' : ''} ${t.reminderEnabled ? 'has-reminder' : ''} ${isCommitment ? 'is-commitment' : ''}" data-task-id="${t.id}" data-day="${dayDocId}">
      <button class="task-menu-btn-corner" data-action="menu" title="Editar / Duplicar / Excluir">⋮</button>
      <button class="task-thumb ${t.done ? 'done' : ''} ${t.cancelled ? 'is-cancelled' : ''} ${isCommitment ? 'task-check' : ''}" data-action="check" title="${t.cancelled ? 'Cancelada' : (t.done ? 'Feito!' : 'Marcar como feito')}">${checkContent}</button>
      <div class="task-body">
        <div class="task-title">
          <span class="task-icon-inline">${taskIcon}</span>${t.startTime ? `<span class="task-time">${escape(t.startTime)}</span>` : ''}${escape(t.title)}${rescheduleBadge}
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

  // Detecta se a tarefa está cancelada (menu reduzido: só Restaurar + Excluir)
  const day = weekData.find(d => d.id === taskEl.dataset.day);
  const t = day?.tasks.find(x => x.id === taskEl.dataset.taskId);
  const isCancelled = !!t?.cancelled;

  const menu = document.createElement('div');
  menu.className = 'task-menu-pop';
  menu.innerHTML = isCancelled ? `
    <button class="task-menu-item" data-menu-action="restore">↩️ Restaurar</button>
    <button class="task-menu-item danger" data-menu-action="del">🗑️ Excluir</button>
  ` : `
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

  const close = trapModalBack(() => modal.remove());
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
    close();
    // Delay pra deixar o trapModalBack do calendário finalizar history.back()
    // ANTES de abrir o openActivityPicker (evita o pai fechar o filho)
    await new Promise(r => setTimeout(r, 120));
    const [y, m, d] = id.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    const targetWeekStart = getWeekStart(picked);
    if (targetWeekStart.getTime() !== weekStart.getTime()) {
      weekStart = targetWeekStart;
      expanded.clear(); expanded.add(id);
      await loadWeek();
      renderUI(app);
    } else {
      expanded.add(id);
    }
    const defaultShiftId = shifts[0]?.id || null;
    if (!defaultShiftId) {
      showToast('Configure pelo menos um turno na Home antes de criar atividades', 'info');
      return;
    }
    openActivityPicker(app, id, defaultShiftId);
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
      // Cancelada: clicar no 🚫 é no-op (sem som). Pra restaurar, usa o menu ⋮ → Restaurar
      if (t.cancelled) return;
      const wasDone = t.done;
      t.done = !t.done;
      const isCommitment = t.kind === 'commitment';
      syncTaskInDom(t); // sincroniza day card + aba Compromissos (e qualquer outra instancia)
      await updateDayTask(taskEl.dataset.day, taskEl.dataset.taskId, { done: t.done });
      updateDayCardStats(taskEl.dataset.day, false); // sem sync de template — done não vira modelo
      // Som + toast motivacional (só ao marcar feito); ao desmarcar, plop
      if (!wasDone && t.done) {
        playDone();
        const msg = isCommitment ? randomCommitmentDoneMessage() : randomDoneMessage();
        showLocalToast(taskEl,
          `<span class="done-check-big">✓</span><span class="done-check-text">${msg}</span>`,
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

    // Trazer dados do dia anterior (substitui o atual)
    const pullBtn = e.target.closest('[data-action="pull-prev-day"]');
    if (pullBtn) {
      pullPrevDay(app, pullBtn.dataset.day);
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

    // Restaurar tarefa cancelada (some o 🚫 + abre edição)
    const restoreBtn = e.target.closest('[data-action="restore"]');
    if (restoreBtn) {
      const taskEl = restoreBtn.closest('[data-task-id]');
      const day = weekData.find(d => d.id === taskEl.dataset.day);
      const t = day?.tasks.find(x => x.id === taskEl.dataset.taskId);
      if (!t) return;
      try {
        t.cancelled = false;
        await updateDayTask(taskEl.dataset.day, taskEl.dataset.taskId, { cancelled: false });
        syncTaskInDom(t);
        updateDayCardStats(taskEl.dataset.day, false);
        showToast('Atividade restaurada', 'success');
        // Abre o editor pra usuário ajustar o que precisar
        openTaskEditor(app, taskEl.dataset.day, taskEl.dataset.taskId);
      } catch (err) {
        console.error('[restore] erro:', err);
        showToast('Erro ao restaurar', 'error');
      }
      return;
    }

    // (Banners "Trazer dia anterior" / "Dispensar" removidos — substituidos pelo icone ↓ entre as pilulas)

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
      // PRESERVA kind (task vs commitment) + reminderEnabled — antes virava tarefa normal
      const newTask = {
        activityId: t.activityId || null,
        title: t.title, desc: t.desc || '', startTime: t.startTime || '',
        shiftId: t.shiftId, categoryId: t.categoryId || null,
        icon: t.icon || '',
        kind: t.kind || 'task',
        reminderEnabled: t.reminderEnabled || false,
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

      // Detecta se essa tarefa se repete em outros dias DA SEMANA (mesmo título + categoria)
      const recurringDays = weekData.filter(d =>
        d.id !== dayDocId && d.tasks.some(x => sameTaskIdentity(x, t))
      );
      // Também detecta se a tarefa está em algum weekdayTemplate (recorrência futura)
      const tpls = profile?.weekdayTemplates || {};
      const recurringInTemplates = Object.keys(tpls).filter(dow => {
        const arr = tpls[dow];
        if (!Array.isArray(arr)) return false;
        return arr.some(x => sameTaskIdentity(x, t));
      });
      const isRecurring = recurringDays.length > 0 || recurringInTemplates.length > 0;

      let scope = 'one'; // 'one' | 'all'
      if (isRecurring) {
        // Mostra o total de ocorrências (na semana atual + templates futuros)
        const totalOther = recurringDays.length + (recurringInTemplates.length > 0 ? 1 : 0);
        scope = await askDeleteScope(t.title, totalOther, recurringInTemplates.length > 0);
        if (!scope) return; // cancelado
      } else {
        // Não-recorrente: confirma SEM oferecer a opção de excluir recorrências
        const ok = await confirmModal({
          title: 'Excluir?',
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

        // ESCOPO 'one' em recorrente: marca o dia pra não regenerar essa recorrência
        // (Senão, o autoGen do template traz a tarefa de volta a cada load.)
        if (scope === 'one' && isRecurring) {
          const groupId = t.recurrenceGroupId;
          const titleKey = (t.title || '').trim().toLowerCase();
          if (groupId || titleKey) {
            const excludedGroups = Array.isArray(day.meta.excludedRecurrenceGroups) ? day.meta.excludedRecurrenceGroups.slice() : [];
            const excludedTitles = Array.isArray(day.meta.excludedRecurrenceTitles) ? day.meta.excludedRecurrenceTitles.slice() : [];
            let changed = false;
            if (groupId && !excludedGroups.includes(groupId)) {
              excludedGroups.push(groupId);
              changed = true;
            }
            // Legado sem groupId: usa titulo+categoria como chave
            if (!groupId && titleKey) {
              const catKey = `${titleKey}::${t.categoryId || ''}`;
              if (!excludedTitles.includes(catKey)) {
                excludedTitles.push(catKey);
                changed = true;
              }
            }
            if (changed) {
              day.meta.excludedRecurrenceGroups = excludedGroups;
              day.meta.excludedRecurrenceTitles = excludedTitles;
              try { await setDayMeta(dayDocId, { excludedRecurrenceGroups: excludedGroups, excludedRecurrenceTitles: excludedTitles }); }
              catch (err) { console.warn('[del-one] excl save:', err); }
            }
          }
        }

        if (scope === 'all') {
          // 1) Apaga das ocorrências A PARTIR de hoje na semana atual
          //    (não mexe em dias passados — eles são histórico)
          const futureDaysCurrentWeek = recurringDays.filter(d => d.id >= dayDocId);
          for (const otherDay of futureDaysCurrentWeek) {
            const matches = otherDay.tasks.filter(x => sameTaskIdentity(x, t));
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

          // Match LAX pra cleanup: bate por groupId OU por título+categoria
          // (cobre dados legados sem groupId que stricty sameTaskIdentity rejeitaria)
          const tTitleKey = (t.title || '').trim().toLowerCase();
          const tCatKey = t.categoryId || '';
          const tGroupId = t.recurrenceGroupId || '';
          const matchesT = (x) => {
            // groupId match (estrito quando ambos têm)
            if (tGroupId && x.recurrenceGroupId === tGroupId) return true;
            // Fallback título+categoria (legado)
            const xTitle = (x.title || '').trim().toLowerCase();
            const xCat = x.categoryId || '';
            return xTitle && xTitle === tTitleKey && xCat === tCatKey;
          };

          // 2a) Limpa dos templates de TODOS os dias-da-semana (semanal/diário)
          try {
            const tplsCur = profile?.weekdayTemplates || {};
            for (const dow of Object.keys(tplsCur)) {
              const arr = tplsCur[dow];
              if (!Array.isArray(arr)) continue;
              const filtered = arr.filter(x => !matchesT(x));
              if (filtered.length !== arr.length) {
                await setWeekdayTemplate(parseInt(dow, 10), filtered);
                profile.weekdayTemplates[dow] = filtered;
              }
            }
            // 2b) Limpa dos compromissos mensais (profile.monthlyCommitments)
            //     Esse era o gap pro temperos voltar — auto-gen mensal renascia ele
            const monthlyCur = Array.isArray(profile?.monthlyCommitments) ? profile.monthlyCommitments : [];
            const monthlyFiltered = monthlyCur.filter(x => !matchesT(x));
            if (monthlyFiltered.length !== monthlyCur.length) {
              await setProfile({ monthlyCommitments: monthlyFiltered });
              profile.monthlyCommitments = monthlyFiltered;
              console.log('[del-all] limpou', monthlyCur.length - monthlyFiltered.length, 'entradas monthly');
            }
          } catch (err) {
            console.warn('[del-recurring] template cleanup:', err);
          }

          // 3) Apaga de TODOS os dias futuros que JÁ foram gravados no Firestore
          //    (semanas que o usuário ja navegou pra frente e geraram dias com a tarefa)
          //    Janela: do dia seguinte ao fim da semana atual até 1 ano à frente
          let futureFirestoreCount = 0;
          try {
            const endOfCurrentWeek = new Date(weekStart);
            endOfCurrentWeek.setDate(weekStart.getDate() + 6);
            const startScan = new Date(endOfCurrentWeek);
            startScan.setDate(endOfCurrentWeek.getDate() + 1);
            const endScan = new Date(endOfCurrentWeek);
            endScan.setDate(endOfCurrentWeek.getDate() + 365);
            const futureDays = await fetchDaysRange(startScan, endScan);
            // Match LAX aqui também (mesma lógica do passo 2)
            await Promise.all(futureDays.map(async (fd) => {
              const matches = (fd.tasks || []).filter(x => matchesT(x));
              for (const m of matches) {
                try { await deleteDayTask(fd.id, m.id); futureFirestoreCount++; } catch {}
              }
            }));
          } catch (err) {
            console.warn('[del-recurring] future days cleanup:', err);
          }

          const totalRemoved = futureDaysCurrentWeek.length + 1; // +1 = o dia atual onde apagou
          const pastKept = recurringDays.length - futureDaysCurrentWeek.length;
          const pastNote = pastKept > 0 ? ` (${pastKept} dia${pastKept === 1 ? '' : 's'} anterior${pastKept === 1 ? '' : 'es'} mantido${pastKept === 1 ? '' : 's'})` : '';
          const futNote = futureFirestoreCount > 0 ? ` + ${futureFirestoreCount} de semanas futuras` : '';
          showToast(`Removido de ${totalRemoved} dia${totalRemoved === 1 ? '' : 's'}${futNote}${pastNote}`, 'success');
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
    const field = trigger.dataset.meta;
    // Se vazio, usa o default do perfil (acordar/dormir) pra abrir o picker
    const fallback = field === 'wakeTime'
      ? (profile?.defaultWakeTime || '')
      : (profile?.defaultSleepTime || '');
    const result = await openTimePicker(trigger.dataset.time || fallback);
    if (!result) return;
    trigger.dataset.time = result;
    trigger.textContent = result;
    trigger.classList.remove('is-placeholder');
    const dayDocId = trigger.dataset.day;
    const day = weekData.find(d => d.id === dayDocId);
    if (day) {
      day.meta[field] = result;
      try { await setDayMeta(dayDocId, { [field]: result }); }
      catch (err) { showToast('Erro ao salvar', 'error'); }
    }
  });

  // (Swipe entre semanas removido — só pelas setas ‹ ›)
}

// IMPORTANTE: syncTemplate default = FALSE. Templates só são tocados quando o
// usuário EXPLICITAMENTE escolhe recur='weekly' ou recur='daily' nos chips.
// Sem isso, cada modificação no dia virava "todas as semanas se repetem", o que não é desejado.
function updateDayCardStats(dayDocId, syncTemplate = false) {
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

  // Atualiza o ponto vermelho no header do dia (lembrete pendente)
  const hasPending = day.tasks.some(t => t.reminderEnabled && !t.done && !t.cancelled);
  card.classList.toggle('has-pending-reminder', hasPending);
  const dowEl = card.querySelector('.day-card-name .dow');
  if (dowEl) {
    const existingDot = dowEl.querySelector('.day-reminder-dot');
    if (hasPending && !existingDot) {
      dowEl.insertAdjacentHTML('beforeend', '<span class="day-reminder-dot" title="Tem tarefa com lembrete"></span>');
    } else if (!hasPending && existingDot) {
      existingDot.remove();
    }
  }

  // Re-anexa Sortable nas task-lists recém-renderizadas
  initTaskSortables();
  if (syncTemplate) syncTemplateForDay(dayDocId);
  refreshCommitmentsCard();
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
    cancelText: 'Ajustar',
    chainedFlow: true  // seguido de promptHydrationFor
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
    // replaceState em vez de back(): evita que o popstate quebre o próximo modal da cadeia
    if (!cameFromPop) try { history.replaceState(null, ''); } catch {}
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
      <div class="modal-title">Adicionar</div>
      <div class="modal-hint">No turno <strong>${escape(shift?.name || '')}</strong> de ${escape(WEEKDAYS_FULL[day.date.getDay()])} ${escape(String(day.date.getDate()).padStart(2,'0'))} ${escape(MONTHS[day.date.getMonth()])}.</div>

      <div class="input-field-label">Tipo</div>
      <div class="kind-chips" id="kind-chips">
        <button type="button" class="kind-chip active" data-kind="task">📋 Tarefa</button>
        <button type="button" class="kind-chip" data-kind="commitment">📅 Compromisso</button>
      </div>

      <label class="input-field"><div class="input-field-label">Atividade</div>
        <select id="m-cat">
          <option value="">— sem atividade —</option>
          ${catOpts}
        </select></label>

      <label class="input-field"><div class="input-field-label">O que fazer</div>
        <input id="m-title" placeholder="Ex: Tomar chá de gengibre, treino de pernas, ler 30min..." /></label>

      <div class="input-field-label">Horário <small style="color:var(--muted);font-weight:500" id="m-time-hint">(opcional)</small></div>
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

      <div class="input-field-label" style="margin-top:8px">Repetição</div>
      <button type="button" class="recur-btn" id="m-recur-btn" data-recur="today">
        <span class="recur-btn-ic">🔁</span>
        <span class="recur-btn-text">Repetir atividade</span>
        <span class="recur-btn-label">Somente hoje</span>
        <span class="recur-btn-edit">›</span>
      </button>

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
  // Não auto-foca o título quando o tour está rodando (evita abrir teclado mobile)
  if (!tourIsActive()) {
    setTimeout(() => modal.querySelector('#m-title').focus(), 50);
  }

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

  const close = trapModalBack(() => modal.remove());
  modal.querySelector('#m-cancel').onclick = close;
  // Clique fora NÃO fecha — só Cancelar ou back do celular (evita perder dados sem querer)

  // Estado de recorrência (escolhido via sub-modal)
  let recurState = { recur: 'today' };
  const recurBtn = modal.querySelector('#m-recur-btn');
  const recurLabel = recurBtn.querySelector('.recur-btn-label');
  const refreshRecurLabel = () => {
    if (recurState.recur === 'today') recurLabel.textContent = 'Somente hoje';
    else if (recurState.recur === 'weekly') recurLabel.textContent = recurWeeklyLabel(day.date.getDay());
    else if (recurState.recur === 'daily') recurLabel.textContent = 'Todos os dias';
    else if (recurState.recur === 'monthly') {
      const dom = recurState.daysOfMonth?.length ? recurState.daysOfMonth : [day.date.getDate()];
      recurLabel.textContent = dom.length === 1 ? `Todo dia ${dom[0]}` : `Dias ${dom.join(', ')}`;
    }
  };
  recurBtn.addEventListener('click', async () => {
    const isCommit = modal.querySelector('.kind-chip.active')?.dataset.kind === 'commitment';
    const result = await openRecurrenceChooser({
      currentDate: day.date,
      currentRecur: recurState.recur,
      currentDaysOfMonth: recurState.daysOfMonth,
      isCommitment: isCommit
    });
    if (!result) return;
    recurState = result;
    refreshRecurLabel();
  });

  // Wire dos chips de TIPO (Tarefa / Compromisso)
  modal.querySelectorAll('.kind-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      modal.querySelectorAll('.kind-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const isCommitment = chip.dataset.kind === 'commitment';
      modal.querySelector('#m-time-hint').textContent = isCommitment ? '(obrigatório pra compromissos)' : '(opcional)';
      // Se sair do compromisso e estava monthly, volta pra today
      if (!isCommitment && recurState.recur === 'monthly') {
        recurState = { recur: 'today' };
        refreshRecurLabel();
      }
    });
  });

  modal.querySelector('#m-save').onclick = async () => {
    const categoryId = modal.querySelector('#m-cat').value || null;
    const cat = categoryId ? categories.find(c => c.id === categoryId) : null;
    const kind = modal.querySelector('.kind-chip.active')?.dataset.kind || 'task';
    let title = modal.querySelector('#m-title').value.trim();
    if (!title) {
      if (cat) title = cat.name;
      else { showToast('Digite um título ou escolha uma atividade', 'info'); return; }
    }
    const startTime = modal.querySelector('#m-time-trigger')?.dataset.time || '';
    // Compromisso exige horário (sem isso não dá pra ordenar nem agendar)
    if (kind === 'commitment' && !startTime) {
      showToast('Compromisso precisa de horário', 'info');
      return;
    }
    const reminderEnabled = modal.querySelector('#m-reminder').checked;
    const recur = recurState.recur || 'today'; // ← estava faltando, quebrava o save inteiro
    const monthlyDays = recurState.daysOfMonth || (recur === 'monthly' ? [day.date.getDate()] : []);

    // Se vai repetir (weekly/daily/monthly), gera ID de grupo. 'today' não precisa.
    const recurrenceGroupId = (recur === 'daily' || recur === 'weekly' || recur === 'monthly') ? genRecurId() : null;

    const baseTask = {
      activityId: null, title, desc: '',
      kind,
      startTime, shiftId, categoryId,
      done: false, reminderEnabled,
      recurrenceType: recur, // FONTE DA VERDADE pra detecção (não inferir do template depois)
      ...(recurrenceGroupId ? { recurrenceGroupId } : {})
    };

    try {
      // Sempre adiciona no dia atual
      const order = day.tasks.filter(t => t.shiftId === shiftId).length;
      const tid = await addDayTask(dayDocId, { ...baseTask, order });
      day.tasks.push({ id: tid, ...baseTask, order });
      await propagateReminderToCategory(categoryId, reminderEnabled);

      // RECORRÊNCIA
      if (recur === 'daily') {
        // Adiciona nos outros dias da semana atual A PARTIR do dia atual (forward-only).
        // Dias passados são histórico — não devem receber tarefa nova.
        // Próximas semanas vêm do template (filled abaixo) — todos os 7 DOWs.
        const otherDays = weekData.filter(d => d.id !== dayDocId && d.id > dayDocId);
        const results = await Promise.allSettled(otherDays.map(async (otherDay) => {
          // Anti-duplicata: só pula se já existe outra com mesmo groupId nesse dia
          const dup = otherDay.tasks.find(x => x.recurrenceGroupId === recurrenceGroupId);
          if (dup) return { day: otherDay.id, status: 'skip' };
          const oid = await addDayTask(otherDay.id, { ...baseTask, order });
          otherDay.tasks.push({ id: oid, ...baseTask, order });
          return { day: otherDay.id, status: 'ok' };
        }));
        const okCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'ok').length;
        const skipCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'skip').length;
        const failCount = results.filter(r => r.status === 'rejected').length;
        if (failCount > 0) console.error('[recur-daily] falhas:', results.filter(r => r.status === 'rejected'));
        console.log(`[recur-daily] ok=${okCount} skip=${skipCount} fail=${failCount}`);

        // Salva no template de TODOS os 7 dias-da-semana (pra próximas semanas)
        const templateTask = {
          activityId: null, title, desc: '',
          kind,
          startTime, shiftId: shiftId || null, categoryId: categoryId || null,
          icon: '', reminderEnabled, order,
          recurrenceGroupId,
          recurrenceType: 'daily'
        };
        await Promise.all(Array.from({length: 7}, (_, dow) => (async () => {
          const existing = (await getWeekdayTemplate(dow)) || [];
          if (existing.some(x => x.recurrenceGroupId === recurrenceGroupId)) return;
          existing.push(templateTask);
          await setWeekdayTemplate(dow, existing);
          // Atualiza local pra detecção subsequente (edit/delete) funcionar IMEDIATAMENTE
          if (!profile.weekdayTemplates) profile.weekdayTemplates = {};
          profile.weekdayTemplates[String(dow)] = existing;
        })()));
      } else if (recur === 'today') {
        // Somente hoje — sem sync de template
        close();
        const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
        if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
        updateDayCardStats(dayDocId, false);
        return;
      } else if (recur === 'monthly') {
        // Mensal: cria 1 entrada em profile.monthlyCommitments por dia escolhido
        // (todos compartilhando o mesmo recurrenceGroupId pra edicao/exclusao em conjunto)
        const days = monthlyDays.length > 0 ? monthlyDays : [day.date.getDate()];
        console.log('[recur-monthly] save', { kind, recur, days, groupId: recurrenceGroupId });
        const list = Array.isArray(profile?.monthlyCommitments) ? profile.monthlyCommitments : [];
        let added = 0;
        for (const dom of days) {
          const exists = list.some(x =>
            x.recurrenceGroupId === recurrenceGroupId && x.dayOfMonth === dom
          );
          if (exists) continue;
          list.push({
            activityId: null, title, desc: '',
            kind, // respeita escolha do user (task ou commitment)
            startTime, shiftId: shiftId || null, categoryId: categoryId || null,
            icon: '', reminderEnabled,
            dayOfMonth: dom,
            recurrenceGroupId
          });
          added++;
        }
        if (added > 0) {
          await setProfile({ monthlyCommitments: list });
          profile.monthlyCommitments = list;
          console.log('[recur-monthly] saved', added, 'entries, total:', list.length);
        } else {
          console.warn('[recur-monthly] no entries added! days=', days, 'list=', list);
        }
        close();
        const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
        if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
        updateDayCardStats(dayDocId, false);
        const label = days.length === 1 ? `todo dia ${days[0]}` : `dias ${days.join(', ')}`;
        const noun = kind === 'commitment' ? 'Compromisso' : 'Tarefa';
        showToast(`${noun} "${title}" repete ${label}`, 'success');
        return;
      }
      // recur === 'weekly' ou 'daily' — sincroniza template explicitamente
      close();
      const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
      if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId, true); // EXPLICITO: usuario escolheu recorrencia

      // Se 'daily', re-renderiza outros day cards também
      if (recur === 'daily') {
        let addedCount = 1; // o dia atual sempre conta
        weekData.forEach(other => {
          if (other.id === dayDocId) return;
          const otherEl = document.querySelector(`.day-card[data-day-id="${other.id}"]`);
          if (otherEl) otherEl.querySelector('.day-card-content').innerHTML = renderDayContent(other);
          updateDayCardStats(other.id, false);
          if (other.tasks.some(t => t.recurrenceGroupId === recurrenceGroupId)) addedCount++;
        });
        showToast(`Repete todos os dias daqui em diante (${addedCount} dia${addedCount === 1 ? '' : 's'} desta semana)`, 'success');
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

  // Detecta recorrência atual pelo template do DOW (pra pre-selecionar o chip certo)
  // 'daily' = grupo aparece em TODOS os 7 DOWs
  // 'weekly' = grupo aparece SÓ no DOW desse dia
  // 'today' = sem grupo OU grupo não aparece em nenhum template
  // PRIMEIRO: lê t.recurrenceType direto (fonte da verdade, gravado na task)
  // Se não tiver (legado), cai no fallback de inferir pelo template
  let currentRecur = 'today';
  const matchesT = (x) => {
    if (t.recurrenceGroupId && x.recurrenceGroupId === t.recurrenceGroupId) return true;
    const titleKey = (t.title || '').trim().toLowerCase();
    const xTitle = (x.title || '').trim().toLowerCase();
    if (!titleKey || titleKey !== xTitle) return false;
    return (x.categoryId || '') === (t.categoryId || '');
  };

  if (t.recurrenceType && ['today','weekly','daily','monthly'].includes(t.recurrenceType)) {
    currentRecur = t.recurrenceType;
  } else {
    // FALLBACK (legado): infere pelo template
    const tpls = profile?.weekdayTemplates || {};
    const dowsWithMatch = [];
    for (let dow = 0; dow < 7; dow++) {
      const arr = tpls[String(dow)];
      if (Array.isArray(arr) && arr.some(matchesT)) dowsWithMatch.push(dow);
    }
    if (dowsWithMatch.length >= 5) currentRecur = 'daily'; // 5+ DOWs = daily (mais leniente)
    else if (dowsWithMatch.length >= 1) currentRecur = 'weekly';
    if (Array.isArray(profile?.monthlyCommitments) &&
        profile.monthlyCommitments.some(matchesT)) {
      currentRecur = 'monthly';
    }
  }
  const isActive = (mode) => currentRecur === mode ? 'active' : '';
  const kind = t.kind || 'task';
  const isCommitment = kind === 'commitment';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">Editar ${isCommitment ? 'compromisso' : 'tarefa'}</div>
      <div class="modal-hint">A edição vale só pra este dia. A atividade original na Home não muda.</div>

      <div class="input-field-label">Tipo</div>
      <div class="kind-chips" id="kind-chips">
        <button type="button" class="kind-chip ${kind === 'task' ? 'active' : ''}" data-kind="task">📋 Tarefa</button>
        <button type="button" class="kind-chip ${isCommitment ? 'active' : ''}" data-kind="commitment">📅 Compromisso</button>
      </div>

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

      <div class="input-field-label" style="margin-top:8px">Repetição</div>
      <button type="button" class="recur-btn" id="m-recur-btn">
        <span class="recur-btn-ic">🔁</span>
        <span class="recur-btn-text">Repetir atividade</span>
        <span class="recur-btn-label" id="m-recur-label">—</span>
        <span class="recur-btn-edit">›</span>
      </button>

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = trapModalBack(() => modal.remove());
  modal.querySelector('#m-cancel').onclick = close;
  // Clique fora NÃO fecha — só Cancelar ou back do celular (evita perder edições)

  // Estado de recorrência iniciado com o atual da tarefa
  let recurState = { recur: currentRecur };
  if (currentRecur === 'monthly' && Array.isArray(profile?.monthlyCommitments)) {
    const entries = profile.monthlyCommitments.filter(matchesT);
    if (entries.length > 0) recurState.daysOfMonth = entries.map(x => x.dayOfMonth).filter(Number.isInteger).sort((a,b)=>a-b);
  }
  const recurLabelEl = modal.querySelector('#m-recur-label');
  const refreshRecurLabel = () => {
    if (recurState.recur === 'today') recurLabelEl.textContent = 'Somente este dia';
    else if (recurState.recur === 'weekly') recurLabelEl.textContent = recurWeeklyLabel(day.date.getDay());
    else if (recurState.recur === 'daily') recurLabelEl.textContent = 'Todos os dias';
    else if (recurState.recur === 'monthly') {
      const dom = recurState.daysOfMonth?.length ? recurState.daysOfMonth : [day.date.getDate()];
      recurLabelEl.textContent = dom.length === 1 ? `Todo dia ${dom[0]}` : `Dias ${dom.join(', ')}`;
    }
  };
  refreshRecurLabel();
  modal.querySelector('#m-recur-btn').addEventListener('click', async () => {
    const isCommit = modal.querySelector('.kind-chip.active')?.dataset.kind === 'commitment';
    const result = await openRecurrenceChooser({
      currentDate: day.date,
      currentRecur: recurState.recur,
      currentDaysOfMonth: recurState.daysOfMonth,
      isCommitment: isCommit
    });
    if (!result) return;
    recurState = result;
    refreshRecurLabel();
  });

  // Wire chips de TIPO (Tarefa / Compromisso)
  modal.querySelectorAll('.kind-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      modal.querySelectorAll('.kind-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const newKindIsCommitment = chip.dataset.kind === 'commitment';
      if (!newKindIsCommitment && recurState.recur === 'monthly') {
        recurState = { recur: 'today' };
        refreshRecurLabel();
      }
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
    const newKind = modal.querySelector('.kind-chip.active')?.dataset.kind || 'task';
    let newShiftId = modal.querySelector('#m-shift').value || null;

    // Compromisso exige horário
    if (newKind === 'commitment' && !newTime) {
      showToast('Compromisso precisa de horário', 'info');
      return;
    }

    // Auto-ajuste: se o horário caiu em outro turno, move pra ele
    // (Manhã 5-12, Tarde 12-19, Noite 19-5)
    if (newTime) {
      const autoName = shiftNameFromTime(newTime);
      if (autoName) {
        const matchShift = shifts.find(s => (s.name || '').toLowerCase() === autoName.toLowerCase());
        if (matchShift) newShiftId = matchShift.id;
      }
    }

    const recur = recurState.recur || 'today';
    const data = {
      title: modal.querySelector('#m-title').value.trim() || 'Sem título',
      desc: modal.querySelector('#m-desc').value.trim(),
      kind: newKind,
      shiftId: newShiftId,
      startTime: newTime,
      icon: modal.querySelector('#m-icon-picker .task-icon-opt.sel')?.dataset.icon || '',
      reminderEnabled: modal.querySelector('#m-reminder').checked,
      recurrenceType: recur // PERSIST tipo de recorrencia direto na task (fonte da verdade)
    };
    const monthlyDays = recurState.daysOfMonth || (recur === 'monthly' ? [day.date.getDate()] : []);

    Object.assign(t, data);
    await updateDayTask(dayDocId, taskId, data);
    await propagateReminderToCategory(t.categoryId, t.reminderEnabled);

    // RECORRÊNCIA: replica a edição nos outros 6 dias da semana
    // Identificação por recurrenceGroupId (essa instancia especifica)
    // Se a tarefa nao tem grupo ainda, gera um agora — vira fonte da recorrencia
    if (recur === 'daily') {
      const groupId = t.recurrenceGroupId || genRecurId();
      if (!t.recurrenceGroupId) {
        t.recurrenceGroupId = groupId;
        await updateDayTask(dayDocId, t.id, { recurrenceGroupId: groupId });
      }
      // Order da fonte = posição que as cópias devem ter no respectivo turno
      const sourceOrder = t.order ?? 0;

      const otherDays = weekData.filter(d => d.id !== dayDocId);
      const results = await Promise.allSettled(otherDays.map(async (otherDay) => {
        const existing = otherDay.tasks.find(x => x.recurrenceGroupId === groupId);
        const baseTask = {
          activityId: t.activityId || null,
          title: data.title, desc: data.desc,
          startTime: data.startTime,
          shiftId: data.shiftId,
          categoryId: t.categoryId || null,
          icon: data.icon || '',
          reminderEnabled: data.reminderEnabled,
          done: existing?.done || false,
          recurrenceGroupId: groupId,
          recurrenceType: 'daily', // estamos no branch daily do edit
          order: sourceOrder
        };
        if (existing) {
          await updateDayTask(otherDay.id, existing.id, baseTask);
          Object.assign(existing, baseTask);
          return { day: otherDay.id, status: 'update' };
        } else {
          // Só cria nova instância em dias FUTUROS (≥ hoje); passados são historico
          if (otherDay.id < dayDocId) return { day: otherDay.id, status: 'skip-past' };
          const newId = await addDayTask(otherDay.id, baseTask);
          otherDay.tasks.push({ id: newId, ...baseTask });
          return { day: otherDay.id, status: 'add' };
        }
      }));
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) console.error('[edit-recur-daily] falhas:', results.filter(r => r.status === 'rejected'));
      console.log(`[edit-recur-daily] ok=${okCount} fail=${failCount}`);
    }
    // Sync template do DOW pra 'weekly' (e 'daily', que sobrescreve abaixo)
    // 'today' e 'monthly' não sincronizam template do DOW
    if (recur === 'weekly' || recur === 'daily') {
      // syncTemplateForDay vai rodar via updateDayCardStats(true)
    }

    // RECORRÊNCIA MENSAL: substitui as entradas do grupo
    // por uma nova lista (1 entrada por dia escolhido), todas com o mesmo groupId
    if (recur === 'monthly') {
      const groupId = t.recurrenceGroupId || genRecurId();
      if (!t.recurrenceGroupId) {
        t.recurrenceGroupId = groupId;
        await updateDayTask(dayDocId, t.id, { recurrenceGroupId: groupId });
      }
      const days = monthlyDays.length > 0 ? monthlyDays : [day.date.getDate()];
      console.log('[edit-monthly] save', { kind: newKind, days, groupId });
      const baseList = Array.isArray(profile?.monthlyCommitments) ? profile.monthlyCommitments : [];
      const filtered = baseList.filter(x => x.recurrenceGroupId !== groupId);
      for (const dom of days) {
        filtered.push({
          activityId: t.activityId || null,
          title: data.title, desc: data.desc,
          kind: newKind, // respeita escolha do user
          startTime: data.startTime,
          shiftId: data.shiftId,
          categoryId: t.categoryId || null,
          icon: data.icon || '',
          reminderEnabled: data.reminderEnabled,
          dayOfMonth: dom,
          recurrenceGroupId: groupId
        });
      }
      await setProfile({ monthlyCommitments: filtered });
      profile.monthlyCommitments = filtered;
    }

    close();
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
      showToast('Repete todos os dias', 'success');
    } else if (recur === 'weekly') {
      showToast(`Repete ${recurWeeklyLabel(day.date.getDay()).toLowerCase()}`, 'success');
    } else if (recur === 'monthly') {
      const days = monthlyDays.length > 0 ? monthlyDays : [day.date.getDate()];
      const label = days.length === 1 ? `todo dia ${days[0]}` : `dias ${days.join(', ')}`;
      showToast(`Repete ${label}`, 'success');
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
