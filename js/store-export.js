// ═══════════════════════════════════════════════════════════════
// VISÃO · Export de dados do usuário (JSON + PDF/HTML print)
// Cumpre o direito de portabilidade da LGPD (Art. 18, V).
// ═══════════════════════════════════════════════════════════════
import { auth, db, doc, getDoc, collection, getDocs } from './firebase.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: COLETA TUDO DO FIRESTORE
// ═══════════════════════════════════════════════════════════════
export async function gatherAllData() {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const base = ['users', user.uid];

  const profileSnap = await getDoc(doc(db, ...base));
  const profile = profileSnap.exists() ? profileSnap.data() : {};

  const [shifts, categories, weeks, consents, days] = await Promise.all([
    fetchCol([...base, 'shifts']),
    fetchCol([...base, 'categories']),
    fetchCol([...base, 'weeks']),
    fetchCol([...base, 'consents']),
    fetchDaysWithTasks(base)
  ]);

  return {
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null
    },
    profile,
    shifts,
    categories,
    days,
    weeks,
    consents
  };
}

async function fetchCol(pathArr) {
  const snap = await getDocs(collection(db, ...pathArr));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fetchDaysWithTasks(base) {
  const daysSnap = await getDocs(collection(db, ...base, 'days'));
  const out = [];
  for (const d of daysSnap.docs) {
    const meta = d.data();
    const tasks = await fetchCol([...base, 'days', d.id, 'tasks']);
    out.push({ id: d.id, meta, tasks });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
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
  const totalDays = data.days.length;
  const totalTasks = data.days.reduce((s, d) => s + d.tasks.length, 0);
  const doneTasks  = data.days.reduce((s, d) => s + d.tasks.filter(t => t.done).length, 0);
  const aderencia  = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0;

  const sleepDays = data.days
    .filter(d => d.meta?.sleepHours != null)
    .map(d => Number(d.meta.sleepHours)).filter(Number.isFinite);
  const sleepAvg = sleepDays.length ? (sleepDays.reduce((a,b)=>a+b,0)/sleepDays.length).toFixed(1) : '–';

  const categoriesById = Object.fromEntries(data.categories.map(c => [c.id, c]));

  // Pontos fortes/fracos GLOBAIS (toda a história do usuário)
  const actAgg = {};
  for (const d of data.days) {
    for (const t of d.tasks) {
      if (!t.title || !t.categoryId) continue;
      const k = `${t.categoryId}|${t.title}`;
      if (!actAgg[k]) actAgg[k] = { title: t.title, cat: categoriesById[t.categoryId], done: 0, total: 0 };
      actAgg[k].total++; if (t.done) actAgg[k].done++;
    }
  }
  const acts = Object.values(actAgg).filter(a => a.cat && a.total >= 3).map(a => ({...a, pct: a.done/a.total}));
  const top = acts.slice().sort((a,b) => b.pct - a.pct).slice(0,5);
  const bot = acts.slice().filter(a => a.pct < 0.7).sort((a,b) => a.pct - b.pct).slice(0,5);

  const weeksWithNotes = data.weeks.filter(w => (w.note || '').trim()).sort((a,b) => (b.id||'').localeCompare(a.id||''));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Visão · ${escape(data.user.email || '')}</title>
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

<button class="print-btn no-print" onclick="window.print()">🖨️ Salvar como PDF</button>

<div class="cover">
  <div class="logo">👁</div>
  <h1>Visão · Seu Relatório Pessoal</h1>
  <div class="meta">${escape(data.user.email || '')}</div>
  <div class="meta">Gerado em ${formatBr(data.exportedAt)}</div>
</div>

<h2>📊 Visão geral</h2>
<div class="stats">
  <div class="stat"><div class="v">${totalDays}</div><div class="l">Dias registrados</div></div>
  <div class="stat"><div class="v">${aderencia}%</div><div class="l">Aderência total</div></div>
  <div class="stat"><div class="v">${doneTasks}</div><div class="l">Tarefas feitas</div></div>
  <div class="stat"><div class="v">${sleepAvg}h</div><div class="l">Sono médio</div></div>
</div>

<h2>⭐ Pontos fortes (top 5)</h2>
${top.length
  ? `<ul class="acts">${top.map(a => `<li style="border-left-color:${a.cat.color || '#7c3aed'}"><span class="pct">${Math.round(a.pct*100)}%</span><strong>${escape(a.cat.icon || '')} ${escape(a.cat.name)}</strong>${a.title.toLowerCase() !== (a.cat.name||'').toLowerCase() ? ' · ' + escape(a.title) : ''} <small>(${a.done}/${a.total})</small></li>`).join('')}</ul>`
  : '<p>Sem dados suficientes ainda.</p>'}

<h2>⚠️ Pontos fracos (top 5)</h2>
${bot.length
  ? `<ul class="acts">${bot.map(a => `<li style="border-left-color:${a.cat.color || '#f59e0b'}"><span class="pct">${Math.round(a.pct*100)}%</span><strong>${escape(a.cat.icon || '')} ${escape(a.cat.name)}</strong>${a.title.toLowerCase() !== (a.cat.name||'').toLowerCase() ? ' · ' + escape(a.title) : ''} <small>(${a.done}/${a.total})</small></li>`).join('')}</ul>`
  : '<p>Tudo em dia! 🎉</p>'}

<h2>🏷️ Suas atividades</h2>
<div class="cat-list">
  ${data.categories.map(c => `<span class="cat-pill" style="border-color:${c.color || '#999'};color:${c.color || '#333'}">${escape(c.icon || '')} ${escape(c.name)}</span>`).join('') || '<small>Nenhuma cadastrada.</small>'}
</div>

<h2>📝 Reflexões semanais</h2>
${weeksWithNotes.length
  ? weeksWithNotes.map(w => `<div class="week"><div class="when">Semana ${escape(w.id || '')}</div><div class="note">${escape(w.note)}</div></div>`).join('')
  : '<p>Você ainda não escreveu reflexões semanais.</p>'}

<footer>
  Visão · Consultor Pessoal de Planejamento Estratégico<br>
  Documento exportado em ${formatBr(data.exportedAt)} · Total de ${data.days.length} dias na base
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

function formatBr(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  } catch { return iso; }
}
