// ═══════════════════════════════════════════════════════════════
// VISÃO · Configuração do Tour de Boas-vindas
// Cada step: { id, route?, target?, center?, fingerSide?, title, message, primaryBtn?, holePad? }
// ═══════════════════════════════════════════════════════════════
export const ONBOARDING_STEPS = [

  // ── Boas-vindas ──
  {
    id: 'welcome',
    center: true,
    title: '👁 Bem-vindo ao Visão!',
    message: 'Em ~3 minutos, vou te mostrar como organizar sua rotina. Você pode sair a qualquer momento clicando no × no canto.',
    primaryBtn: 'Vamos lá!'
  },

  // ── HOME ──
  {
    id: 'home-add-cat',
    route: '/home',
    target: '#add-cat',
    fingerSide: 'top',
    title: '🏷️ Suas Atividades',
    message: 'Toque no <strong>+</strong> e crie <strong>3 atividades</strong>: uma da MANHÃ (ex: "Café"), uma da TARDE (ex: "Estudar") e uma da NOITE (ex: "Skincare"). Pra cada uma: dê um nome, escolha ícone e cor, e marque os dias da semana em que ela se repete.',
    primaryBtn: 'Já criei 3 →'
  },
  {
    id: 'home-list',
    route: '/home',
    target: '#cats-list',
    fingerSide: 'top',
    title: '📋 Biblioteca',
    message: 'Suas atividades cadastradas ficam aqui. Toque no ✏️ pra editar e no 🗑️ pra excluir. Se aparecer um pontinho vermelho no ícone, significa que tem lembrete ativo no Ritual.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'home-reminders',
    route: '/home',
    target: '#reminders-card',
    fingerSide: 'top',
    title: '🔔 Lembretes',
    message: 'Quando você marcar uma tarefa com 🔔 no Ritual, ela aparece aqui. É a central de notificações da semana atual e da próxima.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'home-theme',
    route: '/home',
    target: '#theme-toggle',
    fingerSide: 'left',
    title: '🌗 Modo dia/noite',
    message: 'Troca entre tema claro e escuro. Sua preferência fica salva.',
    primaryBtn: 'Próximo →'
  },

  // ── Vai pro Ritual ──
  {
    id: 'goto-ritual',
    route: '/home',
    target: '.bottom-nav a[href="#/ritual"]',
    fingerSide: 'top',
    title: '🔮 Próxima parada: Ritual',
    message: 'Toque em "Ritual" na barra de baixo. É onde sua semana toma forma — você verá os 7 dias com suas atividades distribuídas em Manhã, Tarde e Noite.',
    primaryBtn: 'Estou indo →'
  },

  // ── RITUAL ──
  {
    id: 'ritual-week',
    route: '/ritual',
    target: '.day-card',
    fingerSide: 'top',
    title: '📅 Sua semana',
    message: 'Cada card representa um dia (Seg → Dom). As atividades aparecem aqui automaticamente conforme os dias da semana que você marcou na Home.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'ritual-task',
    route: '/ritual',
    target: '.task',
    fingerSide: 'top',
    title: '👍 Marcar como feito',
    message: 'Quando você concluir uma tarefa, toque no 👎 → ele vira 👍 e toca um som. Pode marcar e desmarcar livremente. Tudo é salvo na nuvem.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'ritual-copy',
    route: '/ritual',
    target: '.day-card',
    fingerSide: 'top',
    title: '📋 Trazer atividades do dia anterior',
    message: 'Em dias vazios da semana, vai aparecer um banner perguntando se você quer copiar do dia anterior. <strong>⚠️ Só toque em Sim depois que o dia anterior estiver TOTALMENTE preenchido</strong> — senão você copia uma versão incompleta.',
    primaryBtn: 'Entendi →'
  },
  {
    id: 'ritual-nav',
    route: '/ritual',
    target: '.swipe-arrow[data-nav="next-week"]',
    fingerSide: 'top',
    title: '⏭️ Trocar de semana',
    message: 'Use as setas ‹ › lá em cima pra navegar entre semanas. Você pode planejar a próxima ou revisar uma passada.',
    primaryBtn: 'Próximo →'
  },

  // ── Vai pro Desempenho ──
  {
    id: 'goto-desempenho',
    route: '/ritual',
    target: '.bottom-nav a[href="#/desempenho"]',
    fingerSide: 'top',
    title: '📊 Última parada: Desempenho',
    message: 'É onde você acompanha seu progresso — gráficos, melhores dias, pontos fortes e fracos, e suas reflexões semanais.',
    primaryBtn: 'Vamos lá →'
  },

  // ── DESEMPENHO ──
  {
    id: 'desemp-kpis',
    route: '/desempenho',
    target: '#kpis',
    fingerSide: 'top',
    title: '📈 Resumo do mês',
    message: 'Três números rápidos: tarefas feitas, pendentes e sua aderência geral (%) do mês selecionado.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-months',
    route: '/desempenho',
    target: '.month-bar-chart',
    fingerSide: 'top',
    title: '📊 Últimos 12 meses',
    message: 'Comparação visual da sua aderência mês a mês. Bom pra ver tendência de longo prazo.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-tabs',
    route: '/desempenho',
    target: '#period-tabs',
    fingerSide: 'top',
    title: '🎯 Filtros de período',
    message: 'Esta semana / Este mês / Este ano. Toque pra trocar o foco do gráfico de categorias abaixo.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'desemp-trajetoria',
    route: '/desempenho',
    target: '.records-header',
    fingerSide: 'top',
    title: '📜 Trajetória semanal',
    message: 'Histórico de TODAS as suas semanas. Toque em cada uma pra expandir e ver: pontos fortes, pontos fracos, qualidade do sono, dia melhor/pior e sua reflexão semanal.',
    primaryBtn: 'Próximo →'
  },

  // ── Final ──
  {
    id: 'end',
    center: true,
    title: '🎉 Pronto pra começar!',
    message: 'Você tá pronto pra usar o Visão. Lembre-se: <strong>consistência ganha de perfeição</strong>. Pode refazer este tour a qualquer momento pelos Ajustes.',
    primaryBtn: 'Concluir'
  }
];
