// ═══════════════════════════════════════════════════════════════
// VISÃO · Time picker custom — roleta INFINITA + opção de digitar
// Pattern: bottom sheet com roleta HH e MM, header com Cancelar/Salvar
// e botão ⌨️ pra alternar pra modo numérico digitado.
//
// Como funciona o "infinito":
//   Renderiza N ciclos repetidos da lista (ex: 0..23 cinco vezes).
//   Posiciona o scroll no ciclo do meio. Quando o user passa pra borda
//   (1o ou ultimo ciclo), teleporta silenciosamente pro mesmo valor no
//   ciclo central — sem animação, imperceptível. Sensação: scroll infinito.
// ═══════════════════════════════════════════════════════════════
const ITEM_H = 44;        // altura de cada item da roleta
// Muitos ciclos = scroll maior antes de precisar teleportar.
// 41 ciclos × 24h = 984 items, ~43000px. Usuário pode rolar muito antes de
// chegar nas bordas (onde iOS pode ignorar o teleporte por causa do momentum).
const REPEATS = 41;
const CENTER_REPEAT = 20; // ciclo central (meio dos 41)


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: API PÚBLICA
// ═══════════════════════════════════════════════════════════════
// Retorna Promise<string|null>. Resolve com "HH:MM" ou null se cancelar.
// options.title — texto exibido acima da roleta (estilo título de modal)
export function openTimePicker(initialValue = '', options = {}) {
  return new Promise((resolve) => {
    const [initH, initM] = parseHHMM(initialValue);
    const title = options.title || '';

    const overlay = document.createElement('div');
    overlay.className = 'time-picker-overlay';
    overlay.innerHTML = `
      <div class="time-picker-card" role="dialog" aria-label="Selecionar horário">
        <div class="time-picker-header">
          <button class="tp-btn-secondary" id="tpCancel">Cancelar</button>
          <button class="tp-mode-toggle" id="tpModeToggle" title="Digitar">⌨️</button>
          <button class="tp-btn-primary" id="tpSave">Salvar</button>
        </div>
        ${title ? `<div class="time-picker-title">${escapeTitle(title)}</div>` : ''}

        <div class="time-picker-body" data-mode="wheel">
          <div class="tp-wheels">
            <div class="tp-wheel" data-wheel="hour" data-cycle="24">${renderWheelItems(24)}</div>
            <div class="tp-sep">:</div>
            <div class="tp-wheel" data-wheel="minute" data-cycle="60">${renderWheelItems(60)}</div>
            <div class="tp-center-marker"></div>
          </div>
        </div>

        <div class="time-picker-body tp-mode-typed" data-mode="typed" hidden>
          <div class="tp-typed-single-wrap">
            <input type="text" inputmode="numeric" id="tpTyped"
                   placeholder="HH:MM" maxlength="5" autocomplete="off" />
          </div>
          <small class="tp-typed-hint">Digite só os números — o <strong>:</strong> aparece sozinho.</small>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('time-picker-open');

    const hourWheel = overlay.querySelector('[data-wheel="hour"]');
    const minWheel  = overlay.querySelector('[data-wheel="minute"]');

    // Posiciona scroll no ciclo central com o valor inicial
    requestAnimationFrame(() => {
      hourWheel.scrollTop = scrollPosFor(24, initH);
      minWheel.scrollTop  = scrollPosFor(60, initM);
      highlightSelected(hourWheel);
      highlightSelected(minWheel);
    });

    // Listeners de scroll: highlight + teleporte infinito + snap final
    attachInfiniteScroll(hourWheel);
    attachInfiniteScroll(minWheel);


    // ── Modo digitado ──
    const tpTyped = overlay.querySelector('#tpTyped');
    tpTyped.value = `${pad(initH)}:${pad(initM)}`;

    const formatTyped = (raw) => {
      const digits = String(raw).replace(/\D/g, '').substring(0, 4);
      if (digits.length <= 2) return digits;
      return digits.substring(0, 2) + ':' + digits.substring(2);
    };

    tpTyped.addEventListener('input', () => {
      tpTyped.value = formatTyped(tpTyped.value);
    });

    tpTyped.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        const cursor = tpTyped.selectionStart;
        if (cursor === 3 && tpTyped.value[2] === ':') {
          e.preventDefault();
          tpTyped.value = tpTyped.value.substring(0, 1) + tpTyped.value.substring(3);
          requestAnimationFrame(() => tpTyped.setSelectionRange(1, 1));
        }
      }
    });

    const readTypedValue = () => {
      const v = tpTyped.value || '';
      const [hh, mm] = v.split(':');
      return [clamp(parseInt(hh, 10) || 0, 0, 23), clamp(parseInt(mm, 10) || 0, 0, 59)];
    };


    // ── Toggle modo ──
    overlay.querySelector('#tpModeToggle').addEventListener('click', () => {
      const wheelBody = overlay.querySelector('[data-mode="wheel"]');
      const typedBody = overlay.querySelector('[data-mode="typed"]');
      const toBtn = overlay.querySelector('#tpModeToggle');
      if (wheelBody.hasAttribute('hidden')) {
        const [h, m] = readTypedValue();
        wheelBody.removeAttribute('hidden');
        typedBody.setAttribute('hidden', '');
        requestAnimationFrame(() => {
          hourWheel.scrollTop = scrollPosFor(24, h);
          minWheel.scrollTop  = scrollPosFor(60, m);
          highlightSelected(hourWheel);
          highlightSelected(minWheel);
        });
        toBtn.textContent = '⌨️';
        toBtn.title = 'Digitar';
      } else {
        const [h, m] = currentWheelValue(hourWheel, minWheel);
        tpTyped.value = `${pad(h)}:${pad(m)}`;
        wheelBody.setAttribute('hidden', '');
        typedBody.removeAttribute('hidden');
        toBtn.textContent = '🎡';
        toBtn.title = 'Roleta';
        setTimeout(() => { tpTyped.focus(); tpTyped.setSelectionRange(0, 5); }, 100);
      }
    });


    // ── Cancelar / Salvar + back button do celular ──
    let closed = false;
    let cameFromPop = false;

    const onPopState = () => { cameFromPop = true; close(null); };
    window.addEventListener('popstate', onPopState);
    history.pushState({ tp: true }, '');

    const close = (v) => {
      if (closed) return;
      closed = true;
      window.removeEventListener('popstate', onPopState);
      overlay.remove();
      document.body.classList.remove('time-picker-open');
      if (!cameFromPop) {
        setTimeout(() => { try { history.back(); } catch {} }, 0);
      }
      resolve(v);
    };

    overlay.querySelector('#tpCancel').addEventListener('click', () => close(null));
    overlay.querySelector('#tpSave').addEventListener('click', () => {
      const typedActive = !overlay.querySelector('[data-mode="typed"]').hasAttribute('hidden');
      const [h, m] = typedActive ? readTypedValue() : currentWheelValue(hourWheel, minWheel);
      close(`${pad(h)}:${pad(m)}`);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WHEEL HELPERS — render + scroll infinito + snap
// ═══════════════════════════════════════════════════════════════
function renderWheelItems(cycle) {
  let html = '<div class="tp-pad"></div>';
  for (let r = 0; r < REPEATS; r++) {
    for (let i = 0; i < cycle; i++) {
      html += `<div class="tp-item" data-v="${i}">${pad(i)}</div>`;
    }
  }
  html += '<div class="tp-pad"></div>';
  return html;
}

// scrollTop pra colocar o item `value` no centro do ciclo CENTER_REPEAT
function scrollPosFor(cycle, value) {
  return (CENTER_REPEAT * cycle + value) * ITEM_H;
}

function highlightSelected(wheel) {
  const idx = Math.round(wheel.scrollTop / ITEM_H);
  const items = wheel.querySelectorAll('.tp-item');
  items.forEach((it, i) => it.classList.toggle('selected', i === idx));
}

function attachInfiniteScroll(wheel) {
  const cycle = parseInt(wheel.dataset.cycle, 10);
  const cycleH = cycle * ITEM_H;
  // Janela segura ampla — com 41 ciclos, sobra muito espaço pros 2 lados antes do teleporte.
  // Teleporta só quando passa de uns ~3 ciclos das pontas (evita disparar no meio do momentum).
  const MIN_SAFE = 3 * cycleH;
  const MAX_SAFE = (REPEATS - 3) * cycleH;
  let teleporting = false;
  let scrollTimer;
  const supportsScrollEnd = 'onscrollend' in wheel;

  const maybeTeleport = () => {
    if (teleporting) return;
    const st = wheel.scrollTop;
    if (st >= MIN_SAFE && st < MAX_SAFE) return;
    teleporting = true;
    const offsetInCycle = ((st % cycleH) + cycleH) % cycleH;
    const newScrollTop = CENTER_REPEAT * cycleH + offsetInCycle;
    wheel.scrollTop = newScrollTop;
    requestAnimationFrame(() => { teleporting = false; });
  };

  wheel.addEventListener('scroll', () => {
    if (teleporting) return;
    highlightSelected(wheel);
    clearTimeout(scrollTimer);
    // Em browsers sem scrollend, usa timer; teleporte só DEPOIS do momentum parar.
    scrollTimer = setTimeout(() => {
      snapToNearest(wheel);
      if (!supportsScrollEnd) maybeTeleport();
    }, 180);
  });

  if (supportsScrollEnd) {
    wheel.addEventListener('scrollend', () => {
      snapToNearest(wheel);
      maybeTeleport();
    });
  }
}

function snapToNearest(wheel) {
  const idx = Math.round(wheel.scrollTop / ITEM_H);
  const target = idx * ITEM_H;
  if (Math.abs(wheel.scrollTop - target) > 1) {
    wheel.scrollTo({ top: target, behavior: 'smooth' });
  }
}

function currentWheelValue(hourWheel, minWheel) {
  const hCycle = parseInt(hourWheel.dataset.cycle, 10);
  const mCycle = parseInt(minWheel.dataset.cycle, 10);
  const hIdx = Math.round(hourWheel.scrollTop / ITEM_H);
  const mIdx = Math.round(minWheel.scrollTop / ITEM_H);
  const h = ((hIdx % hCycle) + hCycle) % hCycle;
  const m = ((mIdx % mCycle) + mCycle) % mCycle;
  return [h, m];
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HELPERS BÁSICOS
// ═══════════════════════════════════════════════════════════════
function pad(n) { return String(n).padStart(2, '0'); }

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeTitle(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseHHMM(s) {
  if (!s) return [7, 0];   // default 07:00 se vazio
  const parts = String(s).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return [isFinite(h) ? clamp(h, 0, 23) : 7, isFinite(m) ? clamp(m, 0, 59) : 0];
}
