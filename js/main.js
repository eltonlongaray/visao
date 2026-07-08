// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import { auth, onAuthStateChanged } from './firebase.js?v=20260708e';
import { registerRoute, navigate, forceRender } from './router.js?v=20260708e';
import { initI18n } from './i18n.js?v=20260708e';
import { startNotifChecker, subscribeToPush } from './notifications.js?v=20260708e';
import { renderLogin } from './screens/login.js?v=20260708e';
import { renderSignup } from './screens/signup.js?v=20260708e';
import { renderWelcome } from './screens/welcome.js?v=20260708e';
import { renderModalidade } from './screens/modalidade.js?v=20260708e';
import { renderHome } from './screens/home.js?v=20260708e';
import { renderRitual } from './screens/ritual.js?v=20260708e';
import { renderDesempenho } from './screens/desempenho.js?v=20260708e';
import { renderTermos } from './screens/termos.js?v=20260708e';
import { renderPrivacidade } from './screens/privacidade.js?v=20260708e';
import { renderLegalConsent } from './screens/legal-consent.js?v=20260708e';
import { renderAjustes } from './screens/ajustes.js?v=20260708e';
import * as biometric from './biometric.js?v=20260708e';
import { showLock, hideLock, initAutoLock, isLocked } from './lock.js?v=20260708e';
import { hasTerms } from './consent.js?v=20260708e';
import { initPet, showPet, hidePet } from './pet.js?v=20260708e';


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
