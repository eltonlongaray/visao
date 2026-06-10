// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas — ENXUTO + AUTOMATIZADO
// O tour assume o controle do app, abre o que precisa e mostra.
// O usuário só clica "Próximo →".
// ═══════════════════════════════════════════════════════════════

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const ONBOARDING_STEPS = [

  // ── 1. Boas-vindas ──
  {
    id: 'welcome',
    noSpotlight: true,
    route: '/home',
    title: 'Bem-vindo ao Visão ✨',
    message: 'Em 30 segundos te mostro o essencial. Eu mesmo abro as telas — você só clica "Próximo →".',
    primaryBtn: 'Vamos →'
  },

  // ── 2. HOME: biblioteca de atividades ──
  {
    id: 'home-atividades',
    route: '/home',
    target: '#cats-list, #add-cat',
    holePad: 10,
    title: 'Sua biblioteca',
    message: 'Aqui você cadastra suas atividades (Treino, Estudo, Hidratação...). Elas viram opções no Ritual pra você não digitar tudo de novo.',
    primaryBtn: 'Próximo →'
  },

  // ── 3. RITUAL: visão da semana + abre um dia ──
  {
    id: 'ritual-week',
    route: '/ritual',
    prepare: async () => {
      // Volta pra hoje + expande o card de hoje
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
    message: 'Cada card é um dia (Seg → Dom). Abri o de hoje. Aqui ficam suas atividades por turno (manhã, tarde, noite), hidratação e a nota de fechamento do dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 4. RITUAL: abre o modal "+ Adicionar" e explica tarefa vs compromisso ──
  {
    id: 'ritual-add-kind',
    route: '/ritual',
    prepare: async () => {
      // Garante que o dia de hoje está aberto
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = document.querySelector(`.day-card[data-day-id="${today}"]`);
      if (todayCard && !todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await wait(300);
      }
      // Clica no + do primeiro turno
      const firstAdd = todayCard?.querySelector('.shift-add');
      if (firstAdd) firstAdd.click();
      await wait(450);
    },
    target: '#kind-chips, .kind-chips',
    holePad: 10,
    title: 'Tarefa ou Compromisso?',
    message: 'Tudo aqui é "atividade". Você escolhe entre <strong>📋 Tarefa</strong> (algo do dia a dia, sem hora fixa) ou <strong>📅 Compromisso</strong> (com horário marcado — reuniões, contas a pagar, consultas).',
    primaryBtn: 'Próximo →',
    onLeave: async () => {
      // Fecha o modal pra próxima etapa
      document.querySelector('#m-cancel')?.click();
      await wait(200);
    }
  },

  // ── 5. RITUAL: mostra a aba Compromissos ──
  {
    id: 'ritual-commitments',
    route: '/ritual',
    prepare: async () => {
      // Rola até o card de Compromissos
      const card = document.querySelector('.day-card.commitments-card');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(400);
      }
    },
    target: '.day-card.commitments-card',
    holePad: 8,
    title: '📅 Compromissos da semana',
    message: 'Abaixo de domingo, esse card junta TODOS os compromissos da semana ordenados por hora. Ótimo pra ver o que tem marcado sem abrir dia por dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 6. DESEMPENHO ──
  {
    id: 'go-desempenho',
    route: '/desempenho',
    target: '#kpis, .kpis, .month-bar-chart',
    holePad: 8,
    title: 'Desempenho',
    message: 'Aqui você vê seu progresso: % concluído do mês, evolução dos 12 meses, qualidade do sono e reflexão semanal.',
    primaryBtn: 'Próximo →'
  },

  // ── 7. AJUSTES ──
  {
    id: 'go-ajustes',
    route: '/ajustes',
    target: '#restartTourBtn',
    holePad: 8,
    title: 'Tutorial sempre disponível',
    message: 'Pode rever esse tutorial a qualquer momento aqui em <strong>Ajustes → Rever tutorial</strong>.',
    primaryBtn: 'Próximo →'
  },

  // ── 8. Final ──
  {
    id: 'end',
    noSpotlight: true,
    title: 'Pronto! ✨',
    message: 'Tem detalhes legais pra você descobrir sozinho. Bom ritual 🙏',
    primaryBtn: 'Concluir'
  }
];
