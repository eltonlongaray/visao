// ═══════════════════════════════════════════════════════════════
// MODELO DE TRIAGEM — Larissa Rodrigues (massoterapia) · agenda Y35
// Abre em /triagem/Y35. Funil da Black Friday (post → "eu quero" → direct → aqui → agenda).
// Um serviço só: "Sessão especial" (90 min, destaque Black Friday) — tem horário próprio na agenda
// (seg–sex a partir das 17h, sábado o dia todo), ver sql/agenda-horario-servico.sql.
// Perguntas aprovadas pelo Élton em 21/11/2026 (campanha-black-friday/triagem-perguntas.md).
// ═══════════════════════════════════════════════════════════════

// === BLOCO 1: QUEM É E VISUAL ===
window.TRIAGEM = {
  titulo: "Black Friday",
  profissional: {
    nome: "Larissa",
    negocio: "Larissa Rodrigues Massoterapia",
    endereco: "Hoffman 724 · Moinhos de Vento · Porto Alegre",
    whatsapp: "5551984551613"
  },
  // paleta da marca dela: rosa-texto, blush, off-white, preto
  cores: { principal: "#C4646B", clara: "#FCDDDA", fundo: "#F4F1ED", tinta: "#050404" },
  // R$ 197 até 30/11, depois R$ 247 (só essa sessão entra na Black)
  precos: {
    prazo: "30/11",
    black: { "Sessão especial": 197 },
    depois: { "Sessão especial": 247 }
  },
  mostrarInteresses: false,
  // foco total nesse produto: a agenda abre só com a sessão da Black (outros serviços = link da bio)
  focoNoServico: true,
  // Depoimentos: só depois que as clientes autorizarem (Ana Paula, Yasmin, Kelly)
  depoimentos: [],
  intro: {
    eyebrow: "Black Friday",
    titulo: "Oi! 🤍",
    texto: [
      "Antes de escolher seu horário, umas perguntinhas rápidas (2 minutos) pra eu preparar a sua sessão do jeitinho que você precisa."
    ],
    rodape: ""
  },
  resultado: { titulo: "Agora é só escolher seu horário" },

  // === BLOCO 2: PERGUNTAS (uma por tela; "mostrarSe" faz a pergunta aparecer só quando faz sentido) ===
  perguntas: [
    { id: "incomodo", grupo: "Sobre você", tipo: "multi", curto: "O que mais pesa",
      q: "O que mais pesa em você hoje?", ajuda: "Pode marcar mais de uma.",
      ops: [
        { v: "Dores e tensão no corpo", icone: "💆" }, { v: "Barriga inchada, retenção", icone: "💧" },
        { v: "Cabeça cheia, ansiedade", icone: "🌙" }, { v: "Cansaço, sem energia", icone: "🔋" },
        { v: "Dormindo mal", icone: "😴" }, { v: "Só quero um tempo pra mim", icone: "🕯️" }
      ] },
    { id: "dor_onde", grupo: "Sobre você", tipo: "multi", curto: "Onde sente mais",
      q: "Onde você sente mais?", ajuda: "Pode marcar mais de uma.",
      mostrarSe: { campo: "incomodo", algumDe: ["Dores e tensão no corpo"] },
      ops: [{ v: "Pescoço e ombros" }, { v: "Costas e lombar" }, { v: "Pernas" }, { v: "Cabeça (tensão)" }, { v: "Outro lugar", outro: true }] },
    { id: "inchaco", grupo: "Sobre você", tipo: "unica", curto: "Quando incha",
      q: "Quando o inchaço aparece mais?",
      mostrarSe: { campo: "incomodo", algumDe: ["Barriga inchada, retenção"] },
      ops: [{ v: "No fim do dia" }, { v: "Depois das refeições" }, { v: "Perto da menstruação" }, { v: "Quase sempre" }] },
    { id: "rotina", grupo: "Sua rotina", tipo: "unica", curto: "Rotina",
      q: "Como é a sua rotina?",
      ops: [{ v: "Passo muito tempo sentada", icone: "🪑" }, { v: "Passo muito tempo em pé", icone: "🧍‍♀️" },
        { v: "Me mexo bastante", icone: "🏃‍♀️" }, { v: "Varia muito", icone: "🔄" }] },
    { id: "tempo_pra_mim", grupo: "Sua rotina", tipo: "unica", curto: "Último tempo pra si",
      q: "Quando foi a última vez que você tirou um tempo só pra você?",
      ops: [{ v: "Essa semana" }, { v: "Esse mês" }, { v: "Faz meses" }, { v: "Nem lembro" }] },
    { id: "pressao", grupo: "Sua sessão", tipo: "unica", curto: "Pressão",
      q: "Qual pressão você gosta na massagem?",
      ops: [{ v: "Leve" }, { v: "Média" }, { v: "Firme" }, { v: "Não sei, quero que você me indique" }] },
    { id: "final", grupo: "Sua sessão", tipo: "unica", curto: "Final da sessão",
      q: "Como você prefere terminar a sessão?",
      ops: [{ v: "Meditação guiada", icone: "🧘‍♀️" }, { v: "Reiki", icone: "✨" },
        { v: "Breathwork (respiração)", icone: "🌬️" }, { v: "Quero que você escolha por mim", icone: "🤍" }] },
    { id: "saude", grupo: "Sua segurança", tipo: "multi", curto: "Saúde",
      q: "Algo que eu precise saber sobre sua saúde?", ajuda: "É pra eu cuidar de você com segurança.",
      exclusivas: ["Nada disso"],
      ops: [{ v: "Estou gestante" }, { v: "Tenho varizes ou já tive trombose" }, { v: "Tenho alergia a algum óleo ou cheiro" },
        { v: "Tenho pressão alta" }, { v: "Fiz cirurgia recente" }, { v: "Nada disso" }],
      avisos: ["Estou gestante", "Tenho varizes ou já tive trombose", "Tenho alergia a algum óleo ou cheiro", "Tenho pressão alta", "Fiz cirurgia recente"]
        .map(se => ({ se, texto: "Obrigada por avisar 🤍 Eu adapto a sessão pra você com segurança e a gente conversa antes de começar." })) },
    { id: "origem", grupo: "Pra terminar", tipo: "unica", curto: "Como me conheceu",
      q: "Como você me conheceu?",
      ops: [{ v: "Pelo post da Black Friday" }, { v: "Pelo Instagram" }, { v: "Indicação de alguém" }, { v: "Já sou cliente" }] }
  ],

  // === BLOCO 3: INDICAÇÃO (um serviço só; a agenda já abre nele) ===
  indicacao: () => ({
    servico: "Sessão especial",
    porque: "90 minutos só pra você: chá, aromaterapia e uma escuta atenta; massagem 3 em 1 (inchaço, contraturas e relaxamento); no final, meditação, reiki ou breathwork. Durante a semana a partir das 17h e sábado o dia todo."
  })
};
