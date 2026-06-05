// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas (v2 — barra fixa embaixo)
// Pattern: bottom bar compacta + spotlight no alvo.
// Não cobre conteúdo, deixa a tela livre pro usuário interagir.
// ═══════════════════════════════════════════════════════════════
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

export function end(completed = false) {
  if (!active) return;
  active = false;
  cleanupTargetClick();
  if (completed) markDone();
  cleanupDom();
}

export async function next() {
  if (!active) return;
  cleanupTargetClick();
  if (i + 1 >= steps.length) return end(true);
  i++;
  await showStep();
}

export function back() {
  if (!active || i === 0) return;
  cleanupTargetClick();
  i--;
  showStep();
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

  // Navega se preciso
  if (step.route && location.hash !== `#${step.route}`) {
    const { navigate } = await import('./router.js');
    navigate(step.route);
    await wait(450);
  }

  // Procura o target (sem travar se não achar)
  let target = null;
  if (step.target) {
    target = await waitForEl(step.target, 3000);
  }

  // Garante estado expandido por default
  dom.bar?.classList.remove('collapsed');
  if (dom.backdrop) { dom.backdrop.style.display = ''; dom.backdrop.style.opacity = ''; }
  if (dom.hole) dom.hole.style.display = '';

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

  positionHole(target, step);
  renderBar(step);

  // Scroll suave pro target ficar visível (acima da barra)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(320);
    positionHole(target, step);
  }
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

  dom.bar.innerHTML = `
    <div class="tour2-bar-inner">
      <div class="tour2-bar-progress">
        <span class="tour2-step-num">${i + 1}/${total}</span>
        <div class="tour2-dots">
          ${Array.from({ length: total }, (_, k) =>
            `<span class="tour2-dot${k === i ? ' active' : ''}${k < i ? ' done' : ''}"></span>`
          ).join('')}
        </div>
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
  dom.bar.querySelector('[data-tour-skip]')?.addEventListener('click', () => end(false));
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
}
window.addEventListener('resize', () => {
  clearTimeout(repoTimer);
  repoTimer = setTimeout(repositionCurrent, 90);
});
window.addEventListener('scroll', repositionCurrent, true);
