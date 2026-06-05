// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Tela de escolha de modalidade — aparece logo após o login, antes da Home.
// O usuário escolhe entre "Organização Pessoal" (módulo atual) e
// "Organização Financeira" (em breve).
import { auth, db, doc, getDoc } from '../firebase.js';
import { navigate } from '../router.js';
import { showToast } from '../toast.js';
import * as biometric from '../biometric.js';


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

      <div id="bioPromptSlot"></div>

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
  maybeShowBioPrompt(app);
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
// BLOCO 4: PROMPT DE BIOMETRIA (1ª vez)
// ═══════════════════════════════════════════════════════════════
async function maybeShowBioPrompt(app) {
  const user = auth.currentUser;
  if (!user) return;

  const slot = app.querySelector('#bioPromptSlot');
  if (!slot) return;

  // Já habilitado pra este user OU usuário dispensou → nada a mostrar
  if (biometric.isEnabledForUser(user.uid)) return;
  if (biometric.isDismissed()) return;

  const available = await biometric.isAvailable();

  if (!available) {
    // Device sem biometria/PIN configurado → orienta uma vez
    slot.innerHTML = `
      <div class="bio-prompt warn">
        <div class="bio-prompt-icon">⚠️</div>
        <div class="bio-prompt-body">
          <strong>Seu celular não tem desbloqueio configurado.</strong>
          <small>Configure uma senha, digital ou Face ID nos ajustes do celular pra proteger seus dados.</small>
        </div>
        <button class="bio-prompt-x" id="bioDismissBtn" title="Não mostrar mais">×</button>
      </div>
    `;
    slot.querySelector('#bioDismissBtn')?.addEventListener('click', () => {
      biometric.dismissPrompt();
      slot.innerHTML = '';
    });
    return;
  }

  // Device suporta → oferece ativar
  slot.innerHTML = `
    <div class="bio-prompt">
      <div class="bio-prompt-icon">🔐</div>
      <div class="bio-prompt-body">
        <strong>Proteja seu Visão</strong>
        <small>Use Face ID, digital ou o desbloqueio do celular pra travar o app.</small>
      </div>
      <div class="bio-prompt-actions">
        <button class="bio-btn-primary" id="bioEnableBtn">Ativar</button>
        <button class="bio-btn-ghost" id="bioDismissBtn">Agora não</button>
      </div>
    </div>
  `;

  slot.querySelector('#bioDismissBtn')?.addEventListener('click', () => {
    biometric.dismissPrompt();
    slot.innerHTML = '';
  });

  slot.querySelector('#bioEnableBtn')?.addEventListener('click', async () => {
    const btn = slot.querySelector('#bioEnableBtn');
    btn.disabled = true;
    btn.textContent = 'Aguarde...';
    try {
      await biometric.register(user.uid, user.email || user.displayName || 'Visão User');
      slot.innerHTML = `
        <div class="bio-prompt ok">
          <div class="bio-prompt-icon">✅</div>
          <div class="bio-prompt-body">
            <strong>Bloqueio ativado!</strong>
            <small>Pediremos seu desbloqueio quando o app ficar 20s em segundo plano.</small>
          </div>
        </div>
      `;
      setTimeout(() => { slot.innerHTML = ''; }, 3500);
    } catch (err) {
      console.warn('[bio] register falhou:', err?.name, err?.message);
      btn.disabled = false;
      btn.textContent = 'Ativar';
      const msg = err?.name === 'NotAllowedError'
        ? 'Cancelado.'
        : 'Não foi possível ativar. Verifique se há senha/digital configurada no celular.';
      showToast(msg, 'error');
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: HELPERS
// ═══════════════════════════════════════════════════════════════
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
