// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Tela de escolha de modalidade — aparece logo após o login, antes da Home.
// O usuário escolhe entre "Organização Pessoal" (módulo atual) e
// "Organização Financeira" (em breve).
import { auth, db, doc, getDoc } from '../firebase.js';
import { navigate } from '../router.js';
import { showToast } from '../toast.js';
import { maybeOpenBioPrompt } from '../bio-prompt-modal.js';
import { ensurePessoalConsent } from '../pessoal-consent-modal.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
export function renderModalidade(app) {
  const user = auth.currentUser;
  const firstName = (user?.displayName || user?.email || 'amigo').split(/[ @]/)[0];

  app.innerHTML = `
    <div class="onboarding modalidade-screen">
      <div class="onboarding-logo">👁</div>
      <div class="onboarding-title">Visão</div>
      <div class="onboarding-sub" style="font-weight:600;color:var(--accent-2);margin-bottom:6px">
        Olá, ${escapeHtml(firstName)} 👋
      </div>
      <div class="onboarding-sub">Por onde você quer começar hoje?</div>

      <div class="onb-section-label">🎯 Modalidades</div>

      <div class="template-card featured modalidade-card" data-modalidade="pessoal">
        <span class="modalidade-badge dispo">
          <span class="modalidade-badge-dot"></span>
          Disponível
        </span>
        <div class="template-icon" style="background:rgba(124,58,237,0.20)">📋</div>
        <div class="template-info">
          <div class="template-name">Organização Pessoal</div>
          <div class="template-desc">Rotina, hábitos, atividades por turno e gráficos de aderência.</div>
        </div>
        <div class="template-arrow">›</div>
      </div>

      <div class="template-card template-financeiro modalidade-card" data-modalidade="financeira">
        <span class="modalidade-badge soon">
          ⏳ Em breve
        </span>
        <div class="template-icon" style="background:rgba(245,158,11,0.20)">💰</div>
        <div class="template-info">
          <div class="template-name">Organização Financeira</div>
          <div class="template-desc">Ganhos, gastos, metas e investimentos sob seu olhar.</div>
        </div>
        <div class="template-arrow">›</div>
      </div>

      <div class="onb-footer">
        Você pode trocar de modalidade a qualquer momento — sai e entra de novo no app.
      </div>

      <div style="margin-top:16px;text-align:center">
        <button id="btnSairModalidade" class="login-link" style="background:none;border:none;cursor:pointer">
          Sair da conta
        </button>
      </div>
    </div>
  `;

  attachHandlers(app);

  // Pequeno atraso pro modal não competir com a animação de entrada da tela
  setTimeout(() => { maybeOpenBioPrompt(); }, 450);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HANDLERS DE MODALIDADE
// ═══════════════════════════════════════════════════════════════
function attachHandlers(app) {
  app.querySelector('[data-modalidade="pessoal"]')?.addEventListener('click', async () => {
    const card = app.querySelector('[data-modalidade="pessoal"]');
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
    try {
      const user = auth.currentUser;
      if (!user) { navigate('/login'); return; }

      // Gate: consent específico pra dados sensíveis de saúde
      const ok = await ensurePessoalConsent();
      if (!ok) {
        card.style.opacity = '1';
        card.style.pointerEvents = 'auto';
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const hasTemplate = userDoc.exists() && userDoc.data()?.template;
      navigate(hasTemplate ? '/home' : '/welcome');
    } catch (err) {
      console.error('[Visão] modalidade pessoal erro:', err);
      showToast('Erro ao carregar. Tente novamente.', 'error');
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    }
  });

  app.querySelector('[data-modalidade="financeira"]')?.addEventListener('click', () => {
    showToast('💰 Organização Financeira em desenvolvimento — em breve!', 'info');
  });

  app.querySelector('#goAjustesBtn')?.addEventListener('click', () => navigate('/ajustes'));

  app.querySelector('#btnSairModalidade')?.addEventListener('click', async () => {
    try {
      const { signOut } = await import('../firebase.js');
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('[Visão] signOut erro:', err);
      showToast('Erro ao sair. Tente novamente.', 'error');
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: HELPERS
// ═══════════════════════════════════════════════════════════════
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
