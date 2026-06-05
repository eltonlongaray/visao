// ═══════════════════════════════════════════════════════════════
// VISÃO · Lock screen + timer de auto-lock
// - Overlay full-screen mostrado quando bio está ativo
// - Lock automático após 20s em segundo plano
// ═══════════════════════════════════════════════════════════════
import * as biometric from './biometric.js';
import { auth } from './firebase.js';
import { signOut } from './firebase.js';

const BG_TIMEOUT_MS = 120_000;  // 2 minutos em segundo plano antes de travar

let overlay = null;
let hiddenAt = null;
let unlocking = false;


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: SHOW / HIDE LOCK OVERLAY
// ═══════════════════════════════════════════════════════════════
export function showLock() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.className = 'lock-overlay';
  overlay.innerHTML = `
    <div class="lock-card">
      <div class="lock-icon">🔒</div>
      <div class="lock-title">Visão</div>
      <div class="lock-sub">Toque pra desbloquear</div>
      <button class="lock-btn" id="lockUnlockBtn">
        <span class="lock-btn-icon">🔓</span>
        <span>Desbloquear</span>
      </button>
      <div id="lockError" class="lock-error"></div>
      <button class="lock-signout-btn" id="lockSignOutBtn">Sair da conta</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('locked');

  overlay.querySelector('#lockUnlockBtn').addEventListener('click', tryUnlock);
  overlay.querySelector('#lockSignOutBtn').addEventListener('click', signOutFromLock);

  // Tenta destravar automaticamente ao abrir o overlay
  setTimeout(tryUnlock, 250);
}

export function hideLock() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  document.body.classList.remove('locked');
}

export function isLocked() {
  return !!overlay;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: UNLOCK FLOW
// ═══════════════════════════════════════════════════════════════
async function tryUnlock() {
  if (unlocking) return;
  unlocking = true;
  const errEl = overlay?.querySelector('#lockError');
  if (errEl) errEl.textContent = '';
  try {
    await biometric.verify();
    hideLock();
  } catch (err) {
    console.warn('[lock] verify falhou:', err?.name, err?.message);
    if (errEl) {
      errEl.textContent = err?.name === 'NotAllowedError'
        ? 'Cancelado. Toque em Desbloquear pra tentar de novo.'
        : 'Falha no desbloqueio. Tente novamente.';
    }
  } finally {
    unlocking = false;
  }
}

async function signOutFromLock() {
  try {
    biometric.disable();
    await signOut(auth);
    hideLock();
  } catch (err) {
    console.error('[lock] signOut erro:', err);
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: AUTO-LOCK POR INATIVIDADE EM SEGUNDO PLANO
// ═══════════════════════════════════════════════════════════════
export function initAutoLock() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (hiddenAt) {
      const elapsed = Date.now() - hiddenAt;
      hiddenAt = null;
      if (elapsed >= BG_TIMEOUT_MS && biometric.isEnabled() && !isLocked()) {
        showLock();
      }
    }
  });

  // Também escuta pageshow (volta do bfcache no iOS Safari)
  window.addEventListener('pageshow', () => {
    if (hiddenAt) {
      const elapsed = Date.now() - hiddenAt;
      hiddenAt = null;
      if (elapsed >= BG_TIMEOUT_MS && biometric.isEnabled() && !isLocked()) {
        showLock();
      }
    }
  });
}
