// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /privacidade — exibe a Política de Privacidade
// ═══════════════════════════════════════════════════════════════
import { PRIVACIDADE_HTML } from '../legal-text.js';

export function renderPrivacidade(app) {
  app.innerHTML = `
    <div class="legal-screen">
      <header class="legal-header">
        <button class="legal-back" id="legalBackBtn" aria-label="Voltar">‹</button>
        <div class="legal-header-title">Política de Privacidade</div>
      </header>
      <div class="legal-content">${PRIVACIDADE_HTML}</div>
    </div>
  `;
  app.querySelector('#legalBackBtn')?.addEventListener('click', () => history.back());
}
