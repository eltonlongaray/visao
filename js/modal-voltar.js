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
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Helper de back-button para modais com suporte a aninhamento
// ─────────────────────────────────────────────────────────────

let trapCounter = 0;

// Fecha um modal e abre outro na mesma hora (ex.: "Editar contato" no perfil):
// o history.back() do que fechou roda depois (setTimeout) e tirava o state do
// modal NOVO, que fechava sozinho. Agora, enquanto há um back pendente, o
// pushState do modal novo espera esse back terminar.
let backsPendentes = 0;
let filaPush = [];
function _soltarFila() {
  const f = filaPush; filaPush = [];
  f.forEach(fn => { try { fn(); } catch (e) { console.warn('[modal-back]', e); } });
}
window.addEventListener('popstate', () => {
  if (backsPendentes > 0 && --backsPendentes === 0) _soltarFila();
});

export function trapModalBack(onClose) {
  const myId = ++trapCounter;
  const myKey = `t${myId}`;
  let popped = false, cameFromPop = false, armado = false;

  const onPop = () => {
    // Se nosso marcador AINDA está no state, foi um trap aninhado que fechou
    // (history.back removeu outro state, não o nosso). Ignora.
    const st = history.state;
    if (st && st[myKey]) return;
    cameFromPop = true;
    finish();
  };

  // Pega state atual (pode ser null) e adiciona NOSSO marcador
  const armar = () => {
    if (popped) return;   // fechou antes de armar: não empilha nada
    armado = true;
    const prevState = history.state || {};
    window.addEventListener('popstate', onPop);
    history.pushState({ ...prevState, [myKey]: true }, '');
  };
  if (backsPendentes > 0) filaPush.push(armar); else armar();

  const finish = () => {
    if (popped) return;
    popped = true;
    window.removeEventListener('popstate', onPop);
    if (armado && !cameFromPop) {
      // Pop nosso state (delay pra evitar reentrada antes do unmount completar)
      backsPendentes++;
      setTimeout(() => {
        try { history.back(); } catch {}
        // segurança: se o navegador não mandar popstate, não trava a fila
        setTimeout(() => { if (backsPendentes > 0) { backsPendentes = 0; _soltarFila(); } }, 600);
      }, 0);
    }
    try { onClose(); } catch (err) { console.warn('[modal-back] onClose threw:', err); }
  };

  return finish;
}
