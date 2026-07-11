// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /privacidade — exibe a Política de Privacidade
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Exibe a Política de Privacidade da aplicação
// ─────────────────────────────────────────────────────────────
import { PRIVACIDADE_HTML } from '../textos-legais.js';

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
