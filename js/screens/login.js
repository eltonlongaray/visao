import {
  auth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail
} from '../firebase.js';
import { navigate } from '../router.js';
import { showToast } from '../toast.js';

export function renderLogin(app) {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-logo">👁</div>
      <div class="login-title">Visão</div>
      <div class="login-sub">Consultor pessoal de planejamento estratégico</div>

      <form class="login-form" id="login-form">
        <label class="input-field">
          <div class="input-field-label">E-mail</div>
          <input type="email" id="email" required autocomplete="email" placeholder="seu@email.com" />
        </label>
        <label class="input-field">
          <div class="input-field-label">Senha</div>
          <input type="password" id="password" required autocomplete="current-password" placeholder="••••••••" minlength="6" />
        </label>

        <button type="submit" class="btn-primary" id="btn-login">Entrar</button>

        <div class="login-divider">ou</div>

        <button type="button" class="btn-secondary" id="btn-google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.3 6.1 29.4 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.7l6.3 5.3C41.4 35.7 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          Entrar com Google
        </button>

        <button type="button" class="btn-secondary" id="btn-signup">✨ Criar nova conta</button>
      </form>

      <div class="login-extras">
        <a href="#" class="login-link" id="forgot">Esqueci a senha</a>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const btnLogin = document.getElementById('btn-login');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    btnLogin.disabled = true; btnLogin.textContent = 'Entrando...';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged em main.js cuida do redirecionamento
    } catch (err) {
      btnLogin.disabled = false; btnLogin.textContent = 'Entrar';
      showToast(traduzErroAuth(err.code), 'error');
    }
  });

  document.getElementById('btn-google').addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); }
    catch (err) { showToast('Falha ao entrar com Google: ' + (err.message || ''), 'error'); }
  });

  document.getElementById('btn-signup').addEventListener('click', () => navigate('/signup'));

  document.getElementById('forgot').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) { showToast('Digite seu e-mail no campo acima primeiro.', 'info'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Link de recuperação enviado para ' + email, 'success');
    } catch (err) {
      showToast('Erro: ' + (err.message || ''), 'error');
    }
  });
}

function traduzErroAuth(code) {
  const map = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Conta não encontrada. Crie uma nova.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco.',
    'auth/network-request-failed': 'Sem conexão com a internet.'
  };
  return map[code] || 'Falha no login. Tente novamente.';
}
