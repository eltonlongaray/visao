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
  P(18, 'O dinheiro que chega pra mim é limpo e abençoado. Posso ganhar mais dinheiro dormindo do que posso gastar acordado. Sou feliz e grato agora porque o dinheiro vem para mim em grandes quantias e de forma contínua, através de múltiplas fontes de renda. O dinheiro é uma energia de fonte infinita e posso acessá-lo com sabedoria, para benefício próprio, de todos ao meu redor e além.'),
  A(1, 'Eu sou impecável com a minha palavra.', 'Eu não uso minhas palavras contra mim. Não me diminuo, não me saboto. Também não calunio ninguém. Falo com integridade. Penso no que vou dizer e reflito se devo falar e como devo falar. Uso o poder da minha palavra só pra criar verdade e amor.'),
  A(2, 'Eu não levo nada para o lado pessoal.', 'Nada do que os outros fazem é por minha causa. O que eles fazem ou dizem é projeção da realidade deles, do sonho deles. Sou imune às opiniões e atitudes dos outros. Me recuso a ser vítima. Me liberto de sofrimentos desnecessários.'),
  A(3, 'Eu não fico presumindo coisas.', 'Tenho coragem de fazer perguntas e de expressar claramente o que eu realmente quero. Sou o mais claro possível pra evitar mal-entendido, tristeza e drama.'),
  A(4, 'Eu sempre dou o meu melhor.', 'Diante de qualquer circunstância, dou o meu melhor. Nem mais, nem menos. Com isso, evito autojulgamento, autopunição e arrependimento. Busco fazer as coisas com excelência, sabendo que o melhor que eu puder fazer hoje é suficiente.'),
  PE('Substituo "não consigo" por "estou aprendendo".'),
  PE('Por onde eu ando os caminhos se abrem e tudo flui. Tudo está a meu favor.'),
  PE('A sorte é um dom que me permeia.'),
  PE('Minha vida já reflete a abundância que sou.'),
  PE('Tudo o que parece negativo no início se transforma em algo positivo no final. No fim, o bem sempre vence o mal.'),
  PE('Eu perdoo a quem me magoou e peço perdão a quem eu magoei. Gratidão ❤️'),
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

const carregarImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

function quebrar(ctx, texto, largura) {
  const linhas = [];
  for (const par of String(texto).split('\n')) {
    let linha = '';
    for (const p of par.split(/\s+/)) {
      const teste = linha ? `${linha} ${p}` : p;
      if (ctx.measureText(teste).width > largura && linha) { linhas.push(linha); linha = p; }
      else linha = teste;
    }
    if (linha) linhas.push(linha);
  }
  return linhas;
}

function cantos(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function desenharCartao(cartao) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // Fundo: roxo escuro do Falcon com brilho no meio
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d0618'); g.addColorStop(0.5, '#2a1052'); g.addColorStop(1, '#0d0618');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const brilho = ctx.createRadialGradient(W / 2, H * 0.48, 40, W / 2, H * 0.48, 760);
  brilho.addColorStop(0, 'rgba(124,58,237,0.45)'); brilho.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = brilho; ctx.fillRect(0, 0, W, H);
  // Moldura dourada
  ctx.strokeStyle = OURO; ctx.lineWidth = 6;
  cantos(ctx, 48, 48, W - 96, H - 96, 44); ctx.stroke();
  ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
  cantos(ctx, 68, 68, W - 136, H - 136, 32); ctx.stroke();
  ctx.globalAlpha = 1;
  // Falcão no topo
  const logo = await carregarImg('icons/falcon-badge.png');
  if (logo) ctx.drawImage(logo, W / 2 - 120, 150, 240, 240);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // Rótulo ("PRINCÍPIO 7")
  ctx.fillStyle = OURO; ctx.font = `700 46px ${FONTE}`;
  ctx.fillText(cartao.rotulo.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, 480);
  ctx.fillRect(W / 2 - 60, 512, 120, 4);
  // Texto: o maior tamanho que cabe na área do meio
  const topo = 590, base = 1540, larg = W - 220;
  let tam = 66, linhasT = [], linhas = [], alt = 0;
  for (; tam >= 30; tam -= 2) {
    ctx.font = `700 ${Math.round(tam * 1.08)}px ${FONTE}`;
    linhasT = cartao.titulo ? quebrar(ctx, cartao.titulo, larg) : [];
    ctx.font = `400 ${tam}px ${FONTE}`;
    linhas = quebrar(ctx, cartao.texto, larg);
    alt = linhasT.length * tam * 1.45 + (linhasT.length ? tam * 0.7 : 0) + linhas.length * tam * 1.42;
    if (alt <= base - topo) break;
  }
  let y = topo + (base - topo - alt) / 2 + tam;
  ctx.fillStyle = OURO; ctx.font = `700 ${Math.round(tam * 1.08)}px ${FONTE}`;
  for (const l of linhasT) { ctx.fillText(l, W / 2, y); y += tam * 1.45; }
  if (linhasT.length) y += tam * 0.7;
  ctx.fillStyle = '#ffffff'; ctx.font = `400 ${tam}px ${FONTE}`;
  for (const l of linhas) { ctx.fillText(l, W / 2, y); y += tam * 1.42; }
  // Rodapé com a marca
  ctx.fillStyle = OURO; ctx.font = `800 58px ${FONTE}`;
  ctx.fillText('ESTILO FALCON'.split('').join(String.fromCharCode(8202)), W / 2, 1700);
  ctx.fillStyle = LILAS; ctx.font = `400 34px ${FONTE}`;
  ctx.fillText('estilo-falcon.web.app', W / 2, 1758);
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
