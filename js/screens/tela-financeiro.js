// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /financeiro — aba do menu inferior (Élton, 18/11)
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: casca da aba Financeiro: abas Pessoal e Profissional no
// topo e cards de vitrine (EM BREVE) do que vai ter em cada uma.
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
  if (!CARDS[aba].length) return `<div class="fin-vazio">💼 O financeiro profissional está em desenvolvimento. Em breve! 🦅</div>`;
  return `<div class="fr-hub fin-hub">${CARDS[aba].map(([ic, nome, desc]) => `
    <button class="fr-hubcard" data-fin-card="${nome}" type="button">
      <span class="fr-hub-ic">${ic}</span>
      <span class="fr-hub-tx"><b>${nome}</b><small>${desc}</small></span>
      <span class="fr-hub-tag">EM BREVE</span>
    </button>`).join('')}</div>`;
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
  app.querySelector('#fin-corpo').addEventListener('click', (e) => {
    const c = e.target.closest('[data-fin-card]');
    if (c) showToast(`${c.dataset.finCard} está em desenvolvimento. Em breve! 🦅`, 'info');
  });
  app.querySelector('#fin-abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.dataset.aba === aba) return;
    aba = b.dataset.aba;
    app.querySelectorAll('#fin-abas .tab-btn').forEach(x => x.classList.toggle('active', x.dataset.aba === aba));
    app.querySelector('#fin-corpo').innerHTML = corpo();
  });
}
