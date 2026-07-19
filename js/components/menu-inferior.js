// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ABAS + CONSTANTES
// BLOCO 2 — CINTURÃO PERMANENTE — vive no body, sobrevive à troca de tela
// BLOCO 3 — LENTE — magnificação contínua por proximidade do centro
// BLOCO 4 — ROLAGEM INFINITA — teleporte por ciclos, som, navegação
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + ABAS + CONSTANTES
// ═══════════════════════════════════════════════════════════════
// Bottom nav em formato de cinturão de campeão. A lente dourada do centro
// é FIXA — as abas é que passam por baixo dela e vão sendo magnificadas.
// A fita repete as abas em ciclos e teleporta perto das bordas, então a
// rolagem nunca esbarra num limite (mesma técnica do seletor-horario.js).
import { t } from '../idioma.js';
import { playClick } from '../sons.js';

const TABS = [
  { id: 'home',       route: '#/home',       ic: '🏠', lbl: () => t('nav.home') },
  { id: 'ritual',     route: '#/ritual',     ic: '🔮', lbl: () => t('nav.ritual') },
  { id: 'desempenho', route: '#/desempenho', ic: '📊', lbl: () => t('nav.desempenho') },
  { id: 'desafios',   route: '#/desafios',   ic: '🏆', lbl: () => t('nav.desafios') },
  { id: 'ajustes',    route: '#/ajustes',    ic: '⚙️', lbl: () => t('nav.ajustes') },
];

const ITEM_W  = 88;                  // precisa bater com o CSS (.belt-item flex-basis)
// 88: afasta o suficiente pra "Desempenho" da aba vizinha nao encostar na
// placa. As abas das pontas passam da tela, mas a mascara das bordas as
// dissolve no couro em vez de deixar corte seco.
const CICLO   = TABS.length;         // abas por volta
const REPEATS = 21;                  // voltas renderizadas (cada render do app cria essas ancoras)
const CENTRO  = 10;                  // volta central (meio das 21)
// Degraus iniciais em 0ms de proposito: alguns webviews clampam qualquer
// setTimeout nao-zero para ~1s, e a escada virava 1s de aba sumida.
const ESPERAS = [0, 0, 0, 32, 120, 400];

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CINTURÃO PERMANENTE
// ═══════════════════════════════════════════════════════════════
// O cinturão NÃO faz mais parte do HTML das telas: ele mora direto no body e
// sobrevive à troca de tela. Antes ele era recriado a cada render, então
// sumia junto com a tela durante o carregamento — e ainda custava 315 nós de
// DOM por navegação.
//
// A assinatura continua a mesma e devolve string vazia, então nenhuma tela
// precisou ser alterada: `${bottomNav('home')}` simplesmente não injeta nada.
let cinturao = null;   // o <nav> permanente
let controle = null;   // API devolvida pelo wireBelt

export function bottomNav(active) {
  if (typeof document === 'undefined') return '';
  const idxAtivo = Math.max(0, TABS.findIndex(x => x.id === active));

  if (!cinturao || !document.contains(cinturao)) {
    const molde = document.createElement('div');
    molde.innerHTML = markupCinturao(active, idxAtivo);
    cinturao = molde.firstElementChild;
    (document.body || document.documentElement).appendChild(cinturao);
    controle = wireBelt(cinturao.querySelector('.belt-track'));
  }

  cinturao.dataset.active = active;
  atualizarRotulos();
  controle?.irPara(idxAtivo);      // rola até a aba nova, animado
  mostrarConformeRota();
  return '';
}

// O dicionário de idioma carrega de forma ASSÍNCRONA e, até chegar, t()
// devolve a própria chave ("nav.home"). Enquanto o cinturão era refeito a
// cada tela isso se resolvia sozinho; sendo criado uma vez só, ele ficava
// preso no texto errado. Aqui os nomes são reaplicados a cada render de tela,
// então assim que a tradução chega o cinturão se corrige.
function atualizarRotulos() {
  if (!cinturao) return;
  const nomes = {};
  for (const tab of TABS) nomes[tab.id] = tab.lbl();
  for (const el of cinturao.querySelectorAll('.belt-item')) {
    const novo = nomes[el.dataset.tab];
    const lb = el.querySelector('.belt-lbl');
    if (novo && lb.textContent !== novo) lb.textContent = novo;
  }
}

// Como o cinturão agora é permanente, ele ficaria visível em telas que NÃO o
// pedem (login, cadastro, termos). Some fora das rotas de aba.
function mostrarConformeRota() {
  if (!cinturao) return;
  const rota = '#' + (location.hash || '#/login').slice(1).split('?')[0];
  cinturao.style.display = TABS.some(t => t.route === rota) ? '' : 'none';
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', mostrarConformeRota);

function markupCinturao(active, idxAtivo) {
  let itens = '';
  for (let volta = 0; volta < REPEATS; volta++) {
    for (const tab of TABS) {
      itens += `<a href="${tab.route}" class="belt-item" data-tab="${tab.id}">` +
               `<span class="belt-ic">${tab.ic}</span>` +
               `<span class="belt-lbl">${tab.lbl()}</span></a>`;
    }
  }
  return `
    <nav class="bottom-nav belt" data-active="${active}" data-idx="${idxAtivo}">
      <div class="belt-strap">
        <div class="belt-track">${itens}</div>
      </div>
      <div class="belt-bump" aria-hidden="true"></div>
      <div class="belt-lens" aria-hidden="true"></div>
      <div class="belt-lens-frame" aria-hidden="true"></div>
    </nav>
  `;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: LENTE
// ═══════════════════════════════════════════════════════════════
// A escala varia de forma contínua com a distância até o centro — é isso
// que dá a sensação de lente de aumento em vez de "item selecionado".
// Só mexe na janela ao redor do centro: são centenas de itens no DOM.
function fazerLente(track, items) {
  let janela = [];
  return () => {
    const pos = track.scrollLeft / ITEM_W;          // índice fracionário sob a lente
    const c   = Math.round(pos);
    const nova = [];
    for (let i = Math.max(0, c - 3); i <= Math.min(items.length - 1, c + 3); i++) nova.push(i);

    for (const i of janela) {
      if (nova.indexOf(i) === -1) {
        items[i].style.transform = ''; items[i].style.opacity = ''; items[i].style.filter = '';
        items[i].querySelector('.belt-lbl').style.opacity = '';
      }
    }
    for (const i of nova) {
      const d = Math.abs(i - pos);
      // Queda em 1 item exato (era 1.6): com a curva mais larga a aba VIZINHA
      // ainda vinha ampliada (0.945) e encostava na costura do couro. Agora
      // ela repousa no tamanho pequeno e só cresce ao entrar sob a placa.
      const k = Math.max(0, 1 - d);
      // A caixa do trilho tem centro em 52,5. O meio do couro visivel (linha
      // em 26 ate a base 84) e 55, e o meio da placa e 43,5. A aba desce
      // 2,5px quando esta no couro e sobe pros 43,5 ao entrar na placa.
      const dy = (2.5 - 11.5 * k).toFixed(1);
      // As abas distantes sao PUXADAS 28px pra dentro. Diminuir o vao de
      // verdade nao dava: ele precisa ser grande pro "Desempenho" da vizinha
      // nao encostar na placa. Como o transform nao mexe no layout, a rolagem
      // continua com o vao uniforme que o encaixe e o teleporte precisam —
      // so a aparencia se comprime nas pontas. 28px e o que faz caber o NOME
      // inteiro das distantes dentro da tela, nao so o icone.
      const dx = (-Math.sign(i - pos) * 28 * Math.min(1, Math.max(0, d - 1))).toFixed(1);
      items[i].style.transform = `translate(${dx}px, ${dy}px) scale(${(0.78 + 0.42 * k).toFixed(3)})`;
      items[i].querySelector('.belt-lbl').style.opacity = '';   // nome em todas as abas
      items[i].style.opacity   = (0.75 + 0.25 * k).toFixed(3);      // vizinhas bem mais legiveis
      items[i].style.filter    = `grayscale(${((1 - k) * 0.20).toFixed(2)}) brightness(${(0.93 + 0.07 * k).toFixed(2)})`;
    }
    janela = nova;
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ROLAGEM INFINITA
// ═══════════════════════════════════════════════════════════════
function wireBelt(track) {
  track.dataset.ready = '1';
  const nav   = track.closest('.bottom-nav');
  const items = [...track.querySelectorAll('.belt-item')];
  if (!items.length) return;

  const idxAtivo = parseInt(nav?.dataset.idx || '0', 10) || 0;
  const cicloPx  = CICLO * ITEM_W;
  const MIN_SEG  = 3 * cicloPx;                    // janela segura antes do teleporte
  const MAX_SEG  = (REPEATS - 3) * cicloPx;

  // Com padding lateral de (metade da fita − metade do item), centralizar o
  // item i vira exatamente scrollLeft = i * ITEM_W.
  const posDe = (i) => i * ITEM_W;

  let travado    = true;      // posicionamento inicial não soa nem navega
  // O tambor só pode soar quando o usuário rola. As rolagens que o próprio
  // app dispara — abrir o app, trocar de rota, sincronizar a aba ativa —
  // usam o mesmo listener, e sem isso o som saía sozinho ao abrir na Home.
  // Marca de tempo em vez de flag booleana: se por algum motivo a rolagem
  // não acontecer, ele destrava sozinho em vez de ficar mudo pra sempre.
  let mudoAte = 0;
  const calar = () => { mudoAte = Date.now() + 700; };   // animação 420 + settle 220
  let teleportando = false;
  let atual      = CENTRO * CICLO + idxAtivo;

  const pintarLente = fazerLente(track, items);

  const talvezTeleportar = () => {
    if (teleportando) return;
    const sl = track.scrollLeft;
    if (sl >= MIN_SEG && sl < MAX_SEG) return;
    teleportando = true;
    const dentroDoCiclo = ((sl % cicloPx) + cicloPx) % cicloPx;
    const novo = CENTRO * cicloPx + dentroDoCiclo;
    track.scrollLeft = novo;
    atual = Math.round(novo / ITEM_W);              // salto invisível não é clique
    setTimeout(() => { teleportando = false; }, 0);
  };

  // Posiciona no ativo antes de soltar os listeners. Precisa insistir porque
  // no primeiro instante o track ainda não tem largura e o scroll vira no-op
  // silencioso. Escada de timers e não requestAnimationFrame: rAF é suspenso
  // quando a aba não está pintando, e aí o cinturão nunca destravava.
  const revelar = () => { pintarLente(); track.dataset.pos = '1'; travado = false; };

  const tentar = (i) => {
    // A condição é "a fita já é rolável", não "o scroll bateu". Conferir por
    // leitura no mesmo tick é furado: scrollLeft costuma devolver o valor
    // ANTIGO até o layout seguinte, então a checagem nunca passava e a escada
    // ia até o fim — ~1s de aba sumida a cada troca de tela.
    if (track.clientWidth > 0 && track.scrollWidth > track.clientWidth) {
      const alvo = posDe(atual);
      calar();
      track.scrollLeft = alvo;
      revelar();
      // Rede de segurança: confere no tick seguinte e corrige se não pegou.
      setTimeout(() => {
        if (Math.abs(track.scrollLeft - alvo) > 2) { track.scrollLeft = alvo; pintarLente(); }
      }, 0);
      return;
    }
    if (i < ESPERAS.length) setTimeout(() => tentar(i + 1), ESPERAS[i]);
    else revelar();   // desiste da centralização, mas nunca deixa a fita sumida
  };
  tentar(0);

  // Conduz a fita até `alvo` com desaceleração no fim. Não uso
  // scrollTo({behavior:'smooth'}) porque há engines em que ele simplesmente
  // não anima — e aí o cinturão saltava em vez de rolar.
  const rolarAte = (alvo) => {
    const inicio = track.scrollLeft;
    if (Math.abs(alvo - inicio) < 2) return;
    const t0 = (performance.now ? performance.now() : Date.now());
    const DUR = 420;
    let rodou = false;
    const passo = (agora) => {
      rodou = true;
      const t = Math.min(1, ((agora || Date.now()) - t0) / DUR);
      track.scrollLeft = inicio + (alvo - inicio) * (1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    // Rede: se requestAnimationFrame estiver suspenso (webview em segundo
    // plano), põe a fita no lugar em vez de deixá-la parada no meio.
    setTimeout(() => setTimeout(() => { if (!rodou) track.scrollLeft = alvo; }, 0), 0);
  };

  // Leva a aba `idxTab` ao centro rolando. Escolhe a volta mais próxima da
  // posição atual pra fita girar o mínimo possível.
  const irPara = (idxTab) => {
    const voltaMaisPerto = Math.round((track.scrollLeft / ITEM_W - idxTab) / CICLO) * CICLO + idxTab;
    calar();                       // foi o app que mandou rolar, não o usuário
    rolarAte(posDe(voltaMaisPerto));
  };

  // Tocar numa aba não navega na hora: conduz o cinturão até ela e a
  // navegação sai do fim da rolagem (o settle abaixo).
  track.addEventListener('click', (ev) => {
    const alvo = ev.target.closest?.('.belt-item');
    if (!alvo) return;
    const i = items.indexOf(alvo);
    if (i < 0 || Math.abs(track.scrollLeft - posDe(i)) < 2) return;
    ev.preventDefault();
    rolarAte(posDe(i));
  }, true);

  let parada;
  track.addEventListener('scroll', () => {
    if (teleportando) return;
    pintarLente();
    const i = Math.round(track.scrollLeft / ITEM_W);
    if (i !== atual) {
      atual = i;
      if (!travado && Date.now() >= mudoAte) playClick();   // um clique por trava
    }
    clearTimeout(parada);
    parada = setTimeout(() => {
      talvezTeleportar();
      if (travado) return;
      const destino = TABS[((atual % CICLO) + CICLO) % CICLO].route;
      if (destino && location.hash !== destino) location.hash = destino;
    }, 220);
  }, { passive: true });

  return { irPara };
}
