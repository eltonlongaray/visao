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
      { id:"nao_tocar", tipo:"texto", opcional:true, q:"Tem alguma parte do corpo que você prefere que eu não toque?", ph:"Ex: pés, rosto…" },
      { id:"conversa", tipo:"unica", q:"Durante a sessão, você prefere…", op:["Conversar","Ficar em silêncio","Tanto faz"] },
      { id:"ambiente", tipo:"texto", opcional:true, q:"Alguma preferência de aroma, música ou temperatura?", ph:"Ex: sem cheiro forte, sala mais quente…" },
      { id:"algo_mais", tipo:"longo", q:"Tem mais alguma coisa que eu deveria saber?", ph:"Fica à vontade" },
    ]},
  ],
};

// === BLOCO 2B: MODELO — ESTÉTICA CORPORAL (18/11, caso Alê) ===
// Mesma base da massoterapia + bloco "Seu objetivo" (celulite, medidas, hábitos)
// + saúde ampliada + autorização de fotos. "ordem": a ordem dos toques vira prioridade.
const _q = id => MASSOTERAPIA.blocos.flatMap(b => b.perguntas).find(p => p.id === id);
// Peso só faz sentido pra quem quer mexer no corpo (medida, gordura, inchaço, flacidez).
const _corpo = R => (R.tratar || []).some(x => ["Gordura localizada","Inchaço e retenção","Flacidez","Celulite"].includes(x));
const _temDor = R => (R.dores || []).some(x => x !== "Não sinto dor");
const AREAS_CORPO = ["Abdômen","Flancos (pneuzinhos)","Culote","Glúteo","Parte interna das coxas","Parte de trás das coxas",
  "Joelhos","Braços (parte de trás)","Costas","Panturrilhas","Papada ou rosto"];
const ESTETICA = {
  profissao: "estetica",
  titulo: "Ficha de atendimento",
  blocos: [
    { nome: "Quem é você", perguntas: [_q("nome"), _q("whatsapp"), _q("nascimento"), _q("conheceu"),
      { id:"profissao_cli", tipo:"texto", q:"Sua profissão", ph:"Ex: professora, trabalho em escritório…" },
    ]},
    { nome: "Seu objetivo", perguntas: [
      { id:"tratar", tipo:"varias", q:"O que você quer tratar?", aj:"Pode marcar vários.",
        op:["Celulite","Estrias","Flacidez","Gordura localizada","Inchaço e retenção","Manchas","Pele do rosto"], outro:true },
      { id:"prioridade", tipo:"varias", ordem:true, q:"Quais áreas mais te incomodam?",
        aj:"Toque na ordem: a primeira é a que mais incomoda.", op: AREAS_CORPO, outro:true },
      { id:"ja_estetica", tipo:"unica", q:"Já fez algum tratamento estético?", op:["Sim","Não"] },
      { id:"ja_estetica_qual", tipo:"texto", q:"Qual e quando?", ph:"Ex: drenagem em 2024, criolipólise…", se: R => R.ja_estetica === "Sim", sub:true },
      { id:"peso_atual", tipo:"texto", q:"Seu peso hoje", ph:"Ex: 68 kg (se souber)", se: R => _corpo(R) },
      { id:"peso_ideal", tipo:"texto", q:"Quanto você gostaria de pesar?", ph:"Ex: 62 kg", opcional:true, se: R => _corpo(R) },
      { id:"peso_quando", tipo:"unica", q:"Há quanto tempo você não está no peso que gostaria?", opcional:true, se: R => _corpo(R),
        op:["Estou no meu peso","Menos de 1 ano","1 a 3 anos","Mais de 3 anos"] },
    ]},
    { nome: "Seus hábitos", perguntas: [
      { id:"agua", tipo:"unica", q:"Quanta água você bebe por dia?", op:["Quase nada","Até 1 litro","1 a 2 litros","Mais de 2 litros"] },
      { id:"intestino", tipo:"unica", q:"Seu intestino funciona…", op:["Todos os dias","3 vezes ou mais na semana","1 vez na semana ou menos"] },
      { id:"urina", tipo:"unica", q:"Quantas vezes você faz xixi por dia?", aj:"Ajuda a entender se o corpo está retendo líquido.",
        op:["Até 2 vezes","3 a 5 vezes","Mais de 5 vezes"] },
      _q("alimentacao"), _q("alimentacao_txt"), _q("sono"), _q("rotina"), _q("atividade"),
      _q("inchaco"), _q("inchaco_quando"), _q("refeicao"),
    ]},
    { nome: "Como está seu corpo", perguntas: [
      { id:"dores", tipo:"varias", q:"Você sente alguma dor?", aj:"Pode marcar vários.",
        op:["Não sinto dor","Dor de cabeça ou enxaqueca","Dores musculares ou tensão","Dores nos ossos e articulações (joelho, cotovelo, ombro…)","Dores nos nervos (formigamento, queimação)"], outro:true, so:["Não sinto dor"] },
      { ..._q("mapa"), q:"Onde dói?", aj:"Toque na parte do corpo e marque. Pode marcar quantas quiser.", se: R => _temDor(R), sub:true },
      _q("estresse"),
    ]},
    { nome: "Saúde e segurança", perguntas: [
      { id:"aviso_saude", tipo:"aviso", q:"Essas respostas garantem um tratamento seguro pra você. Elas ficam só com a profissional." },
      { id:"saude", tipo:"varias", q:"Marque o que se aplica a você",
        op:["Estou gestante","Estou amamentando","Fiz cirurgia nos últimos 6 meses","Tenho varizes","Já tive trombose","Pressão alta","Diabetes",
          "Problema de pele ou ferida","Pele sensível ou que mancha fácil","Uso ácido na pele ou Roacutan","Tomo anticoagulante",
          "Em tratamento de câncer","Uso marca-passo","Nenhuma dessas"], so:["Nenhuma dessas"] },
      _q("gestante_semanas"), _q("cirurgia_qual"),
      { id:"contraceptivo", tipo:"unica", q:"Usa algum método contraceptivo?",
        op:["Nenhum","Pílula","DIU","Mirena","Implante","Adesivo","Estou na menopausa","Prefiro não dizer"] },
      { id:"acompanhamento", tipo:"varias", q:"Faz acompanhamento com algum desses?", aj:"Pode marcar vários.",
        op:["Nutricionista","Endocrinologista ou nutrólogo","Dermatologista","Ginecologista","Cardiologista","Psicólogo ou psiquiatra","Personal trainer","Nenhum"], outro:true, so:["Nenhum"] },
      _q("alergia"), _q("alergia_qual"), _q("remedio"), _q("remedio_qual"),
    ]},
    { nome: "Fotos e preferências", perguntas: [
      { id:"foto_acomp", tipo:"unica", q:"Posso tirar fotos do seu corpo pra acompanhar sua evolução?",
        aj:"São 4 fotos (frente, costas e lados), só pra comparar o antes e depois. Ficam só comigo.", op:["Sim, autorizo","Não"] },
      { id:"foto_insta", tipo:"unica", q:"Posso usar essas fotos no Instagram, sem mostrar seu rosto?",
        op:["Sim, pode usar sem o rosto","Não, só pro meu acompanhamento"], se: R => R.foto_acomp === "Sim, autorizo", sub:true },
      _q("nao_tocar"), _q("conversa"), _q("ambiente"), _q("algo_mais"),
    ]},
  ],
};

// === BLOCO 2C: MODELO — PELE E ACNE COM ACOMPANHAMENTO (18/11) ===
// Acne tem muito de hormônio, alimentação e rotina: a ficha pergunta isso pra
// a profissional montar o cuidado e, se for o caso, indicar médico.
const PELE = {
  profissao: "pele",
  titulo: "Ficha de pele",
  blocos: [
    { nome: "Quem é você", perguntas: [_q("nome"), _q("whatsapp"), _q("nascimento"), _q("conheceu")] },
    { nome: "Sua pele", perguntas: [
      { id:"pele_queixa", tipo:"varias", q:"O que mais te incomoda na pele?", aj:"Pode marcar vários.",
        op:["Espinhas","Cravos","Manchas ou marcas de acne","Oleosidade","Poros abertos","Pele sensível ou vermelha","Pele seca"], outro:true },
      { id:"pele_onde", tipo:"varias", q:"Onde aparecem as espinhas?", op:["Testa","Nariz","Bochechas","Queixo e mandíbula","Costas","Peito","Não tenho espinhas"], so:["Não tenho espinhas"] },
      { id:"pele_tempo", tipo:"unica", q:"Há quanto tempo isso acontece?", op:["Menos de 6 meses","6 meses a 2 anos","Mais de 2 anos","Desde a adolescência"] },
      { id:"pele_tipo", tipo:"unica", q:"No fim do dia, sua pele fica…", op:["Brilhando no rosto todo","Brilhando só na testa, nariz e queixo","Normal","Repuxando, seca"] },
      { id:"pele_rotina", tipo:"varias", q:"O que você usa na pele hoje?", aj:"Pode marcar vários.",
        op:["Sabonete de rosto","Hidratante","Protetor solar todo dia","Ácido (ex: salicílico, glicólico)","Remédio de espinha passado por médico","Maquiagem quase todo dia","Nada"], outro:true, so:["Nada"] },
      { id:"pele_ja_fez", tipo:"varias", q:"Já fez algum tratamento pra acne?", op:["Roacutan (isotretinoína)","Antibiótico","Limpeza de pele","Peeling","Laser ou luz","Nunca fiz"], outro:true, so:["Nunca fiz"] },
      { id:"pele_mexe", tipo:"unica", q:"Você costuma espremer ou mexer nas espinhas?", op:["Sim, sempre","Às vezes","Não"] },
    ]},
    { nome: "Hormônios", perguntas: [
      { id:"aviso_horm", tipo:"aviso", q:"Acne tem muito a ver com hormônio. Essas respostas ajudam a entender a sua pele (e a saber se vale passar com um médico)." },
      { id:"ciclo", tipo:"unica", q:"Sua menstruação é…", op:["Regular","Irregular","Não menstruo (anticoncepcional contínuo, DIU…)","Menopausa","Não se aplica"] },
      { id:"piora_ciclo", tipo:"unica", q:"As espinhas pioram antes da menstruação?", op:["Sim, bastante","Um pouco","Não","Não sei"], se: R => R.ciclo === "Regular" || R.ciclo === "Irregular", sub:true },
      { id:"horm_sinais", tipo:"varias", q:"Você tem algum desses?", aj:"Pode marcar vários.",
        op:["Ovário policístico (SOP)","Pelos a mais no rosto ou corpo","Queda de cabelo","Tireoide","Nenhum desses"], so:["Nenhum desses"] },
      { id:"contraceptivo", tipo:"unica", q:"Usa algum método contraceptivo?", op:["Nenhum","Pílula","DIU de cobre","DIU hormonal (Mirena)","Implante","Adesivo ou anel","Prefiro não dizer"] },
    ]},
    { nome: "Alimentação e rotina", perguntas: [
      { id:"alim_pele", tipo:"varias", q:"O que tem bastante na sua alimentação?", aj:"Marque o que você come quase todo dia.",
        op:["Leite, queijo ou iogurte","Doces e açúcar","Pão, massa e farinha branca","Frituras","Comida pronta ou industrializada","Chocolate","Whey ou suplemento","Frutas e verduras"] },
      { id:"agua", tipo:"unica", q:"Quanta água você bebe por dia?", op:["Quase nada","Até 1 litro","1 a 2 litros","Mais de 2 litros"] },
      { id:"intestino", tipo:"unica", q:"Seu intestino funciona…", op:["Todos os dias","3 vezes ou mais na semana","1 vez na semana ou menos"] },
      _q("sono"), _q("estresse"),
      { id:"rotina_pele", tipo:"varias", q:"No dia a dia…", aj:"Pode marcar vários.",
        op:["Durmo de maquiagem às vezes","Troco a fronha pelo menos 1 vez por semana","Uso capacete, máscara ou boné muito tempo","Encosto o celular no rosto","Faço academia e demoro pra lavar o rosto"] },
    ]},
    { nome: "Saúde e segurança", perguntas: [
      { id:"aviso_saude", tipo:"aviso", q:"Essas respostas garantem um tratamento seguro pra você. Elas ficam só com a profissional." },
      { id:"saude", tipo:"varias", q:"Marque o que se aplica a você",
        op:["Estou gestante","Estou amamentando","Uso ácido na pele ou Roacutan","Pele sensível ou que mancha fácil","Herpes no rosto","Alergia a cosmético","Nenhuma dessas"], so:["Nenhuma dessas"] },
      _q("gestante_semanas"), _q("alergia"), _q("alergia_qual"), _q("remedio"), _q("remedio_qual"),
    ]},
    { nome: "Fotos e preferências", perguntas: [
      { id:"foto_acomp", tipo:"unica", q:"Posso tirar fotos do seu rosto pra acompanhar a evolução?",
        aj:"São 3 fotos (frente e os dois lados), só pra comparar o antes e depois. Ficam só comigo.", op:["Sim, autorizo","Não"] },
      { id:"foto_insta", tipo:"unica", q:"Posso usar essas fotos no Instagram?", op:["Sim, pode usar","Não, só pro meu acompanhamento"], se: R => R.foto_acomp === "Sim, autorizo", sub:true },
      _q("conversa"), _q("algo_mais"),
    ]},
  ],
};

export const MODELOS = { massoterapia: MASSOTERAPIA, estetica: ESTETICA, pele: PELE };
export const PROFISSOES = [{ k: "massoterapia", nome: "Massoterapeuta", emoji: "💆" },
  { k: "estetica", nome: "Estética corporal", emoji: "✨" }];

// O que cada profissão registra em cada SESSÃO (lado da profissional).
// massoterapia: dor ao pressionar + medidas antes/depois (como sempre).
// estetica: plano de medidas (todas × 1ª e 5ª), medidas por altura, 4 fotos, áreas tratadas, técnica/blend.
export const SESSAO_POR_PROFISSAO = {
  massoterapia: { palpacao: true, medidas: "antes_depois" },
  estetica: { palpacao: true, medidas: "por_altura", fotos: true, areas: true, tecnica: true, plano: true },
  pele: { palpacao: false, medidas: null, fotos: true, areas: false, tecnica: true, plano: true },
};
// A ficha mostra que a pessoa tem dor? (aí a "dor ao pressionar" já abre na sessão)
// true/false pela ficha; null = sem ficha respondida.
export function fichaTemDor(resp) {
  if (!resp) return null;
  const r = resp.respostas || {};
  if (Object.values(resp.mapa || {}).some(m => (m?.dor || 0) > 0)) return true;
  if ((r.dores || []).some(x => x !== "Não sinto dor")) return true;
  if ((r.motivo || []).some(x => x === "Aliviar dor ou tensão" || x === "Recuperação de treino")) return true;
  return false;
}
export const sessaoDe = prof => SESSAO_POR_PROFISSAO[prof] || SESSAO_POR_PROFISSAO.massoterapia;

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
  { k: 'busto', nome: 'Abaixo do busto' }, { k: 'cintura', nome: 'Cintura (parte mais fina, alguns cm acima do umbigo)' },
  { k: 'abdomen', nome: 'Abdômen (na linha do umbigo)' }, { k: 'quadril', nome: 'Quadril (glúteo, parte mais larga)' },
  { k: 'coxa_d', nome: 'Coxa direita' }, { k: 'coxa_e', nome: 'Coxa esquerda' },
  { k: 'panturrilha_d', nome: 'Panturrilha direita' }, { k: 'panturrilha_e', nome: 'Panturrilha esquerda' },
  { k: 'tornozelo_d', nome: 'Tornozelo direito' }, { k: 'tornozelo_e', nome: 'Tornozelo esquerdo' },
  { k: 'peso', nome: 'Peso', un: 'kg' },
];

// Estética: medidas por ALTURA (como a ficha de papel da Alê). Um valor por sessão.
const _alturas = (k, nome, n, passo) => Array.from({ length: n }, (_, i) => ({ k: `${k}_${i + 1}`, nome: `${nome} · altura ${i + 1}`, dica: `${i * passo} cm`, grupo: nome }));
export const MEDIDAS_ALTURA = [
  { k: 'peso', nome: 'Peso', un: 'kg', grupo: 'Peso' },
  ..._alturas('braco_d', 'Braço direito', 3, 5), ..._alturas('braco_e', 'Braço esquerdo', 3, 5),
  ..._alturas('abdomen', 'Abdômen', 5, 5), ..._alturas('costas', 'Costas', 5, 5),
  ..._alturas('perna_d', 'Perna direita', 3, 10), ..._alturas('perna_e', 'Perna esquerda', 3, 10),
];
// Áreas tratadas na sessão (as "obstruções" do mapa da ficha de papel).
export const AREAS_TRATADAS = {
  Frente: ["Axilas","Colo","Abdômen superior","Abdômen inferior","Flancos","Culotes","Parte interna das coxas","Parte interna dos joelhos"],
  Costas: ["Dorso superior","Dorso inferior","Parte de trás dos braços","Sub-glúteo"],
};
export const POSES = [{ k: 'frente', nome: 'Frente' }, { k: 'costas', nome: 'Costas' }, { k: 'lado_d', nome: 'Lado direito' }, { k: 'lado_e', nome: 'Lado esquerdo' }];

// === BLOCO 6: O QUE FICOU EM BRANCO (aviso pra profissional antes de abrir a ficha) ===
// Nome curto de cada pergunta, pra frase "Fulana não respondeu: sono, alergia…".
export const CURTAS = {
  nascimento: 'data de nascimento', conheceu: 'como te conheceu', motivo: 'o que procura', tipos: 'tipos de massagem',
  frequencia: 'frequência de massagem', mapa: 'mapa do corpo', ja_fez: 'o que já fez pra dor', fadiga: 'fadiga muscular',
  fadiga_onde: 'onde sente fadiga', estresse_causa: 'o que estressa', estresse_duracao: 'quanto dura o estresse',
  estresse: 'nível de estresse', sono: 'sono', rotina: 'rotina', atividade: 'qual atividade física', inchaco: 'inchaço',
  inchaco_quando: 'quando incha', refeicao: 'tipo de refeição', alimentacao: 'alimentação', saude: 'condições de saúde',
  gestante_semanas: 'semanas de gestação', cirurgia_qual: 'qual cirurgia', alergia: 'alergia a óleo/creme/aroma',
  alergia_qual: 'qual alergia', remedio: 'remédio contínuo', remedio_qual: 'qual remédio', pressao: 'pressão preferida',
  conversa: 'conversa ou silêncio', dores: 'se sente dor',
  profissao_cli: 'profissão', tratar: 'o que quer tratar', prioridade: 'áreas que incomodam', ja_estetica: 'tratamento estético anterior',
  ja_estetica_qual: 'qual tratamento estético', peso_atual: 'peso atual', peso_ideal: 'peso desejado', peso_quando: 'há quanto tempo fora do peso',
  agua: 'água por dia', intestino: 'intestino', urina: 'vezes que urina', contraceptivo: 'contraceptivo', acompanhamento: 'acompanhamento médico',
  foto_acomp: 'autorização de fotos', foto_insta: 'fotos no Instagram',
  pele_queixa: 'o que incomoda na pele', pele_onde: 'onde aparecem as espinhas', pele_tempo: 'há quanto tempo', pele_tipo: 'tipo de pele',
  pele_rotina: 'o que usa na pele', pele_ja_fez: 'tratamentos de acne', pele_mexe: 'se mexe nas espinhas', ciclo: 'menstruação',
  piora_ciclo: 'piora no ciclo', horm_sinais: 'sinais hormonais', alim_pele: 'alimentação', rotina_pele: 'rotina',
};
// Conta só o que a pessoa VIU (respeita as condicionais). Texto livre ("longo") e "opcional" não contam.
export function faltando(modelo, r, mapa) {
  r = r || {};
  const out = [];
  for (const b of modelo.blocos) for (const p of b.perguntas) {
    if (p.tipo === 'aviso' || p.ident || p.opcional || p.tipo === 'longo') continue;
    if (p.se && !p.se(r)) continue;
    const saude = b.nome === 'Saúde e segurança';
    if (p.tipo === 'mapa') {
      if (!Object.values(mapa || {}).some(temMarca)) out.push({ id: 'mapa', curta: CURTAS.mapa, bloco: b.nome, q: 'Mapa do corpo: nenhuma região marcada', saude });
      continue;
    }
    const v = r[p.id];
    const curta = CURTAS[p.id] || p.q;
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) out.push({ id: p.id, curta, bloco: b.nome, q: p.q, saude });
    else if (p.outro && (v === 'Outro' || (Array.isArray(v) && v.includes('Outro'))) && !String(r[p.id + '_outro'] || '').trim())
      out.push({ id: p.id, curta: curta + ' (o "outro")', bloco: b.nome, q: p.q + ' (marcou "Outro" sem dizer qual)', saude });
  }
  return out;
}
