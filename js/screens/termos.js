// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /termos — exibe os Termos de Uso
// ═══════════════════════════════════════════════════════════════
import { TERMOS_HTML } from '../legal-text.js';

export function renderTermos(app) {
  app.innerHTML = `
    <div class="legal-screen">
      <header class="legal-header">
        <button class="legal-back" id="legalBackBtn" aria-label="Voltar">‹</button>
        <div class="legal-header-title">Termos de Uso</div>
      </header>
      <div class="legal-content">${TERMOS_HTML}</div>
    </div>
  `;
  app.querySelector('#legalBackBtn')?.addEventListener('click', () => history.back());
}
