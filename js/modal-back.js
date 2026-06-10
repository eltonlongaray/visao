// ═══════════════════════════════════════════════════════════════
// VISÃO · Helper de back-button pra modais — SUPORTA ANINHAMENTO
//
// Cada trap empilha um state com um marcador único. Quando outro modal
// (aninhado) fecha e dispara history.back, este trap NÃO fecha — porque
// detecta que seu marcador ainda está no state atual.
//
// Uso:
//   const close = trapModalBack(() => modal.remove());
//   cancelBtn.onclick = close;     // fecha pela UI
//   // back button do celular fecha automaticamente
// ═══════════════════════════════════════════════════════════════

let trapCounter = 0;

export function trapModalBack(onClose) {
  const myId = ++trapCounter;
  const myKey = `t${myId}`;
  let popped = false, cameFromPop = false;

  const onPop = () => {
    // Se nosso marcador AINDA está no state, foi um trap aninhado que fechou
    // (history.back removeu outro state, não o nosso). Ignora.
    const st = history.state;
    if (st && st[myKey]) return;
    cameFromPop = true;
    finish();
  };

  // Pega state atual (pode ser null) e adiciona NOSSO marcador
  const prevState = history.state || {};
  const newState = { ...prevState, [myKey]: true };
  window.addEventListener('popstate', onPop);
  history.pushState(newState, '');

  const finish = () => {
    if (popped) return;
    popped = true;
    window.removeEventListener('popstate', onPop);
    if (!cameFromPop) {
      // Pop nosso state (delay pra evitar reentrada antes do unmount completar)
      setTimeout(() => { try { history.back(); } catch {} }, 0);
    }
    try { onClose(); } catch (err) { console.warn('[modal-back] onClose threw:', err); }
  };

  return finish;
}
