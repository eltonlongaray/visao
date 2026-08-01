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
import { startNotifChecker, subscribeToPush, startForegroundPushListener, getNotifMuted, unlockAudio, consumeNotifTarget } from './notificacoes.js';
import { renderLogin } from './screens/tela-login.js';
import { renderSignup } from './screens/tela-cadastro.js';
import { renderWelcome } from './screens/tela-boas-vindas.js';
import { renderModalidade } from './screens/tela-modalidade.js';
import { renderHome } from './screens/tela-inicio.js';
import { renderRitual } from './screens/tela-ritual.js';
import { renderDesempenho } from './screens/tela-desempenho.js';
import { renderDesafios } from './screens/tela-desafios.js';
import { renderChat } from './screens/tela-chat.js';
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
registerRoute('/desafios', renderDesafios);
registerRoute('/chat', renderChat);
registerRoute('/termos', renderTermos);
registerRoute('/privacidade', renderPrivacidade);
registerRoute('/aceite', renderLegalConsent);
registerRoute('/ajustes', renderAjustes);

await initI18n();

// ── Guard de armazenamento ──────────────────────────────────────
// O login do Supabase é guardado no localStorage. Em navegador embutido
// (abrir o link DENTRO do WhatsApp/Instagram) ou aba anônima, o localStorage
// é bloqueado ou some — e aí a sessão nunca cola: a pessoa "entra" mas todo
// salvar falha com "não autenticado"/"sessão expirada". Foi o que travou a
// Marluce. Aqui a gente detecta isso e explica, em vez de deixar o erro cru.
function _armazenamentoOk() {
  try {
    const k = '__falcon_store_test__';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch { return false; }
}
if (!_armazenamentoOk()) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px;
                background:#0d1220;color:#e8ecf5;font-family:system-ui,-apple-system,sans-serif;text-align:center;">
      <div style="max-width:420px;">
        <div style="font-size:44px;margin-bottom:14px;">🦅</div>
        <h2 style="font-size:20px;margin:0 0 12px;">Seu navegador está bloqueando o login</h2>
        <p style="font-size:15px;line-height:1.5;color:#b7c0d8;margin:0 0 14px;">
          Isso acontece quando o Falcon é aberto <b>dentro de outro app</b> (WhatsApp, Instagram)
          ou numa <b>aba anônima</b>. Assim o app não consegue guardar seu acesso.
        </p>
        <p style="font-size:15px;line-height:1.5;color:#e8ecf5;margin:0;">
          Abra o Falcon <b>direto no Chrome</b>: toque nos <b>⋮</b> no canto e em
          <b>“Abrir no navegador”</b>. Depois, se puder, use <b>“Instalar o Falcon”</b>.
        </p>
      </div>
    </div>`;
  throw new Error('[boot] localStorage indisponível — navegador embutido ou aba anônima');
}

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

// Rede de segurança do deep-link: o SW gravou o alvo do clique num IndexedDB.
// Consome ao abrir/retomar o app — cobre o cold-start em que o Android perde o
// hash do openWindow. Só age se estiver logado (senão o alvo espera o login).
async function _irParaAlvoNotif() {
  if (!lastUid) return;
  const tgt = await consumeNotifTarget().catch(() => null);
  if (!tgt || !tgt.day) return;
  const qs = `?day=${tgt.day}${tgt.tag ? `&tag=${encodeURIComponent(tgt.tag)}` : ''}`;
  const target = `/ritual${qs}`;
  if (location.hash === '#' + target) forceRender();
  else navigate(target);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _irParaAlvoNotif();
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
  // Deep-link via IndexedDB (cold-start que perdeu o hash) — navega pro Ritual.
  if (!deepLink) _irParaAlvoNotif();

  // Cold-open: trava se bio configurada
  if (biometric.isEnabledForUser(user.uid)) {
    showLock();
  }
});
