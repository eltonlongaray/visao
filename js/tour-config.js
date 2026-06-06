// ═══════════════════════════════════════════════════════════════
// VISÃO · Configuração do Tour de Boas-vindas
// Textos CURTOS, diretos. "Toque aqui pra X."
// ═══════════════════════════════════════════════════════════════
export const ONBOARDING_STEPS = [

  // ── HOME: sono primeiro ──
  {
    id: 'home-sono',
    route: '/home',
    target: '#wake-time, .pref-time, .home-section',
    holePad: 6,
    title: 'Acordar e dormir',
    message: 'Que horas você pretende acordar e dormir? Define aqui — é a base de uma boa qualidade de sono.',
    primaryBtn: 'Pronto →'
  },

  // ── HOME: criar 3 atividades de exemplo ──
  {
    id: 'home-act-manha',
    route: '/home',
    target: '#add-cat',
    holePad: 12,
    title: 'Atividade da MANHÃ',
    message: 'Toque no + pra criar.',
    primaryBtn: 'Criei →'
  },
  {
    id: 'home-act-tarde',
    route: '/home',
    target: '#add-cat',
    holePad: 12,
    title: 'Agora a da TARDE',
    message: 'Toque no + de novo.',
    primaryBtn: 'Criei →'
  },
  {
    id: 'home-act-noite',
    route: '/home',
    target: '#add-cat',
    holePad: 12,
    title: 'Agora a da NOITE',
    message: 'Mais uma. Toque no +.',
    primaryBtn: 'Criei →'
  },

  // ── HOME: completar biblioteca ──
  {
    id: 'home-mais',
    route: '/home',
    target: '#cats-list',
    holePad: 8,
    title: 'Sua biblioteca',
    message: 'Adicione todas as atividades aqui. Elas aparecem no Ritual sozinhas.',
    primaryBtn: 'Entendi →'
  },

  // ── HOME: lembretes ──
  {
    id: 'home-lembretes',
    route: '/home',
    target: '#reminders-card',
    holePad: 8,
    title: 'Lembretes',
    message: 'Suas tarefas com 🔔 aparecem aqui.',
    primaryBtn: 'Próximo →'
  },

  // ── HOME: tema ──
  {
    id: 'home-tema',
    route: '/home',
    target: '#theme-toggle',
    holePad: 6,
    title: 'Tema',
    message: 'Toque pra trocar entre dia e noite.',
    primaryBtn: 'Próximo →'
  },

  // ── Vai pro Ritual ──
  {
    id: 'goto-ritual',
    route: '/home',
    target: '.bottom-nav a[href="#/ritual"]',
    holePad: 4,
    title: 'Vamos pro Ritual',
    message: 'Toque aqui.',
    primaryBtn: 'Indo →'
  },

  // ── RITUAL ──
  {
    id: 'ritual-week',
    route: '/ritual',
    target: '.day-card',
    holePad: 6,
    title: 'Sua semana',
    message: 'Cada card é um dia (Seg → Dom). Toque numa segunda pra abrir.',
    primaryBtn: 'Abri →'
  },
  {
    id: 'ritual-task',
    route: '/ritual',
    target: '.task',
    holePad: 6,
    title: 'Marcar feito',
    message: 'Toque no 👎 pra virar 👍.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'ritual-day-close',
    noSpotlight: true,
    route: '/ritual',
    title: 'Feche a segunda',
    message: 'Toque no topo da segunda pra fechá-la.',
    primaryBtn: 'Fechei →'
  },
  {
    id: 'ritual-day-tue',
    noSpotlight: true,
    route: '/ritual',
    title: 'Abra a terça',
    message: 'Agora toque na terça pra abrir (ela vai estar vazia).',
    primaryBtn: 'Abri →'
  },
  {
    id: 'ritual-copy',
    noSpotlight: true,
    route: '/ritual',
    title: 'Trazer atividades da segunda',
    message: 'Como a segunda já tá preenchida, aparece a opção de trazer pra cá. <strong>Só aceite quando o dia anterior estiver TOTALMENTE preenchido.</strong>',
    primaryBtn: 'Entendi →'
  },
  {
    id: 'ritual-nav',
    route: '/ritual',
    target: '.swipe-arrow[data-nav="next-week"]',
    holePad: 4,
    title: 'Trocar de semana',
    message: 'Use as setas ‹ › lá em cima.',
    primaryBtn: 'Próximo →'
  },

  // ── Vai pro Desempenho ──
  {
    id: 'goto-desempenho',
    route: '/ritual',
    target: '.bottom-nav a[href="#/desempenho"]',
    holePad: 4,
    title: 'Vamos pro Desempenho',
    message: 'Toque aqui.',
    primaryBtn: 'Indo →'
  },

  // ── DESEMPENHO ──
  {
    id: 'desemp-kpis',
    route: '/desempenho',
    target: '#kpis',
    holePad: 6,
    title: 'Resumo do mês',
    message: 'Feitas, pendentes e %.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-months',
    route: '/desempenho',
    target: '.month-bar-chart',
    holePad: 6,
    title: '12 meses',
    message: 'Comparação mês a mês.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-tabs',
    route: '/desempenho',
    target: '#period-tabs',
    holePad: 6,
    title: 'Filtros',
    message: 'Semana / Mês / Ano.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-trajetoria',
    route: '/desempenho',
    target: '.week-card',
    holePad: 6,
    title: 'Trajetória semanal',
    message: 'Toque numa semana pra abrir.',
    primaryBtn: 'Abri →'
  },
  {
    id: 'desemp-trajetoria-info',
    noSpotlight: true,
    route: '/desempenho',
    title: 'Dentro de cada semana',
    message: 'Aqui você vê <strong>pontos fortes</strong>, <strong>pontos fracos</strong>, qualidade do <strong>sono</strong>, melhor e pior dia, e o espaço pra escrever sua <strong>reflexão</strong>.',
    primaryBtn: 'Entendi →'
  },

  // ── Final ──
  {
    id: 'end',
    noSpotlight: true,
    title: 'Pronto!',
    message: 'Boa rotina ✨',
    primaryBtn: 'Concluir'
  }
];
