// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas — ENXUTO + AUTOMATIZADO
// O tour assume o controle do app, abre o que precisa e mostra.
// O usuário só clica "Próximo →".
//
// noCollapse: true em TODOS os steps → barra fica sempre visível
// (com X pra sair acessível) e o tour NÃO depende de clicks no app.
// ═══════════════════════════════════════════════════════════════

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const ONBOARDING_STEPS = [

  // ── 1. Boas-vindas ──
  {
    id: 'welcome',
    noSpotlight: true,
    noCollapse: true,
    route: '/home',
    title: 'Bem-vindo ao Visão ✨',
    message: 'Em 30 segundos te mostro o essencial. Eu mesmo abro as telas — você só clica "Próximo →".',
    primaryBtn: 'Vamos →'
  },

  // ── 2. HOME: tema dia/noite (PRIMEIRO conforme pedido) ──
  {
    id: 'home-tema',
    route: '/home',
    target: '#theme-toggle',
    holePad: 8,
    noCollapse: true,
    title: 'Tema dia/noite',
    message: 'Aqui você alterna entre claro e escuro. Sua escolha fica salva.',
    primaryBtn: 'Próximo →'
  },

  // ── 3. HOME: horários de acordar/dormir ──
  {
    id: 'home-sono',
    route: '/home',
    target: '.sleep-prefs',
    holePad: 10,
    noCollapse: true,
    title: '🌅 Acordar · 🌙 Dormir',
    message: 'Marque os horários que pretende acordar e dormir. Isso vira a base — o Ritual te ajuda a registrar o real todo dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 4. HOME: biblioteca de atividades ──
  {
    id: 'home-atividades',
    route: '/home',
    target: '#cats-list, #add-cat',
    holePad: 10,
    noCollapse: true,
    title: 'Sua biblioteca',
    message: 'Cadastre suas atividades aqui (Treino, Estudo, Hidratação...). Elas viram opções no Ritual pra você não digitar tudo de novo.',
    primaryBtn: 'Próximo →'
  },

  // ── 5. RITUAL: estrutura geral + abre dia ──
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
    message: 'Cada card é um dia (Seg → Dom). Abri o de hoje. Aqui ficam suas atividades por turno (manhã, tarde, noite), hidratação e a nota de fechamento.',
    primaryBtn: 'Próximo →'
  },

  // ── 6. RITUAL: 2 toques no mês = calendário ──
  {
    id: 'ritual-calendar',
    route: '/ritual',
    target: '#week-pager-center, .week-pager',
    holePad: 10,
    noCollapse: true,
    title: 'Calendário rápido',
    message: 'Dê <strong>2 toques aqui no topo</strong> (onde mostra a semana e o mês) pra abrir um calendário. Toque em qualquer dia pra criar uma atividade nele — útil pra agendar coisas pra daqui a meses.',
    primaryBtn: 'Próximo →'
  },

  // ── 7. RITUAL: abre o modal e explica tarefa vs compromisso ──
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
      // Tira o foco do campo de título (evita teclado abrir no celular)
      document.activeElement?.blur?.();
    },
    target: '#kind-chips, .kind-chips',
    holePad: 10,
    title: 'Tarefa ou Compromisso?',
    message: 'Tudo aqui é "atividade". Você escolhe entre <strong>📋 Tarefa</strong> (dia a dia, sem hora fixa) ou <strong>📅 Compromisso</strong> (com horário marcado — reuniões, contas, consultas).',
    primaryBtn: 'Próximo →',
    onLeave: async () => {
      document.querySelector('#m-cancel')?.click();
      await wait(200);
    }
  },

  // ── 8. RITUAL: aba Compromissos ──
  {
    id: 'ritual-commitments',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
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

  // ── 9. DESEMPENHO ──
  {
    id: 'go-desempenho',
    route: '/desempenho',
    target: '#kpis, .kpis, .month-bar-chart',
    holePad: 8,
    noCollapse: true,
    title: 'Desempenho',
    message: 'Aqui você vê seu progresso: % concluído do mês, evolução dos 12 meses, qualidade do sono e reflexão semanal.',
    primaryBtn: 'Próximo →'
  },

  // ── 10. AJUSTES: gerar relatório PDF ──
  {
    id: 'ajustes-pdf',
    route: '/ajustes',
    target: '#exportPdfBtn',
    holePad: 8,
    noCollapse: true,
    title: 'Gerar relatório PDF',
    message: 'Em <strong>Ajustes</strong>, toque em "Gerar relatório (PDF)" pra criar um resumo bonito da sua rotina. Ótimo pra acompanhar evolução ou compartilhar com alguém.',
    primaryBtn: 'Próximo →'
  },

  // ── 11. AJUSTES: rever tutorial ──
  {
    id: 'ajustes-tour',
    route: '/ajustes',
    target: '#restartTourBtn',
    holePad: 8,
    noCollapse: true,
    title: 'Tutorial sempre disponível',
    message: 'Pode rever esse tutorial quando quiser aqui mesmo em Ajustes.',
    primaryBtn: 'Próximo →'
  },

  // ── 12. Final ──
  {
    id: 'end',
    noSpotlight: true,
    noCollapse: true,
    title: 'Pronto! ✨',
    message: 'Tem detalhes legais pra você descobrir sozinho. Bom ritual 🙏',
    primaryBtn: 'Concluir'
  }
];
