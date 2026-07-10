// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getDay, setDayMeta, getDayTasks, addDayTask, updateDayTask, deleteDayTask, fetchDaysRange, getShifts,
  getProfile, setProfile,
  dayId, sleepDuration, formatTime
} from './store.js';
import { scheduleNotif, notifTag, requestPermission } from './notifications.js';
import { t, getLang } from './i18n.js';

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: INIT — injeta o pet no DOM (uma vez por sessão)
// ═══════════════════════════════════════════════════════════════
export function initPet() {
  if (document.getElementById('visao-pet')) return;
  document.body.insertAdjacentHTML('beforeend', buildPetHTML());
  attachHandlers();
  scheduleBlink();
}

export function showPet() {
  const el = document.getElementById('visao-pet');
  if (el) el.classList.remove('pet-hidden');
}

export function hidePet() {
  closeChatPanel();
  const el = document.getElementById('visao-pet');
  if (el) el.classList.add('pet-hidden');
}

export function openPetChat() {
  showPet();
  setTimeout(openChatPanel, 60);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESTADOS — idle | sleeping | excited | thinking
// ═══════════════════════════════════════════════════════════════
export function setPetState(state) {
  const el = document.getElementById('visao-pet');
  if (el) el.dataset.state = state;
}

export function setBadge(count) {
  const badge = document.getElementById('pet-badge');
  if (!badge) return;
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: HTML DO PET
// ═══════════════════════════════════════════════════════════════
function buildPetHTML() {
  return `
<div id="visao-pet" data-state="idle" class="pet-hidden">

  <!-- Painel de chat -->
  <div id="pet-chat" class="pet-chat">

    <div class="pet-chat-header">
      <div class="pet-chat-title">
        <div class="pet-eye-mini"></div>
        <span>Falcon</span>
      </div>
      <button class="pet-chat-close" id="pet-chat-close" aria-label="${t('pet.close')}">×</button>
    </div>

    <!-- Atalhos rápidos -->
    <div class="pet-quick-actions" id="pet-quick-actions">
      <button class="pet-qa-btn" data-pet-cmd="sleep">🌙 ${t('pet.qa.sleep')}</button>
      <button class="pet-qa-btn" data-pet-cmd="streak">🔥 ${t('pet.qa.streak')}</button>
      <button class="pet-qa-btn" data-pet-cmd="water">💧 ${t('pet.qa.water')}</button>
      <button class="pet-qa-btn" data-pet-cmd="tasks">✅ ${t('pet.qa.tasks')}</button>
    </div>

    <div class="pet-chat-messages" id="pet-messages">
      <div class="pet-msg pet-msg-bot">
        <span>${t('pet.greeting')}</span>
      </div>
    </div>

    <div id="pet-input-row" class="pet-chat-input-row">
      <textarea
        id="pet-input"
        class="pet-input"
        placeholder="${t('pet.placeholder')}"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="sentences"
        rows="1"
      ></textarea>
      <button class="pet-mic-btn" id="pet-mic-btn" title="${t('pet.mic.title')}" aria-label="${t('pet.mic.label')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <button class="pet-send-btn" id="pet-send-btn" aria-label="${t('pet.send')}">➤</button>
    </div>
    <div id="pet-recording-bar" class="pet-recording-bar" style="display:none">
      <canvas id="pet-waveform" class="pet-waveform"></canvas>
      <button id="pet-rec-cancel" class="pet-rec-cancel" aria-label="${t('pet.cancel')}">×</button>
      <button id="pet-rec-confirm" class="pet-rec-confirm" aria-label="${t('pet.confirm')}">✓</button>
    </div>
  </div>

  <!-- Corpo do pet — O OLHO INTEIRO -->
  <div class="pet-body" id="pet-body" role="button" aria-label="${t('pet.open')}" tabindex="0">
    <div id="pet-badge" class="pet-badge" style="display:none">1</div>
    <svg class="pet-eye-svg" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="30" r="30" fill="#0d0d0d"/>
      <g class="pet-iris-group">
        <circle cx="30" cy="30" r="27" fill="#eab308"/>
        <ellipse cx="30" cy="30" rx="7" ry="12" fill="#0d0d0d" class="pet-pupil"/>
        <circle cx="37" cy="22" r="4.5" fill="white" opacity="0.75"/>
        <circle cx="22" cy="26" r="2" fill="white" opacity="0.35"/>
      </g>
      <ellipse cx="30" cy="0" rx="32" ry="22" fill="#7c3aed" class="pet-lid-top"/>
      <ellipse cx="30" cy="60" rx="32" ry="22" fill="#7c3aed" class="pet-lid-bot"/>
    </svg>
    <div class="pet-zzz" aria-hidden="true">
      <span style="--d:0s">z</span>
      <span style="--d:0.5s">z</span>
      <span style="--d:1s">Z</span>
    </div>
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: HANDLERS — click, fechar, atalhos, Enter
// ═══════════════════════════════════════════════════════════════
function resizePetInput(el) {
  el.style.height = '0px';
  requestAnimationFrame(() => {
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  });
}

function attachHandlers() {
  document.getElementById('pet-body').addEventListener('click', toggleChat);
  document.getElementById('pet-body').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') toggleChat();
  });
  document.getElementById('pet-chat-close').addEventListener('click', closeChatPanel);
  document.getElementById('pet-send-btn').addEventListener('click', handleSend);
  const petInput = document.getElementById('pet-input');
  petInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  petInput.addEventListener('input', () => resizePetInput(petInput));
  document.getElementById('pet-mic-btn').addEventListener('click', startMic);
  document.getElementById('pet-rec-cancel').addEventListener('click', stopMicCancel);
  document.getElementById('pet-rec-confirm').addEventListener('click', stopMicConfirm);

  // Atalhos rápidos via data-pet-cmd (chama função diretamente, sem passar pelo NLP)
  let qaDispatching = false;
  document.getElementById('pet-quick-actions').addEventListener('click', async e => {
    const btn = e.target.closest('.pet-qa-btn');
    if (!btn || qaDispatching) return;
    qaDispatching = true;
    setPetState('thinking');
    try {
      const cmd = btn.dataset.petCmd;
      let reply;
      if (cmd === 'sleep')  reply = await cmdSono();
      else if (cmd === 'streak') reply = await cmdSequencia();
      else if (cmd === 'water')  reply = await cmdHidratacao();
      else if (cmd === 'tasks')  reply = await cmdTarefas();
      if (reply) addMessage(reply, 'bot');
    } catch (err) {
      addMessage(t('pet.error.general'), 'bot');
    } finally {
      setPetState('idle');
      qaDispatching = false;
    }
  });
}

function toggleChat() {
  const chat = document.getElementById('pet-chat');
  chat.classList.contains('pet-chat-open') ? closeChatPanel() : openChatPanel();
}

function openChatPanel() {
  document.getElementById('pet-chat').classList.add('pet-chat-open');
  setBadge(0);
  setPetState('idle');
  setTimeout(() => document.getElementById('pet-input')?.focus(), 220);
}

function closeChatPanel() {
  if (recording) stopMicCancel();
  document.getElementById('pet-chat')?.classList.remove('pet-chat-open');
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: SEND + ESTADO DE CONVERSA
// ═══════════════════════════════════════════════════════════════
let convState = null;

async function handleSend() {
  const input = document.getElementById('pet-input');
  const text  = (input?.value || '').trim();
  if (!text) return;
  input.value = '';
  resizePetInput(input);
  addMessage(text, 'user');
  await dispatchCommand(text);
}

async function dispatchCommand(text) {
  setPetState('thinking');
  try {
    const reply = await routeCommand(text.trim());
    if (reply) addMessage(reply, 'bot');
  } catch (err) {
    addMessage(t('pet.error.general'), 'bot');
    console.error('[pet]', err);
  } finally {
    setPetState('idle');
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: ROTEADOR DE COMANDOS
// ═══════════════════════════════════════════════════════════════

// Verbos que indicam intenção de registrar algo (PT + EN)
const REGISTER_TRIGGERS = /^(marca[rh]?|agenda[rh]?|registra[rh]?|schedule|register)\b/i;

async function routeCommand(text) {
  const tl = text.toLowerCase();

  // ── Continua conversa em andamento ──
  if (convState?.type === 'waiting_name') {
    const name = text;
    const date = convState.date || new Date();
    convState = null;
    return askType(name, date);
  }

  if (convState?.type === 'waiting_type') {
    const { name, date, time } = convState;
    const d = date || new Date();
    if (/^(ativ|já fiz|feito|conclu|sim.*ativ|activity|done|already)/i.test(tl) || /atividade|activity/i.test(tl)) {
      convState = null;
      showRegistroPreview(name, true, d, time || '');
      return null;
    }
    if (/^(comp|vou|vou fazer|não fiz|pendente|sim.*comp|commitment|will do|todo)/i.test(tl) || /compromisso|commitment/i.test(tl)) {
      if (!time) {
        convState = { type: 'waiting_time', name, date: d };
        return t('pet.ask.time');
      }
      convState = null;
      showRegistroPreview(name, false, d, time);
      return null;
    }
    return t('pet.ask.type');
  }

  if (convState?.type === 'waiting_time') {
    const { name, date } = convState;
    const time = extractTime(text);
    if (!time) return t('pet.ask.time.invalid');
    convState = null;
    showRegistroPreview(name, false, date, time);
    return null;
  }

  // ── Consultas (PT + EN) ──
  if (/dormi|sono|horas de sono|acordei|sleep|how.*sleep|woke.*up/i.test(tl))         return cmdSono();
  if (/sequência|sequencia|streak|seguidos|consecutiv|in.*row/i.test(tl))              return cmdSequencia();
  if (/hidrat|água|agua|beber|bebi|\bml\b|water|hydrat|drink/i.test(tl))               return cmdHidratacao();
  if (/tarefas?|to.?do|lista de hoje|o que tenho|tasks?|my tasks/i.test(tl) && !REGISTER_TRIGGERS.test(tl)) return cmdTarefas();
  if (/ajuda|help|comando|o que (você|vc) (faz|sabe)|what can you/i.test(tl))          return cmdAjuda();


  // ── Intenção de registrar ──
  if (REGISTER_TRIGGERS.test(tl)) {
    const targetDate    = extractDate(text);
    const tipoExplicito = /\bcompromisso\b|commitment/i.test(tl)             ? 'compromisso'
                        : /\batividade\b|\btarefa\b|activity|task/i.test(tl)  ? 'atividade'
                        : null;
    const taskTime = extractTime(text);
    const nameRaw  = extractTaskName(text);

    if (!nameRaw) {
      convState = { type: 'waiting_name', date: targetDate, time: taskTime };
      return t('pet.ask.name');
    }
    if (tipoExplicito === 'compromisso') {
      if (!taskTime) {
        convState = { type: 'waiting_time', name: nameRaw, date: targetDate };
        return t('pet.ask.time');
      }
      showRegistroPreview(nameRaw, false, targetDate, taskTime);
      return null;
    }
    if (tipoExplicito === 'atividade') { showRegistroPreview(nameRaw, true, targetDate, taskTime); return null; }
    return askType(nameRaw, targetDate, taskTime);
  }

  // ── Editar nome / horário / reagendar (tipo obrigatório: compromisso | tarefa) ──
  const mNome = text.match(/^editar?\s+nome\s+(?:d[oa]s?\s+)?(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mNome) { await cmdEditarNome(mNome[2].trim(), mNome[3].trim(), mNome[1].toLowerCase()); return null; }

  const mHora = text.match(/^editar?\s+(?:hor[aá]rio|hora|time)\s+(?:d[oa]s?\s+)?(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mHora) { await cmdEditarHorario(mHora[2].trim(), mHora[3].trim(), mHora[1].toLowerCase()); return null; }

  const mResched = text.match(/^(?:reagend[ae]r?|reschedule|mover?)\s+(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mResched) { await cmdReatgendar(mResched[2].trim(), mResched[3].trim(), mResched[1].toLowerCase()); return null; }

  // Editar genérico: "editar compromisso X para Y" → detecta horário vs nome automaticamente
  const mEdit = text.match(/^editar?\s+(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mEdit) {
    const tipo = mEdit[1].toLowerCase(), hint = mEdit[2].trim(), afterPara = mEdit[3].trim();
    const hasTime = !!extractTime(afterPara);
    const hasDate = /\b(hoje|aman[hã]|segunda|ter[çc][aã]|quarta|quinta|sexta|s[aá]bado|domingo|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|\d{1,2}\/\d{1,2})\b/i.test(afterPara);
    if (hasDate && !hasTime) { await cmdReatgendar(hint, afterPara, tipo); return null; }
    if (hasTime) { await cmdEditarHorario(hint, afterPara, tipo); return null; }
    await cmdEditarNome(hint, afterPara, tipo); return null;
  }

  return t('pet.unknown');
}

// Extrai horário da frase → "HH:MM" ou '' se não encontrar
function extractTime(text) {
  const tl = text.toLowerCase();
  let m;

  // Palavras especiais: meia noite / meio dia (com minutos opcionais)
  if (/\bmeia[\s-]?noite\s+e\s+meia\b/.test(tl)) return '00:30';
  m = tl.match(/\bmeia[\s-]?noite\s+e\s+(\d{1,2})\b/);
  if (m) return `00:${String(parseInt(m[1])).padStart(2,'0')}`;
  if (/\bmeia[\s-]?noite\b/.test(tl)) return '00:00';

  if (/\bmeio[\s-]?dia\s+e\s+meia\b/.test(tl)) return '12:30';
  m = tl.match(/\bmeio[\s-]?dia\s+e\s+(\d{1,2})\b/);
  if (m) return `12:${String(parseInt(m[1])).padStart(2,'0')}`;
  if (/\bmeio[\s-]?dia\b/.test(tl)) return '12:00';

  // Formatos numéricos
  m = tl.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  m = tl.match(/\b(\d{1,2})h(\d{2})\b/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  m = tl.match(/\b(?:às?|as|at)\s+(\d{1,2})\s*h(?:oras?)?\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  m = tl.match(/\b(?:às?|as|at)\s+(\d{1,2})\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  m = tl.match(/\b(\d{1,2})\s*h(?:oras?)?\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  m = tl.match(/\b(\d{1,2})\s+e\s+(\d{1,2})\b/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59)
      return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  return '';
}

// Extrai o nome da tarefa limpando verbos, artigos, tipo, data e horário
function extractTaskName(text) {
  const result = text
    .replace(/^(marca[rh]?|agenda[rh]?|registra[rh]?|schedule|register)\s*/i, '')
    .replace(/^(um|uma|o|a|a|an|the)\s+/i, '')
    .replace(/\b(pra mim|para mim|for me)\b/gi, '')
    .replace(/\b(tarefa|compromisso|atividade|commitment|activity|task)\b\s*/gi, '')
    .replace(/depois\s+de\s+aman(h[ãa]|ha)\s*/gi, '')
    .replace(/aman(h[ãa]|ha)\s*/gi, '')
    .replace(/\b(hoje|agora|today|now)\b\s*/gi, '')
    .replace(/\btomorrow\b\s*/gi, '')
    .replace(/\b(próxim[oa]\s+)?(dom(ingo)?|seg(unda(-feira)?)?|ter(([cç][aã]|ca)(-feira)?)?|qua(rta(-feira)?)?|qui(nta(-feira)?)?|sex(ta(-feira)?)?|s[aá]b(ado)?)\b\s*/gi, '')
    .replace(/\b(next\s+)?(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b\s*/gi, '')
    .replace(/\bdia\s+(?=\d)/gi, '')
    .replace(/\(?\b\d{1,2}\/\d{1,2}\)?\s*/g, '')
    .replace(/^(para|pra|de|do|da|no|na|for|to|on)\s+/i, '')
    .replace(/(?:às?|as|das?|at|para\s+as?|pra\s+as?)\s+\d{1,2}(?:[h:]\d{2}|\s*h(?:oras?)?)?\b/gi, '')
    .replace(/\b(ao\s+|à\s+)?meio[\s-]?dia(\s+e\s+(meia|\d{1,2}))?\b/gi, '')
    .replace(/\b(à\s+)?meia[\s-]?noite(\s+e\s+(meia|\d{1,2}))?\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\b\d{1,2}h\d{2}\b/gi, '')
    .replace(/\b\d{1,2}\s*h(?:oras?)?\b/gi, '')
    .replace(/\bhoras?\b/gi, '')
    .replace(/ às /gi, ' ').replace(/ às$/gi, '').replace(/^às /gi, '')
    .replace(/ as /gi, ' ').replace(/ as$/gi, '').replace(/^as /gi, '')
    .replace(/ das /gi, ' ').replace(/ das$/gi, '').replace(/^das /gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?]+$/, '')
    .trim();
  return result ? result.charAt(0).toUpperCase() + result.slice(1) : result;
}

function dateOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function extractDate(text) {
  const tl = text.toLowerCase();

  const dmMatch = tl.match(/\(?\b(\d{1,2})\/(\d{1,2})\)?/);
  if (dmMatch) {
    const day   = parseInt(dmMatch[1], 10);
    const month = parseInt(dmMatch[2], 10) - 1;
    const now   = new Date();
    const d     = new Date(now.getFullYear(), month, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  if (/depois\s+de\s+aman(h[ãa]|ha)|day after tomorrow/i.test(tl)) return dateOffset(2);
  if (/aman(h[ãa]|ha)|tomorrow/i.test(tl))                          return dateOffset(1);
  if (/\bhoje\b|\btoday\b/i.test(tl))                               return new Date();

  const WD_MAP = [
    [/\bdom(ingo)?|\bsun(day)?\b/i,                            0],
    [/\bseg(unda(-feira)?)?\b|\bmon(day)?\b/i,                 1],
    [/\bter([cç][aã](-feira)?|ca(-feira)?)?\b|\btue(sday)?\b/i,2],
    [/\bqua(rta(-feira)?)?\b|\bwed(nesday)?\b/i,               3],
    [/\bqui(nta(-feira)?)?\b|\bthu(rsday)?\b/i,                4],
    [/\bsex(ta(-feira)?)?\b|\bfri(day)?\b/i,                   5],
    [/\bs[aá]b(ado)?\b|\bsat(urday)?\b/i,                      6],
  ];
  for (const [re, wd] of WD_MAP) {
    if (re.test(tl)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let diff = (wd - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return dateOffset(diff);
    }
  }

  return new Date();
}

function isToday(date) {
  return dayId(date) === dayId(new Date());
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8: HANDLERS DE COMANDOS
// ═══════════════════════════════════════════════════════════════

async function calcStreak() {
  const profile  = await getProfile();
  const originId = profile?.streakOrigin || null;
  const origin   = originId ? (() => {
    const [y, m, d] = originId.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  })() : null;

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    if (origin && cursor < origin) break;
    const id  = dayId(cursor);
    const doc = await getDay(id);
    if (!doc) break;
    const isActive = doc.hasActivity || (doc.hydrationMl || 0) > 0 || !!doc.sleepTime
      || Object.keys(doc).some(k => k !== 'id' && k !== 'generated');
    if (!isActive) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function calcWeekFailures() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromMon = (today.getDay() + 6) % 7;
  const weekStart   = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMon);

  let failed = 0;
  const cursor = new Date(weekStart);
  while (cursor <= today) {
    const doc      = await getDay(dayId(cursor));
    const isActive = doc && (doc.hasActivity || (doc.hydrationMl || 0) > 0 || !!doc.sleepTime);
    if (!isActive) failed++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return failed;
}

async function consistenciaBlock() {
  const [streak, failed] = await Promise.all([calcStreak(), calcWeekFailures()]);
  const weekPart   = failed === 0
    ? t('pet.streak.perfect')
    : t('pet.streak.failed', { n: failed });
  const streakPart = streak === 0
    ? t('pet.streak.none')
    : t('pet.streak.days', { n: streak });
  return `${weekPart} ${streakPart}`;
}

async function cmdSono() {
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [todayDoc, yestDoc] = await Promise.all([
    getDay(dayId(today)),
    getDay(dayId(yesterday))
  ]);

  const wake  = todayDoc?.wakeTime;
  const sleep = yestDoc?.sleepTime;

  let sleepMsg;
  if (!wake && !sleep) {
    sleepMsg = t('pet.sleep.none');
  } else if (!wake) {
    sleepMsg = t('pet.sleep.no.wake', { sleep });
  } else if (!sleep) {
    sleepMsg = t('pet.sleep.no.sleep', { wake });
  } else {
    const mins = sleepDuration(sleep, wake);
    if (!mins) {
      sleepMsg = t('pet.sleep.no.calc');
    } else {
      const h   = Math.floor(mins / 60);
      const m   = mins % 60;
      const rating = mins >= 420 ? t('pet.sleep.good') : mins >= 360 ? t('pet.sleep.ok') : t('pet.sleep.bad');
      sleepMsg = t('pet.sleep.result', { h, m: m > 0 ? m + 'min' : '', sleep, wake, rating });
    }
  }

  const consist = await consistenciaBlock();
  return `${sleepMsg}<br><br>${consist}`;
}

async function cmdSequencia() {
  const consist = await consistenciaBlock();
  return `🔥 ${consist}`;
}


async function cmdHidratacao() {
  const day = await getDay(dayId(new Date()));
  if (!day) return t('pet.hydration.none');

  const ml        = day.hydrationMl   || 0;
  const goal      = day.hydrationGoal || 2000;
  const pct       = Math.min(100, Math.round((ml / goal) * 100));
  const remaining = Math.max(0, goal - ml);

  const status  = remaining === 0 ? t('pet.hydration.goal') : t('pet.hydration.remaining', { remaining });
  const barHtml = `<div style="margin:6px 0;height:8px;border-radius:4px;background:var(--border);overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width .3s"></div></div>`;
  return `${t('pet.hydration.result', { ml, goal, pct })}${barHtml}${status}`;
}

async function cmdTarefas() {
  const tasks = await getDayTasks(dayId(new Date()));
  if (!tasks.length) return t('pet.tasks.none');

  const feitas    = tasks.filter(tk => tk.done);
  const pendentes = tasks.filter(tk => !tk.done);

  let msg = `${t('pet.tasks.result', { done: feitas.length, total: tasks.length })}`;
  if (feitas.length)    msg += '<br>' + feitas.map(tk => `✅ ${tk.title}`).join('<br>');
  if (pendentes.length) msg += '<br>' + pendentes.map(tk => `⬜ ${tk.title}`).join('<br>');
  return msg;
}

function askType(name, date = new Date(), time = '') {
  convState = { type: 'waiting_type', name, date, time };
  const dd    = date.getDate().toString().padStart(2, '0');
  const mm    = (date.getMonth() + 1).toString().padStart(2, '0');
  const dow   = new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(date);
  const label = isToday(date) ? t('pet.type.today') : `${dow} (${dd}/${mm})`;
  addChoices(
    `"<strong>${name}</strong>" ${t('pet.ask.for')} <strong>${label}</strong>${time ? ` · <strong>${time}</strong>` : ''} — ${t('pet.ask.type.question')}`,
    [
      { label: t('pet.type.activity.btn'), value: 'atividade' },
      { label: t('pet.type.commitment.btn'), value: 'compromisso' }
    ]
  );
  return null;
}

function petGCalUrl(name, date, time) {
  const y  = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d  = date.getDate();
  const [h, mi] = time.split(':').map(Number);
  const pad     = n => String(n).padStart(2, '0');
  const ds      = `${y}${pad(mo)}${pad(d)}`;
  const params  = new URLSearchParams({
    action: 'TEMPLATE', text: name,
    dates: `${ds}T${pad(h)}${pad(mi)}00/${ds}T${pad(Math.min(h+1,23))}${pad(mi)}00`,
    details: '⏰ Role até 🔔 Adicionar notificação e configure antes de salvar.\n\nRegistrado no Falcon.',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function showRegistroPreview(name, done, date = new Date(), time = '') {
  const dd        = date.getDate().toString().padStart(2, '0');
  const mm        = (date.getMonth() + 1).toString().padStart(2, '0');
  const dow       = new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(date);
  const hoje      = new Date(); hoje.setHours(0,0,0,0);
  const alvo      = new Date(date); alvo.setHours(0,0,0,0);
  const diff      = Math.round((alvo - hoje) / 86400000);
  const quandoLabel = diff === 0 ? `${t('pet.type.today')}, ${dow} (${dd}/${mm})`
                    : diff === 1 ? `${t('pet.type.tomorrow')}, ${dow} (${dd}/${mm})`
                    : `${dow} (${dd}/${mm})`;

  const tipoIcon  = done ? '✅' : '📌';
  const tipoLabel = done ? t('pet.type.activity') : t('pet.type.commitment');

  const box = document.getElementById('pet-messages');
  if (!box) return;

  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card">
      <span class="pet-preview-title">${tipoIcon} <strong>${name}</strong></span>
      <span class="pet-preview-sub">${quandoLabel}${time ? ` · ${time}` : ''} · ${tipoLabel}</span>
      <button class="pet-reg-btn">${tipoIcon} ${t('pet.preview.register', { type: tipoLabel })}</button>
    </span>`;

  const btn = div.querySelector('.pet-reg-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = t('pet.preview.registering');
    try {
      await executeRegistro(name, done, date, time);
      btn.textContent = t('pet.preview.done');
      btn.classList.add('pet-reg-done');
      if (done) { setPetState('excited'); setTimeout(() => setPetState('idle'), 1800); }
      showCenterToast(t(done ? 'pet.registered.activity' : 'pet.registered.commitment'));
      if (time) {
        const [h, mi]  = time.split(':').map(Number);
        const ts       = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi).getTime();
        const tag      = notifTag(dayId(date), name);
        const result   = await scheduleNotif({ title: name, body: done ? t('notif.body.activity', { title: name }) : t('notif.body.commitment', { title: name }), tag, timestamp: ts });
        if (result === 'scheduled') {
          setTimeout(() => addMessage(t('pet.notif.scheduled', { time }), 'bot'), 350);
        } else {
          const gcalUrl = petGCalUrl(name, date, time);
          const hint = result === 'denied' ? t('pet.notif.blocked') : t('pet.notif.gcal.hint');
          setTimeout(() => addMessage(
            `${hint}<br><a class="pet-gcal-link" href="${gcalUrl}" target="_blank" rel="noopener">${t('pet.gcal.btn')}</a>`,
            'bot'
          ), 350);
        }
      } else if (!done) {
        const gcalUrl = petGCalUrl(name, date, '09:00');
        setTimeout(() => addMessage(
          `${t('pet.gcal.prompt')}<br><a class="pet-gcal-link" href="${gcalUrl}" target="_blank" rel="noopener">${t('pet.gcal.btn')}</a>`,
          'bot'
        ), 350);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `${tipoIcon} ${t('pet.preview.register', { type: tipoLabel })}`;
      addMessage(t('pet.error.register'), 'bot');
      console.error('[pet] registro:', err);
    }
  });

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function executeRegistro(name, done, date, time = '') {
  const targetId = dayId(date);
  const [, tasks, shifts] = await Promise.all([
    setDayMeta(targetId, {}),
    getDayTasks(targetId),
    getShifts(),
  ]);
  await addDayTask(targetId, {
    title: name,
    done,
    kind: done ? 'task' : 'commitment',
    startTime: time,
    order: tasks.length,
    desc: '',
    icon: '',
    categoryId: null,
    shiftId: pickShift(shifts, time),
    reminderEnabled: false,
  });
}

// Escolhe o turno pelo horário — compara contra nomes armazenados em PT no Firestore
function pickShift(shifts, time) {
  if (!shifts.length) return null;
  if (!time) return shifts[0].id;
  const [h] = time.split(':').map(Number);
  const name = h >= 5 && h < 12 ? 'Manhã' : h >= 12 && h < 19 ? 'Tarde' : 'Noite';
  return (shifts.find(s => s.name === name) || shifts[0]).id;
}

function showCenterToast(message) {
  const el = document.createElement('div');
  el.className = 'pet-center-toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pet-center-toast-show'));
  setTimeout(() => {
    el.classList.remove('pet-center-toast-show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

function cmdAjuda() {
  return t('pet.help');
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.5: EDIÇÃO E REAGENDAMENTO VIA PET
// ═══════════════════════════════════════════════════════════════

function cleanSearchHint(hint) {
  return hint
    .replace(/\b(de\s+|do\s+|da\s+)?(hoje|aman[hã]|agora|now|today|tomorrow)\b/gi, '')
    .replace(/\b(próxim[ao]\s+)?(seg(unda(-feira)?)?|ter([çc][aã](-feira)?)?|qua(rta(-feira)?)?|qui(nta(-feira)?)?|sex(ta(-feira)?)?|s[aá]b(ado)?|dom(ingo)?)\b/gi, '')
    .replace(/\bàs?\s+\d{1,2}[h:]\d*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchTasksByName(hint, tipo) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past   = new Date(today); past.setDate(today.getDate() - 3);
  const future = new Date(today); future.setDate(today.getDate() + 14);
  const days = await fetchDaysRange(past, future);
  const q = cleanSearchHint(hint).toLowerCase();
  const isComp = tipo && /compromisso|commitment/.test(tipo);
  const results = [];
  for (const day of days) {
    for (const task of (day.tasks || [])) {
      if (task.done || task.cancelled) continue;
      if (tipo) {
        if (isComp && task.kind !== 'commitment') continue;
        if (!isComp && task.kind === 'commitment') continue;
      }
      if (task.title.toLowerCase().includes(q)) {
        const [y, m, d] = day.id.split('-').map(Number);
        results.push({ task, dayDocId: day.id, date: new Date(y, m - 1, d) });
      }
    }
  }
  return results;
}

async function cmdEditarNome(nameHint, newName, tipo) {
  const matches = await searchTasksByName(nameHint, tipo);
  if (!matches.length) { addMessage(t('pet.edit.notfound', { name: nameHint }), 'bot'); return; }
  showEditCard(matches, 'rename', { newName });
}

async function cmdEditarHorario(nameHint, afterPara, tipo) {
  const newTime = extractTime(afterPara);
  if (!newTime) { addMessage(t('pet.ask.time.invalid'), 'bot'); return; }
  const matches = await searchTasksByName(nameHint, tipo);
  if (!matches.length) { addMessage(t('pet.edit.notfound', { name: nameHint }), 'bot'); return; }
  showEditCard(matches, 'time', { newTime });
}

async function cmdReatgendar(nameHint, afterPara, tipo) {
  const newDate = extractDate(afterPara);
  const newTime = extractTime(afterPara);
  const matches = await searchTasksByName(nameHint, tipo);
  if (!matches.length) { addMessage(t('pet.edit.notfound', { name: nameHint }), 'bot'); return; }
  showEditCard(matches, 'reschedule', { newDate, newTime });
}

function showEditCard(matches, action, payload) {
  const box = document.getElementById('pet-messages');
  if (!box) return;

  function fmtDate(date) {
    const dd  = date.getDate().toString().padStart(2, '0');
    const mm  = (date.getMonth() + 1).toString().padStart(2, '0');
    const dow = new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(date);
    return `${dow} ${dd}/${mm}`;
  }

  function applyEdit(match, btn) {
    btn.disabled = true;
    btn.textContent = t('pet.edit.updating');
    const { task, dayDocId } = match;
    const reschedCount = (task.rescheduleCount || 0) + 1;

    let p;
    if (action === 'rename') {
      p = updateDayTask(dayDocId, task.id, { title: payload.newName });
    } else if (action === 'time') {
      p = updateDayTask(dayDocId, task.id, { startTime: payload.newTime, rescheduled: true, rescheduleCount: reschedCount });
    } else {
      const newDayId = dayId(payload.newDate);
      const newTime  = payload.newTime || task.startTime || '';
      if (newDayId === dayDocId) {
        p = updateDayTask(dayDocId, task.id, { startTime: newTime, rescheduled: true, rescheduleCount: reschedCount });
      } else {
        const { id: _drop, ...rest } = task;
        p = deleteDayTask(dayDocId, task.id).then(() =>
          addDayTask(newDayId, { ...rest, startTime: newTime, rescheduled: true, rescheduleCount: reschedCount, done: false, cancelled: false, order: 0 })
        );
      }
    }

    p.then(() => {
      btn.textContent = t('pet.edit.done');
      btn.classList.add('pet-reg-done');
      showCenterToast(t('pet.edit.done'));
      setPetState('excited');
      setTimeout(() => setPetState('idle'), 1800);
    }).catch(err => {
      btn.disabled = false;
      btn.textContent = '↺ ' + t('pet.edit.err');
      console.error('[pet] edit:', err);
    });
  }

  function makeBtn(match) {
    const { task, date } = match;
    const btn = document.createElement('button');
    btn.className = 'pet-reg-btn';
    if (action === 'rename') {
      btn.textContent = `✏️ "${task.title}" → "${payload.newName}"`;
    } else if (action === 'time') {
      btn.textContent = `⏰ "${task.title}" · ${fmtDate(date)} → ${payload.newTime}`;
    } else {
      btn.textContent = `📅 "${task.title}" → ${fmtDate(payload.newDate)}${payload.newTime ? ' · ' + payload.newTime : ''}`;
    }
    btn.addEventListener('click', () => applyEdit(match, btn));
    return btn;
  }

  const div  = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  const card = document.createElement('span');
  card.className = 'pet-preview-card';

  if (matches.length > 1) {
    const sub = document.createElement('span');
    sub.className = 'pet-preview-sub';
    sub.textContent = t('pet.edit.ambiguous', { n: matches.length });
    card.appendChild(sub);
  }

  for (const match of matches) card.appendChild(makeBtn(match));
  div.appendChild(card);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 9: HELPERS DE MENSAGEM
// ═══════════════════════════════════════════════════════════════
function addMessage(html, type) {
  const box = document.getElementById('pet-messages');
  if (!box) return;
  const div  = document.createElement('div');
  div.className = `pet-msg pet-msg-${type}`;
  const span = document.createElement('span');
  if (type === 'bot') {
    span.innerHTML = html;
  } else {
    span.textContent = html;
  }
  div.appendChild(span);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function addChoices(label, choices) {
  const box = document.getElementById('pet-messages');
  if (!box) return;

  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';

  const span = document.createElement('span');
  span.innerHTML = label;

  const choicesEl = document.createElement('div');
  choicesEl.className = 'pet-choices';

  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'pet-choice-btn';
    btn.textContent = c.label;
    btn.addEventListener('click', () => {
      div.querySelectorAll('.pet-choice-btn').forEach(b => {
        b.disabled = true;
        b.classList.add('pet-choice-used');
      });
      btn.classList.add('pet-choice-selected');
      dispatchCommand(c.value);
    });
    choicesEl.appendChild(btn);
  });

  span.appendChild(choicesEl);
  div.appendChild(span);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 10: MICROFONE — waveform visual + continuous recognition
// ═══════════════════════════════════════════════════════════════
let recognition  = null;
let waveAnimId   = null;
let accumulated  = '';
let recording    = false;
let confirming   = false;
let voiceActive  = false;
let voiceTimer   = null;

async function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMessage(t('pet.error.mic.unsupported'), 'bot'); return; }
  if (recording) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(tk => tk.stop());
      await new Promise(r => setTimeout(r, 80));
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      addMessage(denied ? t('pet.error.mic.blocked') : t('pet.error.mic.access'), 'bot');
      return;
    }
  }

  accumulated = '';
  recording   = true;
  confirming  = false;
  let abortCount = 0;

  function buildRecognition() {
    const r = new SR();
    r.lang           = getLang();
    r.continuous     = false;
    r.interimResults = true;

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) accumulated += e.results[i][0].transcript + ' ';
      }
      voiceActive = true;
      clearTimeout(voiceTimer);
      voiceTimer = setTimeout(() => { voiceActive = false; }, 250);
    };

    r.onend = () => {
      if (confirming) {
        confirming  = false;
        recording   = false;
        recognition = null;
        const clean = formatTranscript(accumulated.trim());
        accumulated = '';
        const inp   = document.getElementById('pet-input');
        if (inp && clean) { inp.value = clean; requestAnimationFrame(() => { resizePetInput(inp); inp.focus(); }); }
        teardownMic();
        hideRecordingUI();
        setPetState('idle');
      } else if (recording) {
        try {
          recognition = buildRecognition();
          recognition.start();
        } catch (_) {
          recording   = false;
          recognition = null;
          teardownMic();
          hideRecordingUI();
          setPetState('idle');
        }
      } else {
        recognition = null;
      }
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech') return;
      if (e.error === 'aborted') {
        abortCount++;
        if (abortCount <= 3) return;
      }
      if (e.error === 'audio-capture' || e.error === 'not-allowed') {
        addMessage(t('pet.error.mic.blocked'), 'bot');
      }
      recording   = false;
      recognition = null;
      accumulated = '';
      teardownMic();
      hideRecordingUI();
      setPetState('idle');
    };

    return r;
  }

  recognition = buildRecognition();
  recognition.start();
  showRecordingUI();
  drawWaveform();
  setPetState('thinking');
}

function stopMicConfirm() {
  if (!recording) return;
  confirming = true;
  if (recognition) {
    recognition.stop();
  } else {
    recording  = false;
    confirming = false;
    const clean = formatTranscript(accumulated.trim());
    accumulated = '';
    const inp   = document.getElementById('pet-input');
    if (inp && clean) { inp.value = clean; requestAnimationFrame(() => { resizePetInput(inp); inp.focus(); }); }
    teardownMic();
    hideRecordingUI();
    setPetState('idle');
  }
}

function stopMicCancel() {
  if (!recording) return;
  recording   = false;
  confirming  = false;
  if (recognition) { recognition.stop(); recognition = null; }
  accumulated = '';
  teardownMic();
  hideRecordingUI();
  setPetState('idle');
}

function teardownMic() {
  cancelAnimationFrame(waveAnimId);
  voiceActive = false;
  clearTimeout(voiceTimer);
}

function showRecordingUI() {
  document.getElementById('pet-input-row').style.display     = 'none';
  document.getElementById('pet-recording-bar').style.display = 'flex';
}

function hideRecordingUI() {
  document.getElementById('pet-recording-bar').style.display = 'none';
  document.getElementById('pet-input-row').style.display     = 'flex';
}

function drawWaveform() {
  const canvas = document.getElementById('pet-waveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 200;
  canvas.height = canvas.offsetHeight || 40;
  const W = canvas.width, H = canvas.height;
  const BAR = 3, GAP = 2, N = Math.floor(W / (BAR + GAP));

  const heights = new Float32Array(N).fill(0.08);
  const targets = new Float32Array(N).fill(0.08);
  let tick = 0;
  let wasActive = false;

  function frame() {
    waveAnimId = requestAnimationFrame(frame);
    tick++;
    const active = voiceActive;
    if (wasActive && !active) {
      for (let i = 0; i < N; i++) targets[i] = 0.04 + Math.random() * 0.08;
    }
    wasActive = active;
    if (tick % (active ? 3 : 12) === 0) {
      const maxH = active ? 0.88 : 0.12;
      const minH = active ? 0.18 : 0.03;
      const start = Math.floor(Math.random() * N * 0.3);
      const len   = Math.floor(N * (active ? 0.4 : 0.15) + Math.random() * N * 0.4);
      for (let i = start; i < Math.min(start + len, N); i++) {
        targets[i] = minH + Math.random() * (maxH - minH);
      }
    }
    ctx.clearRect(0, 0, W, H);
    const totalW = N * (BAR + GAP) - GAP;
    let x = (W - totalW) / 2;
    const speed = active ? 0.35 : (wasActive ? 0.3 : 0.12);
    for (let i = 0; i < N; i++) {
      heights[i] += (targets[i] - heights[i]) * speed;
      const bH = Math.max(3, heights[i] * H * 0.9);
      const y  = (H - bH) / 2;
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, BAR, bH, 1.5);
      else ctx.rect(x, y, BAR, bH);
      ctx.fill();
      x += BAR + GAP;
    }
  }
  frame();
}

function formatTranscript(raw) {
  if (!raw) return '';
  let t = raw.trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  t = t.replace(/([.!?]\s+)([a-zà-ú])/g, (_, p, l) => p + l.toUpperCase());
  return t;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 11: ANIMAÇÃO DO OLHO — pisca no estado idle
// ═══════════════════════════════════════════════════════════════
function scheduleBlink() {
  const delay = 3000 + Math.random() * 2000;
  setTimeout(() => {
    const pet = document.getElementById('visao-pet');
    if (pet?.dataset.state === 'idle') {
      pet.classList.add('pet-blinking');
      setTimeout(() => pet.classList.remove('pet-blinking'), 180);
    }
    scheduleBlink();
  }, delay);
}
