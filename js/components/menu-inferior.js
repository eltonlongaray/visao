// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ABAS + CONSTANTES
// BLOCO 2 — RENDER — cinturão de campeão com lente fixa
// BLOCO 3 — LENTE — magnificação contínua por proximidade do centro
// BLOCO 4 — ROLAGEM INFINITA — teleporte por ciclos, som, navegação
// BLOCO 5 — AUTO-WIRE — liga sozinho a cada render de tela
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

const ITEM_W  = 76;                  // precisa bater com o CSS (.belt-item flex-basis)
// 76 e o maior vao em que as 5 abas cabem INTEIRAS numa tela de 375px:
// com 92 as das pontas passavam da margem e a tela cortava.
const CICLO   = TABS.length;         // abas por volta
const REPEATS = 21;                  // voltas renderizadas (cada render do app cria essas ancoras)
const CENTRO  = 10;                  // volta central (meio das 21)
// Degraus iniciais em 0ms de proposito: alguns webviews clampam qualquer
// setTimeout nao-zero para ~1s, e a escada virava 1s de aba sumida.
const ESPERAS = [0, 0, 0, 32, 120, 400];

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
      <span class="belt-fillet f-esq" aria-hidden="true"></span>
      <span class="belt-fillet f-dir" aria-hidden="true"></span>
      <div class="belt-bump" aria-hidden="true"></div>
      <div class="belt-lens" aria-hidden="true"></div>
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
      if (nova.indexOf(i) === -1) { items[i].style.transform = ''; items[i].style.opacity = ''; items[i].style.filter = ''; }
    }
    for (const i of nova) {
      const d = Math.abs(i - pos);
      // Queda em 1 item exato (era 1.6): com a curva mais larga a aba VIZINHA
      // ainda vinha ampliada (0.945) e encostava na costura do couro. Agora
      // ela repousa no tamanho pequeno e só cresce ao entrar sob a placa.
      const k = Math.max(0, 1 - d);
      items[i].style.transform = `scale(${(0.78 + 0.54 * k).toFixed(3)})`;   // 0.78 -> 1.32
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

  let parada;
  track.addEventListener('scroll', () => {
    if (teleportando) return;
    pintarLente();
    const i = Math.round(track.scrollLeft / ITEM_W);
    if (i !== atual) {
      atual = i;
      if (!travado) playClick();                    // um clique por trava do tambor
    }
    clearTimeout(parada);
    parada = setTimeout(() => {
      talvezTeleportar();
      if (travado) return;
      const destino = TABS[((atual % CICLO) + CICLO) % CICLO].route;
      if (destino && location.hash !== destino) location.hash = destino;
    }, 220);
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: AUTO-WIRE
// ═══════════════════════════════════════════════════════════════
// As telas montam o nav via string HTML, então não há hook de "montou".
// Um observer único liga qualquer cinturão novo que apareça no DOM —
// evita ter que alterar as 5+ telas que chamam bottomNav().
let observando = false;

function varrer() {
  document.querySelectorAll('.belt-track:not([data-ready])').forEach(wireBelt);
}
// Sem guard de "ja agendado": ele podia engolir a varredura de um render que
// chegasse junto de outro, e o cinturao ficava sem ligar. O custo e um
// querySelectorAll por render — barato perto de perder a navegacao.
function agendarVarredura() { setTimeout(varrer, 0); }

function ensureWiring() {
  if (typeof document === 'undefined') return;

  // Caminho rápido: a tela insere o HTML de forma SÍNCRONA logo depois de
  // chamar bottomNav(), então um macrotask já acha o elemento no DOM.
  // É por aqui que o cinturão liga, em ~10ms.
  agendarVarredura();
  setTimeout(varrer, 0);    // 2ª passada, caso a inserção tenha sido adiada

  // MutationObserver como rede de segurança — ele é rápido (~1ms), o que
  // custava caro era a escada de retentativas, não ele.
  if (observando) return;
  observando = true;
  const iniciar = () => {
    new MutationObserver(agendarVarredura).observe(document.body, { childList: true, subtree: true });
    varrer();
  };
  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar, { once: true });
}
