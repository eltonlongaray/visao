// Boas-vindas — só aparece pra usuários novos (sem template escolhido ainda)
import { navigate } from '../router.js';
import { showToast } from '../toast.js';
import { setProfile, seedOrganizacaoPessoal } from '../store.js';

export function renderWelcome(app) {
  app.innerHTML = `
    <div class="onboarding">
      <div class="onboarding-logo">👁</div>
      <div class="onboarding-title">Falcon</div>
      <div class="onboarding-sub" style="font-weight:600;color:var(--accent-2);margin-bottom:6px">Bem-vindo!</div>
      <div class="onboarding-sub">Conta criada. Escolha um template pra começar.</div>

      <div class="onb-section-label">📋 Templates disponíveis</div>

      <div class="template-card featured" data-template="organizacao">
        <div class="template-icon" style="background:rgba(52,211,153,0.20)">📋</div>
        <div class="template-info">
          <div class="template-name">Organização Pessoal</div>
          <div class="template-desc">Rotina diária, hábitos, atividades por turno e gráficos de aderência.</div>
          <span class="template-badge">★ Disponível agora</span>
        </div>
        <div class="template-arrow">›</div>
      </div>

      <div class="template-card template-financeiro" data-template="financeiro">
        <div class="template-icon" style="background:rgba(251,191,36,0.20)">💰</div>
        <div class="template-info">
          <div class="template-name">Planejamento Financeiro</div>
          <div class="template-desc">Controle de ganhos, gastos, metas e investimentos.</div>
          <span class="template-badge" style="background:var(--orange);color:#0e1326">EM BREVE</span>
        </div>
        <div class="template-arrow">›</div>
      </div>

      <div class="onb-footer">
        Os cards vêm como exemplo. Na Home você renomeia, remove ou adiciona quantas atividades quiser.
      </div>
    </div>
  `;

  document.querySelector('[data-template="organizacao"]').addEventListener('click', async () => {
    const card = document.querySelector('[data-template="organizacao"]');
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
    try {
      await setProfile({ template: 'organizacao', createdAt: new Date().toISOString() });
      await seedOrganizacaoPessoal();
      navigate('/home');
    } catch (err) {
      console.error('[Visão] seed error:', err);
      showToast('Erro: ' + (err.message || 'tente novamente'), 'error');
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    }
  });

  document.querySelector('[data-template="financeiro"]').addEventListener('click', () => {
    showToast('🔧 Em desenvolvimento — abriremos em breve!', 'info');
  });
}
