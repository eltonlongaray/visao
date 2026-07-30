// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — POPUP (grupos → itens/seções)
// BLOCO 3 — WIRES
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  carregarFerramentas, adicionarItem, marcarItem, editarItem, apagarItem,
  limparFeitos, renomearGrupo, contarPendentes,
  adicionarSecao, renomearSecao, apagarSecao, criarGrupo, apagarGrupo,
} from './ferramentas.js';
import { showToast, confirmModal } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Seta de voltar — mesmo desenho da comunidade.
const SVG_VOLTAR = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>`;

let grupos = [];
let grupoAberto = null;   // nome do grupo aberto; null = lista de grupos

// Sugestões de categoria por grupo (a pessoa escreve OU toca numa sugestão).
const SUGESTOES = {
  Casa:     ['Cozinha', 'Mercado', 'Limpeza', 'Contas', 'Conserto'],
  Pessoal:  ['Saúde', 'Estudos', 'Documentos', 'Compras', 'Metas'],
  Trabalho: ['Reuniões', 'Projetos', 'E-mails', 'Ideias', 'Prazos'],
  Família:  ['Filhos', 'Compromissos', 'Compras', 'Casa'],
  Amigos:   ['Rolês', 'Aniversários', 'Combinar'],
  Academia: ['Peito', 'Costas', 'Pernas', 'Braços', 'Ombros', 'Abdômen'],
};
const SUGESTOES_GERAIS = ['A comprar', 'A ligar', 'A resolver', 'Ideias', 'Importante'];

const _pendGrupo = (g) =>
  g.soltos.filter(i => !i.feito).length + g.secoes.reduce((n, s) => n + s.itens.filter(i => !i.feito).length, 0);

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: POPUP
// ═══════════════════════════════════════════════════════════════
export async function abrirFerramentas() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'ferramentas-ov';
  ov.innerHTML = `<div class="modal fr-modal"><div class="fr-corpo"><div class="fr-carregando">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });

  try { grupos = await carregarFerramentas(); }
  catch (e) { ov.querySelector('.fr-corpo').innerHTML = `<div class="fr-vazio">Não deu pra carregar: ${esc(e.message)}</div>`; return; }
  grupoAberto = null;
  desenhar();
}

function fechar() { document.getElementById('ferramentas-ov')?.remove(); }

function desenhar() {
  const corpo = document.querySelector('#ferramentas-ov .fr-corpo');
  if (!corpo) return;
  corpo.innerHTML = grupoAberto ? telaItens() : telaGrupos();
}

// ── ícone do grupo num círculo colorido ──
// svg pega a cor do círculo (currentColor); emoji fica como está.
function icone(g) {
  const dentro = g.svg
    ? `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" style="display:block">${g.svg}</svg>`
    : esc(g.icone || '📌');
  return `<span class="fr-ic-circ" style="background:${g.cor}22;color:${g.cor}">${dentro}</span>`;
}

// ── Lista de grupos ──
function telaGrupos() {
  return `
    <div class="fr-cab">
      <span class="fr-titulo">🛠️ Caixa de Ferramentas</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>
    <div class="fr-sub">Coisas que você precisa fazer, sem data nem hora. Toque num grupo.</div>
    <div class="fr-grupos">
      ${grupos.map(g => {
        const pend = _pendGrupo(g);
        return `
        <button class="fr-grupo" data-grupo="${esc(g.nome)}">
          ${icone(g)}
          <span class="fr-grupo-nome">${esc(g.nome)}</span>
          ${pend ? `<span class="fr-grupo-badge">${pend}</span>` : ''}
        </button>`;
      }).join('')}
      <button class="fr-grupo fr-grupo-novo" data-novo-grupo>
        <span class="fr-ic-circ fr-ic-novo">＋</span>
        <span class="fr-grupo-nome">Novo grupo</span>
      </button>
    </div>`;
}

// ── linha de item (checkbox + texto + apagar) ──
function linhaItem(i) {
  return `
    <div class="fr-item ${i.feito ? 'feito' : ''}" data-id="${i.id}">
      <button class="fr-check" data-marcar="${i.id}" aria-label="Marcar">${i.feito ? '✓' : ''}</button>
      <span class="fr-texto" data-editar="${i.id}">${esc(i.texto)}</span>
      <button class="fr-item-x" data-apagar="${i.id}" aria-label="Apagar">✕</button>
    </div>`;
}

// ── bloco de uma lista (pendentes + concluídos), reusado em soltos e seções ──
function bloco(itens, vazioTxt) {
  const pend = itens.filter(i => !i.feito), feitos = itens.filter(i => i.feito);
  return `
    ${pend.length ? pend.map(linhaItem).join('') : (vazioTxt ? `<div class="fr-vazio-grupo">${vazioTxt}</div>` : '')}
    ${feitos.length ? feitos.map(linhaItem).join('') : ''}`;
}

// ── form de adicionar (solto = data-secao vazio; ou de uma seção) ──
function formNova(secaoId, ph) {
  return `
    <form class="fr-nova" data-nova data-secao="${secaoId || ''}">
      <input class="fr-nova-input" placeholder="${esc(ph)}" maxlength="500" autocomplete="off" />
      <button type="submit" class="fr-nova-btn" aria-label="Adicionar">＋</button>
    </form>`;
}

// ── Itens de um grupo (soltos + seções) ──
function telaItens() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g) { grupoAberto = null; return telaGrupos(); }

  const secoesHtml = g.secoes.map(sec => `
    <div class="fr-secao" data-secao-id="${sec.id}">
      <div class="fr-secao-cab">
        <span class="fr-secao-nome" data-editar-secao="${sec.id}">${esc(sec.nome)}</span>
        <button class="fr-secao-x" data-apagar-secao="${sec.id}" aria-label="Apagar seção">🗑</button>
      </div>
      ${formNova(sec.id, 'Adicionar em ' + sec.nome + '…')}
      <div class="fr-lista">${bloco(sec.itens, 'Vazio por enquanto.')}</div>
    </div>`).join('');

  const totalFeitos = g.soltos.filter(i => i.feito).length + g.secoes.reduce((n, s) => n + s.itens.filter(i => i.feito).length, 0);

  return `
    <div class="fr-cab">
      <button class="fr-voltar" data-voltar aria-label="Voltar">${SVG_VOLTAR}</button>
      <span class="fr-titulo">${icone(g)} ${esc(g.nome)}</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>

    <div class="fr-scroll">
      ${formNova('', 'Adicionar item…')}
      <div class="fr-lista">${bloco(g.soltos, '')}</div>

      <button class="fr-add-secao" data-nova-secao>＋ Adicionar categoria</button>

      ${secoesHtml}

      <div class="fr-rodape">
        ${totalFeitos ? `<button class="fr-limpar" data-limpar>Limpar concluídos (${totalFeitos})</button>` : ''}
        <button class="fr-renomear" data-renomear>✏️ Renomear grupo</button>
        ${g.custom ? `<button class="fr-apagar-grupo" data-apagar-grupo>🗑 Apagar grupo</button>` : ''}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: WIRES — delegados no overlay
// ═══════════════════════════════════════════════════════════════
let ligado = false;
export function ligarFerramentas() {
  if (ligado) return;
  ligado = true;

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#ferramentas-ov')) return;

    if (e.target.closest('[data-fechar]')) { fechar(); return; }
    if (e.target.closest('[data-voltar]')) { grupoAberto = null; desenhar(); return; }

    const abrir = e.target.closest('[data-grupo]');
    if (abrir) { grupoAberto = abrir.dataset.grupo; desenhar(); return; }

    if (e.target.closest('[data-novo-grupo]')) { await novoGrupo(); return; }
    if (e.target.closest('[data-nova-secao]')) { await novaSecao(); return; }

    const mk = e.target.closest('[data-marcar]');
    if (mk) {
      const it = _item(mk.dataset.marcar);
      if (it) { it.feito = !it.feito; desenhar(); await _salvarMarca(it); }
      return;
    }

    const ap = e.target.closest('[data-apagar]');
    if (ap) {
      _removerItemLocal(ap.dataset.apagar); desenhar();
      try { await apagarItem(ap.dataset.apagar); } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const ed = e.target.closest('[data-editar]');
    if (ed) { await editarInline(ed.dataset.editar); return; }

    const edS = e.target.closest('[data-editar-secao]');
    if (edS) { await renomearSecaoUI(edS.dataset.editarSecao); return; }

    const apS = e.target.closest('[data-apagar-secao]');
    if (apS) { await apagarSecaoUI(apS.dataset.apagarSecao); return; }

    if (e.target.closest('[data-limpar]')) { await limpar(); return; }
    if (e.target.closest('[data-renomear]')) { await renomear(); return; }
    if (e.target.closest('[data-apagar-grupo]')) { await apagarGrupoUI(); return; }
  });

  // adicionar item — cada form (soltos ou seção) traz seu próprio input e data-secao
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-nova]');
    if (!form || !form.closest('#ferramentas-ov')) return;
    e.preventDefault();
    const campo = form.querySelector('.fr-nova-input');
    const texto = campo.value.trim();
    if (!texto || !grupoAberto) return;
    const secaoId = form.dataset.secao || null;
    campo.value = '';
    try {
      const novo = await adicionarItem(grupoAberto, texto, secaoId);
      const g = grupos.find(x => x.nome === grupoAberto);
      if (g && novo) {
        if (secaoId) { const s = g.secoes.find(x => x.id === secaoId); s?.itens.push(novo); }
        else g.soltos.push(novo);
      }
      desenhar();
    } catch (err) { campo.value = texto; showToast(err.message, 'error'); }
  });
}

// ── auxiliares ──
function _item(id) {
  for (const g of grupos) {
    const s = g.soltos.find(i => i.id === id); if (s) return s;
    for (const sec of g.secoes) { const it = sec.itens.find(i => i.id === id); if (it) return it; }
  }
  return null;
}
function _removerItemLocal(id) {
  for (const g of grupos) {
    g.soltos = g.soltos.filter(i => i.id !== id);
    for (const sec of g.secoes) sec.itens = sec.itens.filter(i => i.id !== id);
  }
}
async function _salvarMarca(it) {
  try { await marcarItem(it.id, it.feito); }
  catch (e) { it.feito = !it.feito; desenhar(); showToast(e.message, 'error'); }
}

async function editarInline(id) {
  const it = _item(id);
  if (!it) return;
  const novo = prompt('Editar item:', it.texto);
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === it.texto) return;
  it.texto = t; desenhar();
  try { await editarItem(id, t); } catch (e) { showToast(e.message, 'error'); }
}

// Mini-modal: escrever a categoria OU tocar numa sugestão. Resolve com o nome
// escolhido (ou null se cancelar).
function pedirCategoria(grupoNome) {
  return new Promise((resolve) => {
    const sugs = SUGESTOES[grupoNome] || SUGESTOES_GERAIS;
    const ov = document.createElement('div');
    ov.className = 'fr-mini-ov';
    ov.innerHTML = `
      <div class="fr-mini">
        <div class="fr-mini-tit">Nova categoria</div>
        <input class="fr-mini-input" id="fr-cat-input" placeholder="Escreva a categoria…" maxlength="60" autocomplete="off" />
        <div class="fr-mini-sugs">
          ${sugs.map(s => `<button type="button" class="fr-sug" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
        <div class="fr-mini-acoes">
          <button type="button" class="fr-mini-cancel" data-cat-cancelar>Cancelar</button>
          <button type="button" class="fr-mini-ok" data-cat-ok>Criar</button>
        </div>
      </div>`;
    document.getElementById('ferramentas-ov')?.appendChild(ov);
    const input = ov.querySelector('#fr-cat-input');
    setTimeout(() => input?.focus(), 30);
    const fim = (val) => { ov.remove(); resolve(val); };
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-cat-cancelar]')) return fim(null);
      const sug = e.target.closest('[data-sug]');
      if (sug) { input.value = sug.dataset.sug; input.focus(); return; }
      if (e.target.closest('[data-cat-ok]')) { const t = input.value.trim(); return t ? fim(t) : input.focus(); }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const t = input.value.trim(); if (t) fim(t); }
    });
  });
}

async function novaSecao() {
  const n = await pedirCategoria(grupoAberto);
  if (!n) return;
  const g = grupos.find(x => x.nome === grupoAberto);
  try {
    const s = await adicionarSecao(grupoAberto, n);
    if (g && s) g.secoes.push({ id: s.id, nome: s.nome, itens: [] });
    desenhar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function renomearSecaoUI(id) {
  const g = grupos.find(x => x.nome === grupoAberto);
  const sec = g?.secoes.find(s => s.id === id);
  if (!sec) return;
  const novo = prompt('Renomear seção:', sec.nome);
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === sec.nome) return;
  sec.nome = t; desenhar();
  try { await renomearSecao(id, t); } catch (e) { showToast(e.message, 'error'); }
}

async function apagarSecaoUI(id) {
  const g = grupos.find(x => x.nome === grupoAberto);
  const sec = g?.secoes.find(s => s.id === id);
  if (!sec) return;
  const ok = await confirmModal({
    title: `Apagar "${sec.nome}"?`,
    message: 'A seção e os itens dentro dela serão apagados.',
    confirmText: 'Apagar', cancelText: 'Manter', danger: true,
  });
  if (!ok) return;
  g.secoes = g.secoes.filter(s => s.id !== id); desenhar();
  try { await apagarSecao(id); } catch (e) { showToast(e.message, 'error'); }
}

async function limpar() {
  const g = grupos.find(x => x.nome === grupoAberto);
  const ok = await confirmModal({
    title: 'Limpar concluídos?',
    message: 'Os itens já riscados deste grupo serão apagados.',
    confirmText: 'Limpar', cancelText: 'Manter', danger: true,
  });
  if (!ok) return;
  if (g) { g.soltos = g.soltos.filter(i => !i.feito); g.secoes.forEach(s => s.itens = s.itens.filter(i => !i.feito)); }
  desenhar();
  try { await limparFeitos(grupoAberto); } catch (err) { showToast(err.message, 'error'); }
}

async function renomear() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g) return;
  const novo = prompt('Renomear grupo:', g.nome);
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === g.nome) return;
  const de = g.nome;
  g.nome = t; grupoAberto = t; desenhar();
  try { await renomearGrupo(de, t); } catch (e) { showToast(e.message, 'error'); }
}

async function novoGrupo() {
  const nome = prompt('Nome do novo grupo:', '');
  if (nome == null) return;
  const n = nome.trim();
  if (!n) return;
  if (grupos.some(g => g.nome.toLowerCase() === n.toLowerCase())) { showToast('Já existe um grupo com esse nome.', 'info'); return; }
  try {
    const novo = await criarGrupo(n);
    if (novo) grupos.push({ nome: novo.nome, icone: novo.icone || '📌', cor: '#60a5fa', custom: true, grupoId: novo.id, soltos: [], secoes: [] });
    desenhar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function apagarGrupoUI() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g || !g.custom) return;
  const ok = await confirmModal({
    title: `Apagar o grupo "${g.nome}"?`,
    message: 'O grupo e tudo dentro dele (seções e itens) serão apagados.',
    confirmText: 'Apagar', cancelText: 'Manter', danger: true,
  });
  if (!ok) return;
  grupos = grupos.filter(x => x !== g); grupoAberto = null; desenhar();
  try { await apagarGrupo(g.grupoId, g.nome); } catch (e) { showToast(e.message, 'error'); }
}

// Badge do card na Home (número de pendentes).
export async function pintarBadgeFerramentas() {
  try {
    const n = await contarPendentes();
    const dot = document.getElementById('ferramentas-dot');
    if (dot) { dot.textContent = n > 0 ? n : ''; dot.style.display = n > 0 ? '' : 'none'; }
  } catch { /* badge é acessório */ }
}
