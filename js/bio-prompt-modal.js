// ═══════════════════════════════════════════════════════════════
// VISÃO · Modal de oferta de bloqueio biométrico
// Aparece em sobreposição (full-screen overlay) na 1ª vez que
// o usuário cai na tela de modalidade. Direto e claro.
// ═══════════════════════════════════════════════════════════════
import * as biometric from './biometric.js';
import { auth } from './firebase.js';
import { showToast } from './toast.js';

let modal = null;


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PUBLIC — open() / close()
// ═══════════════════════════════════════════════════════════════
export async function maybeOpenBioPrompt() {
  const user = auth.currentUser;
  if (!user) return;
  if (biometric.isEnabledForUser(user.uid)) return;
  if (biometric.isDismissed()) return;

  const available = await biometric.isAvailable();
  open(available ? 'offer' : 'warn');
}

function close() {
  if (!modal) return;
  modal.classList.add('closing');
  setTimeout(() => {
    modal?.remove();
    modal = null;
    document.body.classList.remove('bio-modal-open');
  }, 220);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
function open(mode) {
  if (modal) return;

  modal = document.createElement('div');
  modal.className = 'bio-modal-overlay';
  modal.innerHTML = mode === 'offer' ? offerHtml() : warnHtml();
  document.body.appendChild(modal);
  document.body.classList.add('bio-modal-open');

  if (mode === 'offer') wireOffer();
  else wireWarn();
}

function offerHtml() {
  return `
    <div class="bio-modal-card">
      <div class="bio-modal-icon">🔐</div>
      <h2 class="bio-modal-title">Proteja seu Falcon</h2>
      <p class="bio-modal-text" style="margin-bottom:24px">
        Trave o app com o <strong>desbloqueio do seu celular</strong> —
        Face ID, digital ou senha.
      </p>

      <button class="bio-modal-btn primary" id="bioEnableBtn">
        🔓 Ativar proteção
      </button>
      <button class="bio-modal-btn ghost" id="bioDismissBtn">
        Agora não
      </button>
    </div>
  `;
}

function warnHtml() {
  return `
    <div class="bio-modal-card warn">
      <div class="bio-modal-icon">⚠️</div>
      <h2 class="bio-modal-title">Seu celular está desprotegido</h2>
      <p class="bio-modal-text">
        Você não tem <strong>Face ID, digital ou senha</strong>
        configurado no celular.
      </p>
      <p class="bio-modal-text-sub">
        Pra sua segurança, vá nos ajustes do seu celular e configure
        um desbloqueio. Sem isso, qualquer pessoa com seu aparelho
        consegue acessar seus dados.
      </p>

      <button class="bio-modal-btn primary" id="bioDismissBtn">
        Entendi
      </button>
    </div>
  `;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: WIRES
// ═══════════════════════════════════════════════════════════════
function wireOffer() {
  modal.querySelector('#bioDismissBtn')?.addEventListener('click', () => {
    biometric.dismissPrompt();
    close();
  });

  modal.querySelector('#bioEnableBtn')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#bioEnableBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="bio-spinner"></span> Aguarde...';
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado');
      await biometric.register(user.uid, user.email || user.displayName || 'Falcon User');
      flashSuccess();
    } catch (err) {
      console.warn('[bio] register falhou:', err?.name, err?.message);
      btn.disabled = false;
      btn.innerHTML = '🔓 Ativar proteção';
      const msg = err?.name === 'NotAllowedError'
        ? 'Cancelado. Tente de novo quando quiser.'
        : 'Não foi possível ativar. Verifique se o desbloqueio do celular está configurado.';
      showToast(msg, 'error');
    }
  });
}

function wireWarn() {
  modal.querySelector('#bioDismissBtn')?.addEventListener('click', () => {
    biometric.dismissPrompt();
    close();
  });
}

function flashSuccess() {
  if (!modal) return;
  modal.innerHTML = `
    <div class="bio-modal-card ok">
      <div class="bio-modal-icon">✅</div>
      <h2 class="bio-modal-title">Proteção ativada!</h2>
      <p class="bio-modal-text">
        Pediremos seu desbloqueio quando o app ficar
        em segundo plano por mais de 20 segundos.
      </p>
    </div>
  `;
  setTimeout(close, 2200);
}
