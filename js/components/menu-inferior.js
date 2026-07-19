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

// Números MEDIDOS na img/cinturao.png (600x224, janelas achadas por
// varredura do canal alfa). Se a imagem trocar, remedir estes valores.
const IMG_PROP     = 600 / 224;   // proporção da moldura
const VAO_JANELAS  = 0.28625;     // distância entre janelas, em fração da largura
const JANELA_Y     = 0.478;       // altura do centro das janelas
const ALT_MIN = 96, ALT_MAX = 120;
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
        <span class="belt-screen s-esq" aria-hidden="true"></span>
        <span class="belt-screen s-cen" aria-hidden="true"></span>
        <span class="belt-screen s-dir" aria-hidden="true"></span>
        <div class="belt-track">${itens}</div>
      </div>
      <div class="belt-frame" aria-hidden="true"></div>
    </nav>
  `;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: LENTE
// ═══════════════════════════════════════════════════════════════
// A escala varia de forma contínua com a distância até o centro — é isso
// que dá a sensação de lente de aumento em vez de "item selecionado".
// Só mexe na janela ao redor do centro: são centenas de itens no DOM.
function fazerLente(track, items, iw) {
  let janela = [];
  return () => {
    const pos = track.scrollLeft / iw;
    const c   = Math.round(pos);
    const nova = [];
    for (let i = Math.max(0, c - 2); i <= Math.min(items.length - 1, c + 2); i++) nova.push(i);

    for (const i of janela) {
      if (nova.indexOf(i) === -1) {
        items[i].style.transform = ''; items[i].style.opacity = '';
        items[i].querySelector('.belt-lbl').style.opacity = '';
      }
    }
    for (const i of nova) {
      const d = Math.abs(i - pos);
      const k = Math.max(0, 1 - d);                 // 1 na janela central, 0 na lateral
      items[i].style.transform = `scale(${(0.62 + 0.38 * k).toFixed(3)})`;
      items[i].style.opacity   = (0.7 + 0.3 * k).toFixed(3);
      // Janela lateral é estreita: só o ícone cabe. O nome aparece conforme
      // a aba entra na janela do meio.
      items[i].querySelector('.belt-lbl').style.opacity = Math.max(0, (k - 0.45) / 0.55).toFixed(2);
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

  let travado    = true;      // posicionamento inicial não soa nem navega
  let teleportando = false;
  let atual      = CENTRO * CICLO + idxAtivo;
  let iw = 0;
  let pintarLente = () => {};

  // A moldura é imagem: a nav toma a proporção dela, e o vão entre as abas
  // tem que ser exatamente o vão entre as janelas, senão a aba para torta.
  const dimensionar = () => {
    const W = Math.round(nav.getBoundingClientRect().width);
    if (!W) return false;
    const H = Math.round(Math.max(ALT_MIN, Math.min(ALT_MAX, W / IMG_PROP)));
    iw = Math.round(W * VAO_JANELAS);
    nav.style.height = H + 'px';
    // publica pro CSS: as telas reservam essa folga no rodapé
    document.documentElement.style.setProperty('--nav-h', H + 'px');
    track.style.setProperty('--belt-item-w', iw + 'px');
    track.style.setProperty('--belt-item-y', Math.round(H * JANELA_Y) + 'px');
    pintarLente = fazerLente(track, items, iw);
    return true;
  };
  const posDe = (i) => i * iw;

  const talvezTeleportar = () => {
    if (teleportando || !iw) return;
    const cicloPx = CICLO * iw, MIN_SEG = 3 * cicloPx, MAX_SEG = (REPEATS - 3) * cicloPx;
    const sl = track.scrollLeft;
    if (sl >= MIN_SEG && sl < MAX_SEG) return;
    teleportando = true;
    const dentroDoCiclo = ((sl % cicloPx) + cicloPx) % cicloPx;
    const novo = CENTRO * cicloPx + dentroDoCiclo;
    track.scrollLeft = novo;
    atual = Math.round(novo / iw);                  // salto invisível não é clique
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
    if (track.clientWidth > 0 && dimensionar() && track.scrollWidth > track.clientWidth) {
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
    else { dimensionar(); revelar(); }   // desiste de centralizar, mas nunca some
  };
  tentar(0);

  let parada;
  track.addEventListener('scroll', () => {
    if (teleportando || !iw) return;
    pintarLente();
    const i = Math.round(track.scrollLeft / iw);
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

  // Girar o aparelho muda a largura — proporção e vão precisam refazer.
  let redim;
  window.addEventListener('resize', () => {
    clearTimeout(redim);
    redim = setTimeout(() => {
      if (!document.contains(track)) return;
      if (dimensionar()) { track.scrollLeft = posDe(atual); pintarLente(); }
    }, 150);
  });
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
