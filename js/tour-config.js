// ═══════════════════════════════════════════════════════════════
// VISÃO · Configuração do Tour de Boas-vindas (v2)
// Textos curtos, diretos. Foco em ações concretas.
// ═══════════════════════════════════════════════════════════════
export const ONBOARDING_STEPS = [

  // ── HOME: criar 3 atividades de exemplo ──
  {
    id: 'home-act-manha',
    route: '/home',
    target: '#add-cat',
    holePad: 12,
    title: 'Atividade da MANHÃ',
    message: 'Toque no <strong>+</strong> e crie uma atividade que se repete pela manhã (ex: "Café com leite"). Escolha ícone, cor e marque os dias da semana.',
    primaryBtn: 'Já criei →'
  },
  {
    id: 'home-act-tarde',
    route: '/home',
    target: '#add-cat',
    holePad: 12,
    title: 'Atividade da TARDE',
    message: 'Toque no <strong>+</strong> novamente e crie uma da tarde (ex: "Estudar").',
    primaryBtn: 'Já criei →'
  },
  {
    id: 'home-act-noite',
    route: '/home',
    target: '#add-cat',
    holePad: 12,
    title: 'Atividade da NOITE',
    message: 'Mais uma: agora uma da noite (ex: "Skincare").',
    primaryBtn: 'Já criei →'
  },

  // ── HOME: metas de sono ──
  {
    id: 'home-sono',
    route: '/home',
    target: '.sleep-prefs, [data-pref="wake"], #wake-time, .home-section',
    holePad: 6,
    title: 'Acordar e Dormir',
    message: 'Defina os horários que você planeja acordar e dormir. <strong>É essencial pra acompanhar a qualidade do sono</strong> — o ritmo é a base de tudo.',
    primaryBtn: 'Já preenchi →'
  },

  // ── HOME: completar biblioteca ──
  {
    id: 'home-mais',
    route: '/home',
    target: '#cats-list',
    holePad: 8,
    title: 'Sua biblioteca',
    message: 'Adicione TODAS as atividades que se repetem na sua semana. <strong>Aqui é o estoque</strong> — depois elas vão pro Ritual automaticamente, conforme os dias que você marcar.',
    primaryBtn: 'Próximo →'
  },

  // ── HOME: lembretes ──
  {
    id: 'home-lembretes',
    route: '/home',
    target: '#reminders-card',
    holePad: 8,
    title: 'Lembretes',
    message: 'Tarefas marcadas com 🔔 no Ritual aparecem aqui. É a central de notificações da semana.',
    primaryBtn: 'Próximo →'
  },

  // ── HOME: tema ──
  {
    id: 'home-tema',
    route: '/home',
    target: '#theme-toggle',
    holePad: 6,
    title: 'Dia ou Noite',
    message: 'Troque o tema a qualquer hora. Sua preferência fica salva.',
    primaryBtn: 'Próximo →'
  },

  // ── Vai pro Ritual ──
  {
    id: 'goto-ritual',
    route: '/home',
    target: '.bottom-nav a[href="#/ritual"]',
    holePad: 4,
    title: 'Próxima parada: Ritual',
    message: 'Toque em "Ritual" pra ver sua semana montada.',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL ──
  {
    id: 'ritual-week',
    route: '/ritual',
    target: '.day-card',
    holePad: 6,
    title: 'Sua semana',
    message: 'Cada card é um dia da semana, com as atividades distribuídas em Manhã, Tarde e Noite.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'ritual-task',
    route: '/ritual',
    target: '.task',
    holePad: 6,
    title: 'Marcar feito',
    message: 'Toque no 👎 ao concluir — vira 👍 com um som. Pode marcar e desmarcar livremente.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'ritual-copy',
    noSpotlight: true,
    route: '/ritual',
    title: 'Copiar do dia anterior',
    message: 'Em dias vazios, vai aparecer um banner perguntando se quer copiar do anterior. <strong>⚠️ Só clique em Sim se o dia anterior estiver TOTALMENTE preenchido</strong> — senão você copia uma versão incompleta.',
    primaryBtn: 'Entendi →'
  },
  {
    id: 'ritual-nav',
    route: '/ritual',
    target: '.swipe-arrow[data-nav="next-week"]',
    holePad: 4,
    title: 'Trocar de semana',
    message: 'Use as setas ‹ › lá em cima pra navegar entre semanas.',
    primaryBtn: 'Próximo →'
  },

  // ── Vai pro Desempenho ──
  {
    id: 'goto-desempenho',
    route: '/ritual',
    target: '.bottom-nav a[href="#/desempenho"]',
    holePad: 4,
    title: 'Última: Desempenho',
    message: 'Toque em "Desempenho" pra ver seu progresso.',
    primaryBtn: 'Próximo →'
  },

  // ── DESEMPENHO ──
  {
    id: 'desemp-kpis',
    route: '/desempenho',
    target: '#kpis',
    holePad: 6,
    title: 'Resumo do mês',
    message: 'Tarefas feitas, pendentes e aderência geral (%) do mês selecionado.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-months',
    route: '/desempenho',
    target: '.month-bar-chart',
    holePad: 6,
    title: '12 meses',
    message: 'Comparação visual mês a mês — bom pra tendência de longo prazo.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-tabs',
    route: '/desempenho',
    target: '#period-tabs',
    holePad: 6,
    title: 'Filtros',
    message: 'Esta semana / Este mês / Este ano. Troca o foco do gráfico de categorias.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-trajetoria',
    route: '/desempenho',
    target: '.records-header',
    holePad: 6,
    title: 'Trajetória semanal',
    message: 'Histórico de TODAS as semanas. Toque pra expandir e ver pontos fortes, fracos, sono e sua reflexão.',
    primaryBtn: 'Próximo →'
  },

  // ── Final ──
  {
    id: 'end',
    noSpotlight: true,
    title: 'Pronto!',
    message: '<strong>Consistência ganha de perfeição.</strong> Pode refazer este tour quando quiser pelo Ajustes.',
    primaryBtn: 'Concluir'
  }
];
