// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /financeiro — aba do menu inferior (Élton, 18/11)
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: casca da aba Financeiro, com os cards Pessoal e
// Profissional ainda EM DESENVOLVIMENTO (só avisam ao tocar).
// ─────────────────────────────────────────────────────────────
// Plano combinado com o Élton:
//  • Profissional: receitas e despesas separadas por FONTE DE RENDA
//    (ex.: terapeuta = clientes + cursos pras alunas; empresas podem ter
//    3, 4, 5 fontes). A fonte "Clientes" pode puxar o que já entra pela
//    Agenda Online (financeiro.js), pra ninguém lançar duas vezes.
//  • Pessoal: a SOMA dos pró-labores (cada fonte de renda tem o seu) +
//    as despesas pessoais, sem misturar com o profissional.
import { bottomNav } from '../components/menu-inferior.js';
import { showToast } from '../aviso-tela.js';

export function renderFinanceiro(app) {
  app.innerHTML = `<div class="screen-pad fin-screen">
    <div class="pf-header"><div class="pf-title">💰 Financeiro</div></div>
    <div class="fr-hub fin-hub">
      <button class="fr-hubcard" data-fin="pessoal" type="button">
        <span class="fr-hub-ic">👤</span>
        <span class="fr-hub-tx"><b>Financeiro pessoal</b><small>A soma dos pró-labores de cada fonte de renda e suas despesas pessoais</small></span>
        <span class="fr-hub-tag">EM BREVE</span>
      </button>
      <button class="fr-hubcard" data-fin="profissional" type="button">
        <span class="fr-hub-ic">💼</span>
        <span class="fr-hub-tx"><b>Financeiro profissional</b><small>Receitas e despesas de cada fonte de renda do seu trabalho</small></span>
        <span class="fr-hub-tag">EM BREVE</span>
      </button>
    </div>
  </div>${bottomNav('financeiro')}`;
  app.querySelector('.fin-hub').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fin]');
    if (!b) return;
    const nome = b.dataset.fin === 'pessoal' ? '👤 Financeiro pessoal' : '💼 Financeiro profissional';
    showToast(`${nome} está em desenvolvimento. Em breve! 🦅`, 'info');
  });
}
