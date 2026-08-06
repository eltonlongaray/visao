// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Router de hash (#/rota) que mapeia rotas para módulos de tela
// ─────────────────────────────────────────────────────────────
// Router simples baseado em hash (#/login, #/welcome, #/home, etc).
// Cada rota chama um módulo de tela que renderiza dentro de #app.

const routes = {};
let currentCleanup = null;

// Rolagem manual: sem isto o navegador RESTAURA a posição anterior ao voltar pro
// app (bfcache/segundo plano). Depois de virar o dia, isso devolvia a tela rolada
// no dia de ONTEM (ex.: abria "no topo da quarta" numa quinta). Cada tela passa a
// controlar a própria rolagem.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

export function registerRoute(path, renderFn) {
  routes[path] = renderFn;
}

export function navigate(path) {
  if (location.hash !== '#' + path) {
    location.hash = '#' + path;
  } else {
    render();
  }
}

// Permite que main.js force render APÓS registrar todas as rotas
// (necessário porque setTimeout(render,0) pode disparar antes do main.js terminar
// caso Firebase CDN esteja lento bloqueando a evaluação de main.js)
export function forceRender() {
  return render();
}

async function render() {
  const path = (location.hash || '#/login').slice(1).split('?')[0];
  const renderFn = routes[path] || routes['/login'];
  const app = document.getElementById('app');
  if (currentCleanup) { try { currentCleanup(); } catch {} currentCleanup = null; }
  // PATCH: remove modais persistentes na troca de rota
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  if (renderFn) {
    const cleanup = await renderFn(app);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  }
}

window.addEventListener('hashchange', render);
// FIX: type="module" carrega ANTES de main.js terminar de registrar rotas.
// Se DOMContentLoaded já passou, agenda render() pro PRÓXIMO tick (deixa main.js terminar).
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', render);
} else {
  setTimeout(render, 0);
}
