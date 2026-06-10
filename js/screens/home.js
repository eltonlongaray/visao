// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getShifts, saveShift, deleteShift,
  getCategories, saveCategory, deleteCategory,
  getActivities, saveActivity, deleteActivity,
  getProfile, setProfile,
  parseTime, formatTime, sleepDuration,
  fetchDaysRange
} from '../store.js';
import { bottomNav } from '../components/bottom-nav.js';
import { showToast, confirmModal } from '../toast.js';
import { playDelete } from '../sounds.js';
import { currentTheme, toggleTheme } from '../theme.js';
import { auth } from '../firebase.js';
import { navigate } from '../router.js';
import * as tour from '../tour.js';
import { ONBOARDING_STEPS } from '../tour-config.js';
import { openTimePicker } from '../time-picker.js';
import { openMorningMessages, hasUnreadToday } from '../morning-messages.js';
import { trapModalBack } from '../modal-back.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ESTADO DO MÓDULO
// ═══════════════════════════════════════════════════════════════
let shifts = [], categories = [], activities = [], profile = {};
const openShifts = new Set();
let prefsSaveTimer = null;
let handlersAttached = false;   // FIX: evita listeners duplicados


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ENTRY POINT — renderiza a Home
// ═══════════════════════════════════════════════════════════════

export async function renderHome(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">Carregando...</div>`;

  try {
    [shifts, categories, activities, profile] = await Promise.all([
      getShifts(), getCategories(), getActivities(), getProfile()
    ]);
    profile = profile || {};
  } catch (err) {
    app.innerHTML = `<div style="padding:40px 16px;text-align:center">
      <p style="color:var(--red);font-weight:600">Erro ao carregar dados.</p>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">${err.message || ''}</p>
      <p style="color:var(--muted);font-size:11px;margin-top:14px">Verifique se as regras do Firestore foram publicadas.</p>
    </div>`;
    return;
  }

  app.innerHTML = `
    <div class="screen-pad">
      <div class="screen-title">
        <h1>Sua biblioteca</h1>
        <div class="sub">Categorias e atividades — o Ritual puxa daqui.</div>
      </div>

      <!-- PREFERÊNCIAS DE SONO + TEMA -->
      <div class="home-section">
        <div class="home-section-title">
          <span>🛏️ MEU DIA</span>
          <button class="theme-toggle" id="theme-toggle" title="Trocar tema (clique pra alternar dia/noite)">
            ${themeIconSVG()}
          </button>
        </div>
        <div class="sleep-prefs">
          <div class="time-pills">
            <label class="time-pill">
              <span class="time-pill-label">🌅 Acordar</span>
              <button type="button" class="time-pill-input tp-pill-trigger" id="pref-wake" data-time="${toHHMM(profile.defaultWakeTime) || ''}">${toHHMM(profile.defaultWakeTime) || '--:--'}</button>
            </label>
            <label class="time-pill">
              <span class="time-pill-label">🌙 Dormir</span>
              <button type="button" class="time-pill-input tp-pill-trigger" id="pref-sleep" data-time="${toHHMM(profile.defaultSleepTime) || ''}">${toHHMM(profile.defaultSleepTime) || '--:--'}</button>
            </label>
          </div>
          <div class="sleep-info" id="sleep-info">${sleepInfoHtml()}</div>
        </div>
      </div>

      <!-- LEMBRETES DA SEMANA -->
      <button class="reminders-card" id="reminders-card" type="button">
        <div class="reminders-icon">🔔</div>
        <div class="reminders-text">
          <div class="reminders-title">Lembretes da semana</div>
          <div class="reminders-sub" id="reminders-sub">carregando…</div>
        </div>
        <div class="reminders-badge" id="reminders-badge" style="display:none">0</div>
      </button>

      <!-- MENSAGENS DA MANHÃ -->
      <button class="reminders-card msgs-card" id="morning-msgs-card" type="button">
        <div class="reminders-icon">💌</div>
        <div class="reminders-text">
          <div class="reminders-title">Mensagens</div>
          <div class="reminders-sub">A pergunta de todas as manhãs</div>
        </div>
        <div class="msgs-dot" id="msgs-dot" ${hasUnreadToday() ? '' : 'style="display:none"'}></div>
      </button>

      <!-- ATIVIDADES (antes "Categorias" — agora é o único layer) -->
      <div class="home-section">
        <div class="home-section-title">
          <span>📋 ATIVIDADES</span>
          <button class="home-add-btn" id="add-cat" title="Nova atividade">+</button>
        </div>
        <div id="cats-list"></div>
        <div class="home-section-hint">São os tipos de coisa que você faz na rotina (Hidratação, Treino, Estudo...). No Ritual você adiciona uma e escreve o que rolou no dia.</div>
      </div>

    </div>
    ${bottomNav('home')}
  `;

  renderCats();
  attachHandlers();
  attachPrefHandlers();
  loadAndRenderReminders();

  // Tour NÃO auto-inicia mais — só pode ser disparado via Ajustes
  // (admin: 🛠️ Admin → Reiniciar tour de boas-vindas)
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4.5: CENTRAL DE LEMBRETES DA SEMANA
// Mostra na Home quantas tarefas da semana atual têm lembrete ativado
// e que ainda não foram feitas. Click → abre modal com a lista.
// ═══════════════════════════════════════════════════════════════
const WEEKDAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let weekReminders = [];     // semana atual
let nextWeekReminders = []; // semana que vem

async function loadAndRenderReminders() {
  // Janela 1: Segunda → Domingo da semana atual
  const today = new Date();
  const dow = today.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(today);
  weekStart.setHours(0,0,0,0);
  weekStart.setDate(today.getDate() - offset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Janela 2: semana que vem (+7 a +13 dias após weekStart)
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(weekStart.getDate() + 7);
  const nextWeekEnd = new Date(weekStart);
  nextWeekEnd.setDate(weekStart.getDate() + 13);

  try {
    // Busca ambas em paralelo (cobre 14 dias)
    const [thisDays, nextDays] = await Promise.all([
      fetchDaysRange(weekStart, weekEnd),
      fetchDaysRange(nextWeekStart, nextWeekEnd)
    ]);
    weekReminders = collectReminders(thisDays);
    nextWeekReminders = collectReminders(nextDays);

    const sub = document.getElementById('reminders-sub');
    const badge = document.getElementById('reminders-badge');
    const total = weekReminders.length + nextWeekReminders.length;
    if (total === 0) {
      sub.textContent = 'Sem lembretes nas próximas 2 semanas';
      badge.style.display = 'none';
    } else {
      const parts = [];
      if (weekReminders.length) parts.push(`${weekReminders.length} esta semana`);
      if (nextWeekReminders.length) parts.push(`${nextWeekReminders.length} próxima`);
      sub.textContent = parts.join(' · ') + ' · toque pra ver';
      // badge mostra só a semana atual (urgência imediata)
      if (weekReminders.length > 0) {
        badge.textContent = weekReminders.length;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (err) {
    document.getElementById('reminders-sub').textContent = 'Erro ao carregar lembretes';
  }
}

function collectReminders(days) {
  const out = [];
  for (const d of days) {
    const date = new Date(d.id + 'T00:00:00');
    for (const t of (d.tasks || [])) {
      if (t.reminderEnabled && !t.done) out.push({ ...t, dayId: d.id, date });
    }
  }
  return out.sort((a,b) => a.date - b.date || (a.startTime || '').localeCompare(b.startTime || ''));
}

function reminderItemsHtml(list, emptyMsg) {
  if (list.length === 0) {
    return `<div class="reminder-empty">${emptyMsg}</div>`;
  }
  return list.map(r => {
    const dStr = `${WEEKDAYS_SHORT[r.date.getDay()]}, ${String(r.date.getDate()).padStart(2,'0')} ${MONTHS_SHORT[r.date.getMonth()]}`;
    const cat = categories.find(c => c.id === r.categoryId);
    return `<div class="reminder-item">
      <div class="reminder-time">
        <div class="reminder-day">${dStr}</div>
        ${r.startTime ? `<div class="reminder-hour">${escape(r.startTime)}</div>` : ''}
      </div>
      <div class="reminder-body">
        <div class="reminder-task-title">${escape(r.title)}</div>
        ${cat ? `<span class="task-tag" style="color:${cat.color};background:${hexA(cat.color,0.15)}">${escape(cat.name)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openRemindersModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">🔔 Lembretes</div>
      <div class="modal-hint">Tarefas com lembrete que ainda não foram feitas.</div>

      <div class="reminder-section-label">📍 Esta semana ${weekReminders.length ? `<span class="reminder-count">${weekReminders.length}</span>` : ''}</div>
      <div class="reminder-list">${reminderItemsHtml(weekReminders, 'Nada pendente esta semana 🎉')}</div>

      <div class="reminder-divider"></div>

      <div class="reminder-section-label">🔜 Semana que vem ${nextWeekReminders.length ? `<span class="reminder-count">${nextWeekReminders.length}</span>` : ''}</div>
      <div class="reminder-list">${reminderItemsHtml(nextWeekReminders, 'Sem lembretes ainda — você verá aqui assim que marcar tarefas com 🔔')}</div>

      <div class="modal-actions">
        <button class="btn-primary" id="m-close">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = trapModalBack(() => modal.remove());
  modal.querySelector('#m-close').onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
}

function toHHMM(timeStr) {
  const t = parseTime(timeStr);
  if (t === null) return '';
  const h = Math.floor(t / 60), m = t % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function formatDurationVerbose(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} horas`;
  if (h === 0) return `${m} minutos`;
  return `${h}h e ${String(m).padStart(2,'0')}min`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: PREFERÊNCIAS DE SONO (display + handlers)
// ═══════════════════════════════════════════════════════════════
function sleepInfoHtml() {
  const dur = sleepDuration(profile.defaultSleepTime, profile.defaultWakeTime);
  if (dur === null) {
    return `<span class="sleep-info-empty">Defina os horários pra ver suas horas de sono. Ideal: entre 6h e 8h.</span>`;
  }
  const hrs = dur / 60;
  let cls = 'good', emoji = '✅', msg = '';
  if (hrs < 6)        { cls = 'bad';   emoji = '⚠️'; msg = 'pouco — ideal entre 6h e 8h'; }
  else if (hrs <= 8)  { cls = 'good';  emoji = '✅'; msg = 'ideal!'; }
  else                { cls = 'mid';   emoji = '💤'; msg = 'além do ideal (6h-8h)'; }
  return `<span class="sleep-info-tag ${cls}">${emoji} ${formatDurationVerbose(dur)} de sono — ${msg}</span>`;
}

function attachPrefHandlers() {
  const wake = document.getElementById('pref-wake');
  const sleep = document.getElementById('pref-sleep');
  if (!wake || !sleep) return;

  const persist = async () => {
    const wv = wake.dataset.time || '';
    const sv = sleep.dataset.time || '';
    profile.defaultWakeTime = wv;
    profile.defaultSleepTime = sv;
    document.getElementById('sleep-info').innerHTML = sleepInfoHtml();
    try { await setProfile({ defaultWakeTime: wv, defaultSleepTime: sv }); }
    catch (e) { showToast('Erro ao salvar: ' + e.message, 'error'); }
  };

  const openFor = async (btn) => {
    const result = await openTimePicker(btn.dataset.time || '');
    if (result) {
      btn.dataset.time = result;
      btn.textContent = result;
      persist();
    }
  };

  wake.addEventListener('click', () => openFor(wake));
  sleep.addEventListener('click', () => openFor(sleep));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: RENDER — Categorias e Atividades
// ═══════════════════════════════════════════════════════════════
function renderCats() {
  const box = document.getElementById('cats-list');
  box.innerHTML = categories.map(c => `
    <div class="cat-config-card" data-id="${c.id}">
      <div class="cat-config-icon" style="background:${hexA(c.color, 0.20)}">
        ${c.icon || '🏷️'}
      </div>
      <div class="cat-config-name-display">${escape(c.name)}</div>
      <div class="cat-config-swatch" style="background:${c.color || '#a78bfa'}"></div>
      <div class="activity-actions">
        <button data-action="edit-cat" title="Editar">✏️</button>
        <button class="del" data-action="del-cat" title="Excluir">🗑️</button>
      </div>
    </div>
  `).join('');
}

// NOTA: renderActs/activityCard removidos — o layer "Atividade interna" foi mergeado com Categorias (renomeadas pra Atividades).

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: HANDLERS GLOBAIS (clicks de add/edit/delete)
// FIX: separa listeners por escopo
//   - Elementos específicos (botões recriados): reanexar OK, sem duplicar
//   - Listener delegado em `document`: anexar SÓ 1 vez via flag
// ═══════════════════════════════════════════════════════════════
function attachHandlers() {
  // ─── Específicos (botões recriados a cada render) ─────────
  document.getElementById('add-cat').addEventListener('click', () => openCategoryEditor(null));
  document.getElementById('reminders-card').addEventListener('click', openRemindersModal);

  // Card de mensagens — abre o modal e marca como lido (some a bolinha do dia)
  document.getElementById('morning-msgs-card').addEventListener('click', () => {
    openMorningMessages();
    const dot = document.getElementById('msgs-dot');
    if (dot) dot.style.display = 'none';
  });

  // Toggle de tema dia/noite — o SVG reage automaticamente ao data-theme via CSS
  document.getElementById('theme-toggle').addEventListener('click', () => toggleTheme());

  // ─── Delegado em document — anexar 1 vez ──────────────────
  if (handlersAttached) return;
  handlersAttached = true;
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;

    if (action === 'del-cat') {
      const c = categories.find(x => x.id === id);
      const ok = await confirmModal({
        title: 'Excluir atividade?',
        message: `"${c?.name || ''}" será removida da sua biblioteca. As tarefas marcadas em dias do Ritual continuam lá.`,
        confirmText: 'Excluir',
        danger: true
      });
      if (!ok) return;
      playDelete();
      await deleteCategory(id);
      categories = await getCategories();
      renderCats();
      showToast('Atividade excluída', 'success');
    } else if (action === 'edit-cat') {
      openCategoryEditor(id);
    }
  });
}

// BLOCO 7 removido: openActivityEditor (era pro layer antigo de "atividades internas",
// que foi mergeado com categorias-renomeadas-pra-atividades).

// ═══════════════════════════════════════════════════════════════
// BLOCO 8: MODAL — Editor de Categoria
// ═══════════════════════════════════════════════════════════════
function openCategoryEditor(id) {
  const isNew = id === null;
  const COLORS = ['#a78bfa','#34d399','#f472b6','#60a5fa','#fbbf24','#f87171','#fb923c','#c084fc','#22d3ee','#facc15'];
  const ICONS = [
    // Vida diária / hábitos
    '🏷️','💧','🥗','💪','⚽','🏃','📚','🌙','💼','🧘','🥋','💰','🎨','🧹','📞','🛒','✈️','💝',
    // Autocuidado / beleza
    '💇🏻‍♀️','🧖🏻‍♀️','💄','🪒','👚','🛍️',
    // Família / pets
    '👩🏻‍❤️‍💋‍👨🏻','🐕','🐈‍⬛','🎁',
    // Fitness / lazer
    '🏋🏻‍♀️','🛼','🪘','🃏','🔮',
    // Casa / saúde / passeio
    '🛠️','🧺','🩺','🏖️','🗺️','🚨'
  ];
  const ALL_DAYS = [0,1,2,3,4,5,6];
  const WEEKDAY_LABELS = ['D','S','T','Q','Q','S','S'];
  const c = isNew
    ? { name: '', icon: '🏷️', color: COLORS[categories.length % COLORS.length], daysOfWeek: ALL_DAYS }
    : { ...categories.find(x => x.id === id) };
  if (!c) return;
  if (!Array.isArray(c.daysOfWeek)) c.daysOfWeek = ALL_DAYS;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">${isNew ? 'Nova atividade' : 'Editar atividade'}</div>
      <div class="modal-hint">Dê um nome, escolha um ícone e uma cor. Ex: Hidratação, Treino, Estudo, Caminhada...</div>

      <label class="input-field"><div class="input-field-label">Nome</div>
        <input id="m-name" value="${escape(c.name)}" placeholder="ex: Meditação, Trabalho, Lazer..." /></label>

      <div class="modal-section-label">Ícone</div>
      <div class="icon-picker">
        ${ICONS.map(i => `<button type="button" class="icon-opt ${i === c.icon ? 'sel' : ''}" data-icon="${i}">${i}</button>`).join('')}
      </div>

      <div class="modal-section-label">Cor</div>
      <div class="color-picker">
        ${COLORS.map(col => `<button type="button" class="color-opt ${col === c.color ? 'sel' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="m-cancel">Cancelar</button>
        <button class="btn-primary" id="m-save">${isNew ? 'Criar' : 'Salvar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  // Auto-scroll suave: pisca uma rolada pro fim pra mostrar onde tá o botão Criar,
  // depois volta pro topo pra usuário começar a preencher
  setTimeout(() => {
    const inner = modal.querySelector('.modal');
    if (!inner) return;
    inner.scrollTop = inner.scrollHeight;
    setTimeout(() => {
      inner.scrollTo({ top: 0, behavior: 'smooth' });
      modal.querySelector('#m-name')?.focus();
    }, 900);
  }, 80);

  let pickedIcon = c.icon, pickedColor = c.color;
  modal.querySelectorAll('[data-icon]').forEach(b => b.onclick = () => {
    modal.querySelectorAll('[data-icon]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); pickedIcon = b.dataset.icon;
  });
  modal.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    modal.querySelectorAll('[data-color]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); pickedColor = b.dataset.color;
  });
  const close = trapModalBack(() => modal.remove());
  modal.querySelector('#m-cancel').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  modal.querySelector('#m-save').onclick = async () => {
    const name = modal.querySelector('#m-name').value.trim();
    if (!name) { showToast('Dê um nome pra atividade.', 'info'); return; }
    const order = isNew
      ? (categories.length ? Math.max(...categories.map(x => x.order || 0)) : 0) + 1
      : c.order;
    try {
      // daysOfWeek preservado pra retrocompatibilidade com docs antigos no Firestore
      // (recorrência real agora vive em weekdayTemplates via per-task chips no Ritual)
      await saveCategory(id, { name, icon: pickedIcon, color: pickedColor, order, daysOfWeek: c.daysOfWeek || ALL_DAYS });
      categories = await getCategories();
      renderCats();
      close();
      showToast(isNew ? 'Atividade criada' : 'Atividade atualizada', 'success');
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 9: HELPERS UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════
function dowSummary(days) {
  if (!days || !days.length) return 'Nenhum dia selecionado';
  const sorted = [...days].sort();
  if (sorted.length === 7) return 'Todos os dias';
  if (sorted.length === 5 && sorted.every((d,i) => d === [1,2,3,4,5][i])) return 'Dias úteis (Seg–Sex)';
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Fim de semana';
  const names = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  return sorted.map(d => names[d]).join(' · ');
}

function themeIconSVG() {
  // Círculo dividido em diagonal — metade dia + metade noite
  // SEM ring interno (a borda do botão já faz o contorno)
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="diaSide"><polygon points="2,2 22,2 22,22"/></clipPath>
        <clipPath id="noiteSide"><polygon points="2,2 2,22 22,22"/></clipPath>
      </defs>
      <circle cx="12" cy="12" r="10" class="theme-half theme-dia" clip-path="url(#diaSide)"/>
      <circle cx="12" cy="12" r="10" class="theme-half theme-noite" clip-path="url(#noiteSide)"/>
    </svg>
  `;
}

function escape(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function hexA(hex, a) {
  if (!hex) return `rgba(167,139,250,${a})`;
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0,2), 16), g = parseInt(m[1].slice(2,4), 16), b = parseInt(m[1].slice(4,6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
