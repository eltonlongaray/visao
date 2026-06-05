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


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: RENDER
// ═══════════════════════════════════════════════════════════════
export async function renderAjustes(app) {
  const user = auth.currentUser;
  const email = user?.email || '—';

  app.innerHTML = `
    <div class="ajustes-screen">
      <header class="legal-header">
        <button class="legal-back" id="ajustesBackBtn" aria-label="Voltar">‹</button>
        <div class="legal-header-title">Ajustes</div>
      </header>

      <div class="ajustes-content">

        <div class="ajustes-account">
          <div class="ajustes-avatar">👁</div>
          <div class="ajustes-account-info">
            <strong>${escape(email)}</strong>
            <small>Logado · Plano gratuito</small>
          </div>
        </div>

        <section class="ajustes-section">
          <div class="ajustes-section-title">🔐 Segurança</div>
          <div class="ajustes-row" id="rowBio">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Bloqueio biométrico</div>
              <div class="ajustes-row-sub">Face ID, digital ou senha do celular</div>
            </div>
            <label class="ajustes-toggle">
              <input type="checkbox" id="bioToggle">
              <span class="ajustes-toggle-slider"></span>
            </label>
          </div>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">📊 Seus dados</div>
          <button class="ajustes-row clickable" id="exportJsonBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Exportar como JSON</div>
              <div class="ajustes-row-sub">Backup técnico (portabilidade LGPD)</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable" id="exportPdfBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Gerar relatório (PDF)</div>
              <div class="ajustes-row-sub">Resumo bonito da sua rotina</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">📄 Legal</div>
          <button class="ajustes-row clickable" data-route="/termos">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Termos de Uso</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable" data-route="/privacidade">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Política de Privacidade</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <section class="ajustes-section">
          <div class="ajustes-section-title">🚪 Conta</div>
          <button class="ajustes-row clickable" id="signOutBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Sair</div>
              <div class="ajustes-row-sub">Você precisará logar de novo</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable danger" id="deleteAccountBtn">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">Excluir minha conta</div>
              <div class="ajustes-row-sub">Apaga TODOS os seus dados permanentemente</div>
            </div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        </section>

        <div class="ajustes-version">
          Visão · v1.0.0 · MVP<br>
          Desenvolvido por Élton Longaray
        </div>
      </div>
    </div>
  `;

  await wire(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WIRES
// ═══════════════════════════════════════════════════════════════
async function wire(app) {
  app.querySelector('#ajustesBackBtn')?.addEventListener('click', () => navigate('/modalidade'));

  app.querySelectorAll('[data-route]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.route))
  );

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
