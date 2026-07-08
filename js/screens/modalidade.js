// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import { auth, db, doc, getDoc } from '../firebase.js';
import { navigate } from '../router.js';
import { showToast } from '../toast.js';
import { maybeOpenBioPrompt } from '../bio-prompt-modal.js';
import { ensurePessoalConsent } from '../pessoal-consent-modal.js';
import { t, LANGS, getLang, setLang } from '../i18n.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
export function renderModalidade(app) {
  const user = auth.currentUser;
  const firstName = (user?.displayName || user?.email || 'amigo').split(/[ @]/)[0];

  app.innerHTML = `
    <div class="onboarding modalidade-screen">
      <div class="onboarding-logo" style="background:#4f46e5"><img src="icons/icon-192.png?v=95" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;"></div>
      <div class="onboarding-title">Falcon</div>
      <div class="onboarding-sub" style="font-weight:600;color:var(--accent-2);margin-bottom:6px">
        ${t('modal.hello', { name: escapeHtml(firstName) })}
      </div>
      <div class="onboarding-sub">${t('modal.start')}</div>

      <!-- SELETOR DE IDIOMA -->
      <div class="lang-picker">
        <span class="lang-picker-label">${t('modal.lang.title')}</span>
        <div class="lang-flags">
          ${LANGS.map(l => `
            <button
              class="lang-flag-btn ${getLang() === l.code ? 'active' : ''}"
              data-lang="${l.code}"
              title="${l.label}"
              aria-label="${l.label}"
            >${l.flag}</button>
          `).join('')}
        </div>
      </div>

      <div class="onb-section-label">${t('modal.section')}</div>

      <div class="template-card featured modalidade-card" data-modalidade="pessoal">
        <span class="modalidade-badge dispo">
          <span class="modalidade-badge-dot"></span>
          ${t('modal.pessoal.badge')}
        </span>
        <div class="template-icon" style="background:rgba(124,58,237,0.20)">📋</div>
        <div class="template-info">
          <div class="template-name">${t('modal.pessoal.name')}</div>
          <div class="template-desc">${t('modal.pessoal.desc')}</div>
        </div>
        <div class="template-arrow">›</div>
      </div>

      <div class="template-card template-financeiro modalidade-card" data-modalidade="financeira">
        <span class="modalidade-badge soon">
          ${t('modal.fin.badge')}
        </span>
        <div class="template-icon" style="background:rgba(245,158,11,0.20)">💰</div>
        <div class="template-info">
          <div class="template-name">${t('modal.fin.name')}</div>
          <div class="template-desc">${t('modal.fin.desc')}</div>
        </div>
        <div class="template-arrow">›</div>
      </div>

      <div class="onb-footer">
        ${t('modal.footer')}
      </div>

      <div style="margin-top:22px;text-align:center">
        <button id="btnSairModalidade" class="btn-sair-modalidade" type="button">
          ${t('modal.logout')}
        </button>
      </div>
    </div>
  `;

  attachHandlers(app);

  setTimeout(() => { maybeOpenBioPrompt(); }, 450);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HANDLERS
// ═══════════════════════════════════════════════════════════════
function attachHandlers(app) {
  // ── Flags de idioma ──────────────────────────────────────────
  app.querySelectorAll('.lang-flag-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.lang;
      await setLang(code);
      renderModalidade(app);
    });
  });

  // ── Pessoal ──────────────────────────────────────────────────
  app.querySelector('[data-modalidade="pessoal"]')?.addEventListener('click', async () => {
    const card = app.querySelector('[data-modalidade="pessoal"]');
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
    try {
      const user = auth.currentUser;
      if (!user) { navigate('/login'); return; }

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
      showToast(t('toast.error.load'), 'error');
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    }
  });

  // ── Financeira ───────────────────────────────────────────────
  app.querySelector('[data-modalidade="financeira"]')?.addEventListener('click', () => {
    showToast(t('toast.fin.soon'), 'info');
  });

  app.querySelector('#goAjustesBtn')?.addEventListener('click', () => navigate('/ajustes'));

  // ── Sair ─────────────────────────────────────────────────────
  app.querySelector('#btnSairModalidade')?.addEventListener('click', async () => {
    try {
      const { signOut } = await import('../firebase.js');
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('[Visão] signOut erro:', err);
      showToast(t('toast.error.load'), 'error');
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
