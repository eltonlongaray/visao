// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas (v2 — barra fixa embaixo)
// Pattern: bottom bar compacta + spotlight no alvo.
// Não cobre conteúdo, deixa a tela livre pro usuário interagir.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — API PÚBLICA
// BLOCO 2 — DOM SETUP
// BLOCO 3 — SHOW STEP
// BLOCO 4 — SPOTLIGHT (hole no alvo)
// BLOCO 5 — BARRA COMPACTA
// BLOCO 6 — HELPERS
// BLOCO 7 — REPOSITION EM RESIZE / SCROLL
// ─────────────────────────────────────────────────────────────
const STORAGE_DONE = 'visao_tour_done_v2';

let active = false;
let steps = [];
let i = 0;
let dom = { backdrop: null, bar: null, hole: null };
let targetClickCleanup = null;  // remove listener de click no alvo entre steps


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: API PÚBLICA
// ═══════════════════════════════════════════════════════════════
export function isActive() { return active; }
export function isCompleted() { return localStorage.getItem(STORAGE_DONE) === '1'; }
export function markDone() { localStorage.setItem(STORAGE_DONE, '1'); }
export function reset() { localStorage.removeItem(STORAGE_DONE); }

export async function start(stepsArr) {
  if (active) return;
  active = true;
  steps = stepsArr;
  i = 0;
  buildDom();
  await showStep();
}

export async function end(completed = false) {
  if (!active) return;
  active = false;
  cleanupTargetClick();
  // Fecha qualquer coisa que o step atual abriu
  const cur = steps[i];
  if (cur?.onLeave) {
    try { await cur.onLeave(); } catch (err) { console.warn('[tour] onLeave erro:', err); }
  }
  if (completed) markDone();
  cleanupDom();
}

export async function next() {
  if (!active) return;
  cleanupTargetClick();
  // Cleanup do step atual antes de sair (fechar modais abertos, etc)
  const cur = steps[i];
  if (cur?.onLeave) {
    try { await cur.onLeave(); } catch (err) { console.warn('[tour] onLeave erro:', err); }
  }
  if (i + 1 >= steps.length) return end(true);
  i++;
  await showStep();
}

export async function back() {
  if (!active || i === 0) return;
  cleanupTargetClick();
  const cur = steps[i];
  if (cur?.onLeave) {
    try { await cur.onLeave(); } catch (err) { console.warn('[tour] onLeave erro:', err); }
  }
  i--;
  await showStep();
}

function cleanupTargetClick() {
  if (targetClickCleanup) { targetClickCleanup(); targetClickCleanup = null; }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: DOM SETUP
// ═══════════════════════════════════════════════════════════════
function buildDom() {
  dom.backdrop = document.createElement('div');
  dom.backdrop.className = 'tour2-backdrop';
  document.body.appendChild(dom.backdrop);

  dom.hole = document.createElement('div');
  dom.hole.className = 'tour2-hole';
  document.body.appendChild(dom.hole);

  dom.bar = document.createElement('div');
  dom.bar.className = 'tour2-bar';
  document.body.appendChild(dom.bar);

  // X FLUTUANTE no top-right da tela — SEPARADO da barra pra não ser
  // bloqueado por modais que o tour eventualmente abra (z-index altissimo,
  // position fixed por cima de TUDO).
  dom.floatingX = document.createElement('button');
  dom.floatingX.className = 'tour2-floating-x';
  dom.floatingX.setAttribute('aria-label', 'Sair do tutorial');
  dom.floatingX.textContent = '×';
  const closeTour = (e) => { if (e) { e.stopPropagation(); e.preventDefault(); } end(false); };
  dom.floatingX.addEventListener('click', closeTour);
  dom.floatingX.addEventListener('pointerdown', closeTour);
  dom.floatingX.addEventListener('touchend', closeTour);
  document.body.appendChild(dom.floatingX);

  document.body.classList.add('tour2-active');
}

function cleanupDom() {
  for (const k of Object.keys(dom)) {
    if (dom[k]) dom[k].remove();
    dom[k] = null;
  }
  document.body.classList.remove('tour2-active');
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: SHOW STEP
// ═══════════════════════════════════════════════════════════════
async function showStep() {
  const step = steps[i];
  if (!step) return end(true);

  // Esconde o recorte durante a transição — senão o spotlight do passo
  // anterior fica visível no lugar errado enquanto navega/prepara/rola.
  if (dom.hole) dom.hole.style.display = 'none';
  // Já mostra a MENSAGEM deste passo antes de preparar a tela — senão o texto
  // do passo anterior fica visível enquanto o modal/rota novo aparece (confusão).
  renderBar(step);

  // Navega se preciso
  if (step.route && location.hash !== `#${step.route}`) {
    const { navigate } = await import('./roteador.js');
    navigate(step.route);
    await wait(450);
  }

  // Executa açao automatizada ANTES de mostrar o step
  // (ex: abrir modal, expandir card)
  if (step.prepare) {
    try { await step.prepare(); } catch (err) { console.warn('[tour] prepare erro:', err); }
  }

  // Procura o target (sem travar se não achar)
  let target = null;
  if (step.target) {
    target = await waitForEl(step.target, 3000);
  }

  // Garante estado expandido por default
  dom.bar?.classList.remove('collapsed');
  if (dom.backdrop) { dom.backdrop.style.display = ''; dom.backdrop.style.opacity = ''; }

  // Anexa listener ANTES dos awaits pra capturar clicks rápidos
  if (target && !step.noCollapse) {
    const handler = (e) => {
      // Captura tanto click quanto touch (mais robusto no celular)
      if (target === e.target || target.contains(e.target)) {
        collapseBar();
        cleanupTargetClick();
      }
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('click', handler, true);
    targetClickCleanup = () => {
      document.removeEventListener('pointerdown', handler, true);
      document.removeEventListener('click', handler, true);
    };
  }

  // Rola PRIMEIRO, posiciona recorte + barra DEPOIS — sem flash.
  // scrollBlock por passo: 'start' mostra o topo do alvo (ex: dia do Ritual).
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: step.scrollBlock || 'center' });
    await wait(320);
  }
  positionHole(target, step);
  positionBar(target, step);
}

// Decide se a barra fica embaixo (padrão) ou no topo (se o alvo está perto do rodapé)
function positionBar(target, step) {
  if (!dom.bar) return;
  if (!target || step.center) {
    dom.bar.classList.remove('top-placed');
    return;
  }
  const r = target.getBoundingClientRect();
  const vh = window.innerHeight;
  // Se o alvo está nos 35% de baixo da tela → barra sobe pro topo pra não tampar
  const targetIsBottom = r.top > vh * 0.65;
  dom.bar.classList.toggle('top-placed', targetIsBottom);
}

function collapseBar() {
  if (!active || !dom.bar) return;
  dom.bar.classList.add('collapsed');
  // display:none além de opacity pra garantir que nada bloqueia visualmente
  if (dom.backdrop) {
    dom.backdrop.style.opacity = '0';
    dom.backdrop.style.display = 'none';
  }
  if (dom.hole) dom.hole.style.display = 'none';
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: SPOTLIGHT (hole no alvo)
// ═══════════════════════════════════════════════════════════════
function positionHole(target, step) {
  // Se o tour está colapsado, NÃO mostra spotlight (proteção extra)
  if (dom.bar?.classList.contains('collapsed')) {
    if (dom.hole) dom.hole.style.display = 'none';
    return;
  }
  if (!target || step.noSpotlight) {
    dom.hole.style.display = 'none';
    return;
  }
  const r = target.getBoundingClientRect();
  const pad = step.holePad ?? 8;
  dom.hole.style.display = 'block';
  dom.hole.style.top    = `${Math.max(0, r.top - pad)}px`;
  dom.hole.style.left   = `${Math.max(0, r.left - pad)}px`;
  dom.hole.style.width  = `${r.width + pad * 2}px`;
  dom.hole.style.height = `${r.height + pad * 2}px`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: BARRA COMPACTA
// ═══════════════════════════════════════════════════════════════
function renderBar(step) {
  const total = steps.length;
  const isLast = i === total - 1;
  const isFirst = i === 0;
  const primaryLabel = step.primaryBtn || (isLast ? 'Concluir' : 'Próximo →');

  // Janela de 5 bolinhas em volta da etapa atual
  const WIN = 5;
  const half = Math.floor(WIN / 2);
  let start = Math.max(0, i - half);
  let end = Math.min(total, start + WIN);
  if (end - start < WIN) start = Math.max(0, end - WIN);
  const dotsHtml = Array.from({ length: end - start }, (_, k) => {
    const idx = start + k;
    return `<span class="tour2-dot${idx === i ? ' active' : ''}${idx < i ? ' done' : ''}"></span>`;
  }).join('');

  dom.bar.innerHTML = `
    <div class="tour2-bar-inner">
      <div class="tour2-bar-progress">
        <div class="tour2-dots">${dotsHtml}</div>
      </div>

      <div class="tour2-bar-body">
        ${step.title ? `<div class="tour2-bar-title">${step.title}</div>` : ''}
        <div class="tour2-bar-msg">${step.message}</div>
      </div>

      <div class="tour2-bar-actions">
        ${!isFirst ? '<button class="tour2-btn-back" data-tour-back aria-label="Voltar">‹</button>' : ''}
        <button class="tour2-btn-skip" data-tour-skip aria-label="Sair do tour">×</button>
        <button class="tour2-btn-next" data-tour-next>${primaryLabel}</button>
      </div>
    </div>
  `;

  dom.bar.querySelector('[data-tour-next]')?.addEventListener('click', () => next());
  dom.bar.querySelector('[data-tour-back]')?.addEventListener('click', () => back());
  // X de sair: usa pointerdown (mais confiavel que click em mobile com modais sobrepostos)
  // + stopPropagation pra evitar handlers globais interferirem
  const skipBtn = dom.bar.querySelector('[data-tour-skip]');
  if (skipBtn) {
    const onSkip = (e) => { e.stopPropagation(); e.preventDefault(); end(false); };
    skipBtn.addEventListener('click', onSkip);
    skipBtn.addEventListener('pointerdown', onSkip);
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6: HELPERS
// ═══════════════════════════════════════════════════════════════
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForEl(selector, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = Date.now();
    const iv = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(iv); resolve(el); }
      else if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(null); }
    }, 100);
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: REPOSITION EM RESIZE / SCROLL
// ═══════════════════════════════════════════════════════════════
let repoTimer = null;
function repositionCurrent() {
  if (!active) return;
  // FIX: quando colapsado, NÃO reposiciona o spotlight (senão ele volta a aparecer)
  if (dom.bar?.classList.contains('collapsed')) return;
  const step = steps[i];
  if (!step) return;
  const target = step.target ? document.querySelector(step.target) : null;
  positionHole(target, step);
  positionBar(target, step);
}
window.addEventListener('resize', () => {
  clearTimeout(repoTimer);
  repoTimer = setTimeout(repositionCurrent, 90);
});
window.addEventListener('scroll', repositionCurrent, true);

// Auto-avança quando o usuário navega pra rota do próximo step
window.addEventListener('hashchange', () => {
  if (!active) return;
  const cur = steps[i];
  const nxt = steps[i + 1];
  if (!nxt) return;
  const hash = location.hash;
  // Se a próxima step tem essa rota e a atual era de transição → avança
  if (nxt.route && hash === `#${nxt.route}` && cur?.route !== nxt.route) {
    next();
  }
});
