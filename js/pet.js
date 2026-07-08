// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getDay, setDayMeta, getDayTasks, addDayTask, getShifts,
  getProfile, setProfile,
  dayId, sleepDuration, formatTime
} from './store.js';
import { scheduleNotif, notifTag, requestPermission } from './notifications.js';

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

// Abre o pet + painel de chat (chamado pelo botão da home)
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
      <button class="pet-chat-close" id="pet-chat-close" aria-label="Fechar">×</button>
    </div>

    <!-- Atalhos rápidos -->
    <div class="pet-quick-actions" id="pet-quick-actions">
      <button class="pet-qa-btn" data-cmd="quanto dormi?">😴 Sono</button>
      <button class="pet-qa-btn" data-cmd="minha sequência?">🔥 Sequência</button>
      <button class="pet-qa-btn" data-cmd="hidratação de hoje?">💧 Água</button>
      <button class="pet-qa-btn" data-cmd="tarefas de hoje?">📋 Tarefas</button>
    </div>

    <div class="pet-chat-messages" id="pet-messages">
      <div class="pet-msg pet-msg-bot">
        <span>Oi! Toque em um atalho ou digite um comando. Digite <strong>ajuda</strong> para ver tudo.</span>
      </div>
    </div>

    <div id="pet-input-row" class="pet-chat-input-row">
      <textarea
        id="pet-input"
        class="pet-input"
        placeholder="Digite um comando..."
        autocomplete="off"
        autocorrect="off"
        autocapitalize="sentences"
        rows="1"
      ></textarea>
      <button class="pet-mic-btn" id="pet-mic-btn" title="Falar" aria-label="Microfone">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <button class="pet-send-btn" id="pet-send-btn" aria-label="Enviar">➤</button>
    </div>
    <div id="pet-recording-bar" class="pet-recording-bar" style="display:none">
      <canvas id="pet-waveform" class="pet-waveform"></canvas>
      <button id="pet-rec-cancel" class="pet-rec-cancel" aria-label="Cancelar">×</button>
      <button id="pet-rec-confirm" class="pet-rec-confirm" aria-label="Confirmar">✓</button>
    </div>
  </div>

  <!-- Corpo do pet — O OLHO INTEIRO -->
  <div class="pet-body" id="pet-body" role="button" aria-label="Abrir chat do Falcon" tabindex="0">
    <div id="pet-badge" class="pet-badge" style="display:none">1</div>
    <svg class="pet-eye-svg" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- Esclera: preenche o círculo inteiro -->
      <circle cx="30" cy="30" r="30" fill="white"/>
      <!-- Íris + pupila + brilhos movem juntos -->
      <g class="pet-iris-group">
        <circle cx="30" cy="33" r="17" fill="#4f46e5"/>
        <circle cx="30" cy="33" r="10" fill="#080614" class="pet-pupil"/>
        <circle cx="37" cy="26" r="4.5" fill="white" opacity="0.75"/>
        <circle cx="22" cy="29" r="2" fill="white" opacity="0.35"/>
      </g>
      <!-- Pálpebra superior (fecha de cima) -->
      <ellipse cx="30" cy="0" rx="32" ry="22" fill="#7c3aed" class="pet-lid-top"/>
      <!-- Pálpebra inferior (fecha de baixo) -->
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

  // Botões de atalho — guard para evitar disparo duplo por toque
  let qaDispatching = false;
  document.getElementById('pet-quick-actions').addEventListener('click', async e => {
    const btn = e.target.closest('.pet-qa-btn');
    if (!btn || qaDispatching) return;
    qaDispatching = true;
    await dispatchCommand(btn.dataset.cmd);
    qaDispatching = false;
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
  document.getElementById('pet-chat')?.classList.remove('pet-chat-open');
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: SEND + ESTADO DE CONVERSA
// ═══════════════════════════════════════════════════════════════
// convState guarda o contexto da conversa em andamento
// { type: 'waiting_name' }  → aguardando nome do que registrar
// { type: 'waiting_type', name: '...' } → aguardando atividade/compromisso
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
    addMessage('Ocorreu um erro ao buscar seus dados. Tente novamente.', 'bot');
    console.error('[pet]', err);
  } finally {
    setPetState('idle');
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: ROTEADOR DE COMANDOS
// ═══════════════════════════════════════════════════════════════

// Verbos que indicam intenção de registrar algo
const REGISTER_TRIGGERS = /^(marca[rh]?|agenda[rh]?|coloca[rh]?|adiciona[rh]?|cria[rh]?|registra[rh]?|bota[rh]?|lembra[rh]?|anota[rh]?|salva[rh]?|faz[er]*|quero|preciso\s+registrar)\b/i;

async function routeCommand(text) {
  const t = text.toLowerCase();

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
    if (/^(ativ|já fiz|feito|conclu|sim.*ativ)/i.test(t) || /atividade/i.test(t)) {
      convState = null;
      showRegistroPreview(name, true, d, time || '');
      return null;
    }
    if (/^(comp|vou|vou fazer|não fiz|pendente|sim.*comp)/i.test(t) || /compromisso/i.test(t)) {
      if (!time) {
        convState = { type: 'waiting_time', name, date: d };
        return 'Compromisso precisa de horário. Qual horário? (ex: 15:30 ou 15h)';
      }
      convState = null;
      showRegistroPreview(name, false, d, time);
      return null;
    }
    return 'Responda <strong>atividade</strong> (já fiz) ou <strong>compromisso</strong> (vou fazer).';
  }

  if (convState?.type === 'waiting_time') {
    const { name, date } = convState;
    const time = extractTime(text);
    if (!time) return 'Informe um horário válido (ex: 15:30 ou 15h).';
    convState = null;
    showRegistroPreview(name, false, date, time);
    return null;
  }

  // ── Consultas ──
  if (/dormi|sono|horas de sono|acordei/i.test(t))                   return cmdSono();
  if (/sequência|sequencia|streak|seguidos|consecutiv/i.test(t))     return cmdSequencia();
  if (/hidrat|água|agua|beber|bebi|\bml\b/i.test(t))                 return cmdHidratacao();
  if (/tarefas?|to.?do|lista de hoje|o que tenho/i.test(t) && !REGISTER_TRIGGERS.test(t)) return cmdTarefas();
  if (/ajuda|help|comando|o que (você|vc) (faz|sabe)/i.test(t))      return cmdAjuda();
  if (/^início:\s*\d|zerar\s+sequência|começo\s+da\s+sequência/i.test(t)) return cmdDefinirInicio(text);

  // ── Intenção de registrar ──
  if (REGISTER_TRIGGERS.test(t) || /registrar|adicionar/i.test(t)) {
    // Detecta data alvo com suporte a DD/MM, nomes de dia e amanhã
    const targetDate = extractDate(text);

    // Detecta tipo diretamente na frase
    const tipoExplicito = /\bcompromisso\b/i.test(t) ? 'compromisso'
                        : /\batividade\b/i.test(t)   ? 'atividade'
                        : null;

    // Extrai horário e nome da tarefa
    const taskTime = extractTime(text);
    const nameRaw  = extractTaskName(text);

    if (!nameRaw) {
      convState = { type: 'waiting_name', date: targetDate, time: taskTime };
      return 'O que você quer registrar?';
    }

    if (tipoExplicito === 'compromisso') {
      if (!taskTime) {
        convState = { type: 'waiting_time', name: nameRaw, date: targetDate };
        return 'Compromisso precisa de horário. Qual horário? (ex: 15:30 ou 15h)';
      }
      showRegistroPreview(nameRaw, false, targetDate, taskTime);
      return null;
    }
    if (tipoExplicito === 'atividade')   { showRegistroPreview(nameRaw, true,  targetDate, taskTime); return null; }

    // Tipo não especificado — pergunta
    return askType(nameRaw, targetDate, taskTime);
  }

  return `Não entendi. Digite <strong>ajuda</strong> pra ver o que sei fazer.`;
}

// Extrai horário da frase → "HH:MM" ou '' se não encontrar
function extractTime(text) {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  m = t.match(/\b(\d{1,2})h(\d{2})\b/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  m = t.match(/\b(?:às?|as)\s+(\d{1,2})\s*h(?:oras?)?\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  m = t.match(/\b(?:às?|as)\s+(\d{1,2})\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  m = t.match(/\b(\d{1,2})\s*h(?:oras?)?\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  // "13 e 14" → 13:14 (horas e minutos por extenso)
  m = t.match(/\b(\d{1,2})\s+e\s+(\d{1,2})\b/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59)
      return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  return '';
}

// Extrai o nome da tarefa limpando verbos, artigos, tipo, data e horário da frase
function extractTaskName(text) {
  const result = text
    .replace(/^(marca[rh]?|agenda[rh]?|coloca[rh]?|adiciona[rh]?|cria[rh]?|registra[rh]?|bota[rh]?|lembra[rh]?|anota[rh]?|salva[rh]?|faz[er]*|quero|preciso\s+registrar)\s*/i, '')
    .replace(/^(um|uma|o|a)\s+/i, '')
    .replace(/\b(pra mim|para mim)\b/gi, '')
    .replace(/\b(compromisso|atividade)\b\s*/gi, '')
    .replace(/depois\s+de\s+aman(h[ãa]|ha)\s*/gi, '')
    .replace(/aman(h[ãa]|ha)\s*/gi, '')
    .replace(/\b(hoje|agora)\b\s*/gi, '')
    // Remove nomes/abreviações de dia da semana
    .replace(/\b(próxim[oa]\s+)?(dom(ingo)?|seg(unda(-feira)?)?|ter(([cç][aã]|ca)(-feira)?)?|qua(rta(-feira)?)?|qui(nta(-feira)?)?|sex(ta(-feira)?)?|s[aá]b(ado)?)\b\s*/gi, '')
    // Remove "dia " quando seguido de número (ex: "dia 13/07")
    .replace(/\bdia\s+(?=\d)/gi, '')
    // Remove data explícita DD/MM com ou sem parênteses
    .replace(/\(?\b\d{1,2}\/\d{1,2}\)?\s*/g, '')
    .replace(/^(para|pra|de|do|da|no|na)\s+/i, '')
    // Remove expressões de horário — preposição + número + unidade
    .replace(/(?:às?|as|das?|para\s+as?|pra\s+as?)\s+\d{1,2}(?:[h:]\d{2}|\s*h(?:oras?)?)?\b/gi, '')
    // Remove horários soltos que restaram
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\b\d{1,2}h\d{2}\b/gi, '')
    .replace(/\b\d{1,2}\s*h(?:oras?)?\b/gi, '')
    // Remove resíduos: "horas", "às", "as", "das" isolados (sem \b — não funciona com acentos)
    .replace(/\bhoras?\b/gi, '')
    .replace(/ às /gi, ' ').replace(/ às$/gi, '').replace(/^às /gi, '')
    .replace(/ as /gi, ' ').replace(/ as$/gi, '').replace(/^as /gi, '')
    .replace(/ das /gi, ' ').replace(/ das$/gi, '').replace(/^das /gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?]+$/, '')
    .trim();
  return result ? result.charAt(0).toUpperCase() + result.slice(1) : result;
}

// Retorna uma data N dias à frente de hoje
function dateOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// === BLOCO: EXTRAÇÃO DE DATA ===
// Reconhece DD/MM, nomes/abreviações de dia da semana, amanhã, depois de amanhã
function extractDate(text) {
  const t = text.toLowerCase();

  // Prioridade 1: data explícita DD/MM (com ou sem parênteses) — ex: 13/07, (13/07)
  const dmMatch = t.match(/\(?\b(\d{1,2})\/(\d{1,2})\)?/);
  if (dmMatch) {
    const day   = parseInt(dmMatch[1], 10);
    const month = parseInt(dmMatch[2], 10) - 1;
    const now   = new Date();
    const d     = new Date(now.getFullYear(), month, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  // Prioridade 2: relativos
  if (/depois\s+de\s+aman(h[ãa]|ha)/i.test(t)) return dateOffset(2);
  if (/aman(h[ãa]|ha)/i.test(t))                return dateOffset(1);
  if (/\bhoje\b/i.test(t))                       return new Date();

  // Prioridade 3: nome/abreviação do dia da semana → próxima ocorrência
  const WD_MAP = [
    [/\bdom(ingo)?\b/i,                            0],
    [/\bseg(unda(-feira)?)?\b/i,                   1],
    [/\bter([cç][aã](-feira)?|ca(-feira)?)?\b/i,   2],
    [/\bqua(rta(-feira)?)?\b/i,                    3],
    [/\bqui(nta(-feira)?)?\b/i,                    4],
    [/\bsex(ta(-feira)?)?\b/i,                     5],
    [/\bs[aá]b(ado)?\b/i,                          6],
  ];
  for (const [re, wd] of WD_MAP) {
    if (re.test(t)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let diff = (wd - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7; // mesmo dia → próxima semana
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

// Streak de dias consecutivos — respeita streakOrigin do perfil do usuário
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
    // hasActivity = set pelo addDayTask novo; fallback: doc existe com qualquer dado além de "generated"
    const isActive = doc.hasActivity || (doc.hydrationMl || 0) > 0 || !!doc.sleepTime
      || Object.keys(doc).some(k => k !== 'id' && k !== 'generated');
    if (!isActive) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Dias falhados na semana atual (segunda→hoje, excluindo dias futuros)
async function calcWeekFailures() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromMon = (today.getDay() + 6) % 7; // seg=0 dom=6
  const weekStart   = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMon);

  let failed = 0;
  const cursor = new Date(weekStart);
  while (cursor <= today) {
    const doc       = await getDay(dayId(cursor));
    const isActive  = doc && (doc.hasActivity || (doc.hydrationMl || 0) > 0 || !!doc.sleepTime);
    if (!isActive) failed++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return failed;
}

// Bloco de consistência — reutilizado em Sono e Sequência
async function consistenciaBlock() {
  const [streak, failed] = await Promise.all([calcStreak(), calcWeekFailures()]);
  const weekPart   = failed === 0
    ? '✅ Semana perfeita até agora!'
    : `⚠️ Essa semana você <strong>falhou ${failed} dia${failed > 1 ? 's' : ''}</strong>.`;
  const streakPart = streak === 0
    ? 'Nenhum dia consecutivo registrado ainda.'
    : `Você está a <strong>${streak} dia${streak > 1 ? 's' : ''}</strong> consecutivos em atividade.`;
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
    sleepMsg = '😴 Nenhum horário de sono registrado hoje.';
  } else if (!wake) {
    sleepMsg = `😴 Horário de dormir: <strong>${sleep}</strong>. Ainda sem acordar registrado.`;
  } else if (!sleep) {
    sleepMsg = `☀️ Acordou às <strong>${wake}</strong>, mas sem horário de dormir de ontem.`;
  } else {
    const mins = sleepDuration(sleep, wake);
    if (!mins) {
      sleepMsg = '😴 Não consegui calcular a duração do sono.';
    } else {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const av = mins >= 420 ? '✅ Ótimo!' : mins >= 360 ? '🟡 Razoável.' : '🔴 Pouco sono.';
      sleepMsg = `😴 Você dormiu <strong>${h}h${m > 0 ? m + 'min' : ''}</strong> (${sleep} → ${wake}). ${av}`;
    }
  }

  const consist = await consistenciaBlock();
  return `${sleepMsg}<br><br>${consist}`;
}

async function cmdSequencia() {
  const consist = await consistenciaBlock();
  return `🔥 ${consist}<br><small style="color:var(--muted)">Diga <em>início: DD/MM</em> pra definir o começo da contagem.</small>`;
}

// Define a data de início da sequência (ex: "início: 09/06")
async function cmdDefinirInicio(text) {
  const match = text.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (/zerar/i.test(text)) {
    await setProfile({ streakOrigin: dayId(new Date()) });
    return '✅ Sequência zerada. Contagem começa de hoje.';
  }
  if (!match) return 'Para definir o início diga: <strong>início: DD/MM</strong> (ex: início: 09/06)';
  const day   = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const year  = new Date().getFullYear();
  const origin = new Date(year, month, day);
  await setProfile({ streakOrigin: dayId(origin) });
  const label = `${String(day).padStart(2,'0')}/${String(month+1).padStart(2,'0')}/${year}`;
  return `✅ Início da sequência definido para <strong>${label}</strong>. Dias antes dessa data não contam.`;
}

async function cmdHidratacao() {
  const day = await getDay(dayId(new Date()));
  if (!day) return '💧 Nenhum dado de hoje encontrado ainda.';

  const ml   = day.hydrationMl   || 0;
  const goal = day.hydrationGoal || 2000;
  const pct  = Math.min(100, Math.round((ml / goal) * 100));
  const remaining = Math.max(0, goal - ml);

  const status  = remaining === 0 ? '🎉 Meta atingida!' : `Faltam <strong>${remaining}ml</strong>`;
  const barHtml = `<div style="margin:6px 0;height:8px;border-radius:4px;background:var(--border);overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width .3s"></div></div>`;
  return `💧 <strong>${ml}ml</strong> de ${goal}ml (${pct}%)${barHtml}${status}`;
}

async function cmdTarefas() {
  const tasks = await getDayTasks(dayId(new Date()));
  if (!tasks.length) return '📋 Nenhuma tarefa registrada pra hoje.';

  const feitas   = tasks.filter(t => t.done);
  const pendentes = tasks.filter(t => !t.done);

  let msg = `📋 <strong>${feitas.length}/${tasks.length}</strong> tarefa${tasks.length !== 1 ? 's' : ''} concluída${feitas.length !== 1 ? 's' : ''}`;
  if (feitas.length)    msg += '<br>' + feitas.map(t => `✅ ${t.title}`).join('<br>');
  if (pendentes.length) msg += '<br>' + pendentes.map(t => `⬜ ${t.title}`).join('<br>');
  return msg;
}

function askType(name, date = new Date(), time = '') {
  convState = { type: 'waiting_type', name, date, time };
  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const label = isToday(date) ? 'hoje' : `${DIAS[date.getDay()]} (${dd}/${mm})`;
  addChoices(
    `"<strong>${name}</strong>" para <strong>${label}</strong>${time ? ` às <strong>${time}</strong>` : ''} — atividade ou compromisso?`,
    [
      { label: '✅ Atividade (já fiz)', value: 'atividade' },
      { label: '📌 Compromisso (vou fazer)', value: 'compromisso' }
    ]
  );
  return null;
}

// Gera URL pré-preenchida do Google Agenda
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

// Mostra card de pré-visualização com botão de confirmar — NÃO escreve no Firebase ainda
function showRegistroPreview(name, done, date = new Date(), time = '') {
  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const diaSemana = DIAS[date.getDay()];
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const alvo = new Date(date); alvo.setHours(0,0,0,0);
  const diff = Math.round((alvo - hoje) / 86400000);
  const quandoLabel = diff === 0 ? `hoje, ${diaSemana} (${dd}/${mm})`
                    : diff === 1 ? `amanhã, ${diaSemana} (${dd}/${mm})`
                    : `${diaSemana} (${dd}/${mm})`;

  const tipoIcon  = done ? '✅' : '📌';
  const tipoLabel = done ? 'atividade' : 'compromisso';

  const box = document.getElementById('pet-messages');
  if (!box) return;

  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card">
      <span class="pet-preview-title">${tipoIcon} <strong>${name}</strong></span>
      <span class="pet-preview-sub">${quandoLabel}${time ? ` · ${time}` : ''} · ${tipoLabel}</span>
      <button class="pet-reg-btn">${tipoIcon} Registrar ${tipoLabel}</button>
    </span>`;

  const btn = div.querySelector('.pet-reg-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Registrando...';
    try {
      await executeRegistro(name, done, date, time);
      btn.textContent = '✓ Registrado';
      btn.classList.add('pet-reg-done');
      if (done) { setPetState('excited'); setTimeout(() => setPetState('idle'), 1800); }
      showCenterToast(done ? 'Atividade registrada! ✓' : 'Compromisso registrado! ✓');
      if (time) {
        const [h, mi]  = time.split(':').map(Number);
        const ts       = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi).getTime();
        const tag      = notifTag(dayId(date), name);
        const result   = await scheduleNotif({ title: name, body: done ? 'Atividade no Falcon' : 'Compromisso no Falcon', tag, timestamp: ts });
        if (result === 'scheduled') {
          setTimeout(() => addMessage(
            `🔔 Notificação agendada para as <strong>${time}</strong>. Você será avisado no horário!`,
            'bot'
          ), 350);
        } else {
          const gcalUrl = petGCalUrl(name, date, time);
          const hint    = result === 'denied'
            ? 'Notificações bloqueadas. Adicione ao Google Agenda para receber aviso:'
            : 'Adicione ao Google Agenda para ser lembrado no horário:';
          setTimeout(() => addMessage(
            `${hint}<br><a class="pet-gcal-link" href="${gcalUrl}" target="_blank" rel="noopener">📅 Adicionar ao Google Agenda</a>`,
            'bot'
          ), 350);
        }
      } else if (!done) {
        const gcalUrl = petGCalUrl(name, date, '09:00');
        setTimeout(() => addMessage(
          `Quer ser lembrado? Adicione ao Google Agenda:<br><a class="pet-gcal-link" href="${gcalUrl}" target="_blank" rel="noopener">📅 Adicionar ao Google Agenda</a>`,
          'bot'
        ), 350);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `${tipoIcon} Registrar ${tipoLabel}`;
      addMessage('Erro ao registrar. Tente novamente.', 'bot');
      console.error('[pet] registro:', err);
    }
  });

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// Escreve no Firebase — chamado SOMENTE pelo botão de confirmação
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

// Escolhe o turno pelo horário (Manhã 5-12, Tarde 12-19, Noite 19-5)
function pickShift(shifts, time) {
  if (!shifts.length) return null;
  if (!time) return shifts[0].id;
  const [h] = time.split(':').map(Number);
  const name = h >= 5 && h < 12 ? 'Manhã' : h >= 12 && h < 19 ? 'Tarde' : 'Noite';
  return (shifts.find(s => s.name === name) || shifts[0]).id;
}

// Toast centralizado na tela após registro confirmado
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
  return `👁 <strong>O que eu entendo:</strong><br>
• <em>quanto dormi?</em><br>
• <em>minha sequência?</em><br>
• <em>hidratação de hoje?</em><br>
• <em>tarefas de hoje?</em><br>
• <em>marca um compromisso amanhã pra pagar a conta</em><br>
• <em>registrar treino</em> · <em>adicionar reunião</em><br>
• <em>coloca lembrete de amanhã pra ligar pro médico</em>`;
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
    span.innerHTML = html; // só mensagens controladas do bot
  } else {
    span.textContent = html; // input do usuário: nunca innerHTML
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
let voiceActive  = false; // true quando speech recognition detecta voz
let voiceTimer   = null;

async function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMessage('Voz não suportada neste navegador.', 'bot'); return; }
  if (recording) return;

  // iOS Safari precisa de getUserMedia para liberar permissão ANTES do SpeechRecognition.
  // Android: getUserMedia conflita com SpeechRecognition — não usar lá.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // libera mic imediatamente
      await new Promise(r => setTimeout(r, 80)); // deixa o mic soltar antes do SR pegar
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      addMessage(
        denied
          ? 'Microfone bloqueado. Ajustes → Safari → Microfone → Permitir'
          : 'Não foi possível acessar o microfone.',
        'bot'
      );
      return;
    }
  }

  accumulated = '';
  recording   = true;
  confirming  = false;
  let abortCount = 0; // iOS dispara 'aborted' antes do áudio estabilizar

  function buildRecognition() {
    const r = new SR();
    r.lang           = 'pt-BR';
    r.continuous     = false;
    r.interimResults = true; // interim para acionar animação do waveform

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) accumulated += e.results[i][0].transcript + ' ';
      }
      // qualquer resultado = voz detectada → acende waveform
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
      // 'aborted' no iOS é transitório — deixa onend tentar reiniciar (máx 3x)
      if (e.error === 'aborted') {
        abortCount++;
        if (abortCount <= 3) return;
      }
      if (e.error === 'audio-capture' || e.error === 'not-allowed') {
        addMessage('Microfone inacessível. No iPhone: Ajustes → Safari → Microfone → Permitir', 'bot');
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
  drawWaveform(); // waveform simulado — sem getUserMedia, sem conflito de mic
  setPetState('thinking');
}

function stopMicConfirm() {
  if (!recording) return;
  confirming = true;
  if (recognition) {
    recognition.stop(); // onend processa accumulated
  } else {
    // recognition já parou (Android) — processa direto
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

  // Reage ao voiceActive: alto/rápido quando fala, baixo/calmo no silêncio
  const heights = new Float32Array(N).fill(0.08);
  const targets = new Float32Array(N).fill(0.08);
  let tick = 0;
  let wasActive = false;

  function frame() {
    waveAnimId = requestAnimationFrame(frame);
    tick++;

    const active = voiceActive;

    // Transição fala → silêncio: zera TODOS os targets imediatamente
    if (wasActive && !active) {
      for (let i = 0; i < N; i++) targets[i] = 0.04 + Math.random() * 0.08;
    }
    wasActive = active;

    // Atualiza targets: rápido durante fala, lento no silêncio
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
    // ao parar de falar, desce rápido (0.3); falando sobe rápido (0.35); idle suave (0.12)
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
