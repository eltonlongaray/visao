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

const ITEM_W  = 92;                  // precisa bater com o CSS (.belt-item flex-basis)
const CICLO   = TABS.length;         // abas por volta
const REPEATS = 31;                  // voltas renderizadas
const CENTRO  = 15;                  // volta central (meio das 31)
const ESPERAS = [0, 16, 32, 64, 120, 240, 400];   // escada de retentativas (ms)

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
      const k = Math.max(0, 1 - d / 1.6);           // 1 sob a lente, 0 fora dela
      items[i].style.transform = `scale(${(0.82 + 0.36 * k).toFixed(3)})`;
      items[i].style.opacity   = (0.5 + 0.5 * k).toFixed(3);
      items[i].style.filter    = `grayscale(${((1 - k) * 0.5).toFixed(2)}) brightness(${(0.82 + 0.18 * k).toFixed(2)})`;
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
  const tentar = (i) => {
    if (track.clientWidth > 0) {
      const alvo = posDe(atual);
      track.scrollLeft = alvo;
      if (Math.abs(track.scrollLeft - alvo) < 2) { pintarLente(); travado = false; return; }
    }
    if (i < ESPERAS.length) setTimeout(() => tentar(i + 1), ESPERAS[i]);
    else { pintarLente(); travado = false; }
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
function ensureWiring() {
  if (observando || typeof document === 'undefined') return;
  observando = true;
  const varrer = () => document.querySelectorAll('.belt-track:not([data-ready])').forEach(wireBelt);
  const iniciar = () => {
    new MutationObserver(varrer).observe(document.body, { childList: true, subtree: true });
    varrer();
  };
  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar, { once: true });
}
