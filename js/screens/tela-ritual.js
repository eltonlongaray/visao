// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — CONSTANTES (labels de data + frases motivacionais)
// BLOCO 3 — ESTADO DO MÓDULO
// BLOCO 4 — HELPERS DE DATA
// BLOCO 5 — LABELS DA SEMANA / MÊS
// BLOCO 6 — DATA LOADING (Firestore)
// BLOCO 6.5 — AUTO-GERAÇÃO DE TAREFAS (modelo simplificado)
// BLOCO 7 — ENTRY POINT — render principal da tela Ritual
// BLOCO 8 — RENDER DA UI (HTML estático)
// BLOCO 8.5 — DRAG-DROP DE TAREFAS (SortableJS)
// BLOCO 6.7 — LEMBRETES VENCIDOS — Checker + Modal de ação
// BLOCO 8.9 — AUTO-AGENDAMENTO DE NOTIFICAÇÃO
// BLOCO 9 — HANDLERS DE EVENTOS (clicks, inputs, swipe)
// BLOCO 10 — MODAIS — picker de atividade e editor de tarefa
// BLOCO 9.4 — LIMPAR DADOS DO DIA — zera tudo (tarefas + relógio + hidratação + nota)
// BLOCO 9.5 — FECHAMENTO DE DIA — Helpers de "dia completo"
// BLOCO 11 — CELEBRAÇÃO — balões e confete ao completar todas as tarefas
// BLOCO 12 — GOOGLE AGENDA — link pré-preenchido sem OAuth
// BLOCO 13 — HELPERS UTILITÁRIOS (escape, conversões)
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getShifts, getCategories, getActivities,
  getDay, setDayMeta, getDayTasks, addDayTask, updateDayTask, deleteDayTask, dayId,
  getProfile, setProfile, parseTime,
  getWeekdayTemplate, setWeekdayTemplate,
  saveCategory, fetchDaysRange
} from '../banco-dados.js';
import { bottomNav } from '../components/menu-inferior.js';
import { forceRender } from '../roteador.js';
import { metaAgua } from '../corpo.js';
import { ruleFiresOn, nextOccurrence } from '../recorrencia.js';
import { showToast, showLocalToast, confirmModal } from '../aviso-tela.js';
import { playDone, playUndone, playDelete } from '../sons.js';
import { openTimePicker } from '../seletor-horario.js';
import { trapModalBack } from '../modal-voltar.js';
import { isActive as tourIsActive } from '../tour-guiado.js';
import { scheduleNotif, notifTag } from '../notificacoes.js';
import { t as tr, getLang } from '../idioma.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONSTANTES (labels de data + frases motivacionais)
// ═══════════════════════════════════════════════════════════════
// Helpers de data usando Intl — funciona em qualquer idioma automaticamente
const _cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function _wdFull(d)  { return _cap(new Intl.DateTimeFormat(getLang(), { weekday: 'long'  }).format(d)); }
function _wdShort(d) { return _cap(new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(d).replace(/\./g, '')); }
function _moShort(d) { return _cap(new Intl.DateTimeFormat(getLang(), { month:   'short' }).format(d).replace(/\./g, '')); }

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
  const labelDia = _wdFull(dt);
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
  if (!ml) return tr('home.hydration.hint');
  if (!goal || goal <= 0) goal = 2000;
  const pct = (ml / goal) * 100;
  if (pct >= 200) return `${Math.round(pct)}% — exagerou um pouco hein 😅`;
  if (pct >= 120) return `${Math.round(pct)}% — passou da meta, ótimo!`;
  if (pct >= 100) return `meta batida! 💪`;
  if (pct >= 75) return `${Math.round(pct)}% — quase lá`;
  if (pct >= 50) return `${Math.round(pct)}% — bom ritmo`;
  return `${Math.round(pct)}% — ainda tem que beber bastante`;
}

// Pinta o estado da água (valor, barra, bolinha, mensagem) — usado pelos botões
// ± e pela bolinha arrastável.
function _hydPintar(card, dayId, ml, goal) {
  const pct = Math.min(100, Math.round((ml / (goal || 2000)) * 100));
  const val = card.querySelector(`.hyd-ml[data-day="${dayId}"]`);
  const fill = card.querySelector(`.hydration-fill[data-day="${dayId}"]`);
  const dot = card.querySelector(`.hyd-dot[data-day="${dayId}"]`);
  const msg = card.querySelector(`.hydration-msg[data-day="${dayId}"]`);
  if (val) val.textContent = ml;
  if (fill) fill.style.width = pct + '%';
  if (dot) dot.style.left = pct + '%';
  if (msg) msg.textContent = hydrationMsg(ml, goal);
}

// Bolinha arrastável na barra de água: passo de 50 ml (os botões ± fazem 250).
// Delegado no document + pointer capture (a lista se redesenha). Só liga 1x.
let _hydDragOn = false;
function _wireHydDrag() {
  if (_hydDragOn) return; _hydDragOn = true;
  let arr = null;   // { card, bar, dayId, goal }
  const mover = (e) => {
    if (!arr) return;
    const r = arr.bar.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    let ml = Math.round((frac * arr.goal) / 50) * 50;        // snap 50 ml
    ml = Math.max(0, Math.min(arr.goal, ml));
    const day = weekData.find(d => d.id === arr.dayId);
    if (day) day.meta.hydrationMl = ml;
    _hydPintar(arr.card, arr.dayId, ml, arr.goal);
  };
  document.addEventListener('pointerdown', (e) => {
    const dot = e.target.closest('.hyd-dot');
    if (!dot) return;
    e.preventDefault();
    const card = dot.closest('.day-card');
    const bar = card?.querySelector('.hydration-bar');
    const dayId = dot.dataset.day;
    const day = weekData.find(d => d.id === dayId);
    if (!card || !bar || !day) return;
    arr = { card, bar, dayId, goal: day.meta.hydrationGoal || 2000 };
    try { dot.setPointerCapture(e.pointerId); } catch {}
    mover(e);
  });
  document.addEventListener('pointermove', mover);
  document.addEventListener('pointerup', () => {
    if (!arr) return;
    const dayId = arr.dayId;
    const day = weekData.find(d => d.id === dayId);
    arr = null;
    if (day) {
      const key = dayId + ':hydrationMl';
      clearTimeout(saveTimers[key]);
      saveTimers[key] = setTimeout(() => setDayMeta(dayId, { hydrationMl: day.meta.hydrationMl }), 400);
    }
  });
}
_wireHydDrag();


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
  return `${tr('ritual.week.label', { n: w })} · ${String(s.getDate()).padStart(2,'0')} ${_moShort(s)} → ${String(e.getDate()).padStart(2,'0')} ${_moShort(e)}`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6: DATA LOADING (Firestore)
// ═══════════════════════════════════════════════════════════════
// Meta de água = peso × 35 ml/kg (o peso vem do perfil, digitado na Home). Sem
// peso, cai no default de 2000 ml. Derivar do peso faz a meta acompanhar quando
// a pessoa muda o peso, sem precisar mexer dia a dia.
function _metaAguaDoPeso() {
  return metaAgua(profile?.pesoKg, profile?.alturaCm);   // 35 ml/kg, IMC-ajustada
}
function _normalizeMeta(meta) {
  const m = { wakeTime: '', sleepTime: '', hydrationMl: 0, hydrationGoal: 2000, notes: '', ...(meta || {}) };
  const metaPeso = _metaAguaDoPeso();
  if (metaPeso > 0) m.hydrationGoal = metaPeso;
  else if (!m.hydrationGoal || m.hydrationGoal <= 0) m.hydrationGoal = 2000;
  return m;
}

async function _fetchWeekDays(startDate) {
  const end = new Date(startDate);
  end.setDate(startDate.getDate() + 6);

  // 2 consultas pro intervalo inteiro (days + tasks), em vez de 14:
  // a versão antiga fazia getDay + getDayTasks para CADA um dos 7 dias.
  const linhas = await fetchDaysRange(startDate, end);
  const porId = new Map(linhas.map(r => [r.id, r]));

  // fetchDaysRange só devolve dias que existem no banco — os que faltam
  // precisam entrar vazios, senão a semana vem com buracos.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const id = dayId(d);
    const row = porId.get(id);
    // o id fica DENTRO do meta de propósito: era assim que getDay devolvia,
    // e manter a forma idêntica evita quebrar quem leia day.meta
    const { tasks = [], ...meta } = row || {};
    return { date: d, id, meta: _normalizeMeta(meta), tasks };
  });
}

async function loadWeek(promessaSemana) {
  weekData = await (promessaSemana || _fetchWeekDays(weekStart));
  // A busca da semana começa ANTES do perfil carregar, então a meta de água
  // caía no default (2000). Aqui o perfil já está pronto — recalcula pelo peso.
  const metaP = _metaAguaDoPeso();
  if (metaP > 0) weekData.forEach(d => { if (d.meta) d.meta.hydrationGoal = metaP; });
  await dedupTemplates();   // limpa a FONTE das repetições antes de gerar
  // Garante tarefas recorrentes na semana atual — essa precisa ficar aqui,
  // é o que o usuário vai ver agora.
  await autoGenerateMissingTasks(weekData);
  await dedupTasksNaSemana(weekData);   // limpa repetições já existentes nos dias

  // A próxima semana é geração PREVENTIVA: ninguém está olhando pra ela.
  // Segurava a pintura da tela por mais uma busca inteira + escritas.
  // Agora roda em segundo plano, depois que o Ritual já está no ar.
  setTimeout(async () => {
    try {
      const nextStart = new Date(weekStart);
      nextStart.setDate(weekStart.getDate() + 7);
      await autoGenerateMissingTasks(await _fetchWeekDays(nextStart));
      await ensurePinnedRecurrences();   // fixa a próxima ocorrência de eventos mensais+
    } catch (e) {
      console.warn('[Falcon] pré-geração da próxima semana falhou:', e);
    }
  }, 0);
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
async function autoGenerateMissingTasks(days = weekData) {
  const todayId = dayId(new Date());
  for (const day of days) {
    // Usa o id do dia (YYYY-MM-DD) para calcular DOW em hora local — evita bug de timezone
    // onde day.date (timestamp UTC meia-noite) retorna o dia anterior no Brasil (UTC-3)
    const [_iy, _im, _id] = day.id.split('-').map(Number);
    const dow = new Date(_iy, _im - 1, _id).getDay();
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
        // dedup por identidade visível: o template pode ter cópias (foi o que
        // gerou triplicatas de Almoço/Café/etc.).
        const vistos = new Set();
        const tplFiltered = template.filter(x => {
          if (isExcluded(x)) return false;
          const k = visKey(x); if (vistos.has(k)) return false; vistos.add(k); return true;
        });
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

    // ────── 4) Recorrências avançadas SOB DEMANDA (só weekly: toda semana /
    // quinzenal / N-em-N semanas). Monthly+ são pré-criadas com alfinete por
    // ensurePinnedRecurrences() — não passam por aqui. ──────
    const rules = profile?.recurrenceRules;
    if (Array.isArray(rules) && rules.length > 0 && day.id >= todayId) {
      const localDate = new Date(_iy, _im - 1, _id);
      const firing = rules
        .filter(r => r.freq === 'weekly' && ruleFiresOn(r, localDate))
        .map(_ruleToTmpl)
        .filter(tmpl => !isExcluded(tmpl));
      if (firing.length > 0) {
        const existing = new Set(day.tasks.map(t => keyOf(t)));
        const toAdd = firing.filter(tmpl => !existing.has(keyOf(tmpl)));
        if (toAdd.length > 0) await addTemplateTasksToDay(day, toAdd, day.tasks.length);
      }
    }
  }
}

// Converte uma regra de recorrência num objeto no formato de template de tarefa
// (recurrenceGroupId = groupId da regra, pra keyOf/isExcluded/dedup funcionarem).
function _ruleToTmpl(rule) {
  return {
    title: rule.title || 'Sem título',
    desc: rule.desc || '',
    kind: rule.kind || 'task',
    startTime: rule.startTime || '',
    categoryId: rule.categoryId || null,
    icon: rule.icon || '',
    reminderEnabled: !!rule.reminderEnabled,
    recurrenceGroupId: rule.groupId,
  };
}

// Pré-criação alfinetada: pra CADA regra monthly (incl. 1×/mês), garante que a
// próxima ocorrência >= hoje exista como tarefa real com lembrete (alfinete 📌 no
// calendário). Eventos raros/importantes ficam fixados sem depender de navegar.
// Cria só a ocorrência imminente; quando ela passa, o próximo load fixa a seguinte.
async function ensurePinnedRecurrences() {
  const rules = profile?.recurrenceRules;
  if (!Array.isArray(rules) || rules.length === 0) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const rule of rules) {
    if (rule.freq !== 'monthly') continue;
    const occ = nextOccurrence(rule, today);
    if (!occ) continue;
    const nid = dayId(occ);
    try {
      const [dia, tasks] = await Promise.all([getDay(nid), getDayTasks(nid)]);
      const exG = Array.isArray(dia?.meta?.excludedRecurrenceGroups) ? dia.meta.excludedRecurrenceGroups : [];
      if (exG.includes(rule.groupId)) continue;                       // usuário excluiu essa ocorrência
      if ((tasks || []).some(t => t.recurrenceGroupId === rule.groupId)) continue;  // já existe
      await setDayMeta(nid, {});
      await addDayTask(nid, { ..._ruleToTmpl(rule), done: false, order: (tasks?.length || 0) });
    } catch (e) { console.warn('[recur pin]', e); }
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

// Identidade VISÍVEL (ignora recurrenceGroupId de propósito): é por aqui que as
// cópias escapavam — a mesma tarefa com groupIds diferentes contava como
// distinta e triplicava. Pra limpar/deduplicar, o que vale é o que a pessoa vê.
function visKey(t) {
  // Espelha keyOf: instâncias com recurrenceGroupId DISTINTO são repetições
  // legítimas (ex.: 3 águas de manhã) e NÃO podem colapsar. Sem isso, os dedups
  // (dedupTemplates/dedupTasksNaSemana) apagavam as cópias intencionais todo load.
  // Só cai no fallback categoria|título|turno|horário pra tarefas legadas sem grupo.
  if (t.recurrenceGroupId) return `grp:${t.recurrenceGroupId}`;
  return `${t.categoryId || ''}|${(t.title || '').trim().toLowerCase()}|${t.shiftId || ''}|${t.startTime || ''}`;
}

// Tira cópias dos weekdayTemplates (a fonte das repetições) e salva 1x.
async function dedupTemplates() {
  const tpls = profile?.weekdayTemplates;
  if (!tpls || typeof tpls !== 'object') return;
  let mudou = false;
  const novo = {};
  for (const [dow, arr] of Object.entries(tpls)) {
    if (!Array.isArray(arr)) { novo[dow] = arr; continue; }
    const vistos = new Set();
    novo[dow] = arr.filter(t => {
      const k = visKey(t); if (vistos.has(k)) { mudou = true; return false; } vistos.add(k); return true;
    });
  }
  if (mudou) {
    profile.weekdayTemplates = novo;
    try { await setProfile({ weekdayTemplates: novo }); } catch (e) { console.warn('[dedup tpl]', e); }
  }
}

// Remove tarefas repetidas (mesma identidade visível) dentro de cada dia,
// mantendo UMA — a que estiver feita, se houver. Apaga as sobras do banco.
async function dedupTasksNaSemana(days) {
  for (const day of days) {
    const vistos = new Map(); const remover = [];
    for (const t of day.tasks) {
      const k = visKey(t); const mantida = vistos.get(k);
      if (!mantida) { vistos.set(k, t); continue; }
      if (t.done && !mantida.done) { remover.push(mantida); vistos.set(k, t); }
      else remover.push(t);
    }
    if (remover.length) {
      const ids = new Set(remover.map(t => t.id));
      day.tasks = day.tasks.filter(t => !ids.has(t.id));
      for (const t of remover) { try { await deleteDayTask(day.id, t.id); } catch {} }
    }
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

// Sincroniza o template do dia-da-semana com as tarefas RECORRENTES do dia.
// Inclui apenas tarefas com recurrenceGroupId ou recurrenceType !== 'today'.
// Pet tasks e compromissos únicos (sem groupId e sem recurrenceType) ficam de fora
// — do contrário, eles poluem o template e aparecem toda semana.
async function syncTemplateForDay(dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  // Usa o id do dia (YYYY-MM-DD) — evita bug de timezone com day.date.getDay()
  const [_sy, _sm, _sd] = dayDocId.split('-').map(Number);
  const dow = new Date(_sy, _sm - 1, _sd).getDay();
  const templates = day.tasks
    .filter(t => t.recurrenceGroupId || (t.recurrenceType && t.recurrenceType !== 'today'))
    .slice()
    .sort(taskSort)
    .map(t => {
      // Garante recurrenceGroupId em TODAS as tasks do template — sem isso,
      // isExcluded cai no check por título e tarefas excluídas via "apagar dia" nunca voltam.
      const grpId = t.recurrenceGroupId || genRecurId();
      if (!t.recurrenceGroupId) {
        t.recurrenceGroupId = grpId;
        updateDayTask(dayDocId, t.id, { recurrenceGroupId: grpId }).catch(console.error);
      }
      return {
        activityId: t.activityId || null,
        title: t.title,
        desc: t.desc || '',
        kind: t.kind || 'task',
        startTime: t.startTime || '',
        shiftId: t.shiftId || null,
        categoryId: t.categoryId || null,
        icon: t.icon || '',
        reminderEnabled: t.reminderEnabled || false,
        recurrenceGroupId: grpId,
        ...(t.recurrenceType ? { recurrenceType: t.recurrenceType } : {})
      };
    });
  try {
    await setWeekdayTemplate(dow, templates);
    if (!profile.weekdayTemplates) profile.weekdayTemplates = {};
    profile.weekdayTemplates[String(dow)] = templates;
  } catch (err) {
    console.error('[Visão] Erro ao salvar template:', err);
  }
}


// Migração única: percorre weekdayTemplates e atribui recurrenceGroupId a tasks
// que são recorrentes (recurrenceType !== 'today') mas ainda não têm groupId.
// Necessário para que isExcluded use check por groupId (não por título), evitando
// que tasks apagadas via "apagar dia" fiquem permanentemente excluídas.
async function _migrateTemplateGroupIds() {
  if (!profile?.weekdayTemplates) return;
  let changed = false;
  const updatedTemplates = {};
  for (const [dow, tasks] of Object.entries(profile.weekdayTemplates)) {
    if (!Array.isArray(tasks)) { updatedTemplates[dow] = tasks; continue; }
    const migrated = tasks.map(t => {
      if (!t.recurrenceGroupId && t.recurrenceType && t.recurrenceType !== 'today') {
        changed = true;
        return { ...t, recurrenceGroupId: genRecurId() };
      }
      return t;
    });
    updatedTemplates[dow] = migrated;
  }
  if (changed) {
    await setProfile({ weekdayTemplates: updatedTemplates });
    profile.weekdayTemplates = updatedTemplates;
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: ENTRY POINT — render principal da tela Ritual
// ═══════════════════════════════════════════════════════════════
// Esqueleto com a forma real da tela: título do ano, card da semana e as
// linhas dos dias, sumindo de opacidade pra baixo.
function _esqueletoRitual() {
  const dias = Array.from({ length: 6 }, (_, i) =>
    `<div class="sk" style="height:58px;margin-bottom:10px;border-radius:14px;opacity:${(1 - i * 0.13).toFixed(2)}"></div>`
  ).join('');
  return `<div style="padding:16px 16px 120px">
    <div class="sk" style="height:26px;width:78px;margin:10px auto 18px"></div>
    <div class="sk" style="height:88px;margin-bottom:18px;border-radius:16px"></div>
    ${dias}
  </div>`;
}

// Qual dia estava aberto na última vez que o Ritual foi montado. `expanded` é
// um Set de módulo: ele sobrevive ao app ficar em segundo plano, então quem
// saiu ontem à noite com o dia de ontem aberto voltava hoje com a tela rolada
// lá pra baixo, no dia errado.
let _diaDaMontagem = null;

export async function renderRitual(app) {
  app.innerHTML = _esqueletoRitual();

  // Virou o dia desde a última montagem? Então o que estava aberto é passado:
  // fecha tudo e deixa a tela abrir no topo, em hoje.
  const hojeId = dayId(new Date());
  if (_diaDaMontagem && _diaDaMontagem !== hojeId) expanded.clear();
  _diaDaMontagem = hojeId;

  // Sempre que abre o Ritual, volta pra semana de HOJE (evita ficar preso em semanas longe)
  weekStart = getWeekStart(new Date());
  // Alvo vindo de clique em notificação: #/ritual?day=YYYY-MM-DD&tag=...
  const _q = new URLSearchParams((location.hash.split('?')[1] || ''));
  const _tgtDay = _q.get('day');
  const _tgtTag = _q.get('tag');
  const _hasTarget = _tgtDay && /^\d{4}-\d{2}-\d{2}$/.test(_tgtDay);
  if (_hasTarget) weekStart = getWeekStart(new Date(_tgtDay + 'T00:00:00'));

  // Dispara a busca da semana JUNTO com os cadastros — ela só depende de
  // weekStart, não deles. Antes eram duas idas ao servidor em fila.
  const pSemana = _fetchWeekDays(weekStart);
  pSemana.catch(() => {});   // o erro real aparece no await lá embaixo

  try {
    [shifts, categories, activities, profile] = await Promise.all([
      getShifts(), getCategories(), getActivities(), getProfile()
    ]);
    profile = profile || {};
  } catch (err) {
    app.innerHTML = `<div style="padding:40px;text-align:center"><p style="color:var(--red)">${err.message}</p></div>`;
    return;
  }
  if (_hasTarget) { expanded.clear(); expanded.add(_tgtDay); }
  else if (expanded.size === 0) expanded.add(dayId(new Date()));
  // Migração: garante recurrenceGroupId em todas as tasks dos templates salvos.
  // Sem isso, tasks periódicas sem groupId ficam presas em excludedRecurrenceTitles para sempre.
  await _migrateTemplateGroupIds();
  await loadWeek(pSemana);
  renderUI(app);
  // Sem alvo de notificação, a tela começa NO TOPO. Sem isto, o navegador
  // devolve a rolagem de onde a pessoa parou — que depois de virar o dia é
  // o fim do dia anterior.
  if (!_hasTarget) {
    const rol = document.scrollingElement || document.documentElement;
    rol.scrollTop = 0;
  }
  // Veio de clique em notificação → rola e pisca a tarefa específica (ou o dia)
  if (_hasTarget) {
    setTimeout(() => {
      let taskEl = null;
      if (_tgtTag) {
        const day  = weekData.find(d => d.id === _tgtDay);
        const task = day?.tasks.find(t => notifTag(_tgtDay, t.title || '') === _tgtTag);
        if (task) taskEl = document.querySelector(`.task[data-task-id="${task.id}"]`);
      }
      if (taskEl) {
        taskEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        taskEl.style.transition = 'box-shadow .3s ease';
        const on  = () => { taskEl.style.boxShadow = '0 0 0 3px rgba(124,58,237,.9)'; };
        const off = () => { taskEl.style.boxShadow = ''; };
        on(); setTimeout(off, 420); setTimeout(on, 820); setTimeout(off, 1500);
      } else {
        document.querySelector(`.day-card[data-day-id="${_tgtDay}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
  }
  // Pop-up "Vamos começar o dia com soberania?" — 1x por dia
  // só dispara se as mensagens da manhã NÃO foram abertas hoje
  maybeShowSovereigntyPrompt();

  ligarViradaDeDia();
}

// O app fica aberto em segundo plano a noite toda. Ao voltar no dia seguinte,
// renderRitual NÃO roda de novo (a tela já está montada), então a checagem de
// virada lá em cima nunca acontecia — e o Ritual seguia rolado no fim do dia
// de ontem. Aqui a virada é pega no RETORNO do app (visibilitychange), que é
// o único evento que dispara nesse caso.
let _viradaLigada = false;
function ligarViradaDeDia() {
  if (_viradaLigada) return;
  _viradaLigada = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!document.querySelector('.ritual-screen')) return;   // não está no Ritual
    const hoje = dayId(new Date());
    if (_diaDaMontagem === hoje) return;                      // mesmo dia, nada a fazer
    // Virou o dia com o app aberto: fecha o de ontem, remonta em hoje no topo.
    _diaDaMontagem = hoje;
    expanded.clear();
    forceRender();
  });
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
  // Já tem um na tela? O Ritual é remontado a cada volta de outra aba, e sem
  // esta trava o prompt empilhava — fechar um deixava o de baixo aparecendo,
  // que é o "continua na tela depois do decreto".
  if (document.querySelector('.sov-prompt')) return;
  // Qualquer outro modal aberto tem precedência: jogar este por cima
  // esconderia o que a pessoa está lendo.
  if (document.querySelector('.modal-overlay')) return;
  // hasUnreadToday() retorna true se NÃO leu hoje; queremos disparar se NÃO leu
  const { hasUnreadToday, openMorningMessages } = await import('../mensagens-manha.js');
  if (!hasUnreadToday()) {
    // Já leu as mensagens hoje — não precisa do prompt
    localStorage.setItem(sovereigntyTodayKey(), '1');
    return;
  }

  // Dá um respiro pra UI renderizar antes do modal
  setTimeout(() => {
    // Reconfere no disparo: entre o agendamento e este ponto passaram 600ms,
    // tempo suficiente pra pessoa ter aberto as mensagens por outro caminho.
    if (localStorage.getItem(sovereigntyTodayKey()) === '1') return;
    if (document.querySelector('.sov-prompt')) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay sov-prompt';
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
          <div class="meta">${tr('ritual.pager.arrows')}</div>
          <div class="meta">${tr('ritual.pager.dblclick')}</div>
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
  scheduleAllTodayNotifs();  // auto-agenda tasks com horário de hoje
}

async function scheduleAllTodayNotifs() {
  const todayStr = dayId(new Date());
  const today = weekData.find(d => d.id === todayStr);
  if (!today) return;
  for (const task of today.tasks) {
    if (task.done || task.cancelled) continue;
    await autoScheduleNotif(todayStr, task, { silent: true });
  }
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
          <span class="dow">${_wdFull(d.date)}${hasPendingReminder ? '<span class="day-reminder-dot" title="Tem tarefa com lembrete"></span>' : ''}</span>
          <span class="dnum">${String(d.date.getDate()).padStart(2,'0')} ${_moShort(d.date)}</span>
          ${isToday ? `<span class="today-badge">${tr('ritual.today')}</span>` : ''}
        </div>
        <div class="day-card-stats">${statsHtml(total, done, pct)}</div>
        <span class="day-card-chevron">▾</span>
      </button>
      <div class="day-card-content">${renderDayContent(d)}</div>
    </div>
  `;
}

function statsHtml(total, done, pct) {
  if (!total) return `<small class="day-empty-tag">${tr('ritual.day.empty')}</small>`;
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
      thumb.title = t.cancelled ? tr('ritual.task.cancelled') : (t.done ? tr('ritual.task.done') : tr('ritual.task.mark'));
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
          <span class="dow">${tr('ritual.commitments.title')}</span>
          <span class="dnum"></span>
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
        ${tr('ritual.no.commitments')}<br>
        <small>${tr('ritual.commitments.hint')}</small>
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
        ${_wdFull(day.date)} · ${String(day.date.getDate()).padStart(2,'0')}/${String(day.date.getMonth()+1).padStart(2,'0')}
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
        <span class="time-pill-label">${tr('ritual.woke')}</span>
        <button type="button" class="time-pill-input tp-pill-trigger ${wakeIsEmpty ? 'is-placeholder' : ''}" data-meta="wakeTime" data-day="${d.id}" data-time="${wakeReal || ''}">${wakeDisplay}</button>
      </label>
      <button class="pull-prev-day-pretty" data-action="pull-prev-day" data-day="${d.id}" title="Trazer atividades de outro dia">
        <span class="pull-prev-ic">📥</span>
      </button>
      <label class="time-pill">
        <span class="time-pill-label">${tr('ritual.slept')}</span>
        <button type="button" class="time-pill-input tp-pill-trigger ${sleepIsEmpty ? 'is-placeholder' : ''}" data-meta="sleepTime" data-day="${d.id}" data-time="${sleepReal || ''}">${sleepDisplay}</button>
      </label>
    </div>

    ${renderShiftsForDay(d)}

    <div class="hydration">
      <div class="hydration-top">
        <div class="hydration-label">${tr('ritual.hydration')}</div>
        <div class="hydration-goal-label">meta: ${d.meta.hydrationGoal} ml</div>
      </div>
      <div class="hydration-stepper">
        <button class="hyd-btn" data-hyd-step="-250" data-day="${d.id}" title="−250ml">−</button>
        <div class="hyd-value">
          <span class="hyd-ml" data-day="${d.id}">${d.meta.hydrationMl || 0}</span><small>ml</small>
        </div>
        <button class="hyd-btn" data-hyd-step="250" data-day="${d.id}" title="+250ml">+</button>
      </div>
      <div class="hydration-bar">
        <div class="hydration-fill" data-day="${d.id}" style="width:${hydPct}%"></div>
        <button type="button" class="hyd-dot" data-day="${d.id}" style="left:${hydPct}%" aria-label="Arraste pra ajustar (50 ml)"></button>
      </div>
      <div class="hydration-msg" data-day="${d.id}">${hydrationMsg(d.meta.hydrationMl, d.meta.hydrationGoal)}</div>
    </div>

    <div class="day-note-wrap" data-day="${d.id}">
      ${renderDayNoteButton(d)}
    </div>

    <div class="day-clear-wrap">
      <button type="button" class="day-clear-btn" data-action="clear-day" data-day="${d.id}">
        ${tr('ritual.day.deleteall')}
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
          <strong>${tr('ritual.note.registered')}</strong>
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
        <strong>${tr('ritual.note.title')}</strong>
        <small>${tr('ritual.note.sub')}</small>
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
      ${tr('ritual.no.shifts')}
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
        <div class="shift-title">${escape(_shiftDisplayName(s.name))}</div>
        <div class="shift-count">${byShift[s.id].length} ${tr('ritual.tasks')}</div>
        <button class="shift-add" data-add-to="${s.id}" data-day="${d.id}" title="Adicionar atividade">+</button>
      </div>
      <div class="task-list">
        ${byShift[s.id].sort(taskSort).map(t => taskCard(t, d.id)).join('') || `<div class="empty-shift">${tr('ritual.shift.empty')}</div>`}
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
      const dow = _wdFull(c.date);
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
  const dow = _wdFull(choice.date);
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
    _clearUndoForDay(dayDocId);
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
    if (t.kind !== 'commitment') continue;  // modal só para compromissos
    if (t.recurrenceGroupId) continue;      // atividades recorrentes do ritual não cobram status
    if (t.done || t.cancelled) continue;   // reagendado NÃO pula: o novo horário
                                            // também vence e deve cobrar/notificar de novo.
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
      if (chosenDays.length === 0) return tr('recur.calendar.empty');
      if (chosenDays.length === 1) return tr('recur.calendar.one', { d: chosenDays[0] });
      return tr('recur.calendar.many', { days: chosenDays.join(', ') });
    };

    const renderHTML = () => `
      <div class="modal recur-chooser-modal">
        <div class="modal-title">${tr('recur.modal.title')}</div>
        <div class="modal-hint">${tr('recur.modal.hint')}</div>

        <div class="recur-options">
          <button type="button" class="recur-opt ${selectedKey === 'today' ? 'sel' : ''}" data-recur="today">
            <span class="recur-opt-ic">📌</span>
            <span class="recur-opt-text">
              <strong>${tr('recur.today.label')}</strong>
              <small>${tr('recur.today.sub')}</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
          <button type="button" class="recur-opt ${selectedKey === 'weekly' ? 'sel' : ''}" data-recur="weekly">
            <span class="recur-opt-ic">🔁</span>
            <span class="recur-opt-text">
              <strong>${escape(dowLabel)}</strong>
              <small>${tr('recur.weekly.sub')}</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
          <button type="button" class="recur-opt ${selectedKey === 'daily' ? 'sel' : ''}" data-recur="daily">
            <span class="recur-opt-ic">📅</span>
            <span class="recur-opt-text">
              <strong>${tr('recur.daily.label')}</strong>
              <small>${tr('recur.daily.sub')}</small>
            </span>
            <span class="recur-opt-check">✓</span>
          </button>
          ${isCommitment ? `
            <button type="button" class="recur-opt ${selectedKey === 'monthly' ? 'sel' : ''}" data-recur="monthly">
              <span class="recur-opt-ic">📆</span>
              <span class="recur-opt-text">
                <strong>${tr('recur.monthly.label', { day: currentDate.getDate() })}</strong>
                <small>${tr('recur.monthly.sub')}</small>
              </span>
              <span class="recur-opt-check">✓</span>
            </button>
          ` : ''}
          <button type="button" class="recur-opt ${selectedKey === 'specific' ? 'sel' : ''}" data-recur="specific">
            <span class="recur-opt-ic">🗓️</span>
            <span class="recur-opt-text">
              <strong>${tr('recur.specific.label')}</strong>
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

// Modal combinado data + hora no estilo cal-modal — evita chain de dois modais separados
// Retorna { date: Date, time: "HH:MM" } ou null se cancelar.
function openReschedulePicker(initialDate = new Date(), initialTime = '') {
  return new Promise((resolve) => {
    const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const DAY_NAMES   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    let selDate   = new Date(initialDate);
    let selTime   = initialTime || '';
    let viewYear  = selDate.getFullYear();
    let viewMonth = selDate.getMonth();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const buildGrid = () => {
      const firstDay    = new Date(viewYear, viewMonth, 1);
      const lastDay     = new Date(viewYear, viewMonth + 1, 0);
      const startDow    = firstDay.getDay();
      const daysInMonth = lastDay.getDate();
      const todayStr    = dayId(new Date());
      const selStr      = dayId(selDate);
      let html = '';
      for (let i = 0; i < startDow; i++) html += '<span class="cal-cell empty"></span>';
      for (let d = 1; d <= daysInMonth; d++) {
        const id = dayId(new Date(viewYear, viewMonth, d));
        html += `<button type="button" class="cal-cell${id === todayStr ? ' today' : ''}${id === selStr ? ' selected' : ''}" data-rp-day="${id}">${d}</button>`;
      }
      return html;
    };

    const buildHint = () =>
      `${DAY_NAMES[selDate.getDay()]}, ${String(selDate.getDate()).padStart(2,'0')} de ${MONTH_NAMES[selDate.getMonth()]}`;

    overlay.innerHTML = `
      <div class="modal cal-modal">
        <div class="modal-title">Reagendar</div>
        <div class="cal-header">
          <button type="button" class="cal-nav" data-rp-nav="-1">‹</button>
          <div class="cal-title" id="rp-month"></div>
          <button type="button" class="cal-nav" data-rp-nav="1">›</button>
        </div>
        <div class="cal-weekdays">
          <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
        </div>
        <div class="cal-grid" id="rp-grid"></div>
        <div class="cal-hint" id="rp-hint"></div>
        <div class="input-field-label" style="margin-top:4px">Horário</div>
        <button type="button" class="tp-trigger" id="rp-time">
          <span class="tp-trigger-icon">🕐</span>
          <span class="tp-trigger-time" id="rp-time-label">${selTime || '— : —'}</span>
          <span class="tp-trigger-edit">›</span>
        </button>
        <div class="modal-actions">
          <button class="btn-secondary" id="rp-cancel">Cancelar</button>
          <button class="btn-primary" id="rp-save">Confirmar</button>
        </div>
      </div>
    `;

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

    const refreshMonth = () => {
      overlay.querySelector('#rp-month').textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
      overlay.querySelector('#rp-grid').innerHTML = buildGrid();
    };

    refreshMonth();
    overlay.querySelector('#rp-hint').textContent = buildHint();

    overlay.querySelectorAll('[data-rp-nav]').forEach(btn => {
      btn.onclick = () => {
        viewMonth += parseInt(btn.dataset.rpNav, 10);
        if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
        refreshMonth();
      };
    });

    overlay.querySelector('#rp-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-rp-day]');
      if (!cell) return;
      const [y, m, d] = cell.dataset.rpDay.split('-').map(Number);
      selDate = new Date(y, m - 1, d);
      overlay.querySelector('#rp-hint').textContent = buildHint();
      overlay.querySelector('#rp-grid').innerHTML = buildGrid();
    });

    overlay.querySelector('#rp-time').onclick = async () => {
      const result = await openTimePicker(selTime, { embedded: true });
      if (result) {
        selTime = result;
        overlay.querySelector('#rp-time-label').textContent = selTime;
      }
    };

    overlay.querySelector('#rp-cancel').onclick = () => finish(null);
    overlay.querySelector('#rp-save').onclick = () => {
      if (!selTime) { showToast('Escolha um horário', 'info'); return; }
      finish({ date: selDate, time: selTime });
    };

    overlay.onclick = (e) => { if (e.target === overlay) finish(null); };
    document.body.appendChild(overlay);
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
      <div class="modal-title">${tr('ritual.overdue.title')}</div>
      <div class="modal-hint" style="text-align:center; line-height:1.55; padding: 6px 0">
        <strong>${escape(t.title)}</strong><br>
        ${tr('ritual.overdue.body', { date: dataFmt, time: horaFmt })}<br>
        <small style="color:var(--muted)">${tr('ritual.overdue.q')}</small>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px">
        <button class="btn-primary" data-overdue="done">${tr('ritual.overdue.done')}</button>
        <button class="btn-secondary" data-overdue="reschedule">${tr('ritual.overdue.reschedule')}</button>
        <button class="btn-secondary" data-overdue="cancel">${tr('ritual.overdue.cancel')}</button>
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
    const result = await openReschedulePicker(day.date, toHHMM(t.startTime) || '');
    if (!result) return;
    const { date: newDate, time: newTime } = result;
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
        t.rescheduled = true;
        await updateDayTask(day.id, t.id, { startTime: newTime, rescheduleCount: newCount, rescheduled: true });
        await autoScheduleNotif(day.id, t, { silent: true });   // reprograma o push pro novo horário
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
          rescheduled: true,
          order: 0,
          reminderEnabled: t.reminderEnabled || false,
          rescheduleCount: newCount,
          ...(t.recurrenceGroupId ? { recurrenceGroupId: t.recurrenceGroupId } : {})
        };
        await addDayTask(newDayId, newTask);
        await autoScheduleNotif(newDayId, newTask, { silent: true });   // push no novo dia/horário
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
      ? tr('recur.del.template')
      : tr('recur.del.days', { count: otherCount });
    modal.innerHTML = `
      <div class="modal" style="max-width:340px">
        <div class="modal-title" style="text-align:center">${tr('recur.del.title')}</div>
        <div class="modal-hint" style="text-align:center">
          <strong>"${escape(taskTitle)}"</strong><br>
          ${subInfo}
        </div>
        <button class="del-scope-btn" data-scope="one" type="button">
          <strong>📌 ${tr('recur.del.one')}</strong>
          <small>${tr('recur.del.one.sub')}</small>
        </button>
        <button class="del-scope-btn danger" data-scope="all" type="button">
          <strong>🗑️ ${tr('recur.del.all')}</strong>
          <small>${tr('recur.del.all.sub')}</small>
        </button>
        <div class="modal-actions">
          <button class="btn-secondary" id="del-cancel">${tr('ritual.cancel')}</button>
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

// Label da recorrência semanal — nome do dia via Intl (respeita o idioma ativo)
function recurWeeklyLabel(dow) {
  const date = new Date(2000, 0, 2 + dow); // 2000-01-02 = Domingo (dow=0)
  const dayName = new Intl.DateTimeFormat(getLang(), { weekday: 'long' }).format(date);
  const isMasc = (dow === 0 || dow === 6);
  return tr(isMasc ? 'recur.weekly.m' : 'recur.weekly.f', { day: dayName });
}

// Mapeia HH:MM → nome de turno padrão (Manhã 5-12, Tarde 12-19, Noite 19-5)
// Retorna SEMPRE o nome em PT-BR pois é usado para matching contra dados do Firestore
function shiftNameFromTime(timeStr) {
  if (!timeStr) return null;
  const [hh] = timeStr.split(':').map(Number);
  if (isNaN(hh)) return null;
  if (hh >= 5 && hh < 12) return 'Manhã';
  if (hh >= 12 && hh < 19) return 'Tarde';
  return 'Noite';
}

// Traduz nomes de turnos padrão para o idioma atual (só exibição, nunca matching)
function _shiftDisplayName(name) {
  const map = { 'Manhã': 'ritual.shift.morning', 'Tarde': 'ritual.shift.afternoon', 'Noite': 'ritual.shift.evening' };
  return map[name] ? tr(map[name]) : name;
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
      <button class="task-menu-btn-corner" data-action="menu" title="${tr('ritual.task.menu.title')}">⋮</button>
      <button class="task-thumb ${t.done ? 'done' : ''} ${t.cancelled ? 'is-cancelled' : ''} ${isCommitment ? 'task-check' : ''}" data-action="check" title="${t.cancelled ? tr('ritual.task.cancelled') : (t.done ? tr('ritual.task.done') : tr('ritual.task.mark'))}">${checkContent}</button>
      <div class="task-body">
        <div class="task-title">
          <span class="task-icon-inline">${taskIcon}</span>${t.startTime ? `<span class="task-time">${escape(t.startTime)}</span>` : ''}${escape(t.title)}${rescheduleBadge}
        </div>
        ${t.desc ? `<div class="task-sub">${escape(t.desc)}</div>` : ''}
        <div class="task-footer">
          ${cat ? `<span class="task-tag" style="color:${cat.color};background:${hexA(cat.color,0.15)}">${escape(cat.name)}</span>` : ''}
        </div>
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
// ── Área de transferência de tarefa (copiar de um dia, colar em outro) ──
// Guarda em localStorage: sobrevive a trocar de semana/tela.
const CLIP_KEY = 'visao_task_copiada';
function _getClip() {
  try { return JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch { return null; }
}
function _setClip(t) {
  localStorage.setItem(CLIP_KEY, JSON.stringify({
    activityId: t.activityId || null,
    title: t.title,
    desc: t.desc || '',
    startTime: t.startTime || '',
    categoryId: t.categoryId || null,
    icon: t.icon || '',
    kind: t.kind || 'task',
    reminderEnabled: t.reminderEnabled || false,
  }));
}

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
    <button class="task-menu-item" data-menu-action="restore">${tr('ritual.task.restore')}</button>
    <button class="task-menu-item danger" data-menu-action="del">${tr('ritual.task.delete')}</button>
  ` : `
    <button class="task-menu-item" data-menu-action="edit">${tr('ritual.task.edit')}</button>
    <button class="task-menu-item" data-menu-action="copy">📋 Copiar</button>
    ${_getClip() ? `<button class="task-menu-item" data-menu-action="paste">📑 Colar abaixo</button>` : ''}
    <button class="task-menu-item" data-menu-action="dup">${tr('ritual.task.dup')}</button>
    <button class="task-menu-item danger" data-menu-action="del">${tr('ritual.task.delete')}</button>
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
// BLOCO 8.9: AUTO-AGENDAMENTO DE NOTIFICAÇÃO
// Chamado ao salvar tarefa com reminderEnabled=true + horário.
// Agenda push local silenciosamente (sem toast extra se já foi pedida permissão).
// ═══════════════════════════════════════════════════════════════
async function autoScheduleNotif(dayDocId, task, { silent = false } = {}) {
  if (!task.startTime) return;
  const [y, mo, d] = dayDocId.split('-').map(Number);
  const [h, mi]    = task.startTime.split(':').map(Number);
  const ts = new Date(y, mo - 1, d, h, mi).getTime();
  if (ts <= Date.now()) return;
  const tag = notifTag(dayDocId, task.title || '');
  const result = await scheduleNotif({ title: task.title || 'Falcon', body: tr('notif.body.ritual'), tag, timestamp: ts });
  if (silent) return;
  if (result === 'scheduled') showToast(tr('notif.scheduled', { time: task.startTime }), 'success');
  else if (result === 'denied') showToast(tr('notif.denied'), 'info');
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

    // Desfazer limpeza do dia
    const undoBtn = e.target.closest('[data-action="undo-clear"]');
    if (undoBtn) {
      undoClearDay(app, undoBtn.dataset.day);
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
      _clearUndoForDay(dayDocId);

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

    // Copiar tarefa (guarda pra colar em qualquer dia)
    const copyBtn = e.target.closest('[data-action="copy"]');
    if (copyBtn) {
      const taskEl = copyBtn.closest('[data-task-id]');
      const day = weekData.find(d => d.id === taskEl.dataset.day);
      const t = day?.tasks.find(x => x.id === taskEl.dataset.taskId);
      if (!t) return;
      _setClip(t);
      showToast(`📋 "${t.title}" copiada — cole em qualquer dia pelo ⋮`, 'success');
      return;
    }

    // Colar abaixo desta tarefa (mesmo turno da tarefa de referência)
    const pasteBtn = e.target.closest('[data-action="paste"]');
    if (pasteBtn) {
      const clip = _getClip();
      if (!clip) return;
      const taskEl = pasteBtn.closest('[data-task-id]');
      const dayDocId = taskEl.dataset.day;
      const day = weekData.find(d => d.id === dayDocId);
      const ref = day?.tasks.find(x => x.id === taskEl.dataset.taskId);
      if (!ref) return;

      // Mesma mecânica do duplicar: empurra os posteriores e entra logo abaixo
      const sameShift = day.tasks.filter(x => x.shiftId === ref.shiftId).sort(taskSort);
      const currentIdx = sameShift.findIndex(x => x.id === ref.id);
      const insertOrder = currentIdx + 1;
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

      const newTask = { ...clip, shiftId: ref.shiftId, done: false, order: insertOrder };
      const tid = await addDayTask(dayDocId, newTask);
      day.tasks.push({ id: tid, ...newTask });
      _clearUndoForDay(dayDocId);
      playDone();

      const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
      if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId);
      requestAnimationFrame(() => {
        const newEl = dayCardEl?.querySelector(`[data-task-id="${tid}"]`);
        if (newEl) {
          newEl.classList.add('task-flash');
          newEl.addEventListener('animationend', () => newEl.classList.remove('task-flash'), { once: true });
        }
      });

      showToast('📑 Tarefa colada', 'success');
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
      // Atualiza UI (valor, barra, bolinha e mensagem)
      const card = hydBtn.closest('.day-card');
      _hydPintar(card, dayDocId, newMl, day.meta.hydrationGoal);
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
      // Dialog de recorrência só aparece se a tarefa foi explicitamente marcada como tal.
      // Tarefas criadas pelo pet (sem recurrenceGroupId nem recurrenceType) nunca disparam
      // o dialog — evita falso-positivo por match casual de título+categoria.
      const taskIsRecurring = !!(t.recurrenceGroupId || (t.recurrenceType && t.recurrenceType !== 'today'));
      const isRecurring = taskIsRecurring && (recurringDays.length > 0 || recurringInTemplates.length > 0);

      let scope = 'one'; // 'one' | 'all'
      if (isRecurring) {
        // Mostra o total de ocorrências (na semana atual + templates futuros)
        const totalOther = recurringDays.length + (recurringInTemplates.length > 0 ? 1 : 0);
        scope = await askDeleteScope(t.title, totalOther, recurringInTemplates.length > 0);
        if (!scope) return; // cancelado
      } else {
        // Não-recorrente: confirma SEM oferecer a opção de excluir recorrências
        const ok = await confirmModal({
          title: tr('ritual.del.title'),
          message: tr('ritual.del.message', { title: t.title }),
          confirmText: tr('ritual.del.confirm'),
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
    el.querySelector('.shift-count').textContent = `${count} ${tr('ritual.tasks')}`;
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
// ── Estado de undo para "apagar dia" ──────────────────────────
const _clearUndoData = new Map(); // dayDocId → { tasks, meta }

async function openClearDayModal(app, dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  if (!day.tasks.length) { showToast('Nenhuma atividade para apagar', 'info'); return; }
  await clearDayAll(app, dayDocId);
}

async function clearDayAll(app, dayDocId) {
  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;
  try {
    // Cancela undo pendente anterior para este dia (se houver)
    _clearUndoData.delete(dayDocId);

    // Snapshot para possível undo (antes de qualquer deleção)
    const tasksSnapshot = day.tasks.map(t => ({ ...t }));
    const metaSnapshot  = { ...day.meta };

    // Coleta grupos de recorrência pra impedir re-geração pelo autoGen
    const recurGroups = [...new Set(
      day.tasks.filter(t => t.recurrenceGroupId).map(t => t.recurrenceGroupId)
    )];
    const recurTitleKeys = [...new Set(
      day.tasks
        .filter(t => !t.recurrenceGroupId && (t.title || '').trim())
        .map(t => `${(t.title || '').trim().toLowerCase()}::${t.categoryId || ''}`)
    )];

    // Apaga todas as tarefas do Firestore
    await Promise.all(day.tasks.map(t => deleteDayTask(dayDocId, t.id)));
    day.tasks = [];

    const existingGroups = Array.isArray(day.meta.excludedRecurrenceGroups) ? day.meta.excludedRecurrenceGroups : [];
    const existingTitles = Array.isArray(day.meta.excludedRecurrenceTitles) ? day.meta.excludedRecurrenceTitles : [];
    const metaUpdate = {
      hasActivity: false,
      generated: true,
      excludedRecurrenceGroups: [...new Set([...existingGroups, ...recurGroups])],
      excludedRecurrenceTitles: [...new Set([...existingTitles, ...recurTitleKeys])]
    };
    await setDayMeta(dayDocId, metaUpdate);
    Object.assign(day.meta, metaUpdate);
    prevNoteCache.delete(dayDocId);

    // Guarda snapshot para undo
    _clearUndoData.set(dayDocId, { tasks: tasksSnapshot, meta: metaSnapshot });

    // Re-renderiza só o day card (não o app inteiro — preserva o undo button)
    const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
    if (dayCardEl) {
      dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId, false);
    }
    playDelete();

    // Monta o resumo do que foi mantido (sono/hidratação/nota)
    const keptParts = [];
    if (day.meta.sleepTime || metaSnapshot.sleepTime) keptParts.push('sono');
    if ((day.meta.hydrationMl || metaSnapshot.hydrationMl || 0) > 0) keptParts.push('hidratação');
    if (metaSnapshot.dayNote && Object.values(metaSnapshot.dayNote).some(v => v)) keptParts.push('nota');

    // Substitui o botão de apagar pelo resumo + botão de desfazer (fica até nova tarefa ser adicionada)
    _showClearUndoBtn(dayDocId, tasksSnapshot.length, keptParts);

  } catch (err) {
    console.error('[clear-all] erro:', err);
    showToast('Erro ao limpar o dia', 'error');
  }
}

function _showClearUndoBtn(dayDocId, taskCount, keptParts) {
  const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
  const wrap = dayCardEl?.querySelector('.day-clear-wrap');
  if (!wrap) return;

  const keptStr = keptParts.length ? keptParts.join(', ') + ' mantidos' : '';
  wrap.innerHTML = `
    <div class="day-undo-row">
      <span class="day-undo-info">
        🗑️ ${taskCount} atividade${taskCount !== 1 ? 's' : ''} apagada${taskCount !== 1 ? 's' : ''}${keptStr ? ` · ${keptStr}` : ''}
      </span>
      <button type="button" class="day-undo-btn" data-action="undo-clear" data-day="${dayDocId}">
        ↩ Desfazer
      </button>
    </div>`;
}

function _clearUndoForDay(dayDocId) {
  if (!_clearUndoData.has(dayDocId)) return;
  _clearUndoData.delete(dayDocId);
  _restoreClearBtn(dayDocId);
}

function _restoreClearBtn(dayDocId) {
  const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
  const wrap = dayCardEl?.querySelector('.day-clear-wrap');
  if (wrap) {
    wrap.innerHTML = `<button type="button" class="day-clear-btn" data-action="clear-day" data-day="${dayDocId}">${tr('ritual.day.deleteall')}</button>`;
  }
}

async function undoClearDay(app, dayDocId) {
  const data = _clearUndoData.get(dayDocId);
  if (!data) return;

  _clearUndoData.delete(dayDocId);

  const day = weekData.find(d => d.id === dayDocId);
  if (!day) return;

  try {
    // Re-adiciona as tarefas no Firestore na mesma ordem
    for (const t of data.tasks) {
      const { id: _oldId, ...taskData } = t;
      const newId = await addDayTask(dayDocId, taskData);
      day.tasks.push({ id: newId, ...taskData });
    }

    // Restaura os metadados originais (exclusões de recorrência, hasActivity, etc.)
    const restoreMeta = {
      hasActivity: data.tasks.length > 0,
      excludedRecurrenceGroups: data.meta.excludedRecurrenceGroups || [],
      excludedRecurrenceTitles: data.meta.excludedRecurrenceTitles || []
    };
    await setDayMeta(dayDocId, restoreMeta);
    Object.assign(day.meta, restoreMeta);
    prevNoteCache.delete(dayDocId);

    // Re-renderiza o day card com as tarefas restauradas
    const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
    if (dayCardEl) {
      dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId, false);
    }
    showToast('Atividades restauradas', 'success');
  } catch (err) {
    console.error('[undo-clear] erro:', err);
    showToast('Erro ao desfazer', 'error');
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
      <div class="modal-title">${tr('ritual.note.modal.title')}</div>
      <div class="modal-hint">${tr('ritual.note.modal.hint')}</div>

      <label class="input-field">
        <div class="input-field-label">${tr('ritual.note.q1.label')}</div>
        <textarea id="note-pride-fail" rows="4" placeholder="${tr('ritual.note.q1.placeholder')}">${escape(note.prideFail || '')}</textarea>
      </label>

      <label class="input-field">
        <div class="input-field-label">${tr('ritual.note.q2.label')}</div>
        <textarea id="note-improve" rows="4" placeholder="${tr('ritual.note.q2.placeholder')}">${escape(note.improve || '')}</textarea>
      </label>

      <div class="input-field">
        <div class="input-field-label">${tr('ritual.note.sleep.day')} <small style="color:var(--muted);font-weight:500">(${tr('ritual.note.sleep.nap')})</small></div>
        <div class="num-stepper" id="stp-daysleep" data-val="${daySleepInit}" data-min="0" data-max="360" data-step-size="15">
          <button type="button" class="step-arrow" data-step="-1" aria-label="diminuir">‹</button>
          <div class="step-val">${fmtMin(daySleepInit)}</div>
          <button type="button" class="step-arrow" data-step="+1" aria-label="aumentar">›</button>
        </div>
      </div>

      <div class="input-field">
        <div class="input-field-label">${tr('ritual.note.sleep.night')}</div>
        <div class="num-stepper" id="stp-nightawake" data-val="${nightAwakeInit}" data-min="0" data-max="360" data-step-size="15">
          <button type="button" class="step-arrow" data-step="-1" aria-label="diminuir">‹</button>
          <div class="step-val">${fmtMin(nightAwakeInit)}</div>
          <button type="button" class="step-arrow" data-step="+1" aria-label="aumentar">›</button>
        </div>
      </div>

      <div class="note-validate-msg" id="note-validate-msg" hidden>${tr('ritual.note.validate')}</div>
      <div class="modal-actions">
        <button class="btn-secondary" id="note-cancel">${tr('ritual.cancel')}</button>
        <button class="btn-primary" id="note-register" disabled>✓ ${tr('ritual.note.register')}</button>
      </div>
      ${isEditing ? `
        <div class="note-delete-wrap">
          <button type="button" class="note-delete-btn" id="note-delete">🗑️ ${tr('ritual.note.delete')}</button>
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
        title: tr('ritual.del.note.title'),
        message: tr('ritual.del.note.message'),
        confirmText: tr('ritual.del.confirm'),
        cancelText: tr('ritual.edit.cancel'),
        danger: true
      });
      if (!ok) return;
      try {
        day.meta.dayNote = null;
        await setDayMeta(dayDocId, { dayNote: null });
        prevNoteCache.delete(dayDocId);
        playDelete();
        showToast(tr('ritual.del.note.toast'), 'success');
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
          <div class="note-success-title">${tr('ritual.note.success')}</div>
          <div class="note-success-sub">${tr('ritual.note.success.sub')}</div>
        </div>
      `;
      if (navigator.vibrate) navigator.vibrate([20, 60, 40]);
      playDone();

      // Celebração se todas as tarefas do dia estão concluídas
      const allDone = day.tasks.length > 0 && day.tasks.every(t => t.done);
      if (allDone) launchCelebration();

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
      <div class="modal-hint">No turno <strong>${escape(shift?.name || '')}</strong> de ${escape(_wdFull(day.date))} ${escape(String(day.date.getDate()).padStart(2,'0'))} ${escape(_moShort(day.date))}.</div>

      ${_getClip() ? `<button type="button" class="btn-secondary" id="m-paste" style="width:100%;margin-bottom:12px">📑 Colar "${escape(_getClip().title)}"</button>` : ''}

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
          <span class="reminder-label">${tr('ritual.edit.reminder')}</span>
          <span class="reminder-hint">${tr('ritual.edit.reminder.hint')}</span>
        </div>
      </label>

      <div class="input-field-label" style="margin-top:8px">${tr('ritual.edit.recur')}</div>
      <button type="button" class="recur-btn" id="m-recur-btn" data-recur="today">
        <span class="recur-btn-ic">🔁</span>
        <span class="recur-btn-text">${tr('recur.btn.title')}</span>
        <span class="recur-btn-label">${tr('recur.only.today')}</span>
        <span class="recur-btn-edit">›</span>
      </button>

      ${categories.length === 0 ? `<div style="padding:8px 0;color:var(--muted);font-size:11px;text-align:center">
        ${tr('ritual.no.activities')}
      </div>` : ''}

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">+ Adicionar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Colar a tarefa copiada direto neste turno (funciona até num dia vazio)
  modal.querySelector('#m-paste')?.addEventListener('click', async () => {
    const clip = _getClip();
    if (!clip) return;
    const order = day.tasks.filter(x => x.shiftId === shiftId).length;
    const newTask = { ...clip, shiftId, done: false, order };
    try {
      const tid = await addDayTask(dayDocId, newTask);
      day.tasks.push({ id: tid, ...newTask });
      modal.remove();
      playDone();
      const dayCardEl = document.querySelector(`.day-card[data-day-id="${dayDocId}"]`);
      if (dayCardEl) dayCardEl.querySelector('.day-card-content').innerHTML = renderDayContent(day);
      updateDayCardStats(dayDocId);
      showToast('📑 Tarefa colada', 'success');
    } catch (err) {
      console.error('[paste] erro:', err);
      showToast('Erro ao colar. Tente de novo.', 'error');
    }
  });

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
    if (recurState.recur === 'today') recurLabel.textContent = tr('recur.only.today');
    else if (recurState.recur === 'weekly') recurLabel.textContent = recurWeeklyLabel(day.date.getDay());
    else if (recurState.recur === 'daily') recurLabel.textContent = tr('recur.daily.label');
    else if (recurState.recur === 'monthly') {
      const dom = recurState.daysOfMonth?.length ? recurState.daysOfMonth : [day.date.getDate()];
      recurLabel.textContent = dom.length === 1 ? tr('recur.monthly.day.single', { day: dom[0] }) : tr('recur.monthly.day.multi', { days: dom.join(', ') });
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
    const saveBtn = modal.querySelector('#m-save');
    if (saveBtn?.disabled) return;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.6'; }
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
      _clearUndoForDay(dayDocId);
      await propagateReminderToCategory(categoryId, reminderEnabled);
      await autoScheduleNotif(dayDocId, baseTask);

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
          _clearUndoForDay(otherDay.id);
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
        const label = days.length === 1 ? tr('recur.monthly.day.single', { day: days[0] }) : tr('recur.monthly.day.multi', { days: days.join(', ') });
        const noun = tr(kind === 'commitment' ? 'recur.toast.commitment' : 'recur.toast.task');
        showToast(tr('recur.toast.repeats', { noun, title, label }), 'success');
        return;
      } else if (recur === 'weekly') {
        // Salva no weekdayTemplate do DOW desta data (pra próximas semanas)
        // NOTA: 'daily' já salva nos 7 DOWs acima. 'weekly' só salva no DOW específico.
        const [_nty, _ntm, _ntd] = dayDocId.split('-').map(Number);
        const dowW = new Date(_nty, _ntm - 1, _ntd).getDay();
        const templateTask = {
          activityId: null, title, desc: '',
          kind,
          startTime, shiftId: shiftId || null, categoryId: categoryId || null,
          icon: '', reminderEnabled,
          recurrenceGroupId,
          recurrenceType: 'weekly'
        };
        const tplExisting = (await getWeekdayTemplate(dowW)) || [];
        if (!tplExisting.some(x => x.recurrenceGroupId === recurrenceGroupId)) {
          tplExisting.push(templateTask);
          await setWeekdayTemplate(dowW, tplExisting);
          if (!profile.weekdayTemplates) profile.weekdayTemplates = {};
          profile.weekdayTemplates[String(dowW)] = tplExisting;
        }
        const noun2 = tr(kind === 'commitment' ? 'recur.toast.commitment' : 'recur.toast.task');
        showToast(tr('recur.toast.repeats', { noun: noun2, title, label: recurWeeklyLabel(dowW) }), 'success');
      }
      // recur === 'daily' (já tem template salvo acima) — cai aqui só pra close + render
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
      const saveBtn = modal.querySelector('#m-save');
      if (saveBtn?.isConnected) { saveBtn.disabled = false; saveBtn.style.opacity = ''; }
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
      <div class="modal-title">${isCommitment ? tr('ritual.edit.title.commitment') : tr('ritual.edit.title.task')}</div>
      <div class="modal-hint">${tr('ritual.edit.hint')}</div>

      <div class="input-field-label">${tr('ritual.edit.type')}</div>
      <div class="kind-chips" id="kind-chips">
        <button type="button" class="kind-chip ${kind === 'task' ? 'active' : ''}" data-kind="task">${tr('ritual.edit.task.chip')}</button>
        <button type="button" class="kind-chip ${isCommitment ? 'active' : ''}" data-kind="commitment">${tr('ritual.edit.commitment.chip')}</button>
      </div>

      <label class="input-field"><div class="input-field-label">${tr('ritual.edit.title.field')}</div>
        <input id="m-title" value="${escape(t.title)}" /></label>
      <label class="input-field"><div class="input-field-label">${tr('ritual.edit.desc')}</div>
        <input id="m-desc" value="${escape(t.desc || '')}" placeholder="${tr('ritual.edit.desc.placeholder')}" /></label>

      <div class="input-field-label" style="margin-top:8px">${tr('ritual.edit.icon')} <small style="color:var(--muted);font-weight:500">${tr('ritual.edit.icon.hint')}</small></div>
      <div class="task-icon-picker" id="m-icon-picker">
        <button type="button" class="task-icon-opt ${!t.icon ? 'sel' : ''}" data-icon="" title="${tr('ritual.edit.icon.none')}">∅</button>
        ${TASK_ICONS.map(ic => `<button type="button" class="task-icon-opt ${ic === t.icon ? 'sel' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
      </div>
      <label class="input-field"><div class="input-field-label">${tr('ritual.edit.shift')}</div>
        <select id="m-shift">${shiftOpts}</select></label>
      <div class="input-field-label">${tr('ritual.edit.time')}</div>
      <button type="button" class="tp-trigger" id="m-time-trigger" data-time="${toHHMM(t.startTime) || ''}">
        <span class="tp-trigger-icon">🕐</span>
        <span class="tp-trigger-time">${toHHMM(t.startTime) || '— : —'}</span>
        <span class="tp-trigger-edit">›</span>
      </button>

      <label class="reminder-toggle">
        <input type="checkbox" id="m-reminder" ${t.reminderEnabled ? 'checked' : ''} />
        <span class="reminder-bell"></span>
        <div class="reminder-text">
          <span class="reminder-label">${tr('ritual.edit.reminder')}</span>
          <span class="reminder-hint">${tr('ritual.edit.reminder.hint')}</span>
        </div>
      </label>

      <div class="input-field-label" style="margin-top:8px">${tr('ritual.edit.recur')}</div>
      <button type="button" class="recur-btn" id="m-recur-btn">
        <span class="recur-btn-ic">🔁</span>
        <span class="recur-btn-text">${tr('recur.btn.title')}</span>
        <span class="recur-btn-label" id="m-recur-label">—</span>
        <span class="recur-btn-edit">›</span>
      </button>

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">${tr('ritual.edit.cancel')}</button>
        <button class="btn-primary" id="m-save">${tr('ritual.edit.save')}</button>
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
    if (recurState.recur === 'today') recurLabelEl.textContent = tr('recur.today.label');
    else if (recurState.recur === 'weekly') recurLabelEl.textContent = recurWeeklyLabel(day.date.getDay());
    else if (recurState.recur === 'daily') recurLabelEl.textContent = tr('recur.daily.label');
    else if (recurState.recur === 'monthly') {
      const dom = recurState.daysOfMonth?.length ? recurState.daysOfMonth : [day.date.getDate()];
      recurLabelEl.textContent = dom.length === 1 ? tr('recur.monthly.day.single', { day: dom[0] }) : tr('recur.monthly.day.multi', { days: dom.join(', ') });
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
    const saveBtn = modal.querySelector('#m-save');
    if (saveBtn?.disabled) return;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.6'; }
    const newTime = modal.querySelector('#m-time-trigger')?.dataset.time || '';
    const newKind = modal.querySelector('.kind-chip.active')?.dataset.kind || 'task';
    let newShiftId = modal.querySelector('#m-shift').value || null;

    // Compromisso exige horário
    if (newKind === 'commitment' && !newTime) {
      showToast('Compromisso precisa de horário', 'info');
      if (saveBtn?.isConnected) { saveBtn.disabled = false; saveBtn.style.opacity = ''; }
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
    const prevRecurType = t.recurrenceType || 'today';

    Object.assign(t, data);
    await updateDayTask(dayDocId, taskId, data);
    await propagateReminderToCategory(t.categoryId, t.reminderEnabled);
    await autoScheduleNotif(dayDocId, t);

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
    // Para 'weekly': garante recurrenceGroupId + salva template COM await
    if (recur === 'weekly') {
      const groupId = t.recurrenceGroupId || genRecurId();
      if (!t.recurrenceGroupId) {
        t.recurrenceGroupId = groupId;
        await updateDayTask(dayDocId, t.id, { recurrenceGroupId: groupId });
      }
      await syncTemplateForDay(dayDocId);
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
      // 'weekly' já sincronizou template com await acima; 'daily' usa fire-and-forget aqui
      updateDayCardStats(dayDocId, recur === 'daily');
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
      showToast(tr('recur.toast.daily'), 'success');
    } else if (recur === 'weekly') {
      showToast(tr('recur.toast.weekly', { day: recurWeeklyLabel(day.date.getDay()) }), 'success');
    } else if (recur === 'monthly') {
      const days = monthlyDays.length > 0 ? monthlyDays : [day.date.getDate()];
      const label = days.length === 1 ? tr('recur.monthly.day.single', { day: days[0] }) : tr('recur.monthly.day.multi', { days: days.join(', ') });
      showToast(tr('recur.toast.monthly', { label }), 'success');
    } else if (recur === 'today' && prevRecurType !== 'today') {
      showToast(tr('recur.toast.removed'), 'success');
    }

    // Propaga para as próximas 2 semanas usando +7 e +14 dias direto do dayDocId.
    // NÃO usa getDay() — elimina qualquer bug de timezone, dia da semana, etc.
    // Se karate está em 26/jun, vai para 26+7=03/jul e 26+14=10/jul. Simples.
    if (recur === 'weekly' && t.recurrenceGroupId) {
      const groupId = t.recurrenceGroupId;
      const [sy, sm, sd] = dayDocId.split('-').map(Number);

      for (let weeks = 1; weeks <= 2; weeks++) {
        // new Date(year, month-1, day) usa hora LOCAL — sem ambiguidade de UTC
        const targetDate = new Date(sy, sm - 1, sd + weeks * 7);
        const checkId = dayId(targetDate);
        if (weekData.some(d => d.id === checkId)) {
          const otherDay = weekData.find(d => d.id === checkId);
          const alreadyHas = otherDay.tasks.some(x => x.recurrenceGroupId === groupId);
          const excluded = (otherDay.meta?.excludedRecurrenceGroups || []).includes(groupId);
          if (!alreadyHas && !excluded) {
            try {
              const propagated = {
                activityId: t.activityId || null, title: t.title, desc: t.desc || '',
                kind: t.kind || 'task', startTime: t.startTime || '',
                shiftId: t.shiftId || null, categoryId: t.categoryId || null,
                icon: t.icon || '', reminderEnabled: t.reminderEnabled || false,
                done: false, recurrenceGroupId: groupId, recurrenceType: 'weekly', order: t.order ?? 0
              };
              const newId = await addDayTask(checkId, propagated);
              otherDay.tasks.push({ id: newId, ...propagated });
              const otherEl = document.querySelector(`.day-card[data-day-id="${checkId}"]`);
              if (otherEl) {
                otherEl.querySelector('.day-card-content').innerHTML = renderDayContent(otherDay);
                updateDayCardStats(checkId, false);
              }
            } catch (e) { console.error('[propagate-weekly-view]', e); }
          }
          continue;
        }
        try {
          const [chkMeta, chkTasks] = await Promise.all([getDay(checkId), getDayTasks(checkId)]);
          const excl = (chkMeta?.excludedRecurrenceGroups || []).includes(groupId);
          const has = chkTasks.some(x => x.recurrenceGroupId === groupId);
          if (!has && !excl) {
            await addDayTask(checkId, {
              activityId: t.activityId || null, title: t.title, desc: t.desc || '',
              kind: t.kind || 'task', startTime: t.startTime || '',
              shiftId: t.shiftId || null, categoryId: t.categoryId || null,
              icon: t.icon || '', reminderEnabled: t.reminderEnabled || false,
              done: false, recurrenceGroupId: groupId, recurrenceType: 'weekly', order: t.order ?? 0
            });
          }
        } catch (e) { console.error('[propagate-weekly-firestore]', checkId, e); }
      }
    }
  };
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 11: CELEBRAÇÃO — balões e confete ao completar todas as tarefas
// ═══════════════════════════════════════════════════════════════
function launchCelebration() {
  document.getElementById('celebration-kf')?.remove();
  const s = document.createElement('style');
  s.id = 'celebration-kf';
  s.textContent = `
    @keyframes confettiFall {
      0%   { transform: translateY(0) rotateZ(var(--r)); opacity:1; }
      85%  { opacity:1; }
      100% { transform: translateY(110vh) rotateZ(calc(var(--r) + 540deg)); opacity:0; }
    }
    @keyframes balloonRise {
      0%   { transform: translateY(0); }
      100% { transform: translateY(-150vh); }
    }
  `;
  document.head.appendChild(s);

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden';
  document.body.appendChild(overlay);

  // Confetes — círculos, estrelinhas SVG e fitinhas
  const confColors = ['#7c3aed','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#06b6d4','#a855f7','#f97316','#14b8a6'];
  const starPath = 'M10,0 L12.35,6.76 L19.51,6.91 L13.80,11.24 L15.88,18.09 L10,14 L4.12,18.09 L6.20,11.24 L0.49,6.91 L7.65,6.76 Z';

  for (let i = 0; i < 100; i++) {
    const color = confColors[i % confColors.length];
    const left  = Math.random() * 100;
    const rot   = Math.floor(Math.random() * 360);
    const delay = Math.random() * 1.8;
    const dur   = 2.2 + Math.random() * 2.0;
    const anim  = `confettiFall ${dur}s cubic-bezier(.25,.46,.45,.94) ${delay}s both`;
    const base  = `position:absolute;top:-24px;left:${left}%;--r:${rot}deg;animation:${anim};`;
    const kind  = i % 5;  // 0=círculo, 1=estrela, 2=círculo, 3=estrela, 4=fitinha

    if (kind === 1) {
      // estrela SVG
      const sz = 8 + Math.random() * 8;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('width', sz);
      svg.setAttribute('height', sz);
      svg.style.cssText = base;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', starPath);
      p.setAttribute('fill', color);
      svg.appendChild(p);
      overlay.appendChild(svg);
    } else if (kind === 4) {
      // fitinha — longa e fina, gira bastante
      const el = document.createElement('div');
      const w  = 2 + Math.random() * 2;
      const h  = 14 + Math.random() * 10;
      el.style.cssText = base + `width:${w}px;height:${h}px;background:${color};border-radius:1px;`;
      overlay.appendChild(el);
    } else {
      // círculo
      const sz = 5 + Math.random() * 7;
      const el = document.createElement('div');
      el.style.cssText = base + `width:${sz}px;height:${sz}px;background:${color};border-radius:50%;`;
      overlay.appendChild(el);
    }
  }

  // 8 balões coloridos em SVG — posições, tamanhos e timing aleatórios
  const balloonColors = ['#7c3aed','#10b981','#f59e0b','#3b82f6','#ef4444','#ec4899','#06b6d4','#f97316'];
  [5, 17, 29, 41, 53, 65, 77, 89].forEach((baseLeft, i) => {
    const left   = baseLeft + (Math.random() * 8 - 4);
    const sz     = 68 + Math.floor(Math.random() * 52);        // 68-120px
    const svgH   = Math.round(sz * 1.85);                      // altura total incluindo cordinha
    const startB = -(svgH + 20 + Math.floor(Math.random() * 120)); // começa totalmente fora da tela
    const delay  = Math.random() * 1.6;
    const dur    = 2.8 + Math.random() * 2.0;
    const zIdx   = Math.round(sz / 20);
    const c      = balloonColors[i];

    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;bottom:${startB}px;left:${left}%;z-index:${zIdx};animation:balloonRise ${dur}s ease-out ${delay}s both;`;
    wrap.innerHTML = `<svg width="${sz}" height="${svgH}" viewBox="0 0 60 111" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="28" rx="26" ry="28" fill="${c}"/>
      <ellipse cx="19" cy="15" rx="9" ry="7" fill="white" opacity="0.25"/>
      <ellipse cx="38" cy="12" rx="4" ry="3" fill="white" opacity="0.15"/>
      <polygon points="30,56 27,62 33,62" fill="${c}"/>
      <path d="M30 62 Q40 75 22 88 Q10 98 28 108" stroke="#555" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`;
    overlay.appendChild(wrap);
  });

  setTimeout(() => overlay.remove(), 5500);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 13: HELPERS UTILITÁRIOS (escape, conversões)
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
