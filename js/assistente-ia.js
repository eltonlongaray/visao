// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — INIT — injeta o pet no DOM (uma vez por sessão)
// BLOCO 3 — ESTADOS — idle | sleeping | excited | thinking
// BLOCO 4 — HTML DO PET
// BLOCO 5 — HANDLERS — click, fechar, atalhos, Enter
// BLOCO 6 — SEND + ESTADO DE CONVERSA
// BLOCO 7 — ROTEADOR DE COMANDOS
// BLOCO 8 — HANDLERS DE COMANDOS
// BLOCO 8.5 — EDIÇÃO E REAGENDAMENTO VIA PET
// BLOCO 9 — HELPERS DE MENSAGEM
// BLOCO 10 — MICROFONE — waveform visual + continuous recognition
// BLOCO 11 — ANIMAÇÃO DO OLHO — pisca no estado idle
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  getDay, setDayMeta, getDayTasks, addDayTask, updateDayTask, deleteDayTask, fetchDaysRange, getShifts,
  getProfile, setProfile,
  dayId, sleepDuration, formatTime
} from './banco-dados.js';
import { scheduleNotif, notifTag, requestPermission, canInstallApp, promptInstallApp } from './notificacoes.js';
import { t, getLang } from './idioma.js';

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
  const el = document.getElementById('visao-pet');
  if (el?.classList.contains('pet-guiding')) return;  // durante o tour ele fica
  closeChatPanel();
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
// BLOCO 3.5: MODO GUIA — durante o tutorial o pet sai do canto e
// passeia pela tela, parando ao lado do que está sendo destacado.
// ═══════════════════════════════════════════════════════════════
const PET_SIZE = 58;    // corpo do pet (aprox)
const OLHO_X = 14, OLHO_Y = 14;  // amplitude do olhar (unidades do SVG)

// Limite inferior: mede a barra do tour DE VERDADE (a mensagem varia de altura,
// e chutar um valor fixo fazia o pet sumir atrás do balão).
function limiteInferior(tam) {
  const barra = document.querySelector('.tour2-bar');
  const topoBarra = barra ? barra.getBoundingClientRect().top : window.innerHeight - 200;
  return topoBarra - (tam || PET_SIZE) - 16;
}
// Tamanho real do corpo do pet (o CSS pode variar)
function tamanhoPet(el) {
  return el?.querySelector('.pet-body')?.getBoundingClientRect().width || PET_SIZE;
}

let _gazeTimer = null;
let _petPos = null;          // centro do pet na tela
let _alvoPos = null;         // centro do que está sendo destacado
let _olhandoUsuario = false;

export function petGuideStart() {
  const el = document.getElementById('visao-pet');
  if (!el) return;
  closeChatPanel();
  el.classList.remove('pet-hidden');
  // Some de onde está e reaparece já solto, em modo guia
  el.classList.add('pet-vanish');
  setTimeout(() => {
    el.classList.add('pet-guiding');
    // Posição inicial (senão nasce sem left/top e vai parar no canto errado)
    const tam = tamanhoPet(el);
    el.style.left = `${Math.round(window.innerWidth / 2 - tam / 2)}px`;
    el.style.top  = `${Math.round(limiteInferior(tam))}px`;
    el.dataset.state = 'idle';   // idle = ele continua piscando (blink só roda em idle)
    el.classList.remove('pet-vanish');
  }, 220);
}

export function petGuideEnd() {
  const el = document.getElementById('visao-pet');
  if (!el) return;
  pararAlternanciaOlhar();
  el.classList.add('pet-vanish');
  setTimeout(() => {
    el.classList.remove('pet-guiding', 'pet-at-home');
    el.style.removeProperty('left');
    el.style.removeProperty('top');
    el.querySelector('.pet-iris-group')?.removeAttribute('transform');
    el.querySelector('.pet-lid-top')?.setAttribute('ry', LID_RY);
    el.querySelector('.pet-lid-bot')?.setAttribute('ry', LID_RY);
    el.dataset.state = 'idle';
    el.classList.remove('pet-vanish');
  }, 220);
}

// Coloca o pet AO LADO do destaque (direita → esquerda → acima → abaixo).
// Nunca por cima das palavras, nunca invadindo a barra do tour.
export function petGuideTo(rect) {
  const el = document.getElementById('visao-pet');
  if (!el || !el.classList.contains('pet-guiding')) return;
  el.classList.remove('pet-at-home');   // saiu do cantinho, volta ao z-index normal
  const vw = window.innerWidth, vh = window.innerHeight;
  const TAM = tamanhoPet(el);
  // Ele fica ACIMA da barra em z-index, então pode ir junto da marcação mesmo
  // que ela esteja lá embaixo — o limite agora é só a tela.
  const maxY = vh - TAM - 12;
  const GAP = 12;
  let x, y, mira = null;

  if (!rect || (!rect.width && !rect.height)) {
    // Sem alvo (boas-vindas / final): perto da mensagem, logo acima da barra
    x = vw / 2 - TAM / 2;
    y = limiteInferior(TAM);
  } else {
    // Usa só a parte VISÍVEL do alvo — cards altos (Ritual) passam da tela e o
    // centro real deles cai fora da vista, jogando o pet pro lugar errado.
    const vis = {
      top:    Math.max(rect.top, 0),
      bottom: Math.min(rect.bottom, vh),
      left:   Math.max(rect.left, 0),
      right:  Math.min(rect.right, vw),
    };
    const centroX = (vis.left + vis.right) / 2;
    const centroY = (vis.top + vis.bottom) / 2;
    const alvoAlto = (vis.bottom - vis.top) > vh * 0.45;

    if (rect.right + GAP + TAM <= vw - 8)      x = rect.right + GAP;       // cabe à direita
    else if (rect.left - GAP - TAM >= 8)       x = rect.left - GAP - TAM;  // cabe à esquerda
    else if (alvoAlto)                          x = 8;                      // alvo alto: canto esquerdo
    else x = centroX <= vw / 2 ? vw - TAM - 8 : 8;    // largo: encosta na borda oposta

    // Alvo alto → fica junto do TOPO dele (é onde a informação começa).
    // Senão: alvo em cima → pet embaixo (olha ↑); alvo embaixo → pet em cima (olha ↓).
    if (alvoAlto) {
      y = vis.top + 8;
    } else {
      const desloc = Math.min((vis.bottom - vis.top) / 2 + TAM * 0.5, 95);
      y = (centroY < vh / 2 ? centroY + desloc : centroY - desloc) - TAM / 2;
    }
    mira = { x: centroX, y: alvoAlto ? Math.min(centroY, vis.top + vh * 0.3) : centroY };
  }

  x = Math.max(8, Math.min(x, vw - TAM - 8));
  y = Math.max(12, Math.min(y, maxY));
  el.style.left = `${Math.round(x)}px`;
  el.style.top  = `${Math.round(y)}px`;

  _petPos  = { x: x + TAM / 2, y: y + TAM / 2 };
  _alvoPos = mira;
  _olhandoUsuario = false;
  aplicarOlhar();
  iniciarAlternanciaOlhar();
}

// Último passo do tour: o pet volta pro LUGAR REAL dele (o mesmo do CSS:
// bottom 78px / right 14px) e encara o usuário. Ganha z-index maior porque
// ali a barra do tour passa por cima — senão ele sumiria atrás do balão.
export function petGuideHome() {
  const el = document.getElementById('visao-pet');
  if (!el || !el.classList.contains('pet-guiding')) return;
  const corpo = el.querySelector('.pet-body');
  const tam = corpo?.getBoundingClientRect().width || PET_SIZE;
  const x = window.innerWidth  - tam - 14;   // right: 14px
  const y = window.innerHeight - tam - 78;   // bottom: 78px
  el.classList.add('pet-at-home');
  el.style.left = `${Math.round(x)}px`;
  el.style.top  = `${Math.round(y)}px`;
  _petPos = { x: x + tam / 2, y: y + tam / 2 };
  _alvoPos = null;
  _olhandoUsuario = true;      // encara o usuário
  aplicarOlhar();
  pararAlternanciaOlhar();
}

// ── Olhar: alterna entre o destaque e o usuário (parece que conversa) ──
function iniciarAlternanciaOlhar() {
  pararAlternanciaOlhar();
  _gazeTimer = setInterval(() => {
    _olhandoUsuario = !_olhandoUsuario;
    aplicarOlhar();
    // Ao voltar o olhar pra você, ele pisca — natural e garante a piscada
    // (o sorteio do blink quase nunca caía na janela certa)
    if (_olhandoUsuario) setTimeout(piscar, 420);
  }, 2300);
}

// Piscada: só faz sentido de frente (de lado/cima a pálpebra está redimensionada)
function piscar() {
  const pet = document.getElementById('visao-pet');
  if (!pet || pet.dataset.state !== 'idle') return;
  if (pet.classList.contains('pet-guiding') && !_olhandoUsuario) return;
  pet.classList.add('pet-blinking');
  setTimeout(() => pet.classList.remove('pet-blinking'), 180);
}
function pararAlternanciaOlhar() {
  if (_gazeTimer) clearInterval(_gazeTimer);
  _gazeTimer = null;
}

// Cada eixo tem escala PRÓPRIA (não normaliza pelo vetor inteiro): com o alvo
// ao lado, o dx dominava e o olhar vertical virava quase zero. Satura na
// distância de referência — expressivo, como mascote de desenho.
const REF_X = 100, REF_Y = 60;
function aplicarOlhar() {
  const el = document.getElementById('visao-pet');
  if (!el) return;
  if (_olhandoUsuario || !_alvoPos || !_petPos) { moverPupila(el, 0, 0); return; }
  const lim = (v, ref) => Math.max(-1, Math.min(1, v / ref));
  moverPupila(el,
    lim(_alvoPos.x - _petPos.x, REF_X) * OLHO_X,
    lim(_alvoPos.y - _petPos.y, REF_Y) * OLHO_Y);
}

// Move a íris (com a pupila junto) sobre a esclera branca — como olho de verdade.
// Olhando pra cima/baixo, a pálpebra daquele lado DIMINUI pra não cortar o olhar.
// Usa atributo do SVG (nativo e universal).
const LID_RY = 22;   // altura normal da pálpebra
function moverPupila(el, ex, ey) {
  el.querySelector('.pet-iris-group')?.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
  // As pálpebras SEGUEM a pupila 1:1, então ela sempre ENCOSTA na de cima
  // (olhando pra cima) ou na de baixo (olhando pra baixo).
  // Geometria: pupila ry=11 em cy=30; pálpebra de cima tem borda em `ry`,
  // a de baixo em `60-ry`. Cobrindo 3 unidades da pupila → ry = 22 ± ey.
  el.querySelector('.pet-lid-top')?.setAttribute('ry', Math.max(0, LID_RY + ey).toFixed(1));
  el.querySelector('.pet-lid-bot')?.setAttribute('ry', Math.max(0, LID_RY - ey).toFixed(1));
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
      <defs>
        <clipPath id="petEyeClip"><circle cx="30" cy="30" r="30"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="30" fill="#f4f1ea"/>
      <!-- Recortado na borda do olho: a íris preenche olhando pra frente e o
           branco só aparece do lado oposto quando ela desliza. -->
      <g clip-path="url(#petEyeClip)">
        <g class="pet-iris-group">
          <circle cx="30" cy="30" r="32" fill="#eab308"/>
          <ellipse cx="30" cy="30" rx="7" ry="11" fill="#0d0d0d" class="pet-pupil"/>
          <circle cx="37" cy="22" r="4.2" fill="white" opacity="0.8"/>
          <circle cx="23" cy="26" r="1.9" fill="white" opacity="0.4"/>
        </g>
      </g>
      <!-- Aro FIXO na borda do olho: não acompanha a íris, então o lado pra
           onde a pupila vai continua com borda preta parada. -->
      <circle cx="30" cy="30" r="27" fill="none" stroke="#0d0d0d" stroke-width="6"/>
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
  if (/^\s*(notifica\S*|notifica[çc][õo]es|notification|notif|push|pop.?up|vibra\S*)[\s!?.…]*$/i.test(tl) ||
      /\binstalar\b|\binstalo\b|instala[çc][aã]o|adicionar (à |a |ao )?(tela|in[ií]cio)|tela inicial|como (instalar|instalo)|(notifica\S*|aviso)\s+(n[ãa]o|nao)\s+(chega|aparece|funciona|vem|toca|soa|vibra)|(n[ãa]o|nao)\s+(recebo|chega|aparece|vem|toca|soa|vibra)\s+(notifica|aviso|lembrete)|ativar\s+(notifica\S*|pop.?up|vibra)|habilitar\s+notifica|pop.?up/i.test(tl))
    return cmdNotificacoesAjuda();
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
  if (mNome) { await cmdEditarNome(mNome[2].trim(), mNome[3].trim().replace(/[.,;:!?]+$/, ''), mNome[1].toLowerCase()); return null; }

  const mHora = text.match(/^editar?\s+(?:hor[aá]rio|hora|time)\s+(?:d[oa]s?\s+)?(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mHora) { await cmdEditarHorario(mHora[2].trim(), mHora[3].trim().replace(/[.,;:!?]+$/, ''), mHora[1].toLowerCase()); return null; }

  const mResched = text.match(/^(?:reagend[ae]r?|reschedule|mover?)\s+(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mResched) { await cmdReatgendar(mResched[2].trim(), mResched[3].trim().replace(/[.,;:!?]+$/, ''), mResched[1].toLowerCase()); return null; }

  // Editar genérico: "editar compromisso X para Y" → detecta horário vs nome automaticamente
  const mEdit = text.match(/^editar?\s+(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mEdit) {
    const tipo = mEdit[1].toLowerCase(), hint = mEdit[2].trim(), afterPara = mEdit[3].trim().replace(/[.,;:!?]+$/, '');
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

  // Horas por extenso PT: "uma e quinze da tarde" → 13:15, "oito da manhã" → 08:00
  const _ptH = {uma:1,duas:2,'três':3,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12};
  const _ptM = {quinze:15,vinte:20,meia:30,trinta:30,quarenta:40,cinquenta:50};
  m = tl.match(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+e\s+(quarenta\s+e\s+cinco|quarenta|cinquenta|trinta|vinte|quinze|meia)\s+da\s+(manh[ãa]|tarde|noite)\b/i);
  if (m) {
    let h = _ptH[m[1].toLowerCase()] || 1;
    const min = /quarenta\s+e\s+cinco/.test(m[2]) ? 45 : (_ptM[m[2].toLowerCase()] || 0);
    if (/tarde|noite/i.test(m[3]) && h < 12) h += 12;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  m = tl.match(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+da\s+(manh[ãa]|tarde|noite)\b/i);
  if (m) {
    let h = _ptH[m[1].toLowerCase()] || 1;
    if (/tarde|noite/i.test(m[2]) && h < 12) h += 12;
    return `${String(h).padStart(2,'0')}:00`;
  }
  m = tl.match(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+e\s+(quarenta\s+e\s+cinco|quarenta|cinquenta|trinta|vinte|quinze|meia)\b/i);
  if (m) {
    const h = _ptH[m[1].toLowerCase()] || 1;
    const min = /quarenta\s+e\s+cinco/.test(m[2]) ? 45 : (_ptM[m[2].toLowerCase()] || 0);
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }

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
    .replace(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+e\s+(quarenta\s+e\s+cinco|quarenta|cinquenta|trinta|vinte|quinze|meia)\s+da\s+(manh[ãa]|tarde|noite)\b/gi, '')
    .replace(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+e\s+(quarenta\s+e\s+cinco|quarenta|cinquenta|trinta|vinte|quinze|meia)\b/gi, '')
    .replace(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+da\s+(manh[ãa]|tarde|noite)\b/gi, '')
    .replace(/\bda\s+(manh[ãa]|tarde|noite)\b/gi, '')
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
        } else if (result === 'denied') {
          setTimeout(() => addMessage(t('pet.notif.blocked'), 'bot'), 350);
        }
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

// FAQ: instalar o app + ativar notificações. Pergunta o aparelho (Android/iPhone)
// com botões e explica conforme a escolha. Retorna null (monta a própria mensagem).
function cmdNotificacoesAjuda() {
  const box = document.getElementById('pet-messages');
  if (!box) return '📱 Abra o assistente aqui embaixo pra eu te ajudar com as notificações.';

  addMessage('📱 Qual aparelho você usa? Te explico certinho como garantir os lembretes (som, vibração e banner):', 'bot');

  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card">
      <button class="pet-reg-btn" data-dev="android">🤖 Android</button>
      <button class="pet-reg-btn" data-dev="ios">🍎 iPhone (iOS)</button>
    </span>`;
  div.querySelector('[data-dev="android"]').addEventListener('click', showAndroidNotifHelp);
  div.querySelector('[data-dev="ios"]').addEventListener('click', showIosNotifHelp);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return null;
}

// ── Android ──────────────────────────────────────────────────
function showAndroidNotifHelp() {
  const box = document.getElementById('pet-messages');
  addMessage('🤖 <strong>Android</strong> — antes de tudo: o Falcon já está <strong>instalado</strong> na tela inicial do celular?', 'bot');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card">
      <button class="pet-reg-btn" data-inst="yes">✅ Já está instalado</button>
      <button class="pet-reg-btn" data-inst="no">📲 Ainda não / não sei</button>
    </span>`;
  div.querySelector('[data-inst="yes"]').addEventListener('click', showAndroidNotifSteps);
  div.querySelector('[data-inst="no"]').addEventListener('click', showAndroidInstallSteps);
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

function showAndroidInstallSteps() {
  const box = document.getElementById('pet-messages');
  addMessage('🤖 <strong>Passo 1 · instalar o app</strong><br><br>' +
    'Por enquanto o Falcon é um web app (logo vira aplicativo). Pra instalar:<br>' +
    '• Menu do Chrome (<strong>⋮</strong> em cima) → <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong><br>' +
    '• Às vezes tem um ícone de <strong>instalar (⊕ / ↓)</strong> na barra de endereço<br>' +
    '• Ou o menu mostra <strong>“Adicionar ao Início”</strong>', 'bot');
  if (canInstallApp() && box) {
    const div = document.createElement('div');
    div.className = 'pet-msg pet-msg-bot';
    div.innerHTML = `<span class="pet-preview-card"><button class="pet-reg-btn" id="pet-install-btn">📲 Instalar Falcon agora</button></span>`;
    const b = div.querySelector('#pet-install-btn');
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Abrindo…';
      const o = await promptInstallApp();
      b.textContent = o === 'accepted' ? '✅ Instalando!' : '📲 Instalar Falcon agora';
      if (o !== 'accepted') b.disabled = false;
    });
    box.appendChild(div); box.scrollTop = box.scrollHeight;
  } else {
    addMessage('Não achou nenhuma dessas opções? Feche e abra o site de novo — às vezes o Chrome leva alguns segundos pra liberar a opção de instalar.', 'bot');
  }
  setTimeout(() => addMessage('Depois de instalar e abrir pelo ícone novo, me pergunta <strong>“notificação”</strong> de novo e escolha <strong>“Já está instalado”</strong> que te mostro como ativar som, pop-up e vibração. 😉', 'bot'), 450);
}

function showAndroidNotifSteps() {
  addMessage('🤖 <strong>Ativar som, pop-up e vibração</strong><br><br>' +
    '1. Configurações do Android → <strong>Apps → Falcon → Notificações</strong><br>' +
    '2. Abra a categoria <strong>Geral</strong><br>' +
    '3. Ative <strong>Mostrar como pop-up</strong> e <strong>Vibrar</strong><br><br>' +
    'Atalho: segure o dedo numa notificação do Falcon → toque na engrenagem ⚙️ ou em <strong>“Configurações”</strong> → Geral.', 'bot');
}

// ── iPhone ───────────────────────────────────────────────────
function showIosNotifHelp() {
  const box = document.getElementById('pet-messages');
  addMessage('🍎 <strong>iPhone</strong> — antes de tudo: o Falcon já está na <strong>Tela de Início</strong>?', 'bot');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card">
      <button class="pet-reg-btn" data-inst="yes">✅ Já adicionei</button>
      <button class="pet-reg-btn" data-inst="no">📲 Ainda não / não sei</button>
    </span>`;
  div.querySelector('[data-inst="yes"]').addEventListener('click', showIosInstalledSteps);
  div.querySelector('[data-inst="no"]').addEventListener('click', showIosInstallSteps);
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

function showIosInstallSteps() {
  addMessage('🍎 <strong>Adicionar à Tela de Início</strong><br><br>' +
    'No iPhone os lembretes só chegam com o app na tela inicial (o Safari sozinho não recebe):<br><br>' +
    '1. Toque em <strong>Compartilhar</strong> (o quadrado com seta ↑) na barra do Safari<br>' +
    '2. Escolha <strong>“Adicionar à Tela de Início”</strong><br>' +
    '3. Abra o Falcon pelo ícone novo e permita as notificações<br><br>' +
    '<small>Precisa de iOS 16.4 ou mais novo.</small>', 'bot');
}

function showIosInstalledSteps() {
  addMessage('🍎 <strong>Tudo certo!</strong><br><br>' +
    'Os lembretes já aparecem como banner e tocam som. Pra ajustar som/estilo: <strong>Ajustes do iPhone → Notificações → Falcon</strong>. A vibração segue os ajustes de toque do próprio iPhone.', 'bot');
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
      btn.textContent = '✅ Confirmar';
      console.error('[pet] edit:', err);
    });
  }

  // Cria um card com título descritivo + botão Confirmar separado
  function makeCard(match) {
    const { task, date } = match;
    const card = document.createElement('span');
    card.className = 'pet-preview-card';

    const title = document.createElement('span');
    title.className = 'pet-preview-title';
    const sub   = document.createElement('span');
    sub.className = 'pet-preview-sub';

    if (action === 'rename') {
      title.textContent = `✏️ ${task.title}`;
      sub.textContent   = `→ "${payload.newName}" · ${fmtDate(date)}`;
    } else if (action === 'time') {
      title.textContent = `⏰ ${task.title}`;
      sub.textContent   = `${fmtDate(date)} · ${task.startTime || '—'} → ${payload.newTime}`;
    } else {
      title.textContent = `📅 ${task.title}`;
      sub.textContent   = `${fmtDate(date)} → ${fmtDate(payload.newDate)}${payload.newTime ? ' · ' + payload.newTime : ''}`;
    }

    const btn = document.createElement('button');
    btn.className   = 'pet-reg-btn';
    btn.textContent = '✅ Confirmar';
    btn.addEventListener('click', () => applyEdit(match, btn));

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(btn);
    return card;
  }

  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';

  if (matches.length > 1) {
    const intro = document.createElement('span');
    intro.className = 'pet-preview-card';
    const introSub = document.createElement('span');
    introSub.className = 'pet-preview-sub';
    introSub.textContent = t('pet.edit.ambiguous', { n: matches.length });
    intro.appendChild(introSub);
    div.appendChild(intro);
  }

  for (const match of matches) div.appendChild(makeCard(match));
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
    piscar();
    scheduleBlink();
  }, delay);
}
