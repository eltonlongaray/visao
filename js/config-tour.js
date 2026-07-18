// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas — COMPLETO (16 passos) + AUTOMATIZADO
// Ordem por tela (Home → Ritual → Desempenho → Desafios → Ajustes).
// O tour assume o controle do app, abre o que precisa e mostra.
// O usuário só clica "Vamos →".
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
    message: 'Vou te mostrar o essencial. Eu mesmo abro as telas — você só vai avançando.',
    primaryBtn: 'Vamos →'
  },

  // ── 2. HOME: tema dia/noite ──
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

  // ── 4. HOME: Avisos ──
  {
    id: 'home-avisos',
    route: '/home',
    target: '#avisos-card',
    holePad: 8,
    noCollapse: true,
    title: '📢 Avisos',
    message: 'Aqui chegam os comunicados e novidades do Falcon. Quando tiver algo novo, aparece uma bolinha vermelha.',
    primaryBtn: 'Próximo →'
  },

  // ── 6. HOME: Desafios (a vitrine) ──
  {
    id: 'home-desafios',
    route: '/home',
    target: '#desafios-card',
    holePad: 8,
    noCollapse: true,
    title: '🏆 Desafios',
    message: 'Na Home você vê o que está "em jogo": os desafios abertos pra você entrar. O desafio em si acontece na aba Desafios — já te mostro.',
    primaryBtn: 'Próximo →'
  },

  // ── 6. HOME: Lembretes da semana ──
  {
    id: 'home-lembretes',
    route: '/home',
    target: '#reminders-card',
    holePad: 8,
    noCollapse: true,
    title: '🔔 Lembretes da semana',
    message: 'Toda atividade que você marcar com 🔔 no Ritual aparece aqui, reunida por semana. Um toque e você vê tudo que está pendente — sem abrir dia por dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 7. HOME: biblioteca de atividades ──
  {
    id: 'home-atividades',
    route: '/home',
    target: '#cats-list, #add-cat',
    holePad: 10,
    noCollapse: true,
    title: 'Sua biblioteca',
    message: 'Aqui ficam suas atividades (Treino, Estudo, Hidratação...). Cadastre no <strong>+</strong> e elas viram opções no Ritual — você não digita tudo de novo.',
    primaryBtn: 'Próximo →'
  },

  // ── 7. RITUAL: estrutura geral + marcar feito ──
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
      // Topo do dia com uma folga acima pra não cortar
      todayCard?.scrollIntoView({ block: 'start' });
      window.scrollBy({ top: -70 });
      await wait(250);
    },
    target: '.day-card.today, .day-card.open',
    noScroll: true,
    holePad: 8,
    title: 'O Ritual é o coração do app',
    message: 'Cada card é um dia (Seg → Dom). Abri o de hoje. Suas atividades ficam por turno (manhã, tarde, noite), e você <strong>toca pra marcar feito 👍</strong> — esse é o gesto de todo dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 8. RITUAL: 2 toques no mês = calendário ──
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

  // ── RITUAL: o botão + do turno ──
  {
    id: 'ritual-add-btn',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = document.querySelector(`.day-card[data-day-id="${today}"]`);
      if (todayCard && !todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await wait(350);
      }
      // Marca o + do primeiro turno com id temporário → o tour destaca o
      // elemento certo (senão pega um oculto com rect 0,0 no canto).
      document.getElementById('tour-shift-add')?.removeAttribute('id');
      const add = todayCard?.querySelector('.shift-add');
      if (add) { add.id = 'tour-shift-add'; add.scrollIntoView({ block: 'center' }); await wait(250); }
    },
    target: '#tour-shift-add',
    noScroll: true,
    holePad: 12,
    title: 'Adicione ao seu dia',
    message: 'Toque no <strong>+</strong> de um turno (manhã, tarde, noite) pra adicionar uma atividade naquele dia. Te mostro o que aparece.',
    primaryBtn: 'Próximo →',
    onLeave: async () => { document.getElementById('tour-shift-add')?.removeAttribute('id'); }
  },

  // ── RITUAL: tarefa vs compromisso (abre e explica dentro) ──
  {
    id: 'ritual-add-kind',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = document.querySelector(`.day-card[data-day-id="${today}"]`);
      if (todayCard && !todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await wait(300);
      }
      const firstAdd = todayCard?.querySelector('.shift-add');
      if (firstAdd) firstAdd.click();
      await wait(350);
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

  // ── 10. RITUAL: aba Compromissos ──
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

  // ── 11. DESEMPENHO ──
  {
    id: 'go-desempenho',
    route: '/desempenho',
    target: '#kpis, .kpis, .month-bar-chart',
    holePad: 8,
    noCollapse: true,
    title: 'Desempenho',
    message: 'Aqui você vê seu progresso: % concluído do mês, evolução dos 12 meses, qualidade do sono e reflexão semanal. É a recompensa de manter o ritual.',
    primaryBtn: 'Próximo →'
  },

  // ── 12. DESAFIOS: a aba ──
  {
    id: 'go-desafios',
    route: '/desafios',
    noCollapse: true,
    prepare: async () => { await wait(500); window.scrollTo({ top: 0 }); await wait(150); },
    target: '.screen-title',
    noScroll: true,
    holePad: 8,
    title: '🏆 Desafios — hábito em comunidade',
    message: 'Encare um desafio <strong>sozinho, com amigos ou com a comunidade toda</strong>: beber água, treinar, ler... É muito mais fácil manter o hábito junto com alguém.',
    primaryBtn: 'Próximo →'
  },

  // ── 13. DESAFIOS: modalidades + prenda ──
  {
    id: 'desafios-prenda',
    route: '/desafios',
    noCollapse: true,
    prepare: async () => { await wait(300); },
    target: '.ds-topo',
    holePad: 8,
    title: 'Crie ou entre num desafio',
    message: 'Toque em <strong>＋ Novo desafio</strong> pra criar um (você escolhe o tipo e a meta), ou <strong>🔑 Entrar com código</strong> pra entrar no de um amigo. Quem não conclui paga uma prenda 🎭 — combinada antes, pra motivar a galera.',
    primaryBtn: 'Próximo →'
  },

  // ── 14. AJUSTES: Meu perfil ──
  {
    id: 'ajustes-perfil',
    route: '/ajustes',
    noCollapse: true,
    prepare: async () => { await wait(300); },
    target: '#accPerfil',
    holePad: 8,
    title: '👤 Seu perfil',
    message: 'Se quiser, preencha seu nome, aniversário e WhatsApp. Usamos só pra dar suporte, comemorar seu dia e te manter informado sobre sua comunidade Falcon Hunters. Você é livre — e pode remover quando quiser.',
    primaryBtn: 'Próximo →'
  },

  // ── 15. AJUSTES: rever tutorial ──
  {
    id: 'ajustes-tour',
    route: '/ajustes',
    target: '#restartTourBtn',
    holePad: 8,
    noCollapse: true,
    title: 'Tutorial sempre disponível',
    message: 'Pode rever este tutorial quando quiser, aqui mesmo em Ajustes. E é aqui também que você sugere melhorias, ativa o bloqueio biométrico e gera seu relatório de performance em PDF.',
    primaryBtn: 'Próximo →'
  },

  // ── 16. Final ──
  {
    id: 'end',
    noSpotlight: true,
    noCollapse: true,
    title: 'Pronto! ✨',
    message: 'Agora é com você. Bom ritual 🙏🦅',
    primaryBtn: 'Concluir'
  }
];
