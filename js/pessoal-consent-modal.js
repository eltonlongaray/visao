// ═══════════════════════════════════════════════════════════════
// VISÃO · Modal de consentimento específico — Organização Pessoal
// Aparece quando o usuário tenta entrar em "Pessoal" pela 1ª vez.
// Coleta consent destacado pra dados sensíveis de saúde (Art. 11 LGPD).
// Retorna Promise<boolean> — true se aceitou, false se cancelou.
// ═══════════════════════════════════════════════════════════════
import { RESUMO_PESSOAL } from './legal-text.js';
import { hasPessoalConsent, recordPessoal } from './consent.js';
import { showToast } from './toast.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: GATE — abre o modal só se ainda não aceitou
// ═══════════════════════════════════════════════════════════════
export async function ensurePessoalConsent() {
  const ok = await hasPessoalConsent();
  if (ok) return true;
  return new Promise((resolve) => open(resolve));
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
function open(resolve) {
  const modal = document.createElement('div');
  modal.className = 'bio-modal-overlay';
  modal.innerHTML = `
    <div class="bio-modal-card">
      <div class="bio-modal-icon">📋</div>
      <h2 class="bio-modal-title">Organização Pessoal</h2>
      <p class="bio-modal-text" style="margin-bottom:14px">${RESUMO_PESSOAL}</p>

      <label class="consent-checkbox" style="text-align:left;margin:14px 0 18px">
        <input type="checkbox" id="pessoalChk">
        <span class="consent-checkbox-mark"></span>
        <span class="consent-checkbox-text">
          Concordo com o tratamento dos meus
          <strong>dados sensíveis de saúde</strong> (sono, hidratação, rotinas).
        </span>
      </label>

      <button class="bio-modal-btn primary" id="pessoalAcceptBtn" disabled>
        ✓ Aceitar e entrar
      </button>
      <button class="bio-modal-btn ghost" id="pessoalCancelBtn">
        Cancelar
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('bio-modal-open');

  const close = (result) => {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.remove();
      document.body.classList.remove('bio-modal-open');
      resolve(result);
    }, 220);
  };

  const chk = modal.querySelector('#pessoalChk');
  const accept = modal.querySelector('#pessoalAcceptBtn');
  const cancel = modal.querySelector('#pessoalCancelBtn');

  chk.addEventListener('change', () => { accept.disabled = !chk.checked; });

  cancel.addEventListener('click', () => close(false));

  accept.addEventListener('click', async () => {
    if (!chk.checked) return;
    accept.disabled = true;
    accept.innerHTML = '<span class="bio-spinner"></span> Salvando...';
    try {
      await recordPessoal();
      close(true);
    } catch (err) {
      console.error('[pessoal-consent] erro:', err);
      showToast('Erro ao salvar. Tente de novo.', 'error');
      accept.disabled = false;
      accept.innerHTML = '✓ Aceitar e entrar';
    }
  });
}
