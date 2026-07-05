// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela de Ajustes
// Concentra: biometria · export JSON · relatório PDF · termos · sair · excluir conta
// ═══════════════════════════════════════════════════════════════
import { auth, signOut } from '../firebase.js';
import { navigate } from '../router.js';
import { showToast, confirmModal } from '../toast.js';
import * as biometric from '../biometric.js';
import { downloadJson, openPdfReport } from '../store-export.js';
import { deleteMyAccount } from '../account-delete.js';
import { playDelete } from '../sounds.js';
import * as tour from '../tour.js';
import { isAdmin } from '../admin.js';
import { bottomNav } from '../components/bottom-nav.js';
import { t } from '../i18n.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: RENDER
// ═══════════════════════════════════════════════════════════════
export async function renderAjustes(app) {
  const user = auth.currentUser;
  const email = user?.email || '—';

  app.innerHTML = `
    <div class="ajustes-screen">
      <div class="ajustes-content">
        <div class="screen-title">
          <h1>${t('ajustes.title')}</h1>
          <div class="sub">${t('ajustes.sub')}</div>
        </div>

        <div class="ajustes-account">
          <div class="ajustes-avatar">👁</div>
          <div class="ajustes-account-info">
            <strong>${escape(email)}</strong>
            <small>${t('ajustes.plan')}</small>
          </div>
        </div>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.security')}</div>
          <div class="ajustes-row" id="rowBio">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.bio.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.bio.sub')}</div>
            </div>
            <label class="ajustes-toggle">
              <input type="checkbox" id="bioToggle">
              <span class="ajustes-toggle-slider"></span>
            </label>
          </div>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.data')}</div>
          <button class="ajustes-row clickable" id="exportJsonBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.json.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.json.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable" id="exportPdfBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.pdf.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.pdf.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.tutorial')}</div>
          <button class="ajustes-row clickable" id="restartTourBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.tutorial.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.tutorial.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.legal')}</div>
          <button class="ajustes-row clickable" data-route="/termos">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.terms.title')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable" data-route="/privacidade">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.privacy.title')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.modal.section')}</div>
          <button class="ajustes-row clickable" id="trocarModalidadeBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.modal.change')}</div>
              <div class="ajustes-row-sub">${t('ajustes.modal.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.app')}</div>
          <button class="ajustes-row clickable" id="forceUpdateBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.update.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.update.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">${t('ajustes.account')}</div>
          <button class="ajustes-row clickable" id="signOutBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.signout')}</div>
              <div class="ajustes-row-sub">${t('ajustes.signout.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable danger" id="deleteAccountBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.delete.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.delete.sub')}</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <div class="ajustes-version">
          Visão · v1.0.0 · MVP<br>
          Desenvolvido por Élton Longaray
        </div>
      </div>
      ${bottomNav('ajustes')}
    </div>
  `;

  await wire(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WIRES
// ═══════════════════════════════════════════════════════════════
async function wire(app) {
  app.querySelectorAll('[data-route]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.route))
  );

  app.querySelector('#trocarModalidadeBtn')?.addEventListener('click', () => navigate('/modalidade'));

  // ── Bio toggle ──
  const bioToggle = app.querySelector('#bioToggle');
  const bioAvailable = await biometric.isAvailable();
  bioToggle.checked = biometric.isEnabled();
  bioToggle.disabled = !bioAvailable;

  if (!bioAvailable) {
    app.querySelector('#rowBio .ajustes-row-sub').textContent =
      'Seu celular não tem desbloqueio configurado.';
  }

  bioToggle.addEventListener('change', async () => {
    if (bioToggle.checked) {
      // Ativar
      bioToggle.disabled = true;
      try {
        const user = auth.currentUser;
        await biometric.register(user.uid, user.email || 'Visão');
        showToast('Bloqueio biométrico ativado.', 'success');
      } catch (err) {
        console.warn('[ajustes] bio enable falhou:', err);
        bioToggle.checked = false;
        const msg = err?.name === 'NotAllowedError'
          ? 'Cancelado.'
          : 'Não foi possível ativar.';
        showToast(msg, 'error');
      } finally {
        bioToggle.disabled = false;
      }
    } else {
      // Desativar
      biometric.disable();
      showToast('Bloqueio biométrico desativado.', 'info');
    }
  });

  // ── Export JSON ──
  app.querySelector('#exportJsonBtn')?.addEventListener('click', async () => {
    const btn = app.querySelector('#exportJsonBtn');
    const sub = btn.querySelector('.ajustes-row-sub');
    const original = sub.textContent;
    sub.textContent = 'Coletando seus dados...';
    try {
      await downloadJson();
      sub.textContent = 'Download iniciado!';
      setTimeout(() => sub.textContent = original, 2200);
    } catch (err) {
      console.error('[ajustes] export json:', err);
      showToast('Erro ao exportar. Tente novamente.', 'error');
      sub.textContent = original;
    }
  });

  // ── Relatório PDF ──
  app.querySelector('#exportPdfBtn')?.addEventListener('click', async () => {
    const btn = app.querySelector('#exportPdfBtn');
    const sub = btn.querySelector('.ajustes-row-sub');
    const original = sub.textContent;
    sub.textContent = 'Montando relatório...';
    try {
      await openPdfReport();
      sub.textContent = 'Abriu numa nova aba!';
      setTimeout(() => sub.textContent = original, 2400);
    } catch (err) {
      console.error('[ajustes] export pdf:', err);
      const msg = (err?.message || '').includes('popup')
        ? 'Permita pop-ups pro app gerar o PDF.'
        : 'Erro ao gerar relatório.';
      showToast(msg, 'error');
      sub.textContent = original;
    }
  });

  // ── Reiniciar tour de boas-vindas ──
  app.querySelector('#restartTourBtn')?.addEventListener('click', async () => {
    tour.reset();
    showToast('Iniciando tutorial...', 'success');
    navigate('/home');
    // Aguarda Home renderizar antes de iniciar o tour
    const { ONBOARDING_STEPS } = await import('../tour-config.js');
    setTimeout(() => tour.start(ONBOARDING_STEPS), 700);
  });

  // ── Forçar atualização ──
  app.querySelector('#forceUpdateBtn')?.addEventListener('click', async () => {
    const btn = app.querySelector('#forceUpdateBtn');
    const sub = btn.querySelector('.ajustes-row-sub');
    sub.textContent = 'Limpando cache...';
    btn.disabled = true;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      localStorage.removeItem('_visao_build');
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      sub.textContent = 'Reiniciando...';
      setTimeout(() => window.location.reload(true), 400);
    } catch (err) {
      console.error('[ajustes] forceUpdate:', err);
      sub.textContent = 'Erro ao atualizar. Tente de novo.';
      btn.disabled = false;
    }
  });

  // ── Sair ──
  app.querySelector('#signOutBtn')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Sair da conta?',
      message: 'Você precisará fazer login de novo. Seus dados continuam salvos.',
      confirmText: 'Sair',
      cancelText: 'Cancelar'
    });
    if (!ok) return;
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('[ajustes] signOut:', err);
      showToast('Erro ao sair.', 'error');
    }
  });

  // ── Excluir conta ──
  app.querySelector('#deleteAccountBtn')?.addEventListener('click', async () => {
    const ok1 = await confirmModal({
      title: '⚠️ Excluir conta?',
      message: 'TODOS os seus dados (atividades, ritual, reflexões, sono, hidratação) serão APAGADOS PARA SEMPRE. Esta ação não pode ser desfeita.',
      confirmText: 'Continuar',
      cancelText: 'Cancelar',
      danger: true
    });
    if (!ok1) return;

    const ok2 = await confirmModal({
      title: 'Tem certeza absoluta?',
      message: 'Última chance. Após confirmar, sua conta e seus dados serão eliminados imediatamente.',
      confirmText: 'Sim, excluir tudo',
      cancelText: 'Voltar',
      danger: true
    });
    if (!ok2) return;

    playDelete();
    const btn = app.querySelector('#deleteAccountBtn');
    btn.disabled = true;
    btn.style.opacity = '0.6';

    try {
      const result = await deleteMyAccount();

      if (result.auth === 'requires-recent-login') {
        showToast('Por segurança, faça login de novo pra concluir.', 'info');
        try { await signOut(auth); } catch {}
        navigate('/login');
        return;
      }

      showToast('Conta excluída com sucesso. Até logo!', 'success');
      try { await signOut(auth); } catch {}
      navigate('/login');
    } catch (err) {
      console.error('[ajustes] delete account:', err);
      showToast('Erro ao excluir. Tente novamente em alguns minutos.', 'error');
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HELPERS
// ═══════════════════════════════════════════════════════════════
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
