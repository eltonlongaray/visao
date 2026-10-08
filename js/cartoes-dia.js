// ─── ÍNDICE ──────────────────────────────────────────────────
// Cartão do dia: um princípio/acordo/pensamento do Falcon por dia.
// Sorteio por pessoa SEM repetir até passar por todos; aí embaralha de novo.
// Não precisa guardar nada no banco: a ordem sai do id da pessoa + "volta"
// (cada volta tem uma ordem diferente), então é igual em qualquer aparelho.
// O cartão vira uma imagem 1080×1920 (formato de story) pra compartilhar.
// BLOCO 1 — OS CARTÕES (texto do Élton, igual pra todo mundo)
// BLOCO 2 — CARTÃO DE HOJE
// BLOCO 3 — IMAGEM (canvas)
// BLOCO 3.1 — FUNDOS (cenário desenhado + fotos, sorteio por dia)
// BLOCO 4 — MODAL + COMPARTILHAR
// ─────────────────────────────────────────────────────────────
import { auth } from './autenticacao.js';
import { trapModalBack } from './modal-voltar.js';

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: OS CARTÕES
// ═══════════════════════════════════════════════════════════════
const P = (n, texto) => ({ rotulo: `Princípio ${n}`, texto });
const A = (n, titulo, texto) => ({ rotulo: `Acordo ${n}`, titulo, texto });
const PE = (texto) => ({ rotulo: 'Pensamento', texto });
// Filosofia: rótulo livre, título opcional e "Inspirado em …" no fim. O texto
// é a lição em linguagem de hoje; o que o autor disse de fato vai entre aspas.
const F = (rotulo, titulo, texto, autor) => ({ rotulo, ...(titulo ? { titulo } : {}), texto, ...(autor ? { autor } : {}) });

export const CARTOES = [
  P(1, 'Presente, escuto a pessoa até o final, falo pausadamente, sem pressa, e antes de falar penso e analiso o que vou falar e como vou falar, fazendo mais perguntas do que afirmações. Observo minhas emoções antes de agir e não permito que o estado emocional do outro interfira no meu estado.'),
  P(2, 'Minhas atitudes são de uma pessoa financeiramente próspera e emocionalmente inteligente.'),
  P(3, 'Não esbanjo o dinheiro. Sei o quanto eu posso gastar e se devo gastar em cada ocasião que se apresenta. Tenho meu dinheiro reservado para cada coisa e respeito isso.'),
  P(4, 'Identifico quando uma atitude minha é preguiçosa ou prejudicial a longo prazo e não deixo ela se tornar um hábito, agindo no mesmo instante ao me perguntar: tu vai perder pra isso?'),
  P(5, 'Por onde eu ando, mantenho as coisas organizadas.'),
  P(6, 'Quando converso com alguém, olho diretamente para o eu observador daquela pessoa, que é o mesmo que habita em mim.'),
  P(7, 'Ninguém tem o poder de controlar minhas emoções e minhas ações. Eu sou o único responsável por elas, totalmente independente e autossuficiente.'),
  P(8, 'Quando sinto raiva, rotulo essa emoção, digo para meu corpo que está tudo bem e que logo isso vai passar. Essa é uma oportunidade para ficar em silêncio e me observar.'),
  P(9, 'Deixo o silêncio agir, com pausas nas conversas, para que haja um espaço de reflexão sobre o que estamos falando.'),
  P(10, 'Enquanto observo um pensamento, me pergunto: isso vem da minha nova versão ou é outra pessoa, o antigo eu? Substituo o pensamento pobre pelo pensamento rico, onde tudo é possível, todos os recursos estão à minha disposição e não existem barreiras.'),
  P(11, 'Quando falo mal de alguém, me pergunto: por que estou apontando as falhas do outro em vez de olhar para as minhas? Minha nova versão percebe as falhas do outro como um espelho, no intuito de corrigir a si mesma e não de julgar.'),
  P(12, 'Quando alguém próximo age de maneira errada comigo, eu me pergunto o que leva a pessoa a agir dessa forma, no intuito de entender em vez de brigar. Essa atitude é muito mais eficaz.'),
  P(13, 'Quando eu erro, minha consciência aponta o erro com facilidade para que eu tenha a oportunidade de assumir que errei, e isso é bonito. Evito ao máximo qualquer tipo de mentira. Se minto, assumo o quanto antes que foi mentira e sinto admiração por essas atitudes.'),
  P(14, 'Não faço críticas sobre uma pessoa sem estar na presença dela. Na sua ausência, falo apenas para exaltá-la e apontar suas qualidades, ou fico em silêncio. Se eu não for capaz disso, não sou digno de manter um convívio com essa pessoa. Falar dos outros, bem ou mal, é como falar de mim mesmo.'),
  P(15, 'Quando me pego reclamando, ao final da reclamação adiciono um "ainda bem que..." para encerrar a frase agradecendo. Por exemplo: essa casa tá muito suja, ainda bem que tenho todos os materiais que preciso pra deixar ela bem limpa e cheirosa.'),
  P(16, 'Eu me amo e sou prioridade na minha vida: primeiro eu, depois os outros. Sou fiel aos meus princípios e valores. Isso é inegociável.'),
  P(17, 'Não faço para os outros o que eu não gostaria que fizessem comigo e faço para os outros o que gostaria que fizessem para mim. Faço sem esperar reconhecimento algum: expectativas podem machucar, por isso não espero nada de ninguém.'),
  PE('O dinheiro que chega pra mim é limpo e abençoado. Posso ganhar mais dinheiro dormindo do que posso gastar acordado. Sou feliz e grato agora porque o dinheiro vem para mim em grandes quantias e de forma contínua, através de múltiplas fontes de renda. O dinheiro é uma energia de fonte infinita e posso acessá-lo com sabedoria, para benefício próprio, de todos ao meu redor e além.'),
  A(1, 'Eu sou impecável com a minha palavra.', 'Eu não uso minhas palavras contra mim. Não me diminuo, não me saboto. Também não calunio ninguém. Falo com integridade. Penso no que vou dizer e reflito se devo falar e como devo falar. Uso o poder da minha palavra só pra criar verdade e amor.'),
  A(2, 'Eu não levo nada para o lado pessoal.', 'Nada do que os outros fazem é por minha causa. O que eles fazem ou dizem é projeção da realidade deles, do sonho deles. Sou imune às opiniões e atitudes dos outros. Me recuso a ser vítima. Me liberto de sofrimentos desnecessários.'),
  A(3, 'Eu não fico presumindo coisas.', 'Tenho coragem de fazer perguntas e de expressar claramente o que eu realmente quero. Sou o mais claro possível pra evitar mal-entendido, tristeza e drama.'),
  A(4, 'Eu sempre dou o meu melhor.', 'Diante de qualquer circunstância, dou o meu melhor. Nem mais, nem menos. Com isso, evito autojulgamento, autopunição e arrependimento. Busco fazer as coisas com excelência, sabendo que o melhor que eu puder fazer hoje é suficiente.'),
  PE('Substituo "não consigo" por "estou aprendendo".'),
  PE('Por onde eu ando os caminhos se abrem e tudo flui. Tudo está a meu favor.'),
  PE('A sorte é um dom que me permeia.'),
  PE('Minha vida já reflete a abundância que sou.'),
  PE('Tudo o que parece negativo no início se transforma em algo positivo no final. No fim, o bem sempre vence o mal.'),
  // Repete 3× de propósito (é assim que o Élton usa a frase)
  PE('Eu perdoo a quem me magoou e peço perdão a quem eu magoei.\nEu perdoo a quem me magoou e peço perdão a quem eu magoei.\nEu perdoo a quem me magoou e peço perdão a quem eu magoei.\n\nGratidão ❤️\nGratidão ❤️\nGratidão ❤️'),
  // Valores e princípios estoicos + sabedoria oriental (escritos com o Élton em 07/10)
  F('Princípio 18', 'Sabedoria', 'Antes de agir, paro e penso no que é certo, não no que é mais fácil. Decido pela razão, não pelo impulso do momento. Tudo o que me acontece tem algo pra me ensinar, e eu escolho aprender. “Se não é certo, não faça; se não é verdade, não diga.”', 'Marco Aurélio'),
  F('Princípio 19', 'Coragem', 'Faço o que é certo mesmo com medo. O medo aparece, eu reconheço e sigo em frente assim mesmo, porque quase sempre o que eu temo é menor do que parece. “Sofremos mais na imaginação do que na realidade.” É no desconforto que eu cresço.', 'Sêneca'),
  F('Princípio 20', 'Justiça', 'Trato cada pessoa com respeito e honestidade, seja quem for. Faço a minha parte pelo bem de todos, porque ninguém cresce sozinho e o que eu faço volta pro todo. “O que não é bom para a colmeia não é bom para a abelha.”', 'Marco Aurélio'),
  F('Princípio 21', 'Temperança', 'Tenho domínio sobre os meus desejos, e não o contrário. Como, bebo, gasto e falo na medida certa: nem excesso, nem falta. Cada vez que escolho a medida em vez do impulso, fico mais livre e mais forte.', 'Musônio Rufo'),
  F('Princípio 22', 'Disciplina', 'Faço o que me propus, com vontade ou sem vontade. A motivação vai e vem; a disciplina fica. Cada promessa que eu cumpro comigo mesmo me deixa mais forte. “Nenhum homem é livre se não é senhor de si mesmo.”', 'Epicteto'),
  F('Princípio 23', 'O que depende de mim', 'Separo o que depende de mim do que não depende. Meus pensamentos, minhas escolhas e minhas ações são meus: é ali que ponho toda a minha energia. O resto, como a opinião dos outros, o passado e as situações imprevisíveis, eu aceito com serenidade.', 'Epicteto'),
  F('Princípio 24', 'Amor ao destino', 'Aceito o que acontece como se eu mesmo tivesse escolhido. Não gasto energia brigando com o que já é. Tudo o que me acontece vira matéria-prima pra eu crescer, como o fogo que transforma em chama tudo o que jogam nele.', 'Marco Aurélio'),
  F('Princípio 25', 'Lembra que vais morrer', 'Lembro que o tempo é curto e não volta. Não adio o que importa: o abraço, o projeto, a conversa. Vivo cada dia como se ele fosse completo em si mesmo. “Não é que temos pouco tempo, é que desperdiçamos muito.”', 'Sêneca'),
  F('Princípio 26', 'O obstáculo é o caminho', 'Quando algo fica no meu caminho, eu não paro: uso aquilo pra avançar. Cada problema é um treino e me mostra o próximo passo. “O que impede a ação faz a ação avançar. O que está no caminho se torna o caminho.”', 'Marco Aurélio'),
  F('Princípio 27', 'Preparo a mente', 'Imagino com calma o que pode dar errado, sem medo, só pra estar pronto. Assim nada me pega de surpresa: já pensei no plano B e sei como agir. Quem se prepara sofre menos quando o imprevisto chega.', 'Sêneca'),
  F('Pensamento', '', 'Quando algo me abala, antes de reagir olho pra forma como estou enxergando. O fato é um; o peso que dou a ele sou eu que escolho. Mudo o meu olhar e a situação muda junto. “Não são as coisas que nos perturbam, mas a opinião que temos delas.”', 'Epicteto'),
  F('Pensamento', '', 'Quando alguém me ofende, não devolvo na mesma moeda. Respondo com quem eu sou, não com o que me fizeram. Assim a ofensa fica com quem fez. “A melhor vingança é não ser como quem te fez mal.”', 'Marco Aurélio'),
  F('Pensamento', '', 'Não me assusto com o tamanho do caminho. Grandes mudanças são feitas de pequenos passos repetidos todo dia, e o primeiro eu dou hoje. “Uma jornada de mil léguas começa com um único passo.”', 'Lao Tsé'),
  F('Pensamento', '', 'Sou como a água: flexível, mas constante. Contorno os obstáculos sem perder a minha força. A água não briga com a pedra, mas com o tempo abre caminho nela. Minha persistência faz o mesmo.', 'Lao Tsé'),
  F('Pensamento', '', 'Conhecer e vencer a mim mesmo vale mais do que vencer os outros, por isso olho pra dentro todo dia. “Quem conhece os outros é inteligente; quem conhece a si mesmo é sábio. Quem vence os outros é forte; quem vence a si mesmo é poderoso.”', 'Lao Tsé'),
  F('Pensamento', '', 'Cobro primeiro de mim, depois dos outros. Antes de apontar o que falta no outro, olho o que falta em mim e começo por aí. “O sábio exige de si mesmo; o tolo exige dos outros.”', 'Confúcio'),
  F('Pensamento', '', 'Tudo passa: o bom e o ruim. Aproveito o que é bom sem me agarrar a ele e atravesso o que é ruim sabendo que também vai passar. Nada é permanente, e é isso que me dá paz.', 'Buda'),
  F('Pensamento', '', 'Quando como, só como. Quando ando, só ando. Estou inteiro no que faço agora, sem a cabeça no ontem ou no amanhã. A vida acontece no presente, e é nele que eu escolho estar.', 'ensinamentos zen'),
  F('Pensamento', '', 'Não respondo raiva com raiva. Quem devolve ódio só aumenta o fogo; a calma e a compreensão é que apagam. “O ódio não cessa pelo ódio, mas pelo amor.”', 'Buda'),
  F('Pensamento', '', 'A dor é a primeira flecha; o sofrimento que eu crio pensando nela é a segunda. Recebo a primeira, porque faz parte da vida, mas não atiro a segunda em mim mesmo remoendo o que já passou.', 'Buda'),
  // Mais do Oriente (pedido do Élton em 08/10)
  F('Pensamento', '', 'Faço as coisas com calma e atenção, sem forçar. Quando sigo o jeito natural de cada coisa, o esforço fica leve, como o cozinheiro que corta seguindo as juntas da carne e por isso nunca precisa afiar a faca.', 'Chuang Tzu'),
  F('Pensamento', '', 'Antes de entrar numa batalha, conheço o terreno e conheço a mim mesmo: meus pontos fortes, meus pontos fracos e o que está à minha frente. “Conhece o outro e conhece a ti mesmo, e em cem batalhas não correrás perigo.”', 'Sun Tzu'),
  F('Pensamento', '', 'Não me comparo com os outros: me comparo com quem eu fui ontem. Cada dia é um treino pra ser um pouco melhor do que eu era. “Hoje é a vitória sobre o eu de ontem.”', 'Miyamoto Musashi'),
  F('Pensamento', '', 'Cresço sem perder a curiosidade, a pureza e a alegria simples que eu tinha quando criança. A maturidade não precisa endurecer o coração. “O grande homem é aquele que não perde o seu coração de criança.”', 'Mêncio'),
  F('Pensamento', '', 'Cuido dos meus pensamentos, porque eles viram palavras, as palavras viram atitudes e as atitudes viram a minha vida. “Tudo o que somos é resultado do que pensamos.”', 'Buda'),
  F('Pensamento', '', 'Sei reconhecer quando já tenho o suficiente. Não vivo correndo atrás do próximo e do próximo: agradeço pelo que já está aqui. “Quem sabe que tem o suficiente é rico.”', 'Lao Tsé'),
  F('Pensamento', '', 'Quando a cabeça acelera, volto pra respiração. Uma respiração consciente já me traz de volta pro agora. “Inspirando, acalmo o corpo e a mente. Expirando, sorrio.”', 'Thich Nhat Hanh'),
  F('Pensamento', '', 'Encaro cada coisa como se fosse a primeira vez, aberto pra aprender, mesmo no que eu já sei fazer. “Na mente do principiante há muitas possibilidades; na do especialista, poucas.”', 'Shunryu Suzuki'),
  F('Pensamento', '', 'Dou o meu melhor no que faço e solto o resultado. O esforço é meu; o que vem depois não cabe a mim.', 'Bhagavad Gita'),
];

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CARTÃO DE HOJE
// ═══════════════════════════════════════════════════════════════
// Gerador pseudoaleatório com semente (mesma semente = mesma ordem)
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function embaralhar(n, semente) {
  let s = semente || 1;
  const rnd = () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s >>>= 0; return (s % 1e9) / 1e9; };
  const ordem = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  return ordem;
}
// Ordem da volta: a 1ª carta nunca repete a última da volta anterior
function ordemDaVolta(quem, volta, n) {
  const ordem = embaralhar(n, hash(`${quem}:${volta}`));
  if (volta > 0 && n > 1) {
    const anterior = embaralhar(n, hash(`${quem}:${volta - 1}`));
    if (ordem[0] === anterior[n - 1]) [ordem[0], ordem[1]] = [ordem[1], ordem[0]];
  }
  return ordem;
}

const DIA_ZERO = Date.UTC(2026, 9, 1);   // 01/10/2026
// Índice do cartão de um dia (data local) pra uma pessoa
export function cartaoDoDia(data = new Date(), quem = auth.currentUser?.uid || 'anon') {
  const dias = Math.floor((Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) - DIA_ZERO) / 86400000);
  const n = CARTOES.length;
  const d = ((dias % (n * 100000)) + n * 100000) % (n * 100000);
  const ordem = ordemDaVolta(quem, Math.floor(d / n), n);
  return CARTOES[ordem[d % n]];
}

const chaveHoje = () => { const d = new Date(); return `visao_cartao_visto_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const jaViuHoje = () => { try { return localStorage.getItem(chaveHoje()) === '1'; } catch { return true; } };
const marcarVisto = () => { try { localStorage.setItem(chaveHoje(), '1'); } catch { /* sem storage */ } };

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: IMAGEM (1080×1920, formato de story)
// ═══════════════════════════════════════════════════════════════
const W = 1080, H = 1920;
const OURO = '#f5c518', LILAS = '#c4b5fd';
const FONTE = "'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

// Fonte da marca (Cinzel, licença OFL em fonts/): carrega uma vez antes de desenhar
const MARCA = "'Cinzel Falcon', Georgia, 'Times New Roman', serif";
let _fonte = null;
function carregarFonte() {
  _fonte ||= (async () => {
    try {
      const f = new FontFace('Cinzel Falcon', "url('fonts/cinzel-700.woff2') format('woff2')", { weight: '700' });
      document.fonts.add(await f.load());
    } catch (e) { console.warn('[cartao-dia] fonte:', e); }
  })();
  return _fonte;
}

const carregarImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

// Quebra em linhas sem deixar palavra sozinha numa linha: se sobrar uma,
// tenta de novo com a linha um pouco mais larga ou mais estreita
function quebrarParagrafo(ctx, par, largura) {
  const linhas = [];
  let linha = '';
  for (const p of par.split(/\s+/)) {
    const teste = linha ? `${linha} ${p}` : p;
    if (ctx.measureText(teste).width > largura && linha) { linhas.push(linha); linha = p; }
    else linha = teste;
  }
  if (linha) linhas.push(linha);
  return linhas;
}

export function quebrar(ctx, texto, largura) {
  const linhas = [];
  for (const par of String(texto).split('\n')) {
    if (!par.trim()) { linhas.push(''); continue; }
    let melhor = quebrarParagrafo(ctx, par, largura);
    if (par.trim().split(/\s+/).length > 1) {
      for (let f = 1.04; f >= 0.65 && melhor.some(l => !/\s/.test(l)); f -= 0.02) {
        const tenta = quebrarParagrafo(ctx, par, largura * f);
        if (!tenta.some(l => !/\s/.test(l))) melhor = tenta;
      }
    }
    linhas.push(...melhor);
  }
  return linhas;
}

function cantos(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Gerador de números fixo (o cenário sai igual toda vez)
function sorteador(semente) {
  let x = semente >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Crista de montanha natural (deslocamento do ponto médio)
function crista(rnd, n, rugosidade) {
  const pts = new Array(n + 1).fill(0);
  pts[0] = rnd(); pts[n] = rnd();
  for (let passo = n, amp = 1; passo > 1; passo /= 2, amp *= rugosidade) {
    for (let i = passo / 2; i < n; i += passo) pts[i] = (pts[i - passo / 2] + pts[i + passo / 2]) / 2 + (rnd() - 0.5) * amp;
  }
  return pts;
}

// Cenário do Falcão: céu da noite, lua, estrelas e cordilheira com névoa.
// As montanhas sobem nas laterais pra emoldurar o cartão.
function desenharCenario(ctx) {
  const rnd = sorteador(11);
  const ceu = ctx.createLinearGradient(0, 0, 0, H);
  ceu.addColorStop(0, '#05020c'); ceu.addColorStop(0.35, '#170932'); ceu.addColorStop(0.62, '#4b2386'); ceu.addColorStop(0.8, '#7a3fa8'); ceu.addColorStop(1, '#120722');
  ctx.fillStyle = ceu; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * H * 0.55, r = rnd() * 2.2 + 0.4;
    ctx.globalAlpha = 0.2 + rnd() * 0.75; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Lua dourada no alto, à direita
  const lx = W * 0.82, ly = 190;
  const halo = ctx.createRadialGradient(lx, ly, 40, lx, ly, 300);
  halo.addColorStop(0, 'rgba(245,197,24,0.4)'); halo.addColorStop(1, 'rgba(245,197,24,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, 600);
  ctx.fillStyle = '#ffe28c'; ctx.beginPath(); ctx.arc(lx, ly, 62, 0, Math.PI * 2); ctx.fill();
  // Camadas (de trás pra frente): topo = altura no meio, lado = altura nas pontas
  const camadas = [
    { meio: 0.60, lado: 0.42, var: 260, cor: '#3d1f73', rug: 0.55 },
    { meio: 0.70, lado: 0.50, var: 220, cor: '#2c1457', rug: 0.55 },
    { meio: 0.80, lado: 0.60, var: 180, cor: '#1d0c3c', rug: 0.5 },
    { meio: 0.90, lado: 0.72, var: 140, cor: '#0e0620', rug: 0.5 },
  ];
  const N = 64;
  for (const c of camadas) {
    const cr = crista(rnd, N, c.rug);
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * W, d = Math.abs(i / N * 2 - 1) ** 1.6;
      ctx.lineTo(x, H * (c.meio + (c.lado - c.meio) * d) - (cr[i] - 0.5) * c.var);
    }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = c.cor; ctx.fill();
    // névoa entre as camadas
    const yn = H * c.meio;
    const nv = ctx.createLinearGradient(0, yn - 120, 0, yn + 160);
    nv.addColorStop(0, 'rgba(196,181,253,0)'); nv.addColorStop(0.6, 'rgba(196,181,253,0.10)'); nv.addColorStop(1, 'rgba(196,181,253,0)');
    ctx.fillStyle = nv; ctx.fillRect(0, yn - 120, W, 280);
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3.1: FUNDOS
// ═══════════════════════════════════════════════════════════════
// O cenário desenhado + fotos (escolhidas pelo Élton em 08/10, tons quentes).
// Foto: z = zoom sobre o "cobrir a tela"; fy = ponto da foto (fração da
// altura) que vai parar em alvo (px do story). Serve pra subir a lua/montanha.
export const FUNDOS = [
  { id: 'noite', nome: 'Noite estrelada' },
  { id: 'valle-dia', nome: 'Valle de la Luna', src: 'img/cartao-fundos/valle-dia.jpg', z: 1.3, fy: 0.10, alvo: 0 },
  { id: 'valle-lua-vulcao', nome: 'Lua e vulcão', src: 'img/cartao-fundos/valle-lua-vulcao.jpg', z: 1.2, fy: 0.12, alvo: 95 },
  { id: 'valle-montanhas', nome: 'Montanhas do Atacama', src: 'img/cartao-fundos/valle-montanhas.jpg', z: 1, fy: 0, alvo: 0 },
  { id: 'deserto-lua', nome: 'Lua no deserto', src: 'img/cartao-fundos/deserto-lua.jpg', z: 1.3, fy: 0.14, alvo: 170 },
  { id: 'valle-por-do-sol', nome: 'Pôr do sol no Atacama', src: 'img/cartao-fundos/valle-por-do-sol.jpg', z: 1, fy: 0, alvo: 0 },
  { id: 'stonehenge', nome: 'Stonehenge', src: 'img/cartao-fundos/stonehenge.jpg', z: 1, fy: 0, alvo: 0 },
  { id: 'montanhas-coloridas', nome: 'Montanhas coloridas', src: 'img/cartao-fundos/montanhas-coloridas.jpg', z: 1, fy: 0, alvo: 0 },
];
const CHAVE_FUNDO = 'visao_cartao_fundo';   // vazio = sorteio do dia
const fundoPorId = (id) => FUNDOS.find(f => f.id === id);
// Escolha da pessoa (se fez) ou o sorteio do dia, igual pra ela o dia todo
export function fundoDoDia(data = new Date(), quem = auth.currentUser?.uid || 'anon') {
  try { const f = fundoPorId(localStorage.getItem(CHAVE_FUNDO)); if (f) return f; } catch { /* sem storage */ }
  return FUNDOS[hash(`${quem}:fundo:${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`) % FUNDOS.length];
}
// "Trocar fundo": vai pro próximo e lembra a escolha
export function proximoFundo(atual = fundoDoDia()) {
  const f = FUNDOS[(FUNDOS.indexOf(atual) + 1) % FUNDOS.length];
  try { localStorage.setItem(CHAVE_FUNDO, f.id); } catch { /* sem storage */ }
  return f;
}

async function desenharFundo(ctx, fundo) {
  const img = fundo?.src ? await carregarImg(fundo.src) : null;
  if (!img) { desenharCenario(ctx); return; }   // sem foto (offline/erro): cenário desenhado
  const e = Math.max(W / img.width, H / img.height) * (fundo.z || 1), w = img.width * e, h = img.height * e;
  const y0 = Math.min(0, Math.max(H - h, (fundo.alvo || 0) - (fundo.fy || 0) * h));
  ctx.drawImage(img, (W - w) / 2, y0, w, h);
  // Véu escuro em cima e embaixo: rótulo e marca leem bem em qualquer foto
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(10,5,20,0.55)'); g.addColorStop(0.25, 'rgba(10,5,20,0.15)');
  g.addColorStop(0.7, 'rgba(10,5,20,0.2)'); g.addColorStop(1, 'rgba(10,5,20,0.75)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

export async function desenharCartao(cartao, fundo = fundoDoDia()) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  await desenharFundo(ctx, fundo);
  await carregarFonte();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const sombra = (blur, cor = 'rgba(0,0,0,0.7)') => { ctx.shadowColor = cor; ctx.shadowBlur = blur; };
  // Em cima, fora do cartão: o rótulo ("PRINCÍPIO 7").
  // Tudo dentro de 270..1660: o Instagram cobre o topo e a base do story.
  sombra(18);
  ctx.fillStyle = OURO; ctx.font = `700 64px ${MARCA}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText(cartao.rotulo.toUpperCase(), W / 2, 340);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.shadowBlur = 0;
  // O cartão no meio: vidro escuro com borda dourada
  const cx = 60, cy = 410, cw = W - 120, ch = 1030;
  sombra(60, 'rgba(0,0,0,0.6)');
  cantos(ctx, cx, cy, cw, ch, 40);
  ctx.fillStyle = 'rgba(13,6,24,0.6)'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = OURO; ctx.lineWidth = 4; ctx.stroke();
  ctx.globalAlpha = 0.3; ctx.lineWidth = 2;
  cantos(ctx, cx + 16, cy + 16, cw - 32, ch - 32, 28); ctx.stroke();
  ctx.globalAlpha = 1;
  // Texto: o maior tamanho que cabe dentro do cartão
  // Embaixo, dentro do cartão, fica o selo "Construindo minha nova versão"
  const topo = cy + 70, base = cy + ch - 116, larg = cw - 140, xt = cx + 70;
  const inspirado = cartao.autor ? `Inspirado em ${cartao.autor}` : '';
  // Mesmo tamanho de letra em todos (48 é o maior que cabe no cartão mais longo);
  // só diminui se um cartão novo não couber
  let tam = 48, linhasT = [], linhas = [], alt = 0;
  for (; tam >= 28; tam -= 2) {
    ctx.font = `700 ${Math.round(tam * 1.08)}px ${FONTE}`;
    linhasT = cartao.titulo ? quebrar(ctx, cartao.titulo, larg) : [];
    ctx.font = `400 ${tam}px ${FONTE}`;
    linhas = quebrar(ctx, cartao.texto, larg);
    alt = linhasT.length * tam * 1.45 + (linhasT.length ? tam * 0.7 : 0) + linhas.reduce((a, l) => a + (l ? tam * 1.42 : tam * 0.6), 0) +
      (inspirado ? tam * 1.5 : 0);
    // Só aceita o tamanho se nenhuma linha ficou com uma palavra sozinha
    const sozinha = [...linhas, ...(linhasT.length > 1 ? linhasT : [])].some(l => l && !/\s/.test(l));
    if (alt <= base - topo && (!sozinha || tam <= 34)) break;
  }
  let y = topo + (base - topo - alt) / 2 + tam;
  ctx.textAlign = 'left';
  ctx.fillStyle = OURO; ctx.font = `700 ${Math.round(tam * 1.08)}px ${FONTE}`;
  for (const l of linhasT) { ctx.fillText(l, xt, y); y += tam * 1.45; }
  if (linhasT.length) y += tam * 0.7;
  ctx.fillStyle = '#ffffff'; ctx.font = `400 ${tam}px ${FONTE}`;
  for (const l of linhas) { if (l) ctx.fillText(l, xt, y); y += l ? tam * 1.42 : tam * 0.6; }
  if (inspirado) {
    ctx.fillStyle = OURO; ctx.font = `italic 400 ${Math.round(tam * 0.8)}px ${FONTE}`;
    ctx.fillText(inspirado, xt, y + tam * 0.5);
  }
  ctx.textAlign = 'center';
  // Selo: quem compartilha está construindo, não precisa já ser aquilo
  ctx.globalAlpha = 0.35; ctx.strokeStyle = OURO; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2 - 120, cy + ch - 112); ctx.lineTo(W / 2 + 120, cy + ch - 112); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = LILAS; ctx.font = `italic 400 34px ${FONTE}`;
  ctx.fillText('Construindo minha nova versão', W / 2, cy + ch - 62);
  // Embaixo, fora do cartão: falcão + ESTILO FALCON + endereço do app
  const logo = await carregarImg('icons/falcon-badge.png');
  if (logo) { sombra(20); ctx.drawImage(logo, W / 2 - 60, 1478, 120, 120); ctx.shadowBlur = 0; }
  sombra(24, 'rgba(245,197,24,0.45)');
  ctx.fillStyle = OURO; ctx.font = `700 66px ${MARCA}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
  ctx.fillText('ESTILO FALCON', W / 2, 1650);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  sombra(12);
  ctx.fillStyle = LILAS; ctx.font = `400 32px ${FONTE}`;
  ctx.fillText('estilo-falcon.web.app', W / 2, 1700);
  ctx.shadowBlur = 0;
  return cv;
}

const comoArquivo = (cv) => new Promise((ok) => cv.toBlob(b => ok(new File([b], 'cartao-falcon.png', { type: 'image/png' })), 'image/png'));

// Compartilhar: menu do celular (WhatsApp, Instagram…) ou, sem ele, baixa a imagem
export async function compartilharCartao(cartao = cartaoDoDia(), fundo = fundoDoDia()) {
  const arq = await comoArquivo(await desenharCartao(cartao, fundo));
  if (navigator.canShare?.({ files: [arq] })) {
    try { await navigator.share({ files: [arq], text: 'Meu cartão do dia no Estilo Falcon 🦅 estilo-falcon.web.app' }); return 'compartilhado'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelado'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(arq); a.download = arq.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'baixado';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: MODAL
// ═══════════════════════════════════════════════════════════════
// Abre o cartão de hoje. aoFechar roda quando a pessoa fecha (ex.: o
// convite das mensagens da manhã vem depois).
export async function abrirCartaoDoDia(aoFechar = null) {
  if (document.querySelector('.cartao-dia-ov')) return;
  marcarVisto();
  const cartao = cartaoDoDia();
  let fundo = fundoDoDia();
  const cv = await desenharCartao(cartao, fundo);
  const ov = document.createElement('div');
  ov.className = 'modal-overlay cartao-dia-ov';
  ov.innerHTML = `
    <div class="cartao-dia-box">
      <div class="cartao-dia-moldura"><img class="cartao-dia-img" alt="${cartao.rotulo}: ${String(cartao.titulo ? cartao.titulo + ' ' : '').replace(/"/g, '')}${cartao.texto.replace(/"/g, '')}${cartao.autor ? ' Inspirado em ' + cartao.autor : ''}"></div>
      <div class="cartao-dia-btns">
        <button class="btn-primary" data-share>📤 Compartilhar</button>
        <button class="btn-secondary" data-fechar>Fechar</button>
      </div>
      <button class="cartao-dia-fundo" data-fundo>🖼️ Trocar fundo</button>
    </div>`;
  ov.querySelector('img').src = cv.toDataURL('image/png');
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => { ov.remove(); aoFechar?.(); });
  ov.querySelector('[data-fechar]').onclick = () => fechar();
  ov.querySelector('[data-fundo]').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    fundo = proximoFundo(fundo);
    ov.querySelector('img').src = (await desenharCartao(cartao, fundo)).toDataURL('image/png');
    b.disabled = false; b.textContent = `🖼️ Trocar fundo · ${fundo.nome}`;
  };
  ov.querySelector('[data-share]').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    const r = await compartilharCartao(cartao, fundo).catch(() => 'erro');
    b.disabled = false;
    if (r === 'baixado') b.textContent = '✅ Imagem salva';
  };
}

// Na abertura do app: 1× por dia. Devolve true se abriu.
export async function talvezMostrarCartao(aoFechar = null) {
  if (jaViuHoje() || document.querySelector('.modal-overlay')) return false;
  await abrirCartaoDoDia(aoFechar);
  return true;
}
