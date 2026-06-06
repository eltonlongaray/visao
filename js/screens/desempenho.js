// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Desempenho — gráficos e extrato de aderência por categoria/semana/mês.
import {
  getCategories, fetchDaysRange, aggregateByCategory, aggregateTotal,
  sleepDuration, formatTime,
  getWeekNote, setWeekNote, dayId
} from '../store.js';
import { bottomNav } from '../components/bottom-nav.js';
import { isAdmin } from '../admin.js';
import { deleteWeek } from '../account-delete.js';
import { confirmModal, showToast } from '../toast.js';
import { playDelete } from '../sounds.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONSTANTES (labels)
// ═══════════════════════════════════════════════════════════════
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESTADO DO MÓDULO
// ═══════════════════════════════════════════════════════════════
let viewMonth = new Date();   // mês atualmente selecionado
let categories = [];
let period = 'mes';            // 'semana' | 'mes' | 'ano'
let monthChart = null;         // instância Chart.js
let catChart = null;
let handlersAttached = false;  // FIX: evita listeners duplicados

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ENTRY POINT — render da tela Desempenho
// ═══════════════════════════════════════════════════════════════
export async function renderDesempenho(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">Carregando desempenho...</div>`;
  try {
    categories = await getCategories();
  } catch (err) {
    app.innerHTML = errorBox(err);
    return;
  }
  await renderUI(app);
}

async function renderUI(app) {
  const monthLabel = MONTHS_FULL[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();

  app.innerHTML = `
    <div class="screen-pad">
      <div class="month-header">
        <button class="month-nav" data-nav="prev-month">‹</button>
        <div class="month-name">${monthLabel}<small>desempenho</small></div>
        <button class="month-nav" data-nav="next-month">›</button>
      </div>


      <div class="summary-top">
        <div class="summary-stats" id="kpis">
          <div class="summary-stat feitas"><div class="lbl">Feitas</div><div class="val">—</div></div>
          <div class="summary-stat pend"><div class="lbl">Pendentes</div><div class="val">—</div></div>
          <div class="summary-stat pct"><div class="lbl">Aderência</div><div class="val">—</div></div>
        </div>
        <div class="month-bar-chart"><canvas id="chart-months"></canvas></div>
      </div>

      <div class="tab-switch" id="period-tabs">
        <button class="tab-btn ${period==='semana'?'active':''}" data-period="semana">Esta semana</button>
        <button class="tab-btn ${period==='mes'?'active':''}" data-period="mes">Este mês</button>
        <button class="tab-btn ${period==='ano'?'active':''}" data-period="ano">Este ano</button>
      </div>

      <div class="chart-card">
        <div class="chart-title">% feito por categoria</div>
        <div class="chart-sub" id="cats-sub">carregando...</div>
        <div class="chart-wrap"><canvas id="chart-cats"></canvas></div>
      </div>

      <div class="records-header">
        <div class="records-title">📜 Trajetória semanal</div>
        <div class="records-sub">Todas as semanas registradas · toque pra expandir</div>
      </div>
      <div class="records-list" id="records-list">
        <div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">Carregando histórico...</div>
      </div>
    </div>
    ${bottomNav('desempenho')}
  `;

  attachHandlers(app);
  await refreshData();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: HANDLERS (nav de mês, troca de período, week cards)
// FIX: anexa só 1 vez por sessão (evita duplicação ao re-renderizar)
// ═══════════════════════════════════════════════════════════════
function attachHandlers(app) {
  if (handlersAttached) return;
  handlersAttached = true;

  // Toggle expand/collapse de cards de semana
  app.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-week]');
    if (!toggle) return;
    const id = toggle.dataset.toggleWeek;
    const card = toggle.closest('.week-card');
    if (openedWeeks.has(id)) { openedWeeks.delete(id); card.classList.remove('open'); }
    else { openedWeeks.add(id); card.classList.add('open'); }
  });

  // Save de nota semanal com debounce
  app.addEventListener('input', (e) => {
    const ta = e.target.closest('.week-note');
    if (!ta) return;
    const mondayId = ta.dataset.weekId;
    const note = ta.value;
    clearTimeout(noteSaveTimers[mondayId]);
    noteSaveTimers[mondayId] = setTimeout(() => {
      setWeekNote(mondayId, { note }).catch(err => console.error('[Visão] erro ao salvar nota:', err));
    }, 700);
  });

  app.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const dir = nav.dataset.nav;
      if (dir === 'prev-month') viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
      else if (dir === 'next-month') viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
      const monthLabel = MONTHS_FULL[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();
      document.querySelector('.month-name').firstChild.textContent = monthLabel;
      await refreshData();
      return;
    }
    const tab = e.target.closest('[data-period]');
    if (tab) {
      period = tab.dataset.period;
      document.querySelectorAll('#period-tabs .tab-btn').forEach(b => b.classList.toggle('active', b === tab));
      await refreshCatChart();
      return;
    }

    // ── ADMIN: excluir semana inteira ──
    const wkDel = e.target.closest('[data-admin-del-week]');
    if (wkDel && isAdmin()) {
      e.stopPropagation();
      const mondayId = wkDel.dataset.adminDelWeek;
      const ok = await confirmModal({
        title: `Excluir semana inteira?`,
        message: `Vai apagar todos os dias dessa semana (tarefas, sono, hidratação, reflexão). Esta ação não pode ser desfeita.`,
        confirmText: 'Sim, excluir',
        cancelText: 'Cancelar',
        danger: true
      });
      if (!ok) return;
      playDelete();
      wkDel.disabled = true;
      try {
        const n = await deleteWeek(mondayId);
        showToast(`Semana excluída (${n} dia${n===1?'':'s'} removido${n===1?'':'s'}).`, 'success');
        await refreshData();
      } catch (err) {
        console.error('[admin] delete week falhou:', err);
        showToast('Erro ao excluir semana.', 'error');
        wkDel.disabled = false;
      }
      return;
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: DATA FETCH + CÁLCULO DE AGREGADOS (mês selecionado)
// ═══════════════════════════════════════════════════════════════
async function refreshData() {
  // KPIs + month bar = sempre baseado no mês selecionado e os 4 anteriores
  // Categorias = baseado no period (semana/mes/6m)
  await Promise.all([refreshMonthData(), refreshCatChart(), refreshTabPercentages()]);
}

// Calcula a % de aderência geral pra cada período (semana/mês/ano) e atualiza os tabs
async function refreshTabPercentages() {
  const today = new Date();
  const year = today.getFullYear();

  // Pega o ano inteiro de uma vez (mais eficiente que 3 fetches separados)
  const yearStart = new Date(year, 0, 1);
  const allYearDays = await fetchDaysRange(yearStart, today);

  // Filtra subconjuntos
  const dow = today.getDay();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
  const monthStart = new Date(year, today.getMonth(), 1);

  const weekDays  = allYearDays.filter(d => new Date(d.id + 'T00:00:00') >= weekStart);
  const monthDays = allYearDays.filter(d => new Date(d.id + 'T00:00:00') >= monthStart);

  const weekPct  = aggregateTotal(weekDays).pct;
  const monthPct = aggregateTotal(monthDays).pct;
  const yearPct  = aggregateTotal(allYearDays).pct;

  // Atualiza os labels dos tabs com a porcentagem
  const tabs = document.querySelectorAll('#period-tabs .tab-btn');
  if (tabs.length >= 3) {
    tabs[0].innerHTML = `Esta semana <small class="tab-pct">${weekPct}%</small>`;
    tabs[1].innerHTML = `Este mês <small class="tab-pct">${monthPct}%</small>`;
    tabs[2].innerHTML = `Este ano <small class="tab-pct">${yearPct}%</small>`;
  }
}

async function refreshMonthData() {
  // Pega 5 meses (4 anteriores + atual) pra montar o bar chart
  const monthsBack = 4;
  const start = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - monthsBack, 1);
  const end = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0); // último dia do mês selecionado
  const allDays = await fetchDaysRange(start, end);

  // Agrupa por mês
  const monthsData = [];
  for (let i = monthsBack; i >= 0; i--) {
    const m = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - i, 1);
    const ymKey = `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`;
    const monthDays = allDays.filter(d => d.id.startsWith(ymKey));
    const agg = aggregateTotal(monthDays);
    monthsData.push({
      label: MONTHS[m.getMonth()],
      year: m.getFullYear(),
      month: m.getMonth(),
      ...agg
    });
  }

  // KPIs do mês selecionado
  const currentMonthAgg = monthsData[monthsData.length - 1];
  const kpis = document.getElementById('kpis');
  kpis.children[0].querySelector('.val').textContent = currentMonthAgg.done;
  kpis.children[1].querySelector('.val').textContent = currentMonthAgg.pendentes;
  kpis.children[2].querySelector('.val').textContent = currentMonthAgg.total ? currentMonthAgg.pct + '%' : '—';

  // Bar chart
  renderMonthChart(monthsData);

  // Extrato: trajetória semanal completa — TODAS as semanas que o usuário registrou.
  // Busca janela ampla (5 anos pra trás). Firestore retorna só docs existentes.
  const recordsStart = new Date(viewMonth.getFullYear() - 5, 0, 1);
  const recordsEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  fetchDaysRange(recordsStart, recordsEnd).then(allHistoryDays => {
    renderRecords(allHistoryDays);
  }).catch(err => console.error('[Visão] erro ao buscar histórico:', err));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: GRÁFICOS (Chart.js — barra de meses e categorias)
// ═══════════════════════════════════════════════════════════════
function renderMonthChart(monthsData) {
  const ctx = document.getElementById('chart-months');
  if (!ctx) return;
  if (monthChart) monthChart.destroy();
  monthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthsData.map(m => m.label),
      datasets: [{
        data: monthsData.map(m => m.pct),
        backgroundColor: monthsData.map((m, i) => i === monthsData.length - 1 ? '#34d399' : 'rgba(167,139,250,0.50)'),
        borderRadius: 6, borderSkipped: false, barThickness: 28
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (e, els) => {
        if (!els.length) return;
        const md = monthsData[els[0].index];
        viewMonth = new Date(md.year, md.month, 1);
        const monthLabel = MONTHS_FULL[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();
        document.querySelector('.month-name').firstChild.textContent = monthLabel;
        refreshData();
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y + '% feito' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8893b3', font: { size: 12, weight: '600' } } },
        y: { display: false, max: 100, beginAtZero: true }
      }
    }
  });
}

async function refreshCatChart() {
  // Determina o range do period
  const today = new Date();
  let start, end, sub;
  if (period === 'semana') {
    const dow = today.getDay(); // 0 = dom
    start = new Date(today); start.setDate(today.getDate() - dow);
    end = new Date(today);
    sub = `Esta semana — ${dow + 1} dia${dow > 0 ? 's' : ''}`;
  } else if (period === 'mes') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = today;
    sub = `Este mês — ${today.getDate()} dias`;
  } else { // ano
    start = new Date(today.getFullYear(), 0, 1); // 1º de janeiro
    end = today;
    sub = `Este ano · ${today.getFullYear()}`;
  }

  const days = await fetchDaysRange(start, end);
  const agg = aggregateByCategory(days, categories);

  // Constrói os datasets
  const labels = categories.map(c => c.name);
  const vals = categories.map(c => {
    const a = agg[c.id];
    return a && a.total ? Math.round(a.done / a.total * 100) : 0;
  });
  const colors = categories.map(c => c.color || '#a78bfa');

  // Categoria sem nada também mostra como "Outros" se houver tarefas sem categoria
  if (agg._none.total > 0) {
    labels.push('Sem categoria');
    vals.push(Math.round(agg._none.done / agg._none.total * 100));
    colors.push('#8893b3');
  }

  const ctx = document.getElementById('chart-cats');
  if (!ctx) return;
  if (catChart) catChart.destroy();

  document.getElementById('cats-sub').textContent = sub;

  if (labels.length === 0 || vals.every(v => v === 0)) {
    // empty state
    ctx.parentElement.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:12px;padding:30px 10px;line-height:1.5">
      📊 Sem dados ainda neste período.<br>
      <span style="font-size:11px">Vai pro <a href="#/ritual" style="color:var(--accent)">Ritual</a> e marca algumas tarefas pra ver os gráficos aqui.</span>
    </div>`;
    return;
  }

  // Altura dinâmica: cada barra ocupa ~38px (28 bar + 10 gap). Mínimo 200px.
  const dynamicHeight = Math.max(200, labels.length * 38 + 20);
  ctx.parentElement.style.height = dynamicHeight + 'px';

  catChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 8, borderSkipped: false, barThickness: 28 }] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x + '%' } } },
      scales: {
        x: { display: false, max: 100, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: '#8893b3', font: { size: 12 }, padding: 4 } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7.5: CARD DE QUALIDADE DO SONO
// Classificação: <6h ruim · 6–7h mínimo · 7–8h ideal · >8h desperdício
// ═══════════════════════════════════════════════════════════════
function refreshSleepCard(days, periodSub) {
  const card = document.getElementById('sleep-card');
  if (!card) return;
  const subEl = document.getElementById('sleep-sub');
  const bigEl = document.getElementById('sleep-big');
  const classEl = document.getElementById('sleep-class');
  const pointerEl = document.getElementById('sleep-pointer');

  // Coleta durações válidas
  const durations = [];
  for (const d of days) {
    if (d.wakeTime && d.sleepTime) {
      const dur = sleepDuration(d.sleepTime, d.wakeTime);
      if (dur && dur >= 60 && dur <= 16 * 60) durations.push(dur); // 1h a 16h sanity
    }
  }

  if (durations.length === 0) {
    subEl.textContent = `${periodSub} · sem dados`;
    bigEl.textContent = '—';
    classEl.textContent = 'Preencha "Acordei" e "Dormi" nos dias do Ritual';
    classEl.className = 'sleep-classification empty';
    pointerEl.style.left = '50%';
    return;
  }

  const avgMin = durations.reduce((s,x) => s+x, 0) / durations.length;
  const hrs = avgMin / 60;
  subEl.textContent = `${periodSub} · ${durations.length} ${durations.length === 1 ? 'dia' : 'dias'} com registro`;
  bigEl.textContent = formatDurationHM(avgMin);

  let cls, label;
  if (hrs < 6)       { cls = 'bad';   label = '😴 Ruim — abaixo do mínimo. Procure dormir mais.'; }
  else if (hrs < 7)  { cls = 'mid';   label = '⚠️ Mínimo — funcional mas longe do ideal.'; }
  else if (hrs <= 8) { cls = 'good';  label = '✅ Ideal — sono saudável.'; }
  else               { cls = 'waste'; label = '💤 Desperdício — pode estar dormindo em excesso.'; }
  classEl.textContent = label;
  classEl.className = 'sleep-classification ' + cls;

  // Pointer position: 0h→0%, 12h→100% (limita visual entre 4h e 12h)
  const clamped = Math.max(4, Math.min(12, hrs));
  const pct = ((clamped - 4) / 8) * 100;
  pointerEl.style.left = pct + '%';
}

function formatDurationHM(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2,'0')}min`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 8: EXTRATO SEMANAL (cards de semana com expand + reflexão)
//
// Agrupa dias em semanas (Segunda → Domingo). Cada semana mostra:
//  - % geral, melhor/pior dia, pontos fracos
//  - Click → expande dia-a-dia + textarea pra reflexão
// ═══════════════════════════════════════════════════════════════
const noteSaveTimers = {};
const openedWeeks = new Set();

function getMondayOfDate(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}
async function renderRecords(days) {
  const box = document.getElementById('records-list');
  if (!days.length) {
    box.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px;border:1px dashed var(--border);border-radius:12px">
      📝 Ainda sem histórico semanal.<br>
      <span style="font-size:11px;margin-top:4px;display:inline-block">Marque tarefas no <a href="#/ritual" style="color:var(--accent)">Ritual</a> pra ver sua trajetória aqui.</span>
    </div>`;
    return;
  }

  // Agrupa dias por semana (Monday id)
  const weeks = new Map();
  for (const d of days) {
    const date = new Date(d.id + 'T00:00:00');
    const monday = getMondayOfDate(date);
    const mondayId = dayId(monday);
    if (!weeks.has(mondayId)) weeks.set(mondayId, { monday, days: [] });
    weeks.get(mondayId).days.push({ ...d, date });
  }

  // Ordena semanas mais recente primeiro
  const sortedWeeks = Array.from(weeks.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  // Busca todas as notas em paralelo
  const notes = await Promise.all(sortedWeeks.map(([id]) => getWeekNote(id).catch(() => null)));

  // Agrupa semanas por ANO da segunda-feira
  const byYear = new Map();
  for (let i = 0; i < sortedWeeks.length; i++) {
    const [mondayId, week] = sortedWeeks[i];
    const year = week.monday.getFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({ mondayId, week, note: notes[i] });
  }
  // Ordem: ano mais recente primeiro
  const sortedYears = Array.from(byYear.keys()).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();

  let html = '';
  for (const year of sortedYears) {
    const list = byYear.get(year);
    // Calcula stats agregadas do ano
    let yearDone = 0, yearTotal = 0;
    for (const { week } of list) {
      for (const d of week.days) {
        yearDone += d.tasks.filter(t => t.done).length;
        yearTotal += d.tasks.length;
      }
    }
    const yearPct = yearTotal ? Math.round(yearDone / yearTotal * 100) : 0;
    const isPast = year < currentYear;
    html += `
      <div class="year-section ${isPast ? 'past-year' : ''}">
        <div class="year-header">
          <span class="year-icon">📅</span>
          <span class="year-label">${year}${isPast ? '' : ' · em andamento'}</span>
          <span class="year-stats">${list.length} ${list.length === 1 ? 'semana' : 'semanas'} · ${yearPct}%</span>
        </div>
        <div class="year-weeks">
          ${list.map(({ mondayId, week, note }) => renderWeekCard(mondayId, week, note)).join('')}
        </div>
      </div>
    `;
  }
  box.innerHTML = html;
}

function renderWeekCard(mondayId, { monday, days }, weekNote) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const isOpen = openedWeeks.has(mondayId);

  let totalDone = 0, totalTasks = 0;
  let bestDay = null, worstDay = null;
  for (const d of days) {
    const done = d.tasks.filter(t => t.done).length;
    const total = d.tasks.length;
    totalDone += done;
    totalTasks += total;
    if (total > 0) {
      const dayPct = done / total;
      if (!bestDay || dayPct > bestDay.pct) bestDay = { date: d.date, pct: dayPct };
      if (!worstDay || dayPct < worstDay.pct) worstDay = { date: d.date, pct: dayPct };
    }
  }
  const pct = totalTasks ? Math.round(totalDone / totalTasks * 100) : 0;
  const cls = pct >= 80 ? 'high' : pct >= 60 ? 'mid' : 'low';

  // Pontos fracos/fortes: agrupa por ATIVIDADE individual (categoria + título)
  // Antes era por categoria, mas isso escondia qual tarefa específica falhava
  // dentro de cada ritual (ex: "Noturno" tem 3-4 tarefas — qual delas é o problema?)
  const actAgg = {};
  for (const d of days) {
    for (const t of d.tasks) {
      if (!t.title || !t.categoryId) continue;
      const key = `${t.categoryId}|${t.title}`;
      if (!actAgg[key]) {
        actAgg[key] = {
          title: t.title,
          cat: categories.find(c => c.id === t.categoryId),
          done: 0, total: 0
        };
      }
      actAgg[key].total++;
      if (t.done) actAgg[key].done++;
    }
  }
  const actsArr = Object.values(actAgg)
    .filter(a => a.cat && a.total >= 2)
    .map(a => ({ ...a, pct: a.done / a.total }));

  const weakest = actsArr
    .filter(a => a.pct < 0.7)
    .sort((a, b) => a.pct - b.pct || b.total - a.total)
    .slice(0, 3);

  const strongest = actsArr
    .filter(a => a.pct >= 0.7)
    .sort((a, b) => b.pct - a.pct || b.total - a.total)
    .slice(0, 3);

  // Display: categoria (colorida + ícone) · descrição da tarefa · (feito/total)
  // Se descrição == nome da categoria (tarefa única tipo "Hidratação"), evita repetir
  const fmtAct = (a) => {
    const catLabel = `<span style="color:${a.cat.color};font-weight:700">${a.cat.icon || ''} ${escape(a.cat.name)}</span>`;
    const same = a.title.trim().toLowerCase() === (a.cat.name || '').trim().toLowerCase();
    const descLabel = same ? '' : ` <span style="opacity:0.85">· ${escape(a.title)}</span>`;
    const count = ` <small style="color:var(--muted)">(${a.done}/${a.total})</small>`;
    return catLabel + descLabel + count;
  };

  const rangeLabel = `${String(monday.getDate()).padStart(2,'0')} ${MONTHS[monday.getMonth()]} → ${String(sunday.getDate()).padStart(2,'0')} ${MONTHS[sunday.getMonth()]}`;

  return `
    <div class="week-card ${isOpen ? 'open' : ''}" data-week-id="${mondayId}">
      ${isAdmin() ? `<button class="week-admin-del" data-admin-del-week="${mondayId}" title="Excluir semana (admin)">×</button>` : ''}
      <button class="week-card-header" data-toggle-week="${mondayId}">
        <div class="week-card-title">
          <div class="week-range">${rangeLabel}</div>
          <div class="week-sub">${days.length} dia${days.length === 1 ? '' : 's'} com registro</div>
        </div>
        <div class="week-card-stats">
          <span class="pct ${cls}">${pct}%</span>
          <small>${totalDone}/${totalTasks}</small>
        </div>
        <span class="week-card-chevron">▾</span>
      </button>
      <div class="week-card-content">
        <div class="week-insights">
          ${bestDay ? `<div class="week-insight"><span class="ins-icon">🏆</span> Melhor dia: <strong>${WEEKDAYS[bestDay.date.getDay()]}</strong> (${Math.round(bestDay.pct*100)}%)</div>` : ''}
          ${worstDay ? `<div class="week-insight"><span class="ins-icon">💪</span> Pior dia: <strong>${WEEKDAYS[worstDay.date.getDay()]}</strong> (${Math.round(worstDay.pct*100)}%)</div>` : ''}
          ${strongest.length ? `<div class="week-insight"><span class="ins-icon">⭐</span> Pontos fortes: ${strongest.map(fmtAct).join(' · ')}</div>` : ''}
          ${weakest.length ? `<div class="week-insight"><span class="ins-icon">⚠️</span> Pontos fracos: ${weakest.map(fmtAct).join(' · ')}</div>` : ''}
        </div>

        ${renderWeekSleep(days)}

        <div class="week-days-list">
          ${days.sort((a,b) => a.date - b.date).map(d => renderDayCompactRow(d)).join('')}
        </div>

        <div class="week-note-box">
          <label class="week-note-label">📝 Reflexão da semana — o que melhorar?</label>
          <textarea class="week-note" data-week-id="${mondayId}" placeholder="Olhando os dados acima: que ajustes posso fazer pra próxima semana?">${escape(weekNote?.note || '')}</textarea>
        </div>
      </div>
    </div>
  `;
}

function renderWeekSleep(days) {
  const durations = [];
  let totalDaySleep = 0;    // soma de horas de cochilo nas notas
  let totalNightAwake = 0;  // soma de horas acordado na madrugada
  let notesCount = 0;
  for (const d of days) {
    if (d.wakeTime && d.sleepTime) {
      const dur = sleepDuration(d.sleepTime, d.wakeTime);
      if (dur && dur >= 60 && dur <= 16 * 60) durations.push(dur);
    }
    // fetchDaysRange achata os dados no root
    const n = d.dayNote ?? d.meta?.dayNote;
    if (n) {
      if (typeof n.daySleepHours === 'number') totalDaySleep += n.daySleepHours;
      const naw = n.nightAwakeHours ?? n.nightWakes;
      if (typeof naw === 'number') totalNightAwake += naw;
      if (n.prideFail || n.improve || n.daySleepHours || naw) notesCount++;
    }
  }

  // Desconta horas acordado na madrugada do tempo em cama
  const nightAwakeMin = totalNightAwake * 60;

  // Card extra das notas (mesmo sem horários registrados)
  const notesCard = (totalDaySleep > 0 || totalNightAwake > 0) ? `
    <div class="sleep-extra">
      ${totalDaySleep > 0 ? `<div class="sleep-extra-row">😴 <strong>${totalDaySleep}h</strong> de cochilo durante o dia (semana)</div>` : ''}
      ${totalNightAwake > 0 ? `<div class="sleep-extra-row">🌃 <strong>${totalNightAwake}h</strong> acordado(a) na madrugada (semana)</div>` : ''}
    </div>
  ` : '';

  if (durations.length === 0) {
    return `<div class="week-sleep empty">🌙 Sono — sem registros nesta semana</div>${notesCard}`;
  }
  const totalMinRaw = durations.reduce((s,x) => s+x, 0);
  // Soma cochilos do dia e desconta madrugada acordado(a)
  const daySleepMin = totalDaySleep * 60;
  const totalMin = Math.max(0, totalMinRaw - nightAwakeMin + daySleepMin);
  const avg = totalMin / durations.length;
  const hrs = avg / 60;
  const totalHrs = totalMin / 60;

  // Total de horas registradas no app: dias com QUALQUER atividade × 24
  // (sono, cochilo, despertares OU pelo menos 1 tarefa registrada)
  const registeredDays = days.filter(d => {
    const note = d.dayNote ?? d.meta?.dayNote;
    return (d.wakeTime || d.sleepTime ||
            (d.tasks && d.tasks.length > 0) ||
            (note && (note.prideFail || note.improve || note.daySleepHours || note.nightAwakeHours || note.nightWakes)));
  }).length;
  const trackedHrs = Math.max(1, registeredDays * 24);
  const pctOfWeek = Math.round((totalHrs / trackedHrs) * 100);

  let cls, label, emoji;
  if (hrs < 6)       { cls = 'bad';   label = 'ruim';        emoji = '😴'; }
  else if (hrs <= 8) { cls = 'good';  label = 'ideal';       emoji = '✅'; }
  else               { cls = 'waste'; label = 'desperdício'; emoji = '💤'; }
  const clamped = Math.max(4, Math.min(12, hrs));
  const pointerPct = ((clamped - 4) / 8) * 100;
  return `
    <div class="week-sleep">
      <div class="week-sleep-top">
        <div class="week-sleep-label">🌙 Sono médio</div>
        <div class="week-sleep-value">${formatDurationHM(avg)}</div>
        <div class="sleep-classification ${cls}">${emoji} ${label}</div>
      </div>
      <div class="week-sleep-total">
        Você dormiu <strong>${formatDurationHM(totalMin)}</strong> ao longo dos
        ${durations.length} dia${durations.length === 1 ? '' : 's'} registrado${durations.length === 1 ? '' : 's'} —
        <small>de <strong>${trackedHrs}h</strong> registradas no app (${pctOfWeek}%)</small>
      </div>
      <div class="scale-marks scale-marks-3">
        <span><strong>&lt;6h</strong></span>
        <span><strong>6h - 8h</strong></span>
        <span><strong>8h+</strong></span>
      </div>
      <div class="scale-bar">
        <div class="scale-seg bad" style="flex:2"></div>
        <div class="scale-seg good" style="flex:2"></div>
        <div class="scale-seg waste" style="flex:1"></div>
        <div class="scale-pointer" style="left:${pointerPct}%"></div>
      </div>
      <div class="week-sleep-meta">ideal entre 6h e 8h por dia</div>
    </div>
    ${notesCard}
  `;
}

function renderDayCompactRow(d) {
  const done = d.tasks.filter(t => t.done).length;
  const total = d.tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const cls = pct >= 80 ? 'high' : pct >= 60 ? 'mid' : 'low';
  return `<div class="week-day-row">
    <div class="week-day-name">${WEEKDAYS[d.date.getDay()]}</div>
    <div class="week-day-date">${String(d.date.getDate()).padStart(2,'0')} ${MONTHS[d.date.getMonth()]}</div>
    <div class="week-day-bar"><div class="week-day-fill ${cls}" style="width:${pct}%"></div></div>
    <div class="week-day-pct ${cls}">${pct}%</div>
  </div>`;
}

function recordRow(t) {
  const cat = categories.find(c => c.id === t.categoryId);
  const icon = cat?.icon || '○';
  const bg = cat?.color ? hexA(cat.color, 0.18) : 'rgba(255,255,255,0.04)';
  return `<div class="record-row">
    <div class="record-icon" style="background:${bg}">${icon}</div>
    <div class="record-body">
      <div class="record-title">${escape(t.title || 'Sem título')}</div>
      <div class="record-cat">${cat ? escape(cat.name) : 'Sem categoria'}</div>
    </div>
    <div class="record-status ${t.done ? 'ok' : 'no'}">${t.done ? 'FEITO' : 'PEND'}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 9: HELPERS UTILITÁRIOS (error box, escape, hex)
// ═══════════════════════════════════════════════════════════════
function errorBox(err) {
  return `<div style="padding:40px 16px;text-align:center">
    <p style="color:var(--red);font-weight:600">Erro ao carregar.</p>
    <p style="color:var(--muted);font-size:12px;margin-top:8px">${err.message || ''}</p>
  </div>`;
}

function escape(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function hexA(hex, a) {
  if (!hex) return `rgba(167,139,250,${a})`;
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0,2), 16), g = parseInt(m[1].slice(2,4), 16), b = parseInt(m[1].slice(4,6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
