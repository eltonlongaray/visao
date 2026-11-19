// ═══════════════════════════════════════════════════════════════
// MODELO DE TRIAGEM — Alê (Espaço Viver) · agenda V83
// Abre em /triagem/V83. Pra outra profissional: copie este arquivo como
// triagem-modelos/<slug-da-agenda>.js e troque os dados. O motor (triagem.html) não muda.
// Os SERVIÇOS e PREÇOS vêm da agenda dela no Falcon (os nomes aqui têm que bater).
// ═══════════════════════════════════════════════════════════════

// === BLOCO 1: QUEM É E VISUAL ===
window.TRIAGEM = {
  titulo: "Triagem",
  profissional: {
    nome: "Alê",
    negocio: "Espaço Viver",
    endereco: "R. Ramiro Barcelos, 1982 · sala 202 · Floresta · Porto Alegre",
    whatsapp: "5551986073198"
  },
  cores: { principal: "#8B6FA0", clara: "#EEE7F3", fundo: "#F8F5FA", tinta: "#4E3B5A" },
  // Preço de Black: o da agenda vale até o prazo; depois sobe pro "depois"
  precos: {
    prazo: "30/11",
    // preço de Black (até o prazo) — se não tiver aqui, vale o preço da agenda
    black: { "Esculpe Detox": 597, "Deusa Grega": 197 },
    depois: { "Sessão para celulite": 145, "Esculpe Detox": 747, "Deusa Grega": 227, "Pacote Deusa Grega": 997, "Liberação miofascial": 185,
      "Pacote Massagem terapêutica": 699, "Pacote Liberação miofascial": 829,
      "Pacote Sessão para celulite": 649, "Pacote Drenagem linfática": 559, "Pacote Tratamento para manchas": 699,
      "Pacote Sessão de LED": 559, "Pacote Massagem desportiva": 599, "Pacote Limpeza de pele": 569 }
  },

  // "Serviços que também me interessam": o que oferecer pra cada incômodo (nomes da agenda)
  interessesPor: {
    "Celulite": ["Sessão para celulite", "Drenagem linfática", "Deusa Grega – Modela / Reduz Medida / Pele Porcelana", "Esculpe Detox – Desincha / Elimina Toxinas / Modela"],
    "Flacidez": ["Deusa Grega – Modela / Reduz Medida / Pele Porcelana", "Sessão para celulite", "Drenagem linfática"],
    "Gordura localizada / medidas": ["Esculpe Detox – Desincha / Elimina Toxinas / Modela", "Deusa Grega – Modela / Reduz Medida / Pele Porcelana", "Drenagem linfática"],
    "Inchaço e retenção": ["Drenagem linfática", "Esculpe Detox – Desincha / Elimina Toxinas / Modela"],
    "Manchas": ["Tratamento para manchas", "Limpeza de pele"],
    "Acne, cravos, pele oleosa e/ou porosa": ["Limpeza de pele", "Tratamento para manchas"],
    "Dores e tensão": ["Massagem terapêutica", "Liberação miofascial", "Sessão de LED (anti-inflamatória)", "Massagem desportiva localizada"],
    "Estrias": ["Deusa Grega – Modela / Reduz Medida / Pele Porcelana", "Sessão para celulite"],
    "Ansiedade e estresse": ["Massagem relaxante"],
    "Quero só relaxar": ["Massagem relaxante"]
  },

  // Google Ads (conta 845-725-3405). conversão "Triagem enviada" criada 14/11
  googleTag: "GTM-N48CWL3C",
  googleAds: "AW-11325048329",
  conversao: "AW-11325048329/H9K_CKHYvbgdEImMmpgq", // "Triagem enviada" (clique em Agendar)

  // Depoimentos reais de clientes (WhatsApp, 19/11/2026). "chaves": palavras que ligam
  // o depoimento ao que a pessoa respondeu/à indicação. "destaque": aparece na abertura.
  // "img": print real do WhatsApp recortado (triagem-modelos/depoimentos/V83/), como nos da Larissa.
  depoimentos: [
    { nome: "Tici", servico: "Massagem modeladora", destaque: true, img: "tici.jpg",
      chaves: ["celulite", "flacidez", "gordura", "medida", "modela", "deusa", "esculpe"],
      texto: "Queria deixar registrado o excelente resultado que tive com as massagens modeladoras que fiz com a Alê. Resultado visível em algumas semanas. Além de profissional, é uma pessoa maravilhosa, que passa confiança e tranquilidade nos atendimentos. Super recomendo." },
    { nome: "Andrea", servico: "Massagem abdominal", img: "andrea.jpg",
      chaves: ["inchaço", "inchaco", "retenção", "abdom", "drenagem", "esculpe", "detox"],
      texto: "Venho aqui, com muita satisfação, agradecer e parabenizar a Alexandra: as sessões de massagem abdominal tiveram, sim, resultados satisfatórios. Parabéns pelo profissionalismo e dedicação." },
    { nome: "Rosangela", servico: "Massagem", img: "rosangela.jpg",
      chaves: ["dor", "perna", "tensão", "tensao", "terapêutica", "terapeutica", "drenagem"],
      texto: "Eu estive num período de muitas dores nas pernas e a massagem dela foi uma maravilha. Hoje não sinto nada de dor nas pernas. Vale muito a pena fazer massagem com ela, trabalha muito bem." },
    { nome: "Adronilda", servico: "Massagem terapêutica", img: "adronilda.jpg",
      chaves: ["dor", "tensão", "tensao", "miofascial", "terapêutica", "terapeutica", "desportiva"],
      texto: "Muito obrigada pelos teus atendimentos. Minha fase aguda já se foi. Tu tens mãos e instrumentos maravilhosos. Super recomendo teu trabalho." },
  ],
  intro: {
    eyebrow: "Cuidado sob medida",
    titulo: "Oi! 💜",
    texto: [
      "Antes de agendar, umas perguntinhas rápidas (2 min) pra eu entender teu caso e te indicar o cuidado certo.",
      "Depois tu escolhe teu horário, e tuas respostas chegam no meu WhatsApp, onde tu já pode tirar qualquer dúvida."
    ],
    rodape: ""
  },

  // === BLOCO 2: PERGUNTAS (uma por tela; "mostrarSe" faz a pergunta aparecer só quando faz sentido) ===
  perguntas: [
    { id: "incomodo", grupo: "Sobre ti", tipo: "multi", curto: "Incômodo",
      q: "O que mais te incomoda hoje?", ajuda: "Pode marcar mais de uma.",
      ops: [
        { v: "Celulite", icone: "🍑" }, { v: "Estrias", icone: "〰️" }, { v: "Flacidez", icone: "🤍" }, { v: "Gordura localizada / medidas", icone: "📏" },
        { v: "Inchaço e retenção", icone: "💧" }, { v: "Manchas", icone: "🌗" }, { v: "Acne, cravos, pele oleosa e/ou porosa", icone: "🌸" },
        { v: "Dores e tensão", icone: "💆" }, { v: "Ansiedade e estresse", icone: "🌙" }, { v: "Queda de cabelo", icone: "💇" },
        { v: "Quero só relaxar", icone: "🕯️" }
      ] },
    { id: "dor_onde", grupo: "Sobre a dor", tipo: "multi", curto: "Onde dói",
      q: "Onde tu sente dor?", ajuda: "Pode marcar mais de uma.",
      mostrarSe: { campo: "incomodo", algumDe: ["Dores e tensão"] },
      ops: [{ v: "Pescoço e ombros" }, { v: "Costas e lombar" }, { v: "Pernas" }, { v: "Joelhos, mãos ou outras articulações" }, { v: "Pés (esporão, calos)" }] },
    { id: "dor_tipo", grupo: "Sobre a dor", tipo: "unica", curto: "Tipo de dor",
      q: "Como é essa dor?",
      mostrarSe: { campo: "incomodo", algumDe: ["Dores e tensão"] },
      ops: [
        { v: "Músculo travado, tensão", icone: "🪢" },
        { v: "Dor na articulação (artrose)", icone: "🦴" },
        { v: "Esporão ou calos", icone: "🦶" },
        { v: "Depois de treino ou esforço", icone: "🏃‍♀️" }
      ] },
    { id: "emocional", grupo: "Como tu está", tipo: "multi", curto: "Como tem se sentido",
      q: "Como tu tem te sentido?", ajuda: "Pode marcar mais de uma.",
      mostrarSe: { campo: "incomodo", algumDe: ["Ansiedade e estresse"] },
      ops: [{ v: "Ansiosa" }, { v: "Estressada" }, { v: "Cansada, sem energia" }, { v: "Dormindo mal" }, { v: "Triste, desanimada" }],
      avisos: [{ se: "Triste, desanimada", texto: "Obrigada por confiar em mim 💜 Os atendimentos ajudam a cuidar de ti e complementam, mas não substituem, o acompanhamento com psicólogo ou médico." }] },
    { id: "regiao", grupo: "Sobre ti", tipo: "multi", curto: "Região",
      q: "Em qual parte do corpo?", ajuda: "Pode marcar mais de uma.",
      mostrarSe: { campo: "incomodo", algumDe: ["Celulite", "Estrias", "Flacidez", "Gordura localizada / medidas", "Inchaço e retenção"] },
      ops: [{ v: "Bumbum" }, { v: "Coxas" }, { v: "Culote" }, { v: "Barriga" }, { v: "Braços" }, { v: "Costas" }] },
    { id: "tempo", grupo: "Sobre ti", tipo: "unica", curto: "Há quanto tempo",
      q: "Há quanto tempo isso te incomoda?",
      ops: [{ v: "Menos de 6 meses" }, { v: "De 6 meses a 2 anos" }, { v: "Mais de 2 anos" }] },
    { id: "antes", grupo: "Sobre ti", tipo: "unica", curto: "Tratamento antes",
      q: "Já fez algum tratamento pra isso?",
      ops: [{ v: "Nunca fiz" }, { v: "Sim, mas não tive resultado" }, { v: "Sim, tive resultado e quero manter" }] },
    { id: "objetivo", grupo: "O que tu busca", tipo: "unica", curto: "Objetivo",
      q: "O que tu busca agora?",
      ops: [
        { v: "Resultado pra uma data (verão, festa, viagem)", icone: "📅" },
        { v: "Cuidar de mim com constância", icone: "🦋" },
        { v: "Experimentar uma sessão primeiro", icone: "✨" }
      ] },
    { id: "pele", grupo: "Tua pele", tipo: "multi", curto: "Pele e cabelo",
      q: "E a tua pele, tem algo que te incomoda?", ajuda: "Assim eu já cuido disso também. Pode marcar mais de uma.",
      exclusivas: ["Nada disso"],
      ops: [
        { v: "Manchas ou melasma", icone: "🌗" }, { v: "Acne e espinhas", icone: "🌸" }, { v: "Cravos e poros abertos", icone: "🔍" },
        { v: "Oleosidade", icone: "💧" }, { v: "Ressecamento", icone: "🏜️" }, { v: "Olheiras", icone: "👁️" },
        { v: "Flacidez no rosto", icone: "✨" }, { v: "Queda de cabelo", icone: "💇" }, { v: "Nada disso" }
      ] },
    { id: "saude", grupo: "Tua segurança", tipo: "multi", curto: "Saúde",
      q: "Algo que eu precise saber sobre tua saúde?", ajuda: "É pra eu cuidar de ti com segurança.",
      exclusivas: ["Nada disso"],
      ops: [{ v: "Estou gestante" }, { v: "Tenho varizes ou já tive trombose" }, { v: "Tenho alergia a algum óleo" }, { v: "Uso marcapasso" }, { v: "Nada disso" }],
      avisos: [
        { se: "Estou gestante", texto: "Tudo bem! Alguns tratamentos são adaptados na gestação — eu avalio contigo antes de começar." },
        { se: "Tenho varizes ou já tive trombose", texto: "Obrigada por avisar. Eu avalio com cuidado na primeira conversa antes de qualquer técnica." },
        { se: "Uso marcapasso", texto: "Obrigada por avisar. Alguns aparelhos não são indicados — eu escolho as técnicas certas pra ti." }
      ] },

    // === CUIDADO EM CASA (aprovado 15/11): necessidades, sem mostrar produto; o catálogo vem depois ===
    { id: "casa", grupo: "Pra continuar em casa", tipo: "multi", curto: "Cuidar em casa",
      q: "No atendimento eu uso óleos essenciais e cremes naturais",
      ajuda: "E tu pode levar pra casa pra continuar ou iniciar um novo tratamento.",
      destaque: "O que te interessa? Pode marcar mais de uma.",
      exclusivas: ["Não tenho interesse no momento"],
      ops: [
        { v: "Espinhas, cravos e pele oleosa", icone: "🌸" },
        { v: "Manchas na axila e virilha", icone: "🌗" },
        { v: "Olheiras e bolsas nos olhos", icone: "👁️" },
        { v: "Pele seca", icone: "🏜️" },
        { v: "Limpeza do rosto", icone: "🧼" },
        { v: "Lábios ressecados", icone: "💋" },
        { v: "Foliculite e pelos encravados", icone: "🪒" },
        { v: "Queda e falhas no cabelo ou barba", icone: "💇" },
        { v: "Celulite, gordura e inchaço", icone: "🍑" },
        { v: "Estrias e gestação", icone: "🤰" },
        { v: "Ansiedade, estresse e sono", icone: "🌙" },
        { v: "Outro", icone: "✍️", outro: true },
        { v: "Não tenho interesse no momento" }
      ] },
    { id: "catalogo", grupo: "Pra continuar em casa", tipo: "unica", curto: "Catálogo",
      q: "Quer receber um catálogo com os produtos selecionados pra ti?",
      ajuda: "Assim tu faz tua encomenda sempre que sentir necessidade. 📦 Pedidos em até 7 dias úteis, pra retirar no espaço.",
      ops: [{ v: "Sim, quero o catálogo" }, { v: "Agora não" }] }
  ],

  // Produtos reais da Alê por necessidade da pergunta "casa" (vão no resumo do WhatsApp pra ela montar o catálogo)
  produtosPor: {
    "Espinhas, cravos e pele oleosa": ["Folico", "Óleo de Melaleuca roll-on", "Hidrolato de melaleuca", "Hidrolato de gerânio"],
    "Manchas na axila e virilha": ["Clarea"],
    "Olheiras e bolsas nos olhos": ["Creme para área dos olhos"],
    "Pele seca": ["Blend Pele Seca"],
    "Limpeza do rosto": ["Espuma de limpeza facial"],
    "Lábios ressecados": ["Blend Protetor Labial", "Blend Revitalização Labial"],
    "Foliculite e pelos encravados": ["Blend Combate Foliculite", "Folico"],
    "Queda e falhas no cabelo ou barba": ["Blend Anti Queda"],
    "Celulite, gordura e inchaço": ["Blend Xô Celulite", "Hidrolato de alecrim do campo"],
    "Estrias e gestação": ["Maestria"],
    "Ansiedade, estresse e sono": ["Hidrolato de lavanda", "Água floral de verbena", "Hidrolato de capim-limão"]
  },

  // Descrição curta de cada tratamento quando a cliente escolhe entre opções (resultado)
  descricoes: {
    "Deusa Grega": "1h15 pra celulite e estrias, com óleos e cremes naturais: modela, reduz medida e deixa a pele lisinha. Pode ser uma sessão avulsa ou o tratamento, com medidas e acompanhamento da tua evolução.",
    "Esculpe Detox": "5 sessões de 45 min, com avaliação inicial (já com massagem), acompanhamento e avaliação final: desincha, elimina toxinas e modela. Ótimo quando a celulite vem junto com inchaço e gordura localizada.",
    "Sessão para celulite": "45 min focados na celulite. Bom pra começar e sentir o resultado.",
    "Drenagem linfática": "45 min pra tirar o inchaço e a retenção de líquido.",
    "Limpeza de pele": "Limpeza profunda pra tratar a acne, os cravos e a oleosidade."
  },

  // Vitrine de blends desligada (15/11): o cuidado em casa virou a pergunta "casa" + catálogo
  vitrine: null,
  // Sem o card "Serviços que também me interessam" no resultado (15/11)
  mostrarInteresses: false,

  // === BLOCO 4: INDICAÇÃO (regra simples: a primeira que bater vale) ===
  // A indicação segue o PRIMEIRO incômodo que a pessoa marcou (é o que mais incomoda)
  indicacao(r) {
    const inc = r.incomodo || [];
    const saude = (r.saude || []).filter(x => x !== "Nada disso");
    const aviso = saude.length ? "Como tu me contou algo sobre tua saúde, a primeira sessão começa com uma avaliação pra eu escolher as técnicas certas pra ti." : "";
    const experimentar = r.objetivo === "Experimentar uma sessão primeiro";
    const principal = inc[0];
    const pele = r.pele || [];
    const acne = principal !== "Acne, cravos, pele oleosa e/ou porosa" &&
      (inc.includes("Acne, cravos, pele oleosa e/ou porosa") || pele.includes("Acne e espinhas") || pele.includes("Cravos e poros abertos"));
    // Extra que a cliente pode somar (ex.: espinhas → tratamento de acne)
    const extras = acne ? [{ servico: "Limpeza de pele", titulo: "Tratamento de acne", porque: "Tu contou que tem espinhas: dá pra cuidar disso também." }] : [];
    const DEUSA = "Deusa Grega – Modela / Reduz Medida / Pele Porcelana", ESCULPE = "Esculpe Detox – Desincha / Elimina Toxinas / Modela";
    const corpo = ["Celulite", "Estrias", "Flacidez", "Gordura localizada / medidas"];
    if (corpo.includes(principal)) {
      const servico = principal === "Gordura localizada / medidas" ? ESCULPE
        : (experimentar && principal === "Celulite") ? "Sessão para celulite" : DEUSA;
      return { servico, opcoes: [DEUSA, ESCULPE, "Sessão para celulite"], extras,
        porque: "Separei os tratamentos que cuidam disso. Já deixei marcado o que mais combina com o que tu me contou, mas tu pode escolher outro:", aviso };
    }
    if (principal === "Inchaço e retenção") return { servico: ESCULPE, opcoes: [ESCULPE, "Drenagem linfática"], extras,
      porque: "Pra desinchar e eliminar o que o corpo está retendo. Escolhe o que combina mais contigo:", aviso };
    if (principal === "Dores e tensão") {
      const t = r.dor_tipo;
      if (t === "Dor na articulação (artrose)" || t === "Esporão ou calos")
        return { servico: "Sessão de LED (anti-inflamatória)", porque: "A luz de LED ajuda a aliviar a dor e a inflamação em casos como artrose, esporão e calos.", junto: "Massagem terapêutica nas áreas de tensão", aviso };
      if (t === "Depois de treino ou esforço") return { servico: "Massagem desportiva localizada", porque: "Pra recuperar o músculo depois do esforço e soltar o que travou.", junto: "Sessão de LED pra desinflamar", aviso };
      return { servico: "Massagem terapêutica", porque: "Pra soltar a tensão, destravar o músculo e aliviar a dor.", junto: "Liberação miofascial nos pontos mais travados", aviso };
    }
    if (principal === "Ansiedade e estresse")
      return { servico: "Massagem relaxante", porque: "Um momento pra desacelerar o corpo e a mente.", extras, aviso };
    if (principal === "Manchas") return { servico: "Tratamento para manchas", porque: "Clareamento com blends e técnicas pra uniformizar a pele.", junto: "Teu blend personalizado pra continuar em casa", aviso };
    if (principal === "Acne, cravos, pele oleosa e/ou porosa") return { servico: "Limpeza de pele", porque: "Limpeza profunda pra controlar a oleosidade e cuidar da acne.", junto: "Teu blend personalizado pra continuar em casa", aviso };
    if (principal === "Queda de cabelo") return { servico: "Blend Anti Queda", porque: "Fórmula com alecrim e copaíba pra fortalecer os fios. Eu te explico como usar e a gente conversa sobre a causa da queda.", extras, aviso };
    return { servico: "Massagem relaxante", porque: "Um momento só seu pra desacelerar.", extras, aviso };
  },

  // === BLOCO 5: BLEND PERSONALIZADO (junta tudo que a pessoa marcou num blend só dela) ===
  blendPersonalizadoDesligado(r) {
    const focos = {
      "Manchas ou melasma": ["rosto", "clareamento das manchas"], "Acne e espinhas": ["rosto", "controle da acne"],
      "Cravos e poros abertos": ["rosto", "limpeza dos poros"], "Oleosidade": ["rosto", "controle da oleosidade"],
      "Ressecamento": ["rosto", "hidratação profunda"], "Olheiras": ["rosto", "suavizar as olheiras"],
      "Flacidez no rosto": ["rosto", "firmeza da pele"], "Queda de cabelo": ["cabelo", "fortalecer os fios"],
      "Celulite": ["corpo", "ativar a circulação na celulite"], "Flacidez": ["corpo", "firmeza do corpo"],
      "Gordura localizada / medidas": ["corpo", "modelar as medidas"], "Inchaço e retenção": ["corpo", "desinchar"],
      "Ansiedade e estresse": ["calma", "calma e sono melhor"], "Manchas": ["rosto", "clareamento das manchas"],
      "Acne, cravos, pele oleosa e/ou porosa": ["rosto", "controle da acne"]
    };
    const marcados = [...(r.incomodo || []), ...(r.pele || [])].filter(x => focos[x]);
    if (!marcados.length) return null;
    const areas = [...new Set(marcados.map(x => focos[x][0]))];
    const para = [...new Set(marcados.map(x => focos[x][1]))];
    const nomes = { rosto: "Blend Facial Personalizado", corpo: "Blend Corporal Personalizado", cabelo: "Blend Capilar Personalizado", calma: "Blend Calma Personalizado" };
    const icones = { rosto: "🌸", corpo: "🍑", cabelo: "🌿", calma: "🕯️" };
    return {
      nome: areas.length === 1 ? nomes[areas[0]] : "Blend Personalizado da Alê",
      icone: areas.length === 1 ? icones[areas[0]] : "🌿",
      para,
      porque: "Feito sob medida por mim, com os óleos certos pro que tu me contou. Eu preparo o teu frasco e te explico como usar em casa."
    };
  },

  resultado: { titulo: "Achei o cuidado certo pra ti" }
};
