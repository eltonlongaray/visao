// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Entry point: registra rotas, escuta auth, decide pra onde mandar o usuário
import { auth, onAuthStateChanged } from './firebase.js';
import { registerRoute, navigate, forceRender } from './router.js';
import { renderLogin } from './screens/login.js';
import { renderSignup } from './screens/signup.js';
import { renderWelcome } from './screens/welcome.js';
import { renderModalidade } from './screens/modalidade.js';
import { renderHome } from './screens/home.js';
import { renderRitual } from './screens/ritual.js';
import { renderDesempenho } from './screens/desempenho.js';
import * as biometric from './biometric.js';
import { showLock, hideLock, initAutoLock, isLocked } from './lock.js';


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

// FIX: força render AGORA que as rotas estão registradas.
// Sem isso, o setTimeout(render,0) do router pode ter rodado antes desta linha
// (Firebase CDN lento bloqueando avaliação do main.js).
forceRender();

// Inicia o listener de auto-lock (20s em segundo plano → trava)
initAutoLock();


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: AUTH STATE — redirect automático conforme login
// ═══════════════════════════════════════════════════════════════
// FIX: se Firebase demorar muito a inicializar (CDN lento, conexão), força login após 3s
setTimeout(() => {
  if (location.hash === '' || location.hash === '#') {
    navigate('/login');
  }
}, 3000);

let lastUid = null;
onAuthStateChanged(auth, (user) => {
  const isAuthRoute = ['#/login', '#/signup', ''].includes(location.hash);

  if (!user) {
    // Não logado → vai pro login + destrava qualquer lock pendente
    lastUid = null;
    if (isLocked()) hideLock();
    if (!isAuthRoute) navigate('/login');
    else if (!location.hash) navigate('/login');
    return;
  }

  // Logado: sempre passa pela tela de escolha de modalidade
  if (user.uid === lastUid) return; // evita loop
  lastUid = user.uid;

  // Se a bio estava ligada pra OUTRO usuário neste device, desliga
  // (segurança: previne user-A destravar acesso de user-B)
  const boundUid = biometric.getBoundUid();
  if (boundUid && boundUid !== user.uid) {
    biometric.disable();
  }

  navigate('/modalidade');

  // Cold-open: se bio está configurada pra este user, trava na hora
  if (biometric.isEnabledForUser(user.uid)) {
    showLock();
  }
});
