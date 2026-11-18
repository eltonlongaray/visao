// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — RENDER (entrada automática)
// BLOCO 3 — FLUXO (consentimento → Home)
// BLOCO 4 — HELPERS
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import { auth } from '../autenticacao.js';
import { getProfile } from '../banco-dados.js';
import { navigate } from '../roteador.js';
import { showToast } from '../aviso-tela.js';
import { maybeOpenBioPrompt } from '../modal-biometria.js';
import { ensurePessoalConsent } from '../modal-dados-saude.js';
import { t } from '../idioma.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER — entrada automática
// ═══════════════════════════════════════════════════════════════
// A escolha de modalidade (Pessoal / Financeira) deixou de existir (Élton,
// 18/11): o Financeiro virou aba do menu. A rota /modalidade continua só como
// PORTA DE ENTRADA depois do login/aceite: pede o consentimento dos dados de
// saúde (LGPD, uma vez só) e segue direto pra Home (ou pro /welcome de quem
// ainda não escolheu o template). Idioma foi pra Home, Sair também.
export async function renderModalidade(app) {
  app.innerHTML = `
    <div class="onboarding modalidade-screen">
      <div class="onboarding-logo" style="background:#4f46e5"><img src="icons/icon-192.png?v=95" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;"></div>
      <div class="onboarding-title">Falcon</div>
    </div>`;
  await entrar(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: FLUXO
// ═══════════════════════════════════════════════════════════════
async function entrar(app) {
  try {
    const user = auth.currentUser;
    if (!user) { navigate('/login'); return; }

    const ok = await ensurePessoalConsent();
    if (!ok) { telaSemAceite(app); return; }

    const profile = await getProfile();
    navigate(profile?.template ? '/home' : '/welcome');
    setTimeout(() => { maybeOpenBioPrompt(); }, 450);
  } catch (err) {
    console.error('[Visão] entrada erro:', err);
    showToast(t('toast.error.load'), 'error');
    telaSemAceite(app, true);
  }
}

// Recusou o consentimento (ou deu erro): sem ele o app não funciona, então
// mostra o porquê e deixa aceitar de novo ou sair.
function telaSemAceite(app, erro = false) {
  app.innerHTML = `
    <div class="onboarding modalidade-screen">
      <div class="onboarding-logo" style="background:#4f46e5"><img src="icons/icon-192.png?v=95" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;"></div>
      <div class="onboarding-title">Falcon</div>
      <div class="onboarding-sub">${erro
        ? 'Não consegui carregar agora. Confere a internet e tenta de novo.'
        : 'Pra usar o Falcon a gente precisa do teu aceite pros dados de rotina (sono, hidratação, atividades). Eles ficam só contigo.'}</div>
      <button id="btnEntrarDeNovo" class="btn-primary" type="button" style="margin-top:18px;width:100%;max-width:320px">${erro ? 'Tentar de novo' : 'Ver e aceitar'}</button>
      <div style="margin-top:22px;text-align:center">
        <button id="btnSairModalidade" class="btn-sair-modalidade" type="button">${t('modal.logout')}</button>
      </div>
    </div>`;
  app.querySelector('#btnEntrarDeNovo')?.addEventListener('click', () => renderModalidade(app));
  app.querySelector('#btnSairModalidade')?.addEventListener('click', async () => {
    try {
      const { signOut } = await import('../autenticacao.js');
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
