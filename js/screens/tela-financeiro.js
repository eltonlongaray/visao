// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /financeiro — aba do menu inferior (Élton, 18/11)
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: casca da aba Financeiro, com as abas Pessoal e
// Profissional no topo, ainda EM DESENVOLVIMENTO.
// ─────────────────────────────────────────────────────────────
// Plano combinado com o Élton:
//  • Profissional: receitas e despesas separadas por FONTE DE RENDA
//    (ex.: terapeuta = clientes + cursos pras alunas; empresas podem ter
//    3, 4, 5 fontes). A fonte "Clientes" pode puxar o que já entra pela
//    Agenda Online (financeiro.js), pra ninguém lançar duas vezes.
//  • Pessoal: a SOMA dos pró-labores (cada fonte de renda tem o seu) +
//    as despesas pessoais, sem misturar com o profissional.
import { bottomNav } from '../components/menu-inferior.js';

// Abas no topo, igual à Comunidade (Élton, 18/11: no lugar dos dois cards)
let aba = 'pessoal';   // 'pessoal' | 'profissional'

const CONTEUDO = {
  pessoal: {
    ic: '👤', titulo: 'Financeiro pessoal',
    texto: 'Aqui vai ficar a soma dos pró-labores de cada fonte de renda e as suas despesas pessoais, separadas do trabalho.',
  },
  profissional: {
    ic: '💼', titulo: 'Financeiro profissional',
    texto: 'Aqui você vai adicionar suas fontes de renda e ver as receitas, despesas e o pró-labore de cada uma.',
  },
};

function corpo() {
  const c = CONTEUDO[aba];
  return `<div class="fin-breve">
    <div class="fin-breve-ic">${c.ic}</div>
    <b>${c.titulo}</b>
    <p>${c.texto}</p>
    <span class="fr-hub-tag">EM DESENVOLVIMENTO</span>
  </div>`;
}

export function renderFinanceiro(app) {
  app.innerHTML = `<div class="screen-pad fin-screen">
    <div class="screen-title">
      <h1>💰 Financeiro</h1>
      <div class="sub">Pessoal e profissional, cada um no seu lugar.</div>
    </div>
    <div class="tab-switch" id="fin-abas">
      <button class="tab-btn ${aba === 'pessoal' ? 'active' : ''}" data-aba="pessoal">👤 Pessoal</button>
      <button class="tab-btn ${aba === 'profissional' ? 'active' : ''}" data-aba="profissional">💼 Profissional</button>
    </div>
    <div id="fin-corpo">${corpo()}</div>
  </div>${bottomNav('financeiro')}`;
  app.querySelector('#fin-abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.dataset.aba === aba) return;
    aba = b.dataset.aba;
    app.querySelectorAll('#fin-abas .tab-btn').forEach(x => x.classList.toggle('active', x.dataset.aba === aba));
    app.querySelector('#fin-corpo').innerHTML = corpo();
  });
}
