// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ABAS
// BLOCO 2 — RENDER — cinturão de campeão
// BLOCO 3 — ROLAGEM — centro imantado, som de tambor, navegação
// BLOCO 4 — AUTO-WIRE — liga sozinho a cada render de tela
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + ABAS
// ═══════════════════════════════════════════════════════════════
// Bottom nav em formato de cinturão de campeão: rola na horizontal e a
// aba ativa fica no centro, virando a placa dourada.
import { t } from '../idioma.js';
import { playClick } from '../sons.js';

const TABS = [
  { id: 'home',       route: '#/home',       ic: '🏠', lbl: () => t('nav.home') },
  { id: 'ritual',     route: '#/ritual',     ic: '🔮', lbl: () => t('nav.ritual') },
  { id: 'desempenho', route: '#/desempenho', ic: '📊', lbl: () => t('nav.desempenho') },
  { id: 'desafios',   route: '#/desafios',   ic: '🏆', lbl: () => t('nav.desafios') },
  { id: 'ajustes',    route: '#/ajustes',    ic: '⚙️', lbl: () => t('nav.ajustes') },
];

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
export function bottomNav(active) {
  ensureWiring();
  const itens = TABS.map(tab => `
      <a href="${tab.route}" class="belt-item${tab.id === active ? ' is-center' : ''}" data-tab="${tab.id}">
        <span class="belt-ic">${tab.ic}</span><span class="belt-lbl">${tab.lbl()}</span>
      </a>`).join('');

  return `
    <nav class="bottom-nav belt" data-active="${active}">
      <div class="belt-track">
        <span class="belt-pad" aria-hidden="true"></span>${itens}
        <span class="belt-pad" aria-hidden="true"></span>
      </div>
    </nav>
  `;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ROLAGEM
// ═══════════════════════════════════════════════════════════════
const ESPERAS = [0, 16, 32, 64, 120, 240, 400];   // escada de retentativas (ms)

function wireBelt(track) {
  track.dataset.ready = '1';
  const items = [...track.querySelectorAll('.belt-item')];
  if (!items.length) return;

  // `travado` cobre o posicionamento inicial: centralizar a aba ativa não
  // pode disparar som nem navegação.
  let travado = true;
  let atual = Math.max(0, items.findIndex(i => i.classList.contains('is-center')));

  const centroDe = (i) => items[i].offsetLeft + items[i].offsetWidth / 2 - track.clientWidth / 2;

  const maisProximo = () => {
    const centro = track.scrollLeft + track.clientWidth / 2;
    let melhor = 0, dist = Infinity;
    items.forEach((it, i) => {
      const d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - centro);
      if (d < dist) { dist = d; melhor = i; }
    });
    return melhor;
  };

  const pintar = (i) => items.forEach((it, n) => it.classList.toggle('is-center', n === i));

  // Posiciona no ativo antes de soltar os listeners. Precisa insistir porque
  // no primeiro instante o track ainda não tem largura e o scroll vira no-op
  // silencioso — o cinturão nascia com a aba errada no centro.
  // Escada de timers (e não requestAnimationFrame): rAF é suspenso quando a
  // aba não está pintando, e aí o cinturão nunca centralizava nem destravava.
  const tentar = (i) => {
    if (track.clientWidth > 0) {
      const alvo = Math.max(0, centroDe(atual));
      track.scrollLeft = alvo;
      if (Math.abs(track.scrollLeft - alvo) < 2) { travado = false; return; }
    }
    if (i < ESPERAS.length) setTimeout(() => tentar(i + 1), ESPERAS[i]);
    else travado = false;    // desiste da centralização, mas o menu funciona
  };
  tentar(0);

  let parada;
  track.addEventListener('scroll', () => {
    const i = maisProximo();
    if (i !== atual) {
      atual = i;
      pintar(i);
      if (!travado) playClick();      // um clique por trava do tambor
    }
    clearTimeout(parada);
    parada = setTimeout(() => {
      if (travado) return;
      const destino = items[atual].getAttribute('href');
      if (destino && location.hash !== destino) location.hash = destino;
    }, 220);
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: AUTO-WIRE
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
