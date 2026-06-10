// ═══════════════════════════════════════════════════════════════
// BLOCO 1: TOAST (mensagens flutuantes)
// ═══════════════════════════════════════════════════════════════
let toastEl = null;
let toastTimer = null;

export function showToast(message, type = 'info') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.className = 'toast toast-' + type + ' show';
  toastEl.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 1.5: LOCAL TOAST — flutua acima do elemento clicado
// Usado nas mensagens motivacionais ao marcar tarefa feita
// ═══════════════════════════════════════════════════════════════
export function showLocalToast(triggerEl, message, type = 'success') {
  if (!triggerEl) return showToast(message, type);
  const rect = triggerEl.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.className = 'local-toast local-toast-' + type;
  // Aceita HTML (mensagens motivacionais podem ter ícones embutidos)
  toast.innerHTML = message;
  toast.style.position = 'fixed';
  toast.style.left = (rect.left + rect.width / 2) + 'px';
  // ~1 card de distância acima da tarefa clicada
  toast.style.top = (rect.top - 60) + 'px';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, 2200);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONFIRM MODAL (substitui o confirm() feio do navegador)
// ═══════════════════════════════════════════════════════════════
export function confirmModal({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-confirm">
        ${danger ? '<div class="confirm-icon">⚠️</div>' : '<div class="confirm-icon">❓</div>'}
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="confirm-msg">${escapeHtml(message)}</div>
        <div class="modal-actions">
          <button class="btn-secondary" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Back button do celular = cancelar (não navega pra fora da aba atual)
    let popped = false, cameFromPop = false;
    const onPop = () => { cameFromPop = true; close(false); };
    window.addEventListener('popstate', onPop);
    history.pushState({ confirmModal: true }, '');

    const close = (result) => {
      if (popped) return;
      popped = true;
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', esc);
      modal.remove();
      if (!cameFromPop) setTimeout(() => { try { history.back(); } catch {} }, 0);
      resolve(result);
    };
    modal.querySelector('[data-act="cancel"]').onclick = () => close(false);
    modal.querySelector('[data-act="confirm"]').onclick = () => close(true);
    modal.addEventListener('click', e => { if (e.target === modal) close(false); });
    const esc = (ev) => { if (ev.key === 'Escape') close(false); };
    document.addEventListener('keydown', esc);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
