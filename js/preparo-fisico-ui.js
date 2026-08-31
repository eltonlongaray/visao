// ─── ÍNDICE ──────────────────────────────────────────────────
// Tela "Preparo Físico" (aba do cinturão) — hospeda 3 abas no estilo da
// Comunidade (.tab-switch):
//   📋 Perfil de treino  → objetivo/frequência/experiência (saiu de Atividade)
//   🧮 Composição Corporal → % gordura, massa magra, medidas e fotos (corpo-ui.js)
//   🏃 Atividade Física  → modalidades/esportes + montador (em breve)
// Vale igual pro modal (abrirPreparoFisico) e pra tela cheia (renderPreparo).
// ─────────────────────────────────────────────────────────────
import { montarComposicao, ligarComposicao } from './corpo-ui.js';
import { trapModalBack } from './modal-voltar.js';
import { bottomNav } from './components/menu-inferior.js';
import { montarPerfilTreino } from './perfil-treino-ui.js';

let _aba = 'perfil';       // 'perfil' | 'corpo' | 'atividade'
let _corpoLigado = false;  // ligarComposicao só uma vez por sessão (listener delegado)
let _close = null;

// ─── HTML das abas + conteúdo ─────────────────────────────────
function tabsHtml() {
  return `
    <div class="tab-switch pf-abas" id="pf-abas">
      <button class="tab-btn ${_aba === 'perfil' ? 'active' : ''}" data-aba="perfil" type="button">📋 Perfil de treino</button>
      <button class="tab-btn ${_aba === 'corpo' ? 'active' : ''}" data-aba="corpo" type="button">🧮 Composição corporal</button>
      <button class="tab-btn ${_aba === 'atividade' ? 'active' : ''}" data-aba="atividade" type="button">🏃 Atividade física</button>
    </div>`;
}

function conteudoHtml() {
  if (_aba === 'corpo') return `<div id="cp-inline" class="cp-inline"></div>`;
  if (_aba === 'atividade') return `
    <div class="pf-embreve">🏗️ <b>Modalidades, esportes e montador de treino</b> — chegando já já.</div>`;
  // perfil (padrão): o questionário aberto INLINE (como a Composição)
  return `<div id="pt-inline-wrap"></div>`;
}

// Redesenha abas + conteúdo dentro de um wrapper e religa os handlers.
function pintarWrap(wrap) {
  if (!wrap) return;
  wrap.innerHTML = tabsHtml() + `<div id="pf-conteudo">${conteudoHtml()}</div>`;
  wrap.querySelectorAll('#pf-abas .tab-btn').forEach(b => {
    b.onclick = () => { _aba = b.dataset.aba; pintarWrap(wrap); };
  });
  if (_aba === 'perfil') {
    montarPerfilTreino(wrap.querySelector('#pt-inline-wrap'));
  } else if (_aba === 'corpo') {
    montarComposicao();
    if (!_corpoLigado) { ligarComposicao(); _corpoLigado = true; }
  }
}

// ─── MODAL (card da Home) ─────────────────────────────────────
export function abrirPreparoFisico() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'preparo-ov';
  ov.innerHTML = `<div class="modal pf-modal"><div class="pf-corpo">
    <div class="pf-header">
      <div class="pf-title">💪 Preparo Físico</div>
      <button class="pf-fechar" id="pf-close" type="button">Fechar</button>
    </div>
    <div id="pf-wrap"></div>
  </div></div>`;
  document.body.appendChild(ov);
  // Clique fora fecha, menos na Composição (pode ter form aberto — evita perder)
  ov.addEventListener('click', (e) => { if (e.target === ov && _aba !== 'corpo') _close?.(); });
  _close = trapModalBack(() => ov.remove());
  _aba = 'perfil';
  ov.querySelector('#pf-close').onclick = () => _close?.();
  pintarWrap(ov.querySelector('#pf-wrap'));
}

// ─── TELA CHEIA (aba do menu inferior) ────────────────────────
export function renderPreparo(app) {
  _aba = 'perfil';
  app.innerHTML = `<div class="screen-pad pf-screen">
    <div class="pf-header"><div class="pf-title">💪 Preparo Físico</div></div>
    <div id="pf-wrap"></div>
  </div>${bottomNav('preparo')}`;
  pintarWrap(app.querySelector('#pf-wrap'));
}
