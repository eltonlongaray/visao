// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — REGISTRO DE ROTAS
// BLOCO 3 — AUTH STATE
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import { auth, onAuthStateChanged, onPasswordRecovery } from './autenticacao.js';
import { showSetPasswordModal } from './recuperar-senha.js';
import { registerRoute, navigate, forceRender } from './roteador.js';
import { initI18n } from './idioma.js';
import { startNotifChecker, subscribeToPush, startForegroundPushListener, getNotifMuted, unlockAudio } from './notificacoes.js';
import { renderLogin } from './screens/tela-login.js';
import { renderSignup } from './screens/tela-cadastro.js';
import { renderWelcome } from './screens/tela-boas-vindas.js';
import { renderModalidade } from './screens/tela-modalidade.js';
import { renderHome } from './screens/tela-inicio.js';
import { renderRitual } from './screens/tela-ritual.js';
import { renderDesempenho } from './screens/tela-desempenho.js';
import { renderTermos } from './screens/tela-termos.js';
import { renderPrivacidade } from './screens/tela-privacidade.js';
import { renderLegalConsent } from './screens/tela-aceite-legal.js';
import { renderAjustes } from './screens/tela-ajustes.js';
import * as biometric from './biometria.js';
import { showLock, hideLock, initAutoLock, isLocked } from './bloqueio.js';
import { showToast } from './aviso-tela.js';
import { playAlert } from './sons.js';
import { hasTerms } from './lgpd-consentimentos.js';
import { initPet, showPet, hidePet } from './assistente-ia.js?v=20260705o';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: REGISTRO DE ROTAS
// ═══════════════════════════════════════════════════════════════
registerRoute('/login', renderLogin);
registerRoute('/signup', renderSignup);
registerRoute('/welcome', renderWelcome);
registerRoute('/modalidade', renderModalidade);
registerRoute('/home', renderHome);
registerRoute('/ritual', renderRitual);
registerRoute('/desempenho', renderDesempenho);
registerRoute('/termos', renderTermos);
registerRoute('/privacidade', renderPrivacidade);
registerRoute('/aceite', renderLegalConsent);
registerRoute('/ajustes', renderAjustes);

await initI18n();
forceRender();
initAutoLock();
// Chegou pelo link de "redefinir senha" → abre o modal pra definir a nova
onPasswordRecovery(() => showSetPasswordModal());
initPet();
startNotifChecker();
// Desbloqueia AudioContext no primeiro toque — política de autoplay do mobile
// Sem isso o playFalconCry fica bloqueado quando disparado por timer/push
document.addEventListener('click', function _unlock() {
  unlockAudio();
  document.removeEventListener('click', _unlock);
}, { once: true, passive: true });
// Sincroniza mute com o SW ao carregar
navigator.serviceWorker?.ready.then(reg => {
  reg.active?.postMessage({ type: 'SET_MUTED', muted: getNotifMuted() });
}).catch(() => {});
startForegroundPushListener(({ title, body }) => {
  const muted = getNotifMuted();
  showToast(`🔔 ${title}${body ? ' — ' + body : ''}`, muted ? 'info' : 'info', 8000);
});

// Clique na notificação (app aberto): SW manda abrir o Ritual no dia do compromisso
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'OPEN_RITUAL_DAY') return;
  const { day, tag } = e.data;
  const qs = day ? `?day=${day}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}` : '';
  const target = `/ritual${qs}`;
  if (location.hash === '#' + target) forceRender();
  else navigate(target);
});


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: AUTH STATE
// ═══════════════════════════════════════════════════════════════
setTimeout(() => {
  if (location.hash === '' || location.hash === '#') {
    navigate('/login');
  }
}, 3000);

// Rotas livres (acessíveis sem login E sem aceite)
const PUBLIC_ROUTES = ['#/login', '#/signup', '#/termos', '#/privacidade'];

let lastUid = null;
onAuthStateChanged(auth, async (user) => {
  const isPublic = PUBLIC_ROUTES.includes(location.hash);

  if (!user) {
    lastUid = null;
    hidePet();
    if (isLocked()) hideLock();
    if (!isPublic) navigate('/login');
    else if (!location.hash) navigate('/login');
    return;
  }

  if (user.uid === lastUid) return;
  lastUid = user.uid;

  // Bio: reset se foi configurada pra outro user neste device
  const boundUid = biometric.getBoundUid();
  if (boundUid && boundUid !== user.uid) biometric.disable();

  // ── Gate 1: Aceite dos Termos vigentes ──
  try {
    const ok = await hasTerms();
    if (!ok) {
      navigate('/aceite');
      return; // segura aqui até aceitar
    }
  } catch (err) {
    console.error('[main] erro ao checar termos:', err);
    // Em caso de erro de leitura, força aceite por segurança
    navigate('/aceite');
    return;
  }

  // ── Expõe auth globalmente para notifications.js acessar userId ──
  globalThis._visaoAuth = { auth };

  // ── Aceite OK: vai pra modalidade (ou pro deep-link de notificação, se houver) ──
  const deepLink = location.hash.startsWith('#/ritual') ? location.hash.slice(1) : null;
  navigate(deepLink || '/modalidade');
  showPet();
  subscribeToPush(); // registra push subscription no Worker (se configurado)

  // Cold-open: trava se bio configurada
  if (biometric.isEnabledForUser(user.uid)) {
    showLock();
  }
});
