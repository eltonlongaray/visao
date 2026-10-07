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
// BLOCO 8.6 — CAIXA DE FERRAMENTAS (LISTAS) VIA PET
// BLOCO 8.7 — PREPARO FÍSICO VIA PET
// BLOCO 8.8 — CHECK-IN (o Pet puxa conversa + bolinha vermelha)
// BLOCO 8.9 — CONVERSA GUIADA (entende a resposta no contexto e pergunta o porquê)
// BLOCO 8.10 — NOTA DE ONTEM PELO PET (orgulho/falha, melhorar, sono, cochilo, madrugada)
// BLOCO 8.11 — RITUAL PELO PET (água, sono, nota de qualquer dia, excluir, feito em outro dia, ver agenda)
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
import { parseRecorrencia, ruleLabel, ordWeekday, RECUR_STRIP, nextOccurrence } from './recorrencia.js';
import { juntarFala } from './ditado-merge.js';
import {
  carregarFerramentas, adicionarItem, marcarItem, editarItem, apagarItem, adicionarSecao,
} from './ferramentas.js';
import * as PL from './pet-listas.js?v=20261007b';
import * as PP from './pet-preparo.js?v=20261005c';
import * as PC from './pet-conversa.js?v=20261006a';
import * as PN from './pet-nuvem.js?v=20261007c';
import * as PNT from './pet-nota.js?v=20261006a';
import * as PR from './pet-ritual.js?v=20261007a';
import * as PCT from './pet-contas.js?v=20261007b';
import { anotarNoDiario } from './pet-diario.js?v=20261007a';

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: INIT — injeta o pet no DOM (uma vez por sessão)
// ═══════════════════════════════════════════════════════════════
export function initPet() {
  if (document.getElementById('visao-pet')) return;
  document.body.insertAdjacentHTML('beforeend', buildPetHTML());
  attachHandlers();
  scheduleBlink();
  // Check-in só com a pessoa logada (precisa dos dados dela)
  import('./autenticacao.js').then(({ auth, onAuthStateChanged }) =>
    onAuthStateChanged(auth, (u) => { if (u) setTimeout(prepararCheckin, 4000); })).catch(() => {});
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
    <div id="pet-rec-live" class="pet-rec-live" style="display:none" aria-live="polite"></div>
    <div id="pet-recording-bar" class="pet-recording-bar" style="display:none">
      <canvas id="pet-waveform" class="pet-waveform"></canvas>
      <button id="pet-rec-cancel" class="pet-rec-cancel" aria-label="${t('pet.cancel')}">×</button>
      <button id="pet-rec-confirm" class="pet-rec-confirm" aria-label="${t('pet.confirm')}">✓</button>
    </div>
  </div>

  <!-- Corpo do pet — O OLHO INTEIRO -->
  <!-- Embrulho só pra bolinha: o corpo tem overflow:hidden e cortava ela -->
  <div class="pet-body-wrap">
  <div class="pet-body" id="pet-body" role="button" aria-label="${t('pet.open')}" tabindex="0">
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
  <div id="pet-badge" class="pet-badge" style="display:none">1</div>
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
    '• <strong>a repetição e o lembrete</strong> — você escolhe no card, com um toque (🔁 Repetir / 🔔 Lembrete)<br><br>' +
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
  mostrarCheckin();
  if (!petNoHistorico) {
    history.pushState({ falconPet: 1 }, '');
    petNoHistorico = true;
  }
  // Sem focus() automático: abrir o chat não deve abrir o teclado junto.
  // O usuário toca no campo quando quiser escrever.
}

function fecharPainelDireto() {
  if (recording) stopMicCancel();
  setBadge(_fila.length);   // assunto que ficou pra trás volta pra bolinha
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

// Aceita texto (passa pelo roteador) ou função (botão do "você quis dizer?",
// que já sabe a intenção e não deve ser classificado de novo).
async function dispatchCommand(text) {
  setPetState('thinking');
  // "Digitando…" antes de responder: a resposta local é instantânea e ficava
  // seca. Os pontinhos somem quando a primeira resposta (texto ou card) entra.
  const parar = mostrarDigitando();
  await new Promise(r => setTimeout(r, 650 + Math.random() * 450));
  try {
    // Conversa guiada em andamento (o Pet perguntou algo): a frase é RESPOSTA,
    // não comando novo. Se não for resposta e parecer comando, segue o roteador.
    let reply;
    if (typeof text !== 'function' && conversaAtiva()) reply = await continuarConversa(semChamado(text));
    // Frase longa e "falada" (não começa com comando): a IA na nuvem entende
    // primeiro, porque os regex costumam pegar só um pedaço e entender errado.
    // O Pet fez uma pergunta pra esclarecer o pedido: a resposta vai pra IA
    // junto com a conversa ("dia 10" sozinho completa "cadastra a conta de luz")
    if (reply === undefined && typeof text !== 'function' && esclarecendo()) {
      const n = await entenderNaNuvem(semChamado(text));
      if (n !== undefined && n !== 'fora') reply = n;
    }
    if (reply === undefined && typeof text !== 'function' && pareceFalaLivre(semChamado(text))) {
      const n = await entenderNaNuvem(semChamado(text));
      if (n !== undefined && n !== 'fora') reply = n;
    }
    if (reply === undefined) reply = typeof text === 'function' ? await text() : await routeCommand(await corrigirSeguras(semChamado(text)));
    if (reply) addMessage(reply, 'bot');
  } catch (err) {
    addMessage(t('pet.error.general'), 'bot');
    console.error('[pet]', err);
  } finally {
    parar();
    setPetState('idle');
  }
}

// Bolha com 3 pontinhos no fim da conversa; sai sozinha quando outra mensagem
// é adicionada. Devolve a função que tira (pra garantir no fim).
function mostrarDigitando() {
  const box = document.getElementById('pet-messages');
  if (!box) return () => {};
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot pet-digitando';
  div.setAttribute('aria-label', 'Falcon está digitando');
  div.innerHTML = '<span><i></i><i></i><i></i></span>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  const obs = new MutationObserver(ms => {
    if (ms.some(m => [...m.addedNodes].some(n => n !== div))) parar();
  });
  const parar = () => { obs.disconnect(); div.remove(); };
  obs.observe(box, { childList: true });
  return parar;
}

// Por voz a pessoa chama o pet pelo nome ("Falcon, qual meu próximo
// compromisso"), e o ditado nem sempre põe a vírgula. O nome na frente
// quebrava os regex ancorados no início (^marcar, ^editar...) e virava parte
// do título da tarefa. Sai daqui antes de rotear; sozinho ("oi Falcon") fica.
function semChamado(text) {
  const t = String(text || '').trim();
  const resto = t.replace(/^(?:(?:ei|oi|ok|ô|olá|e aí|fala)[\s,]+)?(?:falcon|pet)\b[\s,.:;!?-]*/i, '').trim();
  return resto || t;
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

  // ── Caixa de Ferramentas (listas): check, adicionar, editar, apagar, criar.
  // Antes das consultas e do registro: "marca arroz como feito" bateria no
  // ^marca do registro e viraria um agendamento. ──
  // ── Cartão do dia: abre o cartão (o botão Compartilhar fica nele) ──
  // ── Contas a pagar em lote ("…: Internet - dia 02, Seguro - dia 05") ──
  const rContas = await tentarContasLote(text);
  if (rContas !== undefined) return rContas;

  // "cartão do dia" junto: "Cartão Nubank - dia 12" é conta, não o cartão
  if (/\bcart(?:ao|ão|oes|ões)\s+(?:do|de)\s+(?:dia|hoje)\b|princ[ií]pio (?:do dia|de hoje)/i.test(text)) {
    import('./cartoes-dia.js?v=20261007c').then(m => m.abrirCartaoDoDia()).catch(() => {});
    return /compartilh|manda|envia|posta|status|insta/i.test(text)
      ? 'Abri teu cartão do dia 🃏 Toca em <strong>📤 Compartilhar</strong> pra mandar no WhatsApp, Instagram ou onde quiser.'
      : 'Aqui teu cartão do dia 🃏';
  }

  // ── Ritual: água, acordei/dormi, nota de qualquer dia, excluir tarefa,
  // feito em outro dia, "o que tenho sexta?" (BLOCO 8.11) ──
  const rRitual = await tentarRitual(text);
  if (rRitual !== undefined) return rRitual;

  const rLista = await tentarLista(text);
  if (rLista !== undefined) return rLista;

  // ── Preparo Físico: perfil de treino + peso/altura/sexo (com card) ──
  const rPreparo = await tentarPreparo(text);
  if (rPreparo !== undefined) return rPreparo;

  // ── Consultas (PT + EN) ──
  // "Próximo compromisso" vem antes da lista: ali a pessoa quer UM item (o
  // próximo com horário), não as tarefas do dia inteiro.
  if (/pr[oó]xim[oa]s?\s+(compromisso|tarefa|atividade|evento|coisa)|o que (vem|tenho|tem) (agora|depois(?! de amanh)|a seguir)|next (task|commitment|appointment)/i.test(tl)) return cmdProximo(tl);
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
    // Recorrência NÃO é interpretada por voz/texto na CRIAÇÃO — a pessoa escolhe
    // nos chips do card (🔁 Repetir). Voz/texto de repetição só vale na EDIÇÃO
    // ("repetir tarefa X toda semana"), tratada lá em cima.
    ditado.recorrencia = null;
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

  // Nenhum regex entendeu: tenta de novo com a digitação corrigida ("perfip"
  // → "perfil"). Só aqui no fim, pra nunca mexer numa frase que já funcionava
  // ("adiciona sabão" não vira "sábado").
  const rCorrigido = await tentarCorrigido(text);
  if (rCorrigido !== undefined) return rCorrigido;

  // Pergunta pro classificador de intenção (BLOCO 7.5)
  return entenderComIA(text);
}

let _corrigindo = false, _conhecidas = null;
async function corretor(text, soSeguras) {
  if (!String(getLang()).startsWith('pt')) return null;
  try {
    const [{ corrigirTexto }, { default: modelo }] = await Promise.all([
      import('./pet-corretor.js?v=20261007a'),
      import('./pet-ia/pet-intencoes-modelo.js?v=20261003a'),
    ]);
    _conhecidas ||= new Set(modelo.vocab.filter(v => v.startsWith('w:')).map(v => v.slice(2)));
    const r = corrigirTexto(text, _conhecidas, soSeguras);
    return r.trocas.length ? r : null;
  } catch { return null; }
}

// Antes de rotear: só as palavras "seguras" (lista, compromisso, apaga…)
async function corrigirSeguras(text) {
  if (typeof text !== 'string') return text;
  const r = await corretor(text, true);
  if (!r) return text;
  return r.texto;
}

async function tentarCorrigido(text) {
  if (_corrigindo) return undefined;
  const r = await corretor(text, false);
  if (!r) return undefined;
  _corrigindo = true;
  try { return await routeCommand(r.texto); } finally { _corrigindo = false; }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7.5: CLASSIFICADOR DE INTENÇÃO — IA própria, roda no navegador
// Modelo treinado em ia/pet-intencoes/ (TF-IDF + regressão logística).
// Só entra quando o regex acima não entendeu, então não muda nada do que já
// funcionava. Confiança alta executa; baixa pergunta "você quis dizer?".
// ═══════════════════════════════════════════════════════════════

let _classificar = null;
async function classificador() {
  if (!_classificar) {
    const [{ carregarModelo }, { default: modelo }] = await Promise.all([
      import('./pet-ia/pet-intencao.js?v=20261003a'),
      import('./pet-ia/pet-intencoes-modelo.js?v=20261003a'),
    ]);
    _classificar = carregarModelo(modelo);
  }
  return _classificar;
}

const INTENCAO_ROTULO = {
  agendar: '📅 Agendar ou registrar', editar_nome: '✏️ Mudar o nome',
  editar_horario: '🕐 Mudar o horário', editar_descricao: '📝 Mudar a descrição',
  reagendar: '📆 Mudar o dia', lembrete_ligar: '🔔 Ligar lembrete',
  lembrete_desligar: '🔕 Tirar lembrete', repetir: '🔁 Repetir',
  consultar_sono: '😴 Ver meu sono', consultar_sequencia: '🔥 Ver minha constância',
  consultar_agua: '💧 Ver minha água', consultar_tarefas: '📋 Ver minhas tarefas',
  ajuda_notificacoes: '📱 Notificações e instalar', ajuda: '❓ O que você faz',
  saudacao: '👋 Só dizendo oi',
};

// Edições precisam do nome exato da atividade; o classificador sabe O QUE a
// pessoa quer, mas ainda não separa o nome com segurança. Então ensina a frase.
const INTENCAO_EXEMPLO = {
  editar_nome: 'editar nome da tarefa Academia para Musculação',
  editar_horario: 'editar horário do compromisso Dentista para 15h',
  editar_descricao: 'editar descrição do compromisso Dentista para levar exames',
  reagendar: 'reagendar compromisso Dentista para sexta',
  repetir: 'repetir tarefa Academia toda semana',
  lembrete_ligar: 'adicionar lembrete na tarefa Academia',
  lembrete_desligar: 'tirar lembrete da tarefa Academia',
};

async function entenderComIA(text) {
  // Modelo treinado em português; nos outros idiomas segue a resposta padrão
  if (!String(getLang()).startsWith('pt')) return t('pet.unknown');
  // Com a nuvem ligada, ela vem ANTES do classificador: entende frase falada
  // bem melhor ("tô sem carro, não vou fazer Uber…"). O classificador fica pra
  // quando a nuvem não responde (offline, cota do dia) e pro papo curto ("oi").
  const n = await entenderNaNuvem(text);
  if (n !== undefined && n !== 'fora') return n;
  const nuvemDisseFora = n === 'fora';
  let r;
  try {
    r = (await classificador())(text);
  } catch (err) {
    console.warn('[pet-ia] classificador indisponível', err);
    return nuvemDisseFora ? FORA_DO_APP : t('pet.unknown');
  }
  if (r.entendeu && (!nuvemDisseFora || ['saudacao', 'ajuda', 'ajuda_notificacoes'].includes(r.intencao))) {
    return executarIntencao(r.intencao, text);
  }
  if (nuvemDisseFora) return FORA_DO_APP;
  if (!r.palavrasConhecidas) { anotarNoDiario(text, 'nao_entendi'); return t('pet.unknown'); }
  if (r.intencao === 'fora') return FORA_DO_APP;

  const opcoes = [r, ...r.alternativas].filter(o => o.intencao !== 'fora' && o.confianca >= 0.1).slice(0, 3);
  if (!opcoes.length) { anotarNoDiario(text, 'nao_entendi'); return t('pet.unknown'); }
  addChoices('🤔 Não tenho certeza. Você quis dizer...', [
    ...opcoes.map(o => ({ label: INTENCAO_ROTULO[o.intencao], action: () => executarIntencao(o.intencao, text) })),
    { label: '❌ Nenhuma', action: () => { anotarNoDiario(text, 'nenhuma'); return t('pet.unknown'); } },
  ]);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7.6: IA DE LINGUAGEM NA NUVEM (Cloudflare) — só quando nada entendeu
// A IA devolve a ação em JSON; o pet-nuvem.js transforma numa frase que o
// roteador já conhece, então a execução continua com os mesmos cards.
// Sem nuvem (offline, cota do dia acabou), devolve undefined e segue o normal.
// ═══════════════════════════════════════════════════════════════
// O Pet só fala do app: assunto de fora sempre recebe esta resposta fixa
// (o texto livre da IA nunca aparece nesse caso, nem se a pessoa insistir).
const FORA_DO_APP = 'Desculpe, não posso ajudar com assuntos não relacionados ao app. Digite <strong>ajuda</strong> pra ver o que eu faço.';
let _naNuvem = false, _ultimaNuvem = null;
const pareceFalaLivre = (text) => PN.nuvemLigada() && String(text).trim().split(/\s+/).length >= 7 &&
  !CMD_RE.test(String(text).trim()) && !REGISTER_TRIGGERS.test(String(text).trim()) &&
  !PCT.lerLoteDeContas(text);   // lista de contas: o roteador já entende inteira
// Esclarecer: a IA pode responder com uma PERGUNTA ("em que dia vence a conta
// de luz?"). As falas ficam guardadas por uns minutos e vão junto na próxima
// mensagem, pra IA juntar tudo num pedido só. No máximo 3 perguntas seguidas.
const ESCLARECER_MS = 5 * 60 * 1000;
let _esclarecer = null;   // { turnos: [{quem, texto}], em, rodadas }
const esclarecendo = () => !!_esclarecer && Date.now() - _esclarecer.em < ESCLARECER_MS;
const NAO_SEI_FAZER = 'Isso eu ainda não sei fazer 😕 Mas anotei teu pedido pra aprender e, quando estiver pronto, tu vai poder pedir pra mim.';

async function entenderNaNuvem(text) {
  if (_naNuvem || !PN.nuvemLigada()) return undefined;
  const historico = esclarecendo() ? _esclarecer.turnos : [];
  if (!historico.length) _esclarecer = null;
  // Mesma frase de novo em seguida (ex.: tentou antes do roteador): reaproveita
  let j = !historico.length && _ultimaNuvem && _ultimaNuvem.texto === text && Date.now() - _ultimaNuvem.em < 30000 ? _ultimaNuvem.j : null;
  if (!j) {
    j = await PN.perguntarNuvem({ texto: text, historico });
    _ultimaNuvem = j && !historico.length ? { texto: text, j, em: Date.now() } : null;
  }
  if (!j) return undefined;
  if (j.acao === 'perguntar') {
    const pergunta = String(j.resposta || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    const rodadas = (historico.length ? _esclarecer.rodadas : 0) + 1;
    if (!pergunta || rodadas > 3) {
      _esclarecer = null;
      anotarNoDiario([...historico.filter(h => h.quem === 'pessoa').map(h => h.texto), text].join(' / '), 'nao_entendi');
      return t('pet.unknown');
    }
    _esclarecer = { turnos: [...historico, { quem: 'pessoa', texto: text }, { quem: 'pet', texto: pergunta }].slice(-6), em: Date.now(), rodadas };
    return _esc(pergunta);
  }
  // Qualquer outra resposta encerra o esclarecimento. O pedido completo é a
  // soma das falas da pessoa (vai pro diário se o app não souber fazer)
  const pedido = [...historico.filter(h => h.quem === 'pessoa').map(h => h.texto), text].join(' / ');
  _esclarecer = null;
  if (j.acao === 'nao_sei_fazer') { anotarNoDiario(pedido, 'nao_sei_fazer'); return NAO_SEI_FAZER; }
  if (j.acao === 'cancelar') return cmdCancelarNuvem(j, false, text);
  if (j.acao === 'reativar') return cmdCancelarNuvem(j, true, text);
  if (j.acao === 'remarcar') return cmdCancelarNuvem(j, false, text, true);
  const frase = PN.fraseDoApp(j);
  if (!frase) return 'fora';   // "conversa": quem chamou decide (oi/ajuda passam; o resto é fora do app)
  _naNuvem = true;
  try { return await routeCommand(frase); } finally { _naNuvem = false; }
}

// "Essa semana tô sem carro, não vou fazer Uber a partir das 16h": cancela as
// ocorrências (não apaga; fica riscado como na tela do Ritual), com card.
// "de terça a quinta", "até quinta", "sexta e sábado" também valem.
// reativar=true faz o contrário: "o carro ficou pronto, volta o Uber de sábado".
const PALAVRAS_GENERICAS = new Set('fazer trabalhar treinar atividade tarefa compromisso essa esta semana hoje amanha dia dias aplicativo app'.split(' '));
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIA_RE = /\b(hoje|depois de amanha|amanha|dom(?:ingo)?|seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?)(?:-feira)?\b/g;
const DIA_IDX = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

// Datas citadas em "quando" (dias da semana = próxima ocorrência, hoje incluído)
function datasDoQuando(quando, hoje) {
  const out = [];
  for (const m of quando.matchAll(DIA_RE)) {
    const d = new Date(hoje);
    if (m[1] === 'amanha') d.setDate(d.getDate() + 1);
    else if (m[1] === 'depois de amanha') d.setDate(d.getDate() + 2);
    else if (m[1] !== 'hoje') d.setDate(d.getDate() + (DIA_IDX[m[1].slice(0, 3)] - hoje.getDay() + 7) % 7);
    out.push(d);
  }
  return out;
}
const rotData = (d) => `${DIAS_CURTOS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

// { ini, fim, dias: Set de 'AAAA-MM-DD' ou null, periodo }
function periodoDoQuando(quandoBruto) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const quando = semAcento(quandoBruto || '');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (/semana que vem|proxima semana/.test(quando)) {
    const ini = new Date(hoje); ini.setDate(hoje.getDate() + ((8 - hoje.getDay()) % 7 || 7));
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    return { ini, fim, dias: null, periodo: 'na semana que vem' };
  }
  const datas = datasDoQuando(quando, hoje);
  if (/\bate\b/.test(quando) && datas.length) {
    const fim = datas[datas.length - 1];
    const ini = datas.length > 1 ? datas[0] : hoje;
    if (fim >= ini) return { ini, fim, dias: null, periodo: `de ${rotData(ini)} até ${rotData(fim)}` };
  }
  if (datas.length === 2 && /\b(de|da|do)\b.*\b(a|ao)\b/.test(quando) && datas[1] >= datas[0]) {
    return { ini: datas[0], fim: datas[1], dias: null, periodo: `de ${rotData(datas[0])} a ${rotData(datas[1])}` };
  }
  if (datas.length) {
    const ord = [...datas].sort((x, y) => x - y);
    return { ini: ord[0], fim: ord[ord.length - 1], dias: new Set(ord.map(iso)),
      periodo: ord.length === 1 && ord[0].getTime() === hoje.getTime() ? 'hoje' : `em ${ord.map(rotData).join(', ')}` };
  }
  if (/semana/.test(quando)) {
    const fim = new Date(hoje); fim.setDate(hoje.getDate() + (7 - hoje.getDay()) % 7);
    return { ini: hoje, fim, dias: null, periodo: 'nesta semana' };
  }
  if (quando) {
    const d = extractDate(quando);
    if (d) { d.setHours(0, 0, 0, 0); return { ini: d, fim: d, dias: null, periodo: `em ${rotData(d)}` }; }
  }
  const fim = new Date(hoje); fim.setDate(hoje.getDate() + 6);
  return { ini: hoje, fim, dias: null, periodo: 'nos próximos 7 dias' };
}

// Palavras da frase que não são nome de atividade (quando a IA não manda o título)
const NAO_E_NOME = new Set(('nao vou mais das dos ate partir depois antes por causa carro pra para com sem ' +
  'que ele ela meu minha essa esse esta este volta voltar cancela cancelar remove remover tira tirar ' +
  'domingo segunda terca quarta quinta sexta sabado feira amanha hoje semana proxima ' +
  'acabei sem querer excluindo excluir apaguei quero preciso crie criar recria recriar novamente de novo ' +
  'marque marca marcar como transferida transferido transfere transferir passa passar troca trocar muda mudar').split(' '));
// remarcar=true: "hoje não vou na academia, vou na sexta" → move do dia "quando" (hoje) pro dia "para"
async function cmdCancelarNuvem(j, reativar = false, texto = '', remarcar = false) {
  let novoDia = null, novaHora = '';
  if (remarcar) {
    novoDia = j.para && !/^\s*hoje\s*$/i.test(j.para) ? extractDate(semAcento(j.para)) : null;
    // A IA não mandou o dia novo ("troca a academia de hoje para sexta-feira"):
    // pega o último dia que vem depois de "pra/para/pro/na/no" na própria frase
    if (!novoDia && texto) {
      const achados = [...semAcento(texto).matchAll(/\b(?:pra|para|pro|na|no)\s+(?:a\s+|o\s+)?(depois de amanha|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|dia \d{1,2}|\d{1,2}\/\d{1,2})/g)];
      if (achados.length) novoDia = extractDate(achados[achados.length - 1][1]);
    }
    if (!novoDia) return 'Pra que dia tu quer passar? Ex.: <em>"hoje não vou na academia, vou na sexta"</em>.';
    novoDia.setHours(0, 0, 0, 0);
    novaHora = /^\d{1,2}:\d{2}$/.test(j.hora || '') ? j.hora.padStart(5, '0') : '';
    j = { ...j, quando: j.quando || 'hoje', hora: '' };
  }
  // A IA às vezes entende a ação mas esquece campos: completa pela frase
  if (!j.quando && texto) j = { ...j, quando: texto };
  if (!j.hora && texto && !remarcar) {
    const mh = semAcento(texto).match(/\b(?:a partir d[ae]s?|depois d[ae]s?|apos as|das)\s*(\d{1,2})(?:[:h](\d{2}))?\s*h?/);
    if (mh) j = { ...j, hora: `${mh[1].padStart(2, '0')}:${mh[2] || '00'}` };
  }
  let nome = String(j.titulo || '').trim();
  if (!nome && texto) nome = semAcento(texto).split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !/^\d/.test(w) && !NAO_E_NOME.has(w) && !['fazer', 'atividade', 'tarefa', 'dia', 'dias', 'app'].includes(w)).join(' ');
  if (!nome) return remarcar ? 'Qual atividade tu quer passar pra outro dia?' : reativar ? 'Qual atividade volta pra agenda? Ex.: <em>"volta o Uber de sábado"</em>.'
    : 'Qual atividade tu não vai fazer? Ex.: <em>"não vou na academia amanhã"</em>.';
  const { ini, fim, dias: soDias, periodo } = periodoDoQuando(j.quando);
  const mHora = String(j.hora || '').match(/^(\d{1,2}):(\d{2})/);
  const aPartir = mHora ? +mHora[1] * 60 + +mHora[2] : null;
  // Compara pelo começo da palavra: "trabalhar" acha "Trabalho"
  const radical = (w) => w.length >= 5 ? w.slice(0, 5) : w;
  const palavrasDe = (t, comGenericas) => semAcento(t).split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !/^\d/.test(w) && !NAO_E_NOME.has(w) && (comGenericas || !PALAVRAS_GENERICAS.has(w))).map(radical);
  const dias = await fetchDaysRange(ini, fim);
  const procurar = (palavras) => {
    let melhor = 0, achados = [];
    for (const dia of dias) {
      if (soDias && !soDias.has(dia.id)) continue;
      for (const tk of dia.tasks || []) {
        if (tk.done || !!tk.cancelled !== reativar) continue;
        if (aPartir != null && /^\d{1,2}:\d{2}/.test(tk.startTime || '')) {
          const [h, m] = tk.startTime.split(':').map(Number);
          if (h * 60 + m < aPartir) continue;
        }
        const alvo = semAcento(`${tk.title || ''} ${tk.desc || ''}`);
        const nota = palavras.filter(w => alvo.includes(w)).length;
        if (!nota) continue;
        if (nota > melhor) { melhor = nota; achados = []; }
        if (nota === melhor) achados.push({ dia: dia.id, tk });
      }
    }
    return achados;
  };
  // 1º o nome que a IA deu; se não achar, as palavras da frase toda (o Uber dele é a atividade "Trabalho")
  let achados = procurar(palavrasDe(nome, false).length ? palavrasDe(nome, false) : [semAcento(nome)]);
  if (!achados.length && texto) achados = procurar([...new Set([...palavrasDe(nome, true), ...palavrasDe(texto, true)])]);
  // Ainda nada: usa o horário como pista ("não vou fazer Uber das 16h" → o que começa às 16h nesses dias)
  if (!achados.length && aPartir != null) {
    const porTitulo = new Map();
    for (const dia of dias) {
      if (soDias && !soDias.has(dia.id)) continue;
      for (const tk of dia.tasks || []) {
        if (tk.done || !!tk.cancelled !== reativar || !/^\d{1,2}:\d{2}/.test(tk.startTime || '')) continue;
        const [h, m] = tk.startTime.split(':').map(Number);
        if (Math.abs(h * 60 + m - aPartir) > 30) continue;
        const k = semAcento(tk.title || '');
        porTitulo.set(k, [...(porTitulo.get(k) || []), { dia: dia.id, tk }]);
      }
    }
    achados = [...porTitulo.values()].sort((a, b) => b.length - a.length)[0] || [];
  }
  // Remarcar sem a original (a pessoa apagou ela sem querer) mas já no dia novo:
  // "apaguei a academia de terça, recria e marca como transferida pra sexta"
  if (!achados.length && remarcar) {
    const r = await recriarTransferida(nome, texto, ini, novoDia);
    if (r !== undefined) return r;
  }
  if (!achados.length) return `Não achei <strong>${_esc(nome)}</strong>${reativar ? ' cancelado' : ''} na tua agenda ${periodo}${aPartir != null ? ` a partir das ${_esc(j.hora)}` : ''}.`;
  const rot = (x) => { const [y, mo, d] = x.dia.split('-').map(Number);
    return `${rotData(new Date(y, mo - 1, d))}${x.tk.startTime ? ' ' + x.tk.startTime : ''}`; };
  const lista = achados.slice(0, 8);
  const qtd = lista.length > 1 ? ` (${lista.length}×)` : '';
  if (remarcar) {
    const novoId = `${novoDia.getFullYear()}-${String(novoDia.getMonth() + 1).padStart(2, '0')}-${String(novoDia.getDate()).padStart(2, '0')}`;
    const x = lista[0];
    if (x.dia === novoId) return `<strong>${_esc(x.tk.title)}</strong> já está em ${rotData(novoDia)}.`;
    // O dia novo já tem essa atividade (ex.: ela repete na sexta): não duplica,
    // só deixa a original riscada como transferida
    const destino = (await fetchDaysRange(novoDia, novoDia))[0];
    const jaTem = (destino?.tasks || []).find(t => !t.cancelled && semAcento(t.title || '') === semAcento(x.tk.title || ''));
    if (jaTem) {
      cardConfirmarLista(`📆 ${rotData(novoDia)} já tem <b>${_esc(x.tk.title)}</b>${jaTem.startTime ? ' ' + jaTem.startTime : ''}. Deixo a de ${rot(x)} riscada como transferida pra lá?`, async () => {
        await updateDayTask(x.dia, x.tk.id, { cancelled: true, movedTo: novoId });
        return `✅ Pronto: <strong>${_esc(x.tk.title)}</strong> de ${rot(x)} ficou riscada com "↪ ${rotData(novoDia)}".`;
      }, null);
      return null;
    }
    cardConfirmarLista(`📆 Passar <b>${_esc(x.tk.title)}</b> de ${rot(x)} pra <b>${rotData(novoDia)}${novaHora || x.tk.startTime ? ' ' + (novaHora || x.tk.startTime) : ''}</b>?`, async () => {
      const { id: _drop, movedTo: _m, ...resto } = x.tk;
      // A original NÃO é apagada: fica riscada (🚫) com "↪ transferida pra <dia>".
      // Apagar não funcionava com atividade que repete: o modelo da semana via o
      // buraco e recriava ela no mesmo dia.
      await updateDayTask(x.dia, x.tk.id, { cancelled: true, movedTo: novoId });
      await addDayTask(novoId, { ...resto, startTime: novaHora || x.tk.startTime || '', rescheduled: true,
        rescheduleCount: (x.tk.rescheduleCount || 0) + 1, done: false, cancelled: false, order: 0 });
      return `✅ Passei <strong>${_esc(x.tk.title)}</strong> pra ${rotData(novoDia)}. No dia antigo ela fica riscada como transferida.`;
    }, null);
    return null;
  }
  cardConfirmarLista(`${reativar ? '↩️ Voltar' : '🚫 Cancelar'} <b>${_esc(lista[0].tk.title)}</b>${qtd}?<br>${lista.map(rot).join(' · ')}`, async () => {
    for (const x of lista) await updateDayTask(x.dia, x.tk.id, { cancelled: !reativar });
    const n = lista.length === 1 ? 'essa atividade' : `${lista.length} atividades`;
    return reativar ? `✅ Voltei ${n} pra agenda.` : `✅ Cancelei ${n}. Fica riscado na agenda.`;
  }, null);
  return null;
}

// A original sumiu do dia de origem (apagada), mas a atividade está no dia novo:
// recria ela riscada no dia de origem com "↪ transferida". undefined = não achou.
async function recriarTransferida(nome, texto, origem, novoDia) {
  const radical = (w) => w.length >= 5 ? w.slice(0, 5) : w;
  const palavras = [...new Set(semAcento(`${nome} ${texto}`).split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !/^\d/.test(w) && !NAO_E_NOME.has(w) && !PALAVRAS_GENERICAS.has(w)).map(radical))];
  if (!palavras.length) return undefined;
  const destino = (await fetchDaysRange(novoDia, novoDia))[0];
  let melhor = null, nota = 0;
  for (const tk of destino?.tasks || []) {
    if (tk.cancelled) continue;
    const n = palavras.filter(w => semAcento(tk.title || '').includes(w)).length;
    if (n > nota) { nota = n; melhor = tk; }
  }
  if (!melhor) return undefined;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const origemId = iso(origem), novoId = iso(novoDia);
  if (origemId === novoId) return undefined;
  const naOrigem = (await fetchDaysRange(origem, origem))[0];
  const jaRiscada = (naOrigem?.tasks || []).find(t => t.cancelled && semAcento(t.title || '') === semAcento(melhor.title || ''));
  if (jaRiscada) {
    if (jaRiscada.movedTo === novoId) return `<strong>${_esc(melhor.title)}</strong> de ${rotData(origem)} já está riscada como transferida pra ${rotData(novoDia)}.`;
    cardConfirmarLista(`📆 Marcar <b>${_esc(melhor.title)}</b> de ${rotData(origem)} como transferida pra <b>${rotData(novoDia)}</b>?`, async () => {
      await updateDayTask(origemId, jaRiscada.id, { movedTo: novoId });
      return `✅ Pronto: <strong>${_esc(melhor.title)}</strong> de ${rotData(origem)} ficou com "↪ ${rotData(novoDia)}".`;
    }, null);
    return null;
  }
  cardConfirmarLista(`📆 ${rotData(novoDia)} já tem <b>${_esc(melhor.title)}</b>. Recrio ela em ${rotData(origem)} riscada, como transferida pra ${rotData(novoDia)}?`, async () => {
    const { id: _drop, movedTo: _m, rescheduled: _r, rescheduleCount: _c, ...resto } = melhor;
    await addDayTask(origemId, { ...resto, done: false, cancelled: true, movedTo: novoId, order: 0 });
    return `✅ Recriei <strong>${_esc(melhor.title)}</strong> em ${rotData(origem)}, riscada com "↪ ${rotData(novoDia)}".`;
  }, null);
  return null;
}

function semAcento(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
}

// Palavras de comando que saem da frase pra sobrar só o nome da atividade
const PALAVRAS_LEMBRETE = new Set(('nao mais quero precisa me pode para parar de chega sem liga ligar ' +
  'desliga desligar ativa ativar desativa desativar tira tirar remove remover coloca colocar bota poe ' +
  'avisa avisar avisos aviso lembra lembrar lembrete lembretes lembrado notifica notificar notificacao ' +
  'notificacoes alarme sino sininho antes some com o a os as um uma da do na no em pra para dos das ' +
  'ser quero pet por favor pfv ai tarefa compromisso atividade').split(' '));

function nomeDoLembrete(text) {
  return String(text).replace(/[.,;:!?]+/g, ' ').split(/\s+/)
    .filter(p => p && !PALAVRAS_LEMBRETE.has(semAcento(p))).join(' ').trim();
}

// "coloca pra mim natação quarta 19h" → "agendar natação quarta 19h", que o
// fluxo de registro já entende (e mostra o card de confirmação antes de gravar).
function frasePraAgendar(text) {
  const jaFeito = /\b(fiz|feito|terminei|conclu[ií])\b/i.test(text);
  const resto = String(text)
    .replace(/^(?:pet,?\s*|ei,?\s*|por favor\s+|pode\s+)*/i, '')
    .replace(/^(?:já\s+|hoje\s+eu\s+|eu\s+)?(?:coloca|bota|p[õo]e|anota|adiciona|inclui|cria|crie|marca|preciso marcar|quero agendar|me lembra de|lembra de|tenho|vou ter|fiz|terminei)\b\s*/i, '')
    .replace(/^(?:pra mim|aí)\s+/i, '')
    .replace(/^(?:uma?\s+)?(?:nova\s+)?(?:tarefa|compromisso|atividade)\s+(?:de\s+)?/i, '')
    .replace(/\s*,?\s*(?:anota|registra|marca)\s+(?:a[ií]|pra mim)\s*$/i, '')
    .replace(/\s+na agenda\b/i, '')
    .replace(/\btem\s+/i, '')
    .trim();
  return (jaFeito ? 'agendar atividade ' : 'agendar ') + resto;
}

async function executarIntencao(intencao, text) {
  switch (intencao) {
    case 'consultar_sono':      return cmdSono();
    case 'consultar_sequencia': return cmdSequencia();
    case 'consultar_agua':      return cmdHidratacao();
    case 'consultar_tarefas':
      return /pr[oó]xim|a seguir|depois(?! de amanh)|agora/i.test(text) ? cmdProximo(text) : cmdTarefas();
    case 'ajuda':               return cmdAjuda();
    case 'ajuda_notificacoes':  return cmdNotificacoesAjuda();
    case 'saudacao':
      if (/obrigad|valeu|vlw|obg|brigad/i.test(text)) return 'De nada! 💛';
      if (/tchau|até|ate mais|falou/i.test(text))   return 'Até mais! 👋';
      return 'Oi! 👋 Em que posso ajudar? Digite <strong>ajuda</strong> pra ver o que eu faço.';
    case 'agendar':
      return routeCommand(frasePraAgendar(text));
    case 'lembrete_ligar':
    case 'lembrete_desligar': {
      const nome = nomeDoLembrete(text);
      if (nome) { await cmdEditarLembrete(nome, null, intencao === 'lembrete_ligar'); return null; }
      break;
    }
  }
  const ex = INTENCAO_EXEMPLO[intencao];
  if (ex) return `Entendi: <strong>${INTENCAO_ROTULO[intencao]}</strong>. Pra eu achar a atividade certa, me fala assim:<br><em>"${ex}"</em>`;
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

// Próximo item com horário, de agora até 7 dias. Se a pessoa disse
// "compromisso", procura só compromisso; senão qualquer tarefa com horário.
async function cmdProximo(frase = '') {
  const soCompromisso = /compromisso|commitment|appointment/i.test(frase);
  const agora = new Date();
  const hoje  = dayId(agora);
  const hhmm  = agora.toTimeString().slice(0, 5);
  const fim   = new Date(agora); fim.setDate(fim.getDate() + 7);
  const dias  = (await fetchDaysRange(agora, fim)).sort((a, b) => a.id.localeCompare(b.id));
  for (const dia of dias) {
    const candidatos = (dia.tasks || [])
      .filter(tk => !tk.done && !tk.cancelled && /^\d{1,2}:\d{2}/.test(tk.startTime || ''))
      .filter(tk => !soCompromisso || tk.kind === 'commitment')
      .filter(tk => dia.id > hoje || (dia.id === hoje && tk.startTime.padStart(5, '0') >= hhmm))
      .sort((a, b) => a.startTime.padStart(5, '0').localeCompare(b.startTime.padStart(5, '0')));
    if (!candidatos.length) continue;
    const tk = candidatos[0];
    const [y, m, d] = dia.id.split('-').map(Number);
    const data = new Date(y, m - 1, d);
    const amanha = new Date(agora); amanha.setDate(agora.getDate() + 1);
    const quando = dia.id === hoje ? 'hoje'
      : dia.id === dayId(amanha) ? 'amanhã'
      : new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'numeric' }).format(data);
    const rotulo = tk.kind === 'commitment' ? 'Teu próximo compromisso' : 'Tua próxima tarefa';
    const desc = (tk.desc || '').trim();
    return `⏭️ ${rotulo}: <strong>${tk.title}</strong>, ${quando} às <strong>${tk.startTime.slice(0, 5)}</strong>.`
      + (desc ? `<br>📝 ${desc}` : '');
  }
  return soCompromisso
    ? '📅 Nenhum compromisso com horário nos próximos 7 dias.'
    : '📅 Nenhuma tarefa com horário nos próximos 7 dias.';
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
  // "Agenda Online" (atendimento) é aceito direto, sem precisar ser atividade.
  if (_ehAgendaOnline(name)) {
    // Se sobrou texto colado no título (parser não separou a descrição por causa de
    // typo tipo "discrição"), manda esse resto pro campo descrição.
    const resto = String(name).trim()
      .replace(/^agenda\s*online\b[\s:·.-]*/i, '')
      .replace(/^(d[ei]scri[çcs][ãa]o\w*|descr\w*|nome|t[ií]tulo)\b[\s:·.-]*/i, '')
      .trim();
    if (resto && !ditado.descricao) ditado.descricao = resto;
    _showMarcacao('Agenda Online', done, date, time);
    return;
  }
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

  // Criar = PRIMEIRA opção (topo); depois a lista das existentes (nome completo).
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot pet-msg-wide';
  div.innerHTML = `
    <span class="pet-preview-card pet-preview-tight">
      <button type="button" class="pet-atv-create pet-atv-create-full" data-create>➕ Criar “${_esc(name)}”</button>
      ${cats.length ? '<span class="pet-reco-lbl pet-atv-lbl">ou escolha uma existente:</span><div class="pet-atv-grid" data-atv-grid></div>' : ''}
    </span>`;
  const atvGrid = div.querySelector('[data-atv-grid]');
  if (atvGrid) atvGrid.innerHTML = cats.map(c =>
    `<button type="button" class="pet-reco-chip pet-atv-chip" data-atv="${_esc(c.name)}">${c.icon || '🏷️'} ${_esc(c.name)}</button>`
  ).join('');

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
      <div class="pet-check-row"><span>🔔 Lembrete</span><label class="ajustes-toggle"><input type="checkbox" data-bell><span class="ajustes-toggle-slider"></span></label></div>
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

  // 🔔 Lembrete = switch ligado/desligado (mesmo do Ajustes). TOTALMENTE manual:
  // a repetição não liga/desliga sozinha, a pessoa controla à vontade.
  function syncBell() { bellEl.checked = !!ditado.lembrete; }
  bellEl.addEventListener('change', () => { ditado.lembrete = bellEl.checked; });

  renderRep();
  syncBell();

  const btn = div.querySelector('.pet-reg-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = t('pet.preview.registering');
    try {
      // Já existe IGUAL nesse dia? Só é duplicata de verdade quando título, horário
      // E DESCRIÇÃO batem. Mesmo título com descrição diferente é outro compromisso
      // legítimo — ex.: "Contas a pagar / FIAP" e "Contas a pagar / Seguro do carro"
      // no mesmo dia 5. Antes olhava só título+horário e bloqueava esse caso.
      const jaTem = (await getDayTasks(dayId(date)))
        .some(tk => _limpoTxt(tk.title) === _limpoTxt(curName)
                 && (!time || (tk.startTime || '') === time)
                 && _limpoTxt(tk.desc || '') === _limpoTxt(ditado.descricao || ''));
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
      // Lembrete é escolha da pessoa (não forçado pela recorrência).
      const lembreteFinal = !!ditado.lembrete;
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

// Identidade de uma regra de recorrência (ignora groupId/anchor). Duas regras com
// esta mesma identidade são a MESMA recorrência — não devem coexistir.
function _regraId(r) {
  return [
    (r.title || '').trim().toLowerCase(), r.freq || '', r.interval || 1,
    r.dayOfMonth ?? '', r.weekday ?? '', r.lastDayOfMonth ? 1 : 0,
    r.lastWeekday ?? '', r.nthWeekday ?? '', r.startTime || '',
    (r.desc || '').trim().toLowerCase(),
  ].join('|');
}

// Salva uma regra de recorrência no profile (o motor do Ritual a lê e gera/fixa).
async function salvarRegra(rule) {
  try {
    const prof = await getProfile().catch(() => null);
    const list = Array.isArray(prof?.recurrenceRules) ? prof.recurrenceRules.slice() : [];
    // NÃO empilha regra idêntica (mesmo título+freq+dia+horário+descrição). Sem
    // isto, cada re-registro (ou clique repetido) criava outra recorrência e o dia
    // enchia de cópias — ex.: 3× "Contas a pagar / FIAP" no dia 5.
    const novoId = _regraId(rule);
    if (list.some(r => _regraId(r) === novoId)) return;
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
    icon: cat?.icon || (_ehAgendaOnline(name) ? '📅' : ''),
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

// "Agenda Online" é um título ESPECIAL (atendimento de cliente) — não é uma
// atividade/categoria registrada, então o Pet aceita direto (sem o gate "criar").
function _ehAgendaOnline(v) {
  const s = _limpoTxt(v);
  return s === 'agenda online' || s === 'agendaonline' || s.startsWith('agenda online ');
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
  // pet-msg-stack: empilha os cards na VERTICAL. Sem isso, .pet-msg (flex row)
  // punha um card ao lado do outro, estourando a largura e deslocando a tela.
  div.className = 'pet-msg pet-msg-bot pet-msg-stack';

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
// BLOCO 8.6: CAIXA DE FERRAMENTAS (LISTAS) VIA PET
// A leitura do pedido fica em pet-listas.js; aqui busca as listas, pergunta
// quando há dúvida e grava só depois do card de confirmação.
// ═══════════════════════════════════════════════════════════════

let _arvore = null, _arvoreEm = 0;
async function arvoreListas(forcar = false) {
  if (forcar || !_arvore || Date.now() - _arvoreEm > 60000) {
    _arvore = await carregarFerramentas();
    _arvoreEm = Date.now();
  }
  return _arvore;
}

// Contexto da conversa: a última lista mostrada ou mexida. "Me mostra a lista
// do mercado" e logo depois "bota leite como feito" = o leite DESSA lista.
// Vale 10 minutos; frase que nomeia outra lista passa por cima.
let _ctxLista = null;
function lembrarLista(grupo, secao) {
  if (grupo) _ctxLista = { grupo: grupo.nome, secaoId: secao?.id || null, em: Date.now() };
}
function alvoDoContexto(arvore) {
  if (!_ctxLista || Date.now() - _ctxLista.em > 10 * 60000) return null;
  const grupo = arvore.find(g => g.nome === _ctxLista.grupo);
  if (!grupo) return null;
  const secao = _ctxLista.secaoId ? grupo.secoes.find(s => s.id === _ctxLista.secaoId) || null : null;
  return { grupo, secao, trechos: [], candidatos: [], doContexto: true };
}

// Depois de gravar: badge da Home e, se a Caixa estiver aberta, avisa pra reabrir
async function aposMudarLista() {
  _arvore = null;
  import('./ferramentas-ui.js').then(m => m.pintarBadgeFerramentas?.()).catch(() => {});
}

// Devolve undefined quando a frase não é sobre listas (o roteador segue).
// Atividades de HOJE da Home no mesmo formato dos itens de lista, pra usar a
// mesma busca por palavras ("marca academia como feita", "fiz a hidratação").
async function candidatosHoje(text, acao) {
  if (acao !== 'marcar' && acao !== 'desmarcar') return [];
  const tasks = await getDayTasks(dayId(new Date())).catch(() => []);
  const pseudo = [{ nome: 'Hoje', soltos: tasks.filter(tk => !tk.cancelled)
    .map(tk => ({ id: tk.id, texto: tk.title || '', feito: !!tk.done, task: tk })), secoes: [] }];
  return PL.acharItens(pseudo, text, {}, acao === 'marcar' ? 'pendentes' : 'feitos').map(x => ({ ...x, hoje: true }));
}

async function tentarLista(text) {
  // "mostra como ficou" logo depois de mexer numa lista: mostra ela de novo
  if (_ctxLista && Date.now() - _ctxLista.em < 10 * 60000 && _ctxLista.em > _ctxPreparo && PP.pedeVerDeNovo(text)) {
    const arvore = await arvoreListas();
    const alvo = alvoDoContexto(arvore);
    if (alvo) return listaVer(arvore, alvo);
  }
  const acao = PL.detectarAcao(text);
  if (!acao) return undefined;
  const dica = PL.DICA_LISTA.test(text);
  // "fiz a academia", "marca academia como feita": se bate numa atividade de
  // hoje, marca ela (em vez de registrar outra igual). Vale mesmo com "hoje"
  // na frase; "marca academia amanhã" (sem fiz/feito/check) segue pra agenda.
  const ehConclusao = /\b(fiz|feit[oa]s?|terminei|acabei|conclu\w*|check|desmarc\w*)\b/i.test(text);
  const hoje = ehConclusao ? await candidatosHoje(text, acao) : [];
  if (hoje.length && !dica) {
    let arv = [];
    try { arv = await arvoreListas(); } catch { /* listas são extra aqui */ }
    return listaItemAcao(arv, text, PL.acharAlvo(arv, text), acao, hoje);
  }
  // Sem falar em "lista", só entra se não for agenda nem lembrete
  // (extractDate cai em "hoje" quando não acha data, então aqui é por palavra)
  const temData = /\b(hoje|amanh[ãa]|dia \d|\d{1,2}\/\d{1,2}|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|semana que vem)/i.test(text);
  if (!dica && (/lembrete|sininho|\bsino\b|notifica|aviso|alarme/i.test(text) || extractTime(text) || temData)) return undefined;
  if (!dica && acao === 'ver') return undefined;   // "qual meu próximo compromisso" etc.

  let arvore;
  try { arvore = await arvoreListas(); }
  catch (err) { console.warn('[pet-listas]', err); return dica ? 'Não consegui abrir tuas listas agora. Tenta de novo daqui a pouco.' : undefined; }

  let alvo = PL.acharAlvo(arvore, text);
  if (!alvo.grupo && !alvo.candidatos.length) alvo = alvoDoContexto(arvore) || alvo;
  const temAlvo = !!(alvo.grupo || alvo.candidatos.length);
  if (!dica) {
    // Sem a palavra "lista": "marca academia" / "bota mercado" continuam sendo
    // agenda. Só vira lista se bater num item que existe (marcar, apagar,
    // editar) ou se nomear a lista E sobrar o que adicionar.
    if (acao === 'adicionar') { if (!temAlvo || !PL.textoParaAdicionar(text, alvo)) return undefined; }
    else if (!PL.acharItens(arvore, acao === 'editar' ? (PL.partesEdicao(text, alvo)?.antigo || '') : text, alvo).length) return undefined;
  }

  switch (acao) {
    case 'ver':       return listaVer(arvore, alvo);
    case 'adicionar': return listaAdicionar(arvore, text, alvo);
    case 'criar':     return listaCriar(arvore, text, alvo);
    case 'editar':    return listaEditar(arvore, text, alvo);
    default:          return listaItemAcao(arvore, text, alvo, acao, hoje);
  }
}

const _itemLinha = (it) => `${it.feito ? '✅' : '⬜'} ${_esc(it.texto)}`;

function listaVer(arvore, alvo) {
  if (alvo.grupo) lembrarLista(alvo.grupo, alvo.secao);
  if (alvo.secao) {
    const itens = alvo.secao.itens;
    if (!itens.length) return `📋 <strong>${_esc(PL.ondeTexto(alvo.grupo, alvo.secao))}</strong> está vazia.`;
    return `📋 <strong>${_esc(PL.ondeTexto(alvo.grupo, alvo.secao))}</strong><br>` + itens.map(_itemLinha).join('<br>');
  }
  const pend = (lista) => lista.filter(i => !i.feito).length;
  if (alvo.grupo) {
    const g = alvo.grupo;
    const linhas = g.secoes.map(s => `• ${_esc(s.nome)}: ${pend(s.itens)} pendente(s)`);
    if (g.soltos.length) linhas.unshift(...g.soltos.map(_itemLinha));
    return `📋 <strong>${_esc(g.nome)}</strong><br>` + (linhas.join('<br>') || 'Nada aqui ainda.');
  }
  if (alvo.candidatos.length) {
    addChoices('Qual delas?', alvo.candidatos.map(c => ({
      label: PL.ondeTexto(c.grupo, c.secao), action: () => listaVer(arvore, { grupo: c.grupo, secao: c.secao }),
    })));
    return null;
  }
  const linhas = arvore.map(g => {
    const n = pend(g.soltos) + g.secoes.reduce((a, s) => a + pend(s.itens), 0);
    return `• ${_esc(g.nome)}: ${n} pendente(s)`;
  });
  return '📋 <strong>Tuas listas</strong><br>' + linhas.join('<br>') + '<br><br>Pra ver uma: <em>"o que tem na lista do Mercado"</em>.';
}

// ── Depois de confirmar: mostra o RESULTADO na própria conversa ──
// (Elton: nada de atalho pra outra tela — a lista/dia/perfil aparece no chat,
// com um botão "Ver … completo" que também abre ali mesmo.)
const _LIMITE_CHAT = 8;
const _linhaDestaque = (txt, feito, destaque) => {
  const t = _esc(txt);
  const novo = destaque && _limpoTxt(txt) === _limpoTxt(destaque);
  return `${feito ? '✅' : '⬜'} ${novo ? `<strong>${t}</strong> ✨` : t}`;
};
function _htmlListaChat(titulo, itens, destaque, completa) {
  const pend = itens.filter(i => !i.feito), feitos = itens.filter(i => i.feito);
  if (!itens.length) return { html: `${titulo}<br><em>vazia</em>`, temMais: false };
  if (completa) return { html: titulo + '<br>' + [...pend, ...feitos].map(i => _linhaDestaque(i.texto, i.feito, destaque)).join('<br>'), temMais: false };
  const mostra = pend.slice(0, _LIMITE_CHAT);
  // o item mexido aparece mesmo se já estiver feito (ex.: acabou de marcar)
  const mexido = destaque && feitos.find(i => _limpoTxt(i.texto) === _limpoTxt(destaque));
  const linhas = mostra.map(i => _linhaDestaque(i.texto, false, destaque));
  if (mexido) linhas.push(_linhaDestaque(mexido.texto, true, destaque));
  const resto = [];
  if (pend.length > _LIMITE_CHAT) resto.push(`+${pend.length - _LIMITE_CHAT} pendente(s)`);
  const feitosOcultos = feitos.length - (mexido ? 1 : 0);
  if (feitosOcultos > 0) resto.push(`${feitosOcultos} já feito(s)`);
  return { html: titulo + '<br>' + (linhas.join('<br>') || '<em>tudo feito 🎉</em>') + (resto.length ? `<br><small>${resto.join(' · ')}</small>` : ''), temMais: resto.length > 0 };
}

// Lista (grupo/categoria) do jeito que ficou depois da mudança
async function mostrarListaNaConversa(grupoNome, secaoId, destaque) {
  const arv = await arvoreListas(true);
  const grupo = arv.find(g => g.nome === grupoNome); if (!grupo) return;
  const secao = secaoId ? grupo.secoes.find(s => s.id === secaoId) || null : null;
  const itens = secao ? secao.itens : grupo.soltos;
  const titulo = `📋 <strong>${_esc(PL.ondeTexto(grupo, secao))}</strong> · como ficou`;
  const { html, temMais } = _htmlListaChat(titulo, itens, destaque, false);
  if (!temMais) return addMessage(html, 'bot');
  addChoices(html, [{ label: '📋 Ver lista completa', action: () => _htmlListaChat(`📋 <strong>${_esc(PL.ondeTexto(grupo, secao))}</strong> · completa`, itens, destaque, true).html }]);
}

// Atividades de HOJE (Ritual) depois de marcar/desmarcar uma delas
async function mostrarHojeNaConversa(destaque) {
  const tasks = (await getDayTasks(dayId(new Date())).catch(() => []))
    .filter(tk => !tk.cancelled)
    .sort((a, b) => String(a.startTime || '99').localeCompare(String(b.startTime || '99')));
  const itens = tasks.map(tk => ({ texto: (tk.startTime ? tk.startTime.slice(0, 5) + ' · ' : '') + (tk.title || ''), feito: !!tk.done, _t: tk.title || '' }));
  // destaque compara pelo título (sem a hora na frente)
  const alvo = destaque && itens.find(i => _limpoTxt(i._t) === _limpoTxt(destaque));
  const { html, temMais } = _htmlListaChat('📅 <strong>Teu dia hoje</strong> · como ficou', itens, alvo?.texto, false);
  if (!temMais) return addMessage(html, 'bot');
  addChoices(html, [{ label: '📅 Ver o dia completo', action: () => _htmlListaChat('📅 <strong>Teu dia hoje</strong> · completo', itens, alvo?.texto, true).html }]);
}

// Card de confirmação genérico: resumo + Confirmar/Cancelar. `acao` grava e
// devolve o texto de sucesso.
function cardConfirmarLista(resumo, acao, depois = aposMudarLista, mostrar = null) {
  const box = document.getElementById('pet-messages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `<span class="pet-preview-card">
      <span class="pet-preview-title">${resumo}</span>
      <button class="pet-reg-btn" data-ok>✅ Confirmar</button>
      <button class="pet-choice-btn" data-nao>Cancelar</button>
    </span>`;
  const ok = div.querySelector('[data-ok]'), nao = div.querySelector('[data-nao]');
  ok.addEventListener('click', async () => {
    ok.disabled = nao.disabled = true; ok.textContent = 'Salvando…';
    try {
      const msg = await acao();
      ok.textContent = '✅ Feito'; ok.classList.add('pet-reg-done'); nao.remove();
      depois?.();
      if (msg) addMessage(msg, 'bot');
      // resultado na conversa (lista/dia/perfil como ficou) — falha aqui não
      // desfaz nada: o dado já foi gravado
      if (mostrar) { try { await mostrar(); } catch (e) { console.warn('[pet-mostrar]', e); } }
    } catch (err) {
      console.error('[pet-listas]', err);
      ok.disabled = nao.disabled = false; ok.textContent = '✅ Confirmar';
      addMessage('Não consegui salvar 😕 ' + _esc(err.message || ''), 'bot');
    }
  });
  nao.addEventListener('click', () => { ok.disabled = nao.disabled = true; nao.textContent = 'Cancelado'; ok.remove(); });
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// Quando falta escolher grupo/categoria: chips com os destinos possíveis
function escolherDestino(arvore, titulo, aoEscolher, candidatos = null) {
  const opcoes = candidatos || arvore.flatMap(g => [{ grupo: g, secao: null }, ...g.secoes.map(s => ({ grupo: g, secao: s }))]);
  addChoices(titulo, opcoes.slice(0, 24).map(o => ({ label: PL.ondeTexto(o.grupo, o.secao), action: () => { aoEscolher(o); return null; } })));
}

// Vários itens numa frase ("aveia, alho e legumes"). Falado sem vírgula
// ("aveia flocão alho legumes pro refogado"), a IA da nuvem separa; sem nuvem,
// separa por vírgula / "e" / "mais".
async function itensParaAdicionar(novo, text) {
  const local = PL.separarItens(novo);
  const palavras = novo.trim().split(/\s+/).length;
  if (palavras >= 4 && PN.nuvemLigada()) {
    const j = await PN.perguntarNuvem({ texto: text }).catch(() => null);
    if (j?.acao === 'lista_adicionar' && Array.isArray(j.itens)) {
      const nuvem = PL.separarItens(j.itens.map(i => String(i).replace(/[<>,;]/g, ' ')).join(', '));
      if (nuvem.length) return nuvem;
    }
  }
  return local.length ? local : [novo];
}

async function listaAdicionar(arvore, text, alvo) {
  const novo = PL.textoParaAdicionar(text, alvo);
  if (!novo) return 'O que eu adiciono? Ex.: <em>"adiciona leite na lista do Mercado"</em>.';
  const itens = await itensParaAdicionar(novo, text);
  const nomes = itens.length > 1 ? `${itens.length} itens` : `<strong>${_esc(itens[0])}</strong>`;
  const confirmar = ({ grupo, secao }) => { lembrarLista(grupo, secao); cardConfirmarLista(
    itens.length > 1
      ? `➕ Adicionar ${itens.length} itens em <strong>${_esc(PL.ondeTexto(grupo, secao))}</strong>?<br>${itens.map(i => `• ${_esc(i)}`).join('<br>')}`
      : `➕ Adicionar <strong>${_esc(itens[0])}</strong> em <strong>${_esc(PL.ondeTexto(grupo, secao))}</strong>?`,
    async () => { for (const i of itens) await adicionarItem(grupo.nome, i, secao?.id || null); return null; },
    aposMudarLista, () => mostrarListaNaConversa(grupo.nome, secao?.id || null, itens[itens.length - 1])); };
  if (alvo.grupo) { confirmar(alvo); return null; }
  escolherDestino(arvore, `Em qual lista eu ponho ${nomes}?`, confirmar, alvo.candidatos.length ? alvo.candidatos : null);
  return null;
}

function listaCriar(arvore, text, alvo) {
  const nome = PL.nomeNovaLista(text, alvo);
  if (!nome) return 'Qual o nome da lista? Ex.: <em>"cria uma lista de Viagem no Pessoal"</em>.';
  const confirmar = (grupo) => {
    if (grupo.secoes.some(s => _limpoTxt(s.nome) === _limpoTxt(nome)))
      return addMessage(`Já existe <strong>${_esc(nome)}</strong> em ${_esc(grupo.nome)}.`, 'bot');
    cardConfirmarLista(`🗂️ Criar a lista <strong>${_esc(nome)}</strong> em <strong>${_esc(grupo.nome)}</strong>?`,
      async () => { await adicionarSecao(grupo.nome, nome); return `Pronto! Agora é só pedir: <em>"adiciona … na lista ${_esc(nome)}"</em>.`; });
  };
  if (alvo.grupo) { confirmar(alvo.grupo); return null; }
  addChoices(`Em qual grupo fica a lista <strong>${_esc(nome)}</strong>?`,
    arvore.map(g => ({ label: g.nome, action: () => { confirmar(g); return null; } })));
  return null;
}

// marcar / desmarcar / apagar um item que já existe. `hoje` = atividades de
// hoje da Home que também bateram (só marcar/desmarcar; apagar é só de lista).
function listaItemAcao(arvore, text, alvo, acao, hoje = []) {
  const filtro = acao === 'marcar' ? 'pendentes' : acao === 'desmarcar' ? 'feitos' : null;
  let daLista = PL.acharItens(arvore, text, alvo, filtro);
  // Contexto é só preferência: se na lista de antes não tem, procura em todas
  if (!daLista.length && alvo.doContexto) { alvo = {}; daLista = PL.acharItens(arvore, text, alvo, filtro); }
  let achados = [...(acao === 'apagar' ? [] : hoje), ...daLista];
  if (achados.length) { const topo = Math.max(...achados.map(x => x.nota)); achados = achados.filter(x => x.nota >= topo - 0.01); }
  if (!achados.length) {
    const todos = PL.acharItens(arvore, text, alvo);
    if (todos.length && acao === 'marcar') return `<strong>${_esc(todos[0].item.texto)}</strong> já está marcado ✅`;
    if (todos.length && acao === 'desmarcar') return `<strong>${_esc(todos[0].item.texto)}</strong> não está marcado.`;
    return 'Não achei esse item pendente nas tuas listas nem nas atividades de hoje. Diz <em>"o que tem na lista do Mercado"</em> pra ver uma lista.';
  }
  const verbo = { marcar: '✅ Marcar', desmarcar: '⬜ Desmarcar', apagar: '🗑️ Apagar' }[acao];
  const onde = (x) => x.hoje
    ? `hoje${x.item.task.startTime ? ' às ' + x.item.task.startTime.slice(0, 5) : ''}`
    : PL.ondeTexto(x.grupo, x.secao);
  const confirmar = (x) => (x.hoje || lembrarLista(x.grupo, x.secao), cardConfirmarLista(
    `${verbo} <strong>${_esc(x.item.texto)}</strong> · ${_esc(onde(x))}?`,
    async () => {
      if (x.hoje) {
        await updateDayTask(dayId(new Date()), x.item.id, { done: acao === 'marcar' });
        if (acao === 'marcar') return x.item.task.kind === 'commitment' ? 'Compromisso cumprido 💪' : 'Boa! Mais uma feita 💪';
        return null;
      }
      if (acao === 'apagar') await apagarItem(x.item.id);
      else await marcarItem(x.item.id, acao === 'marcar');
      return null;
    }, aposMudarLista, () => x.hoje
      ? mostrarHojeNaConversa(x.item.texto)
      : mostrarListaNaConversa(x.grupo.nome, x.secao?.id || null, acao === 'apagar' ? null : x.item.texto)));
  if (achados.length === 1) { confirmar(achados[0]); return null; }
  addChoices('Achei mais de um. Qual?', achados.slice(0, 8).map(x => ({
    label: `${x.item.texto} · ${onde(x)}`, action: () => { confirmar(x); return null; },
  })));
  return null;
}

function listaEditar(arvore, text, alvo) {
  const partes = PL.partesEdicao(text, alvo);
  if (!partes || !partes.novo) return 'Me fala assim: <em>"troca arroz por arroz integral na lista do Mercado"</em>.';
  let achados = PL.acharItens(arvore, partes.antigo, alvo);
  if (!achados.length && alvo.doContexto) achados = PL.acharItens(arvore, partes.antigo, {});
  if (!achados.length) return `Não achei <strong>${_esc(partes.antigo)}</strong> nas tuas listas.`;
  const confirmar = ({ item, grupo, secao }) => (lembrarLista(grupo, secao), cardConfirmarLista(
    `✏️ Trocar <strong>${_esc(item.texto)}</strong> por <strong>${_esc(partes.novo)}</strong> em ${_esc(PL.ondeTexto(grupo, secao))}?`,
    async () => { await editarItem(item.id, partes.novo); return null; },
    aposMudarLista, () => mostrarListaNaConversa(grupo.nome, secao?.id || null, partes.novo)));
  if (achados.length === 1) { confirmar(achados[0]); return null; }
  addChoices('Achei mais de um. Qual?', achados.slice(0, 8).map(x => ({
    label: `${x.item.texto} · ${PL.ondeTexto(x.grupo, x.secao)}`, action: () => { confirmar(x); return null; },
  })));
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.7: PREPARO FÍSICO VIA PET
// ═══════════════════════════════════════════════════════════════
// Perfil de treino (profile.perfilTreino) e peso/altura/sexo (profile). Quem
// interpreta é o pet-preparo.js; aqui só mostra o card e grava. Medidas da fita
// + fotos ficam na tela (bloco mensal travado), o Pet só leva até lá.
const _rotPreparo = (r) => r.linhas.map(l => '• ' + l).join('<br>');

function botaoIrPreparo(texto) {
  addChoices(texto, [{ label: '💪 Abrir Preparo Físico', action: () => { location.hash = '#/preparo'; return null; } }]);
}

// Contexto: depois de mexer no Preparo, "mostra como ficou" é sobre ele (10 min),
// a não ser que a pessoa tenha mexido numa lista depois.
let _ctxPreparo = 0;
const preparoNoContexto = () => Date.now() - _ctxPreparo < 10 * 60000 && _ctxPreparo > (_ctxLista?.em || 0);

async function tentarPreparo(text) {
  if (PP.querVerPreparo(text)) return verPreparo();
  if (preparoNoContexto() && PP.pedeVerDeNovo(text) && !PP.interpretarPreparo(text)) return verPreparo();
  if (PP.falaDeMedidas(text) && !PP.interpretarPreparo(text)) {
    botaoIrPreparo('As medidas (cintura, braço…) e as fotos ficam juntas num registro por mês, lá na <strong>Composição corporal</strong>. Te levo lá:');
    return null;
  }
  // Data/hora/lembrete = agenda ("treino amanhã às 7"), não perfil.
  if (extractTime(text) || /\blembr/i.test(text)) return undefined;
  const r = PP.interpretarPreparo(text);
  if (!r) return undefined;
  _ctxPreparo = Date.now();
  cardConfirmarLista(`💪 Atualizar teu Preparo Físico?<br>${_rotPreparo(r)}`, async () => {
    if (Object.keys(r.treino).length) await salvarPerfilTreino(r.treino);
    if (Object.keys(r.corpo).length) {
      const { salvarDadosCorpo } = await import('./corpo.js');
      await salvarDadosCorpo(r.corpo);
    }
    _ctxPreparo = Date.now();
    return null;
  }, null, () => addChoices('✅ <strong>Preparo Físico atualizado.</strong>',
    [{ label: '💪 Ver perfil completo', action: () => verPreparo() }]));
  return null;
}

// Junta o patch no perfil de treino salvo e grava
async function salvarPerfilTreino(patch) {
  const { getPerfilTreino } = await import('./perfil-treino-ui.js');
  const atual = getPerfilTreino(await getProfile().catch(() => null));
  const novo = { ...atual, ...patch, freqPorMusculo: { ...atual.freqPorMusculo, ...(patch.freqPorMusculo || {}) } };
  // Mesma regra da tela: músculo não treina mais vezes que os treinos da semana
  for (const k of Object.keys(novo.freqPorMusculo)) novo.freqPorMusculo[k] = Math.min(novo.freqPorMusculo[k], novo.freqSemana, 3);
  await setProfile({ perfilTreino: novo });
}

async function verPreparo() {
  _ctxPreparo = Date.now();
  const prof = await getProfile().catch(() => null);
  const { getPerfilTreino, MUSCULOS } = await import('./perfil-treino-ui.js');
  const pt = getPerfilTreino(prof);
  const mus = MUSCULOS.map(m => `${m.nome} ${pt.freqPorMusculo[m.k] ?? 0}×`).join(', ');
  const corpo = [];
  if (prof?.pesoKg) corpo.push(`Peso <b>${String(prof.pesoKg).replace('.', ',')} kg</b>`);
  if (prof?.alturaCm) corpo.push(`Altura <b>${String(prof.alturaCm / 100).replace('.', ',')} m</b>`);
  return `💪 <strong>Teu Preparo Físico</strong><br>` +
    `• Objetivo: <b>${PP.OBJETIVO_ROTULO[pt.objetivo] || pt.objetivo}</b>${pt.forca ? ' + 💥 Força' : ''}<br>` +
    `• Treinos por semana: <b>${pt.freqSemana}×</b><br>` +
    `• Por músculo: ${mus}<br>` +
    (corpo.length ? `• ${corpo.join(' · ')}<br>` : '• Peso e altura: <em>ainda não informados</em> (ex.: "meu peso é 80 kg")<br>') +
    `<br>Pra mudar, fala: <em>"treino 5 vezes por semana"</em>, <em>"meu objetivo é volume"</em>, <em>"fiquei 2 meses parado"</em>.`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.8: CHECK-IN — o Pet puxa conversa
// ═══════════════════════════════════════════════════════════════
// Quando o app abre (logado), o pet-checkin.js lista os assuntos pendentes.
// A bolinha vermelha mostra quantos são; ao abrir o chat ele puxa um por vez
// e, depois de cada resposta, já emenda o próximo.
const CK_KEY = 'falcon_pet_checkin';
let _fila = [], _checkinRodou = false, _CK = null, _ckDias = [];

function lerCheckin() { try { return JSON.parse(localStorage.getItem(CK_KEY)) || {}; } catch { return {}; } }
function gravarCheckin(st) { try { localStorage.setItem(CK_KEY, JSON.stringify(st)); } catch { /* sem storage: só não lembra */ } }
const chatAberto = () => !!document.getElementById('pet-chat')?.classList.contains('pet-chat-open');

async function prepararCheckin() {
  if (_checkinRodou || !String(getLang()).startsWith('pt')) return;
  _checkinRodou = true;
  try {
    _CK = await import('./pet-checkin.js?v=20261006c');
    const agora = Date.now();
    const ontem = new Date(agora - 86400000);
    const [prof, dias] = await Promise.all([
      getProfile().catch(() => null),
      fetchDaysRange(new Date(agora - 60 * 86400000), new Date(agora)),
    ]);
    _ckDias = dias || [];
    const ctx = { dias, prof, agora, ontemId: dayId(ontem), hojeId: dayId(new Date(agora)) };
    _fila = _CK.listarPerguntas(ctx, lerCheckin())
      .map(p => ({ ...p, ontemId: dayId(ontem) }));
    agendarFimDoDia(ctx);
    if (!_fila.length) return;
    if (chatAberto()) mostrarCheckin();
    else setBadge(_fila.length);
  } catch (err) {
    console.warn('[pet-checkin]', err);
  }
}

// Fim do dia: com o app aberto, às 21h o Pet já puxa a nota de hoje (bolinha
// vermelha no Pet, sem notificação). Abrindo o app depois das 21h, ela já vem na fila.
function agendarFimDoDia(ctx) {
  const hoje = new Date(ctx.agora);
  const as21 = new Date(hoje); as21.setHours(_CK.HORA_NOTA_HOJE, 0, 0, 0);
  if (ctx.agora < as21.getTime()) {
    setTimeout(async () => {
      try {
        // Relê o dia de hoje: a nota pode ter sido feita na tela depois que o app abriu
        const atual = await getDay(ctx.hojeId).catch(() => null);
        const dias = ctx.dias.filter(d => d.id !== ctx.hojeId).concat(atual ? [{ ...(ctx.dias.find(d => d.id === ctx.hojeId) || { tasks: [] }), ...atual }] : ctx.dias.filter(d => d.id === ctx.hojeId));
        const p = _CK.listarPerguntas({ ...ctx, dias, agora: Date.now() }, lerCheckin()).find(x => x.tipo === 'nota_hoje');
        if (!p || _fila.some(x => x.tipo === 'nota_hoje')) return;
        _fila.push({ ...p, ontemId: ctx.ontemId });
        if (chatAberto() && !conversaAtiva()) mostrarCheckin(); else setBadge(_fila.length);
      } catch (_) { /* sem check-in: tudo bem */ }
    }, as21.getTime() - ctx.agora);
  }
}

function mostrarCheckin() {
  const p = _fila.shift();
  if (!p) return;
  if (!p.repetida) {
    const st = lerCheckin();
    st.tipos = { ...(st.tipos || {}), [p.tipo]: { ...(st.tipos?.[p.tipo] || {}), perguntadoEm: Date.now() } };
    gravarCheckin(st);
  }
  if (p.conversa) { if (p.tipo === 'nota' || p.tipo === 'nota_hoje') iniciarConversaNota(p); else iniciarConversaTreino(p); return; }
  if (p.tipo === 'ontem') { checklistOntem(p); return; }
  addChoices(p.texto, p.botoes.map(b => ({ label: b.label, action: async () => {
    const msg = await responderCheckin(p, b);
    proximoAssunto();
    return msg;
  } })));
}

// Ontem: a pessoa marca quantas quiser NA MESMA mensagem (cada toque marca
// ou desmarca na hora, o botão vira ✔️) e fecha com "Pronto". Sem repetir a pergunta.
function checklistOntem(p) {
  const box = document.getElementById('pet-messages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  const span = document.createElement('span');
  span.innerHTML = p.texto.replace(/Tu fez alguma\?$/, 'Toca nas que tu fez:').replace(/Tu fez\?$/, 'Toca se tu fez:');
  const lista = document.createElement('div');
  lista.className = 'pet-choices';
  const feitos = new Set();
  const itens = p.botoes.filter(b => b.resp === 'marcar_ontem');
  const nomeDe = (b) => b.label.replace(/^✅\s*/, '');
  let fim;
  const atualizarFim = () => { fim.textContent = feitos.size ? `👍 Pronto (${feitos.size})` : '🙅 Não fiz nenhuma'; };
  for (const b of itens) {
    const btn = document.createElement('button');
    btn.className = 'pet-choice-btn';
    btn.textContent = `⬜ ${nomeDe(b)}`;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const marcar = !feitos.has(b.valor);
      try {
        await updateDayTask(p.ontemId, b.valor, { done: marcar });
        if (marcar) feitos.add(b.valor); else feitos.delete(b.valor);
        btn.textContent = `${marcar ? '✅' : '⬜'} ${nomeDe(b)}`;
        btn.classList.toggle('pet-choice-selected', marcar);
      } catch (_) {
        addMessage('Não consegui marcar agora. Tenta de novo daqui a pouco.', 'bot');
      }
      btn.disabled = false;
      atualizarFim();
    });
    lista.appendChild(btn);
  }
  fim = document.createElement('button');
  fim.className = 'pet-choice-btn';
  atualizarFim();
  fim.addEventListener('click', () => {
    div.querySelectorAll('.pet-choice-btn').forEach(x => { x.disabled = true; x.classList.add('pet-choice-used'); });
    fim.classList.add('pet-choice-selected');
    addMessage(feitos.size ? `✅ Marquei ${feitos.size === 1 ? '1 coisa' : `${feitos.size} coisas`} de ontem como feito.` : 'Tranquilo, hoje é outro dia 💪', 'bot');
    proximoAssunto();
  });
  lista.appendChild(fim);
  span.appendChild(lista);
  div.appendChild(span);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// Emenda o próximo assunto da fila depois da resposta aparecer
function proximoAssunto() {
  if (_fila.length) setTimeout(() => { if (chatAberto()) mostrarCheckin(); else setBadge(_fila.length); }, 900);
}

function adiarTipos(tipos, dias) {
  const st = lerCheckin();
  st.tipos = { ...(st.tipos || {}) };
  for (const tp of tipos) st.tipos[tp] = { ...(st.tipos[tp] || {}), adiadoAte: Date.now() + dias * 86400000 };
  gravarCheckin(st);
}

async function responderCheckin(p, b) {
  switch (b.resp) {
    case 'depois': {
      const st = lerCheckin();
      st.tipos = { ...(st.tipos || {}), [p.tipo]: { ...(st.tipos?.[p.tipo] || {}), adiadoAte: Date.now() + _CK.ADIA[p.tipo] * 86400000 } };
      gravarCheckin(st);
      return 'Combinado, deixo isso pra depois 👍';
    }
    case 'nao_marco':
      return 'Beleza! Pra marcar rápido, é só me falar <em>"fiz a academia"</em> que eu marco pra ti.';
    case 'parei':
      await salvarPerfilTreino({ pausa: 'menos1m' });
      return '⏸️ Anotei no teu perfil que tu tá parado. A volta começa mais leve, e quando quiser recomeçar é só agendar o treino comigo 💪';
    case 'diminui':
      await salvarPerfilTreino({ freqSemana: b.valor });
      return `📉 Atualizei teu perfil pra <strong>${b.valor}× por semana</strong>. Melhor um ritmo que tu mantém do que um que fica só no papel.`;
    case 'marcar_ontem': {
      await updateDayTask(p.ontemId, b.valor, { done: true });
      // Sobrou mais coisa de ontem? Pergunta de novo só com o que falta
      const resto = p.botoes.filter(x => x.resp === 'marcar_ontem' && x.valor !== b.valor);
      if (resto.length) _fila.unshift({ ...p, repetida: true, texto: 'Mais alguma de ontem?',
        botoes: [...resto, { label: '👍 Só essa', resp: 'so_essa' }] });
      return `✅ Marquei <strong>${_esc(b.label.replace(/^✅\s*/, ''))}</strong> como feito ontem.`;
    }
    case 'nao_fiz':
      return 'Tranquilo, hoje é outro dia 💪';
    case 'so_essa':
      return 'Fechado 👍';
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.9: CONVERSA GUIADA — entende a resposta no contexto
// ═══════════════════════════════════════════════════════════════
// Quando o Pet pergunta algo ("vi 1 treino, o que rolou?"), a próxima frase é
// RESPOSTA. Fora de contexto, "só fiz um na terça" não quer dizer nada; aqui
// quer dizer "faltei". Ele entende, pergunta o PORQUÊ (sem julgar) e só então
// age: ajusta o plano, marca o que ficou sem marcar, para de cobrar…
// Botão e texto livre caem no mesmo passo (PASSOS). Um passo devolve
// undefined quando a frase não é resposta: se parecer comando, a conversa sai
// e o roteador normal assume; senão o Pet pergunta de novo, mais curto.
let _conversa = null;   // { passo, dados, em, texto, botoes, curta, tentativas }
const CONVERSA_MS = 15 * 60000;
const CMD_RE = /^(marca\w*|agenda\w*|registra\w*|adiciona\w*|coloca|apaga\w*|remove\w*|desmarca\w*|edita\w*|reagenda\w*|mostra\w*|qual|quais|quanto|quantos|quando|cria\w*|abre|ajuda|lembra\w*|me lembra|o que)\b/i;
const pareceComando = (text) => !!text && (CMD_RE.test(String(text).trim()) || PL.DICA_LISTA.test(text) || !!PP.interpretarPreparo(text));
const diz = (html) => addMessage(html, 'bot');
const BT = (id, label) => ({ id, label });

function conversaAtiva() {
  if (_conversa && Date.now() - _conversa.em > CONVERSA_MS) _conversa = null;
  return !!_conversa;
}

// Faz a pergunta e guarda em que passo a conversa está
function perguntar(passo, texto, botoes, dados, curta = null) {
  _conversa = { passo, dados, em: Date.now(), texto, botoes, curta, tentativas: 0 };
  addChoices(texto, botoes.map(b => ({ label: b.label, action: () => continuarConversa(null, b.id, passo) })));
  return null;
}

function encerrarConversa(msg) {
  _conversa = null;
  proximoAssunto();
  return msg;
}

// Texto livre (texto) ou botão (id). Botão de uma pergunta antiga não faz nada.
async function continuarConversa(texto, id = null, passoBotao = null) {
  if (!conversaAtiva() || (passoBotao && _conversa.passo !== passoBotao)) return passoBotao ? null : undefined;
  const c = _conversa;
  c.em = Date.now();
  const r = await PASSOS[c.passo]({ id, texto: texto || '' }, c.dados);
  if (r !== undefined) return r;
  if (pareceComando(texto)) { _conversa = null; return undefined; }   // era comando novo
  // As regras não pegaram: a IA na nuvem lê a resposta e escolhe o botão certo
  if (texto && PN.nuvemLigada()) {
    const j = await PN.perguntarNuvem({
      texto, pergunta: String(c.curta || c.texto).replace(/<[^>]+>/g, ''),
      opcoes: c.botoes.map(b => ({ id: b.id, label: b.label })),
    });
    if (_conversa !== c) return null;   // a conversa mudou enquanto esperava
    if (j?.opcao && c.botoes.some(b => b.id === j.opcao)) {
      if (j.resposta) diz(_esc(String(j.resposta).slice(0, 160)));
      return PASSOS[c.passo]({ id: j.opcao, texto }, c.dados);
    }
    // A IA disse que não é resposta à pergunta (é outro pedido): sai da conversa
    if (j && j.acao !== 'responder_pergunta') {
      _conversa = null;
      // Frase falada: a IA entende o pedido direto (o regex costuma pegar só um pedaço)
      const n = await entenderNaNuvem(texto);
      return n === 'fora' ? undefined : n;
    }
  } else if (texto) {
    // Sem nuvem: se o classificador reconhece um pedido do app, também sai
    try {
      const rc = (await classificador())(texto);
      if (rc.entendeu && rc.intencao !== 'fora') { _conversa = null; return undefined; }
    } catch { /* sem classificador: segue perguntando */ }
  }
  if (PADRAO_PASSO[c.passo]) return PASSOS[c.passo]({ id: PADRAO_PASSO[c.passo], texto }, c.dados);
  if (++c.tentativas >= 2) return encerrarConversa('Tudo bem, deixa pra lá 👍 Se quiser falar disso depois, é só me chamar.');
  addChoices(`Não peguei bem 😅 ${c.curta || c.texto}`, c.botoes.map(b => ({ label: b.label, action: () => continuarConversa(null, b.id, c.passo) })));
  return null;
}

// ─── Treino: dados de apoio ──────────────────────────────────
async function freqAtual(d) {
  if (!d.f) {
    const { getPerfilTreino } = await import('./perfil-treino-ui.js');
    d.f = getPerfilTreino(await getProfile().catch(() => null)).freqSemana || 3;
  }
  return d.f;
}

const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DOW_FALA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const dataDoId = (id) => { const [y, m, d] = String(id).split('-').map(Number); return new Date(y, m - 1, d); };
const rotuloTreino = (x) => { const dt = dataDoId(x.dia); return `${x.title} · ${DOW[dt.getDay()]} ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`; };

// Treinos agendados nos últimos 14 dias que ficaram sem marcar
function treinosSemMarcar() {
  const limite = dayId(new Date(Date.now() - 14 * 86400000));
  const out = [];
  for (const dia of _ckDias) {
    if (dia.id < limite) continue;
    for (const t of dia.tasks || []) {
      if (!t.done && !t.cancelled && _CK?.TREINO_RE.test(t.title || '')) out.push({ dia: dia.id, id: t.id, title: t.title });
    }
  }
  return out.slice(-6);
}

// Média de sono (min) das últimas noites registradas, ou null
function mediaSono() {
  const porId = new Map(_ckDias.map(d => [d.id, d]));
  const noites = [];
  for (const dia of _ckDias.slice(-8)) {
    const antes = new Date(dataDoId(dia.id).getTime() - 86400000);
    const dorme = porId.get(dayId(antes))?.sleepTime;
    const mins = dia.wakeTime && dorme ? sleepDuration(dorme, dia.wakeTime) : 0;
    if (mins > 0) noites.push(mins);
  }
  return noites.length >= 2 ? Math.round(noites.reduce((a, b) => a + b, 0) / noites.length) : null;
}

// Guarda o motivo (profile.extra.faltas, últimas 20) e devolve quantas vezes o
// mesmo motivo já tinha aparecido nos últimos 30 dias
async function registrarFalta(motivo, texto) {
  try {
    const prof = await getProfile().catch(() => null);
    const faltas = Array.isArray(prof?.faltas) ? prof.faltas : [];
    const desde = Date.now() - 30 * 86400000;
    const antes = faltas.filter(x => x.motivo === motivo && new Date(x.em).getTime() >= desde).length;
    faltas.push({ em: new Date().toISOString(), motivo, texto: String(texto || '').slice(0, 140) });
    await setProfile({ faltas: faltas.slice(-20) });
    return motivo === 'outro' ? 0 : antes;
  } catch (err) {
    console.warn('[pet-conversa] falta', err);
    return 0;
  }
}

function opcoesFreq(f, comManter) {
  const ops = [f - 1, f - 2].filter(n => n >= 1).map(n => BT(String(n), `📉 ${n}× por semana`));
  return comManter ? [BT('manter', `💪 Manter ${f}×`), ...ops] : [...ops, BT(String(Math.min(7, f + 1)), `📈 ${Math.min(7, f + 1)}× por semana`)];
}

async function salvarNovaFreq(d, n) {
  const f = await freqAtual(d);
  if (n === f) return encerrarConversa(`Fechado, o plano segue <strong>${f}× por semana</strong> 💪 Tô contigo.`);
  await salvarPerfilTreino({ freqSemana: n });
  return encerrarConversa(n < f
    ? `📉 Atualizei teu perfil pra <strong>${n}× por semana</strong>. Melhor um ritmo que tu mantém do que um que fica só no papel. Quando ficar fácil, a gente sobe de novo.`
    : `📈 Atualizei teu perfil pra <strong>${n}× por semana</strong>. Bora! 💪`);
}

// ─── Treino: início (vem do check-in "ritmo" ou "parou") ─────
function iniciarConversaTreino(p) {
  const dados = { tipo: p.tipo, f: p.dados?.f, feitos: p.dados?.feitos };
  if (p.tipo === 'parou') {
    return perguntar('plano', p.texto,
      [BT('parou', '⏸️ Dei uma parada'), BT('esqueci', '✍️ Treinei, só não marquei'), BT('depois', '⏰ Depois')],
      dados, 'Tu deu uma parada ou só não tá marcando?');
  }
  return perguntar('plano', p.texto,
    [BT('faltou', '🙋 Faltei alguns'), BT('mudou', '📉 Mudei o plano'), BT('esqueci', '✍️ Treinei, só não marquei'), BT('depois', '⏰ Depois')],
    dados, 'Tu faltou alguns treinos, mudou o plano ou só não marcou?');
}

// Se a pessoa já disse o motivo junto ("faltei porque tava cansado"), não pergunta de novo
function perguntarMotivo(d, texto, pergunta) {
  const m = texto ? PC.motivoFalta(texto) : null;
  if (m) return tratarMotivo(d, m, texto);
  return perguntar('motivo', pergunta,
    [...Object.entries(PC.MOTIVOS).map(([k, v]) => BT(k, v.label)), BT('outro', '🤷 Outro')],
    d, 'O que fez tu faltar? Rotina, cansaço, preguiça, dor… sem julgamento.');
}

async function tratarMotivo(d, m, texto) {
  const f = await freqAtual(d);
  const antes = await registrarFalta(m, texto);
  const repete = antes >= 1 ? `É a ${antes + 1}ª vez no último mês que ${PC.MOTIVOS[m].nome} atrapalha. ` : '';
  switch (m) {
    case 'rotina':
      return perguntar('ajuste',
        `${repete}Rotina mudou, acontece. Melhor um plano que cabe na tua vida do que um que fica no papel. Quantas vezes por semana cabem agora?`,
        [...opcoesFreq(f, true), BT('so_semana', '🗓️ Foi só essa semana')], d,
        'Quantas vezes por semana cabem na tua rotina agora?');
    case 'cansaco': {
      const sono = mediaSono();
      const fmt = sono ? `${Math.floor(sono / 60)}h${String(sono % 60).padStart(2, '0')}` : '';
      const txtSono = !sono
        ? 'Não tenho teu sono anotado; se tu registrar a hora que dorme e acorda, eu te aviso quando ele tiver atrapalhando.'
        : sono < 420
          ? `Tua média de sono nos últimos dias foi <strong>${fmt}</strong>, abaixo das 7h. Isso derruba o treino; vale priorizar dormir mais essa semana.`
          : `Tua média de sono nos últimos dias foi <strong>${fmt}</strong>, então parece mais o dia puxado do que o sono.`;
      return perguntar('ajuste',
        `Cansaço pesa mesmo. ${txtSono} Num dia cansado, um treino mais curto ou mais leve vale mais que nenhum. ${repete}Quer manter o plano?`,
        [BT('manter', `💪 Manter ${f}×`), ...(f > 1 ? [BT(String(f - 1), `📉 Baixar pra ${f - 1}×`)] : [])], d,
        `Quer manter ${f}× por semana ou baixar um pouco?`);
    }
    case 'preguica':
      return perguntar('agendar',
        `Valeu pela sinceridade, acontece com todo mundo 🙂 O segredo é não depender da vontade: treino com dia e hora marcados vira compromisso. ` +
        (repete ? `${repete}Talvez ${f}× esteja puxado agora; baixar um pouco por um tempo ajuda a criar o hábito. ` : '') +
        'Quer que eu agende o próximo treino?',
        [BT('agendar', '📅 Agenda pra amanhã'), ...(repete && f > 1 ? [BT(String(f - 1), `📉 Baixar pra ${f - 1}×`)] : []), BT('nao', '💪 Deixa comigo')], d,
        'Quer que eu agende o próximo treino pra amanhã?');
    case 'saude':
      adiarTipos(['ritmo', 'parou'], 14);
      return encerrarConversa(`Saúde primeiro 🙏 Nada de forçar com dor. ${repete}Vou parar de te cobrar treino pelas próximas 2 semanas. Se não melhorar, vale procurar um médico ou fisio, e na volta começa mais leve.`);
    case 'imprevisto':
      return encerrarConversa(`${repete}Imprevisto acontece, não muda nada no plano 👊 ${repete ? 'Se tá acontecendo direto, vale deixar um dia de folga na semana pra encaixar o treino que caiu. ' : ''}Semana que vem é vida normal: ${f}× por semana.`);
    default:
      return perguntar('ajuste', `Entendi, obrigado por me contar 🙂 Quer manter teu plano de <strong>${f}× por semana</strong> ou ajustar?`,
        opcoesFreq(f, true), d, `Quer manter ${f}× por semana ou ajustar?`);
  }
}

// "Treinei, só não marquei": mostra os treinos sem marcar pra marcar ali mesmo
function passoMarcar(d, primeira) {
  d.pendentes = d.pendentes || treinosSemMarcar();
  const lista = d.pendentes;
  if (!lista.length) {
    return encerrarConversa(primeira
      ? 'Beleza! Não achei treino agendado sem marcar nos últimos dias. Pra marcar rápido, é só me falar <em>"fiz a academia"</em> logo depois do treino 💪'
      : 'Pronto, tudo marcado 💪 Pra próxima, é só me falar <em>"fiz a academia"</em> logo depois do treino.');
  }
  return perguntar('marcar',
    primeira ? 'Beleza! Achei estes treinos agendados que ficaram sem marcar. Quais tu fez?' : 'Mais algum?',
    [...lista.map(x => BT(`${x.dia}|${x.id}`, `✅ ${rotuloTreino(x)}`)), ...(lista.length > 1 ? [BT('todos', '✅ Todos')] : []), BT('pronto', '👍 Pronto')],
    d, 'Quais desses tu fez? Pode falar o dia, tipo "o de terça".');
}

// Resposta que ninguém entendeu, num passo onde qualquer coisa vale: usa esta opção
const PADRAO_PASSO = { motivo: 'outro' };

const PASSOS = {
  // "Mudou o plano, faltou ou não marcou?"
  async plano({ id, texto }, d) {
    const r = id ? { op: id } : PC.respostaPlano(texto);
    const f = await freqAtual(d);
    if (r.op === 'faltou' && r.feitos != null && r.feitos >= f) r.op = 'esqueci';   // fez tudo: só não marcou
    switch (r.op) {
      case 'depois':
        adiarTipos([d.tipo], _CK.ADIA[d.tipo]);
        return encerrarConversa('Combinado, deixo isso pra depois 👍');
      case 'esqueci':
        return passoMarcar(d, true);
      case 'mudou':
        if (r.novo) return salvarNovaFreq(d, r.novo);
        return perguntar('ajuste', 'Beleza. Quantas vezes por semana tu vai treinar agora?', opcoesFreq(f, false), d);
      case 'parou':
        await salvarPerfilTreino({ pausa: 'menos1m' });
        diz('⏸️ Anotei no teu perfil que tu deu uma parada. A volta começa mais leve.');
        return perguntarMotivo(d, texto, 'Sem julgamento, tô aqui pra te ajudar a voltar, não pra cobrar 🙂 O que fez tu parar? Pode ser sincero.');
      case 'faltou': {
        if (!id) {
          let ack = r.feitos != null
            ? `Entendi: foram <strong>${r.feitos} de ${f}</strong>. Então o plano continua o mesmo, tu só faltou ${f - r.feitos === 1 ? '1 dia' : `${f - r.feitos} dias`}.`
            : 'Entendi: o plano continua o mesmo, tu só faltou alguns dias.';
          if (r.hoje) ack += ' E boa que hoje tem treino 💪 Quando terminar, me fala <em>"fiz a academia"</em> que eu marco.';
          diz(ack);
        }
        return perguntarMotivo(d, texto, 'Sem julgamento, tô aqui pra te ajudar a manter o ritmo, não pra cobrar 🙂 O que levou tu a faltar? Pode ser sincero.');
      }
      default:
        return undefined;
    }
  },

  // "O que levou tu a faltar?" Sem palavra-chave, a IA na nuvem tenta; senão vira "outro" (PADRAO_PASSO)
  async motivo({ id, texto }, d) {
    const m = id || PC.motivoFalta(texto);
    if (!m) return undefined;
    return tratarMotivo(d, m, texto);
  },

  // Quantas vezes por semana (ou manter)
  async ajuste({ id, texto }, d) {
    const f = await freqAtual(d);
    if (id === 'so_semana' || (!id && /\b(so essa semana|so esta semana|foi so essa|semana atipica)\b/.test(PC.norm(texto)))) {
      return encerrarConversa(`Fechado, foi só uma semana fora da curva. O plano segue <strong>${f}× por semana</strong> 💪`);
    }
    if (id === 'manter' || (!id && PC.querManter(texto))) return salvarNovaFreq(d, f);
    const n = id ? Number(id) : PC.numeroPorSemana(texto);
    if (n) return salvarNovaFreq(d, n);
    return undefined;
  },

  // "Quer que eu agende o próximo treino?"
  async agendar({ id, texto }, d) {
    if (/^\d$/.test(id || '')) return salvarNovaFreq(d, Number(id));
    const sn = id ? (id === 'agendar') : PC.simNao(texto);
    if (sn === true || (!id && /\bagend/.test(PC.norm(texto)))) {
      _conversa = null;
      // Usa a atividade de treino que a pessoa já tem (ex.: "Musculação"); sem nenhuma, o fluxo normal oferece criar
      const cats = await getCategories().catch(() => []);
      const nome = cats.find(c => _CK?.TREINO_RE.test(c.name || ''))?.name || 'Academia';
      return routeCommand(`agendar atividade ${nome} amanhã`);
    }
    if (sn === false || (!id && /\b(deixa comigo|eu me viro|eu vou|pode deixar)\b/.test(PC.norm(texto)))) {
      return encerrarConversa('Fechado, confio em ti 💪 Quando treinar, me fala <em>"fiz a academia"</em> que eu marco.');
    }
    return undefined;
  },

  // Marcar os treinos que ficaram sem marcar
  async marcar({ id, texto }, d) {
    const t = PC.norm(texto);
    if (id === 'pronto' || (!id && (PC.simNao(texto) === false || /\b(pronto|so isso|so esse|so esses|nenhum mais|mais nenhum|era so)\b/.test(t)))) {
      return encerrarConversa('Fechado 👍 Pra próxima, é só me falar <em>"fiz a academia"</em> logo depois do treino.');
    }
    let alvos;
    if (id === 'todos' || (!id && /\b(todos|todas|tudo)\b/.test(t))) alvos = d.pendentes;
    else if (id) alvos = d.pendentes.filter(x => `${x.dia}|${x.id}` === id);
    else {
      const dias = [...t.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/g)].map(m => DOW_FALA[m[1]]);
      alvos = d.pendentes.filter(x => dias.includes(dataDoId(x.dia).getDay()));
    }
    if (!alvos.length) return undefined;
    for (const x of alvos) await updateDayTask(x.dia, x.id, { done: true });
    d.pendentes = d.pendentes.filter(x => !alvos.includes(x));
    diz(`✅ Marquei como feito: ${alvos.map(x => `<strong>${_esc(rotuloTreino(x))}</strong>`).join(', ')}.`);
    return passoMarcar(d, false);
  },
};

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.10: NOTA DE ONTEM PELO PET
// ═══════════════════════════════════════════════════════════════
// Check-in "nota": a nota de ontem ficou em branco (ou sem a hora de dormir).
// Check-in "nota_hoje": a partir das 21h, a nota de hoje (fechar o dia).
// O Pet pergunta uma coisa por vez, do jeito do modal da nota (tela-ritual.js):
// orgulho/falha → o que melhorar → hora de dormir (+ cochilo e madrugada).
// A pessoa pode falar tudo do sono numa frase só; no fim um card confirma e
// grava no mesmo lugar da tela (days.meta.dayNote + sleepTime).
const ehComandoCurto = (texto) => pareceComando(texto) && String(texto).trim().split(/\s+/).length <= 6;
// Pedido novo no meio da nota ("pode mudar a academia de hoje pra sexta"): não é resposta
const PEDIDO_RE = /\b(muda|mudar|mude|troca|trocar|troque|passa|passar|passe|remarca\w*|cancela\w*|agenda\w*|desmarca\w*|adiciona\w*|apaga\w*|marca|marcar|marque|cria|criar|crie|lembra|lembrar|lembre)\b/;
const ehPedido = (texto) => {
  // "eu preciso que tu troque…", "olha, queria que tu marcasse…"
  const t = PC.norm(texto).replace(/^(?:(?:eu|olha|entao|ai|tipo)[\s,]+)+/, '');
  return /^(pode|podes|consegue|preciso que|quero que|queria que|da pra|tem como|me ajuda)\b/.test(t) ||
    PEDIDO_RE.test(t.split(/\s+/).slice(0, 6).join(' ')) || ehComandoCurto(texto);
};
const PULAR = BT('pular', '⏭️ Pular');

function iniciarConversaNota(p) {
  const dados = { tipo: p.tipo, diaId: p.ontemId, ...(p.dados || {}) };
  return perguntar('nota_inicio', p.texto, [BT('bora', '📝 Bora'), BT('depois', '⏰ Depois')], dados, `Bora preencher a nota de ${qualDia(dados)}?`);
}

const qualDia = (d) => d.hoje ? 'hoje' : (d.rotulo || 'ontem');

function perguntarOrgulho(d) {
  d.textoFeito = true;
  return perguntar('nota_orgulho', `Do que tu te orgulha de ${qualDia(d)} e onde falhou?`, [PULAR], d,
    `Me conta: do que tu te orgulha de ${qualDia(d)} e onde falhou?`);
}
function perguntarMelhorar(d) {
  const quando = d.hoje ? 'amanhã' : d.rotulo && d.rotulo !== 'ontem' ? 'nos próximos dias' : 'hoje';
  return perguntar('nota_melhorar', `E quais medidas tu vai tomar pra fazer melhor ${quando}?`, [PULAR], d,
    `O que tu vai fazer diferente ${quando}?`);
}
async function perguntarSono(d) {
  if (!d.semSono || d.dormiu) return perguntarExtra(d);
  const prof = await getProfile().catch(() => null);
  d.padrao = prof?.defaultSleepTime || '';
  return perguntar('nota_sono',
    'Que horas tu foi dormir ontem? Se tirou cochilo de dia ou ficou acordado de madrugada, me conta junto. Tipo <em>"dormi 23h30, cochilei 20 min e fiquei 1h acordado"</em>.',
    [...(d.padrao ? [BT('padrao', `🛏️ No horário de sempre (${d.padrao})`)] : []), PULAR], d,
    'Que horas tu foi dormir ontem?');
}
function perguntarExtra(d) {
  const falta = [d.cochiloMin == null && `cochilou de dia${d.hoje ? ' hoje' : ''}`, d.madrugadaMin == null && `ficou acordado de madrugada${d.hoje ? ' (na noite passada)' : ''}`].filter(Boolean);
  if (!falta.length) return fecharNota(d);
  return perguntar('nota_extra', `E tu ${falta.join(' ou ')}? Se sim, quanto tempo?`, [BT('nenhum', '🙅 Não')], d,
    `Tu ${falta.join(' ou ')}? Quanto tempo?`);
}

// Falou do sono primeiro: ainda pergunta o orgulho/melhorar antes do card
function fecharNota(d) {
  if (d.semNota && !d.textoFeito) return perguntarOrgulho(d);
  return mostrarCardNota(d);
}

const dataCurta = (id) => { const dt = dataDoId(id); return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`; };

function mostrarCardNota(d) {
  const linhas = [];
  if (d.prideFail) linhas.push(`🏆 <strong>Orgulho e falha:</strong> ${_esc(d.prideFail)}`);
  if (d.improve) linhas.push(`🎯 <strong>Melhorar:</strong> ${_esc(d.improve)}`);
  if (d.dormiu) linhas.push(`🌙 <strong>Dormiu:</strong> ${d.dormiu}`);
  if (d.cochiloMin != null) linhas.push(`☀️ <strong>Cochilo de dia:</strong> ${PNT.fmtMin(d.cochiloMin)}`);
  if (d.madrugadaMin != null) linhas.push(`🌌 <strong>Acordado de madrugada:</strong> ${PNT.fmtMin(d.madrugadaMin)}`);
  if (!linhas.length) return encerrarConversa('Tranquilo, não anotei nada. Quando quiser, é só me falar 👍');
  return perguntar('nota_confirmar', `📝 Nota de ${qualDia(d)} (${dataCurta(d.diaId)}):<br>${linhas.join('<br>')}<br><br>Salvo assim?`,
    [BT('salvar', '✅ Salvar'), BT('refazer', '✏️ Refazer'), BT('cancelar', '❌ Cancelar')], d, 'Salvo a nota assim?');
}

async function salvarNotaOntem(d) {
  const dia = await getDay(d.diaId).catch(() => null);
  const patch = {};
  const temNota = d.prideFail || d.improve || d.cochiloMin != null || d.madrugadaMin != null;
  if (temNota) {
    const nota = { ...(dia?.dayNote || {}) };
    if (d.prideFail) nota.prideFail = d.prideFail;
    if (d.improve) nota.improve = d.improve;
    if (d.cochiloMin != null) { nota.daySleepMinutes = d.cochiloMin; nota.daySleepHours = Math.round(d.cochiloMin / 60 * 10) / 10; }
    if (d.madrugadaMin != null) { nota.nightAwakeMinutes = d.madrugadaMin; nota.nightAwakeHours = Math.round(d.madrugadaMin / 60 * 10) / 10; }
    nota.registeredAt = new Date().toISOString();
    patch.dayNote = nota;
  }
  if (d.dormiu) patch.sleepTime = d.dormiu;
  await setDayMeta(d.diaId, patch);
}

Object.assign(PASSOS, {
  async nota_inicio({ id, texto }, d) {
    const sn = id ? (id === 'bora') : PC.simNao(texto);
    if (id === 'depois' || sn === false || (!id && /\b(depois|agora nao|mais tarde)\b/.test(PC.norm(texto)))) {
      if (_CK?.ADIA?.[d.tipo]) adiarTipos([d.tipo], _CK.ADIA[d.tipo]);
      return encerrarConversa('Combinado, deixo pra depois 👍');
    }
    if (sn === true) return d.semNota ? perguntarOrgulho(d) : perguntarSono(d);
    // Já respondeu direto ("me orgulho de…" / "dormi 23h")
    if (texto && !ehPedido(texto)) {
      const sono = PNT.lerSono(texto);
      if (sono.dormiu || sono.cochiloMin != null || sono.madrugadaMin != null) return PASSOS.nota_sono({ texto }, d);
      if (d.semNota && texto.trim().split(/\s+/).length >= 4) return PASSOS.nota_orgulho({ texto }, d);
    }
    return undefined;
  },

  async nota_orgulho({ id, texto }, d) {
    if (id !== 'pular') {
      if (!texto.trim() || ehPedido(texto)) return undefined;
      d.prideFail = texto.trim().slice(0, 1000);
    }
    return perguntarMelhorar(d);
  },

  async nota_melhorar({ id, texto }, d) {
    if (id !== 'pular') {
      if (!texto.trim() || ehPedido(texto)) return undefined;
      d.improve = texto.trim().slice(0, 1000);
    }
    return perguntarSono(d);
  },

  async nota_sono({ id, texto }, d) {
    if (id === 'pular') return perguntarExtra(d);
    if (id === 'padrao') { d.dormiu = d.padrao; return perguntarExtra(d); }
    const sono = PNT.lerSono(texto);
    if (!sono.dormiu && sono.cochiloMin == null && sono.madrugadaMin == null) {
      if (!id && /\b(de sempre|horario de sempre|mesmo horario|normal)\b/.test(PC.norm(texto)) && d.padrao) { d.dormiu = d.padrao; return perguntarExtra(d); }
      return undefined;
    }
    if (sono.dormiu) d.dormiu = sono.dormiu;
    if (sono.cochiloMin != null) d.cochiloMin = sono.cochiloMin;
    if (sono.madrugadaMin != null) d.madrugadaMin = sono.madrugadaMin;
    if (!d.dormiu && d.semSono) {
      return perguntar('nota_sono', 'Anotado. E que horas tu foi dormir?', [...(d.padrao ? [BT('padrao', `🛏️ No horário de sempre (${d.padrao})`)] : []), PULAR], d, 'Que horas tu foi dormir ontem?');
    }
    return perguntarExtra(d);
  },

  async nota_extra({ id, texto }, d) {
    const zera = () => { if (d.cochiloMin == null) d.cochiloMin = 0; if (d.madrugadaMin == null) d.madrugadaMin = 0; };
    if (id === 'nenhum') { zera(); return fecharNota(d); }
    const sono = PNT.lerSono(texto);
    if (sono.cochiloMin != null) d.cochiloMin = sono.cochiloMin;
    if (sono.madrugadaMin != null) d.madrugadaMin = sono.madrugadaMin;
    if (sono.cochiloMin != null || sono.madrugadaMin != null) { zera(); return fecharNota(d); }
    if (PC.simNao(texto) === false || /\b(nenhum|nada|nem um nem outro|dormi direto|direto)\b/.test(PC.norm(texto))) { zera(); return fecharNota(d); }
    return undefined;
  },

  async nota_confirmar({ id, texto }, d) {
    const sn = id ? (id === 'salvar') : PC.simNao(texto);
    if (id === 'refazer' || (!id && /\b(refaz\w*|corrig\w*|muda\w*|errado)\b/.test(PC.norm(texto)))) {
      for (const k of ['prideFail', 'improve', 'dormiu', 'cochiloMin', 'madrugadaMin', 'textoFeito']) delete d[k];
      return d.semNota ? perguntarOrgulho(d) : perguntarSono(d);
    }
    if (id === 'cancelar' || sn === false) return encerrarConversa('Beleza, não salvei nada 👍');
    if (sn !== true) return undefined;
    try {
      await salvarNotaOntem(d);
    } catch (err) {
      console.warn('[pet-nota]', err);
      return encerrarConversa('Não consegui salvar agora 😕 Tenta de novo daqui a pouco.');
    }
    const sono = d.dormiu ? ` ${d.hoje ? 'Anotei que tu vai dormir' : 'Tu dormiu'} às <strong>${d.dormiu}</strong>.` : '';
    return encerrarConversa(d.hoje
      ? `✅ Nota de hoje salva!${sono} Dia fechado, bom descanso 🌙`
      : `✅ Nota de ontem salva!${sono} Bora fazer de hoje um dia melhor 💪`);
  },
});

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.11: RITUAL PELO PET — água, acordei/dormi, nota de qualquer dia,
// excluir tarefa, feito em outro dia e "o que tenho sexta?"
// Quem entende a frase é o pet-ritual.js; aqui busca, mostra o card e grava.
// Devolve undefined quando a frase não é disso (o roteador segue).
// ═══════════════════════════════════════════════════════════════
const _hojeId = () => dayId(new Date());
const _dataDoId = (id) => { const [y, m, d] = id.split('-').map(Number); return new Date(y, m - 1, d); };
// "de hoje", "de ontem", "de sex 09/10"
const _de = (d) => `de ${PR.nomeDia(d)}`;

async function tentarRitual(text) {
  const t = PR.semPedido(text);
  const nota = PR.lerNota(t);
  if (nota) return ritualNota(t, nota);
  const agua = PR.lerAgua(t);
  if (agua) return ritualAgua(t, agua);
  if (PR.lerSonoDoDia(t)) { const r = await ritualSono(t); if (r !== undefined) return r; }
  const exc = PR.lerExcluir(t);
  if (exc) { const r = await ritualExcluir(t, exc); if (r !== undefined) return r; }
  const feito = PR.lerFeito(t);
  if (feito) {
    const { data, dito } = PR.diaDaFrase(t);
    if (dito && PR.isoDia(data) !== _hojeId()) { const r = await ritualFeito(t, feito, data); if (r !== undefined) return r; }
  }
  const cons = PR.lerConsultaAgenda(t);
  if (cons) return ritualConsulta(t, cons);
  return undefined;
}

// ── Água ──
async function ritualAgua(t, { ml, modo }) {
  const { data } = PR.diaDaFrase(t);
  if (PR.isoDia(data) > _hojeId()) return 'Água eu só anoto de hoje pra trás 😉';
  if (ml == null) return 'Quanto tu bebeu? Ex.: <em>"bebi 500 ml"</em> ou <em>"tomei 2 copos"</em> (1 copo = 250 ml).';
  if (ml > 8000) return `${ml} ml é muita água 😅 Confere o valor e me fala de novo?`;
  const id = PR.isoDia(data);
  const dia = await getDay(id).catch(() => null);
  const atual = dia?.hydrationMl || 0, meta = dia?.hydrationGoal || 2000;
  const novo = modo === 'somar' ? atual + ml : modo === 'tirar' ? Math.max(0, atual - ml) : ml;
  const verbo = modo === 'somar' ? `Somar <b>${ml} ml</b> na água ${_de(data)}`
    : modo === 'tirar' ? `Tirar <b>${ml} ml</b> da água ${_de(data)}`
    : `Deixar a água ${_de(data)} em <b>${ml} ml</b>`;
  cardConfirmarLista(`💧 ${verbo}?<br>${atual} → <b>${novo} ml</b> (meta ${meta} ml)`, async () => {
    await setDayMeta(id, { hydrationMl: novo });
    const falta = meta - novo;
    return falta > 0 ? `✅ Anotado: ${novo} ml ${_de(data)}. Faltam ${falta} ml pra meta.` : `✅ Anotado: ${novo} ml ${_de(data)}. Meta batida! 🎉`;
  }, null);
  return null;
}

// ── Acordei / dormi / cochilo / madrugada ──
async function ritualSono(t) {
  const { data, dito } = PR.diaDaFrase(t);
  const ts = PR.semAcento(t);
  const sono = PNT.lerSono(t);
  // "acordei 6h30": a hora sozinha não é hora de dormir
  if (!/\b(dorm\w*|deitei|cama|peguei no sono|apaguei|capotei)\b/.test(ts)) sono.dormiu = null;
  const acordou = /\b(acordei|levantei|despertei)\b/.test(ts) && !/madrugada|de noite|no meio da noite/.test(ts) ? extractTime(t) : null;
  if (!acordou && !sono.dormiu && sono.cochiloMin == null && sono.madrugadaMin == null) return undefined;
  if (PR.isoDia(data) > _hojeId()) return 'Sono eu só anoto de hoje pra trás 😉';
  const patches = {};   // id do dia → patch
  const linhas = [];
  const add = (id, p) => { patches[id] = { ...(patches[id] || {}), ...p }; };
  if (acordou) { add(PR.isoDia(data), { wakeTime: acordou }); linhas.push(`☀️ Acordou às <b>${acordou}</b> ${_de(data)}`); }
  if (sono.dormiu) {
    // "dormi às 23h" de manhã/tarde = a noite de ontem. Dito o dia, vale ele.
    const noite = new Date(data);
    if (!dito && new Date().getHours() < 18) noite.setDate(noite.getDate() - 1);
    add(PR.isoDia(noite), { sleepTime: sono.dormiu });
    linhas.push(`🌙 Dormiu às <b>${sono.dormiu}</b> (noite ${_de(noite)})`);
  }
  const notaDia = PR.isoDia(data);
  if (sono.cochiloMin != null) linhas.push(`😴 Cochilo ${_de(data)}: <b>${PNT.fmtMin(sono.cochiloMin)}</b>`);
  if (sono.madrugadaMin != null) linhas.push(`🌌 Acordado de madrugada ${_de(data)}: <b>${PNT.fmtMin(sono.madrugadaMin)}</b>`);
  cardConfirmarLista(`🛌 Anotar no Ritual?<br>${linhas.join('<br>')}`, async () => {
    if (sono.cochiloMin != null || sono.madrugadaMin != null) {
      const dia = await getDay(notaDia).catch(() => null);
      const nota = { ...(dia?.dayNote || {}) };
      if (sono.cochiloMin != null) { nota.daySleepMinutes = sono.cochiloMin; nota.daySleepHours = Math.round(sono.cochiloMin / 60 * 10) / 10; }
      if (sono.madrugadaMin != null) { nota.nightAwakeMinutes = sono.madrugadaMin; nota.nightAwakeHours = Math.round(sono.madrugadaMin / 60 * 10) / 10; }
      nota.registeredAt = new Date().toISOString();
      add(notaDia, { dayNote: nota });
    }
    for (const [id, p] of Object.entries(patches)) await setDayMeta(id, p);
    return '✅ Anotado no Ritual.';
  }, null);
  return null;
}

// ── Nota de qualquer dia ──
async function ritualNota(t, nota) {
  const { data } = PR.diaDaFrase(t);
  const id = PR.isoDia(data);
  if (id > _hojeId()) return 'A nota é do dia que já passou (ou de hoje). Pra lembrar de algo no futuro, agenda uma tarefa 😉';
  const dia = await getDay(id).catch(() => null);
  if (nota.apagar) {
    if (!PNT.notaDoDia(dia).temNota) return `A nota ${_de(data)} já está em branco.`;
    cardConfirmarLista(`🗑️ Apagar a nota ${_de(data)}?`, async () => {
      await setDayMeta(id, { dayNote: null });
      return `✅ Apaguei a nota ${_de(data)}.`;
    }, null);
    return null;
  }
  if (nota.abrir) {
    const n = PNT.notaDoDia(dia);
    iniciarConversaNota({ tipo: 'nota_pedida', ontemId: id, texto: `Bora preencher a nota ${_de(data)}? Te faço umas perguntas rápidas, uma por vez.`,
      dados: { semNota: !n.temTexto, semSono: !n.temSono, hoje: id === _hojeId(), rotulo: PR.nomeDia(data) } });
    return null;
  }
  const rotulo = nota.campo === 'improve' ? 'O que melhorar' : 'Orgulho e falha';
  const antes = String(dia?.dayNote?.[nota.campo] || '').trim();
  const novo = antes ? `${antes}\n${nota.conteudo}` : nota.conteudo;
  cardConfirmarLista(`📝 Nota ${_de(data)} · <b>${rotulo}</b>:<br>${antes ? `<em>${_esc(antes)}</em><br>+ ` : ''}${_esc(nota.conteudo)}`, async () => {
    const atual = await getDay(id).catch(() => null);
    await setDayMeta(id, { dayNote: { ...(atual?.dayNote || {}), [nota.campo]: novo.slice(0, 1000), registeredAt: new Date().toISOString() } });
    return `✅ Anotado na nota ${_de(data)}.`;
  }, null);
  return null;
}

// ── Excluir tarefa (só esse dia ou todas as repetições) ──
const _ehRecorrente = (tk) => !!(tk.recurrenceGroupId || (tk.recurrenceType && tk.recurrenceType !== 'today'));
async function ritualExcluir(t, { todas }) {
  const { data } = PR.diaDaFrase(t, new Date(), 'futuro');
  const id = PR.isoDia(data);
  const tasks = await getDayTasks(id).catch(() => []);
  const achados = PR.acharTarefas(tasks, t);
  if (!achados.length) return undefined;   // pode ser item de lista: o roteador segue
  const confirmar = (tk) => {
    if (_ehRecorrente(tk) && !todas) {
      addChoices(`<b>${_esc(tk.title)}</b> se repete. Apago só ${_de(data)} ou todas daqui pra frente?`, [
        { label: `Só ${PR.nomeDia(data)}`, action: () => { cardExcluir(tk, id, data, false); return null; } },
        { label: '🔁 Todas daqui pra frente', action: () => { cardExcluir(tk, id, data, true); return null; } },
      ]);
      return null;
    }
    cardExcluir(tk, id, data, todas && _ehRecorrente(tk));
    return null;
  };
  if (achados.length === 1) return confirmar(achados[0]);
  addChoices('Achei mais de uma. Qual eu apago?', achados.slice(0, 8).map(tk => ({
    label: `${tk.startTime ? tk.startTime + ' · ' : ''}${tk.title}`, action: () => confirmar(tk) })));
  return null;
}

function cardExcluir(tk, id, data, todas) {
  cardConfirmarLista(todas
    ? `🗑️ Apagar <b>${_esc(tk.title)}</b> de ${PR.nomeDia(data)} em diante (todas as repetições)?<br><small>Os dias que já passaram ficam como estão.</small>`
    : `🗑️ Apagar <b>${_esc(tk.title)}</b>${tk.startTime ? ' ' + tk.startTime : ''} ${_de(data)}?`, async () => {
    if (!todas) {
      await apagarSoEsseDia(tk, id);
      return `✅ Apaguei <strong>${_esc(tk.title)}</strong> ${_de(data)}.`;
    }
    const n = await apagarTodasRepeticoes(tk, data);
    return `✅ Apaguei <strong>${_esc(tk.title)}</strong> de ${n} dia${n === 1 ? '' : 's'} e tirei da repetição.`;
  }, null);
}

// Igual ao "só este dia" do Ritual: apaga e marca o dia pra repetição não recriar
async function apagarSoEsseDia(tk, id) {
  await deleteDayTask(id, tk.id);
  if (!_ehRecorrente(tk)) return;
  const dia = await getDay(id).catch(() => null);
  const grupos = Array.isArray(dia?.excludedRecurrenceGroups) ? dia.excludedRecurrenceGroups.slice() : [];
  const titulos = Array.isArray(dia?.excludedRecurrenceTitles) ? dia.excludedRecurrenceTitles.slice() : [];
  if (tk.recurrenceGroupId) { if (!grupos.includes(tk.recurrenceGroupId)) grupos.push(tk.recurrenceGroupId); }
  else { const k = `${(tk.title || '').trim().toLowerCase()}::${tk.categoryId || ''}`; if (!titulos.includes(k)) titulos.push(k); }
  await setDayMeta(id, { excludedRecurrenceGroups: grupos, excludedRecurrenceTitles: titulos });
}

// Igual ao "todas" do Ritual: apaga do dia em diante (1 ano) e tira dos modelos
// da semana, dos mensais e das regras de repetição do Pet
async function apagarTodasRepeticoes(tk, data) {
  const titulo = (tk.title || '').trim().toLowerCase(), cat = tk.categoryId || '', grupo = tk.recurrenceGroupId || '';
  const bate = (x) => (grupo && (x.recurrenceGroupId === grupo || x.groupId === grupo)) ||
    ((x.title || '').trim().toLowerCase() === titulo && (x.categoryId || '') === cat);
  const fim = new Date(data); fim.setDate(fim.getDate() + 365);
  const dias = await fetchDaysRange(data, fim);
  let n = 0;
  for (const d of dias) for (const x of d.tasks || []) if (!x.done && bate(x)) { try { await deleteDayTask(d.id, x.id); n++; } catch { /* segue */ } }
  // Tudo num setProfile só (modelos da semana + mensais + regras do Pet)
  const prof = await getProfile().catch(() => null);
  const patch = {};
  const tpls = { ...(prof?.weekdayTemplates || {}) };
  let mudouTpl = false;
  for (const dow of Object.keys(tpls)) {
    const arr = Array.isArray(tpls[dow]) ? tpls[dow] : [];
    const filtrado = arr.filter(x => !bate(x));
    if (filtrado.length !== arr.length) { tpls[dow] = filtrado; mudouTpl = true; }
  }
  if (mudouTpl) patch.weekdayTemplates = tpls;
  const mensais = Array.isArray(prof?.monthlyCommitments) ? prof.monthlyCommitments : [];
  if (mensais.some(bate)) patch.monthlyCommitments = mensais.filter(x => !bate(x));
  const regras = Array.isArray(prof?.recurrenceRules) ? prof.recurrenceRules : [];
  if (regras.some(bate)) patch.recurrenceRules = regras.filter(x => !bate(x));
  if (Object.keys(patch).length) await setProfile(patch);
  return Math.max(n, 1);
}

// ── Marcar / desmarcar feito em outro dia ──
async function ritualFeito(t, acao, data) {
  if (PR.isoDia(data) > _hojeId()) return 'Esse dia ainda não chegou 😉 Dá pra marcar como feito de hoje pra trás.';
  const id = PR.isoDia(data);
  const tasks = await getDayTasks(id).catch(() => []);
  const achados = PR.acharTarefas(tasks, t, tk => !tk.cancelled && !!tk.done === (acao === 'desmarcar'));
  if (!achados.length) {
    const ja = PR.acharTarefas(tasks, t, tk => !tk.cancelled);
    if (ja.length) return `<strong>${_esc(ja[0].title)}</strong> ${_de(data)} já está ${acao === 'marcar' ? 'feita ✅' : 'sem o feito'}.`;
    return undefined;
  }
  const confirmar = (tk) => {
    cardConfirmarLista(`${acao === 'marcar' ? '✅ Marcar' : '↩️ Desmarcar'} <b>${_esc(tk.title)}</b> ${_de(data)}${acao === 'marcar' ? ' como feita' : ''}?`, async () => {
      await updateDayTask(id, tk.id, { done: acao === 'marcar' });
      return acao === 'marcar' ? `✅ Marquei <strong>${_esc(tk.title)}</strong> ${_de(data)}.` : `↩️ Desmarquei <strong>${_esc(tk.title)}</strong> ${_de(data)}.`;
    }, null);
    return null;
  };
  if (achados.length === 1) return confirmar(achados[0]);
  addChoices('Achei mais de uma. Qual?', achados.slice(0, 8).map(tk => ({
    label: `${tk.startTime ? tk.startTime + ' · ' : ''}${tk.title}`, action: () => confirmar(tk) })));
  return null;
}

// ── "O que tenho sexta?", "o que eu fiz ontem", "compromissos da semana" ──
const _linhaTarefa = (tk) => `${tk.cancelled ? '🚫' : tk.done ? '✅' : '⬜'} ${tk.startTime ? `<b>${tk.startTime.slice(0, 5)}</b> ` : ''}${tk.cancelled ? `<s>${_esc(tk.title)}</s>` : _esc(tk.title)}`;
const _ordemHora = (a, b) => String(a.startTime || '99').localeCompare(String(b.startTime || '99'));
async function ritualConsulta(t, { semana, proxima }) {
  const ts = PR.semAcento(t);
  const soCompromisso = /\bcompromissos?\b/.test(ts);
  if (semana) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ini = new Date(hoje);
    ini.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7) + (proxima ? 7 : 0));
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    const dias = (await fetchDaysRange(ini, fim)).sort((a, b) => a.id.localeCompare(b.id));
    const blocos = [];
    for (const d of dias) {
      const tks = (d.tasks || []).filter(tk => !soCompromisso || tk.kind === 'commitment').sort(_ordemHora);
      if (!tks.length) continue;
      const feitas = tks.filter(tk => tk.done).length;
      const mostrar = soCompromisso ? tks : tks.filter(tk => tk.kind === 'commitment' || tk.startTime);
      blocos.push(`<b>${PR.nomeDia(_dataDoId(d.id))}</b>${soCompromisso ? '' : ` · ${feitas}/${tks.length} feitas`}${mostrar.length ? '<br>' + mostrar.slice(0, 6).map(_linhaTarefa).join('<br>') : ''}`);
    }
    const titulo = `📅 <strong>${soCompromisso ? 'Compromissos' : 'Tua agenda'} ${proxima ? 'da semana que vem' : 'da semana'}</strong>`;
    return blocos.length ? `${titulo}<br><br>${blocos.join('<br><br>')}` : `${titulo}<br>Nada marcado ainda.`;
  }
  const passado = /\b(fiz|fez|foi|fizeram)\b/.test(ts);
  const { data } = PR.diaDaFrase(t, new Date(), passado ? 'passado' : 'futuro');
  const id = PR.isoDia(data);
  const tks = (await getDayTasks(id).catch(() => [])).filter(tk => !soCompromisso || tk.kind === 'commitment').sort(_ordemHora);
  const nome = PR.nomeDia(data);
  if (!tks.length) return `Nada ${soCompromisso ? 'de compromisso ' : ''}marcado ${/^(hoje|ontem|amanhã)$/.test(nome) ? nome : 'em ' + nome}.`;
  const feitas = tks.filter(tk => tk.done).length;
  return `📅 <strong>${soCompromisso ? 'Compromissos' : 'Agenda'} ${_de(data)}</strong> · ${feitas}/${tks.length} feitas<br>${tks.map(_linhaTarefa).join('<br>')}`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8.12: CONTAS A PAGAR EM LOTE
// ═══════════════════════════════════════════════════════════════
// Cada item vira compromisso da atividade "Contas a pagar" (descrição = nome
// da conta), todo mês no mesmo dia e com lembrete. O que já está agendado
// (regra, mensal ou tarefa do próximo dia) é pulado. Outra conta no mesmo dia
// com outro nome ("Faculdade" x "FIAP") vem desmarcada no card pra pessoa decidir.
async function tentarContasLote(text) {
  const itens = PCT.lerLoteDeContas(text);
  if (!itens) return undefined;
  const prof = await getProfile().catch(() => null);
  const regras = (Array.isArray(prof?.recurrenceRules) ? prof.recurrenceRules : []).filter(r => r.freq === 'monthly');
  const mensais = Array.isArray(prof?.monthlyCommitments) ? prof.monthlyCommitments : [];
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const anchor = dayId(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const linhas = [];
  for (const it of itens) {
    const data = nextOccurrence({ freq: 'monthly', interval: 1, dayOfMonth: it.dia, anchor }, hoje);
    const tasks = await getDayTasks(dayId(data)).catch(() => []);
    const doDia = [...regras.filter(r => r.dayOfMonth === it.dia), ...mensais.filter(m => m.dayOfMonth === it.dia), ...(tasks || [])];
    const jaTem = [...regras, ...mensais, ...(tasks || [])].some(x => PCT.mesmaConta(it.nome, x));
    const outras = [...new Set(doDia.filter(x => PCT.ehContaAPagar(x) && x.desc && !PCT.mesmaConta(it.nome, x)).map(x => x.desc.trim()))];
    linhas.push({ ...it, data, jaTem, outras });
  }
  const novas = linhas.filter(l => !l.jaTem);
  if (!novas.length) return `Todas essas contas já estão agendadas ✅ (${linhas.map(l => _esc(l.nome)).join(', ')}).`;
  cardContasLote(linhas);
  return null;
}

function cardContasLote(linhas) {
  const box = document.getElementById('pet-messages');
  if (!box) return;
  const dd = (n) => String(n).padStart(2, '0');
  const div = document.createElement('div');
  div.className = 'pet-msg pet-msg-bot';
  div.innerHTML = `<span class="pet-preview-card">
      <span class="pet-preview-title">💸 Criar <strong>Contas a pagar</strong> (compromisso), todo mês no mesmo dia e com lembrete?</span>
      <span class="pet-contas-lista">${linhas.map((l, i) => l.jaTem
        ? `<span class="pet-conta pet-conta-ja">✔️ ${_esc(l.nome)} · dia ${dd(l.dia)} <em>já agendada</em></span>`
        : `<label class="pet-conta"><input type="checkbox" data-i="${i}" ${l.outras.length ? '' : 'checked'}> ${_esc(l.nome)} · dia ${dd(l.dia)}${l.outras.length ? ` <em>dia ${dd(l.dia)} já tem: ${l.outras.map(_esc).join(', ')}. É a mesma?</em>` : ''}</label>`).join('')}</span>
      <button class="pet-reg-btn" data-ok>✅ Criar</button>
      <button class="pet-choice-btn" data-nao>Cancelar</button>
    </span>`;
  const ok = div.querySelector('[data-ok]'), nao = div.querySelector('[data-nao]');
  ok.addEventListener('click', async () => {
    const marcadas = [...div.querySelectorAll('input[data-i]:checked')].map(c => linhas[Number(c.dataset.i)]);
    if (!marcadas.length) { addMessage('Marca pelo menos uma conta 🙂', 'bot'); return; }
    ok.disabled = nao.disabled = true; ok.textContent = 'Criando…';
    div.querySelectorAll('input[data-i]').forEach(c => { c.disabled = true; });
    const feitas = [];
    try {
      for (const l of marcadas) {
        const grpId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const cat = await executeRegistro(PCT.TITULO_CONTA, false, l.data, '', l.nome, true, grpId);
        await salvarRegra({
          groupId: grpId, title: PCT.TITULO_CONTA, desc: l.nome, kind: 'commitment', startTime: '',
          categoryId: cat?.id || null, icon: cat?.icon || '', reminderEnabled: true,
          freq: 'monthly', interval: 1, dayOfMonth: l.dia, anchor: dayId(l.data),
        });
        feitas.push(l);
      }
      ok.textContent = '✅ Feito'; ok.classList.add('pet-reg-done'); nao.remove();
      addMessage(`✅ Criei ${feitas.length === 1 ? '1 conta' : `${feitas.length} contas`} a pagar. ${feitas.length === 1 ? "Repete" : "Repetem"} todo mês no mesmo dia, com lembrete:<br>${feitas.map(l => `• ${_esc(l.nome)} · dia ${dd(l.dia)}`).join('<br>')}`, 'bot');
    } catch (err) {
      console.error('[pet-contas]', err);
      ok.textContent = '✅ Feito em parte'; nao.remove();
      addMessage(`Criei ${feitas.length} e parei num erro 😕 ${_esc(err.message || '')}. Manda a lista de novo que eu pulo as que já foram.`, 'bot');
    }
  });
  nao.addEventListener('click', () => { ok.disabled = nao.disabled = true; nao.textContent = 'Cancelado'; ok.remove(); });
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
      dispatchCommand(c.action || c.value);
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
      let final = '', parcial = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final = juntarFala(final, e.results[i][0].transcript);
        else parcial = e.results[i][0].transcript;   // o que ainda está sendo dito
      }
      trechoAtual = final;
      mostrarFalaAoVivo([juntarFala(accumulated, final), parcial].filter(Boolean).join(' '));
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
      // Alguns Android não deixam o medidor de volume e o reconhecimento usarem
      // o microfone juntos: desliga o medidor (e lembra) e segue reconhecendo.
      if (e.error === 'audio-capture' && _medidor) {
        pararMedidor();
        try { localStorage.setItem('visao_pet_sem_medidor', '1'); } catch (_) {}
        try { recognition = buildRecognition(); recognition.start(); return; } catch (_) {}
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
  mostrarFalaAoVivo('');
  ligarMedidor();   // sem await: a onda já começa e passa a seguir a voz quando o medidor abrir
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

// Texto aparecendo enquanto a pessoa fala
function mostrarFalaAoVivo(texto) {
  const el = document.getElementById('pet-rec-live');
  if (!el) return;
  el.textContent = texto ? texto : '🎙️ Pode falar…';
  el.classList.toggle('vazio', !texto);
  el.scrollTop = el.scrollHeight;
}

// Medidor de volume de verdade (a onda segue a voz). Se o aparelho não deixar,
// a onda volta pro modo animado de antes.
let _medidor = null;   // { stream, ctx, analyser, buf }
async function ligarMedidor() {
  // No Android o medidor e o reconhecimento disputam o microfone: a onda anda,
  // mas o reconhecedor fica mudo (sem erro nenhum) e nada é transcrito. Lá a
  // onda fica no modo animado e o microfone é só do reconhecimento.
  if (/Android/i.test(navigator.userAgent)) return;
  try { if (localStorage.getItem('visao_pet_sem_medidor') === '1') return; } catch (_) {}
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (!recording) { stream.getTracks().forEach(tk => tk.stop()); return; }
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    _medidor = { stream, ctx, analyser, buf: new Uint8Array(analyser.fftSize) };
  } catch (_) { _medidor = null; }
}
function pararMedidor() {
  if (!_medidor) return;
  try { _medidor.stream.getTracks().forEach(tk => tk.stop()); } catch (_) {}
  try { _medidor.ctx.close(); } catch (_) {}
  _medidor = null;
}
// Volume atual de 0 a 1 (null = sem medidor)
function volumeAgora() {
  if (!_medidor) return null;
  const { analyser, buf } = _medidor;
  analyser.getByteTimeDomainData(buf);
  let soma = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; soma += v * v; }
  return Math.min(1, Math.sqrt(soma / buf.length) * 4.5);
}

function teardownMic() {
  pararMedidor();
  cancelAnimationFrame(waveAnimId);
  voiceActive = false;
  clearTimeout(voiceTimer);
}

function showRecordingUI() {
  document.getElementById('pet-input-row').style.display     = 'none';
  document.getElementById('pet-recording-bar').style.display = 'flex';
  const live = document.getElementById('pet-rec-live');
  if (live) live.style.display = 'block';
}

function hideRecordingUI() {
  const live = document.getElementById('pet-rec-live');
  if (live) { live.style.display = 'none'; live.textContent = ''; }
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
    // Com medidor: a onda anda da direita pra esquerda seguindo o volume real
    const vol = volumeAgora();
    if (vol != null) {
      if (tick % 2 === 0) {
        targets.copyWithin(0, 1);
        targets[N - 1] = 0.05 + vol * 0.9;
      }
      ctx.clearRect(0, 0, W, H);
      const totalW = N * (BAR + GAP) - GAP;
      let x = (W - totalW) / 2;
      for (let i = 0; i < N; i++) {
        heights[i] += (targets[i] - heights[i]) * 0.5;
        const bH = Math.max(3, heights[i] * H * 0.9);
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, (H - bH) / 2, BAR, bH, 1.5);
        else ctx.rect(x, (H - bH) / 2, BAR, bH);
        ctx.fill();
        x += BAR + GAP;
      }
      return;
    }
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

// O reconhecedor de voz não pontua: devolve "falcon qual o meu próximo
// compromisso" cru. Antes tudo ganhava ponto final, até pergunta. Aqui:
//  • "Falcon"/"pet" chamando no começo ganha vírgula ("Falcon, qual...")
//  • frase que começa com palavra de pergunta termina em "?"
//  • saudação/agradecimento sozinho termina em "!"
//  • "título" e "descrição" ditados ganham vírgula antes (vira o formato do exemplo)
const INICIO_PERGUNTA = /^(qual|quais|quanto|quanta|quantos|quantas|quando|onde|como|quem|por ?que|pq|o que|que horas|ser[aá]|cad[eê]|pode|posso|consegue|voc[eê]|vc|d[aá] pra|tem como|[eé] poss[ií]vel|t[oô]|estou|eu (tenho|t[oô]|estou|dormi|bebi|fiz))(?=\s|$)/i;
const SO_SAUDACAO = /^(oi+|ol[aá]|opa|e a[ií]|eae|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|vlw|tchau|at[eé] mais|show|top|massa|beleza)( (pet|falcon))?$/i;

function formatTranscript(raw) {
  if (!raw) return '';
  let t = raw.trim().replace(/\s+/g, ' ');
  // Vocativo: "falcon qual..." → "Falcon, qual..."
  const mVoc = t.match(/^((?:(?:ei|oi|ok|ô|olá|fala)\s+)?(?:falcon|pet))\s+(?![,.!?])(.+)$/i);
  let chamado = '';
  if (mVoc) { chamado = mVoc[1]; t = mVoc[2]; }
  t = t.replace(/\s+(t[ií]tulo|descri[çc][ãa]o)\b/gi, (m, rot, off, str) => /[,.;:]$/.test(str.slice(0, off)) ? m : `, ${rot}`);
  if (!/[.!?]$/.test(t)) {
    const semPonto = t.replace(/[,;:]+$/, '');
    t = SO_SAUDACAO.test(semPonto) ? semPonto + '!'
      : INICIO_PERGUNTA.test(semPonto) || /\b(n[ée]|n[ãa]o [ée]|certo)$/i.test(semPonto) ? semPonto + '?'
      : semPonto + '.';
  }
  if (chamado) t = `${chamado.charAt(0).toUpperCase() + chamado.slice(1)}, ${t.charAt(0).toLowerCase() + t.slice(1)}`;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  t = t.replace(/([.!?]\s+)([a-zà-ú])/g, (_, p, l) => p + l.toUpperCase());
  return t.replace(/\bfalcon\b/g, 'Falcon');
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
