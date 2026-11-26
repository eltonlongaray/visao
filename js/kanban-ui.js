// ─── ÍNDICE ──────────────────────────────────────────────────
// KANBAN das tarefas do dia (Ferramentas › 📌 Kanban) — Élton, 26/11/2026.
// Topo: rolagem das modalidades (Trabalho, Faculdade, Casa, Pessoal…), igual à
// rolagem dos botões da Agenda. Tocar troca a tela de baixo (sem pop-up);
// segurar abre a edição logo abaixo (nome, cor, apagar). A cor da borda do
// botão é a cor de fundo dos cards (paleta com contraste garantido, kanban.js).
// Embaixo: colunas A fazer / Fazendo / Feito no estilo Trello (a próxima aparece
// no canto). Segura o card e arrasta: chegando na borda a tela anda pra próxima
// coluna. Feito = histórico por dia; nada some sozinho.
// Cada card guarda criado_em, fazendo_em e feito_em (tocar mostra as 3).
// BLOCO 1 — IMPORTS E ESTADO
// BLOCO 2 — ABRIR / RECARREGAR
// BLOCO 3 — DESENHO (topo, editor da modalidade, colunas, cards)
// BLOCO 4 — WIRES (modalidades, adicionar, detalhe do card)
// BLOCO 5 — ARRASTAR O CARD
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: IMPORTS E ESTADO ===
import * as K from './kanban.js';
import { trapModalBack } from './modal-voltar.js';
import { showToast, confirmModal } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const SVG_VOLTAR = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>`;
const LS_MOD = 'falcon_kanban_mod';     // última modalidade aberta (só conveniência)
const FEITO_MAX = 150;                  // Feito mostra os mais recentes; "ver mais" abre o resto

let _mods = [], _tarefas = [], _sel = null;
let _editando = null;        // id da modalidade em edição | 'nova' | null
let _corNova = null;         // cor escolhida no editor (antes de salvar)
let _aberto = null;          // id do card com o detalhe aberto
let _addEm = null;           // coluna com a caixa de adicionar aberta
let _feitoTudo = false;
let _close = null;

const _ov = () => document.getElementById('kanban-ov');
const _corpo = () => document.querySelector('#kanban-ov .kb-corpo');
const _lsGet = () => { try { return localStorage.getItem(LS_MOD); } catch { return null; } };
const _lsSet = (v) => { try { localStorage.setItem(LS_MOD, v); } catch { /* sem storage */ } };
const _mod = () => _mods.find(m => m.id === _sel) || _mods[0] || null;
const _daMod = () => _tarefas.filter(t => t.modalidade_id === _mod()?.id);

// Ordem de cada coluna: A fazer/Fazendo pela posição; Feito do mais novo pro mais antigo
function _naColuna(col) {
  const l = _daMod().filter(t => t.coluna === col);
  if (col === 'feito') return l.sort((a, b) => String(b.feito_em || '').localeCompare(String(a.feito_em || '')));
  return l.sort((a, b) => a.ordem - b.ordem);
}

// === BLOCO 2: ABRIR / RECARREGAR ===
export async function abrirKanban(opts = {}) {
  if (_ov()) { if (opts.modalidade) _irPara(opts.modalidade); return; }
  _editando = null; _aberto = null; _addEm = null; _feitoTudo = false;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'kanban-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo kb-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  _close = trapModalBack(() => ov.remove());
  try { await _carregar(); }
  catch (e) {
    const c = _corpo();
    if (c) c.innerHTML = `<div class="ag-header"><button class="fr-voltar" data-kb-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button><div class="ag-title">📌 Kanban</div></div>
      <div class="ag-erro">Não deu pra abrir o Kanban.<br><small>${esc(e.message)}</small></div>`;
    c?.querySelector('[data-kb-voltar]')?.addEventListener('click', () => history.back());
    return;
  }
  if (opts.modalidade) _irPara(opts.modalidade, false);
  desenhar();
}

// O Pet mexeu: relê o banco e redesenha (se a tela estiver aberta)
export async function recarregarKanban() {
  if (!_ov()) return;
  try { await _carregar(); desenhar(); } catch (e) { console.warn('[kanban]', e); }
}

async function _carregar() {
  [_mods, _tarefas] = await Promise.all([K.lerModalidades(), K.lerTarefas()]);
  if (!_mods.some(m => m.id === _sel)) _sel = (_mods.find(m => m.id === _lsGet()) || _mods[0])?.id || null;
}

function _irPara(modId, redesenha = true) {
  if (!_mods.some(m => m.id === modId)) return;
  _sel = modId; _lsSet(modId); _aberto = null; _addEm = null; _editando = null; _feitoTudo = false;
  if (redesenha) desenhar(0);
}

// === BLOCO 3: DESENHO ===
// coluna = qual coluna deixar na tela (null = mantém onde estava)
function desenhar(coluna = null) {
  const corpo = _corpo(); if (!corpo) return;
  const trilhoAntes = corpo.querySelector('.kb-trilho');
  const x = coluna == null ? (trilhoAntes?.scrollLeft || 0) : null;
  const m = _mod();
  corpo.innerHTML = `
    <div class="ag-header">
      <button class="fr-voltar" data-kb-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
      <div class="ag-title">📌 Kanban</div>
    </div>
    <div class="fin-topo kb-mods" role="tablist">
      ${_mods.map(md => {
        const c = K.cor(md.cor), on = md.id === m?.id;
        return `<button type="button" class="fin-topo-btn kb-mod ${on ? 'on' : ''}" data-mod="${md.id}" role="tab" aria-selected="${on}"
          style="border-left-color:${c.fundo};${on ? `background:${c.fundo};color:${c.letra};border-color:${c.fundo}` : ''}">${esc(md.nome)}</button>`;
      }).join('')}
      <button type="button" class="fin-topo-btn kb-mod kb-mod-add" data-mod-nova>＋ Modalidade</button>
    </div>
    ${_editando ? _editorHtml() : `<div class="kb-dica">Segura o botão da modalidade pra editar o nome ou a cor.</div>`}
    <div class="kb-pts" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
    <div class="kb-trilho">${m ? K.COLUNAS.map(c => _colunaHtml(c, m)).join('') : '<div class="ag-vazio">Cria uma modalidade no ＋ lá em cima.</div>'}</div>`;
  _wire(corpo);
  const tr = corpo.querySelector('.kb-trilho');
  if (tr) {
    if (coluna != null) tr.scrollLeft = coluna * _passo(tr);
    else tr.scrollLeft = x;
    _pontos(tr);
  }
}

function _editorHtml() {
  const md = _editando === 'nova' ? null : _mods.find(x => x.id === _editando);
  const usadas = new Set(_mods.map(x => x.cor));
  const corK = _corNova || md?.cor || (K.CORES.find(c => !usadas.has(c.k)) || K.CORES[0]).k;
  _corNova = corK;
  return `<div class="kb-ed">
    <label class="kb-ed-rot" for="kb-ed-nome">${md ? 'Nome da modalidade' : 'Nova modalidade'}</label>
    <input id="kb-ed-nome" class="kb-ed-nome" maxlength="40" value="${esc(md?.nome || '')}" placeholder="Ex.: 💪 Treino, 🛒 Compras…" autocomplete="off">
    <div class="kb-ed-rot">Cor (a letra se ajusta sozinha)</div>
    <div class="kb-pal">${K.CORES.map(c => `<button type="button" class="kb-pal-c ${c.k === corK ? 'sel' : ''}" data-cor="${c.k}" aria-label="${c.nome}" style="background:${c.fundo};color:${c.letra}">Aa</button>`).join('')}</div>
    <div class="kb-ed-bts">
      ${md ? `<button type="button" class="kb-ed-apagar" data-ed-apagar>Apagar</button>` : `<button type="button" class="kb-ed-cancelar" data-ed-cancelar>Cancelar</button>`}
      <button type="button" class="kb-ed-salvar" data-ed-salvar>Salvar</button>
    </div>
    ${md ? `<button type="button" class="kb-ed-fechar" data-ed-cancelar>Fechar sem mudar</button>` : ''}
  </div>`;
}

function _colunaHtml(col, m) {
  const lista = _naColuna(col.k);
  let cards = '';
  if (col.k === 'feito') {
    const mostra = _feitoTudo ? lista : lista.slice(0, FEITO_MAX);
    let dia = null;
    for (const t of mostra) {
      const d = K.chaveDia(t.feito_em || t.updated_at || t.criado_em);
      if (d !== dia) { dia = d; cards += `<div class="kb-dia">${esc(K.rotuloDia(t.feito_em || t.updated_at || t.criado_em))}</div>`; }
      cards += _cardHtml(t, m);
    }
    if (lista.length > mostra.length) cards += `<button type="button" class="kb-mais" data-feito-tudo>Ver mais ${lista.length - mostra.length}</button>`;
  } else cards = lista.map(t => _cardHtml(t, m)).join('');
  const add = _addEm === col.k
    ? `<div class="kb-add-caixa"><textarea class="kb-add-txt" rows="2" maxlength="300" placeholder="O que precisa fazer?"></textarea>
        <div class="kb-add-bts"><button type="button" class="kb-add-ok" data-add-ok>Adicionar</button><button type="button" class="kb-add-x" data-add-x aria-label="Fechar">✕</button></div></div>`
    : `<button type="button" class="kb-add" data-add="${col.k}">＋ Adicionar tarefa</button>`;
  return `<section class="kb-col" data-col="${col.k}">
    <div class="kb-col-cab"><b>${col.nome}</b><small>${lista.length}</small></div>
    <div class="kb-lista" data-lista="${col.k}">${cards || (col.k === 'feito' ? '<div class="kb-vazio">O que tu concluir fica guardado aqui.</div>' : '')}</div>
    ${add}
  </section>`;
}

function _cardHtml(t, m) {
  const c = K.cor(m.cor), aberto = _aberto === t.id;
  const det = aberto ? `
    <div class="kb-det">
      <div>📝 Criado em ${esc(K.quando(t.criado_em))}</div>
      ${t.fazendo_em ? `<div>▶️ Foi pra Fazendo em ${esc(K.quando(t.fazendo_em))}</div>` : ''}
      ${t.feito_em ? `<div>✅ Concluído em ${esc(K.quando(t.feito_em))}${K.levou(t) ? ` · levou ${esc(K.levou(t))}` : ''}</div>` : ''}
      <div class="kb-det-mover">${K.COLUNAS.filter(x => x.k !== t.coluna).map(x => `<button type="button" data-mover="${x.k}">→ ${x.nome}</button>`).join('')}</div>
      <div class="kb-det-bts"><button type="button" data-editar>✏️ Editar</button><button type="button" data-apagar>🗑️ Apagar</button></div>
    </div>` : '';
  return `<div class="kb-card ${aberto ? 'aberto' : ''}" data-card="${t.id}" style="background:${c.fundo};color:${c.letra}">
    <div class="kb-card-tit">${esc(t.titulo)}</div>
    <div class="kb-card-sub">${esc(K.linhaCurta(t))}</div>${det}
  </div>`;
}

// Largura de uma coluna + espaço (pra saber em qual coluna a tela está)
function _passo(tr) {
  const col = tr.querySelector('.kb-col');
  return col ? col.getBoundingClientRect().width + 12 : tr.clientWidth;
}
function _pontos(tr) {
  const i = Math.max(0, Math.min(2, Math.round(tr.scrollLeft / _passo(tr))));
  _corpo()?.querySelectorAll('.kb-pts i').forEach((p, k) => p.classList.toggle('on', k === i));
}

// === BLOCO 4: WIRES ===
function _wire(corpo) {
  corpo.querySelector('[data-kb-voltar]')?.addEventListener('click', () => history.back());

  // Modalidades: tocar troca a tela; segurar abre a edição logo abaixo
  corpo.querySelectorAll('[data-mod]').forEach(b => {
    let timer = null, segurou = false;
    const solta = () => clearTimeout(timer);
    b.addEventListener('pointerdown', () => {
      segurou = false;
      timer = setTimeout(() => { segurou = true; navigator.vibrate?.(15); _editando = b.dataset.mod; _corNova = null; _sel = b.dataset.mod; _lsSet(_sel); desenhar(); }, 550);
    });
    b.addEventListener('pointerup', solta); b.addEventListener('pointerleave', solta); b.addEventListener('pointercancel', solta);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => { if (segurou) return; if (b.dataset.mod !== _sel) _irPara(b.dataset.mod); });
  });
  corpo.querySelector('[data-mod-nova]')?.addEventListener('click', () => { _editando = 'nova'; _corNova = null; desenhar(); corpo.querySelector('#kb-ed-nome')?.focus(); });
  const mods = corpo.querySelector('.kb-mods');
  const on = mods?.querySelector('.kb-mod.on');
  if (on && mods) {   // deixa a modalidade escolhida inteira à vista
    const a = on.getBoundingClientRect(), r = mods.getBoundingClientRect();
    if (a.left < r.left + 16 || a.right > r.right - 16) mods.scrollLeft += a.left - r.left - 16;
  }

  // Editor da modalidade (inline)
  corpo.querySelectorAll('[data-cor]').forEach(b => b.addEventListener('click', () => {
    _corNova = b.dataset.cor;
    corpo.querySelectorAll('[data-cor]').forEach(x => x.classList.toggle('sel', x === b));
  }));
  corpo.querySelectorAll('[data-ed-cancelar]').forEach(b => b.addEventListener('click', () => { _editando = null; desenhar(); }));
  corpo.querySelector('[data-ed-salvar]')?.addEventListener('click', _salvarModalidade);
  corpo.querySelector('#kb-ed-nome')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _salvarModalidade(); } });
  corpo.querySelector('[data-ed-apagar]')?.addEventListener('click', _apagarModalidade);

  // Adicionar tarefa
  corpo.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    _addEm = b.dataset.add; desenhar(); corpo.querySelector('.kb-add-txt')?.focus();
  }));
  const txt = corpo.querySelector('.kb-add-txt');
  txt?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _adicionar(); } });
  corpo.querySelector('[data-add-ok]')?.addEventListener('click', _adicionar);
  corpo.querySelector('[data-add-x]')?.addEventListener('click', () => { _addEm = null; desenhar(); });
  corpo.querySelector('[data-feito-tudo]')?.addEventListener('click', () => { _feitoTudo = true; desenhar(); });

  // Cards: tocar abre o detalhe; segurar e arrastar move (BLOCO 5)
  corpo.querySelectorAll('.kb-card').forEach(el => _ligarCard(el));

  const tr = corpo.querySelector('.kb-trilho');
  tr?.addEventListener('scroll', () => _pontos(tr), { passive: true });
}

async function _salvarModalidade() {
  const corpo = _corpo(); if (!corpo) return;
  const nome = corpo.querySelector('#kb-ed-nome')?.value.trim();
  if (!nome) { showToast('Dá um nome pra modalidade', 'error'); return; }
  const bt = corpo.querySelector('[data-ed-salvar]'); if (bt) bt.disabled = true;
  try {
    if (_editando === 'nova') {
      const nova = await K.criarModalidade(nome, _corNova, (_mods.length ? Math.max(..._mods.map(x => x.ordem)) : 0) + 1);
      _mods.push(nova); _sel = nova.id; _lsSet(_sel);
    } else {
      await K.mudarModalidade(_editando, { nome, cor: _corNova });
      Object.assign(_mods.find(x => x.id === _editando) || {}, { nome, cor: _corNova });
    }
    _editando = null; _corNova = null; desenhar(0);
  } catch (e) { showToast(e.message, 'error'); if (bt) bt.disabled = false; }
}

async function _apagarModalidade() {
  const md = _mods.find(x => x.id === _editando); if (!md) return;
  if (_mods.length <= 1) { showToast('Precisa ficar pelo menos uma modalidade', 'error'); return; }
  const n = _tarefas.filter(t => t.modalidade_id === md.id).length;
  const ok = await confirmModal({ title: `Apagar ${md.nome}?`, message: n ? `As ${n === 1 ? 'tarefa' : n + ' tarefas'} dela (inclusive o histórico do Feito) vão junto.` : 'Ela não tem tarefas.', confirmText: 'Apagar', danger: true });
  if (!ok) return;
  try {
    await K.apagarModalidade(md.id);
    _mods = _mods.filter(x => x.id !== md.id); _tarefas = _tarefas.filter(t => t.modalidade_id !== md.id);
    _editando = null; _sel = _mods[0]?.id || null; _lsSet(_sel || '');
    desenhar(0);
  } catch (e) { showToast(e.message, 'error'); }
}

async function _adicionar() {
  const corpo = _corpo(); const txt = corpo?.querySelector('.kb-add-txt'); const m = _mod();
  const titulo = txt?.value.trim();
  if (!titulo || !m || !_addEm) return;
  txt.value = '';
  try {
    const nova = await K.criarTarefa({ modalidade_id: m.id, titulo, coluna: _addEm }, _naColuna(_addEm));
    _tarefas.push(nova);
    desenhar();
    _corpo()?.querySelector('.kb-add-txt')?.focus();   // fica aberta pra próxima
  } catch (e) { showToast(e.message, 'error'); txt.value = titulo; }
}

function _detalheWire(el, t) {
  el.querySelectorAll('[data-mover]').forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const col = b.dataset.mover, irmas = _naColuna(col);
    const ordem = irmas.length && col !== 'feito' ? Math.min(...irmas.map(x => x.ordem)) - 1 : 0;
    try { await K.moverTarefa(t, col, ordem); _aberto = null; desenhar(K.COLUNAS.findIndex(c => c.k === col)); }
    catch (er) { showToast(er.message, 'error'); }
  }));
  el.querySelector('[data-editar]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const tit = el.querySelector('.kb-card-tit');
    tit.innerHTML = `<textarea class="kb-edit-txt" rows="2" maxlength="300">${esc(t.titulo)}</textarea><button type="button" class="kb-edit-ok">Salvar</button>`;
    const ta = tit.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ['pointerdown', 'click'].forEach(ev => tit.addEventListener(ev, x => x.stopPropagation()));
    const salvar = async () => {
      const v = ta.value.trim(); if (!v) return;
      try { await K.mudarTarefa(t.id, { titulo: v }); t.titulo = v; desenhar(); } catch (er) { showToast(er.message, 'error'); }
    };
    tit.querySelector('.kb-edit-ok').addEventListener('click', salvar);
    ta.addEventListener('keydown', (x) => { if (x.key === 'Enter' && !x.shiftKey) { x.preventDefault(); salvar(); } });
  });
  el.querySelector('[data-apagar]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmModal({ title: 'Apagar a tarefa?', message: `"${t.titulo}" sai do Kanban de vez.`, confirmText: 'Apagar', danger: true });
    if (!ok) return;
    try { await K.apagarTarefa(t.id); _tarefas = _tarefas.filter(x => x.id !== t.id); _aberto = null; desenhar(); }
    catch (er) { showToast(er.message, 'error'); }
  });
  el.querySelectorAll('.kb-det button').forEach(b => b.addEventListener('pointerdown', x => x.stopPropagation()));
}

// === BLOCO 5: ARRASTAR O CARD ===
// Segura ~0,3 s parado → o card "levanta" e segue o dedo. Chegando perto da
// borda esquerda/direita, a tela anda pra coluna do lado. Soltou: vai pra
// coluna e a posição onde está o espaço pontilhado. Mexeu o dedo antes de
// levantar = era rolagem (a tela rola normal).
const SEGURAR_MS = 300, BORDA = 44;
let _drag = null;

function _ligarCard(el) {
  const t = _tarefas.find(x => x.id === el.dataset.card); if (!t) return;
  if (_aberto === t.id) _detalheWire(el, t);
  let timer = null, x0 = 0, y0 = 0, mexeu = false;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || _drag) return;
    x0 = e.clientX; y0 = e.clientY; mexeu = false;
    timer = setTimeout(() => { timer = null; _comecarDrag(el, t, e.clientX, e.clientY); }, SEGURAR_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) { clearTimeout(timer); timer = null; mexeu = true; }
  });
  const cancela = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('pointercancel', () => { cancela(); mexeu = true; });
  el.addEventListener('pointerup', () => {
    if (timer) { cancela(); if (!mexeu) { _aberto = _aberto === t.id ? null : t.id; desenhar(); } }
  });
}

function _bloqueiaToque(e) { if (_drag) e.preventDefault(); }

function _comecarDrag(el, t, x, y) {
  const corpo = _corpo(); const tr = corpo?.querySelector('.kb-trilho'); if (!tr) return;
  navigator.vibrate?.(20);
  const r = el.getBoundingClientRect();
  const fantasma = el.cloneNode(true);
  fantasma.classList.add('kb-fantasma'); fantasma.classList.remove('aberto');
  fantasma.querySelector('.kb-det')?.remove();
  Object.assign(fantasma.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
  document.body.appendChild(fantasma);
  const vaga = document.createElement('div');
  vaga.className = 'kb-vaga'; vaga.style.height = Math.min(r.height, 64) + 'px';
  el.replaceWith(vaga);
  tr.classList.add('arrastando');
  _drag = { t, fantasma, vaga, tr, dx: x - r.left, dy: y - r.top, x, y, raf: 0 };
  document.addEventListener('touchmove', _bloqueiaToque, { passive: false });
  window.addEventListener('pointermove', _moverDrag);
  window.addEventListener('pointerup', _soltarDrag);
  window.addEventListener('pointercancel', _soltarDrag);
  _drag.raf = requestAnimationFrame(_bordaLoop);
  _posicionar();
}

function _moverDrag(e) {
  if (!_drag) return;
  _drag.x = e.clientX; _drag.y = e.clientY;
  _posicionar();
}

// Perto da borda: a tela anda sozinha (como no Trello)
function _bordaLoop() {
  if (!_drag) return;
  const { tr, x } = _drag, r = tr.getBoundingClientRect();
  if (x > r.right - BORDA) { tr.scrollLeft += 9; _posicionar(); }
  else if (x < r.left + BORDA) { tr.scrollLeft -= 9; _posicionar(); }
  _drag.raf = requestAnimationFrame(_bordaLoop);
}

function _posicionar() {
  const d = _drag; if (!d) return;
  d.fantasma.style.left = (d.x - d.dx) + 'px';
  d.fantasma.style.top = (d.y - d.dy) + 'px';
  // coluna embaixo do dedo
  const cols = [...d.tr.querySelectorAll('.kb-col')];
  let alvo = cols.find(c => { const r = c.getBoundingClientRect(); return d.x >= r.left && d.x <= r.right; });
  if (!alvo) alvo = cols.reduce((m, c) => { const r = c.getBoundingClientRect(); const dist = Math.abs(d.x - (r.left + r.width / 2)); return !m || dist < m.dist ? { c, dist } : m; }, null)?.c;
  if (!alvo) return;
  cols.forEach(c => c.classList.toggle('alvo', c === alvo));
  const lista = alvo.querySelector('.kb-lista');
  lista.querySelector('.kb-vazio')?.remove();
  if (alvo.dataset.col === 'feito') {
    // Feito é por data: entra no topo (o mais novo)
    const primeiro = lista.querySelector('.kb-dia, .kb-card');
    if (d.vaga.parentElement !== lista || d.vaga !== lista.firstElementChild) lista.insertBefore(d.vaga, primeiro);
    return;
  }
  const cards = [...lista.querySelectorAll('.kb-card')];
  const depois = cards.find(c => { const r = c.getBoundingClientRect(); return d.y < r.top + r.height / 2; });
  if (depois) { if (d.vaga.nextElementSibling !== depois) lista.insertBefore(d.vaga, depois); }
  else if (d.vaga !== lista.lastElementChild) lista.appendChild(d.vaga);
}

async function _soltarDrag() {
  const d = _drag; if (!d) return;
  _drag = null;
  cancelAnimationFrame(d.raf);
  document.removeEventListener('touchmove', _bloqueiaToque);
  window.removeEventListener('pointermove', _moverDrag);
  window.removeEventListener('pointerup', _soltarDrag);
  window.removeEventListener('pointercancel', _soltarDrag);
  d.fantasma.remove();
  const lista = d.vaga.closest('.kb-lista');
  const col = lista?.dataset.lista || d.t.coluna;
  const idxCol = K.COLUNAS.findIndex(c => c.k === col);
  // ordem pelos vizinhos do espaço pontilhado
  let ordem = d.t.ordem;
  if (col !== 'feito') {
    const viz = (el) => _tarefas.find(x => x.id === el?.dataset?.card);
    let a = d.vaga.previousElementSibling; while (a && !a.classList.contains('kb-card')) a = a.previousElementSibling;
    let b = d.vaga.nextElementSibling; while (b && !b.classList.contains('kb-card')) b = b.nextElementSibling;
    const pa = viz(a), pb = viz(b);
    ordem = pa && pb ? (pa.ordem + pb.ordem) / 2 : pa ? pa.ordem + 1 : pb ? pb.ordem - 1 : 0;
  }
  d.tr.classList.remove('arrastando');
  const mudou = col !== d.t.coluna || ordem !== d.t.ordem;
  if (!mudou) { desenhar(); return; }
  try { await K.moverTarefa(d.t, col, ordem); }
  catch (e) { showToast(e.message, 'error'); }
  desenhar(idxCol);
}
