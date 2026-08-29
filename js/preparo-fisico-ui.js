// ─── ÍNDICE ──────────────────────────────────────────────────
// Hub "Preparo Físico" — card próprio na Home. Agrupa duas frentes:
//   🏃 Atividade Física / Esporte  (em breve — Fase 3)
//   🧮 Composição Corporal          (movida do Ajustes; reusa corpo-ui.js)
// Modal com 2 estados: 'menu' (os grupos) e 'corpo' (a composição).
// ─────────────────────────────────────────────────────────────
import { montarComposicao, ligarComposicao } from './corpo-ui.js';
import { trapModalBack } from './modal-voltar.js';
import { bottomNav } from './components/menu-inferior.js';
import { abrirPerfilTreino } from './perfil-treino-ui.js';

let _view = 'menu';        // 'menu' | 'corpo'
let _corpoLigado = false;  // ligarComposicao só uma vez por sessão (listener delegado)
let _close = null;

export function abrirPreparoFisico() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'preparo-ov';
  ov.innerHTML = `<div class="modal pf-modal"><div class="pf-corpo"></div></div>`;
  document.body.appendChild(ov);
  // Clique fora fecha só no menu (na composição pode ter form aberto — evita perder)
  ov.addEventListener('click', (e) => { if (e.target === ov && _view === 'menu') _close?.(); });
  _close = trapModalBack(() => { ov.remove(); _view = 'menu'; });
  _view = 'menu';
  desenhar();
}

function desenhar() {
  const corpo = document.querySelector('#preparo-ov .pf-corpo');
  if (!corpo) return;
  corpo.innerHTML = _view === 'menu' ? telaMenu() : _view === 'atividade' ? telaAtividade() : telaCorpo();
  if (_view === 'menu') {
    corpo.querySelector('#pf-close').onclick = () => _close?.();
    corpo.querySelector('#pf-corpo-btn').onclick = () => { _view = 'corpo'; desenhar(); };
    corpo.querySelector('#pf-atividade-btn').onclick = () => { _view = 'atividade'; desenhar(); };
  } else if (_view === 'atividade') {
    corpo.querySelector('#pf-voltar-ativ').onclick = () => { _view = 'menu'; desenhar(); };
    corpo.querySelector('#pf-perfil-btn').onclick = () => abrirPerfilTreino();
  } else {
    corpo.querySelector('#pf-voltar').onclick = () => { _view = 'menu'; desenhar(); };
    // Renderiza a composição no #cp-inline (mesmo alvo que o Ajustes usava)
    montarComposicao();
    if (!_corpoLigado) { ligarComposicao(); _corpoLigado = true; }
  }
}

function telaMenu(comFechar = true) {
  return `
    <div class="pf-header">
      <div class="pf-title">💪 Preparo Físico</div>
      ${comFechar ? '<button class="pf-fechar" id="pf-close" type="button">Fechar</button>' : ''}
    </div>
    <div class="pf-sub">Cuide do corpo por dentro e por fora.</div>
    <div class="pf-grupos">
      <button class="pf-grupo" id="pf-atividade-btn" type="button">
        <span class="pf-grupo-ic">🏃</span>
        <span class="pf-grupo-txt"><b>Atividade Física / Esporte</b><small>Modalidades, treinos e esportes</small></span>
        <span class="pf-grupo-seta">›</span>
      </button>
      <button class="pf-grupo" id="pf-corpo-btn" type="button">
        <span class="pf-grupo-ic">🧮</span>
        <span class="pf-grupo-txt"><b>Composição Corporal</b><small>% de gordura, massa magra, medidas e fotos</small></span>
        <span class="pf-grupo-seta">›</span>
      </button>
    </div>
  `;
}

// Sub-tela Atividade Física — por ora guarda o Perfil de treino; o resto (catálogo
// de modalidades/esportes + montador de treino) chega nas próximas fases.
function telaAtividade() {
  return `
    <div class="pf-header">
      <button class="pf-back" id="pf-voltar-ativ" type="button" aria-label="Voltar">‹</button>
      <div class="pf-title">🏃 Atividade Física</div>
      <span style="width:40px"></span>
    </div>
    <div class="pf-grupos">
      <button class="pf-grupo" id="pf-perfil-btn" type="button">
        <span class="pf-grupo-ic">📋</span>
        <span class="pf-grupo-txt"><b>Perfil de treino</b><small>Objetivo, frequência e experiência — personaliza suas metas</small></span>
        <span class="pf-grupo-seta">›</span>
      </button>
    </div>
    <div class="pf-embreve">🏗️ <b>Modalidades, esportes e montador de treino</b> — chegando já já.</div>
  `;
}

function telaCorpo() {
  return `
    <div class="pf-header">
      <button class="pf-back" id="pf-voltar" type="button" aria-label="Voltar">‹</button>
      <div class="pf-title">🧮 Composição Corporal</div>
      <span style="width:40px"></span>
    </div>
    <div id="cp-inline" class="cp-inline"></div>
  `;
}

// ─── VERSÃO TELA (aba do menu) ────────────────────────────────
// Mesmo conteúdo do modal, mas como tela cheia com o cinturão embaixo.
export function renderPreparo(app) {
  _view = 'menu';
  app.innerHTML = `<div class="screen-pad pf-screen"><div id="pf-conteudo"></div></div>${bottomNav('preparo')}`;
  pintarConteudo(app);
}

function pintarConteudo(app) {
  const c = app.querySelector('#pf-conteudo');
  if (!c) return;
  c.innerHTML = _view === 'menu' ? telaMenu(false) : _view === 'atividade' ? telaAtividade() : telaCorpo();
  if (_view === 'menu') {
    c.querySelector('#pf-corpo-btn').onclick = () => { _view = 'corpo'; pintarConteudo(app); };
    c.querySelector('#pf-atividade-btn').onclick = () => { _view = 'atividade'; pintarConteudo(app); };
  } else if (_view === 'atividade') {
    c.querySelector('#pf-voltar-ativ').onclick = () => { _view = 'menu'; pintarConteudo(app); };
    c.querySelector('#pf-perfil-btn').onclick = () => abrirPerfilTreino();
  } else {
    c.querySelector('#pf-voltar').onclick = () => { _view = 'menu'; pintarConteudo(app); };
    montarComposicao();
    if (!_corpoLigado) { ligarComposicao(); _corpoLigado = true; }
  }
}
