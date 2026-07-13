// ═══════════════════════════════════════════════════════════════
// VISÃO · Export de dados do usuário (JSON + PDF/HTML print)
// Cumpre o direito de portabilidade da LGPD (Art. 18, V).
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — COLETA TUDO DO FIRESTORE
// BLOCO 2 — DOWNLOAD JSON
// BLOCO 3 — RELATÓRIO PDF (via print do navegador)
// BLOCO 4 — HELPERS
// ─────────────────────────────────────────────────────────────
import { auth } from './autenticacao.js';
import { getProfile, getShifts, getCategories, fetchDaysRange } from './banco-dados.js';
import { listAllConsents } from './lgpd-consentimentos.js';
import { supabase } from './config-supabase.js';
import { t, getLang } from './idioma.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: COLETA TUDO DO FIRESTORE
// ═══════════════════════════════════════════════════════════════
export async function gatherAllData() {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const [profile, shifts, categories, consents, weeks, rawDays] = await Promise.all([
    getProfile(),
    getShifts(),
    getCategories(),
    listAllConsents(),
    _fetchWeeks(),
    fetchDaysRange(new Date('2000-01-01'), new Date('2100-01-01')),
  ]);

  // fetchDaysRange devolve {id, ...meta, tasks} → reshape pra {id, meta, tasks} (formato do relatório)
  const days = rawDays.map(({ id, tasks, ...meta }) => ({ id, meta, tasks }));

  return {
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null
    },
    profile: profile || {},
    shifts,
    categories,
    days,
    weeks,
    consents
  };
}

async function _fetchWeeks() {
  const { data } = await supabase.from('week_notes').select('*');
  return (data || []).map(w => ({ id: w.monday, ...(w.data || {}) }));
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: DOWNLOAD JSON
// ═══════════════════════════════════════════════════════════════
export async function downloadJson() {
  const data = await gatherAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `visao-export-${stamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return data;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: RELATÓRIO PDF (via print do navegador)
// ═══════════════════════════════════════════════════════════════
export async function openPdfReport() {
  const data = await gatherAllData();
  const html = buildReportHtml(data);
  const w = window.open('', '_blank');
  if (!w) throw new Error('Bloqueado por popup blocker');
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Espera carregar fontes/render antes do print
  w.addEventListener('load', () => setTimeout(() => w.print(), 400));
}

function buildReportHtml(data) {
  const lang = getLang();

  const totalDays = data.days.length;
  const totalTasks = data.days.reduce((s, d) => s + d.tasks.length, 0);
  const doneTasks  = data.days.reduce((s, d) => s + d.tasks.filter(t => t.done).length, 0);
  const aderencia  = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0;

  // ── Cálculo de sono por dia (tempo na cama + cochilo − madrugada) ──
  function parseHHMM(s) {
    if (!s) return null;
    const [hh, mm] = String(s).split(':').map(Number);
    if (!isFinite(hh) || !isFinite(mm)) return null;
    return hh * 60 + mm;
  }
  function dayBedMin(d) {
    const w = parseHHMM(d.meta?.wakeTime);
    const s = parseHHMM(d.meta?.sleepTime);
    if (w == null || s == null) return 0;
    let diff = w - s;
    if (diff < 0) diff += 24 * 60;
    return (diff >= 60 && diff <= 16 * 60) ? diff : 0;
  }
  function daySleepMin(d) {
    let total = dayBedMin(d);
    const n = d.meta?.dayNote;
    if (n) {
      if (typeof n.daySleepHours === 'number') total += n.daySleepHours * 60;
      const naw = n.nightAwakeHours ?? n.nightWakes;
      if (typeof naw === 'number') total -= naw * 60;
    }
    return Math.max(0, total);
  }

  const sleepDays = data.days.filter(d => daySleepMin(d) > 0);
  const sleepAvg = sleepDays.length
    ? (sleepDays.reduce((s,d) => s + daySleepMin(d), 0) / sleepDays.length / 60).toFixed(1)
    : '–';

  // Agregação por MÊS e por ANO
  const byMonth = {};
  const byYear  = {};
  for (const d of data.days) {
    const min = daySleepMin(d);
    if (min <= 0) continue;
    const month = d.id.substring(0, 7);
    const year  = d.id.substring(0, 4);
    if (!byMonth[month]) byMonth[month] = { min: 0, days: 0 };
    if (!byYear[year])   byYear[year]   = { min: 0, days: 0 };
    byMonth[month].min += min; byMonth[month].days++;
    byYear[year].min   += min; byYear[year].days++;
  }
  const monthsSorted = Object.entries(byMonth).sort(([a],[b]) => b.localeCompare(a));
  const yearsSorted  = Object.entries(byYear).sort(([a],[b]) => b.localeCompare(a));

  function fmtHM(min) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  }
  function monthName(ym) {
    const [y, mo] = ym.split('-');
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' })
      .format(new Date(parseInt(y), parseInt(mo, 10) - 1, 1));
  }

  const categoriesById = Object.fromEntries(data.categories.map(c => [c.id, c]));

  const actAgg = {};
  for (const d of data.days) {
    for (const tk of d.tasks) {
      if (!tk.title || !tk.categoryId) continue;
      const k = `${tk.categoryId}|${tk.title}`;
      if (!actAgg[k]) actAgg[k] = { title: tk.title, cat: categoriesById[tk.categoryId], done: 0, total: 0 };
      actAgg[k].total++; if (tk.done) actAgg[k].done++;
    }
  }
  const acts = Object.values(actAgg).filter(a => a.cat && a.total >= 3).map(a => ({...a, pct: a.done/a.total}));
  const top = acts.slice().sort((a,b) => b.pct - a.pct).slice(0,5);
  const bot = acts.slice().filter(a => a.pct < 0.7).sort((a,b) => a.pct - b.pct).slice(0,5);

  const weeksWithNotes = data.weeks.filter(w => (w.note || '').trim()).sort((a,b) => (b.id||'').localeCompare(a.id||''));

  const generatedDate = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' })
    .format(new Date(data.exportedAt));

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${t('pdf.title')} · ${escape(data.user.email || '')}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #111;
    background: #fff;
    line-height: 1.5;
    margin: 0;
  }
  .cover {
    text-align: center;
    padding: 30px 0 20px;
    border-bottom: 3px solid #7c3aed;
    margin-bottom: 28px;
  }
  .cover .logo { font-size: 56px; }
  .cover h1 {
    font-size: 28px; margin: 8px 0 4px; color: #4f46e5; letter-spacing: 0.3px;
  }
  .cover .meta { font-size: 12px; color: #666; margin: 4px 0; }
  h2 { color: #4f46e5; font-size: 18px; margin: 28px 0 8px; border-left: 4px solid #7c3aed; padding-left: 10px; }
  h3 { color: #333; font-size: 14px; margin: 14px 0 6px; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 24px; }
  .stat {
    background: #f5f3ff; border: 1px solid #ddd6fe;
    border-radius: 12px; padding: 14px 8px; text-align: center;
  }
  .stat .v { font-size: 22px; font-weight: 800; color: #5b21b6; }
  .stat .l { font-size: 10px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

  .acts { margin: 8px 0 20px; padding: 0; list-style: none; }
  .acts li {
    padding: 8px 12px; margin: 4px 0;
    background: #fafafa; border-left: 4px solid #ccc; border-radius: 6px;
    font-size: 13px;
  }
  .acts .pct { float: right; font-weight: 700; }

  .week {
    border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 10px 14px; margin: 8px 0;
    background: #fafafa;
    page-break-inside: avoid;
  }
  .week .when { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; }
  .week .note { font-size: 13px; color: #222; margin-top: 6px; white-space: pre-wrap; }

  .cat-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 20px; }
  .sleep-tbl {
    width: 100%; border-collapse: collapse;
    margin: 8px 0 20px;
    font-size: 13px;
  }
  .sleep-tbl th {
    background: #f5f3ff; color: #5b21b6;
    text-align: left; padding: 8px 12px;
    border-bottom: 2px solid #7c3aed; font-weight: 700;
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;
  }
  .sleep-tbl td {
    padding: 8px 12px; border-bottom: 1px solid #eee;
  }
  .sleep-tbl tr:nth-child(even) td { background: #fafafa; }
  .sleep-tbl tr:hover td { background: #f5f3ff; }

  .cat-pill {
    padding: 4px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 600;
    border: 1px solid #ddd; background: #fff;
  }

  footer {
    margin-top: 40px; padding-top: 14px; border-top: 1px solid #ddd;
    text-align: center; font-size: 10px; color: #888;
  }

  @media print {
    .no-print { display: none !important; }
  }
  .print-btn {
    position: fixed; top: 12px; right: 12px;
    background: #7c3aed; color: #fff;
    border: none; border-radius: 10px;
    padding: 10px 16px; font-size: 13px; font-weight: 700;
    cursor: pointer; z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">${t('pdf.print')}</button>

<div class="cover">
  <div class="logo">🦅</div>
  <h1>${t('pdf.cover.title')}</h1>
  <div class="meta">${escape(data.user.email || '')}</div>
  <div class="meta">${t('pdf.generated', { date: generatedDate })}</div>
</div>

<h2>${t('pdf.overview')}</h2>
<div class="stats">
  <div class="stat"><div class="v">${totalDays}</div><div class="l">${t('pdf.stat.days')}</div></div>
  <div class="stat"><div class="v">${aderencia}%</div><div class="l">${t('pdf.stat.adherence')}</div></div>
  <div class="stat"><div class="v">${doneTasks}</div><div class="l">${t('pdf.stat.tasks')}</div></div>
  <div class="stat"><div class="v">${sleepAvg}h</div><div class="l">${t('pdf.stat.sleep')}</div></div>
</div>

<h2>${t('pdf.strengths')}</h2>
${top.length
  ? `<ul class="acts">${top.map(a => `<li style="border-left-color:${a.cat.color || '#7c3aed'}"><span class="pct">${Math.round(a.pct*100)}%</span><strong>${escape(a.cat.icon || '')} ${escape(a.cat.name)}</strong>${a.title.toLowerCase() !== (a.cat.name||'').toLowerCase() ? ' · ' + escape(a.title) : ''} <small>(${a.done}/${a.total})</small></li>`).join('')}</ul>`
  : `<p>${t('pdf.strengths.empty')}</p>`}

<h2>${t('pdf.weaknesses')}</h2>
${bot.length
  ? `<ul class="acts">${bot.map(a => `<li style="border-left-color:${a.cat.color || '#f59e0b'}"><span class="pct">${Math.round(a.pct*100)}%</span><strong>${escape(a.cat.icon || '')} ${escape(a.cat.name)}</strong>${a.title.toLowerCase() !== (a.cat.name||'').toLowerCase() ? ' · ' + escape(a.title) : ''} <small>(${a.done}/${a.total})</small></li>`).join('')}</ul>`
  : `<p>${t('pdf.weaknesses.empty')}</p>`}

<h2>${t('pdf.sleep.month')}</h2>
${monthsSorted.length ? `
  <table class="sleep-tbl">
    <thead><tr>
      <th>${t('pdf.tbl.month')}</th>
      <th>${t('pdf.tbl.days')}</th>
      <th>${t('pdf.tbl.total')}</th>
      <th>${t('pdf.tbl.avg')}</th>
    </tr></thead>
    <tbody>
      ${monthsSorted.map(([m, v]) => `
        <tr>
          <td><strong>${monthName(m)}</strong></td>
          <td>${v.days}</td>
          <td><strong>${fmtHM(v.min)}</strong></td>
          <td>${fmtHM(v.min / v.days)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
` : `<p>${t('pdf.sleep.empty')}</p>`}

<h2>${t('pdf.sleep.year')}</h2>
${yearsSorted.length ? `
  <table class="sleep-tbl">
    <thead><tr>
      <th>${t('pdf.tbl.year')}</th>
      <th>${t('pdf.tbl.days')}</th>
      <th>${t('pdf.tbl.total')}</th>
      <th>${t('pdf.tbl.avg')}</th>
    </tr></thead>
    <tbody>
      ${yearsSorted.map(([y, v]) => `
        <tr>
          <td><strong>${y}</strong></td>
          <td>${v.days}</td>
          <td><strong>${fmtHM(v.min)}</strong></td>
          <td>${fmtHM(v.min / v.days)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
` : ''}

<h2>${t('pdf.activities')}</h2>
<div class="cat-list">
  ${data.categories.map(c => `<span class="cat-pill" style="border-color:${c.color || '#999'};color:${c.color || '#333'}">${escape(c.icon || '')} ${escape(c.name)}</span>`).join('') || `<small>${t('pdf.activities.empty')}</small>`}
</div>

<h2>${t('pdf.reflections')}</h2>
${weeksWithNotes.length
  ? weeksWithNotes.map(w => `<div class="week"><div class="when">${t('pdf.reflections.week', { id: escape(w.id || '') })}</div><div class="note">${escape(w.note)}</div></div>`).join('')
  : `<p>${t('pdf.reflections.empty')}</p>`}

<footer>
  ${t('pdf.footer')}<br>
  ${t('pdf.generated', { date: generatedDate })} · ${t('pdf.footer.days', { days: data.days.length })}
</footer>

</body>
</html>`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: HELPERS
// ═══════════════════════════════════════════════════════════════
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function stamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}
