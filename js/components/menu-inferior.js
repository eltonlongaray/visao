// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Componente bottom-nav reusável — recebe aba ativa e retorna HTML
// ─────────────────────────────────────────────────────────────
// Bottom nav reusável — recebe a aba ativa e renderiza
import { t } from '../idioma.js';

export function bottomNav(active) {
  return `
    <nav class="bottom-nav">
      <a href="#/home" class="nav-btn ${active === 'home' ? 'active' : ''}">
        <span class="nav-ic">🏠</span>${t('nav.home')}
      </a>
      <a href="#/ritual" class="nav-btn ${active === 'ritual' ? 'active' : ''}">
        <span class="nav-ic">🔮</span>${t('nav.ritual')}
      </a>
      <a href="#/desempenho" class="nav-btn ${active === 'desempenho' ? 'active' : ''}">
        <span class="nav-ic">📊</span>${t('nav.desempenho')}
      </a>
      <a href="#/ajustes" class="nav-btn ${active === 'ajustes' ? 'active' : ''}">
        <span class="nav-ic">⚙️</span>${t('nav.ajustes')}
      </a>
    </nav>
  `;
}
