// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas — COMPLETO + AUTOMATIZADO
// Ordem por tela (Home → Ritual → Desempenho → Preparo → Comunidade[+Desafios] → Ajustes).
// VOZ: é o próprio FALCON falando, em 1ª pessoa. Nunca citar "o Falcon"
// em terceira pessoa aqui dentro.
// O tour assume o controle do app, abre o que precisa e mostra.
//
// noCollapse: true em TODOS os steps → barra sempre visível (com X pra sair).
// noScroll: o próprio passo cuida da rolagem no prepare.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Define os steps do tour de boas-vindas (ONBOARDING_STEPS exportado)
// ─────────────────────────────────────────────────────────────

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Espera o elemento existir (em vez de chutar um tempo fixo). Telas pesadas
// como o Ritual buscam dados na rede — esperar cego trava ou chega cedo demais.
async function esperarEl(sel, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const el = document.querySelector(sel);
    if (el) return el;
    await new Promise(r => requestAnimationFrame(r));
  }
  return null;
}
// Espera a condição virar verdadeira (ex: o card do dia terminar de abrir)
async function esperarAte(cond, ms = 1200) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await new Promise(r => requestAnimationFrame(r));
  }
  return false;
}

export const ONBOARDING_STEPS = [

  // ── 1. Boas-vindas ──
  {
    id: 'welcome',
    noSpotlight: true,
    noCollapse: true,
    route: '/home',
    title: 'Oi, eu sou o Falcon 🦅',
    message: 'Vou te mostrar o essencial em menos de um minuto. Eu mesmo abro as telas — você só vai avançando.',
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
    message: 'Prefere claro ou escuro? É só tocar aqui — eu guardo sua escolha.',
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
    message: 'Me diga a que horas você pretende acordar e dormir. Isso vira sua base — e todo dia eu te ajudo a registrar como foi de verdade.',
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
    message: 'É por aqui que eu te conto as novidades e comunicados. Quando tiver algo novo, você vê uma bolinha vermelha.',
    primaryBtn: 'Próximo →'
  },

  // ── 5. HOME: Agenda Online (pra quem atende) ──
  {
    id: 'home-agenda',
    route: '/home',
    target: '#agenda-card',
    holePad: 8,
    noCollapse: true,
    title: '📅 Agenda Online',
    message: 'Se você <strong>atende clientes</strong> (personal, terapeuta, consultoria…), aqui você monta seus horários e ganha um <strong>link pra bio do Instagram</strong>. Quem clicar agenda sozinho, e o horário já cai como compromisso no seu Ritual. Se não for o seu caso, é só ignorar. 😉',
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
    message: 'Toda atividade que você marcar com 🔔 no Ritual eu reúno aqui, por semana. Um toque e você vê tudo que está pendente — sem abrir dia por dia.',
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
    message: 'Aqui ficam suas atividades (Treino, Estudo, Hidratação...). Cadastre no <strong>+</strong> e eu te ofereço elas prontas no Ritual — você não digita tudo de novo.',
    primaryBtn: 'Próximo →'
  },

  // ── 7.5. HOME: Objetivos (o alvo da constância) ──
  {
    id: 'home-objetivos',
    route: '/home',
    noCollapse: true,
    prepare: async () => {
      const el = await esperarEl('#obj-secao');
      if (el) { el.scrollIntoView({ block: 'center' }); await wait(200); }
    },
    target: '#obj-secao',
    noScroll: true,
    holePad: 10,
    title: '🎯 Seus objetivos',
    message: 'Declare o que você quer manter: <strong>academia 4× por semana</strong>, jejum 1× por semana. Eu conto sozinho quando você marca a atividade no Ritual — e mostro há quanto tempo você está constante.',
    primaryBtn: 'Próximo →'
  },

  // ── 8. RITUAL: estrutura geral + marcar feito ──
  {
    id: 'ritual-week',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      // O Ritual busca a semana na rede: espera o card existir, não um tempo fixo
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = await esperarEl(`.day-card[data-day-id="${today}"]`);
      if (!todayCard) return;
      if (!todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await esperarAte(() => todayCard.classList.contains('open'));
      }
      // Topo do dia com uma folga acima pra não cortar
      todayCard.scrollIntoView({ block: 'start' });
      window.scrollBy({ top: -70 });
      await wait(150);
    },
    target: '.day-card.today, .day-card.open',
    noScroll: true,
    holePad: 8,
    title: 'O Ritual é o meu coração',
    message: 'Cada card é um dia (Seg → Dom). Abri o de hoje pra você. Suas atividades ficam por turno (manhã, tarde, noite), e você <strong>toca pra marcar feito 👍</strong> — esse é o nosso gesto de todo dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 9. RITUAL: 2 toques no mês = calendário ──
  {
    id: 'ritual-calendar',
    route: '/ritual',
    target: '#week-pager-center, .week-pager',
    holePad: 10,
    noCollapse: true,
    title: 'Calendário rápido',
    message: 'Dê <strong>2 toques aqui no topo</strong> (onde mostro a semana e o mês) que eu abro um calendário. Toque em qualquer dia pra criar uma atividade nele — útil pra agendar coisas pra daqui a meses.',
    primaryBtn: 'Próximo →'
  },

  // ── 10. RITUAL: o botão + do turno ──
  {
    id: 'ritual-add-btn',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = await esperarEl(`.day-card[data-day-id="${today}"]`);
      if (!todayCard) return;
      if (!todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await esperarAte(() => todayCard.classList.contains('open'));
      }
      // Marca o + do primeiro turno com id temporário → o tour destaca o
      // elemento certo (senão pega um oculto com rect 0,0 no canto).
      document.getElementById('tour-shift-add')?.removeAttribute('id');
      const add = todayCard.querySelector('.shift-add');
      if (add) { add.id = 'tour-shift-add'; add.scrollIntoView({ block: 'center' }); await wait(150); }
    },
    target: '#tour-shift-add',
    noScroll: true,
    holePad: 12,
    title: 'Adicione ao seu dia',
    message: 'Toque no <strong>+</strong> de um turno (manhã, tarde, noite) pra colocar uma atividade naquele dia. Te mostro o que aparece.',
    primaryBtn: 'Próximo →',
    onLeave: async () => { document.getElementById('tour-shift-add')?.removeAttribute('id'); }
  },

  // ── 11. RITUAL: tarefa vs compromisso (abre e explica dentro) ──
  {
    id: 'ritual-add-kind',
    route: '/ritual',
    noCollapse: true,
    prepare: async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      const today = new Date().toISOString().slice(0, 10);
      const todayCard = await esperarEl(`.day-card[data-day-id="${today}"]`);
      if (!todayCard) return;
      if (!todayCard.classList.contains('open')) {
        todayCard.querySelector('.day-card-header')?.click();
        await esperarAte(() => todayCard.classList.contains('open'));
      }
      todayCard.querySelector('.shift-add')?.click();
      await esperarEl('#kind-chips, .kind-chips', 1500);   // espera o modal abrir
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

  // ── 12. RITUAL: aba Compromissos ──
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
    message: 'Abaixo de domingo, eu junto <strong>todos</strong> os compromissos da semana ordenados por hora. Ótimo pra ver o que tem marcado sem abrir dia por dia.',
    primaryBtn: 'Próximo →'
  },

  // ── 13. DESEMPENHO ──
  {
    id: 'go-desempenho',
    route: '/desempenho',
    target: '#kpis, .kpis, .month-bar-chart',
    holePad: 8,
    noCollapse: true,
    title: 'Seu desempenho',
    message: 'Aqui eu te mostro quanto você concluiu no mês, sua evolução ao longo do ano, a qualidade do sono e sua reflexão semanal. É a recompensa de manter o ritual.',
    primaryBtn: 'Próximo →'
  },

  // ── 14. PREPARO FÍSICO (nova aba do menu) ──
  {
    id: 'go-preparo',
    route: '/preparo',
    noCollapse: true,
    prepare: async () => { await esperarEl('.pf-grupos', 3000); window.scrollTo({ top: 0 }); await wait(150); },
    target: '.pf-grupos',
    noScroll: true,
    holePad: 8,
    title: '💪 Preparo Físico',
    message: 'Aqui você cuida do corpo: <strong>Composição Corporal</strong> (% de gordura, massa magra, medidas e fotos) e <strong>Atividade Física</strong> (chegando já já). É a sua evolução física, medida de verdade.',
    primaryBtn: 'Próximo →'
  },

  // ── 15. O cinturão (navegação) ──
  {
    id: 'cinturao',
    route: '/preparo',
    noCollapse: true,
    prepare: async () => { await wait(300); },
    target: '.bottom-nav',
    noScroll: true,
    holePad: 6,
    title: 'Seu cinturão 🥇',
    message: 'Esta é a sua navegação. <strong>Arraste pro lado</strong> pra girar entre as telas — o que está no centro é onde você está. Tem mais abas do que cabem na tela; girando, você acha todas.',
    primaryBtn: 'Próximo →'
  },

  // ── 16. COMUNIDADE: Falcon Hunters (com Desafios dentro) ──
  {
    id: 'comunidade',
    route: '/chat',
    noCollapse: true,
    prepare: async () => {
      await esperarEl('#chat-abas', 3000);
      window.scrollTo({ top: 0 });
      await wait(250);
    },
    target: '#chat-abas',
    noScroll: true,
    holePad: 8,
    title: '🦅 Comunidade Falcon Hunters',
    message: 'Aqui é a nossa roda, com três abas: <strong>📣 Comunidade</strong> (fala com todo mundo), <strong>🏆 Desafios</strong> e <strong>🔒 Privado</strong>. Mande foto, responda e reaja — as mensagens somem sozinhas em 7 dias.',
    primaryBtn: 'Próximo →'
  },

  // ── 17. DESAFIOS (dentro da Comunidade) ──
  {
    id: 'go-desafios',
    route: '/chat',
    noCollapse: true,
    prepare: async () => {
      const btn = await esperarEl('[data-aba="desafios"]', 3000);
      if (btn && !btn.classList.contains('active')) { btn.click(); await wait(500); }
      await esperarEl('.ds-topo', 2500);
      window.scrollTo({ top: 0 }); await wait(150);
    },
    target: '.ds-topo',
    noScroll: true,
    holePad: 8,
    title: '🏆 Desafios — hábito em comunidade',
    message: 'Ainda na Comunidade, a aba <strong>Desafios</strong>: encare um <strong>sozinho, com amigos ou com todo mundo</strong> — beber água, treinar, ler… Toque em <strong>＋ Novo desafio</strong> pra criar, ou <strong>🔑 Entrar com código</strong> pra entrar no de um amigo. Quem não mantém a constância paga uma prenda!',
    primaryBtn: 'Próximo →'
  },

  // ── 16. AJUSTES: Meu perfil ──
  {
    id: 'ajustes-perfil',
    route: '/ajustes',
    noCollapse: true,
    prepare: async () => { await wait(300); },
    target: '#accPerfil',
    holePad: 8,
    title: '👤 Seu perfil',
    message: 'Se quiser, me conte seu nome, aniversário e WhatsApp. Uso só pra te dar suporte, comemorar seu dia e te manter informado sobre sua comunidade Falcon Hunters. Você é livre, pode remover seus dados quando quiser.',
    primaryBtn: 'Próximo →'
  },

  // ── 16.5. AJUSTES: sugerir melhoria ──
  {
    id: 'ajustes-sugestao',
    route: '/ajustes',
    noCollapse: true,
    prepare: async () => {
      const el = await esperarEl('#accSugestao');
      if (el) { el.scrollIntoView({ block: 'center' }); await wait(250); }
    },
    target: '#accSugestao',
    noScroll: true,
    holePad: 8,
    title: '💬 Sua voz constrói o Falcon',
    message: 'Teve uma ideia pra melhorar o app? Me conta aqui. Eu leio de verdade — muita coisa que você usa hoje nasceu de sugestão de quem tá na comunidade.',
    primaryBtn: 'Próximo →'
  },

  // ── 16.6. AJUSTES: seus dados ──
  {
    id: 'ajustes-dados',
    route: '/ajustes',
    noCollapse: true,
    prepare: async () => {
      const el = await esperarEl('#accDados');
      if (el) { el.scrollIntoView({ block: 'center' }); await wait(250); }
    },
    target: '#accDados',
    noScroll: true,
    holePad: 8,
    title: '📊 Seus dados são seus',
    message: 'Baixe tudo que você registrou em <strong>PDF</strong> ou em arquivo, quando quiser. Nada aqui é uma via de mão única — você leva o seu histórico com você.',
    primaryBtn: 'Próximo →'
  },

  // ── 17. AJUSTES: rever tutorial ──
  {
    id: 'ajustes-tour',
    route: '/ajustes',
    target: '#restartTourBtn',
    holePad: 8,
    noCollapse: true,
    title: 'Me chame quando quiser',
    message: 'Pode me pedir pra rever este tutorial a qualquer momento, aqui mesmo em Ajustes. E é aqui também que você sugere melhorias, ativa o bloqueio biométrico e gera seu relatório de performance em PDF.',
    primaryBtn: 'Próximo →'
  },

  // ── 18. O pet volta pro canto dele e se apresenta ──
  {
    id: 'pet-home',
    route: '/ajustes',
    noCollapse: true,
    prepare: async () => {
      const m = await import('./assistente-ia.js');
      m.petGuideHome?.();      // volta pro cantinho e encara o usuário
      await wait(700);
    },
    target: '.pet-body',
    noScroll: true,
    petHome: true,      // não reposicionar o pet: o alvo é ele mesmo
    holePad: 12,
    title: 'E esse aqui é o meu canto 🦅',
    message: 'Fico sempre por aqui. Toque em mim e <strong>fale</strong>: "agendar compromisso sábado às 8 horas, título Academia, descrição Treino de perna" — eu monto pra você. Também respondo sobre seu sono, água e constância. E me arraste pro canto que preferir.',
    primaryBtn: 'Próximo →'
  },

  // ── 19. Final ──
  {
    id: 'end',
    noSpotlight: true,
    noCollapse: true,
    title: 'Pronto! ✨',
    message: 'Agora é com você — e eu estou aqui sempre que precisar. Bom ritual 🙏🦅',
    primaryBtn: 'Concluir'
  }
];
