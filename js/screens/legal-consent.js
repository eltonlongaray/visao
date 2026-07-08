// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /aceite — gate obrigatório dos termos
// Padrão: 1 botão grande "Ler e aceitar" → modal com scroll →
// check só libera no fim da leitura → aceitar e continuar.
// ═══════════════════════════════════════════════════════════════
import { navigate } from '../router.js';
import { auth, signOut } from '../firebase.js';
import { TERMOS_HTML, PRIVACIDADE_HTML } from '../legal-text.js';
import { recordTerms } from '../consent.js';
import { showToast } from '../toast.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: RENDER
// ═══════════════════════════════════════════════════════════════
export function renderLegalConsent(app) {
  app.innerHTML = `
    <div class="consent-gate-wrap">
      <div class="consent-gate-card">
        <div class="consent-gate-icon">📜</div>
        <h1 class="consent-gate-title">Antes de começar</h1>
        <p class="consent-gate-text">
          Pra usar o Falcon, você precisa ler e aceitar
          nossos Termos de Uso e Política de Privacidade.
        </p>

        <ul class="consent-gate-bullets">
          <li><span class="cgb-ic">🔒</span> Seus dados ficam só com você</li>
          <li><span class="cgb-ic">⚖️</span> Em conformidade com a LGPD</li>
          <li><span class="cgb-ic">📥</span> Pode exportar ou apagar tudo a qualquer hora</li>
        </ul>

        <button class="consent-doc-btn" id="openLegalBtn">
          <span class="consent-doc-btn-ic">📄</span>
          <span class="consent-doc-btn-body">
            <span class="consent-doc-btn-title">Termos + Política</span>
            <span class="consent-doc-btn-sub">Toque pra ler e aceitar</span>
          </span>
          <span class="consent-doc-btn-arrow">›</span>
        </button>

      </div>

      <button class="consent-gate-cancel" id="consentSignOutBtn">
        Não aceito (sair da conta)
      </button>
    </div>
  `;

  wire(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WIRES
// ═══════════════════════════════════════════════════════════════
function wire(app) {
  app.querySelector('#openLegalBtn')?.addEventListener('click', () => openLegalModal(app));
  app.querySelector('#consentSignOutBtn')?.addEventListener('click', async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('[consent] signOut erro:', err);
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: MODAL — scroll + check no fim
// ═══════════════════════════════════════════════════════════════
function openLegalModal(app) {
  const modal = document.createElement('div');
  modal.className = 'legal-modal-overlay';
  modal.innerHTML = `
    <div class="legal-modal">
      <header class="legal-modal-header">
        <div class="legal-modal-title">Termos + Privacidade</div>
        <button class="legal-modal-close" id="legalModalClose" aria-label="Fechar">×</button>
      </header>

      <div class="legal-modal-scroll" id="legalScroll">
        <div class="legal-content">
          ${TERMOS_HTML}
          <hr class="legal-divider">
          ${PRIVACIDADE_HTML}
          <div class="legal-end-marker" id="legalEndMarker"></div>
        </div>
      </div>

      <div class="legal-modal-footer">
        <div class="legal-scroll-hint" id="legalScrollHint">
          ⬇ Role até o fim pra liberar o aceite
        </div>

        <label class="consent-checkbox legal-modal-check disabled" id="legalModalCheckWrap">
          <input type="checkbox" id="legalModalChk" disabled>
          <span class="consent-checkbox-mark"></span>
          <span class="consent-checkbox-text">
            Tenho 18 anos ou mais, li e aceito os
            <strong>Termos de Uso</strong> e a
            <strong>Política de Privacidade</strong>,
            incluindo o tratamento de dados sensíveis de saúde.
          </span>
        </label>

        <button class="btn-primary legal-modal-accept" id="legalModalAccept" disabled>
          Aceitar e continuar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('bio-modal-open');

  const close = () => {
    modal.remove();
    document.body.classList.remove('bio-modal-open');
  };

  modal.querySelector('#legalModalClose').addEventListener('click', close);

  const scrollEl = modal.querySelector('#legalScroll');
  const endMarker = modal.querySelector('#legalEndMarker');
  const checkWrap = modal.querySelector('#legalModalCheckWrap');
  const chk = modal.querySelector('#legalModalChk');
  const accept = modal.querySelector('#legalModalAccept');
  const hint = modal.querySelector('#legalScrollHint');

  // Detecta quando o marcador final fica visível
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    chk.disabled = false;
    checkWrap.classList.remove('disabled');
    hint.innerHTML = '✅ Pronto! Marque o aceite abaixo.';
    hint.classList.add('ok');
  };

  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) unlock();
  }, { root: scrollEl, threshold: 0.5 });
  io.observe(endMarker);

  // Fallback: se o conteúdo for menor que a viewport, libera direto
  setTimeout(() => {
    if (scrollEl.scrollHeight <= scrollEl.clientHeight + 4) unlock();
  }, 200);

  chk.addEventListener('change', () => {
    accept.disabled = !chk.checked;
  });

  accept.addEventListener('click', async () => {
    if (!chk.checked) return;
    accept.disabled = true;
    accept.textContent = 'Salvando...';
    try {
      await recordTerms();
      io.disconnect();
      close();
      navigate('/modalidade');
    } catch (err) {
      console.error('[consent] erro ao salvar aceite:', err);
      showToast('Erro ao salvar. Tente de novo.', 'error');
      accept.disabled = false;
      accept.textContent = 'Aceitar e continuar';
    }
  });
}
