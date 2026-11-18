// ═══════════════════════════════════════════════════════════════
// VISÃO · Tela /kanban — aba do menu inferior (Élton, 18/11)
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS E ESTADO
// BLOCO 2 — RENDER (abas Pessoal/Equipe fixas, 3 colunas passando pro lado)
// BLOCO 3 — COLUNAS (rolagem lateral, bolinhas)
// BLOCO 4 — SELECIONAR E MOVER (segurar, setinha, arrastar pra ordenar)
// BLOCO 5 — EDITOR DO CARD (criar, editar, apagar)
// ─────────────────────────────────────────────────────────────
// Como funciona (combinado com o Élton):
//  • Uma coluna por tela (A fazer, Fazendo, Feito); passa pro lado.
//  • SEGURA o card → ele fica selecionado e aparece a barra com as setinhas.
//    A setinha leva o card pra coluna vizinha e a tela vai junto.
//  • Com o card selecionado, arrasta pra cima/baixo pra escolher a posição.
//    Toca nele de novo pra soltar.
//  • Toque normal (sem segurar) abre o card pra editar.
// Pessoal e Profissional = quadros só meus (coluna quadro). Equipe = etapa 2
// (convite igual o do desafio); por enquanto "em breve".

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS E ESTADO
// ═══════════════════════════════════════════════════════════════
import { bottomNav } from '../components/menu-inferior.js';
import { showToast, confirmModal } from '../aviso-tela.js';
import { trapModalBack } from '../modal-voltar.js';
import { COLUNAS, lerCards, criarCard, mudarCard, apagarCard, ordemEntre } from '../kanban.js';

let aba = 'pessoal';     // 'pessoal' | 'profissional' | 'equipe' (Élton, 18/11: 3 modalidades)
let colIdx = 0;          // coluna visível (0..2)
let cards = [];
let selId = null;        // card selecionado (segurou)
let erroSql = null;
let _app = null;

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const daColuna = (k) => cards.filter(c => c.coluna === k).sort((a, b) => a.ordem - b.ordem);

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER
// ═══════════════════════════════════════════════════════════════
export async function renderKanban(app) {
  _app = app;
  selId = null;
  app.innerHTML = `<div class="screen-pad kb-tela">
    <div class="screen-title">
      <h1>📌 Kanban</h1>
      <div class="sub">A fazer, fazendo e feito, um passo de cada vez.</div>
    </div>
    <div class="tab-switch" id="kb-abas">
      <button class="tab-btn ${aba === 'pessoal' ? 'active' : ''}" data-aba="pessoal">👤 Pessoal</button>
      <button class="tab-btn ${aba === 'profissional' ? 'active' : ''}" data-aba="profissional">💼 Profissional</button>
      <button class="tab-btn ${aba === 'equipe' ? 'active' : ''}" data-aba="equipe">👥 Equipe</button>
    </div>
    <div id="kb-corpo" class="kb-corpo"></div>
  </div>
  <div class="kb-selbar" id="kb-selbar" hidden>
    <button class="kb-seta" data-mover="-1" type="button" aria-label="Coluna anterior">‹</button>
    <div class="kb-selbar-tx"><b id="kb-sel-nome"></b><small>Arraste pra cima ou pra baixo · toque no card pra soltar</small></div>
    <button class="kb-seta" data-mover="1" type="button" aria-label="Próxima coluna">›</button>
  </div>${bottomNav('kanban')}`;

  app.querySelector('#kb-abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.dataset.aba === aba) return;
    aba = b.dataset.aba;
    app.querySelectorAll('#kb-abas .tab-btn').forEach(x => x.classList.toggle('active', x.dataset.aba === aba));
    soltar();
    carregar();
  });
  app.querySelector('#kb-selbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mover]');
    if (b) moverDeColuna(Number(b.dataset.mover));
  });

  await carregar();
}

// Lê o quadro da aba atual (Pessoal ou Profissional)
async function carregar() {
  const app = _app;
  if (aba === 'equipe') { pintarCorpo(); return; }
  const quadro = aba;
  colIdx = 0;
  pintarCorpo(true);
  try { cards = await lerCards(quadro); erroSql = null; }
  catch (e) { console.warn('[kanban]', e); erroSql = e.message; }
  if (_app === app && aba === quadro && document.contains(app.querySelector('#kb-corpo'))) pintarCorpo();
}

function pintarCorpo(carregando = false) {
  const corpo = _app?.querySelector('#kb-corpo');
  if (!corpo) return;
  if (aba === 'equipe') {
    corpo.innerHTML = `<div class="fin-vazio">👥 O Kanban da equipe está em desenvolvimento.<br>Em breve dá pra convidar a galera e todo mundo vê e move os cards juntos. 🦅</div>`;
    return;
  }
  if (carregando) { corpo.innerHTML = `<div class="fin-vazio">Carregando teu Kanban…</div>`; return; }
  if (erroSql) { corpo.innerHTML = `<div class="fin-vazio">😕 ${_esc(erroSql)}</div>`; return; }

  corpo.innerHTML = `
    <div class="kb-nav" id="kb-nav">${COLUNAS.map((c, i) => `
      <button class="kb-nav-btn ${i === colIdx ? 'on' : ''}" data-ir="${i}" type="button">${c.ic} ${c.nome} <span>${daColuna(c.k).length}</span></button>`).join('')}
    </div>
    <div class="kb-trilho" id="kb-trilho">${COLUNAS.map(c => `
      <section class="kb-col" data-col="${c.k}">
        <div class="kb-lista" data-lista="${c.k}">${daColuna(c.k).map(cardHtml).join('') || `<div class="kb-vazia">Nada aqui ainda.</div>`}</div>
        <button class="kb-novo" data-novo="${c.k}" type="button">＋ Novo card</button>
      </section>`).join('')}
    </div>`;
  ligarColunas(corpo);
}

function cardHtml(c) {
  return `<div class="kb-card ${c.id === selId ? 'sel' : ''}" data-id="${c.id}">
    <b>${_esc(c.titulo)}</b>${c.descricao ? `<small>${_esc(c.descricao)}</small>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: COLUNAS
// ═══════════════════════════════════════════════════════════════
function ligarColunas(corpo) {
  const trilho = corpo.querySelector('#kb-trilho');
  // Volta pra coluna em que estava (sem animação)
  requestAnimationFrame(() => { trilho.scrollLeft = colIdx * trilho.clientWidth; });
  let t = null;
  trilho.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(trilho.scrollLeft / Math.max(1, trilho.clientWidth));
      if (i !== colIdx) { colIdx = i; pintarNav(); }
    }, 60);
  }, { passive: true });
  corpo.querySelector('#kb-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (b) irPara(Number(b.dataset.ir));
  });
  corpo.querySelectorAll('[data-novo]').forEach(b => b.addEventListener('click', () => abrirEditor(null, b.dataset.novo)));
  corpo.querySelectorAll('.kb-card').forEach(ligarCard);
}

function irPara(i, suave = true) {
  const trilho = _app?.querySelector('#kb-trilho');
  if (!trilho) return;
  colIdx = Math.max(0, Math.min(COLUNAS.length - 1, i));
  trilho.scrollTo({ left: colIdx * trilho.clientWidth, behavior: suave ? 'smooth' : 'auto' });
  pintarNav();
}

function pintarNav() {
  _app?.querySelectorAll('.kb-nav-btn').forEach((b, i) => b.classList.toggle('on', i === colIdx));
  pintarSelbar();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: SELECIONAR E MOVER
// ═══════════════════════════════════════════════════════════════
const SEGURAR_MS = 450;

function ligarCard(el) {
  let timer = null, x0 = 0, y0 = 0, mexeu = false, segurou = false, arrastando = false;

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    x0 = e.clientX; y0 = e.clientY; mexeu = false; segurou = false; arrastando = false;
    if (el.dataset.id === selId) {
      // Card já selecionado: o dedo arrasta ele pra cima/baixo
      arrastando = true;
      el.setPointerCapture?.(e.pointerId);
      return;
    }
    timer = setTimeout(() => { segurou = true; selecionar(el.dataset.id); }, SEGURAR_MS);
  });
  el.addEventListener('pointermove', (e) => {
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { mexeu = true; clearTimeout(timer); }
    if (arrastando && mexeu) { e.preventDefault(); reposicionar(el, e.clientY); }
  });
  const fim = async () => {
    clearTimeout(timer);
    if (arrastando) {
      arrastando = false;
      if (mexeu) await salvarPosicao(el);
      else soltar();                   // toque no selecionado = solta
      return;
    }
    if (segurou || mexeu) return;
    if (selId) { soltar(); return; }   // tinha outro selecionado: só solta
    abrirEditor(cards.find(c => c.id === el.dataset.id));
  };
  el.addEventListener('pointerup', fim);
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
  const c = cards.find(x => x.id === selId);
  bar.hidden = !c || aba === 'equipe';
  if (!c) return;
  const i = COLUNAS.findIndex(k => k.k === c.coluna);
  bar.querySelector('#kb-sel-nome').textContent = c.titulo;
  bar.querySelector('[data-mover="-1"]').disabled = i <= 0;
  bar.querySelector('[data-mover="1"]').disabled = i >= COLUNAS.length - 1;
}

// Arrastando: troca de lugar com o vizinho quando o dedo passa do meio dele
function reposicionar(el, y) {
  const lista = el.parentElement;
  const irmaos = [...lista.querySelectorAll('.kb-card')].filter(x => x !== el);
  const depois = irmaos.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
  if (depois) { if (el.nextElementSibling !== depois) lista.insertBefore(el, depois); }
  else if (lista.lastElementChild !== el) lista.appendChild(el);
  // Rola a coluna se o dedo encosta na borda
  const r = lista.closest('.kb-col').getBoundingClientRect();
  const col = lista.closest('.kb-col');
  if (y < r.top + 40) col.scrollTop -= 12;
  else if (y > r.bottom - 40) col.scrollTop += 12;
}

async function salvarPosicao(el) {
  const c = cards.find(x => x.id === el.dataset.id);
  if (!c) return;
  const ant = el.previousElementSibling?.classList.contains('kb-card') ? cards.find(x => x.id === el.previousElementSibling.dataset.id) : null;
  const prox = el.nextElementSibling?.classList.contains('kb-card') ? cards.find(x => x.id === el.nextElementSibling.dataset.id) : null;
  const nova = ordemEntre(ant?.ordem ?? null, prox?.ordem ?? null);
  if (nova === c.ordem) return;
  c.ordem = nova;
  try { await mudarCard(c.id, { ordem: nova }); }
  catch (e) { showToast(e.message || 'Não consegui salvar a posição.', 'error'); }
}

// Setinha: o card vai pro topo da coluna vizinha e a tela vai junto
async function moverDeColuna(passo) {
  const c = cards.find(x => x.id === selId);
  if (!c) return;
  const i = COLUNAS.findIndex(k => k.k === c.coluna) + passo;
  if (i < 0 || i >= COLUNAS.length) return;
  const destino = COLUNAS[i].k;
  const outros = daColuna(destino);
  const antes = { coluna: c.coluna, ordem: c.ordem };
  c.coluna = destino;
  c.ordem = outros.length ? outros[0].ordem - 1 : 0;
  colIdx = i;
  pintarCorpo();
  irPara(i);
  pintarSelbar();
  try { await mudarCard(c.id, { coluna: c.coluna, ordem: c.ordem }); }
  catch (e) {
    Object.assign(c, antes);
    pintarCorpo();
    showToast(e.message || 'Não consegui mover o card.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: EDITOR DO CARD
// ═══════════════════════════════════════════════════════════════
function abrirEditor(card, colunaNova = 'afazer') {
  const novo = !card;
  let coluna = card?.coluna || colunaNova;
  const ov = document.createElement('div');
  ov.className = 'bio-modal-overlay kb-editor';
  ov.innerHTML = `<div class="bio-modal-card kb-editor-card">
    <h2 class="bio-modal-title">${novo ? '＋ Novo card' : '✏️ Editar card'}</h2>
    <input id="kb-tit" class="kb-in" maxlength="200" placeholder="O que precisa ser feito?" value="${_esc(card?.titulo || '')}">
    <textarea id="kb-desc" class="kb-in" rows="3" maxlength="2000" placeholder="Detalhes (opcional)">${_esc(card?.descricao || '')}</textarea>
    <div class="kb-cols">${COLUNAS.map(c => `<button type="button" class="kb-colbtn ${c.k === coluna ? 'on' : ''}" data-c="${c.k}">${c.ic} ${c.nome}</button>`).join('')}</div>
    <button class="bio-modal-btn primary" id="kb-salvar" type="button">${novo ? 'Criar card' : 'Salvar'}</button>
    ${novo ? '' : `<button class="bio-modal-btn ghost kb-apagar" id="kb-apagar" type="button">🗑️ Apagar card</button>`}
    <button class="bio-modal-btn ghost" id="kb-cancelar" type="button">Cancelar</button>
  </div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar?.(); });
  ov.querySelector('#kb-cancelar').onclick = () => fechar?.();
  ov.querySelectorAll('.kb-colbtn').forEach(b => b.addEventListener('click', () => {
    coluna = b.dataset.c;
    ov.querySelectorAll('.kb-colbtn').forEach(x => x.classList.toggle('on', x === b));
  }));
  setTimeout(() => ov.querySelector('#kb-tit')?.focus(), 80);

  ov.querySelector('#kb-salvar').onclick = async () => {
    const titulo = ov.querySelector('#kb-tit').value.trim();
    const descricao = ov.querySelector('#kb-desc').value.trim() || null;
    if (!titulo) { showToast('Escreve o título do card.', 'error'); return; }
    const btn = ov.querySelector('#kb-salvar');
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      if (novo) {
        cards.push(await criarCard({ titulo, descricao, coluna, quadro: aba }, cards));
      } else {
        const patch = { titulo, descricao };
        if (coluna !== card.coluna) {
          const outros = daColuna(coluna);
          patch.coluna = coluna;
          patch.ordem = outros.length ? outros[0].ordem - 1 : 0;
        }
        await mudarCard(card.id, patch);
        Object.assign(card, patch);
      }
      fechar?.();
      colIdx = COLUNAS.findIndex(c => c.k === coluna);
      pintarCorpo();
    } catch (e) {
      btn.disabled = false; btn.textContent = novo ? 'Criar card' : 'Salvar';
      showToast(e.message || 'Não consegui salvar.', 'error');
    }
  };

  ov.querySelector('#kb-apagar')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Apagar card?', message: `"${card.titulo}" some do teu Kanban.`, confirmText: 'Apagar', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    try {
      await apagarCard(card.id);
      cards = cards.filter(x => x.id !== card.id);
      fechar?.();
      pintarCorpo();
    } catch (e) { showToast(e.message || 'Não consegui apagar.', 'error'); }
  });
}

// Pet mexeu no Kanban por fora: recarrega se a tela estiver aberta
export async function recarregarKanban() {
  if (!_app || !document.contains(_app.querySelector('#kb-corpo'))) return;
  if (aba === 'equipe') return;
  try { cards = await lerCards(aba); erroSql = null; } catch (e) { erroSql = e.message; }
  pintarCorpo();
}
