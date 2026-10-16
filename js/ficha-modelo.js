// ─── ÍNDICE ──────────────────────────────────────────────────
// FICHA DE ATENDIMENTO — modelos fixos por profissão (1º: massoterapia) +
// regiões do mapa do corpo. Usado pela página pública (ficha-publica.js) e
// pela visualização da profissional (ficha-ui.js). Só dados, sem tela.
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: TIPOS DE MASSAGEM (a única parte que a profissional ajusta) ===
export const SUGESTOES_TIPOS = ["Relaxante","Terapêutica","Drenagem linfática","Modeladora","Desportiva",
  "Liberação miofascial","Pedras quentes","Ventosaterapia","Reflexologia (pés)"];
export function tiposOferecidos(cfg) {
  const desl = Array.isArray(cfg?.desligados) ? cfg.desligados : [];
  const extras = Array.isArray(cfg?.extras) ? cfg.extras : [];
  return SUGESTOES_TIPOS.filter(t => !desl.includes(t)).concat(extras);
}

// === BLOCO 2: MODELO — FICHA DE MASSOTERAPIA ===
// Tipos: texto · longo · whats · data · unica · varias · escala · mapa · aviso
// "se": só aparece quando a condição bate. "outro": abre campo de texto. "so": opção exclusiva.
// "ident": nome/WhatsApp — escondidos quando o link já tem o código do cliente.
const MASSOTERAPIA = {
  profissao: "massoterapia",
  titulo: "Ficha de atendimento",
  blocos: [
    { nome: "Quem é você", perguntas: [
      { id:"nome", tipo:"texto", q:"Seu nome", ph:"Como você gosta de ser chamado(a)", obrig:true, ident:true },
      { id:"whatsapp", tipo:"whats", q:"Seu WhatsApp", ph:"(51) 99999-9999", obrig:true, ident:true },
      { id:"nascimento", tipo:"data", q:"Data de nascimento" },
      { id:"conheceu", tipo:"unica", q:"Como você me conheceu?", op:["Instagram","Indicação de alguém","Google","Passei em frente"], outro:true },
    ]},
    { nome: "O que você procura", perguntas: [
      { id:"motivo", tipo:"varias", q:"O que te trouxe até a massagem?", aj:"Pode marcar vários.",
        op:["Relaxar e baixar o estresse","Aliviar dor ou tensão","Inchaço ou retenção de líquido","Recuperação de treino","Modelar o corpo","Dormir melhor","Um momento só meu","Estou gestante"], outro:true },
      { id:"tipos", tipo:"varias", q:"Quais tipos de massagem te interessam?", aj:"Pode marcar vários.",
        op: cfg => tiposOferecidos(cfg).concat("Não sei, quero que a profissional indique"), configuravel:true },
      { id:"frequencia", tipo:"unica", q:"Com que frequência você faz massagem hoje?",
        op:["É a minha primeira vez","Já fiz, mas raramente","Uma vez por mês","A cada 15 dias","Toda semana"] },
    ]},
    { nome: "Como está seu corpo", perguntas: [
      { id:"mapa", tipo:"mapa", q:"Onde seu corpo pede atenção?", aj:"Toque na parte do corpo e marque o que sente. Pode marcar quantas quiser." },
      { id:"ja_fez", tipo:"varias", q:"O que você já fez, além de remédio, pra aliviar sua dor?",
        op:["Massagem","Fisioterapia","Quiropraxia","Acupuntura","Alongamento, yoga ou pilates","Academia ou exercício","Compressa quente ou gelo","Pomada ou gel","Ainda não fiz nada"], outro:true, so:["Ainda não fiz nada"] },
      { id:"fadiga", tipo:"unica", q:"Você sente fadiga muscular?", aj:"Aquele cansaço no músculo, corpo pesado.", op:["Sim, com frequência","Às vezes","Não"] },
      { id:"fadiga_onde", tipo:"texto", q:"Em que parte do corpo?", ph:"Ex: pernas, costas…", se: R => R.fadiga && R.fadiga !== "Não", sub:true },
      { id:"estresse_causa", tipo:"varias", q:"O que mais te estressa?", aj:"Pode marcar vários.",
        op:["Trabalho","Dinheiro e contas","Família ou relacionamento","Filhos","Saúde","Trânsito e deslocamento","Falta de tempo pra mim","Excesso de tarefas"], outro:true },
      { id:"estresse_duracao", tipo:"unica", q:"Quando o estresse aparece, por quanto tempo ele fica?",
        op:["Passa em algumas horas","Dura o dia todo","Fica alguns dias","Estou assim há semanas"] },
      { id:"estresse", tipo:"escala", q:"Durante a semana, em que nível o seu estresse costuma ficar?", de:"Tranquilo", ate:"No limite" },
      { id:"sono", tipo:"varias", q:"Como está o seu sono?",
        op:["Durmo bem","Demoro pra pegar no sono","Acordo durante a noite","Acordo sem energia","Durmo pouco"], so:["Durmo bem"] },
      { id:"rotina", tipo:"varias", q:"Como é a sua rotina?", aj:"Pode marcar vários.",
        op:["Muitas horas na cadeira","Muitas horas de pé","Carrego peso (criança, bolsa, trabalho)","Celular ou computador o dia todo","Faço atividade física"] },
      { id:"atividade", tipo:"texto", q:"Qual atividade e quantas vezes por semana?", ph:"Ex: musculação 3x, corrida 1x", se: R => (R.rotina||[]).includes("Faço atividade física"), sub:true },
      { id:"inchaco", tipo:"unica", q:"Você sente o corpo inchado?", op:["Sim, com frequência","Às vezes","Não"] },
      { id:"inchaco_quando", tipo:"varias", q:"Quando você sente mais?", op:["No fim do dia","Depois das refeições","No período menstrual","No calor","Ao acordar"],
        se: R => R.inchaco && R.inchaco !== "Não", sub:true },
      { id:"refeicao", tipo:"texto", q:"Depois de que tipo de refeição?", ph:"Ex: massa, pão, comida mais salgada…",
        se: R => R.inchaco && R.inchaco !== "Não" && (R.inchaco_quando||[]).includes("Depois das refeições"), sub:true },
      { id:"alimentacao", tipo:"varias", q:"Me conta um pouco da sua alimentação", aj:"Marque o que tem a ver com você.",
        op:["Como bem na maior parte do tempo","Bastante sal ou comida industrializada","Bastante doce","Bebo pouca água","Pulo refeições","Bastante café"] },
      { id:"alimentacao_txt", tipo:"longo", q:"Quer contar mais sobre a sua alimentação?", ph:"Ex: almoço fora todo dia, como pouca verdura…" },
    ]},
    { nome: "Saúde e segurança", perguntas: [
      { id:"aviso_saude", tipo:"aviso", q:"Essas respostas garantem uma massagem segura pra você. Elas ficam só com a profissional." },
      { id:"saude", tipo:"varias", q:"Marque o que se aplica a você",
        op:["Estou gestante","Fiz cirurgia nos últimos 6 meses","Tenho varizes","Já tive trombose","Pressão alta","Diabetes","Problema de pele ou ferida","Lesão recente (torção, distensão…)","Em tratamento de câncer","Uso marca-passo","Nenhuma dessas"], so:["Nenhuma dessas"] },
      { id:"gestante_semanas", tipo:"texto", q:"De quantas semanas?", ph:"Ex: 20 semanas", se: R => (R.saude||[]).includes("Estou gestante"), sub:true },
      { id:"cirurgia_qual", tipo:"texto", q:"Qual cirurgia e quando?", ph:"Ex: abdominoplastia em agosto", se: R => (R.saude||[]).includes("Fiz cirurgia nos últimos 6 meses"), sub:true },
      { id:"alergia", tipo:"unica", q:"Tem alergia a algum óleo, creme ou aroma?", op:["Sim","Não","Não sei"] },
      { id:"alergia_qual", tipo:"texto", q:"A quê?", ph:"Ex: amêndoas, lavanda…", se: R => R.alergia === "Sim", sub:true },
      { id:"remedio", tipo:"unica", q:"Usa algum medicamento contínuo?", op:["Sim","Não"] },
      { id:"remedio_qual", tipo:"texto", q:"Qual?", ph:"Ex: anticoagulante, anti-inflamatório…", se: R => R.remedio === "Sim", sub:true },
    ]},
    { nome: "Do seu jeito", perguntas: [
      { id:"pressao", tipo:"unica", q:"Que pressão você prefere na massagem?", op:["Leve","Média","Forte","Não sei, quero descobrir"] },
      { id:"nao_tocar", tipo:"texto", q:"Tem alguma parte do corpo que você prefere que eu não toque?", ph:"Ex: pés, rosto…" },
      { id:"conversa", tipo:"unica", q:"Durante a sessão, você prefere…", op:["Conversar","Ficar em silêncio","Tanto faz"] },
      { id:"ambiente", tipo:"texto", q:"Alguma preferência de aroma, música ou temperatura?", ph:"Ex: sem cheiro forte, sala mais quente…" },
      { id:"algo_mais", tipo:"longo", q:"Tem mais alguma coisa que eu deveria saber?", ph:"Fica à vontade" },
    ]},
  ],
};

export const MODELOS = { massoterapia: MASSOTERAPIA };
export const PROFISSOES = [{ k: "massoterapia", nome: "Massoterapeuta", emoji: "💆" }];

// === BLOCO 3: MAPA DO CORPO — REGIÕES ===
// Desenhadas só do lado ESQUERDO DA TELA (x < 120) e espelhadas. De frente, o lado
// esquerdo da tela é o DIREITO da pessoa; de costas, o ESQUERDO. "par" ganha _d/_e.
export const FRENTE = [
  { id:"cabeca",     nome:"Cabeça e têmporas",       d:"M120,12 a24,30 0 1 0 0.1,0 Z" },
  { id:"mandibula",  nome:"Mandíbula (ATM)", par:true, d:"M99,52 Q100,68 117,73 L117,67 Q106,63 104,51 Z" },
  { id:"pescoco",    nome:"Pescoço (frente e lateral)", par:true, d:"M109,76 h9.5 v22 h-5.5 q-4,0 -4,-4 Z" },
  { id:"ombro",      nome:"Ombro", par:true,         d:"M86,100 Q68,98 63,112 L62,128 L80,128 Q80,110 88,104 Z" },
  { id:"peitoral",   nome:"Peitoral", par:true,      d:"M118,102 L94,102 Q85,103 84,112 L84,140 Q88,154 104,154 L118,152 Z" },
  { id:"abdomen",    nome:"Abdômen",                 d:"M86,158 L154,158 Q152,190 150,222 L90,222 Q88,190 86,158 Z" },
  { id:"virilha",    nome:"Virilha e flexores do quadril", par:true, d:"M86,226 L118,226 L118,254 Q98,252 84,240 Z" },
  { id:"biceps",     nome:"Bíceps (frente do braço)", par:true, d:"M62,132 L79,132 L76,196 L60,196 Q58,160 62,132 Z" },
  { id:"antebraco",  nome:"Antebraço", par:true,     d:"M60,200 L76,200 L71,266 L57,266 Z" },
  { id:"mao",        nome:"Mão e punho", par:true,   d:"M57,270 L71,270 L73,294 Q66,310 55,300 Q53,284 57,270 Z" },
  { id:"lateral_coxa", nome:"Lateral do quadril e coxa", par:true, d:"M80,244 Q83,252 89,258 L92,354 L85,354 Q78,300 80,244 Z" },
  { id:"quadriceps", nome:"Quadríceps (frente da coxa)", par:true, d:"M92,258 L108,258 L106,354 L95,354 Z" },
  { id:"adutor",     nome:"Parte interna da coxa", par:true, d:"M110,258 L118,258 L117,296 Q114,326 108,350 Z" },
  { id:"joelho",     nome:"Joelho", par:true,        d:"M98,358 a11,10 0 1 0 0.1,0 Z" },
  { id:"canela",     nome:"Canela", par:true,        d:"M89,382 L108,382 L104,458 L94,458 Q90,420 89,382 Z" },
  { id:"pe",         nome:"Tornozelo e peito do pé", par:true, d:"M93,462 L105,462 L108,482 Q100,490 88,486 Q90,474 93,462 Z" },
];
export const COSTAS = [
  { id:"cabeca",     nome:"Cabeça e têmporas",       d:"M120,12 a24,30 0 1 0 0.1,0 Z" },
  { id:"cervical",   nome:"Nuca e cervical", par:true, d:"M109,76 h9.5 v22 h-5.5 q-4,0 -4,-4 Z" },
  { id:"trapezio",   nome:"Trapézio", par:true,      d:"M112,96 L112,114 L90,114 Q82,111 86,104 Q98,98 112,96 Z" },
  { id:"ombro",      nome:"Ombro", par:true,         d:"M86,100 Q68,98 63,112 L62,128 L80,128 Q80,110 88,104 Z" },
  { id:"entre_escapulas", nome:"Entre as escápulas", d:"M114,102 h12 v52 h-12 Z" },
  { id:"escapula",   nome:"Escápula (omoplata)", par:true, d:"M86,118 L111,118 L110,150 L92,148 Q84,134 86,118 Z" },
  { id:"meio_costas", nome:"Meio das costas", par:true, d:"M86,154 L111,154 L118,160 L118,196 L90,196 Q86,176 86,154 Z" },
  { id:"lombar",     nome:"Lombar", par:true,        d:"M90,200 L118,200 L118,232 L86,232 Q87,214 90,200 Z" },
  { id:"sacro",      nome:"Sacro (final da coluna)", d:"M110,236 L130,236 L124,260 L116,260 Z" },
  { id:"gluteo",     nome:"Glúteo", par:true,        d:"M84,236 L107,236 L113,262 Q106,282 88,276 Q78,258 84,236 Z" },
  { id:"triceps",    nome:"Tríceps (atrás do braço)", par:true, d:"M62,132 L79,132 L76,190 L60,190 Q58,160 62,132 Z" },
  { id:"cotovelo",   nome:"Cotovelo", par:true,      d:"M68,194 a9,7 0 1 0 0.1,0 Z" },
  { id:"antebraco",  nome:"Antebraço", par:true,     d:"M60,210 L76,210 L71,266 L57,266 Z" },
  { id:"mao",        nome:"Mão e punho", par:true,   d:"M57,270 L71,270 L73,294 Q66,310 55,300 Q53,284 57,270 Z" },
  { id:"posterior",  nome:"Posterior da coxa", par:true, d:"M84,282 Q100,286 114,276 L113,352 L88,352 Q82,316 84,282 Z" },
  { id:"atras_joelho", nome:"Atrás do joelho", par:true, d:"M100,356 a11,9 0 1 0 0.1,0 Z" },
  { id:"panturrilha", nome:"Panturrilha", par:true,  d:"M88,378 L111,378 Q114,410 106,440 L93,440 Q84,410 88,378 Z" },
  { id:"aquiles",    nome:"Tendão de Aquiles e calcanhar", par:true, d:"M94,444 L105,444 L104,466 L95,466 Z" },
  { id:"sola",       nome:"Sola do pé", par:true,    d:"M100,470 a9,10 0 1 0 0.1,0 Z" },
];
export const TIPOS_MARCA = [
  { k:"dor",     nome:"Dor ou tensão", cor:"var(--dor)" },
  { k:"inchaco", nome:"Inchaço",       cor:"var(--inchaco)" },
];
export const NIVEIS = ["—", "Leve", "Média", "Forte"];
export const MOMENTOS = ["Ao acordar", "No fim do dia", "Muito tempo na cadeira", "Muito tempo de pé",
  "No treino ou depois", "Ao dormir", "No período menstrual", "Em momentos de estresse", "O tempo todo"];

// === BLOCO 4: AJUDANTES ===
export const ladoDa = c => c.endsWith("_d") ? "direito" : c.endsWith("_e") ? "esquerdo" : "";
export const baseDa = c => c.replace(/_[de]$/, "");
export const nomeDa = c => (FRENTE.concat(COSTAS).find(x => x.id === baseDa(c)) || {}).nome || c;
export const temMarca = m => !!m && TIPOS_MARCA.some(t => (m[t.k] || 0) > 0);

// Mesmo número de WhatsApp? Ignora 55, formatação e o 9º dígito (DDD + 8 finais).
export function mesmoNumero(a, b) {
  const n = s => {
    let d = String(s || "").replace(/\D/g, "");
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
    return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : "";
  };
  const x = n(a), y = n(b);
  return !!x && x === y;
}

// === BLOCO 5: MEDIDAS DA SESSÃO (antes/depois; a profissional pode acrescentar outras) ===
export const MEDIDAS = [
  { k: 'braco_d', nome: 'Braço direito' }, { k: 'braco_e', nome: 'Braço esquerdo' },
  { k: 'busto', nome: 'Abaixo do busto' }, { k: 'cintura', nome: 'Cintura (parte mais fina, acima do umbigo)' },
  { k: 'abdomen', nome: 'Abdômen (na linha do umbigo)' }, { k: 'quadril', nome: 'Quadril (glúteo, parte mais larga)' },
  { k: 'coxa_d', nome: 'Coxa direita' }, { k: 'coxa_e', nome: 'Coxa esquerda' },
  { k: 'panturrilha_d', nome: 'Panturrilha direita' }, { k: 'panturrilha_e', nome: 'Panturrilha esquerda' },
  { k: 'tornozelo_d', nome: 'Tornozelo direito' }, { k: 'tornozelo_e', nome: 'Tornozelo esquerdo' },
  { k: 'peso', nome: 'Peso', un: 'kg' },
];
