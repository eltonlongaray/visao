// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — HELPERS DE DATA (Intl — funciona em qualquer idioma)
// BLOCO 3 — ESTADO DO MÓDULO
// BLOCO 4 — ENTRY POINT — render da tela Desempenho
// BLOCO 5 — HANDLERS (nav de mês, troca de período, week cards)
// BLOCO 6 — DATA FETCH + CÁLCULO DE AGREGADOS (mês selecionado)
// BLOCO 7 — GRÁFICOS (Chart.js — barra de meses e categorias)
// BLOCO 7.5 — CARD DE QUALIDADE DO SONO
// BLOCO 8 — EXTRATO SEMANAL (cards de semana com expand + reflexão)
// BLOCO 8.5 — SCORE DE CONSISTÊNCIA
// BLOCO 8.6 — DETALHES DE CONSTÂNCIA — dias falhos por período
// BLOCO 9 — HELPERS UTILITÁRIOS (error box, escape, hex)
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Desempenho — gráficos e extrato de aderência por categoria/semana/mês.
import {
  getCategories, fetchDaysRange, aggregateByCategory, aggregateTotal,
  sleepDuration, formatTime,
  getWeekNote, setWeekNote, dayId, getProfile
} from '../banco-dados.js';
import { calcularConstancia, isActiveDay } from '../metricas-constancia.js';
import { renderDesafiosDoDesempenho } from '../desempenho-desafios.js';
import { carregarRegistros } from '../corpo.js';
import { bottomNav } from '../components/menu-inferior.js';
import { isAdmin } from '../permissao-admin.js';
import { deleteWeek } from '../excluir-conta.js';
import { confirmModal, showToast } from '../aviso-tela.js';
import { playDelete } from '../sons.js';
import { t, getLang } from '../idioma.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: HELPERS DE DATA (Intl — funciona em qualquer idioma)
// ═══════════════════════════════════════════════════════════════
const _cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function _wdShort(d) { return _cap(new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(d).replace(/\./g, '')); }
function _moShort(d) { return _cap(new Intl.DateTimeFormat(getLang(), { month:   'short' }).format(d).replace(/\./g, '')); }
function _moFull(d)  { return _cap(new Intl.DateTimeFormat(getLang(), { month:   'long'  }).format(d)); }


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESTADO DO MÓDULO
// ═══════════════════════════════════════════════════════════════
let viewMonth = new Date();   // mês atualmente selecionado
let categories = [];
let period = 'mes';            // 'semana' | 'mes' | 'ano'
let monthChart = null;         // instância Chart.js
let catChart = null;
let handlersAttached = false;  // FIX: evita listeners duplicados
let userProfile = null;        // cache do perfil (streakOrigin)

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ENTRY POINT — render da tela Desempenho
// ═══════════════════════════════════════════════════════════════
export async function renderDesempenho(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">${t('desempenho.loading')}</div>`;
  try {
    categories = await getCategories();
  } catch (err) {
    app.innerHTML = errorBox(err);
    return;
  }
  await renderUI(app);
}

async function renderUI(app) {
  const monthLabel = _moFull(viewMonth) + ' ' + viewMonth.getFullYear();

  app.innerHTML = `
    <div class="screen-pad">
      <div class="month-header">
        <button class="month-nav" data-nav="prev-month">‹</button>
        <div class="month-name">${monthLabel}<small>${t('desempenho.label')}</small></div>
        <button class="month-nav" data-nav="next-month">›</button>
      </div>


      <div class="summary-top">
        <div class="summary-stats" id="kpis">
          <div class="summary-stat feitas"><div class="lbl">${t('desempenho.kpi.done')}</div><div class="val">—</div></div>
          <div class="summary-stat pend"><div class="lbl">${t('desempenho.kpi.pending')}</div><div class="val">—</div></div>
          <div class="summary-stat pct"><div class="lbl">${t('desempenho.kpi.adherence')}</div><div class="val">—</div></div>
        </div>
        <div class="month-bar-chart"><canvas id="chart-months"></canvas></div>
      </div>

      <div class="consistency-card" id="consistency-card">
        <div class="con-title">${t('desempenho.consistency.title')}</div>
        <div class="con-row">
          <div class="con-item">
            <div class="con-val con-cold" id="streak-current">—</div>
            <div class="con-lbl">${t('desempenho.streak.days')}</div>
            <div class="con-sub" id="streak-current-sub">${t('desempenho.streak.cur.sub')}</div>
          </div>
          <div class="con-divider"></div>
          <div class="con-item">
            <div class="con-val" id="streak-longest">—</div>
            <div class="con-lbl">${t('desempenho.streak.record.lbl')}</div>
            <div class="con-sub">${t('desempenho.streak.record.sub')}</div>
          </div>
          <div class="con-divider"></div>
          <div class="con-item">
            <div class="con-val" id="streak-rate">—</div>
            <div class="con-lbl">${t('desempenho.streak.rate.lbl')}</div>
            <div class="con-sub" id="streak-rate-sub">${t('desempenho.streak.rate.sub')}</div>
          </div>
        </div>
        <div id="con-details"></div>
      </div>

      <div id="desafios-desempenho"></div>

      <div id="corpo-evolucao"></div>

      <div class="tab-switch" id="period-tabs">
        <button class="tab-btn ${period==='semana'?'active':''}" data-period="semana">${t('desempenho.period.week')}</button>
        <button class="tab-btn ${period==='mes'?'active':''}" data-period="mes">${t('desempenho.period.month')}</button>
        <button class="tab-btn ${period==='ano'?'active':''}" data-period="ano">${t('desempenho.period.year')}</button>
      </div>

      <div class="chart-card">
        <div class="chart-title">${t('desempenho.chart.pct.title')}</div>
        <div class="chart-sub" id="cats-sub">${t('desempenho.chart.loading')}</div>
        <div class="chart-wrap"><canvas id="chart-cats"></canvas></div>
      </div>

      <div class="records-header">
        <div class="records-title">${t('desempenho.records.title')}</div>
        <div class="records-sub">${t('desempenho.records.sub')}</div>
      </div>
      <div class="records-list" id="records-list">
        <div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">${t('desempenho.records.loading')}</div>
      </div>
    </div>
    ${bottomNav('desempenho')}
  `;

  attachHandlers(app);
  await refreshData();
  renderCorpoEvolucao();
}

// ── Evolução da composição corporal (do 1º registro ao atual) ──
async function renderCorpoEvolucao() {
  const el = document.getElementById('corpo-evolucao');
  if (!el) return;
  let regs = [];
  try { regs = await carregarRegistros(); } catch { regs = []; }
  if (!regs.length) {
    el.innerHTML = `<div class="ce-card ce-vazio">
      <div class="ce-tit">💪 Composição corporal</div>
      <div class="ce-sub">Registre suas medidas no <b>Cálculo de massa corporal</b> (Ajustes) pra acompanhar sua evolução aqui — % de gordura, massa magra, cintura e mais.</div>
    </div>`;
    return;
  }
  const _1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toString().replace('.', ','));
  const comp = (r) => (r.peso && r.gordura_pct != null) ? { magra: r.peso - r.peso * r.gordura_pct / 100 } : null;
  const atual = regs[0], primeiro = regs[regs.length - 1];
  // modo: 'menor' = cair é bom; 'maior' = subir é bom; 'neutro' = sem cor
  const metrica = (lbl, va, vp, un, modo) => {
    if (va == null) return '';
    let delta = '';
    if (regs.length > 1 && vp != null) {
      const d = Math.round((va - vp) * 10) / 10;
      const arrow = d === 0 ? '→' : (d > 0 ? '↑' : '↓');
      let cls = 'neutro';
      if (modo === 'menor') cls = d < 0 ? 'bom' : (d > 0 ? 'ruim' : 'neutro');
      else if (modo === 'maior') cls = d > 0 ? 'bom' : (d < 0 ? 'ruim' : 'neutro');
      delta = `<span class="ce-delta ce-${cls}">${arrow} ${_1(Math.abs(d))}${un}</span>`;
    }
    return `<div class="ce-linha"><span class="ce-lbl">${lbl}</span><span class="ce-val">${_1(va)}${un}${delta}</span></div>`;
  };
  const ca = comp(atual), cp = comp(primeiro);
  const desde = new Date(primeiro.data + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  el.innerHTML = `
    <div class="ce-card">
      <div class="ce-tit">💪 Composição corporal</div>
      <div class="ce-sub">${regs.length} ${regs.length === 1 ? 'medição' : 'medições'} · desde ${desde}</div>
      ${metrica('Peso', atual.peso, primeiro.peso, ' kg', 'neutro')}
      ${metrica('% de gordura', atual.gordura_pct, primeiro.gordura_pct, '%', 'menor')}
      ${ca ? metrica('Massa magra', ca.magra, cp && cp.magra, ' kg', 'maior') : ''}
      ${metrica('Cintura', atual.cintura, primeiro.cintura, ' cm', 'menor')}
    </div>`;
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
      const monthLabel = _moFull(viewMonth) + ' ' + viewMonth.getFullYear();
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
  await Promise.all([refreshMonthData(), refreshCatChart()]);
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
      label: _moShort(m),
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
  fetchDaysRange(recordsStart, recordsEnd).then(async allHistoryDays => {
    if (!userProfile) userProfile = await getProfile().catch(() => null);
    renderRecords(allHistoryDays);
    const streakData = calcularConstancia(allHistoryDays, userProfile?.streakOrigin || null);
    renderStreakCard(streakData);
    renderConstanciaDetails(allHistoryDays, userProfile?.streakOrigin || null, streakData);
  }).catch(err => console.error('[Visão] erro ao buscar histórico:', err));

  // Desafios entram por último e sem await: é informação extra, não pode
  // atrasar o que o usuário veio ver.
  renderDesafiosDoDesempenho(document.getElementById('desafios-desempenho'));
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
        const monthLabel = _moFull(viewMonth) + ' ' + viewMonth.getFullYear();
        document.querySelector('.month-name').firstChild.textContent = monthLabel;
        refreshData();
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y + `% ${t('desempenho.chart.done')}` } } },
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
    const n1 = dow + 1;
    sub = `${t('desempenho.period.week')} — ${n1} ${n1 === 1 ? t('desempenho.day') : t('desempenho.days')}`;
  } else if (period === 'mes') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = today;
    const n2 = today.getDate();
    sub = `${t('desempenho.period.month')} — ${n2} ${n2 === 1 ? t('desempenho.day') : t('desempenho.days')}`;
  } else { // ano
    start = new Date(today.getFullYear(), 0, 1); // 1º de janeiro
    end = today;
    sub = `${t('desempenho.period.year')} · ${today.getFullYear()}`;
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
      layout: { padding: { right: 30 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x + '%' } } },
      scales: {
        x: { display: false, max: 100, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: '#8893b3', font: { size: 12 }, padding: 4 } }
      }
    },
    plugins: [{
      // Desenha a % dentro da barra (ou logo após se a barra for muito pequena)
      id: 'inBarPct',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = '700 12px -apple-system, "Segoe UI", Roboto, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        meta.data.forEach((bar, i) => {
          const value = chart.data.datasets[0].data[i];
          const text = value + '%';
          const tw = ctx.measureText(text).width;
          const barLen = bar.x - bar.base;
          let x, fill;
          if (barLen >= tw + 14) {
            // Cabe dentro: texto à direita da barra com pequeno padding
            x = bar.x - tw - 8;
            fill = '#ffffff';
          } else {
            // Não cabe: texto fora à direita, na cor da barra
            x = bar.x + 6;
            fill = chart.data.datasets[0].backgroundColor[i] || '#888';
          }
          ctx.fillStyle = fill;
          ctx.fillText(text, x, bar.y);
        });
        ctx.restore();
      }
    }]
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

  // Mapa id→doc para lookup cross-day no cálculo de sono
  const dayMap = new Map(days.map(d => [d.id, d]));

  // Agrupa dias por semana (Monday id)
  const weeks = new Map();
  for (const d of days) {
    const date = new Date(d.id + 'T00:00:00');
    const monday = getMondayOfDate(date);
    const mondayId = dayId(monday);
    if (!weeks.has(mondayId)) weeks.set(mondayId, { monday, days: [] });
    weeks.get(mondayId).days.push({ ...d, date });
  }

  // Filtra semanas futuras (só mostra semana atual pra trás) e ordena mais recente primeiro
  const currentMondayId = dayId(getMondayOfDate(new Date()));
  const sortedWeeks = Array.from(weeks.entries())
    .filter(([mondayId]) => mondayId <= currentMondayId)
    .sort((a, b) => b[0].localeCompare(a[0]));

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
          <span class="year-label">${year}${isPast ? '' : ' · ' + t('desempenho.year.ongoing')}</span>
          <span class="year-stats">${list.length} ${list.length === 1 ? t('desempenho.week.s') : t('desempenho.weeks.s')} · ${yearPct}%</span>
        </div>
        <div class="year-weeks">
          ${list.map(({ mondayId, week, note }) => renderWeekCard(mondayId, week, note, dayMap)).join('')}
        </div>
      </div>
    `;
  }
  box.innerHTML = html;
}

function renderWeekCard(mondayId, { monday, days }, weekNote, dayMap) {
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

  const rangeLabel = `${String(monday.getDate()).padStart(2,'0')} ${_moShort(monday)} → ${String(sunday.getDate()).padStart(2,'0')} ${_moShort(sunday)}`;

  return `
    <div class="week-card ${isOpen ? 'open' : ''}" data-week-id="${mondayId}">
      ${isAdmin() ? `<button class="week-admin-del" data-admin-del-week="${mondayId}" title="Excluir semana (admin)">×</button>` : ''}
      <button class="week-card-header" data-toggle-week="${mondayId}">
        <div class="week-card-title">
          <div class="week-range">${rangeLabel}</div>
          <div class="week-sub">${days.length} ${days.length === 1 ? t('desempenho.day') : t('desempenho.days')} ${t('desempenho.with.record')}</div>
        </div>
        <div class="week-card-stats">
          <span class="pct ${cls}">${pct}%</span>
          <small>${totalDone}/${totalTasks}</small>
        </div>
        <span class="week-card-chevron">▾</span>
      </button>
      <div class="week-card-content">
        <div class="week-insights">
          ${bestDay ? `<div class="week-insight"><span class="ins-icon">🏆</span> ${t('desempenho.week.best')} <strong>${_wdShort(bestDay.date)}</strong> (${Math.round(bestDay.pct*100)}%)</div>` : ''}
          ${worstDay ? `<div class="week-insight"><span class="ins-icon">💪</span> ${t('desempenho.week.worst')} <strong>${_wdShort(worstDay.date)}</strong> (${Math.round(worstDay.pct*100)}%)</div>` : ''}
          ${strongest.length ? `<div class="week-insight"><span class="ins-icon">⭐</span> ${t('desempenho.week.strong')} ${strongest.map(fmtAct).join(' · ')}</div>` : ''}
          ${weakest.length ? `<div class="week-insight"><span class="ins-icon">⚠️</span> ${t('desempenho.week.weak')} ${weakest.map(fmtAct).join(' · ')}</div>` : ''}
        </div>

        ${renderWeekSleep(days, dayMap)}

        <div class="week-days-list">
          ${days.sort((a,b) => a.date - b.date).map(d => renderDayCompactRow(d)).join('')}
        </div>

        <div class="week-note-box">
          <label class="week-note-label">${t('desempenho.week.note.label')}</label>
          <textarea class="week-note" data-week-id="${mondayId}" placeholder="${t('desempenho.week.note.placeholder')}">${escape(weekNote?.note || '')}</textarea>
        </div>
      </div>
    </div>
  `;
}

function renderWeekSleep(days, dayMap) {
  const durations = [];
  let totalDaySleep = 0;    // soma de horas de cochilo nas notas
  let totalNightAwake = 0;  // soma de horas acordado na madrugada
  let notesCount = 0;
  for (const d of days) {
    // Sono real = sleepTime do dia ANTERIOR → wakeTime deste dia
    const prev = dayMap?.get(prevId(d.id));
    if (d.wakeTime && prev?.sleepTime) {
      const dur = sleepDuration(prev.sleepTime, d.wakeTime);
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
      ${totalDaySleep > 0 ? `<div class="sleep-extra-row">${t('desempenho.sleep.nap', { h: totalDaySleep })}</div>` : ''}
      ${totalNightAwake > 0 ? `<div class="sleep-extra-row">${t('desempenho.sleep.woke', { h: totalNightAwake })}</div>` : ''}
    </div>
  ` : '';

  if (durations.length === 0) {
    return `<div class="week-sleep empty">${t('desempenho.sleep.empty')}</div>${notesCard}`;
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
        <div class="week-sleep-label">🌙 ${t('desempenho.sleep.avg')}</div>
        <div class="week-sleep-value">${formatDurationHM(avg)}</div>
        <div class="sleep-classification ${cls}">${emoji} ${label}</div>
      </div>
      <div class="week-sleep-total">
        ${t('desempenho.sleep.total', { total: formatDurationHM(totalMin), days: durations.length })} —
        <small>${t('desempenho.sleep.registered', { hours: trackedHrs, pct: pctOfWeek })}</small>
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
      <div class="week-sleep-meta">${t('desempenho.sleep.ideal')}</div>
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
    <div class="week-day-name">${_wdShort(d.date)}</div>
    <div class="week-day-date">${String(d.date.getDate()).padStart(2,'0')} ${_moShort(d.date)}</div>
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
// BLOCO 8.5: SCORE DE CONSISTÊNCIA
// Sequência atual, recorde e taxa — usa hasActivity + dados reais.
// Docs sem atividade (auto-gerados) não contam como dia ativo.
// ═══════════════════════════════════════════════════════════════
function renderStreakCard({ current, longest, rate, totalRegistered, totalDays }) {
  const curEl = document.getElementById('streak-current');
  const curSub = document.getElementById('streak-current-sub');
  const lonEl = document.getElementById('streak-longest');
  const ratEl = document.getElementById('streak-rate');
  const ratSub = document.getElementById('streak-rate-sub');
  if (!curEl) return;

  curEl.textContent = current > 0 ? `${current}d` : '0';
  curEl.className = 'con-val ' + (current >= 14 ? 'con-fire' : current >= 7 ? 'con-hot' : current >= 3 ? 'con-warm' : 'con-cold');

  const streakMsg = current >= 14 ? t('desempenho.streak.fire') : current >= 7 ? t('desempenho.streak.week') : current >= 3 ? t('desempenho.streak.going') : current === 1 ? t('desempenho.streak.restart') : t('desempenho.streak.resume');
  curSub.textContent = streakMsg;

  lonEl.textContent = longest > 0 ? `${longest}d` : '—';
  ratEl.textContent = totalDays > 0 ? `${rate}%` : '—';
  if (ratSub) ratSub.textContent = `${totalRegistered} de ${totalDays} dias`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.6: DETALHES DE CONSTÂNCIA — dias falhos por período
// ═══════════════════════════════════════════════════════════════
function renderConstanciaDetails(allDays, streakOriginId, { rate, firstDate }) {
  const el = document.getElementById('con-details');
  if (!el) return;

  const activeSet = new Set(allDays.filter(isActiveDay).map(d => d.id));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // ── Este mês ──
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthFailedDays = [];
  const scan1 = new Date(monthStart);
  while (scan1 <= today) {
    const id = dayId(scan1);
    if (!activeSet.has(id)) {
      monthFailedDays.push(new Date(scan1));
    }
    scan1.setDate(scan1.getDate() + 1);
  }
  const monthTotal = Math.floor((today - monthStart) / 86400000) + 1;
  const monthActive = monthTotal - monthFailedDays.length;
  const monthRate = Math.round((monthActive / monthTotal) * 100);

  // ── Período total (desde origem) ──
  const origin = firstDate || monthStart;
  let totalFailed = 0;
  const scan2 = new Date(origin);
  while (scan2 <= today) {
    if (!activeSet.has(dayId(scan2))) totalFailed++;
    scan2.setDate(scan2.getDate() + 1);
  }
  const totalSpan = Math.floor((today - origin) / 86400000) + 1;
  const totalActive = totalSpan - totalFailed;

  const fmtDate = (d) => {
    return `${_wdShort(d)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const fmtOrigin = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  const monthChips = monthFailedDays.length
    ? monthFailedDays.map(d => `<span class="con-fail-chip">${fmtDate(d)}</span>`).join('')
    : `<span class="con-ok-chip">${t('desempenho.con.nofail')}</span>`;

  const totalFailedText = totalFailed === 0
    ? `<span class="con-ok-chip">${t('desempenho.con.nofail')}</span>`
    : `<span class="con-fail-count">${totalFailed} ${totalFailed === 1 ? t('desempenho.day') : t('desempenho.days')} ${t('desempenho.noreg')}</span>`;

  el.innerHTML = `
    <div class="con-details-inner">
      <div class="con-period">
        <div class="con-period-head">
          <span class="con-period-title">📅 ${_moFull(today)}</span>
          <span class="con-period-stat ${monthRate >= 80 ? 'good' : monthRate >= 60 ? 'mid' : 'bad'}">${monthRate}% · ${monthActive}/${monthTotal} dias</span>
        </div>
        <div class="con-fail-row">${monthChips}</div>
      </div>
      <div class="con-period">
        <div class="con-period-head">
          <span class="con-period-title">📊 ${t('desempenho.con.since')} ${fmtOrigin(origin)}</span>
          <span class="con-period-stat ${rate >= 80 ? 'good' : rate >= 60 ? 'mid' : 'bad'}">${rate}% · ${totalActive}/${totalSpan} dias</span>
        </div>
        <div class="con-fail-row">${totalFailedText}</div>
      </div>
    </div>
  `;
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
function prevId(id) {
  const [y, m, d] = id.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dayId(dt);
}
function hexA(hex, a) {
  if (!hex) return `rgba(167,139,250,${a})`;
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0,2), 16), g = parseInt(m[1].slice(2,4), 16), b = parseInt(m[1].slice(4,6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
