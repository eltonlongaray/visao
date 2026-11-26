// ═══════════════════════════════════════════════════════════════
// VISÃO · Financeiro — card da Caixa de Ferramentas (Élton, 26/11; era aba do menu desde 18/11)
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: casca da aba Financeiro: abas Pessoal e Profissional no
// topo; Pessoal com cards de vitrine (EM BREVE) e Profissional com a receita
// do mês por fonte de renda (financeiro-profissional.js).
// ─────────────────────────────────────────────────────────────
// Plano combinado com o Élton:
//  • Profissional: receitas e despesas separadas por FONTE DE RENDA
//    (ex.: terapeuta = clientes + cursos pras alunas; empresas podem ter
//    3, 4, 5 fontes). A fonte "Clientes" pode puxar o que já entra pela
//    Agenda Online (financeiro.js), pra ninguém lançar duas vezes.
//  • Pessoal: a SOMA dos pró-labores (cada fonte de renda tem o seu) +
//    as despesas pessoais, sem misturar com o profissional.
import { showToast } from '../aviso-tela.js';
import { trapModalBack } from '../modal-voltar.js';
import { montarProfissional } from '../financeiro-profissional.js';

// Abas no topo, igual à Comunidade (Élton, 18/11: no lugar dos dois cards)
let aba = 'pessoal';   // 'pessoal' | 'profissional'

// Cards de vitrine: mostram o que vai ter, todos EM BREVE (Élton, 18/11)
const CARDS = {
  pessoal: [
    ['💵', 'Pró-labore e despesas', 'A soma dos pró-labores de cada fonte de renda e suas despesas pessoais'],
    ['🛟', 'Reserva financeira', 'Monte e acompanhe sua reserva de emergência'],
    ['✈️', 'Viagem', 'Planeje quanto guardar por mês pra viajar'],
    ['🚗', 'Comprar um carro', 'Planeje a entrada, as parcelas e o prazo'],
    ['🏠', 'Comprar uma casa', 'Planeje a entrada, o financiamento e o prazo'],
    ['📦', 'Mudança', 'Pra outra cidade, outro estado ou outro país'],
    ['🎉', 'Organizar um evento', 'Casamento, 15 anos, aniversário e outras festas'],
    ['📈', 'Investimentos', 'Planeje seus investimentos no mercado financeiro'],
  ],
  // Fontes de renda extra viraram card da Caixa de Ferramentas (Élton, 18/11)
  profissional: [],
};

function corpo() {
  // Profissional: receita do mês por fonte de renda (Clientes + Mentoria), 25/11
  if (aba === 'profissional') return '<div id="fin-prof"></div>';
  return `<div class="fr-hub fin-hub">${CARDS[aba].map(([ic, nome, desc]) => `
    <button class="fr-hubcard" data-fin-card="${nome}" type="button">
      <span class="fr-hub-ic">${ic}</span>
      <span class="fr-hub-tx"><b>${nome}</b><small>${desc}</small></span>
      <span class="fr-hub-tag">EM BREVE</span>
    </button>`).join('')}</div>`;
}

const SVG_VOLTAR = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>`;

// Abre em tela cheia por cima (igual à Agenda e ao Kanban). Élton, 26/11:
// a barra de baixo já tinha coisa demais, o Financeiro foi pra Ferramentas.
export function abrirFinanceiroTela() {
  if (document.getElementById('financeiro-ov')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'financeiro-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" data-fin-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
      <div class="ag-title">💰 Financeiro</div>
    </div>
    <div class="ag-scroll fin-screen">
      <div class="sub fin-sub">Pessoal e profissional, cada um no seu lugar.</div>
      <div class="tab-switch" id="fin-abas">
        <button class="tab-btn ${aba === 'pessoal' ? 'active' : ''}" data-aba="pessoal">👤 Pessoal</button>
        <button class="tab-btn ${aba === 'profissional' ? 'active' : ''}" data-aba="profissional">💼 Profissional</button>
      </div>
      <div id="fin-corpo">${corpo()}</div>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  // history.back(): o popstate fecha (e o hub Ferramentas por baixo continua aberto)
  ov.querySelector('[data-fin-voltar]').addEventListener('click', () => history.back());
  const prof = () => { const box = ov.querySelector('#fin-prof'); if (box) montarProfissional(box); };
  prof();
  ov.querySelector('#fin-corpo').addEventListener('click', (e) => {
    const c = e.target.closest('[data-fin-card]');
    if (c) showToast(`${c.dataset.finCard} está em desenvolvimento. Em breve! 🦅`, 'info');
  });
  ov.querySelector('#fin-abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.dataset.aba === aba) return;
    aba = b.dataset.aba;
    ov.querySelectorAll('#fin-abas .tab-btn').forEach(x => x.classList.toggle('active', x.dataset.aba === aba));
    ov.querySelector('#fin-corpo').innerHTML = corpo();
    prof();
  });
}

// Link antigo #/financeiro (da época da aba): vai pra Home e abre por cima
export function renderFinanceiro() {
  location.replace('#/home');
  setTimeout(abrirFinanceiroTela, 350);
}
