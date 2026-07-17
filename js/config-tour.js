// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas — ENXUTO (7 passos) + AUTOMATIZADO
// Foco: o LOOP do hábito (biblioteca → Ritual → progresso) + Desafios.
// O tour assume o controle do app, abre o que precisa e mostra.
// O usuário só clica "Próximo →". O resto se descobre usando.
//
// noCollapse: true em TODOS os steps → barra sempre visível (com X pra sair).
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Define os steps do tour de boas-vindas (ONBOARDING_STEPS exportado)
// ─────────────────────────────────────────────────────────────

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const ONBOARDING_STEPS = [

  // ── 1. Boas-vindas ──
  {
    id: 'welcome',
    noSpotlight: true,
    noCollapse: true,
    route: '/home',
    title: 'Bem-vindo ao Falcon ✨',
    message: 'Em menos de 1 minuto te mostro o essencial. Eu mesmo abro as telas — você só clica "Próximo →".',
    primaryBtn: 'Vamos →'
  },

  // ── 2. HOME: biblioteca de atividades ──
  {
    id: 'home-atividades',
    route: '/home',
    target: '#cats-list, #add-cat',
    holePad: 10,
    noCollapse: true,
    title: 'Comece pela sua biblioteca',
    message: 'Cadastre aqui as coisas que você faz na rotina (Treino, Estudo, Hidratação...). Elas viram opções no Ritual — você não digita tudo de novo todo dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 3. RITUAL: o coração + como marcar feito ──
  {
    id: 'ritual-week',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      await wait(400);
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = document.querySelector(`.day-card[data-day-id="${today}"]`);
      if (todayCard && !todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
      }
      await wait(400);
    },
    target: '.day-card.today, .day-card.open',
    holePad: 8,
    title: 'O Ritual é o coração do app',
    message: 'Cada card é um dia (Seg → Dom). Abri o de hoje. Suas atividades ficam por turno (manhã, tarde, noite), e você <strong>toca pra marcar feito 👍</strong> — esse é o gesto de todo dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 4. RITUAL: tarefa vs compromisso ──
  {
    id: 'ritual-add-kind',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = document.querySelector(`.day-card[data-day-id="${today}"]`);
      if (todayCard && !todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await wait(300);
      }
      const firstAdd = todayCard?.querySelector('.shift-add');
      if (firstAdd) firstAdd.click();
      await wait(450);
      document.activeElement?.blur?.();
    },
    target: '#kind-chips, .kind-chips',
    holePad: 10,
    title: 'Tarefa ou Compromisso?',
    message: 'Ao adicionar, você escolhe entre <strong>📋 Tarefa</strong> (dia a dia, sem hora fixa) ou <strong>📅 Compromisso</strong> (com horário — reuniões, contas, consultas).',
    primaryBtn: 'Próximo →',
    onLeave: async () => {
      document.querySelector('#m-cancel')?.click();
      await wait(200);
    }
  },

  // ── 5. DESEMPENHO ──
  {
    id: 'go-desempenho',
    route: '/desempenho',
    target: '#kpis, .kpis, .month-bar-chart',
    holePad: 8,
    noCollapse: true,
    title: 'Seu progresso',
    message: 'Aqui você vê o quanto concluiu no mês, a evolução ao longo do ano, a qualidade do sono e sua reflexão semanal. É a recompensa de manter o ritual.',
    primaryBtn: 'Próximo →'
  },

  // ── 6. DESAFIOS ──
  {
    id: 'go-desafios',
    route: '/desafios',
    noCollapse: true,
    prepare: async () => { await wait(500); },
    target: '.ds-topo, .screen-title',
    holePad: 8,
    title: '🏆 Desafios — hábito em comunidade',
    message: 'Encare um desafio <strong>sozinho, com amigos ou com a comunidade toda</strong>: beber água, treinar, ler... Tem ranking, e quem não conclui paga uma prenda 🎭. É muito mais fácil manter o hábito junto com alguém.',
    primaryBtn: 'Próximo →'
  },

  // ── 7. Final ──
  {
    id: 'end',
    noSpotlight: true,
    noCollapse: true,
    title: 'Pronto! ✨',
    message: 'Tem mais pra descobrir usando: tema claro/escuro, 📢 Avisos, copiar/colar tarefas e o relatório PDF. Pode rever este tutorial quando quiser em <strong>Ajustes</strong>. Bom ritual 🙏',
    primaryBtn: 'Concluir'
  }
];
