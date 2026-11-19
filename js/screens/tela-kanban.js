// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /kanban — aba do menu, no formato Trello (Élton, 18-19/11)
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS, ESTADO E AJUDANTES
// BLOCO 2 — CASCA (abas Pessoal / Profissional / Equipe)
// BLOCO 3 — TELA DE QUADROS (⭐ favoritos, lista, Criar quadro)
// BLOCO 4 — QUADRO ABERTO (listas lado a lado, lupa de zoom)
// BLOCO 5 — CARD: segurar, setinhas, Arquivar, Mover, arrastar pra ordenar
// BLOCO 6 — EDITOR DO CARD
// BLOCO 7 — MENUS (lista, quadro, arquivados)
// ─────────────────────────────────────────────────────────────
// Combinado com o Élton (prints do Trello, "efetividade e simplicidade"):
//  • Em cada aba: os quadros (⭐ em cima) e "＋ Criar quadro" (com cor).
//  • Quadro: listas editáveis (começa com A fazer / Em andamento / Concluído),
//    contador, "＋ Adicionar" no pé, "Adicionar lista" no fim, lupa de zoom.
//  • Card pintado pela cor da etiqueta + bolinha de concluído + prazo.
//  • SEGURA o card → selecionado: setinhas ‹ › levam pra lista vizinha (a tela
//    vai junto), Arquivar e Mover. Arrasta pra cima/baixo pra posicionar; toca
//    de novo pra soltar. Toque normal abre o card.
//  • Config do quadro: nome, cor, nome das etiquetas, cartões arquivados.
// Equipe = etapa 2 (membros, convidar, histórico).

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS, ESTADO E AJUDANTES
// ═══════════════════════════════════════════════════════════════
import { bottomNav } from '../components/menu-inferior.js';
import { showToast, confirmModal } from '../aviso-tela.js';
import { trapModalBack } from '../modal-voltar.js';
import * as K from '../kanban.js';

let aba = 'pessoal';     // 'pessoal' | 'profissional' | 'equipe'
let quadros = [];
let quadro = null;       // quadro aberto (null = tela de quadros)
let listas = [];
let cartoes = [];
let listaIdx = 0;        // lista visível
let zoom = false;
let selId = null;        // card selecionado (segurou)
let erro = null;
let _app = null;

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const daLista = (id) => cartoes.filter(c => c.lista_id === id).sort((a, b) => a.ordem - b.ordem);
const vivo = (app) => _app === app && document.contains(app.querySelector('#kb-corpo'));

// Modal simples (mesmo visual dos outros do app); devolve { ov, fechar }
function modal(html, cls = '') {
  const ov = document.createElement('div');
  ov.className = 'bio-modal-overlay kb-editor';
  ov.innerHTML = `<div class="bio-modal-card kb-editor-card ${cls}">${html}</div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar?.(); });
  return { ov, fechar: () => fechar?.() };
}
const coresHtml = (sel, comNenhuma = false, quadroRef = null) =>
  (comNenhuma ? `<button type="button" class="kb-cor kb-cor-nenhuma ${!sel ? 'on' : ''}" data-cor="" title="Sem cor">∅</button>` : '') +
  K.CORES.map(c => `<button type="button" class="kb-cor ${sel === c.k ? 'on' : ''}" data-cor="${c.k}" style="--c:${c.hex}" title="${_esc(quadroRef ? K.nomeEtiqueta(quadroRef, c.k) : c.nome)}">${quadroRef && quadroRef.etiquetas?.[c.k] ? `<span>${_esc(quadroRef.etiquetas[c.k])}</span>` : ''}</button>`).join('');
function ligarCores(raiz, aoEscolher) {
  raiz.querySelectorAll('.kb-cor').forEach(b => b.addEventListener('click', () => {
    raiz.querySelectorAll('.kb-cor').forEach(x => x.classList.toggle('on', x === b));
    aoEscolher(b.dataset.cor || null);
  }));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CASCA
// ═══════════════════════════════════════════════════════════════
export async function renderKanban(app) {
  _app = app;
  selId = null;
  app.innerHTML = `<div class="screen-pad kb-tela">
    <div id="kb-topo"></div>
    <div id="kb-corpo" class="kb-corpo"></div>
  </div>
  <div class="kb-selbar" id="kb-selbar" hidden>
    <div class="kb-selbar-tx"><b id="kb-sel-nome"></b><small>Arraste pra cima ou pra baixo · toque no card pra soltar</small></div>
    <div class="kb-selbar-bts">
      <button class="kb-seta" data-mover="-1" type="button" aria-label="Lista anterior">‹</button>
      <button class="kb-selbt" data-sel="arquivar" type="button">🗄️ Arquivar</button>
      <button class="kb-selbt" data-sel="mover" type="button">↔ Mover</button>
      <button class="kb-seta" data-mover="1" type="button" aria-label="Próxima lista">›</button>
    </div>
  </div>${bottomNav('kanban')}`;
  app.querySelector('#kb-selbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mover]');
    if (b) return moverDeLista(Number(b.dataset.mover));
    const s = e.target.closest('[data-sel]');
    if (s?.dataset.sel === 'arquivar') return arquivarSelecionado();
    if (s?.dataset.sel === 'mover') return escolherListaPraMover();
  });
  if (quadro) await abrirQuadro(quadro.id, false);
  else await carregarQuadros();
}

function pintarTopo() {
  const topo = _app?.querySelector('#kb-topo');
  if (!topo) return;
  if (quadro) {
    topo.innerHTML = `<div class="kb-qcab" style="--qc:${K.corHex(quadro.cor) || '#9f8fef'}">
      <button class="kb-qbt" id="kb-voltar" type="button" aria-label="Voltar aos quadros">←</button>
      <div class="kb-qnome"><i></i>${_esc(quadro.nome)}</div>
      <button class="kb-qbt ${zoom ? 'on' : ''}" id="kb-zoom" type="button" aria-label="Ver todas as listas">${zoom ? '🔎' : '🔍'}</button>
      <button class="kb-qbt" id="kb-qmenu" type="button" aria-label="Configurações do quadro">⋮</button>
    </div>`;
    topo.querySelector('#kb-voltar').onclick = () => { quadro = null; soltar(); carregarQuadros(); };
    topo.querySelector('#kb-zoom').onclick = () => { zoom = !zoom; pintarTopo(); pintarQuadro(); };
    topo.querySelector('#kb-qmenu').onclick = () => menuQuadro();
    return;
  }
  topo.innerHTML = `<div class="screen-title">
      <h1>📌 Kanban</h1>
      <div class="sub">Organize tuas tarefas em quadros e listas.</div>
    </div>
    <div class="tab-switch" id="kb-abas">
      <button class="tab-btn ${aba === 'pessoal' ? 'active' : ''}" data-aba="pessoal">👤 Pessoal</button>
      <button class="tab-btn ${aba === 'profissional' ? 'active' : ''}" data-aba="profissional">💼 Profissional</button>
      <button class="tab-btn ${aba === 'equipe' ? 'active' : ''}" data-aba="equipe">👥 Equipe</button>
    </div>`;
  topo.querySelector('#kb-abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.dataset.aba === aba) return;
    aba = b.dataset.aba;
    carregarQuadros();
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: TELA DE QUADROS
// ═══════════════════════════════════════════════════════════════
async function carregarQuadros() {
  const app = _app;
  quadro = null;
  pintarTopo();
  const corpo = app?.querySelector('#kb-corpo');
  if (!corpo) return;
  if (aba === 'equipe') {
    corpo.innerHTML = `<div class="fin-vazio">👥 O Kanban da equipe está em desenvolvimento.<br>Em breve dá pra convidar a galera, todo mundo vê e move os cards juntos, com o histórico de quem mexeu. 🦅</div>`;
    return;
  }
  corpo.innerHTML = `<div class="fin-vazio">Carregando teus quadros…</div>`;
  const area = aba;
  try { quadros = await K.lerQuadros(area); erro = null; }
  catch (e) { console.warn('[kanban]', e); erro = e.message; }
  if (!vivo(app) || aba !== area || quadro) return;
  pintarQuadros();
}

function pintarQuadros() {
  const corpo = _app?.querySelector('#kb-corpo');
  if (!corpo) return;
  if (erro) { corpo.innerHTML = `<div class="fin-vazio">😕 ${_esc(erro)}</div>`; return; }
  const fav = quadros.filter(q => q.favorito);
  const tile = (q) => `<button class="kb-qtile" data-q="${q.id}" type="button" style="--qc:${K.corHex(q.cor) || '#9f8fef'}"><span>${_esc(q.nome)}</span></button>`;
  const linha = (q) => `<div class="kb-qlinha" data-q="${q.id}">
      <span class="kb-qcor" style="--qc:${K.corHex(q.cor) || '#9f8fef'}"></span>
      <span class="kb-qlinha-nome">${_esc(q.nome)}</span>
      <button class="kb-estrela ${q.favorito ? 'on' : ''}" data-fav="${q.id}" type="button" aria-label="Favorito">${q.favorito ? '★' : '☆'}</button>
    </div>`;
  corpo.innerHTML = `<div class="kb-quadros">
    ${fav.length ? `<div class="kb-sec">⭐ Favoritos</div><div class="kb-qgrade">${fav.map(tile).join('')}</div>` : ''}
    <div class="kb-sec">${aba === 'pessoal' ? '👤 Quadros pessoais' : '💼 Quadros profissionais'}</div>
    ${quadros.length ? `<div class="kb-qlista">${quadros.map(linha).join('')}</div>`
      : `<div class="kb-vazia">Nenhum quadro ainda. Cria o primeiro! Ex.: ${aba === 'pessoal' ? '"Casa", "Estudos", "Metas do mês"' : '"Clientes", "Lançamento", "Conteúdo"'}.</div>`}
    <button class="kb-criarq" id="kb-criarq" type="button">＋ Criar quadro</button>
  </div>`;
  corpo.querySelector('#kb-criarq').onclick = () => criarQuadroModal();
  corpo.querySelectorAll('[data-q]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-fav]')) return;
    abrirQuadro(el.dataset.q);
  }));
  corpo.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const q = quadros.find(x => x.id === b.dataset.fav);
    if (!q) return;
    q.favorito = !q.favorito;
    pintarQuadros();
    try { await K.mudarQuadro(q.id, { favorito: q.favorito }); }
    catch (err) { q.favorito = !q.favorito; pintarQuadros(); showToast(err.message, 'error'); }
  }));
}

function criarQuadroModal() {
  let cor = 'roxo';
  const { ov, fechar } = modal(`
    <h2 class="bio-modal-title">＋ Criar quadro</h2>
    <input id="kb-qn" class="kb-in" maxlength="80" placeholder="Nome do quadro">
    <div class="kb-rot">Cor</div>
    <div class="kb-cores">${coresHtml(cor)}</div>
    <button class="bio-modal-btn primary" id="kb-ok" type="button">Criar quadro</button>
    <button class="bio-modal-btn ghost" id="kb-x" type="button">Cancelar</button>`);
  ligarCores(ov, (c) => { cor = c || 'roxo'; });
  setTimeout(() => ov.querySelector('#kb-qn')?.focus(), 80);
  ov.querySelector('#kb-x').onclick = fechar;
  ov.querySelector('#kb-ok').onclick = async () => {
    const nome = ov.querySelector('#kb-qn').value.trim();
    if (!nome) { showToast('Dá um nome pro quadro.', 'error'); return; }
    const b = ov.querySelector('#kb-ok'); b.disabled = true; b.textContent = 'Criando…';
    try {
      const q = await K.criarQuadro({ area: aba, nome, cor });
      fechar();
      await abrirQuadro(q.id);
    } catch (e) { b.disabled = false; b.textContent = 'Criar quadro'; showToast(e.message, 'error'); }
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: QUADRO ABERTO
// ═══════════════════════════════════════════════════════════════
async function abrirQuadro(id, voltaPraPrimeira = true) {
  const app = _app;
  const q = quadros.find(x => x.id === id) || (quadro?.id === id ? quadro : null);
  if (!q) {
    try { quadros = await K.lerQuadros(); } catch {}
  }
  quadro = quadros.find(x => x.id === id) || quadro;
  if (!quadro) return carregarQuadros();
  if (quadro.area && aba !== quadro.area) aba = quadro.area;
  if (voltaPraPrimeira) listaIdx = 0;
  soltar();
  pintarTopo();
  const corpo = app?.querySelector('#kb-corpo');
  if (corpo) corpo.innerHTML = `<div class="fin-vazio">Abrindo ${_esc(quadro.nome)}…</div>`;
  try {
    [listas, cartoes] = await Promise.all([K.lerListas(quadro.id), K.lerCartoes(quadro.id)]);
    erro = null;
  } catch (e) { erro = e.message; }
  if (!vivo(app) || quadro?.id !== id) return;
  pintarQuadro();
}

function cardHtml(c) {
  const hex = K.corHex(c.cor);
  const sit = K.situacaoPrazo(c.prazo, c.concluido);
  return `<div class="kb-card ${hex ? 'pintado' : ''} ${c.concluido ? 'feito' : ''} ${c.id === selId ? 'sel' : ''}" data-id="${c.id}" ${hex ? `style="--cc:${hex}"` : ''}>
    <button class="kb-check" data-check="${c.id}" type="button" aria-label="${c.concluido ? 'Desmarcar' : 'Marcar como concluído'}">${c.concluido ? '✓' : ''}</button>
    <div class="kb-card-tx">
      <b>${_esc(c.titulo)}</b>
      ${(c.prazo || c.descricao) ? `<div class="kb-card-meta">${c.prazo ? `<span class="kb-prazo ${sit}">🕒 ${K.textoPrazo(c.prazo)}</span>` : ''}${c.descricao ? '<span class="kb-temdesc" title="Tem descrição">≡</span>' : ''}</div>` : ''}
    </div>
  </div>`;
}

function pintarQuadro() {
  const corpo = _app?.querySelector('#kb-corpo');
  if (!corpo || !quadro) return;
  if (erro) { corpo.innerHTML = `<div class="fin-vazio">😕 ${_esc(erro)}</div>`; return; }
  corpo.innerHTML = `<div class="kb-trilho ${zoom ? 'zoom' : ''}" id="kb-trilho" style="--qc:${K.corHex(quadro.cor) || '#9f8fef'}">
    ${listas.map(l => {
      const cs = daLista(l.id);
      return `<section class="kb-col" data-lista="${l.id}">
        <div class="kb-col-cab"><b>${_esc(l.nome)}</b><span class="kb-cont">${cs.length}</span><button class="kb-lmenu" data-lmenu="${l.id}" type="button" aria-label="Opções da lista">⋮</button></div>
        <div class="kb-lista" data-cards="${l.id}">${cs.map(cardHtml).join('')}</div>
        <div class="kb-add" data-add="${l.id}"><button class="kb-novo" type="button">＋ Adicionar</button></div>
      </section>`;
    }).join('')}
    <section class="kb-col kb-col-nova"><div class="kb-add-lista" id="kb-add-lista"><button class="kb-novo" type="button">＋ Adicionar lista</button></div></section>
  </div>`;
  const trilho = corpo.querySelector('#kb-trilho');
  requestAnimationFrame(() => irPara(listaIdx, false));
  let t = null;
  trilho.addEventListener('scroll', () => {
    if (zoom) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const col = trilho.querySelector('.kb-col');
      if (!col) return;
      listaIdx = Math.round(trilho.scrollLeft / (col.offsetWidth + 10));
      pintarSelbar();
    }, 60);
  }, { passive: true });
  corpo.querySelectorAll('.kb-card').forEach(ligarCard);
  corpo.querySelectorAll('[data-add]').forEach(ligarAdicionar);
  corpo.querySelector('#kb-add-lista').onclick = (e) => { if (e.target.closest('.kb-novo')) abrirAddLista(); };
  corpo.querySelectorAll('[data-lmenu]').forEach(b => b.addEventListener('click', () => menuLista(b.dataset.lmenu)));
  corpo.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); alternarConcluido(b.dataset.check); }));
}

function irPara(i, suave = true) {
  const trilho = _app?.querySelector('#kb-trilho');
  if (!trilho) return;
  listaIdx = Math.max(0, Math.min(listas.length, i));
  const col = trilho.querySelectorAll('.kb-col')[listaIdx];
  if (col && !zoom) trilho.scrollTo({ left: col.offsetLeft - trilho.offsetLeft - 2, behavior: suave ? 'smooth' : 'auto' });
  pintarSelbar();
}

// "＋ Adicionar" no pé da lista: campo na hora, Enter cria e continua aberto
function ligarAdicionar(box) {
  box.addEventListener('click', (e) => {
    if (!e.target.closest('.kb-novo')) return;
    const listaId = box.dataset.add;
    box.innerHTML = `<textarea class="kb-in kb-in-card" rows="2" maxlength="300" placeholder="Título do card"></textarea>
      <div class="kb-add-bts"><button class="kb-add-ok" type="button">Adicionar</button><button class="kb-add-x" type="button">✕</button></div>`;
    const ta = box.querySelector('textarea');
    ta.focus();
    const salvar = async () => {
      const titulo = ta.value.trim();
      if (!titulo) return;
      ta.value = '';
      try {
        const c = await K.criarCartao({ quadro_id: quadro.id, lista_id: listaId, titulo }, daLista(listaId));
        cartoes.push(c);
        const lista = _app.querySelector(`[data-cards="${listaId}"]`);
        lista?.insertAdjacentHTML('beforeend', cardHtml(c));
        const el = lista?.lastElementChild;
        if (el) { ligarCard(el); el.querySelector('[data-check]')?.addEventListener('click', (ev) => { ev.stopPropagation(); alternarConcluido(c.id); }); el.scrollIntoView({ block: 'nearest' }); }
        atualizarContadores();
        ta.focus();
      } catch (err) { showToast(err.message, 'error'); }
    };
    box.querySelector('.kb-add-ok').onclick = salvar;
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); salvar(); } });
    box.querySelector('.kb-add-x').onclick = (ev) => { ev.stopPropagation(); box.innerHTML = `<button class="kb-novo" type="button">＋ Adicionar</button>`; };
  });
}

function abrirAddLista() {
  const box = _app.querySelector('#kb-add-lista');
  box.innerHTML = `<input class="kb-in" maxlength="60" placeholder="Nome da lista">
    <div class="kb-add-bts"><button class="kb-add-ok" type="button">Adicionar lista</button><button class="kb-add-x" type="button">✕</button></div>`;
  const inp = box.querySelector('input');
  inp.focus();
  const salvar = async () => {
    const nome = inp.value.trim();
    if (!nome) return;
    try {
      const l = await K.criarLista(quadro.id, nome, listas.length ? Math.max(...listas.map(x => x.ordem)) + 1 : 0);
      listas.push(l);
      listaIdx = listas.length - 1;
      pintarQuadro();
    } catch (err) { showToast(err.message, 'error'); }
  };
  box.querySelector('.kb-add-ok').onclick = salvar;
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); salvar(); } });
  box.querySelector('.kb-add-x').onclick = () => { box.innerHTML = `<button class="kb-novo" type="button">＋ Adicionar lista</button>`; };
}

function atualizarContadores() {
  _app?.querySelectorAll('.kb-col[data-lista]').forEach(col => {
    const n = col.querySelector('.kb-cont');
    if (n) n.textContent = daLista(col.dataset.lista).length;
  });
}

async function alternarConcluido(id) {
  const c = cartoes.find(x => x.id === id);
  if (!c) return;
  c.concluido = !c.concluido;
  const el = _app?.querySelector(`.kb-card[data-id="${id}"]`);
  if (el) { el.outerHTML = cardHtml(c); const novo = _app.querySelector(`.kb-card[data-id="${id}"]`); ligarCard(novo); novo.querySelector('[data-check]').addEventListener('click', (e) => { e.stopPropagation(); alternarConcluido(id); }); }
  if (c.concluido) navigator.vibrate?.(15);
  try { await K.mudarCartao(id, { concluido: c.concluido }); }
  catch (e) { c.concluido = !c.concluido; pintarQuadro(); showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: CARD — segurar, setinhas, Arquivar, Mover, arrastar
// ═══════════════════════════════════════════════════════════════
const SEGURAR_MS = 450;

function ligarCard(el) {
  if (!el) return;
  let timer = null, x0 = 0, y0 = 0, mexeu = false, segurou = false, arrastando = false;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-check]')) return;
    x0 = e.clientX; y0 = e.clientY; mexeu = false; segurou = false; arrastando = false;
    if (el.dataset.id === selId) { arrastando = true; el.setPointerCapture?.(e.pointerId); return; }
    timer = setTimeout(() => { segurou = true; selecionar(el.dataset.id); }, SEGURAR_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8) { mexeu = true; clearTimeout(timer); }
    if (arrastando && mexeu) { e.preventDefault(); reposicionar(el, e.clientY); }
  });
  el.addEventListener('pointerup', async (e) => {
    if (e.target.closest('[data-check]')) return;
    clearTimeout(timer);
    if (arrastando) { arrastando = false; if (mexeu) await salvarPosicao(el); else soltar(); return; }
    if (segurou || mexeu) return;
    if (selId) { soltar(); return; }
    abrirEditor(cartoes.find(c => c.id === el.dataset.id));
  });
  el.addEventListener('pointercancel', () => { clearTimeout(timer); arrastando = false; });
}

function selecionar(id) {
  selId = id;
  navigator.vibrate?.(20);
  _app?.querySelectorAll('.kb-card').forEach(x => x.classList.toggle('sel', x.dataset.id === id));
  pintarSelbar();
}
function soltar() {
  selId = null;
  _app?.querySelectorAll('.kb-card.sel').forEach(x => x.classList.remove('sel'));
  pintarSelbar();
}
function pintarSelbar() {
  const bar = _app?.querySelector('#kb-selbar');
  if (!bar) return;
  const c = cartoes.find(x => x.id === selId);
  bar.hidden = !c || !quadro;
  if (!c) return;
  const i = listas.findIndex(l => l.id === c.lista_id);
  bar.querySelector('#kb-sel-nome').textContent = c.titulo;
  bar.querySelector('[data-mover="-1"]').disabled = i <= 0;
  bar.querySelector('[data-mover="1"]').disabled = i >= listas.length - 1;
}

function reposicionar(el, y) {
  const lista = el.parentElement;
  const irmaos = [...lista.querySelectorAll('.kb-card')].filter(x => x !== el);
  const depois = irmaos.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
  if (depois) { if (el.nextElementSibling !== depois) lista.insertBefore(el, depois); }
  else if (lista.lastElementChild !== el) lista.appendChild(el);
  const col = lista.closest('.kb-col');
  const r = col.getBoundingClientRect();
  if (y < r.top + 50) col.scrollTop -= 14; else if (y > r.bottom - 50) col.scrollTop += 14;
}

async function salvarPosicao(el) {
  const c = cartoes.find(x => x.id === el.dataset.id);
  if (!c) return;
  const viz = (n) => n?.classList.contains('kb-card') ? cartoes.find(x => x.id === n.dataset.id) : null;
  const nova = K.ordemEntre(viz(el.previousElementSibling)?.ordem ?? null, viz(el.nextElementSibling)?.ordem ?? null);
  if (nova === c.ordem) return;
  c.ordem = nova;
  try { await K.mudarCartao(c.id, { ordem: nova }); }
  catch (e) { showToast(e.message || 'Não consegui salvar a posição.', 'error'); }
}

// Vai pro TOPO da lista de destino (a tela vai junto e o card segue selecionado)
async function moverPara(c, listaId, noTopo = true) {
  const antes = { lista_id: c.lista_id, ordem: c.ordem };
  const dest = daLista(listaId).filter(x => x.id !== c.id);
  c.lista_id = listaId;
  c.ordem = dest.length ? (noTopo ? dest[0].ordem - 1 : dest[dest.length - 1].ordem + 1) : 0;
  listaIdx = listas.findIndex(l => l.id === listaId);
  pintarQuadro();
  irPara(listaIdx);
  try { await K.mudarCartao(c.id, { lista_id: c.lista_id, ordem: c.ordem }); }
  catch (e) { Object.assign(c, antes); pintarQuadro(); showToast(e.message || 'Não consegui mover.', 'error'); }
}

function moverDeLista(passo) {
  const c = cartoes.find(x => x.id === selId);
  if (!c) return;
  const i = listas.findIndex(l => l.id === c.lista_id) + passo;
  if (i < 0 || i >= listas.length) return;
  moverPara(c, listas[i].id);
}

async function arquivarSelecionado() {
  const c = cartoes.find(x => x.id === selId);
  if (!c) return;
  soltar();
  await arquivar(c);
}
async function arquivar(c) {
  cartoes = cartoes.filter(x => x.id !== c.id);
  pintarQuadro();
  try { await K.mudarCartao(c.id, { arquivado: true }); showToast('🗄️ Card arquivado. Dá pra trazer de volta no ⋮ do quadro.', 'info'); }
  catch (e) { cartoes.push(c); pintarQuadro(); showToast(e.message, 'error'); }
}

function escolherListaPraMover(c = cartoes.find(x => x.id === selId), depois = null) {
  if (!c) return;
  const { ov, fechar } = modal(`
    <h2 class="bio-modal-title">↔ Mover pra qual lista?</h2>
    <div class="kb-opcoes">${listas.map(l => `<button type="button" class="kb-opcao ${l.id === c.lista_id ? 'on' : ''}" data-l="${l.id}">${_esc(l.nome)} <small>${daLista(l.id).length}</small></button>`).join('')}</div>
    <button class="bio-modal-btn ghost" id="kb-x" type="button">Cancelar</button>`);
  ov.querySelector('#kb-x').onclick = fechar;
  ov.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
    fechar();
    if (b.dataset.l !== c.lista_id) moverPara(c, b.dataset.l);
    depois?.();
  }));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: EDITOR DO CARD
// ═══════════════════════════════════════════════════════════════
function abrirEditor(c) {
  if (!c) return;
  let cor = c.cor || null, listaId = c.lista_id, concluido = !!c.concluido;
  const { ov, fechar } = modal(`
    <h2 class="bio-modal-title">✏️ Card</h2>
    <textarea id="kb-tit" class="kb-in" rows="2" maxlength="300" placeholder="Título">${_esc(c.titulo)}</textarea>
    <textarea id="kb-desc" class="kb-in" rows="4" maxlength="4000" placeholder="Descrição (opcional)">${_esc(c.descricao || '')}</textarea>
    <div class="kb-rot">Etiqueta</div>
    <div class="kb-cores">${coresHtml(cor, true, quadro)}</div>
    <div class="kb-rot">Prazo</div>
    <div class="kb-prazo-ln"><input id="kb-prazo" class="kb-in" type="date" value="${c.prazo || ''}"><button type="button" class="kb-add-x" id="kb-prazo-x" aria-label="Tirar prazo">✕</button></div>
    <div class="kb-rot">Lista</div>
    <div class="kb-opcoes kb-opcoes-linha">${listas.map(l => `<button type="button" class="kb-opcao ${l.id === listaId ? 'on' : ''}" data-l="${l.id}">${_esc(l.nome)}</button>`).join('')}</div>
    <label class="kb-feito-ln"><input type="checkbox" id="kb-feito" ${concluido ? 'checked' : ''}> ✓ Concluído</label>
    <button class="bio-modal-btn primary" id="kb-ok" type="button">Salvar</button>
    <div class="kb-ed-bts"><button class="bio-modal-btn ghost" id="kb-arq" type="button">🗄️ Arquivar</button><button class="bio-modal-btn ghost kb-apagar" id="kb-del" type="button">🗑️ Apagar</button></div>
    <button class="bio-modal-btn ghost" id="kb-x" type="button">Cancelar</button>`);
  ligarCores(ov, (k) => { cor = k; });
  ov.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
    listaId = b.dataset.l;
    ov.querySelectorAll('[data-l]').forEach(x => x.classList.toggle('on', x === b));
  }));
  ov.querySelector('#kb-prazo-x').onclick = () => { ov.querySelector('#kb-prazo').value = ''; };
  ov.querySelector('#kb-x').onclick = fechar;
  ov.querySelector('#kb-ok').onclick = async () => {
    const titulo = ov.querySelector('#kb-tit').value.trim();
    if (!titulo) { showToast('Escreve o título do card.', 'error'); return; }
    const patch = { titulo, descricao: ov.querySelector('#kb-desc').value.trim() || null, cor, prazo: ov.querySelector('#kb-prazo').value || null, concluido: ov.querySelector('#kb-feito').checked };
    if (listaId !== c.lista_id) {
      const dest = daLista(listaId);
      patch.lista_id = listaId;
      patch.ordem = dest.length ? dest[0].ordem - 1 : 0;
    }
    const b = ov.querySelector('#kb-ok'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      await K.mudarCartao(c.id, patch);
      Object.assign(c, patch);
      fechar();
      if (patch.lista_id) listaIdx = listas.findIndex(l => l.id === listaId);
      pintarQuadro();
    } catch (e) { b.disabled = false; b.textContent = 'Salvar'; showToast(e.message, 'error'); }
  };
  ov.querySelector('#kb-arq').onclick = () => { fechar(); arquivar(c); };
  ov.querySelector('#kb-del').onclick = async () => {
    const ok = await confirmModal({ title: 'Apagar card?', message: `"${c.titulo}" some de vez (não vai pros arquivados).`, confirmText: 'Apagar', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    try { await K.apagarCartao(c.id); cartoes = cartoes.filter(x => x.id !== c.id); fechar(); pintarQuadro(); }
    catch (e) { showToast(e.message, 'error'); }
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: MENUS (lista, quadro, arquivados)
// ═══════════════════════════════════════════════════════════════
function menuLista(id) {
  const l = listas.find(x => x.id === id);
  if (!l) return;
  const n = daLista(id).length;
  const { ov, fechar } = modal(`
    <h2 class="bio-modal-title">${_esc(l.nome)}</h2>
    <input id="kb-ln" class="kb-in" maxlength="60" value="${_esc(l.nome)}" placeholder="Nome da lista">
    <button class="bio-modal-btn primary" id="kb-ren" type="button">Salvar nome</button>
    ${n ? `<button class="bio-modal-btn ghost" id="kb-movtodos" type="button">↔ Mover todos os cards (${n})</button>` : ''}
    <button class="bio-modal-btn ghost kb-apagar" id="kb-dell" type="button">🗑️ Apagar lista</button>
    <button class="bio-modal-btn ghost" id="kb-x" type="button">Cancelar</button>`);
  ov.querySelector('#kb-x').onclick = fechar;
  ov.querySelector('#kb-ren').onclick = async () => {
    const nome = ov.querySelector('#kb-ln').value.trim();
    if (!nome || nome === l.nome) { fechar(); return; }
    try { await K.mudarLista(l.id, { nome }); l.nome = nome; fechar(); pintarQuadro(); }
    catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('#kb-movtodos')?.addEventListener('click', () => {
    fechar();
    const outras = listas.filter(x => x.id !== id);
    if (!outras.length) { showToast('Cria outra lista primeiro.', 'info'); return; }
    const m = modal(`
      <h2 class="bio-modal-title">Mover os ${n} cards pra…</h2>
      <div class="kb-opcoes">${outras.map(x => `<button type="button" class="kb-opcao" data-l="${x.id}">${_esc(x.nome)}</button>`).join('')}</div>
      <button class="bio-modal-btn ghost" id="kb-x2" type="button">Cancelar</button>`);
    m.ov.querySelector('#kb-x2').onclick = m.fechar;
    m.ov.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', async () => {
      m.fechar();
      const dest = b.dataset.l;
      const fim = daLista(dest);
      let ordem = fim.length ? fim[fim.length - 1].ordem + 1 : 0;
      try {
        for (const c of daLista(id)) { await K.mudarCartao(c.id, { lista_id: dest, ordem }); c.lista_id = dest; c.ordem = ordem++; }
        pintarQuadro();
      } catch (e) { showToast(e.message, 'error'); abrirQuadro(quadro.id, false); }
    }));
  });
  ov.querySelector('#kb-dell').onclick = async () => {
    const ok = await confirmModal({ title: 'Apagar lista?', message: n ? `"${l.nome}" e os ${n} cards dela somem de vez.` : `"${l.nome}" some do quadro.`, confirmText: 'Apagar', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    try {
      await K.apagarLista(l.id);
      listas = listas.filter(x => x.id !== l.id);
      cartoes = cartoes.filter(c => c.lista_id !== l.id);
      listaIdx = Math.max(0, Math.min(listaIdx, listas.length - 1));
      fechar(); pintarQuadro();
    } catch (e) { showToast(e.message, 'error'); }
  };
}

function menuQuadro() {
  if (!quadro) return;
  let cor = quadro.cor;
  const { ov, fechar } = modal(`
    <h2 class="bio-modal-title">⚙️ Configurações do quadro</h2>
    <div class="kb-rot">Nome</div>
    <input id="kb-qn" class="kb-in" maxlength="80" value="${_esc(quadro.nome)}">
    <div class="kb-rot">Cor do quadro</div>
    <div class="kb-cores">${coresHtml(cor)}</div>
    <div class="kb-rot">Etiquetas <small>(dá um nome pra cada cor)</small></div>
    <div class="kb-etqs">${K.CORES.map(c => `<label class="kb-etq"><i style="--c:${c.hex}"></i><input class="kb-in" maxlength="24" data-etq="${c.k}" value="${_esc(quadro.etiquetas?.[c.k] || '')}" placeholder="${c.nome}"></label>`).join('')}</div>
    <label class="kb-feito-ln"><input type="checkbox" id="kb-fav" ${quadro.favorito ? 'checked' : ''}> ⭐ Favorito</label>
    <button class="bio-modal-btn primary" id="kb-ok" type="button">Salvar</button>
    <button class="bio-modal-btn ghost" id="kb-arqs" type="button">🗄️ Cartões arquivados</button>
    <button class="bio-modal-btn ghost kb-apagar" id="kb-delq" type="button">🗑️ Apagar quadro</button>
    <button class="bio-modal-btn ghost" id="kb-x" type="button">Cancelar</button>`);
  ligarCores(ov.querySelector('.kb-cores'), (k) => { cor = k || 'roxo'; });
  ov.querySelector('#kb-x').onclick = fechar;
  ov.querySelector('#kb-ok').onclick = async () => {
    const nome = ov.querySelector('#kb-qn').value.trim() || quadro.nome;
    const etiquetas = {};
    ov.querySelectorAll('[data-etq]').forEach(i => { if (i.value.trim()) etiquetas[i.dataset.etq] = i.value.trim().slice(0, 24); });
    const patch = { nome, cor, etiquetas, favorito: ov.querySelector('#kb-fav').checked };
    try { await K.mudarQuadro(quadro.id, patch); Object.assign(quadro, patch); fechar(); pintarTopo(); pintarQuadro(); }
    catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('#kb-arqs').onclick = () => { fechar(); verArquivados(); };
  ov.querySelector('#kb-delq').onclick = async () => {
    const ok = await confirmModal({ title: 'Apagar quadro?', message: `"${quadro.nome}" com todas as listas e cards some de vez.`, confirmText: 'Apagar', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    try { await K.apagarQuadro(quadro.id); quadros = quadros.filter(x => x.id !== quadro.id); quadro = null; fechar(); carregarQuadros(); }
    catch (e) { showToast(e.message, 'error'); }
  };
}

async function verArquivados() {
  let arqs = [];
  try { arqs = await K.lerCartoes(quadro.id, { arquivados: true }); }
  catch (e) { showToast(e.message, 'error'); return; }
  const nomeL = (id) => listas.find(l => l.id === id)?.nome || '';
  const { ov, fechar } = modal(`
    <h2 class="bio-modal-title">🗄️ Cartões arquivados</h2>
    ${arqs.length ? `<div class="kb-arqs">${arqs.map(c => `<div class="kb-arq" data-a="${c.id}"><div><b>${_esc(c.titulo)}</b><small>${_esc(nomeL(c.lista_id))}</small></div>
      <button type="button" class="kb-arq-bt" data-rest="${c.id}">↩ Restaurar</button><button type="button" class="kb-arq-bt kb-apagar" data-del="${c.id}">🗑️</button></div>`).join('')}</div>`
      : `<div class="kb-vazia">Nenhum card arquivado.</div>`}
    <button class="bio-modal-btn ghost" id="kb-x" type="button">Fechar</button>`);
  ov.querySelector('#kb-x').onclick = fechar;
  ov.querySelectorAll('[data-rest]').forEach(b => b.addEventListener('click', async () => {
    const c = arqs.find(x => x.id === b.dataset.rest);
    try {
      const listaOk = listas.some(l => l.id === c.lista_id) ? c.lista_id : listas[0]?.id;
      await K.mudarCartao(c.id, { arquivado: false, lista_id: listaOk });
      cartoes.push({ ...c, arquivado: false, lista_id: listaOk });
      b.closest('.kb-arq').remove();
      pintarQuadro();
    } catch (e) { showToast(e.message, 'error'); }
  }));
  ov.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    try { await K.apagarCartao(b.dataset.del); b.closest('.kb-arq').remove(); }
    catch (e) { showToast(e.message, 'error'); }
  }));
}

// Pet mexeu no Kanban por fora: recarrega se a tela estiver aberta
export async function recarregarKanban() {
  if (!_app || !document.contains(_app.querySelector('#kb-corpo'))) return;
  if (quadro) await abrirQuadro(quadro.id, false);
  else await carregarQuadros();
}
// Pet pede "abre o quadro X"
export function quadroPraAbrir(id) { quadro = { id }; }
