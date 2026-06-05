// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /aceite — gate obrigatório de aceite dos termos
// Mostrada quando o usuário (já logado) ainda não aceitou a versão
// vigente dos Termos + Privacidade. Bloqueia acesso ao app até aceitar.
// ═══════════════════════════════════════════════════════════════
import { navigate } from '../router.js';
import { auth, signOut } from '../firebase.js';
import { RESUMO_CONSENT } from '../legal-text.js';
import { recordTerms } from '../consent.js';
import { showToast } from '../toast.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: RENDER
// ═══════════════════════════════════════════════════════════════
export function renderLegalConsent(app) {
  app.innerHTML = `
    <div class="onboarding consent-gate-screen">
      <div class="consent-gate-icon">📜</div>
      <h1 class="consent-gate-title">Antes de começar</h1>
      <p class="consent-gate-text">
        Atualizamos como cuidamos dos seus dados. Pra continuar usando o Visão,
        leia e aceite os documentos abaixo:
      </p>

      <div class="consent-gate-links">
        <a href="#/termos" class="consent-gate-link">📄 Termos de Uso</a>
        <a href="#/privacidade" class="consent-gate-link">🔒 Política de Privacidade</a>
      </div>

      <label class="consent-checkbox">
        <input type="checkbox" id="consentChk">
        <span class="consent-checkbox-mark"></span>
        <span class="consent-checkbox-text">${RESUMO_CONSENT}</span>
      </label>

      <button class="btn-primary consent-gate-btn" id="consentAcceptBtn" disabled>
        Aceitar e continuar
      </button>

      <button class="login-link consent-gate-cancel" id="consentSignOutBtn">
        Não aceito (sair)
      </button>
    </div>
  `;

  wire(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WIRES
// ═══════════════════════════════════════════════════════════════
function wire(app) {
  const chk = app.querySelector('#consentChk');
  const btn = app.querySelector('#consentAcceptBtn');
  const out = app.querySelector('#consentSignOutBtn');

  chk?.addEventListener('change', () => {
    btn.disabled = !chk.checked;
  });

  btn?.addEventListener('click', async () => {
    if (!chk.checked) return;
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      await recordTerms();
      // Recarrega o roteamento — main.js vai re-checar e mandar pra modalidade
      navigate('/modalidade');
    } catch (err) {
      console.error('[consent] erro ao salvar aceite:', err);
      showToast('Erro ao salvar. Tente de novo.', 'error');
      btn.disabled = false;
      btn.textContent = 'Aceitar e continuar';
    }
  });

  out?.addEventListener('click', async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('[consent] signOut erro:', err);
    }
  });
}
