// ─── ÍNDICE ──────────────────────────────────────────────────
// Cartão do dia: um princípio/acordo/pensamento do Falcon por dia.
// Sorteio por pessoa SEM repetir até passar por todos; aí embaralha de novo.
// Não precisa guardar nada no banco: a ordem sai do id da pessoa + "volta"
// (cada volta tem uma ordem diferente), então é igual em qualquer aparelho.
// O cartão vira uma imagem 1080×1920 (formato de story) pra compartilhar.
// BLOCO 1 — OS CARTÕES (texto do Élton, igual pra todo mundo)
// BLOCO 2 — CARTÃO DE HOJE
// BLOCO 3 — IMAGEM (canvas)
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
// Filosofia: rótulo livre, título opcional e autor no fim do texto
const F = (rotulo, titulo, texto, autor) => ({ rotulo, ...(titulo ? { titulo } : {}), texto: autor ? `${texto}\n\n— ${autor}` : texto });

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
  F('Princípio 18', 'Sabedoria', 'Antes de agir, penso no que é certo, não no que é fácil. Uso a razão pra decidir, não o impulso, e aprendo com tudo o que me acontece.', 'Marco Aurélio'),
  F('Princípio 19', 'Coragem', 'Faço o que é certo mesmo com medo. Reconheço o medo e sigo em frente, porque é no desconforto que eu cresço.', 'Sêneca'),
  F('Princípio 20', 'Justiça', 'Trato cada pessoa com respeito e honestidade, seja quem for. Faço a minha parte pelo bem de todos, porque somos parte do mesmo todo.', 'Marco Aurélio'),
  F('Princípio 21', 'Temperança', 'Tenho domínio sobre meus desejos. Como, bebo, gasto e falo na medida certa. Nem excesso, nem falta.', 'Musônio Rufo'),
  F('Princípio 22', 'Disciplina', 'Faço o que me propus, com vontade ou sem vontade. A disciplina me leva aonde a motivação não alcança.', 'Epicteto'),
  F('Princípio 23', 'O que depende de mim', 'Separo o que depende de mim do que não depende. Ponho toda a minha energia nos meus pensamentos, escolhas e ações. O resto eu aceito com serenidade.', 'Epicteto'),
  F('Princípio 24', 'Amor ao destino', 'Aceito o que acontece como se eu mesmo tivesse escolhido. Tudo o que me acontece vira matéria-prima pra eu crescer.', 'Marco Aurélio'),
  F('Princípio 25', 'Lembra que vais morrer', 'Lembro que o tempo é curto. Não adio o que importa e vivo cada dia como se ele fosse completo em si mesmo.', 'Sêneca'),
  F('Princípio 26', 'O obstáculo é o caminho', 'O que impede a ação faz a ação avançar. O que está no meu caminho se torna o meu caminho.', 'Marco Aurélio'),
  F('Princípio 27', 'Preparo a mente', 'Imagino com calma o que pode dar errado. Assim nada me pega de surpresa e eu já sei como agir.', 'Sêneca'),
  F('Pensamento', '', 'Não são as coisas que me perturbam, mas o que eu penso sobre elas. Quando algo me abala, mudo primeiro o meu olhar.', 'Epicteto'),
  F('Pensamento', '', 'A melhor vingança é não ser como quem me ofendeu. Respondo com quem eu sou, não com o que me fizeram.', 'Marco Aurélio'),
  F('Pensamento', '', 'Uma jornada de mil léguas começa com um único passo. Não me assusto com o tamanho do caminho: dou o primeiro passo hoje.', 'Lao Tsé'),
  F('Pensamento', '', 'Sou como a água: flexível, mas constante. Contorno os obstáculos sem perder a minha força, e com o tempo a água vence a pedra.', 'Lao Tsé'),
  F('Pensamento', '', 'Quem conhece os outros é inteligente; quem conhece a si mesmo é sábio. Quem vence os outros é forte; quem vence a si mesmo é poderoso.', 'Lao Tsé'),
  F('Pensamento', '', 'Cobro primeiro de mim, depois dos outros. Antes de apontar o que falta no outro, olho o que falta em mim.', 'Confúcio'),
  F('Pensamento', '', 'Tudo passa: o bom e o ruim. Não me apego ao que é bom nem me desespero com o que é ruim.'),
  F('Pensamento', '', 'Quando como, só como. Quando ando, só ando. Estou inteiro no que faço agora.'),
  F('Pensamento', '', 'O ódio não acaba com ódio, acaba com amor. Não respondo raiva com raiva.', 'Buda'),
  F('Pensamento', '', 'A dor é a primeira flecha; o sofrimento que eu crio pensando nela é a segunda. Recebo a primeira e não atiro a segunda em mim mesmo.', 'Buda'),
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

export async function desenharCartao(cartao) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  desenharCenario(ctx);
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
  const topo = cy + 70, base = cy + ch - 70, larg = cw - 140, xt = cx + 70;
  // Mesmo tamanho de letra em todos (48 é o maior que cabe no cartão mais longo);
  // só diminui se um cartão novo não couber
  let tam = 48, linhasT = [], linhas = [], alt = 0;
  for (; tam >= 28; tam -= 2) {
    ctx.font = `700 ${Math.round(tam * 1.08)}px ${FONTE}`;
    linhasT = cartao.titulo ? quebrar(ctx, cartao.titulo, larg) : [];
    ctx.font = `400 ${tam}px ${FONTE}`;
    linhas = quebrar(ctx, cartao.texto, larg);
    alt = linhasT.length * tam * 1.45 + (linhasT.length ? tam * 0.7 : 0) + linhas.reduce((a, l) => a + (l ? tam * 1.42 : tam * 0.6), 0);
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
  ctx.textAlign = 'center';
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
export async function compartilharCartao(cartao = cartaoDoDia()) {
  const arq = await comoArquivo(await desenharCartao(cartao));
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
  const cv = await desenharCartao(cartao);
  const ov = document.createElement('div');
  ov.className = 'modal-overlay cartao-dia-ov';
  ov.innerHTML = `
    <div class="cartao-dia-box">
      <div class="cartao-dia-topo">🃏 Cartão do dia</div>
      <img class="cartao-dia-img" alt="${cartao.rotulo}: ${String(cartao.titulo ? cartao.titulo + ' ' : '').replace(/"/g, '')}${cartao.texto.replace(/"/g, '')}">
      <div class="cartao-dia-btns">
        <button class="btn-primary" data-share>📤 Compartilhar</button>
        <button class="btn-secondary" data-fechar>Fechar</button>
      </div>
    </div>`;
  ov.querySelector('img').src = cv.toDataURL('image/png');
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => { ov.remove(); aoFechar?.(); });
  ov.querySelector('[data-fechar]').onclick = () => fechar();
  ov.querySelector('[data-share]').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    const r = await compartilharCartao(cartao).catch(() => 'erro');
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
