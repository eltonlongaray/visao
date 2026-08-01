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
  getCategories, saveCategory, getProfile, setProfile,
  dayId, sleepDuration, formatTime
} from './banco-dados.js';
import { calcularConstancia } from './metricas-constancia.js';
import { scheduleNotif, notifTag, requestPermission, canInstallApp, promptInstallApp } from './notificacoes.js';
import { t, getLang } from './idioma.js';
import { extrairCampos } from './ditado-campos.js';
import { parseRecorrencia, ruleLabel, ordWeekday, RECUR_STRIP } from './recorrencia.js';
import { juntarFala } from './ditado-merge.js';

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
const OLHO_X = 4, OLHO_Y = 3.3; // deslocamento da ÍRIS (unidades do SVG)
const PUPILA_MULT = 3.5;        // a pupila anda 3.5x isso, dentro da íris

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
    // Devolve TUDO que o guia mexeu, não só left/top: right/bottom/align foram
    // alterados pra corrigir o olho, e sem limpar, o pet nasceria fora do
    // canto ao terminar o tour. aplicarPosicaoPet redefine na sequência.
    ['left', 'top', 'right', 'bottom', 'align-items'].forEach(p => el.style.removeProperty(p));
    aplicarPosicaoPet();
    el.querySelector('.pet-iris-group')?.removeAttribute('transform');
    el.querySelector('.pet-pupil-group')?.removeAttribute('transform');
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
    const larguraAlvo = vis.right - vis.left;
    const alvoAlto  = (vis.bottom - vis.top) > vh * 0.55;   // card do dia no Ritual
    const alvoLargo = larguraAlvo > vw * 0.62;              // card que ocupa a tarja

    if (alvoAlto) {
      // Card muito alto: pet no topo, na altura do × de fechar, pra não tapar
      // o começo do conteúdo.
      x = 8;
      const bx = document.querySelector('.tour2-floating-x')?.getBoundingClientRect();
      y = bx ? bx.top + (bx.height - TAM) / 2 : 14;
    } else if (alvoLargo) {
      // Card largo ocupa a tarja toda — não há lateral livre e, na mesma
      // altura, o pet cai DENTRO dele. Então fica FORA: canto esquerdo, ACIMA
      // do card se couber, senão abaixo. O olhar vai em diagonal pro centro.
      x = 8;
      y = (vis.top - GAP - TAM >= 12) ? vis.top - GAP - TAM
                                      : Math.min(vis.bottom + GAP, maxY);
    } else {
      // Alvo estreito (toggle, botão): pet à ESQUERDA e no vertical OPOSTO —
      // alvo em cima → pet abaixo; alvo embaixo → pet acima. Isso cria a
      // diagonal: reto embaixo do alvo, o olhar caía pra baixo, longe dele.
      x = rect.left - GAP - TAM;
      if (x < 8) x = Math.min(rect.right + GAP, vw - TAM - 8);  // não cabe à esquerda → direita
      y = centroY < vh / 2 ? Math.min(vis.bottom + GAP, maxY)
                           : Math.max(vis.top - GAP - TAM, 12);
    }
    mira = { x: centroX, y: alvoAlto ? Math.min(centroY, vis.top + vh * 0.3) : centroY };
  }

  x = Math.max(8, Math.min(x, vw - TAM - 8));
  y = Math.max(12, Math.min(y, maxY));
  // Limpa right/bottom (deixados por aplicarPosicaoPet) e força o olho pro
  // COMEÇO do container. O container tem 288px por causa do painel embutido;
  // com align-items:flex-end o olho ia pra direita DELE e aparecia ~230px à
  // direita do left que eu setava — anulando todo o cálculo de posição.
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.alignItems = 'flex-start';
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
  // mesma base do petGuideTo: olho no início do container, right/bottom limpos,
  // senão o x calculado do canto direito não bate com onde o olho aparece
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.alignItems = 'flex-start';
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

// Usa só a DIREÇÃO do alvo, não a distância. Assim o olhar tem sempre a mesma
// intensidade: mesma direção = mesmo olhar em qualquer passo. E o resultado cai
// sempre sobre uma elipse fixa, então na diagonal os eixos não somam e estouram.
function aplicarOlhar() {
  const el = document.getElementById('visao-pet');
  if (!el) return;
  if (_olhandoUsuario || !_alvoPos || !_petPos) { moverPupila(el, 0, 0); return; }
  const dx = _alvoPos.x - _petPos.x, dy = _alvoPos.y - _petPos.y;
  const d = Math.hypot(dx, dy) || 1;
  moverPupila(el, dx / d * OLHO_X, dy / d * OLHO_Y);
}

// Move a íris (com a pupila junto) sobre a esclera branca — como olho de verdade.
// Olhando pra cima/baixo, a pálpebra daquele lado DIMINUI pra não cortar o olhar.
// Usa atributo do SVG (nativo e universal).
const LID_RY = 22;    // altura normal da pálpebra
const LID_ABRE = 1.3; // quanto a pálpebra do lado do olhar recua (abre)
const LID_SEGUE = 0.5;// quanto a de cima desce junto quando ele olha pra baixo
const FOLGA_LID = 18; // limite pra pupila (ry 11) nunca encostar na pálpebra
function moverPupila(el, ex, ey) {
  // A ÍRIS desliza pouco (é o que faz a borda afinar de um lado e viajar do
  // outro). A PUPILA desliza bem mais, DENTRO da íris, chegando perto da borda.
  el.querySelector('.pet-iris-group')?.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
  el.querySelector('.pet-pupil-group')?.setAttribute('transform',
    `translate(${(ex * PUPILA_MULT).toFixed(1)} ${(ey * PUPILA_MULT).toFixed(1)})`);
  ey = ey * (1 + PUPILA_MULT);   // pálpebras seguem o deslocamento TOTAL da pupila
  // As pálpebras SEGUEM a pupila 1:1, então ela sempre ENCOSTA na de cima
  // (olhando pra cima) ou na de baixo (olhando pra baixo).
  // Geometria: pupila ry=11 em cy=30; pálpebra de cima tem borda em `ry`,
  // a de baixo em `60-ry`. Cobrindo 3 unidades da pupila → ry = 22 ± ey.
  // A pálpebra do lado do olhar recua MAIS que o olhar (1.3x), pra a pupila
  // nunca ficar escondida atrás dela. Olhando pra baixo, a de cima desce junto
  // (um pouco), mas sem alcançar a pupila.
  let ryCima, ryBaixo;
  if (ey < 0) {                                  // olhando pra CIMA
    ryCima  = LID_RY + LID_ABRE * ey;            // recua bastante
    ryBaixo = LID_RY;                            // a oposta fica parada
  } else {                                       // olhando pra BAIXO
    ryCima  = LID_RY + LID_SEGUE * ey;           // desce junto, de leve
    ryBaixo = LID_RY - LID_ABRE * ey;            // recua bastante
  }
  // SÓ com o olhar direcionado (no tutorial): abre o quanto for preciso pra a
  // pupila não encostar. Parado/olhando pra frente ela volta ao normal — e aí
  // fica levemente coberta pelas pálpebras, que é o visual de sempre.
  if (Math.abs(ex) > 0.5 || Math.abs(ey) > 0.5) {
    ryCima  = Math.min(ryCima,  FOLGA_LID + ey);
    ryBaixo = Math.min(ryBaixo, FOLGA_LID - ey);
  }
  el.querySelector('.pet-lid-top')?.setAttribute('ry', Math.max(0, ryCima).toFixed(1));
  el.querySelector('.pet-lid-bot')?.setAttribute('ry', Math.max(0, ryBaixo).toFixed(1));
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
      <button class="pet-chat-close" id="pet-chat-close">${t('pet.close')}</button>
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
      <div class="pet-msg pet-msg-bot">
        <button class="pet-ajuda-btn" id="pet-ajuda">❓ Ajuda — o que dá pra fazer</button>
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
      <g clip-path="url(#petEyeClip)">
        <g class="pet-iris-group">
          <circle cx="30" cy="30" r="27" fill="#eab308" stroke="#0d0d0d" stroke-width="8"/>
          <!-- Reflexos andam JUNTO com a pupila (senão ela desliza por baixo deles) -->
          <g class="pet-pupil-group">
            <ellipse cx="30" cy="30" rx="7" ry="11" fill="#0d0d0d" class="pet-pupil"/>
            <circle cx="34" cy="24" r="3.6" fill="white" opacity="0.85"/>
            <circle cx="26" cy="35" r="1.6" fill="white" opacity="0.35"/>
          </g>
        </g>
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
  document.getElementById('pet-body').addEventListener('click', () => {
    if (_petMoveu) { _petMoveu = false; return; }   // acabou de arrastar: não abre
    toggleChat();
  });
  aplicarPosicaoPet();
  ligarArrastePet();
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
  document.getElementById('pet-messages').addEventListener('click', e => {
    if (e.target.closest('#pet-ajuda')) menuAjuda();
    else if (e.target.closest('#aj-agendar')) ensinarAgendar();
    else if (e.target.closest('#aj-editar')) ensinarEditar();
  });

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

// Menu de Ajuda: EXECUTAR comandos (diferente dos atalhos de cima, que só
// CONSULTAM). Três opções em botões clicáveis, cada uma abre o como-fazer.
function menuAjuda() {
  const box = document.getElementById('pet-messages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `<span class="pet-ajuda-menu">
    <strong>O que você quer fazer?</strong>
    <button class="pet-ajuda-op" id="aj-agendar">📅 Agendar uma atividade</button>
    <button class="pet-ajuda-op" id="aj-editar">✏️ Editar ou reagendar</button>
  </span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function ensinarEditar() {
  addMessage(
    '✏️ <strong>Pra mudar uma atividade que já existe</strong>, me diga o que trocar:<br><br>' +
    '• <em>"editar nome da tarefa Academia para Musculação"</em><br>' +
    '• <em>"editar horário do compromisso Reunião para 15h"</em><br>' +
    '• <em>"editar descrição do compromisso Reunião para Pauta trimestral"</em><br>' +
    '• <em>"adicionar lembrete à tarefa Academia"</em> (🔔 sininho na Home)<br>' +
    '• <em>"repetir tarefa Academia toda semana"</em> (🔁 repetição)<br>' +
    '• <em>"reagendar tarefa Mercado para sexta"</em><br><br>' +
    'Eu acho a atividade pelo nome e aplico a mudança. 🦅', 'bot');
}

// Ensina a agendar em UMA mensagem, com exemplo pronto pra copiar. Passo a
// passo cansa; um modelo que a pessoa adapta é mais rápido de entender.
function ensinarAgendar() {
  addMessage(
    '📅 <strong>Pra agendar, me diga tudo de uma vez</strong> — por texto ou voz:<br><br>' +
    '<em>"agendar compromisso sábado às 8 horas, título Academia, descrição Treino de perna"</em><br><br>' +
    'Eu separo sozinho:<br>' +
    '• <strong>o tipo</strong> — compromisso (com hora) ou tarefa<br>' +
    '• <strong>o dia e a hora</strong><br>' +
    '• <strong>o título</strong> — tem que ser uma <strong>atividade que você registrou lá na Home</strong> (é ela que faz contar pro objetivo). Se não existir, eu te ofereço criar na hora 😉<br>' +
    '• <strong>a descrição</strong> — um detalhe, se quiser<br>' +
    '• <strong>"com lembrete"</strong> — se quiser o 🔔 sininho na Home<br>' +
    '• <strong>repetição</strong> — "toda semana", "todo mês", "de 2 em 2 semanas", "a cada 3 meses", "último domingo do mês", "último dia do mês"<br><br>' +
    'Depois é só tocar em <strong>registrar</strong> na prévia que eu monto. 🦅', 'bot');
}

function toggleChat() {
  const chat = document.getElementById('pet-chat');
  chat.classList.contains('pet-chat-open') ? closeChatPanel() : openChatPanel();
}

// ═══════════════════════════════════════════════════════════════
// TECLADO ABERTO — mantém o topo do painel e o campo de digitar visíveis.
// Sem isso o painel continua com a altura da tela inteira enquanto o teclado
// cobre metade dela, e o topo da janela sai fora do campo de visão.
// ═══════════════════════════════════════════════════════════════
function ajustarChatAoTeclado() {
  const pet  = document.getElementById('visao-pet');
  const chat = document.getElementById('pet-chat');
  if (!pet || !chat) return;

  // Fechado: devolve o controle pro CSS.
  if (!chat.classList.contains('pet-chat-open')) {
    pet.style.bottom = '';
    chat.style.height = '';
    chat.style.maxHeight = '';
    return;
  }

  // PINCH-ZOOM: o zoom também dispara resize/scroll do visualViewport (a altura
  // visível encolhe). Se recalcular aqui, o painel se redimensiona e o TOPO foge
  // enquanto a pessoa dá zoom. Com scale > 1 (ampliado), deixa tudo imóvel.
  const vvZoom = window.visualViewport;
  if (vvZoom && vvZoom.scale > 1.01) return;

  const vv      = window.visualViewport;
  const visivel = vv ? vv.height : window.innerHeight;

  // Quanto do RODAPÉ do layout viewport está encoberto pelo teclado. Existem
  // dois comportamentos de engine e o painel precisa funcionar nos dois:
  //   a) layout viewport NÃO encolhe -> encoberto = altura do teclado, e o pet
  //      (position:fixed) precisa subir pra não ficar atrás dele.
  //   b) layout viewport ENCOLHE     -> encoberto ~ 0, o pet já está no lugar
  //      certo sozinho, MAS o CSS continua calculando com 100vh, que não
  //      encolhe — era daí que vinha o painel vazando pra fora do topo.
  // Medir só (innerHeight - vv.height) dava 0 no caso (b) e a função desistia.
  const encoberto = vv
    ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    : 0;

  // Distância do pet até o fundo do que está VISÍVEL (não até o fundo do layout).
  const levantado = encoberto > 40;
  pet.style.bottom = levantado ? (encoberto + 8) + 'px' : '';
  const basePet = levantado ? 8 : PET_BOTTOM;

  // 78 = corpo do pet (44) + gap (10) + respiro no topo (24).
  // A altura é escrita SEMPRE que o painel está aberto, e não só quando há
  // teclado: é a única medida que acompanha a tela visível de verdade.
  const altura = Math.max(180, Math.round(visivel - basePet - 78));
  chat.style.height    = altura + 'px';
  chat.style.maxHeight = altura + 'px';

  const msgs = document.getElementById('pet-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', ajustarChatAoTeclado);
  window.visualViewport.addEventListener('scroll', ajustarChatAoTeclado);
}

// ═══════════════════════════════════════════════════════════════
// POSIÇÃO DO PET — padrão + arraste pelas laterais
// ═══════════════════════════════════════════════════════════════
// O padrão 78px punha o olho EM CIMA do botão de enviar do chat (28px de
// sobreposição, medidos). Descer não era opção: abaixo do botão sobram 10px
// até o cinturão e o corpo tem 44. Então ele sobe para 150 e, a partir daí,
// quem manda é o usuário: segura o olho e arrasta.
//
// O X é imantado numa das laterais — solto no meio da tela ele taparia
// conteúdo e ficaria no caminho de qualquer toque.
const POS_PET = 'visao_pet_pos';       // { lado: 'esq'|'dir', vert: 'cima'|'baixo' }
const PET_CORPO  = 58;                 // diâmetro do olho
const PET_MARGEM = 14;
const CINTURAO   = 84;                 // altura da barra de navegação de baixo
// Folga acima do cinturão. Um corpo inteiro (58) deixava o pet flutuando
// alto demais no meio da tela; meio corpo aproxima sem encostar na tarja.
// A tarja PLANA do cinturão só começa a 58px do fim da tela: a nav tem 84,
// mas os 26 de cima são a corcova da fivela. Medir a folga a partir de 84
// deixava o pet 34px no ar mesmo com "8 de folga".
const CINTURAO_COURO = 58;
const PET_FOLGA  = 8;
const PET_BOTTOM = CINTURAO_COURO + PET_FOLGA;
const PET_TOPO   = 16;                 // folga do topo quando está em cima

// Telas onde o pet NÃO aparece. Na conversa ele disputava espaço com o botão
// de enviar, a foto e as opções — e ali ele não tem nada a fazer: é ajudante
// de rotina, não de conversa.
const TELAS_SEM_PET = ['#/chat'];
function petEscondido() {
  return TELAS_SEM_PET.some(r => (location.hash || '').startsWith(r));
}

function _posSalva() {
  try { return JSON.parse(localStorage.getItem(POS_PET) || 'null'); } catch { return null; }
}

function aplicarPosicaoPet(lado, vert) {
  const el = document.getElementById('visao-pet');
  if (!el) return;
  // Durante o tutorial quem posiciona o pet é petGuideTo. Sem esta guarda, o
  // hashchange de cada troca de tela do tour re-rodava esta função e resetava
  // o pet pro canto — anulando o guia. Era por isso que os ajustes de posição
  // do tour "não mudavam nada".
  if (el.classList.contains('pet-guiding')) return;
  el.style.display = petEscondido() ? 'none' : '';
  if (petEscondido()) return;

  const salvo = _posSalva();
  const l = lado || (salvo?.lado === 'esq' ? 'esq' : 'dir');
  const v = vert || (salvo?.vert === 'cima' ? 'cima' : 'baixo');

  if (l === 'esq') {
    el.style.left = PET_MARGEM + 'px'; el.style.right = 'auto';
    el.style.alignItems = 'flex-start';
  } else {
    el.style.right = PET_MARGEM + 'px'; el.style.left = 'auto';
    el.style.alignItems = 'flex-end';
  }

  if (v === 'cima') {
    el.style.top = `calc(${PET_TOPO}px + env(safe-area-inset-top, 0px))`;
    el.style.bottom = 'auto';
    // Em cima, o painel tem que abrir PRA BAIXO — na ordem normal ele nasce
    // acima do olho e sairia inteiro pela borda superior da tela.
    el.classList.add('pet-em-cima');
  } else {
    el.style.bottom = PET_BOTTOM + 'px';
    el.style.top = 'auto';
    el.classList.remove('pet-em-cima');
  }

  // O painel do pet é dimensionado a partir daqui; publicar a altura evita
  // que o CSS calcule com um valor antigo.
  document.documentElement.style.setProperty('--pet-bottom',
    (v === 'cima' ? PET_TOPO : PET_BOTTOM) + 'px');
  ajustarChatAoTeclado();
}


let _petMoveu = false;   // impede que o arraste abra o chat ao soltar

function ligarArrastePet() {
  const el = document.getElementById('visao-pet');
  const corpo = document.getElementById('pet-body');
  if (!el || !corpo) return;

  const LIMIAR = 10;   // px de movimento que separam "toquei" de "arrastei"
  let x0 = 0, y0 = 0, ativo = false;
  let lado = _posSalva()?.lado === 'esq' ? 'esq' : 'dir';
  let vert = _posSalva()?.vert === 'cima' ? 'cima' : 'baixo';

  const px = (ev) => ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
  const py = (ev) => ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;

  const comecar = (ev) => {
    if (document.getElementById('pet-chat')?.classList.contains('pet-chat-open')) return;
    x0 = px(ev); y0 = py(ev); ativo = true; _petMoveu = false;
    // Captura o ponteiro: garante que os movimentos sigam chegando mesmo se
    // o dedo sair de cima do olho durante o arraste.
    try { corpo.setPointerCapture(ev.pointerId); } catch {}
  };

  const mover = (ev) => {
    if (!ativo) return;
    const dx = px(ev) - x0, dy = py(ev) - y0;
    // Só vira arraste depois do limiar: sem isso qualquer tremida no toque
    // impediria de abrir o chat.
    if (!_petMoveu && Math.hypot(dx, dy) < LIMIAR) return;
    if (!_petMoveu) {
      _petMoveu = true;
      el.classList.add('pet-arrastando');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
    }
    ev.preventDefault();
    // Imantado nos 4 cantos: solto em qualquer ponto ele taparia conteúdo e
    // ficaria no caminho de toques. A metade da tela decide cada eixo.
    lado = px(ev) < window.innerWidth  / 2 ? 'esq'  : 'dir';
    vert = py(ev) < window.innerHeight / 2 ? 'cima' : 'baixo';
    aplicarPosicaoPet(lado, vert);
  };

  const soltar = (ev) => {
    try { if (ev?.pointerId != null) corpo.releasePointerCapture(ev.pointerId); } catch {}
    if (ativo && _petMoveu) {
      el.classList.remove('pet-arrastando');
      localStorage.setItem(POS_PET, JSON.stringify({ lado, vert }));
    }
    ativo = false;
  };

  corpo.addEventListener('pointerdown', comecar);
  corpo.addEventListener('pointermove', mover, { passive: false });
  corpo.addEventListener('pointerup', soltar);
  corpo.addEventListener('pointercancel', soltar);
  // Rede: se a captura falhar em algum navegador, a janela ainda responde.
  window.addEventListener('pointermove', mover, { passive: false });
  window.addEventListener('pointerup', soltar);
  window.addEventListener('resize', () => aplicarPosicaoPet());
  window.addEventListener('hashchange', () => setTimeout(() => aplicarPosicaoPet(), 150));
  window.addEventListener('falcon:layout', () => aplicarPosicaoPet());
}


// O painel do pet é uma camada sobre a tela, não uma rota. Sem entrada
// própria no histórico, o voltar do aparelho passava direto por ele e trocava
// a aba do cinturão — o painel ficava aberto por cima da tela errada.
let petNoHistorico = false;

function openChatPanel() {
  document.getElementById('pet-chat').classList.add('pet-chat-open');
  ajustarChatAoTeclado();   // dimensiona pela tela visível já na abertura
  setBadge(0);
  setPetState('idle');
  if (!petNoHistorico) {
    history.pushState({ falconPet: 1 }, '');
    petNoHistorico = true;
  }
  // Sem focus() automático: abrir o chat não deve abrir o teclado junto.
  // O usuário toca no campo quando quiser escrever.
}

function fecharPainelDireto() {
  if (recording) stopMicCancel();
  document.getElementById('pet-chat')?.classList.remove('pet-chat-open');
  ajustarChatAoTeclado();   // devolve o pet pro canto e limpa a altura inline
}

function closeChatPanel() {
  // Fechar pelo botão consome a entrada do histórico; sem isso sobraria lixo
  // e um voltar futuro não faria nada visível.
  if (petNoHistorico) { petNoHistorico = false; history.back(); return; }
  fecharPainelDireto();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (!petNoHistorico) return;
    petNoHistorico = false;
    fecharPainelDireto();
  });
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

// Título e descrição ditados em rótulo ficam guardados aqui até o registro
// acontecer — o fluxo passa por perguntas ("é atividade ou compromisso?") e
// perderia os campos no caminho.
let ditado = { titulo: null, descricao: null, lembrete: false, recorrencia: null };

async function routeCommand(text) {
  // Texto original preservado: "com lembrete" pode vir depois da descrição, e aí
  // o extrairCampos reescreve `text` e o perde. A detecção do lembrete usa este.
  const textoBruto = String(text || '');
  // "…Título lazer. Descrição aniversário" — os rótulos saem do comando pra
  // não virarem parte do nome, e voltam na hora de gravar.
  const campos = extrairCampos(text);

  // COMANDO NOVO ZERA O DITADO. Sem isto os campos do comando anterior
  // sobreviviam numa variável de módulo e vazavam pro seguinte: um "agendar
  // compromisso" simples herdava o "descrição aniversário" de um teste feito
  // minutos antes. Só uma conversa EM ANDAMENTO (o pet perguntando a hora,
  // por exemplo) preserva o que já foi dito.
  // COMANDO NOVO INTERROMPE A CONVERSA EM ANDAMENTO. Sem isto, uma pergunta
  // pendente ("qual horário?") engolia a próxima frase como resposta — mesmo
  // sendo um comando completo. Foi o que fez "Agendar compromisso sábado às
  // 8:00 título academia" virar a resposta de outra pergunta, perdendo data,
  // hora e título no caminho.
  const pareceComandoNovo = REGISTER_TRIGGERS.test(String(text).trim());
  if (pareceComandoNovo && convState) convState = null;

  const continuandoConversa = !!convState;
  if (!continuandoConversa) ditado = { titulo: null, descricao: null, lembrete: false, recorrencia: null };

  // Num comando de EDIÇÃO ("editar descrição do compromisso X para Y") a palavra
  // "descrição" é o NOME do campo a mudar, não um valor. Sem esta guarda, o
  // extrairCampos engolia "descrição do compromisso X para Y" e sobrava só
  // "Editar" — o parser de edição nunca via o comando inteiro.
  const ehEdicao = /^(editar?|reagend[ae]r?|reschedule|mover?)\b/i.test(String(text).trim());

  if (!ehEdicao && (campos.titulo || campos.descricao)) {
    ditado = {
      titulo: campos.titulo || (continuandoConversa ? ditado.titulo : null),
      descricao: campos.descricao || (continuandoConversa ? ditado.descricao : null),
      lembrete: continuandoConversa ? ditado.lembrete : false,
      recorrencia: continuandoConversa ? ditado.recorrencia : null,
    };
    text = campos.comando;
  }
  const tl = text.toLowerCase();

  // ── Continua conversa em andamento ──
  if (convState?.type === 'waiting_name') {
    const name = ditado.titulo || text;
    // Data e hora podem vir NA RESPOSTA, não só no comando original: quem
    // responde "academia sábado às 8" está dizendo as três coisas de uma vez.
    const date = extractDate(text) || convState.date || new Date();
    const time = extractTime(text) || convState.time || '';
    convState = null;
    return askType(name, date, time);
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

  // ── Lembrete visual (🔔 sininho / ponto vermelho na Home): liga/desliga numa
  // atividade que JÁ existe. Vem ANTES das consultas e do register: "marcar
  // lembrete..." bateria no register e "...na tarefa X" na lista de tarefas. ──
  const _lembTail = '(?:o\\s+|um\\s+)?lembrete\\s+(?:(?:n[oa]|d[oa]|à|ao|em|pra|para)\\s+)?(?:o\\s+|a\\s+)?(?:(compromisso|tarefa|atividade|commitment|task)\\s+)?(.+)';
  const mLembOn = text.match(new RegExp('^(?:adicion\\w*|marca\\w*|ativa\\w*|coloca\\w*|liga\\w*|bota\\w*|p[oô]e|habilita\\w*)\\s+' + _lembTail, 'i'));
  if (mLembOn) { await cmdEditarLembrete(mLembOn[2].trim().replace(/[.,;:!?]+$/, ''), mLembOn[1] ? mLembOn[1].toLowerCase() : null, true); return null; }

  const mLembOff = text.match(new RegExp('^(?:tira\\w*|retira\\w*|remov\\w*|desativa\\w*|desliga\\w*|apaga\\w*|cancela\\w*|desmarca\\w*)\\s+' + _lembTail, 'i'));
  if (mLembOff) { await cmdEditarLembrete(mLembOff[2].trim().replace(/[.,;:!?]+$/, ''), mLembOff[1] ? mLembOff[1].toLowerCase() : null, false); return null; }

  // ── Editar SÓ a repetição de uma atividade que já existe ──
  // "repetir tarefa academia toda semana" / "editar repetição do compromisso X para todo mês"
  const mRep = text.match(/^(?:repetir|repete|editar?\s+(?:a\s+)?(?:repeti[çc][ãa]o|recorr[êe]ncia))\s+(.+)/i);
  if (mRep) {
    const recFrag = parseRecorrencia(mRep[1]);
    if (!recFrag) { addMessage('Não entendi a repetição. Ex.: <em>"repetir tarefa Academia toda semana"</em>.', 'bot'); return null; }
    let resto = mRep[1].replace(/\bpara\b/gi, ' ').replace(RECUR_STRIP, ' ');
    let tipoR = null;
    const mt = resto.match(/\b(compromisso|tarefa|atividade|commitment|task)\b/i);
    if (mt) { tipoR = mt[1].toLowerCase(); resto = resto.replace(mt[0], ' '); }
    const nomeR = resto.replace(/\bd[oa]s?\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!nomeR) { addMessage('Qual atividade? Ex.: <em>"repetir tarefa Academia toda semana"</em>.', 'bot'); return null; }
    await cmdEditarRepeticao(nomeR, tipoR, recFrag);
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
    // "com lembrete" liga o sininho já na criação; sem falar nada, não liga.
    ditado.lembrete = /\bcom\s+(?:um\s+)?(?:lembrete|sininho|sino)\b/i.test(textoBruto);
    // Se "com lembrete" grudou na descrição, tira de lá (é comando, não detalhe).
    if (ditado.lembrete && ditado.descricao)
      ditado.descricao = ditado.descricao.replace(/\s*\bcom\s+(?:um\s+)?(?:lembrete|sininho|sino)\b/i, '').trim() || null;
    const targetDate    = extractDate(text);
    // Recorrência: "toda semana", "todo mês", "último domingo do mês", "a cada 3
    // meses"… A data do comando vira a ÂNCORA (e o dia-do-mês / dia-da-semana).
    const recFrag = parseRecorrencia(textoBruto);
    ditado.recorrencia = null;
    if (recFrag) {
      ditado.recorrencia = { ...recFrag, anchor: dayId(targetDate) };
      if (recFrag.freq === 'weekly') ditado.recorrencia.weekday = targetDate.getDay();
      if (recFrag.freq === 'monthly' && !recFrag.lastDayOfMonth && recFrag.lastWeekday == null)
        ditado.recorrencia.dayOfMonth = targetDate.getDate();
    }
    const tipoExplicito = /\bcompromisso\b|commitment/i.test(tl)             ? 'compromisso'
                        : /\batividade\b|\btarefa\b|activity|task/i.test(tl)  ? 'atividade'
                        : null;
    const taskTime = extractTime(text);
    // Título ditado vence o extraído da frase: ele foi declarado, não inferido.
    const nameRaw  = ditado.titulo || extractTaskName(text);

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

  const mDesc = text.match(/^editar?\s+(?:descri[çc][ãa]o|nota|detalhe)\s+(?:d[oa]s?\s+)?(compromisso|tarefa|atividade|commitment|task)\s+(.+?)\s+para\s+(.+)/i);
  if (mDesc) { await cmdEditarDescricao(mDesc[2].trim(), mDesc[3].trim().replace(/[.,;:!?]+$/, ''), mDesc[1].toLowerCase()); return null; }

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
  // (?:^|\s) no lugar de \b: "às" começa com À, que NÃO conta como letra na
  // regra de fronteira de palavra do JS (\w é só A-Z, 0-9 e _). Com \b o
  // padrão nunca casava em "às 8" — só em "as 8", sem acento. Era isso que
  // fazia o pet pedir o horário depois de a pessoa já ter dito, sempre que a
  // palavra "horas" era comida e sobrava só o "às 8".
  m = tl.match(/(?:^|\s)(?:às?|as|at)\s+(\d{1,2})\s*h(?:oras?)?\b/);
  if (m) return `${m[1].padStart(2,'0')}:00`;
  m = tl.match(/(?:^|\s)(?:às?|as|at)\s+(\d{1,2})\b/);
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
    .replace(/\bcom\s+(um\s+)?(lembrete|sininho|sino)\b\s*/gi, '')
    .replace(RECUR_STRIP, ' ')
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

  // "dia 12" — dia do mês sem barra nem mês. Assume o mês atual; se o dia já
  // passou, joga pro mês seguinte. Sem isto, "dia 12" não casava com nada e
  // caía no fallback (hoje). Vem depois do dd/mm pra "dia 12/08" usar aquele.
  const diaMatch = tl.match(/\bdia\s+(\d{1,2})\b/);
  if (diaMatch) {
    const day = parseInt(diaMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const now   = new Date();
      const d     = new Date(now.getFullYear(), now.getMonth(), day);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (d < today) d.setMonth(d.getMonth() + 1);
      return d;
    }
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
  // Usa a MESMA fonte do Desempenho. A versão antiga chamava getDay() dia a dia,
  // que lê só a tabela `days` e não enxerga tarefas — dias em que o usuário só
  // fez tarefas quebravam a sequência aqui e não lá (27 dias vs 40 na tela).
  const desde = new Date();
  desde.setDate(desde.getDate() - 400);
  const [dias, profile] = await Promise.all([
    fetchDaysRange(desde, new Date()),
    getProfile().catch(() => null),
  ]);
  return calcularConstancia(dias, profile?.streakOrigin || null).current;
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


// Semana do mês (1..5) da data + se é a ÚLTIMA ocorrência desse dia-da-semana.
function _semanaDoMes(date) {
  const dom = date.getDate();
  const nth = Math.ceil(dom / 7);
  const ultimoDia = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return { nth, isLast: dom + 7 > ultimoDia };
}
// Opções de repetição CONTEXTUAIS à data: "toda segunda", "todo dia 12",
// "a cada 3/6 meses", "2ª segunda do mês" (ou "última …" se for a última).
function _repeatOptions(date) {
  const wd = date.getDay(), dom = date.getDate();
  const DOWF = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const art = (wd === 0 || wd === 6) ? 'todo' : 'toda';
  const { nth, isLast } = _semanaDoMes(date);
  const opts = [
    { key: 'week', label: `${art} ${DOWF[wd]}`, rule: { freq: 'weekly', interval: 1, weekday: wd } },
    { key: 'day',  label: `todo dia ${dom}`,    rule: { freq: 'monthly', interval: 1, dayOfMonth: dom } },
    { key: '3m',   label: 'a cada 3 meses',     rule: { freq: 'monthly', interval: 3, dayOfMonth: dom } },
    { key: '6m',   label: 'a cada 6 meses',     rule: { freq: 'monthly', interval: 6, dayOfMonth: dom } },
  ];
  if (isLast) opts.push({ key: 'lastwd', label: `${ordWeekday(wd, 'last')} do mês`, rule: { freq: 'monthly', interval: 1, lastWeekday: wd } });
  else        opts.push({ key: 'nthwd',  label: `${ordWeekday(wd, nth)} do mês`,    rule: { freq: 'monthly', interval: 1, nthWeekday: nth, weekday: wd } });
  return opts;
}
// Qual key a regra atual corresponde (ou 'custom' se digitou algo fora das
// opções, ou null se não há repetição).
function _recToKey(rec) {
  if (!rec) return null;
  if (rec.freq === 'weekly' && (rec.interval || 1) === 1) return 'week';
  if (rec.freq === 'monthly') {
    if (rec.lastWeekday != null) return 'lastwd';
    if (rec.nthWeekday != null) return 'nthwd';
    if (!rec.lastDayOfMonth) {
      if (rec.interval === 1) return 'day';
      if (rec.interval === 3) return '3m';
      if (rec.interval === 6) return '6m';
    }
  }
  return 'custom';
}

async function showRegistroPreview(name, done, date = new Date(), time = '') {
  const box = document.getElementById('pet-messages');
  if (!box) return;
  const cats = await getCategories().catch(() => []);
  const registrada = cats.some(c => _limpoTxt(c.name) === _limpoTxt(name));
  // Duas etapas: se o título ainda NÃO é atividade registrada, primeiro resolve
  // isso (escolher uma ou criar); só depois vem o card de marcação limpo.
  if (registrada) _showMarcacao(name, done, date, time);
  else _showGateAtividade(name, done, date, time, cats);
}

// Etapa 1 — a atividade não existe: avisa e deixa escolher uma das suas ou criar.
function _showGateAtividade(name, done, date, time, cats) {
  const box = document.getElementById('pet-messages');
  if (!box) return;

  // Aviso como mensagem própria (guardo a referência pra fixar ela no TOPO).
  const aviso = document.createElement('div');
  aviso.className = 'pet-msg pet-msg-bot';
  const asp = document.createElement('span');
  asp.innerHTML = `Opa, <b>“${_esc(name)}”</b> ainda não é uma atividade registrada 😅<br>Crie essa ou escolha uma das suas:`;
  aviso.appendChild(asp);
  box.appendChild(aviso);

  // Criar = PRIMEIRA opção (topo); depois a grade das existentes em colunas.
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card pet-preview-tight">
      <button type="button" class="pet-atv-create pet-atv-create-full" data-create>➕ Criar “${_esc(name)}”</button>
      ${cats.length ? '<span class="pet-reco-lbl pet-atv-lbl">ou escolha uma existente:</span><div class="pet-atv-grid" data-atv-grid></div>' : ''}
    </span>`;
  const atvGrid = div.querySelector('[data-atv-grid]');
  if (atvGrid) {
    atvGrid.innerHTML = cats.map(c =>
      `<button type="button" class="pet-reco-chip pet-atv-chip" data-atv="${_esc(c.name)}">${c.icon || '🏷️'} ${_esc(c.name)}</button>`
    ).join('');
    // Colunas conforme a quantidade: 3 só quando há MUITAS (evita lista comprida),
    // 2 pro caso comum, 1 se houver só uma (não fica esparso).
    const nCols = cats.length >= 7 ? 3 : (cats.length >= 2 ? 2 : 1);
    atvGrid.style.gridTemplateColumns = `repeat(${nCols}, minmax(0, 1fr))`;
  }

  const resolver = (nome) => {
    aviso.remove();   // resolvido: o aviso e o card de escolha somem da tela,
    div.remove();     // deixando só o card de marcação que vem a seguir.
    _showMarcacao(nome, done, date, time);
  };
  if (atvGrid) atvGrid.querySelectorAll('[data-atv]').forEach(chip => chip.addEventListener('click', () => resolver(chip.dataset.atv)));
  const cbtn = div.querySelector('[data-create]');
  cbtn.addEventListener('click', async () => {
    cbtn.disabled = true; cbtn.textContent = 'Criando…';
    try {
      const icon  = _emojiAtividade(name);
      const order = cats.length ? Math.max(...cats.map(x => x.order || 0)) + 1 : 1;
      const color = _CATCOLORS[cats.length % _CATCOLORS.length];
      await saveCategory(null, { name, icon, color, order, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
      showCenterToast(`${icon} Atividade criada!`);
      resolver(name);
    } catch (e) { cbtn.disabled = false; cbtn.textContent = `➕ Criar “${_esc(name)}”`; console.error('[pet] criar atividade', e); }
  });

  box.appendChild(div);
  // Rola pra deixar o AVISO no topo da área visível (sem o usuário precisar subir).
  requestAnimationFrame(() => {
    const delta = aviso.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += delta - 8;
  });
}

// Etapa 2 — marcação limpa: título grande, data, repetir (retrátil) e lembrete.
function _showMarcacao(curName, done, date = new Date(), time = '') {
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

  const _typedRec = ditado.recorrencia;                 // regra digitada (pode ser "custom")
  const repOpts = _repeatOptions(date);

  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `
    <span class="pet-preview-card pet-preview-tight">
      <span class="pet-preview-title pet-preview-title-big">${tipoIcon} <strong>${_esc(curName)}</strong></span>
      ${ditado.descricao ? `<span class="pet-preview-desc">(${_esc(ditado.descricao)})</span>` : ''}
      <span class="pet-preview-sub">${quandoLabel}${time ? ` · ${time}` : ''} · ${tipoLabel}</span>
      <div class="pet-rep" data-rep-wrap></div>
      <label class="pet-check-row"><input type="checkbox" data-bell><span>🔔 Lembrete</span></label>
      <button class="pet-reg-btn">${tipoIcon} ${t('pet.preview.register', { type: tipoLabel })}</button>
    </span>`;

  const repWrap  = div.querySelector('[data-rep-wrap]');
  const bellEl   = div.querySelector('[data-bell]');

  // 🔁 Repetir: botão retrátil. Fechado = só o botão; toca e abre as opções
  // empilhadas. Sem "Não" — não escolher = não repete; clicar na escolhida desmarca.
  let repOpen = false;
  function renderRep() {
    const selKey = _recToKey(ditado.recorrencia);
    const curLabel = ditado.recorrencia ? ruleLabel(ditado.recorrencia) : '';
    const customOpt = selKey === 'custom'
      ? `<button type="button" class="pet-rep-opt sel" data-rep="custom">${_esc(curLabel)} ✓</button>` : '';
    repWrap.innerHTML = `
      <button type="button" class="pet-rep-head ${curLabel ? 'has-sel' : ''}" data-rep-head>🔁 ${curLabel ? _esc(curLabel) : 'Repetir?'}</button>
      <div class="pet-rep-list${repOpen ? ' open' : ''}">${customOpt}${repOpts.map(o =>
        `<button type="button" class="pet-rep-opt ${o.key === selKey ? 'sel' : ''}" data-rep="${o.key}">${o.label}${o.key === selKey ? ' ✓' : ''}</button>`
      ).join('')}</div>`;
    repWrap.querySelector('[data-rep-head]').addEventListener('click', () => { repOpen = !repOpen; renderRep(); });
    repWrap.querySelectorAll('[data-rep]').forEach(opt => opt.addEventListener('click', () => {
      const k = opt.dataset.rep, cur = _recToKey(ditado.recorrencia);
      if (k === 'custom') ditado.recorrencia = cur === 'custom' ? null : _typedRec;
      else if (cur === k) ditado.recorrencia = null;                 // desmarca a escolhida
      else ditado.recorrencia = { ...repOpts.find(x => x.key === k).rule, anchor: dayId(date) };
      repOpen = false;                                               // colapsa ao escolher
      renderRep(); syncBell();
    }));
  }

  // 🔔 Lembrete = checkbox. Recorrência mensal+ trava marcado (nasce alfinetado).
  function syncBell() {
    const monthlyPinned = !!(ditado.recorrencia && ditado.recorrencia.freq === 'monthly');
    if (monthlyPinned) { bellEl.checked = true; bellEl.disabled = true; }
    else { bellEl.disabled = false; bellEl.checked = !!ditado.lembrete; }
  }
  bellEl.addEventListener('change', () => { if (!bellEl.disabled) ditado.lembrete = bellEl.checked; });

  renderRep();
  syncBell();

  const btn = div.querySelector('.pet-reg-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = t('pet.preview.registering');
    try {
      // Já existe igual nesse dia? Registrar de novo cria duas linhas na
      // agenda e, pior, conta duas vezes pro objetivo quando o alvo é "x
      // vezes no mesmo dia". Melhor avisar do que deixar a pessoa descobrir
      // depois, olhando um número que não bate.
      const jaTem = (await getDayTasks(dayId(date)))
        .some(tk => _limpoTxt(tk.title) === _limpoTxt(curName)
                 && (!time || (tk.startTime || '') === time));
      if (jaTem) {
        btn.disabled = false;
        btn.textContent = `${tipoIcon} ${t('pet.preview.register', { type: tipoLabel })}`;
        addMessage(t('pet.duplicate', { name: curName }), 'bot');
        return;
      }
      // Captura recorrência ANTES de zerar o ditado.
      const rec = ditado.recorrencia;
      const descAtual = ditado.descricao || '';
      const grpId = rec ? ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)) : null;
      // Recorrência mensal+ (incl. 1×/mês) nasce alfinetada (lembrete) pra fixar
      // no calendário — evento raro que não pode escapar.
      const lembreteFinal = !!(ditado.lembrete || (rec && rec.freq === 'monthly'));
      const cat = await executeRegistro(curName, done, date, time, descAtual, lembreteFinal, grpId);
      if (rec) {
        await salvarRegra({
          groupId: grpId, title: curName, desc: descAtual,
          kind: done ? 'task' : 'commitment', startTime: time || '',
          categoryId: cat?.id || null, icon: cat?.icon || '',
          reminderEnabled: lembreteFinal, ...rec,
        });
      }
      btn.textContent = t('pet.preview.done');
      btn.classList.add('pet-reg-done');
      ditado = { titulo: null, descricao: null, lembrete: false, recorrencia: null };
      if (done) { setPetState('excited'); setTimeout(() => setPetState('idle'), 1800); }
      showCenterToast(t(done ? 'pet.registered.activity' : 'pet.registered.commitment'));
      if (rec) setTimeout(() => addMessage(`🔁 Vou repetir <b>${_esc(curName)}</b> ${ruleLabel(rec)}.`, 'bot'), 300);
      if (time) {
        const [h, mi]  = time.split(':').map(Number);
        const ts       = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi).getTime();
        const tag      = notifTag(dayId(date), curName);
        const result   = await scheduleNotif({ title: curName, body: done ? t('notif.body.activity', { title: curName }) : t('notif.body.commitment', { title: curName }), tag, timestamp: ts });
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

// Salva uma regra de recorrência no profile (o motor do Ritual a lê e gera/fixa).
async function salvarRegra(rule) {
  try {
    const prof = await getProfile().catch(() => null);
    const list = Array.isArray(prof?.recurrenceRules) ? prof.recurrenceRules.slice() : [];
    list.push(rule);
    await setProfile({ recurrenceRules: list });
  } catch (e) { console.error('[pet] salvar regra recorrência:', e); }
}

async function executeRegistro(name, done, date, time = '', descricao = '', lembrete = false, recurrenceGroupId = null) {
  const targetId = dayId(date);
  const [, tasks, shifts, cats] = await Promise.all([
    setDayMeta(targetId, {}),
    getDayTasks(targetId),
    getShifts(),
    getCategories().catch(() => []),
  ]);
  // Sem atividade, a tarefa não conta pros objetivos: eles casam POR
  // ATIVIDADE. "Marquei um lazer pelo pet" virava um título solto que o
  // objetivo de Lazer ignorava — e não havia sinal nenhum disso na tela.
  const cat = _acharCategoria(cats, name);
  await addDayTask(targetId, {
    title: name,
    done,
    kind: done ? 'task' : 'commitment',
    startTime: time,
    order: tasks.length,
    desc: descricao || '',
    icon: cat?.icon || '',
    categoryId: cat?.id || null,
    shiftId: pickShift(shifts, time),
    reminderEnabled: !!lembrete,
    ...(recurrenceGroupId ? { recurrenceGroupId } : {}),
  });
  return cat;
}

// Acha a atividade pelo que a pessoa falou. Compara nos dois sentidos: "lazer"
// acha a atividade "Lazer", e "fui na academia hoje" acha "Academia" porque o
// nome dela está contido na frase.
function _acharCategoria(cats, texto) {
  const limpo = (v) => String(v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const alvo = limpo(texto);
  if (!alvo || !cats?.length) return null;
  // exata primeiro; só depois "contém", pra "Lazer" não perder pra "Lazer em
  // família" quando as duas existirem
  return cats.find(c => limpo(c.name) === alvo)
      || cats.find(c => limpo(c.name) && alvo.includes(limpo(c.name)))
      || null;
}

function _limpoTxt(v) {
  return String(v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Cores pra atividade nova criada pelo pet (mesma vibe da paleta da Home).
const _CATCOLORS = ['#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#818cf8', '#4ade80'];

// Escolhe um emoji COERENTE pelo nome da atividade (a pessoa troca na Home se não
// gostar). Casa por palavra-chave; cai num 🏷️ genérico se não reconhecer.
const _EMOJI_ATIVIDADE = [
  [/academia|muscula|treino|malha|hipertrofia|gym/, '🏋️'],
  [/corr(er|ida)|cardio|cooper/, '🏃'],
  [/caminh|pedestr/, '🚶'],
  [/pilates|yoga|along|mobilidade|medit(a|ar)/, '🧘'],
  [/nata|nadar|piscina|hidro/, '🏊'],
  [/bike|bicicl|ciclis|pedal|spinning/, '🚴'],
  [/futebol|fute|society/, '⚽'],
  [/basquete|basket/, '🏀'],
  [/v[ôo]lei/, '🏐'],
  [/t[êe]nis/, '🎾'],
  [/luta|boxe|muay|jiu|jitsu|karat|jud[ôo]|taekwon|mma|krav|capoeira/, '🥋'],
  [/dan[çc]a|dan[çc]ar|ballet|zumba/, '💃'],
  [/skate/, '🛹'],
  [/patins|roller|rolimã/, '🛼'],
  [/escalada|escalar|boulder/, '🧗'],
  [/l(er|eitura)|livro|estud(ar|o)|curso|aula|faculdade|prova/, '📚'],
  [/trabalh|escrit[óo]rio|expediente|servi[çc]o/, '💼'],
  [/reuni[ãa]o|meeting|call|c[óo]digo|programa|dev/, '💻'],
  [/dentist/, '🦷'],
  [/m[ée]dic|consult|sa[úu]de|exame|terapia|psic[óo]log|fisio/, '🩺'],
  [/rem[ée]dio|medica|comprimido|farm[áa]cia/, '💊'],
  [/[áa]gua|hidrata|beber/, '💧'],
  [/sono|dormir|soneca|descan/, '😴'],
  [/comida|comer|almo[çc]|jant|caf[ée]|refei|dieta|cozinh/, '🍽️'],
  [/mercado|compras|feira|super/, '🛒'],
  [/limpeza|faxina|arruma|casa|louça|lavar/, '🧹'],
  [/viag|viaj|trip|f[ée]rias/, '✈️'],
  [/trilha|acamp|camping|montanha/, '⛺'],
  [/praia|mar|sol/, '🏖️'],
  [/fam[íi]lia|filho|filha|beb[êe]|esposa|marido|namora/, '👨‍👩‍👧'],
  [/amig|visit|encontr|social/, '🧑‍🤝‍🧑'],
  [/igreja|missa|culto|ora[çc]|f[ée]|deus|b[íi]blia|deus/, '🙏'],
  [/m[úu]sica|violã|guitarr|tocar|banda|cantar/, '🎸'],
  [/jogo|game|videogame|joga/, '🎮'],
  [/foto|fotografia|c[âa]mera/, '📷'],
  [/pintar|desenh|arte|pintura/, '🎨'],
  [/pet|cachorr|c[ãa]o|gato|dog/, '🐕'],
  [/dinheiro|finan[çc]|conta|pagar|banco|boleto/, '💰'],
  [/festa|anivers|comemora/, '🎉'],
  [/beleza|cabelo|sal[ãa]o|unha|maquia/, '💇🏻‍♀️'],
];
function _emojiAtividade(name) {
  const s = _limpoTxt(name);
  for (const [re, emoji] of _EMOJI_ATIVIDADE) if (re.test(s)) return emoji;
  return '🏷️';
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
  const podeAgora = canInstallApp();

  // Se dá pra instalar com um toque, o BOTÃO vem primeiro. Antes eu despejava
  // o passo a passo do menu do Chrome mesmo tendo o botão logo abaixo — pedir
  // pra pessoa caçar opção em menu quando o app pode se instalar sozinho é
  // trabalho inventado.
  addMessage(podeAgora
    ? '🤖 <strong>Posso instalar agora mesmo</strong><br><br>É só tocar no botão aqui embaixo. 👇'
    : '🤖 <strong>Passo 1 · instalar o app</strong><br><br>' +
      'Por enquanto o Falcon é um web app (logo vira aplicativo). Pra instalar:<br>' +
      '• Menu do Chrome (<strong>⋮</strong> em cima) → <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong><br>' +
      '• Às vezes tem um ícone de <strong>instalar (⊕ / ↓)</strong> na barra de endereço<br>' +
      '• Ou o menu mostra <strong>“Adicionar ao Início”</strong>', 'bot');

  if (podeAgora && box) {
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
    // (?:^|\s) e não \b, pelo mesmo motivo do extractTime: À não é "letra"
    // para \b, então "às 8" nunca era limpo daqui e sujava a busca por nome.
    .replace(/(?:^|\s)às?\s+\d{1,2}[h:]?\d*/gi, ' ')
    .replace(/(?:^|\s)as\s+\d{1,2}[h:]?\d*/gi, ' ')
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
      // Acha por título OU descrição: a pessoa lembra da atividade tanto pelo
      // nome quanto pelo detalhe ("o compromisso Startup" = o de descrição
      // Startup). O card de confirmação evita edição errada em falso positivo.
      const alvo = `${task.title || ''} ${task.desc || ''}`.toLowerCase();
      if (alvo.includes(q)) {
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

async function cmdEditarDescricao(nameHint, newDesc, tipo) {
  const matches = await searchTasksByName(nameHint, tipo);
  if (!matches.length) { addMessage(t('pet.edit.notfound', { name: nameHint }), 'bot'); return; }
  showEditCard(matches, 'desc', { newDesc });
}

async function cmdEditarLembrete(nameHint, tipo, enabled) {
  const matches = await searchTasksByName(nameHint, tipo);
  if (!matches.length) { addMessage(t('pet.edit.notfound', { name: nameHint }), 'bot'); return; }
  showEditCard(matches, 'reminder', { reminderEnabled: enabled });
}

async function cmdEditarRepeticao(nameHint, tipo, recFrag) {
  const matches = await searchTasksByName(nameHint, tipo);
  if (!matches.length) { addMessage(t('pet.edit.notfound', { name: nameHint }), 'bot'); return; }
  showEditCard(matches, 'recur', { recFrag });
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
    const { task, dayDocId, date } = match;
    const reschedCount = (task.rescheduleCount || 0) + 1;

    let p;
    if (action === 'rename') {
      p = updateDayTask(dayDocId, task.id, { title: payload.newName });
    } else if (action === 'desc') {
      p = updateDayTask(dayDocId, task.id, { desc: payload.newDesc });
    } else if (action === 'reminder') {
      p = updateDayTask(dayDocId, task.id, { reminderEnabled: payload.reminderEnabled });
    } else if (action === 'recur') {
      // Liga/troca a repetição da atividade: ancora na data dela, tagueia com um
      // groupId e salva a regra. Mensal+ nasce alfinetada (lembrete).
      const grpId = task.recurrenceGroupId || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      const rec = { ...payload.recFrag, anchor: dayId(date) };
      if (rec.freq === 'weekly') rec.weekday = date.getDay();
      if (rec.freq === 'monthly' && !rec.lastDayOfMonth && rec.lastWeekday == null) rec.dayOfMonth = date.getDate();
      const pin = rec.freq === 'monthly';
      p = updateDayTask(dayDocId, task.id, { recurrenceGroupId: grpId, ...(pin ? { reminderEnabled: true } : {}) })
        .then(() => salvarRegra({
          groupId: grpId, title: task.title, desc: task.desc || '', kind: task.kind || 'task',
          startTime: task.startTime || '', categoryId: task.categoryId || null, icon: task.icon || '',
          reminderEnabled: pin || !!task.reminderEnabled, ...rec,
        }));
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
    } else if (action === 'desc') {
      title.textContent = `📝 ${task.title}`;
      sub.textContent   = `descrição → "${payload.newDesc}" · ${fmtDate(date)}`;
    } else if (action === 'reminder') {
      title.textContent = `🔔 ${task.title}`;
      sub.textContent   = `lembrete ${payload.reminderEnabled ? 'ligado' : 'desligado'} · ${fmtDate(date)}`;
    } else if (action === 'recur') {
      title.textContent = `🔁 ${task.title}`;
      const rl = ruleLabel({ ...payload.recFrag, weekday: date.getDay(), dayOfMonth: date.getDate() });
      sub.textContent   = `repetir → ${rl}`;
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
let accumulated  = '';   // trechos já fechados por instâncias anteriores
let trechoAtual  = '';   // o que a instância atual reconheceu até agora
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

  accumulated = '';   // fechado por instâncias ANTERIORES do reconhecedor
  trechoAtual = '';   // o que a instância atual reconheceu até agora
  recording   = true;
  confirming  = false;
  let abortCount = 0;

  function buildRecognition() {
    const r = new SR();
    r.lang           = getLang();
    // continuous=true: sem isto o reconhecedor PARA a cada pausa da fala e o
    // onend abaixo o reinicia — e cada reinício toca o bipe do sistema no meio
    // da frase, além de arriscar perder o trecho seguinte na troca. O laço de
    // reinício continua existindo como rede, mas agora é exceção e não regra.
    r.continuous     = true;
    r.interimResults = true;

    r.onresult = (e) => {
      // RECONSTRÓI a partir de e.results inteiro, em vez de ACRESCENTAR o
      // trecho novo. Com continuous=true a lista é reentregue a cada evento e
      // o mesmo pedaço voltava várias vezes — "domingo lazer descrição
      // aniversário" empilhado quatro vezes no campo. Reconstruir é
      // idempotente: chamar duas vezes com os mesmos dados dá o mesmo texto.
      // A junção vale DENTRO da lista também. A própria e.results chega com o
      // mesmo enunciado repetido em posições diferentes — concatenar tudo era
      // o que sobrava de duplicata depois de eu ter tratado só os reinícios.
      let final = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final = juntarFala(final, e.results[i][0].transcript);
      }
      trechoAtual = final;
      voiceActive = true;
      clearTimeout(voiceTimer);
      voiceTimer = setTimeout(() => { voiceActive = false; }, 250);
    };

    r.onend = () => {
      if (confirming) {
        confirming  = false;
        recording   = false;
        recognition = null;
        const clean = formatTranscript(juntarFala(accumulated, trechoAtual).trim());
        accumulated = '';
        trechoAtual = '';
        const inp   = document.getElementById('pet-input');
        if (inp && clean) { inp.value = clean; requestAnimationFrame(() => { resizePetInput(inp); inp.focus(); }); }
        teardownMic();
        hideRecordingUI();
        setPetState('idle');
      } else if (recording) {
        // A instância morreu: o que ela reconheceu vira definitivo. A junção
        // olha a sobreposição em vez de emendar cego — o reconhecedor do
        // Android reentrega o enunciado INTEIRO a cada reinício, cada vez um
        // pouco mais completo, e emendar produzia a frase triplicada.
        accumulated = juntarFala(accumulated, trechoAtual);
        trechoAtual = '';
        try {
          // REAPROVEITA o mesmo reconhecedor em vez de criar outro. Entre o
          // fim de uma instância e o início da próxima existe um vão sem
          // captação, e as palavras ditas nele se perdem — é o que "come" o
          // que a pessoa fala logo depois de uma pausa. Criar objeto novo
          // reinicializa o áudio inteiro e alarga esse vão; reusar corta boa
          // parte dele.
          //
          // O vão não some de todo: é limite da plataforma, não do código.
          if (r === recognition) recognition.start();
          else { recognition = buildRecognition(); recognition.start(); }
        } catch (_) {
          // start() em objeto já iniciado lança — cai pro caminho antigo
          try { recognition = buildRecognition(); recognition.start(); return; } catch (_2) {}
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
      trechoAtual = '';
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
