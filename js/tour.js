// ═══════════════════════════════════════════════════════════════
// VISÃO · Tour de Boas-vindas
// Sistema de "guided tour" com balão branco, dedinho apontando
// e backdrop com recorte.
// ═══════════════════════════════════════════════════════════════
const STORAGE_DONE = 'visao_tour_done_v1';

let active = false;
let steps = [];
let i = 0;
let dom = { backdrop: null, balloon: null, finger: null, hole: null };


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
  if (completed) markDone();
  cleanupDom();
}

export async function next() {
  if (!active) return;
  if (i + 1 >= steps.length) return end(true);
  i++;
  await showStep();
}

export function back() {
  if (!active || i === 0) return;
  i--;
  showStep();
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: DOM SETUP
// ═══════════════════════════════════════════════════════════════
function buildDom() {
  dom.backdrop = document.createElement('div');
  dom.backdrop.className = 'tour-backdrop';
  document.body.appendChild(dom.backdrop);

  dom.hole = document.createElement('div');
  dom.hole.className = 'tour-hole';
  document.body.appendChild(dom.hole);

  dom.finger = document.createElement('div');
  dom.finger.className = 'tour-finger';
  dom.finger.textContent = '👆';
  document.body.appendChild(dom.finger);

  dom.balloon = document.createElement('div');
  dom.balloon.className = 'tour-balloon';
  document.body.appendChild(dom.balloon);

  document.body.classList.add('tour-active');
}

function cleanupDom() {
  for (const k of Object.keys(dom)) {
    if (dom[k]) dom[k].remove();
    dom[k] = null;
  }
  document.body.classList.remove('tour-active');
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: SHOW STEP
// ═══════════════════════════════════════════════════════════════
async function showStep() {
  const step = steps[i];
  if (!step) return end(true);

  // Se o step depende de uma rota, navega antes
  if (step.route && location.hash !== `#${step.route}`) {
    const { navigate } = await import('./router.js');
    navigate(step.route);
    await wait(450); // espera render
  }

  let target = null;
  if (step.target) {
    target = await waitForEl(step.target, 3500);
    if (!target) {
      console.warn('[tour] target não encontrado:', step.target);
      // Mostra como modal central
    }
  }

  positionHole(target, step);
  positionFinger(target, step);
  renderBalloon(step);
  positionBalloon(target, step);

  // Scrolla pro target se preciso
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(350);
    positionHole(target, step);
    positionFinger(target, step);
    positionBalloon(target, step);
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: POSITIONING
// ═══════════════════════════════════════════════════════════════
function positionHole(target, step) {
  if (!target || step.center) {
    dom.hole.style.display = 'none';
    return;
  }
  const r = target.getBoundingClientRect();
  const pad = step.holePad ?? 8;
  dom.hole.style.display = 'block';
  dom.hole.style.top    = `${r.top - pad}px`;
  dom.hole.style.left   = `${r.left - pad}px`;
  dom.hole.style.width  = `${r.width + pad * 2}px`;
  dom.hole.style.height = `${r.height + pad * 2}px`;
}

function positionFinger(target, step) {
  if (!target || step.center || step.hideFinger) {
    dom.finger.style.display = 'none';
    return;
  }
  const r = target.getBoundingClientRect();
  const side = step.fingerSide || 'bottom';
  dom.finger.style.display = 'block';
  dom.finger.dataset.side = side;

  if (side === 'top') {
    dom.finger.style.left = `${r.left + r.width / 2 - 18}px`;
    dom.finger.style.top  = `${r.top - 52}px`;
  } else if (side === 'bottom') {
    dom.finger.style.left = `${r.left + r.width / 2 - 18}px`;
    dom.finger.style.top  = `${r.bottom + 8}px`;
  } else if (side === 'left') {
    dom.finger.style.left = `${r.left - 50}px`;
    dom.finger.style.top  = `${r.top + r.height / 2 - 18}px`;
  } else if (side === 'right') {
    dom.finger.style.left = `${r.right + 14}px`;
    dom.finger.style.top  = `${r.top + r.height / 2 - 18}px`;
  }
}

function positionBalloon(target, step) {
  const b = dom.balloon;
  if (!target || step.center) {
    b.style.left = '50%';
    b.style.top = '50%';
    b.style.transform = 'translate(-50%, -50%)';
    b.dataset.placement = 'center';
    return;
  }

  const r = target.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const bRect = b.getBoundingClientRect();
  const bw = bRect.width || 300;
  const bh = bRect.height || 160;
  const margin = 22;

  // Decide acima ou abaixo do target
  const spaceBelow = vh - r.bottom;
  const spaceAbove = r.top;
  const useBelow = spaceBelow >= bh + margin || spaceBelow > spaceAbove;

  let top, left;
  if (useBelow) {
    top = r.bottom + margin;
    b.dataset.placement = 'below';
  } else {
    top = r.top - bh - margin;
    b.dataset.placement = 'above';
  }
  // Centralizado horizontalmente no target, mas dentro da tela
  left = r.left + r.width / 2 - bw / 2;
  left = Math.max(10, Math.min(left, vw - bw - 10));

  b.style.left = `${left}px`;
  b.style.top  = `${top}px`;
  b.style.transform = 'none';
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: RENDER BALÃO
// ═══════════════════════════════════════════════════════════════
function renderBalloon(step) {
  const total = steps.length;
  const isLast = i === total - 1;
  const isFirst = i === 0;
  const primaryLabel = step.primaryBtn || (isLast ? 'Concluir' : 'Próximo →');

  dom.balloon.innerHTML = `
    <div class="tour-balloon-head">
      ${step.title ? `<div class="tour-balloon-title">${step.title}</div>` : ''}
      <button class="tour-skip-x" data-tour-skip aria-label="Sair">×</button>
    </div>
    <div class="tour-balloon-msg">${step.message}</div>
    <div class="tour-balloon-foot">
      <div class="tour-balloon-progress">
        <span class="tour-step-num">${i + 1}/${total}</span>
        <div class="tour-dots">
          ${Array.from({ length: total }, (_, k) =>
            `<span class="tour-dot${k === i ? ' active' : ''}${k < i ? ' done' : ''}"></span>`
          ).join('')}
        </div>
      </div>
      <div class="tour-balloon-actions">
        ${!isFirst ? '<button class="tour-back-btn" data-tour-back>‹</button>' : ''}
        <button class="tour-next-btn" data-tour-next>${primaryLabel}</button>
      </div>
    </div>
  `;

  dom.balloon.querySelector('[data-tour-next]')?.addEventListener('click', () => next());
  dom.balloon.querySelector('[data-tour-back]')?.addEventListener('click', () => back());
  dom.balloon.querySelector('[data-tour-skip]')?.addEventListener('click', () => {
    end(false);
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6: HELPERS
// ═══════════════════════════════════════════════════════════════
function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
let repositionTimer = null;
window.addEventListener('resize', () => {
  if (!active) return;
  clearTimeout(repositionTimer);
  repositionTimer = setTimeout(() => {
    const step = steps[i];
    if (!step) return;
    const target = step.target ? document.querySelector(step.target) : null;
    positionHole(target, step);
    positionFinger(target, step);
    positionBalloon(target, step);
  }, 100);
});
window.addEventListener('scroll', () => {
  if (!active) return;
  const step = steps[i];
  if (!step) return;
  const target = step.target ? document.querySelector(step.target) : null;
  positionHole(target, step);
  positionFinger(target, step);
  positionBalloon(target, step);
}, true);
