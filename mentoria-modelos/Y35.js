// ─── ÍNDICE ──────────────────────────────────────────────────
// Modelo da MENTORIA da Larissa Rodrigues (slug Y35).
//   BLOCO 1: marca e cores · BLOCO 2: oferta (variáveis das mensagens)
//   BLOCO 3: formulário das COLEGAS (/pesquisa/Y35) · BLOCO 4: formulário de SELEÇÃO (/selecao/Y35)
//   BLOCO 5+: mensagens do caminho de venda (vieram do castelo: /castelo/vendas/textos.js)
// Lido pela página pública (mentoria-form.html) e pelo painel 🎓 Mentoria do app.
// ─────────────────────────────────────────────────────────────
var M = window.MENTORIA_MODELO = {};

// === BLOCO 1: MARCA E CORES ===
M.marca = { nome: "Larissa Rodrigues", sub: "Massoterapia", logo: "/mentoria-modelos/img/Y35-logo.png",
  instagram: "massoterapeutalarissar", assinatura: "Larissa Rodrigues" };
M.cores = { fundo: "#F4F1ED", tinta: "#050404", texto: "#3F3A38", apoio: "#5f5856", rosa: "#E48F94", rosaTxt: "#C4646B", clara: "#FCDDDA", cartao: "#fffdfa" };

// === BLOCO 2: OFERTA (vem do /castelo/mentoria/config.js — mudou lá, muda aqui) ===
M.oferta = {
  nome: "Massoterapeuta de Sucesso",
  link: "https://eltonlongaray.github.io/castelo/mentoria/",
  prazo: null,            // ex: "2026-12-22T23:59:00-03:00"
  vagas: 5,               // por turma
  precoHoje: 1800, parcelas: 12, valorParcela: null,
  encontros: "5 aulas de 3h",
  aulas: ["O Ambiente", "O Acolhimento na maca", "A Ficha do cliente", "A Massagem", "O Efeito Cascata"],
};

// Opções que se repetem nos dois formulários
const TEMPO = ["Ainda não atendo", "Estou começando (menos de 1 ano)", "De 1 a 3 anos", "De 3 a 5 anos", "Mais de 5 anos"];
const SEMANA = ["Ainda não atendo", "Até 5", "De 6 a 15", "De 16 a 30", "Mais de 30"];
const REFERENCIA = { q: "Se daqui a 1 ano você fosse nomeada como uma referência de sucesso na sua área, como seria a sua rotina e o seu estilo de vida?",
  ajuda: "Pensa em renda, quantas horas por dia, que tipo de cliente e o que você faria com o seu tempo livre." };
// Colegas já atendem: sem as opções de quem ainda não começou
const TEMPO_COL = TEMPO.filter(o => !o.startsWith("Ainda não"));
const SEMANA_COL = SEMANA.filter(o => !o.startsWith("Ainda não"));
const RENDA_PRINC_COL = ["É a minha renda principal", "Complementa a minha renda"];
const RENDA_PRINC = ["É a minha renda principal", "Complementa a minha renda", "Ainda não tenho renda com ela"];
const JA_TENTOU = { q: "Pra ter mais clientes fixos e uma renda mais previsível no fim do mês, o que você já tentou que não deu o resultado que você queria?",
  ajuda: "Ex: curso, promoção, Instagram, aplicativo, parceria…" };
const INJUSTO = { q: "O que você acha injusto na nossa profissão, ou que não deveria ser assim?",
  ajuda: "Ex: o cliente achar caro, ter que dar desconto pra ser escolhida, trabalhar o dia inteiro pra pagar as contas…" };

// === BLOCO 3: FORMULÁRIO DAS COLEGAS (pesquisa — gera curiosidade, não fala do curso) ===
M.pesquisa = {
  titulo: "Pesquisa entre colegas",
  previa: { titulo: "Uma pesquisa entre colegas de massagem 🤍", texto: "Perguntas rápidas · Larissa Rodrigues" },
  intro: {
    eyebrow: "Pesquisa entre colegas",
    h1: "Oi! Tô criando um <em>projeto</em>.",
    lead: ["É pra melhorar a qualidade de vida e elevar o padrão das profissionais da massoterapia. Quero ouvir quem vive isso na pele: as colegas.",
           "São {n} perguntas, leva uns 8 minutos. Responde com sinceridade, não tem resposta certa 🤍"],
  },
  perguntas: [
    { id: "nome", tipo: "texto", q: "Qual é o seu nome?", ph: "Seu nome" },
    { id: "whatsapp", tipo: "tel", q: "Qual é o seu WhatsApp?", ph: "(51) 9 9999-9999",
},
    { id: "tempo_atende", tipo: "escolha", q: "Há quanto tempo você atende com massagem?", ops: TEMPO_COL },
    { id: "renda_principal", tipo: "escolha", q: "Hoje a massagem é a sua renda principal?", ops: RENDA_PRINC_COL },
    { id: "atend_semana", tipo: "escolha", q: "Quantos atendimentos você faz por semana, em média?", ops: SEMANA_COL },
    { id: "parte_dificil", tipo: "longo", q: "Qual é a parte mais difícil de trabalhar com massagem hoje?",
      ajuda: "Ex: conseguir clientes novos, o cliente sumir depois da primeira sessão, o cansaço no fim do dia…" },
    { id: "atrapalha", tipo: "varias", outro: true, q: "O que mais te atrapalha?", ajuda: "Pode marcar mais de uma.",
      ops: ["Conseguir clientes", "Atrair clientes de qualidade", "Fidelizar os clientes (eles não voltam)", "Ter constância de atendimentos",
             "Renda imprevisível no fim do mês", "Cobrar o valor certo", "Ter melhores resultados nas sessões", "Cansaço no corpo",
             "Divulgar no Instagram", "Me sentir segura na técnica"] },
    { id: "mais_incomoda", tipo: "escolha", opsDe: "atrapalha", q: "Desses, qual mais te incomoda hoje?" },
    { id: "como_se_sente", tipo: "longo", q: "Quando você pensa nisso, como você se sente?", ajuda: "Ex: cansada, insegura, frustrada, com medo de não dar conta…" },
    { id: "injusto", tipo: "longo", ...INJUSTO },
    { id: "precisa", tipo: "longo", q: "Na sua opinião, o que uma massoterapeuta precisa pra viver bem da massagem?",
      ajuda: "Ex: clientes fixos, saber cobrar, uma técnica que a diferencie, uma rotina organizada…" },
    { id: "ja_tentou", tipo: "longo", ...JA_TENTOU },
    { id: "rotina_ideal", tipo: "longo", ...REFERENCIA },
  ],
  final: {
    eyebrow: "Resposta recebida",
    h1: "Obrigada{, nome}.<br><em>Sua resposta chegou até mim.</em>",
    texto: ["Esse projeto nasce de respostas como a sua.",
            "Quando estiver pronto, você vai ser uma das primeiras a saber. Fica de olho no seu WhatsApp 👀"],
  },
};

// === BLOCO 4: FORMULÁRIO DE SELEÇÃO (aula exclusiva) ===
M.selecao = {
  titulo: "Seleção · Aula exclusiva",
  previa: { titulo: "Seleção · Aula exclusiva com a Larissa", texto: "Responda e concorra a uma vaga · Larissa Rodrigues" },
  intro: {
    eyebrow: "Seleção · Aula exclusiva",
    h1: "Que bom que você <em>quer</em> estar nessa aula.",
    lead: ["Como as vagas são poucas, eu vou ler cada resposta com cuidado pra escolher quem vai participar.",
           "São {n} perguntas, leva uns 10 minutos. Responda com sinceridade: não existe resposta certa."],
  },
  perguntas: [
    { id: "nome", tipo: "texto", q: "Qual é o seu nome?", ph: "Seu nome" },
    { id: "instagram", tipo: "texto", q: "Qual é o seu @ do Instagram?", ph: "@seuperfil" },
    { id: "whatsapp", tipo: "tel", q: "Qual é o seu WhatsApp?", ph: "(51) 9 9999-9999", ajuda: "É por aqui que eu aviso se você for selecionada." },
    { id: "cidade", tipo: "texto", q: "Em qual cidade você atende?", ph: "Cidade / estado", opcional: true },
    { id: "tempo_atende", tipo: "escolha", q: "Há quanto tempo você atende com massagem?", ops: TEMPO },
    { id: "renda_principal", tipo: "escolha", q: "Hoje a massagem é a sua renda principal?", ops: RENDA_PRINC },
    { id: "atend_semana", tipo: "escolha", q: "Quantos atendimentos você faz por semana, em média?", ops: SEMANA },
    { id: "renda", tipo: "escolha", q: "Qual é a sua renda média com massagem por mês hoje?", opcional: true,
      ajuda: "Fica só entre nós — é pra eu entender o seu momento.",
      ops: ["Ainda não tenho renda com massagem", "Até R$2 mil", "De R$2 a 5 mil", "De R$5 a 10 mil", "Acima de R$10 mil"] },
    { id: "clientes_voltam", tipo: "escolha", q: "Como os seus clientes voltam hoje?",
      ops: ["Ainda não tenho clientes", "Voltam com constância, por cuidado", "Só quando a dor aperta", "Somem depois de 1 ou 2 sessões", "Um pouco de cada"] },
    { id: "pacotes", tipo: "escolha", q: "Você vende pacotes de sessões?",
      ops: ["Ainda não atendo", "Sim, a maioria compra pacote", "Às vezes", "Não, só sessão avulsa"] },
    { id: "origem_clientes", tipo: "escolha", outro: true, q: "De onde vem a maioria dos seus clientes novos hoje?",
      ops: ["Ainda não tenho clientes", "Indicação de quem já atendi", "Instagram", "Promoções e aplicativos"] },
    { id: "maior_desafio", tipo: "longo", q: "Qual é hoje o seu maior desafio com os seus clientes ou com a sua agenda?",
      ajuda: "Ex: clientes que só aparecem quando dói, agenda vazia no meio da semana, não conseguir fechar pacote…" },
    { id: "como_se_sente", tipo: "longo", q: "Quando você pensa nesse desafio, como você se sente?", ajuda: "Ex: cansada, insegura, frustrada, com medo de não dar conta…" },
    { id: "injusto", tipo: "longo", ...INJUSTO },
    { id: "o_que_falta", tipo: "escolha", outro: true, q: "Na sua opinião, o que mais falta pra você ter uma agenda cheia e previsível?",
      ops: ["Conseguir meus primeiros clientes", "Me sentir segura pra atender", "Mais técnicas e cursos", "Saber me divulgar", "Cobrar mais caro", "Clientes que voltem e me indiquem"] },
    { id: "ja_tentou", tipo: "longo", ...JA_TENTOU },
    { id: "rotina_ideal", tipo: "longo", ...REFERENCIA },
    { id: "por_que_vaga", tipo: "longo",
      pre: "Essa aula tem valor de R$147, mas dessa vez vou liberar essas vagas gratuitamente — e cada pessoa selecionada ocupa a vaga de alguém, comparecendo ou não.",
      q: "Por que você acha que essa vaga deve ser sua?",
      ajuda: "Ex: o que você quer mudar no seu trabalho e o que você vai fazer com o que aprender…" },
    { id: "como_ajuda", tipo: "longo", q: "De que forma você acredita que o meu método pode te ajudar?",
      ajuda: "Ex: fazer os clientes voltarem, cobrar melhor, me sentir mais segura, sair do cansaço…" },
  ],
  final: {
    eyebrow: "Inscrição recebida",
    h1: "Obrigada{, nome}.<br><em>Sua resposta chegou até mim.</em>",
    texto: ["Eu sei que parar pra olhar pro próprio trabalho — os desafios, os sonhos, o que ainda falta — não é pouca coisa. Só de ter chegado até aqui, você já deu o primeiro passo pra sair do lugar.",
            "Vou ler cada resposta com calma e carinho. Se você for selecionada, eu te aviso pessoalmente pelo <b>direct</b> e pelo <b>WhatsApp</b>."],
    botaoInstagram: true,
  },
};

// Variáveis que as mensagens podem usar a partir das respostas da pessoa
M.varsPessoa = l => {
  const f = l.formularios || {}, s = f.selecao || {}, p = f.pesquisa || {};
  const limpa = t => String(t || "").replace(/[.\s]+$/, "");
  return { desafio: limpa(s.maior_desafio || p.parte_dificil).toLowerCase(), injusto: limpa(s.injusto || p.injusto), rotina: s.rotina_ideal || p.rotina_ideal || "" };
};

// Variáveis: {nome} {desafio} {injusto} {rotina} {link} {prazo} {vagas} {preco} {parcela} {parcelas} {encontros}
// [[ ... ]] = trecho opcional: some sozinho se alguma variável dentro dele estiver vazia.
// === BLOCO 5: MENSAGENS PRA CADA PESSOA (1 toque no painel abre o WhatsApp já escrito) ===
M.mensagens = [
  { k: "d0_presente", rot: "Convite · foi ao workshop", quando: "No mesmo dia, depois do workshop", pra: "presente",
    txt: `Oi {nome}! Aqui é a Lari 💛

Obrigada de verdade por ter ficado comigo no workshop.[[ No formulário você me contou que o seu maior desafio hoje é "{desafio}", e eu fiquei pensando em você enquanto falava do cliente que só aparece quando dói.]]

Me conta: o que mais fez sentido pra você hoje?` },
  { k: "d0_ausente", rot: "Não foi ao workshop", quando: "No mesmo dia ou no dia seguinte", pra: "ausente",
    txt: `Oi {nome}! Aqui é a Lari 💛

Senti sua falta no workshop! A gente falou sobre por que o cliente some depois que a dor passa, e como fazer ele voltar por constância e ainda te indicar.

Abri uma oportunidade só pra quem se inscreveu: a mentoria presencial, com condição especial até {prazo}. Posso te contar como funciona?` },
  { k: "abandono", rot: "Reservou e não pagou", quando: "Algumas horas depois da reserva", pra: "reservou",
    txt: `Oi {nome}! Vi que você reservou sua vaga na mentoria, mas o comprovante ainda não chegou por aqui 💛

Aconteceu alguma coisa? Se quiser, te ajudo com a forma de pagamento: dá pra fazer no Pix ou no cartão em até {parcelas}x.` },
  { k: "conversa", rot: "Abrir conversa (quem ainda não respondeu)", quando: "1 a 2 dias depois", pra: "todas",
    txt: `Oi {nome}, tudo bem?

[[Fiquei com uma coisa que você me contou na cabeça: "{injusto}". Eu já senti isso também, e foi isso que me fez criar o meu método.

]]Posso te fazer duas perguntas rápidas pra entender se a mentoria faz sentido pra você agora?` },
  { k: "prazo", rot: "Lembrete do prazo", quando: "Penúltimo dia", pra: "todas",
    txt: `{nome}, passando com carinho pra te avisar: a condição especial da mentoria (com os bônus) vai até {prazo}.[[ Restam só {vagas} vagas.]]

Se tiver qualquer dúvida, me chama aqui que eu te respondo pessoalmente 💛
{link}` },
  { k: "ultimo_dia", rot: "Último dia", quando: "Último dia, de manhã", pra: "todas",
    txt: `{nome}, hoje é o último dia da condição especial da mentoria Massoterapeuta de Sucesso. À meia-noite ela encerra, junto com os bônus.

Se você sente que é a sua hora de parar de ser o remédio de emergência dos seus clientes, é aqui 👇
{link}

Qualquer coisa, tô aqui.` },
  { k: "despedida", rot: "Despedida (sem resposta)", quando: "Depois de 2 tentativas sem resposta", pra: "todas",
    txt: `{nome}, tentei falar com você algumas vezes esses dias e imagino que não seja o momento agora, e tá tudo bem 💛

Quando fizer sentido, é só me chamar. Continua contando comigo por aqui!` },
  { k: "boas_vindas", rot: "Boas-vindas (pagou)", quando: "Assim que o comprovante chegar", pra: "pagou",
    txt: `{nome}, boas-vindas à Massoterapeuta de Sucesso! 💛

Sua vaga tá confirmada. Nos próximos dias eu te mando os detalhes do primeiro encontro e te coloco no grupo da turma.

Tô muito feliz de caminhar com você.` },
];

// === BLOCO 6: ROTEIRO DA CONVERSA NO PRIVADO (copiar e colar durante a conversa) ===
M.roteiro = [
  { rot: "1 · Pergunta de situação", txt: `{nome}, qual era o seu objetivo quando você se inscreveu no workshop? E o que mais te ajudou?`, obs: "Esperar a resposta. Ouvir de verdade." },
  { rot: "2 · Pergunta de problema", txt: `E hoje, o que mais te impede de chegar nisso? Qual é o maior desafio com os seus clientes agora?`, obs: "Esperar a resposta. Ela vai dizer o impedimento principal." },
  { rot: "3 · Paráfrase + argumento", txt: `Obrigada por me contar, {nome}. Você me disse que quer [OBJETIVO] e que hoje tem dificuldade com [DESAFIO]. É exatamente isso que a gente trabalha na mentoria: como fazer o cliente entender a causa da dor, voltar por constância e te indicar, sem você trabalhar mais horas.

Uma cliente minha me disse: "depois que fizer uma vez não vai querer mais ir em outra pessoa". É isso que eu quero que os seus clientes digam de você.`, obs: "Trocar [OBJETIVO] e [DESAFIO] pelas palavras DELA." },
  { rot: "4 · Pergunta de necessidade", txt: `Diante disso, que diferença você acha que faria na sua vida ter clientes que voltam sem estar com dor e ainda trazem amigas?`, obs: "Esperar a resposta. Ela mesma vai dizer o valor." },
  { rot: "5 · Fechamento", txt: `{nome}, eu tenho certeza que a mentoria vai te ajudar a [OBJETIVO DELA]. O investimento é de {parcelas}x de {parcela} no cartão, ou {preco} à vista no Pix.

E você tem a minha garantia: se aplicar o que eu te ensinar nos primeiros 30 dias e não sentir diferença em como os seus clientes voltam, eu te acompanho sem custo até sentir.

Faz sentido pra você?`, obs: "Se disser sim → mandar o link (6)." },
  { rot: "6 · Link + comprovante", txt: `Que alegria! 💛 Aqui o link pra garantir sua vaga: {link}

Assim que pagar, me manda o comprovante aqui que eu já confirmo sua vaga e te coloco no grupo da turma.`, obs: "" },
  { rot: "Cadência · 2ª tentativa", txt: `Oi {nome}! Passando pra ver se ficou alguma dúvida sobre a mentoria, porque a condição especial termina em breve. Posso te ajudar em alguma coisa?`, obs: "Se ela parou de responder. Depois disso, usar a Despedida." },
];

// === BLOCO 7: OBJEÇÕES (resposta pronta) ===
M.objecoes = [
  { rot: "\"Tá caro\" / \"não tenho dinheiro agora\"", txt: `Te entendo, {nome}. Faz uma conta comigo: quantos clientes por mês aparecem uma vez e somem? Se só 2 ou 3 deles passarem a voltar por constância, a mentoria se paga, sem contar as indicações deles. Por isso deixei também em até {parcelas}x no cartão.` },
  { rot: "\"Não tenho tempo\"", txt: `Eu sei que sua rotina é corrida, {nome}, e é justamente por isso que a mentoria é prática: você aplica nos atendimentos que já tem na semana, sem trabalhar mais horas.

E pensa comigo: quanto mais cheia a sua agenda, mais valor a sua massagem tem, e mais você pode cobrar por ela. São {encontros} que você investe agora pra ter uma agenda cheia de clientes que voltam, te indicam e não te trocam por nada.` },
  { rot: "\"Já fiz vários cursos\"", txt: `Faz sentido, {nome}. Mas me diz: os cursos que você fez te ensinaram o que fazer com as mãos ou o que fazer com a pessoa? A mentoria é sobre a pessoa: a escuta, o vínculo e a conversa que fazem ela voltar e te indicar.` },
  { rot: "\"Sou iniciante\"", txt: `Esse é o melhor momento, {nome}. Você já começa construindo clientes que voltam por constância, em vez de passar anos dependendo da dor dos outros como eu passei.` },
  { rot: "\"Vou pensar\"", txt: `Claro, {nome}, decisão importante merece reflexão 💛 Quais são as 2 coisas principais que você precisa pensar? Assim eu já te tiro as dúvidas antes da condição encerrar.` },
  { rot: "\"De 0 a 5\" · 1ª pergunta (quando a pessoa tá em cima do muro)", txt: `{nome}, de 0 a 5, qual a chance de você entrar na mentoria?`, obs: "Espera a resposta antes de mandar a 2ª pergunta." },
  { rot: "\"De 0 a 5\" · 2ª pergunta (depois que ela responder)", txt: `E o que falta pra esse número chegar no 5?`, obs: "O que ela responder é a objeção real: responde com a mensagem certa daqui de cima." },
  { rot: "\"Isso é dom, não sei se consigo\"", txt: `Não é dom, {nome}, é escuta. Você viu acontecer ao vivo no workshop. Escuta se treina, e é exatamente isso que a gente faz nos encontros.` },
];

// === BLOCO 8: CALENDÁRIO DO GRUPO DE WHATSAPP (antes e depois do workshop) ===
M.grupo = [
  { quando: "Ao criar o grupo (selecionadas)", txt: `Boas-vindas! 💛

Se você está aqui, é porque a sua inscrição foi selecionada pro meu workshop. Aqui vou mandar tudo: data, horário, o que levar e alguns presentes antes do grande dia.

Me conta aqui embaixo: de onde você é e há quanto tempo atende? 🙂` },
  { quando: "5 dias antes", txt: `Faltam 5 dias! ✨

No workshop eu vou te mostrar por que o seu cliente some depois que a dor passa, e o que fazer pra ele voltar por constância.

E tem uma coisa importante: no final, ao vivo, eu vou abrir uma oportunidade que eu nunca abri antes, só pra quem estiver lá. Por isso, fica até o fim 💛` },
  { quando: "3 dias antes", txt: `Uma pergunta pra vocês pensarem até o workshop:

Quantos dos seus clientes de hoje vão voltar mês que vem SEM estar com dor?

Guarda a sua resposta. A gente vai falar exatamente disso 💛` },
  { quando: "Véspera", txt: `É amanhã! 🔥

📅 [DATA] · ⏰ [HORÁRIO] · 💻 [LINK]

Separa papel, caneta e um cantinho tranquilo com boa internet. Eu vou atender ao vivo pra vocês verem tudo de pertinho. A parte que vocês mais querem fica pro segundo tempo, e no final eu abro a oportunidade especial só pra quem estiver lá.

Te espero 💛` },
  { quando: "No dia · 1 hora antes", txt: `Daqui 1 hora a gente começa! ⏰ [LINK]` },
  { quando: "No dia · 10 minutos antes", txt: `Já tô aqui te esperando 💛 [LINK]` },
  { quando: "Logo depois do workshop", txt: `Que tarde! 💛 Obrigada a cada pessoa que esteve comigo.

[PRINT/FOTO DOS COMENTÁRIOS: "quanto valeu", "maior insight"]

Como eu prometi, abri as vagas da mentoria presencial Massoterapeuta de Sucesso, com condição especial e bônus pras primeiras, só até {prazo}.

Todos os detalhes aqui 👇
{link}` },
  { quando: "Dia seguinte", txt: `Bom dia! 💛 Uma coisa que eu falei ontem e quero que fique com vocês:

Você não é o remédio de emergência de ninguém. Você é o caminho de cura.

Pra quem já garantiu a vaga na mentoria: boas-vindas! 🎉 Se você ainda tá pensando, me chama no privado que eu te ajudo a decidir.
{link}` },
  { quando: "2 dias depois", txt: `"Depois que fizer uma vez não vai querer mais ir em outra pessoa." (Nathalia, minha cliente)

É isso que acontece quando o cliente se sente escutado de verdade. E é isso que eu vou te ensinar a provocar, encontro por encontro, na mentoria.

Tem dúvida? Hoje às [HORÁRIO] eu fico aqui no grupo respondendo todas 💛
{link}` },
  { quando: "Penúltimo dia", txt: `Faltam 2 dias pra encerrar a condição especial da mentoria (e os bônus de quem entra primeiro acabam antes) ⏳

Se você sente que é a sua hora, não deixa pra depois.
{link}` },
  { quando: "Último dia · manhã", txt: `🚨 Último dia!

Hoje às 23h59 encerra a condição especial da Massoterapeuta de Sucesso.

Se você quer:
💛 clientes que voltam sem estar com dor
💛 indicação sem precisar pedir
💛 renda previsível sem mais horas na maca

é agora 👇
{link}` },
  { quando: "Último dia · 18h", txt: `Faltam poucas horas ⏳ A mentoria tem garantia: se aplicar e não sentir diferença em 30 dias, eu te acompanho sem custo até sentir. Você não tem nada a perder.
{link}` },
  { quando: "Último dia · 1 hora antes", txt: `🚨 Falta 1 hora! Depois disso a condição especial encerra.
{link}` },
  { quando: "Depois que encerrar", txt: `As inscrições com a condição especial encerraram 💛

Obrigada a cada pessoa que esteve comigo nessa jornada. Pra quem entrou na turma: boas-vindas, a gente se vê no primeiro encontro! 🎉` },
];
