// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ABAS + CONSTANTES
// BLOCO 2 — RENDER — cinturão de 3 janelas
// BLOCO 3 — MOLDURA — SVG do couro com as janelas vazadas
// BLOCO 4 — LENTE — escala contínua por proximidade do centro
// BLOCO 5 — ROLAGEM INFINITA — teleporte por ciclos, som, navegação
// BLOCO 6 — AUTO-WIRE — liga sozinho a cada render de tela
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + ABAS + CONSTANTES
// ═══════════════════════════════════════════════════════════════
// Cinturão de campeão com TRÊS JANELAS vazadas no couro: a do meio (grande)
// mostra a aba atual, as laterais mostram a anterior e a próxima. As abas
// rolam POR TRÁS do couro e só aparecem quando entram numa janela.
//
// A moldura é SVG gerado em runtime, não a imagem original: as janelas
// precisam ser furos de verdade (fill-rule evenodd) pra aba aparecer
// através delas, e a largura tem que acompanhar a tela do aparelho.
import { t } from '../idioma.js';
import { playClick } from '../sons.js';

const TABS = [
  { id: 'home',       route: '#/home',       ic: '🏠', lbl: () => t('nav.home') },
  { id: 'ritual',     route: '#/ritual',     ic: '🔮', lbl: () => t('nav.ritual') },
  { id: 'desempenho', route: '#/desempenho', ic: '📊', lbl: () => t('nav.desempenho') },
  { id: 'desafios',   route: '#/desafios',   ic: '🏆', lbl: () => t('nav.desafios') },
  { id: 'ajustes',    route: '#/ajustes',    ic: '⚙️', lbl: () => t('nav.ajustes') },
];

const ALTURA  = 96;                  // altura da nav (precisa bater com o CSS)
const CICLO   = TABS.length;
const REPEATS = 21;
const CENTRO  = 10;
const ESPERAS = [0, 0, 0, 32, 120, 400];

// Distância entre janelas = largura de um item. Proporcional à tela pra as
// três janelas caberem em qualquer aparelho.
function larguraItem(larguraNav) {
  return Math.max(96, Math.min(150, Math.round(larguraNav * 0.305)));
}

let _seqGrad = 0;   // ids de gradiente únicos por moldura

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
export function bottomNav(active) {
  ensureWiring();
  const idxAtivo = Math.max(0, TABS.findIndex(x => x.id === active));

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
      <div class="belt-frame" aria-hidden="true"></div>
    </nav>
  `;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: MOLDURA
// ═══════════════════════════════════════════════════════════════
// Um path só, com fill-rule evenodd: o contorno externo é o couro e as três
// janelas são subpaths que viram FUROS. O mesmo path é contornado em dourado,
// então a borda sai de graça na silhueta E em volta de cada janela.
function svgMoldura(W, H, iw) {
  const cx = W / 2;
  const id = `beltCouro${++_seqGrad}`;

  // Janela central — octógono: topo reto, cantos chanfrados, base em ponta.
  const cw = iw * 0.86, ch2 = cw / 2, k = 13;
  const cTop = 14, cBot = 94;
  const central = [
    `M ${cx - ch2 + k} ${cTop}`,
    `L ${cx + ch2 - k} ${cTop}`,
    `L ${cx + ch2} ${cTop + k}`,
    `L ${cx + ch2} ${cBot - k * 1.7}`,
    `L ${cx} ${cBot}`,
    `L ${cx - ch2} ${cBot - k * 1.7}`,
    `L ${cx - ch2} ${cTop + k}`,
    'Z',
  ].join(' ');

  // Janelas laterais — trapézios levemente inclinados, lado de fora mais baixo.
  const sw = iw * 0.60, sh2 = sw / 2, sTop = 32, sBot = 76, incl = 5;
  const lateral = (sx, espelha) => {
    const dOut = espelha ? 0 : incl, dIn = espelha ? incl : 0;
    return [
      `M ${sx - sh2} ${sTop + dOut}`,
      `L ${sx + sh2} ${sTop + dIn}`,
      `L ${sx + sh2} ${sBot - dIn}`,
      `L ${sx - sh2} ${sBot - dOut}`,
      'Z',
    ].join(' ');
  };

  // Silhueta do couro: fina nas pontas, subindo em dois degraus até o centro.
  const p = (f) => cx + iw * f;
  const externo = [
    `M 0 40`,
    `L ${p(-1.72)} 40`, `Q ${p(-1.56)} 40 ${p(-1.48)} 26`,
    `L ${p(-0.74)} 26`, `Q ${p(-0.66)} 26 ${p(-0.60)} 6`,
    `L ${p(0.60)} 6`,   `Q ${p(0.66)} 6 ${p(0.74)} 26`,
    `L ${p(1.48)} 26`,  `Q ${p(1.56)} 26 ${p(1.72)} 40`,
    `L ${W} 40`, `L ${W} ${H}`, `L 0 ${H}`, 'Z',
  ].join(' ');

  const d = `${externo} ${lateral(cx - iw, false)} ${central} ${lateral(cx + iw, true)}`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d2b1a"/>
      <stop offset="52%" stop-color="#2a1d11"/>
      <stop offset="100%" stop-color="#150e08"/>
    </linearGradient>
  </defs>
  <path d="${d}" fill="url(#${id})" fill-rule="evenodd"
        stroke="rgba(226,190,90,0.65)" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: LENTE
// ═══════════════════════════════════════════════════════════════
// A aba no centro fica grande (cabe na janela central) e as vizinhas menores
// (cabem nas laterais). A variação é contínua pra aba crescer enquanto entra.
function fazerLente(track, items, iw) {
  let janela = [];
  return () => {
    const pos = track.scrollLeft / iw;
    const c   = Math.round(pos);
    const nova = [];
    for (let i = Math.max(0, c - 2); i <= Math.min(items.length - 1, c + 2); i++) nova.push(i);

    for (const i of janela) {
      if (nova.indexOf(i) === -1) { items[i].style.transform = ''; items[i].style.opacity = ''; }
    }
    for (const i of nova) {
      const d = Math.abs(i - pos);
      const k = Math.max(0, 1 - d);                 // 1 na janela central, 0 na lateral
      items[i].style.transform = `scale(${(0.68 + 0.47 * k).toFixed(3)})`;
      items[i].style.opacity   = (0.62 + 0.38 * k).toFixed(3);
    }
    janela = nova;
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: ROLAGEM INFINITA
// ═══════════════════════════════════════════════════════════════
function wireBelt(track) {
  track.dataset.ready = '1';
  const nav   = track.closest('.bottom-nav');
  const items = [...track.querySelectorAll('.belt-item')];
  if (!items.length || !nav) return;

  const idxAtivo = parseInt(nav.dataset.idx || '0', 10) || 0;
  let travado = true, teleportando = false;
  let atual = CENTRO * CICLO + idxAtivo;
  let iw = 0, pintarLente = () => {};

  // A moldura só pode ser desenhada quando a largura real é conhecida, e a
  // largura do item vem dela — as janelas têm que cair exatamente onde as
  // abas param.
  const montar = () => {
    const W = Math.round(nav.getBoundingClientRect().width);
    if (!W) return false;
    iw = larguraItem(W);
    track.style.setProperty('--belt-item-w', iw + 'px');
    const frame = nav.querySelector('.belt-frame');
    if (frame) frame.innerHTML = svgMoldura(W, ALTURA, iw);
    pintarLente = fazerLente(track, items, iw);
    return true;
  };

  const talvezTeleportar = () => {
    if (teleportando || !iw) return;
    const cicloPx = CICLO * iw;
    const sl = track.scrollLeft;
    if (sl >= 3 * cicloPx && sl < (REPEATS - 3) * cicloPx) return;
    teleportando = true;
    const dentro = ((sl % cicloPx) + cicloPx) % cicloPx;
    const novo = CENTRO * cicloPx + dentro;
    track.scrollLeft = novo;
    atual = Math.round(novo / iw);
    setTimeout(() => { teleportando = false; }, 0);
  };

  const revelar = () => { pintarLente(); track.dataset.pos = '1'; travado = false; };

  const tentar = (i) => {
    // Condição é "a fita já é rolável", não "o scroll bateu": reler scrollLeft
    // no mesmo tick devolve o valor ANTIGO, e a checagem nunca passava.
    if (track.clientWidth > 0 && montar() && track.scrollWidth > track.clientWidth) {
      const alvo = atual * iw;
      track.scrollLeft = alvo;
      revelar();
      setTimeout(() => {
        if (Math.abs(track.scrollLeft - alvo) > 2) { track.scrollLeft = alvo; pintarLente(); }
      }, 0);
      return;
    }
    if (i < ESPERAS.length) setTimeout(() => tentar(i + 1), ESPERAS[i]);
    else { montar(); revelar(); }
  };
  tentar(0);

  let parada;
  track.addEventListener('scroll', () => {
    if (teleportando || !iw) return;
    pintarLente();
    const i = Math.round(track.scrollLeft / iw);
    if (i !== atual) {
      atual = i;
      if (!travado) playClick();
    }
    clearTimeout(parada);
    parada = setTimeout(() => {
      talvezTeleportar();
      if (travado) return;
      const destino = TABS[((atual % CICLO) + CICLO) % CICLO].route;
      if (destino && location.hash !== destino) location.hash = destino;
    }, 220);
  }, { passive: true });

  // Girar o aparelho muda a largura — moldura e janelas têm que refazer.
  let redim;
  window.addEventListener('resize', () => {
    clearTimeout(redim);
    redim = setTimeout(() => {
      if (!document.contains(track)) return;
      if (montar()) { track.scrollLeft = atual * iw; pintarLente(); }
    }, 150);
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: AUTO-WIRE
// ═══════════════════════════════════════════════════════════════
// As telas montam o nav via string HTML, então não há hook de "montou".
// Um observer único liga qualquer cinturão novo que apareça no DOM —
// evita ter que alterar as 5+ telas que chamam bottomNav().
let observando = false;

function varrer() {
  document.querySelectorAll('.belt-track:not([data-ready])').forEach(wireBelt);
}
// Sem guard de "ja agendado": ele podia engolir a varredura de um render que
// chegasse junto de outro, e o cinturao ficava sem ligar.
function agendarVarredura() { setTimeout(varrer, 0); }

function ensureWiring() {
  if (typeof document === 'undefined') return;

  // Caminho rápido: a tela insere o HTML de forma SÍNCRONA logo depois de
  // chamar bottomNav(), então um macrotask já acha o elemento no DOM.
  agendarVarredura();
  setTimeout(varrer, 0);

  // MutationObserver como rede de segurança — ele é rápido (~1ms).
  if (observando) return;
  observando = true;
  const iniciar = () => {
    new MutationObserver(agendarVarredura).observe(document.body, { childList: true, subtree: true });
    varrer();
  };
  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar, { once: true });
}
