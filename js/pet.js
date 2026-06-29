// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getDay, setDayMeta, getDayTasks, addDayTask,
  dayId, sleepDuration, formatTime
} from './store.js';

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
        <span>Visão</span>
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

    <div class="pet-chat-input-row">
      <input
        type="text"
        id="pet-input"
        class="pet-input"
        placeholder="Digite um comando..."
        autocomplete="off"
        autocorrect="off"
        autocapitalize="sentences"
      />
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
  </div>

  <!-- Corpo do pet — O OLHO INTEIRO -->
  <div class="pet-body" id="pet-body" role="button" aria-label="Abrir chat do Visão" tabindex="0">
    <div id="pet-badge" class="pet-badge" style="display:none">1</div>
    <svg class="pet-eye-svg" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- Esclera: preenche o círculo inteiro -->
      <circle cx="30" cy="30" r="30" fill="white"/>
      <!-- Íris grande -->
      <circle cx="30" cy="33" r="17" fill="#4f46e5"/>
      <!-- Pupila -->
      <circle cx="30" cy="33" r="10" fill="#080614" class="pet-pupil"/>
      <!-- Brilho principal -->
      <circle cx="37" cy="26" r="4.5" fill="white" opacity="0.75"/>
      <!-- Brilho secundário -->
      <circle cx="22" cy="29" r="2" fill="white" opacity="0.35"/>
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
function attachHandlers() {
  document.getElementById('pet-body').addEventListener('click', toggleChat);
  document.getElementById('pet-body').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') toggleChat();
  });
  document.getElementById('pet-chat-close').addEventListener('click', closeChatPanel);
  document.getElementById('pet-send-btn').addEventListener('click', handleSend);
  document.getElementById('pet-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSend();
  });
  document.getElementById('pet-mic-btn').addEventListener('click', startMic);

  // Botões de atalho
  document.getElementById('pet-quick-actions').addEventListener('click', e => {
    const btn = e.target.closest('.pet-qa-btn');
    if (!btn) return;
    dispatchCommand(btn.dataset.cmd);
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
async function routeCommand(text) {
  const t = text.toLowerCase();

  // ── Resposta de estado de conversa ──
  if (convState?.type === 'waiting_name') {
    const name = text;
    convState = null;
    return askType(name);
  }

  if (convState?.type === 'waiting_type') {
    const name = convState.name;
    convState = null;
    if (/atividade|fiz|feito|conclu/i.test(t)) return cmdConfirmarRegistro(name, true);
    if (/compromisso|vou|farei|pendente/i.test(t)) return cmdConfirmarRegistro(name, false);
    return 'Não entendi. Responda <strong>atividade</strong> (já fiz) ou <strong>compromisso</strong> (vou fazer).';
  }

  // ── Comandos diretos ──
  if (/dormi|sono|horas de sono|acordei/i.test(t))       return cmdSono();
  if (/sequência|sequencia|streak|seguidos|consecutiv/i.test(t)) return cmdSequencia();
  if (/hidrat|água|agua|beber|ml/i.test(t))               return cmdHidratacao();
  if (/tarefa|atividade de hoje|compromisso de hoje|to.?do/i.test(t) && !/registrar|adicionar/i.test(t)) return cmdTarefas();

  const registrarMatch = t.match(/registrar?|adicionar?|criar?\s+(.+)/i);
  if (/registrar|adicionar/i.test(t)) {
    const nameRaw = text.replace(/^(registrar?|adicionar?|criar?)\s*/i, '').trim();
    if (!nameRaw) {
      convState = { type: 'waiting_name' };
      return 'O que você quer registrar?';
    }
    return askType(nameRaw);
  }

  if (/ajuda|help|comando|o que (você|vc) faz/i.test(t)) return cmdAjuda();

  return `Não reconheci esse comando. Digite <strong>ajuda</strong> pra ver o que sei fazer.`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8: HANDLERS DE COMANDOS
// ═══════════════════════════════════════════════════════════════

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

  if (!wake && !sleep) return '😴 Nenhum horário de sono registrado hoje.';
  if (!wake)  return `😴 Horário de dormir: <strong>${sleep}</strong>. Ainda sem horário de acordar hoje.`;
  if (!sleep) return `☀️ Você acordou às <strong>${wake}</strong>, mas não há horário de dormir de ontem.`;

  const mins = sleepDuration(sleep, wake);
  if (!mins)  return '😴 Não consegui calcular a duração do sono com os dados disponíveis.';

  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const avaliacao = mins >= 420 ? '✅ Ótimo!' : mins >= 360 ? '🟡 Razoável.' : '🔴 Pouco sono.';
  return `😴 Você dormiu <strong>${h}h${m > 0 ? m + 'min' : ''}</strong> (${sleep} → ${wake}). ${avaliacao}`;
}

async function cmdSequencia() {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // Vai para trás até encontrar um dia sem registro (máx 120 dias)
  for (let i = 0; i < 120; i++) {
    const doc = await getDay(dayId(cursor));
    if (!doc) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  if (streak === 0) return '🔥 Nenhum registro encontrado ainda. Comece hoje!';
  const emoji = streak >= 30 ? '🏆' : streak >= 14 ? '🔥' : streak >= 7 ? '⚡' : '✨';
  return `${emoji} Você está com <strong>${streak} dia${streak !== 1 ? 's' : ''} seguidos</strong> de registro!`;
}

async function cmdHidratacao() {
  const day = await getDay(dayId(new Date()));
  if (!day) return '💧 Nenhum dado de hoje encontrado ainda.';

  const ml   = day.hydrationMl   || 0;
  const goal = day.hydrationGoal || 2000;
  const pct  = Math.min(100, Math.round((ml / goal) * 100));
  const remaining = Math.max(0, goal - ml);

  const filled  = Math.round(pct / 10);
  const bar     = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const status  = remaining === 0 ? '🎉 Meta atingida!' : `Faltam <strong>${remaining}ml</strong>`;
  return `💧 <strong>${ml}ml</strong> de ${goal}ml (${pct}%)<br><span style="letter-spacing:1px;font-family:monospace">${bar}</span><br>${status}`;
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

function askType(name) {
  convState = { type: 'waiting_type', name };
  addChoices(
    `"<strong>${name}</strong>" é uma atividade ou compromisso?`,
    [
      { label: '✅ Atividade (já fiz)', value: 'atividade' },
      { label: '📌 Compromisso (vou fazer)', value: 'compromisso' }
    ]
  );
  return null; // mensagem já adicionada por addChoices
}

async function cmdConfirmarRegistro(name, done) {
  const today = dayId(new Date());

  // Garante que o documento do dia existe
  await setDayMeta(today, {});

  const tasks = await getDayTasks(today);
  const order = tasks.length;
  await addDayTask(today, { title: name, done, order });

  if (done) {
    setPetState('excited');
    setTimeout(() => setPetState('idle'), 1800);
    return `✅ "<strong>${name}</strong>" registrado como atividade concluída!`;
  }
  return `📌 "<strong>${name}</strong>" adicionado como compromisso pra hoje.`;
}

function cmdAjuda() {
  return `👁 <strong>Comandos disponíveis:</strong><br>
• <em>quanto dormi?</em> — horas de sono da noite<br>
• <em>minha sequência?</em> — dias seguidos de registro<br>
• <em>hidratação de hoje?</em> — água consumida vs meta<br>
• <em>tarefas de hoje?</em> — lista de tarefas do dia<br>
• <em>registrar [nome]</em> — registra atividade ou compromisso`;
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
// BLOCO 10: MICROFONE — Web Speech API, só transcrição
// ═══════════════════════════════════════════════════════════════
let recognition = null;

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMessage('Seu navegador não suporta reconhecimento de voz.', 'bot'); return; }

  if (recognition) { recognition.stop(); return; }

  recognition = new SR();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = false;

  const micBtn = document.getElementById('pet-mic-btn');
  micBtn.classList.add('pet-mic-active');
  setPetState('thinking');

  recognition.onresult = (e) => {
    const raw   = e.results[0][0].transcript;
    const clean = formatTranscript(raw);
    const inp   = document.getElementById('pet-input');
    if (inp) { inp.value = clean; inp.focus(); }
    resetMicBtn();
    setPetState('idle');
    recognition = null;
  };
  recognition.onerror = () => { resetMicBtn(); setPetState('idle'); recognition = null; };
  recognition.onend   = () => { resetMicBtn(); recognition = null; };
  recognition.start();
}

function resetMicBtn() {
  const btn = document.getElementById('pet-mic-btn');
  if (btn) btn.classList.remove('pet-mic-active');
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
