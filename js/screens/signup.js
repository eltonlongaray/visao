import { auth, createUserWithEmailAndPassword } from '../firebase.js';
import { navigate } from '../router.js';
import { showToast } from '../toast.js';
import { recordTerms } from '../consent.js';

export function renderSignup(app) {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-logo"><img src="icons/icon-192.png?v=92" alt="Falcon" style="width:100%;height:100%;object-fit:cover;display:block;"></div>
      <div class="login-title">Falcon</div>
      <div class="login-sub">Crie sua conta para começar</div>

      <form class="login-form" id="signup-form">
        <label class="input-field">
          <div class="input-field-label">E-mail</div>
          <input type="email" id="email" required autocomplete="email" placeholder="seu@email.com" />
        </label>
        <label class="input-field">
          <div class="input-field-label">Senha (mínimo 6 caracteres)</div>
          <input type="password" id="password" required autocomplete="new-password" placeholder="••••••••" minlength="6" />
        </label>
        <label class="input-field">
          <div class="input-field-label">Confirmar senha</div>
          <input type="password" id="password2" required autocomplete="new-password" placeholder="••••••••" minlength="6" />
        </label>

        <label class="consent-checkbox signup-consent">
          <input type="checkbox" id="signupConsent" required>
          <span class="consent-checkbox-mark"></span>
          <span class="consent-checkbox-text">
            Tenho 18 anos ou mais e li e aceito os
            <a href="#/termos">Termos de Uso</a> e a
            <a href="#/privacidade">Política de Privacidade</a>,
            incluindo o tratamento de dados sensíveis de saúde.
          </span>
        </label>

        <button type="submit" class="btn-primary" id="btn-signup" disabled>Criar conta</button>

        <button type="button" class="btn-secondary" id="back-to-login">← Voltar pro login</button>
      </form>
    </div>
  `;

  const form = document.getElementById('signup-form');
  const btn = document.getElementById('btn-signup');
  const chk = document.getElementById('signupConsent');

  chk.addEventListener('change', () => { btn.disabled = !chk.checked; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chk.checked) {
      showToast('Você precisa aceitar os Termos e a Política.', 'error');
      return;
    }
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password2').value;
    if (password !== password2) { showToast('As senhas não coincidem.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Criando...';
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Aceite gravado imediatamente — auth.currentUser já está populado aqui
      try { await recordTerms(); } catch (e) { console.warn('[signup] recordTerms:', e); }
      // onAuthStateChanged em main.js cuida do redirect
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Criar conta';
      showToast(traduzErroSignup(err.code), 'error');
    }
  });

  document.getElementById('back-to-login').addEventListener('click', () => navigate('/login'));
}

function traduzErroSignup(code) {
  const map = {
    'auth/email-already-in-use': 'Este e-mail já tem conta. Faça login.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.'
  };
  return map[code] || 'Falha ao criar conta. Tente novamente.';
}
