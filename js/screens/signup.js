import { auth, createUserWithEmailAndPassword } from '../firebase.js';
import { navigate } from '../router.js';
import { showToast } from '../toast.js';

export function renderSignup(app) {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-logo">👁</div>
      <div class="login-title">Visão</div>
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

        <button type="submit" class="btn-primary" id="btn-signup">Criar conta</button>

        <button type="button" class="btn-secondary" id="back-to-login">← Voltar pro login</button>
      </form>
    </div>
  `;

  const form = document.getElementById('signup-form');
  const btn = document.getElementById('btn-signup');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password2').value;
    if (password !== password2) { showToast('As senhas não coincidem.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Criando...';
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Após criar, onAuthStateChanged dispara → main.js redireciona para /welcome (novo usuário)
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
