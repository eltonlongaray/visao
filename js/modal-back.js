// ═══════════════════════════════════════════════════════════════
// VISÃO · Helper de back-button pra modais
// Intercepta o botão "voltar" do celular pra fechar o modal
// sem sair da aba atual (Home/Ritual/Desempenho).
//
// Uso:
//   const close = trapModalBack(() => modal.remove());
//   cancelBtn.onclick = close;
//   modal.onclick = e => { if (e.target === modal) close(); };
// ═══════════════════════════════════════════════════════════════

let trapId = 0;

export function trapModalBack(onClose) {
  let popped = false, cameFromPop = false;
  const myId = ++trapId;

  const onPop = () => {
    cameFromPop = true;
    finish();
  };
  window.addEventListener('popstate', onPop);
  history.pushState({ modalTrap: myId }, '');

  const finish = () => {
    if (popped) return;
    popped = true;
    window.removeEventListener('popstate', onPop);
    if (!cameFromPop) {
      // Tira nosso state da history (pequeno delay evita reentrada)
      setTimeout(() => { try { history.back(); } catch {} }, 0);
    }
    try { onClose(); } catch (err) { console.warn('[modal-back] onClose threw:', err); }
  };

  return finish;
}
