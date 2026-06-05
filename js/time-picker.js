// ═══════════════════════════════════════════════════════════════
// VISÃO · Time picker custom — wheel scroll + opção de digitar
// Pattern: bottom sheet com roleta HH e MM, header com Cancelar/Salvar
// e botão ⌨️ pra alternar pra modo numérico digitado.
// ═══════════════════════════════════════════════════════════════
const ITEM_H = 44;  // altura de cada item da roleta


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: API PÚBLICA
// ═══════════════════════════════════════════════════════════════
// Retorna Promise<string|null>. Resolve com "HH:MM" ou null se cancelar.
export function openTimePicker(initialValue = '') {
  return new Promise((resolve) => {
    const [initH, initM] = parseHHMM(initialValue);

    const overlay = document.createElement('div');
    overlay.className = 'time-picker-overlay';
    overlay.innerHTML = `
      <div class="time-picker-card" role="dialog" aria-label="Selecionar horário">
        <div class="time-picker-header">
          <button class="tp-btn-secondary" id="tpCancel">Cancelar</button>
          <button class="tp-mode-toggle" id="tpModeToggle" title="Digitar">⌨️</button>
          <button class="tp-btn-primary" id="tpSave">Salvar</button>
        </div>

        <div class="time-picker-body" data-mode="wheel">
          <div class="tp-wheels">
            <div class="tp-wheel" data-wheel="hour">${renderWheelItems(0, 23)}</div>
            <div class="tp-sep">:</div>
            <div class="tp-wheel" data-wheel="minute">${renderWheelItems(0, 59)}</div>
            <div class="tp-center-marker"></div>
          </div>
        </div>

        <div class="time-picker-body tp-mode-typed" data-mode="typed" hidden>
          <div class="tp-typed-display">
            <input type="text" inputmode="numeric" maxlength="2" id="tpTypeH"
                   placeholder="HH" pattern="[0-9]{1,2}" />
            <span class="tp-typed-sep">:</span>
            <input type="text" inputmode="numeric" maxlength="2" id="tpTypeM"
                   placeholder="MM" pattern="[0-9]{1,2}" />
          </div>
          <small class="tp-typed-hint">Digite o horário em HH:MM (24h)</small>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('time-picker-open');

    const hourWheel = overlay.querySelector('[data-wheel="hour"]');
    const minWheel  = overlay.querySelector('[data-wheel="minute"]');

    // Posiciona scroll inicial nos valores recebidos
    requestAnimationFrame(() => {
      hourWheel.scrollTop = initH * ITEM_H;
      minWheel.scrollTop  = initM * ITEM_H;
      highlightSelected(hourWheel);
      highlightSelected(minWheel);
    });

    // Listeners de scroll pra destacar o item central
    let hScrollTimer, mScrollTimer;
    hourWheel.addEventListener('scroll', () => {
      highlightSelected(hourWheel);
      clearTimeout(hScrollTimer);
      hScrollTimer = setTimeout(() => snapToNearest(hourWheel, 23), 150);
    });
    minWheel.addEventListener('scroll', () => {
      highlightSelected(minWheel);
      clearTimeout(mScrollTimer);
      mScrollTimer = setTimeout(() => snapToNearest(minWheel, 59), 150);
    });


    // ── Modo digitado ──
    const tpTypeH = overlay.querySelector('#tpTypeH');
    const tpTypeM = overlay.querySelector('#tpTypeM');
    tpTypeH.value = pad(initH);
    tpTypeM.value = pad(initM);

    tpTypeH.addEventListener('input', () => {
      tpTypeH.value = tpTypeH.value.replace(/\D/g, '');
      if (tpTypeH.value.length === 2) tpTypeM.focus();
    });
    tpTypeM.addEventListener('input', () => {
      tpTypeM.value = tpTypeM.value.replace(/\D/g, '');
    });


    // ── Toggle modo ──
    overlay.querySelector('#tpModeToggle').addEventListener('click', () => {
      const wheelBody = overlay.querySelector('[data-mode="wheel"]');
      const typedBody = overlay.querySelector('[data-mode="typed"]');
      const toBtn = overlay.querySelector('#tpModeToggle');
      if (wheelBody.hasAttribute('hidden')) {
        // Voltar pro wheel — sync valor digitado
        const h = clamp(parseInt(tpTypeH.value, 10) || 0, 0, 23);
        const m = clamp(parseInt(tpTypeM.value, 10) || 0, 0, 59);
        wheelBody.removeAttribute('hidden');
        typedBody.setAttribute('hidden', '');
        requestAnimationFrame(() => {
          hourWheel.scrollTop = h * ITEM_H;
          minWheel.scrollTop  = m * ITEM_H;
        });
        toBtn.textContent = '⌨️';
        toBtn.title = 'Digitar';
      } else {
        // Vai pro modo digitado — sync valor do wheel
        const [h, m] = currentWheelValue(hourWheel, minWheel);
        tpTypeH.value = pad(h);
        tpTypeM.value = pad(m);
        wheelBody.setAttribute('hidden', '');
        typedBody.removeAttribute('hidden');
        toBtn.textContent = '🎡';
        toBtn.title = 'Roleta';
        setTimeout(() => tpTypeH.focus(), 100);
      }
    });


    // ── Cancelar / Salvar ──
    const close = (v) => {
      overlay.remove();
      document.body.classList.remove('time-picker-open');
      resolve(v);
    };
    overlay.querySelector('#tpCancel').addEventListener('click', () => close(null));
    overlay.querySelector('#tpSave').addEventListener('click', () => {
      const typedActive = !overlay.querySelector('[data-mode="typed"]').hasAttribute('hidden');
      let h, m;
      if (typedActive) {
        h = clamp(parseInt(tpTypeH.value, 10) || 0, 0, 23);
        m = clamp(parseInt(tpTypeM.value, 10) || 0, 0, 59);
      } else {
        [h, m] = currentWheelValue(hourWheel, minWheel);
      }
      close(`${pad(h)}:${pad(m)}`);
    });

    // Clica fora → cancela
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WHEEL HELPERS
// ═══════════════════════════════════════════════════════════════
function renderWheelItems(min, max) {
  let html = '<div class="tp-pad"></div>';
  for (let i = min; i <= max; i++) {
    html += `<div class="tp-item" data-v="${i}">${pad(i)}</div>`;
  }
  html += '<div class="tp-pad"></div>';
  return html;
}

function highlightSelected(wheel) {
  const idx = Math.round(wheel.scrollTop / ITEM_H);
  const items = wheel.querySelectorAll('.tp-item');
  items.forEach((it, i) => it.classList.toggle('selected', i === idx));
}

function snapToNearest(wheel, max) {
  const idx = Math.round(wheel.scrollTop / ITEM_H);
  const clamped = Math.max(0, Math.min(max, idx));
  const target = clamped * ITEM_H;
  if (Math.abs(wheel.scrollTop - target) > 1) {
    wheel.scrollTo({ top: target, behavior: 'smooth' });
  }
}

function currentWheelValue(hourWheel, minWheel) {
  const h = Math.round(hourWheel.scrollTop / ITEM_H);
  const m = Math.round(minWheel.scrollTop / ITEM_H);
  return [clamp(h, 0, 23), clamp(m, 0, 59)];
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HELPERS BÁSICOS
// ═══════════════════════════════════════════════════════════════
function pad(n) { return String(n).padStart(2, '0'); }

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseHHMM(s) {
  if (!s) return [7, 0];   // default 07:00 se vazio
  const parts = String(s).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return [isFinite(h) ? clamp(h, 0, 23) : 7, isFinite(m) ? clamp(m, 0, 59) : 0];
}
