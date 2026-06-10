// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas (purely informativo)
// Textos curtos, o user só clica "Próximo →" — não precisa interagir com o app.
// Algumas features são deixadas pra descoberta (ex: card de Mensagens da manhã).
// ═══════════════════════════════════════════════════════════════
export const ONBOARDING_STEPS = [

  // ── INTRO ──
  {
    id: 'welcome',
    noSpotlight: true,
    route: '/home',
    title: 'Bem-vindo ao Visão ✨',
    message: 'Em 1 minuto te mostro o app inteiro. Só clicar em "Próximo →".',
    primaryBtn: 'Vamos →'
  },

  // ── HOME ──
  {
    id: 'home-sono',
    route: '/home',
    target: '.sleep-prefs',
    holePad: 10,
    title: 'Seu sono',
    message: 'Aqui você marca os horários que pretende acordar e dormir. Esses servem como base — o Ritual vai te ajudar a registrar todo dia.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'home-lembretes',
    route: '/home',
    target: '#reminders-card',
    holePad: 8,
    title: 'Lembretes da semana',
    message: 'Toda tarefa que você ativar 🔔 aparece aqui — atalho rápido pro que ainda precisa acontecer.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'home-atividades',
    route: '/home',
    target: '#cats-list, #add-cat',
    holePad: 10,
    title: 'Sua biblioteca de atividades',
    message: 'Crie suas atividades aqui (Treino, Estudo, Hidratação...). Elas servem de "categoria" pra você organizar o Ritual sem digitar tudo de novo.',
    primaryBtn: 'Próximo →'
  },
  {
    id: 'home-tema',
    route: '/home',
    target: '#theme-toggle',
    holePad: 8,
    title: 'Tema dia/noite',
    message: 'Alterne quando quiser. Sua escolha fica salva.',
    primaryBtn: 'Próximo →'
  },

  // ── VAI PRO RITUAL ──
  {
    id: 'go-ritual',
    route: '/home',
    target: '.bottom-nav a[href="#/ritual"]',
    holePad: 6,
    title: 'Indo pro Ritual',
    message: 'O Ritual é o coração do app. É onde você organiza seu dia a dia.',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: navegação semanal + calendário ──
  {
    id: 'ritual-pager',
    route: '/ritual',
    target: '.week-pager',
    holePad: 8,
    title: 'Semana atual',
    message: 'Use as setas ‹ › pra mudar de semana. <strong>Dica:</strong> dê 2 toques no centro (onde mostra o mês) pra abrir um calendário e pular pra qualquer dia.',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: card do dia ──
  {
    id: 'ritual-day-card',
    route: '/ritual',
    target: '.day-card',
    holePad: 6,
    title: 'Cada card é um dia',
    message: 'Toque pra abrir e ver: hora que acordou/dormiu, hidratação, suas tarefas por turno (manhã, tarde, noite) e o botão de fechar o dia com uma nota.',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: pílulas + ícone trazer dia ──
  {
    id: 'ritual-pills',
    noSpotlight: true,
    route: '/ritual',
    title: '🌅 Acordei · 🌙 Dormi · ↓ Trazer',
    message: 'Dentro do card, toque na pílula pra registrar o horário no relógio. Entre elas tem um <strong>↓</strong>: toque ali pra trazer as tarefas de um dia anterior pro dia atual (substitui).',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: criar tarefa ──
  {
    id: 'ritual-add',
    noSpotlight: true,
    route: '/ritual',
    title: '+ Adicionar tarefa ou compromisso',
    message: 'Cada turno tem um <strong>+</strong>. Toque pra adicionar. No modal você escolhe: <strong>📋 Tarefa</strong> (do dia a dia) ou <strong>📅 Compromisso</strong> (com hora marcada, tipo contas/reuniões). Pode ativar 🔔 lembrete e definir se repete (Somente hoje / Toda [dia] / Todos os dias / Todo mês — só compromissos).',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: ··· editar ──
  {
    id: 'ritual-menu',
    noSpotlight: true,
    route: '/ritual',
    title: '··· Editar / Duplicar / Excluir',
    message: 'Toque nos 3 pontinhos no canto da tarefa pra abrir o menu. Lá você muda título, horário, ícone, recorrência ou apaga.',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: lembrete vencido ──
  {
    id: 'ritual-overdue',
    noSpotlight: true,
    route: '/ritual',
    title: 'Lembrete passou da hora?',
    message: 'Se uma tarefa com 🔔 passar do horário, um modal aparece perguntando: ✅ Marcar feito · 🕐 Reagendar (com calendário + relógio) · 🚫 Atividade cancelada. Reagendamentos ficam contados no card (↻).',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: aba Compromissos ──
  {
    id: 'ritual-commitments',
    noSpotlight: true,
    route: '/ritual',
    title: '📅 Compromissos da semana',
    message: 'Abaixo de domingo tem uma aba especial que junta TODOS os compromissos da semana ordenados por horário. Ótimo pra ver o que tem marcado sem ficar abrindo dia por dia.',
    primaryBtn: 'Próximo →'
  },

  // ── RITUAL: nota + limpar ──
  {
    id: 'ritual-note',
    noSpotlight: true,
    route: '/ritual',
    title: 'Fechar o dia',
    message: 'No fim de cada dia tem o botão <strong>📝 Registrar nota</strong>. Após salvar, o app te leva direto pra confirmar hora de dormir e hidratação — fluxo guiado pra fechar o dia inteiro. E se precisar zerar tudo: <strong>🗑️ Limpar dados do dia</strong>.',
    primaryBtn: 'Próximo →'
  },

  // ── DESEMPENHO ──
  {
    id: 'go-desempenho',
    route: '/desempenho',
    target: '.bottom-nav a[href="#/desempenho"]',
    holePad: 6,
    title: 'Desempenho',
    message: 'Aqui você vê o panorama: quanto fez no mês, evolução dos 12 meses, qualidade do sono e a trajetória semanal com sua reflexão. Filtros por Semana / Mês / Ano no topo.',
    primaryBtn: 'Próximo →'
  },

  // ── AJUSTES ──
  {
    id: 'go-ajustes',
    route: '/ajustes',
    target: '.bottom-nav a[href="#/ajustes"]',
    holePad: 6,
    title: 'Ajustes',
    message: 'Sua conta, exportar dados, biometria, política de privacidade e — <strong>importante</strong> — o botão pra REINICIAR ESSE TUTORIAL sempre que quiser.',
    primaryBtn: 'Próximo →'
  },

  // ── FIM ──
  {
    id: 'end',
    noSpotlight: true,
    title: 'Pronto! ✨',
    message: 'Bom ritual. Explore — tem detalhes legais pra descobrir sozinho 😉',
    primaryBtn: 'Concluir'
  }
];
