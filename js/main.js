// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Entry point: registra rotas, escuta auth, decide pra onde mandar o usuário
import { auth, onAuthStateChanged, db, doc, getDoc } from './firebase.js';
import { registerRoute, navigate, forceRender } from './router.js';
import { renderLogin } from './screens/login.js';
import { renderSignup } from './screens/signup.js';
import { renderWelcome } from './screens/welcome.js';
import { renderHome } from './screens/home.js';
import { renderRitual } from './screens/ritual.js';
import { renderDesempenho } from './screens/desempenho.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: REGISTRO DE ROTAS
// ═══════════════════════════════════════════════════════════════
registerRoute('/login', renderLogin);
registerRoute('/signup', renderSignup);
registerRoute('/welcome', renderWelcome);
registerRoute('/home', renderHome);
registerRoute('/ritual', renderRitual);
registerRoute('/desempenho', renderDesempenho);

// FIX: força render AGORA que as rotas estão registradas.
// Sem isso, o setTimeout(render,0) do router pode ter rodado antes desta linha
// (Firebase CDN lento bloqueando avaliação do main.js).
forceRender();

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
onAuthStateChanged(auth, async (user) => {
  const isAuthRoute = ['#/login', '#/signup', ''].includes(location.hash);

  if (!user) {
    // Não logado → vai pro login
    lastUid = null;
    if (!isAuthRoute) navigate('/login');
    else if (!location.hash) navigate('/login');
    return;
  }

  // Logado: checa se tem template escolhido
  if (user.uid === lastUid) return; // evita loop
  lastUid = user.uid;

  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const hasTemplate = userDoc.exists() && userDoc.data()?.template;

    if (!hasTemplate) {
      navigate('/welcome'); // usuário novo
    } else {
      navigate('/home'); // usuário existente
    }
  } catch (err) {
    console.error('[Visão] erro ao ler user doc:', err);
    navigate('/welcome'); // fallback seguro
  }
});
