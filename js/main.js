// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import { auth, onAuthStateChanged } from './firebase.js';
import { registerRoute, navigate, forceRender } from './router.js';
import { initI18n } from './i18n.js';
import { startNotifChecker, subscribeToPush, startForegroundPushListener } from './notifications.js';
import { renderLogin } from './screens/login.js';
import { renderSignup } from './screens/signup.js';
import { renderWelcome } from './screens/welcome.js';
import { renderModalidade } from './screens/modalidade.js';
import { renderHome } from './screens/home.js';
import { renderRitual } from './screens/ritual.js';
import { renderDesempenho } from './screens/desempenho.js';
import { renderTermos } from './screens/termos.js';
import { renderPrivacidade } from './screens/privacidade.js';
import { renderLegalConsent } from './screens/legal-consent.js';
import { renderAjustes } from './screens/ajustes.js';
import * as biometric from './biometric.js';
import { showLock, hideLock, initAutoLock, isLocked } from './lock.js';
import { showToast } from './toast.js';
import { playAlert } from './sounds.js';
import { hasTerms } from './consent.js';
import { initPet, showPet, hidePet } from './pet.js?v=20260705o';


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
initPet();
startNotifChecker();
startForegroundPushListener(({ title, body }) => {
  showToast(`🔔 ${title}${body ? ' — ' + body : ''}`, 'info', 8000);
  playAlert();
  if ('vibrate' in navigator) navigator.vibrate([300, 150, 300, 150, 300]);
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

  // ── Aceite OK: vai pra modalidade ──
  navigate('/modalidade');
  showPet();
  subscribeToPush(); // registra push subscription no Worker (se configurado)

  // Cold-open: trava se bio configurada
  if (biometric.isEnabledForUser(user.uid)) {
    showLock();
  }
});
