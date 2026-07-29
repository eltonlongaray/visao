// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — POPUP (grupos → itens)
// BLOCO 3 — WIRES
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  carregarFerramentas, adicionarItem, marcarItem, editarItem,
  apagarItem, limparFeitos, renomearGrupo, contarPendentes,
} from './ferramentas.js';
import { showToast, confirmModal } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let grupos = [];
let grupoAberto = null;   // nome do grupo aberto dentro do popup; null = lista de grupos

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

// ── Lista de grupos ──
function telaGrupos() {
  return `
    <div class="fr-cab">
      <span class="fr-titulo">🧰 Caixa de Ferramentas</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>
    <div class="fr-sub">Coisas que você precisa fazer, sem data nem hora. Toque num grupo.</div>
    <div class="fr-grupos">
      ${grupos.map(g => {
        const pend = g.itens.filter(i => !i.feito).length;
        return `
        <button class="fr-grupo" data-grupo="${esc(g.nome)}">
          <span class="fr-grupo-ic">${esc(g.icone || '📌')}</span>
          <span class="fr-grupo-nome">${esc(g.nome)}</span>
          ${pend ? `<span class="fr-grupo-badge">${pend}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`;
}

// ── Itens de um grupo ──
function telaItens() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g) { grupoAberto = null; return telaGrupos(); }
  const pendentes = g.itens.filter(i => !i.feito);
  const feitos = g.itens.filter(i => i.feito);
  const linha = (i) => `
    <div class="fr-item ${i.feito ? 'feito' : ''}" data-id="${i.id}">
      <button class="fr-check" data-marcar="${i.id}" aria-label="Marcar">${i.feito ? '✓' : ''}</button>
      <span class="fr-texto" data-editar="${i.id}">${esc(i.texto)}</span>
      <button class="fr-item-x" data-apagar="${i.id}" aria-label="Apagar">✕</button>
    </div>`;

  return `
    <div class="fr-cab">
      <button class="fr-voltar" data-voltar aria-label="Voltar">←</button>
      <span class="fr-titulo">${esc(g.icone || '📌')} ${esc(g.nome)}</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>

    <form class="fr-nova" data-nova>
      <input class="fr-nova-input" id="fr-nova-input" placeholder="Adicionar item…" maxlength="500" autocomplete="off" />
      <button type="submit" class="fr-nova-btn" aria-label="Adicionar">＋</button>
    </form>

    <div class="fr-lista">
      ${pendentes.length ? pendentes.map(linha).join('')
        : '<div class="fr-vazio-grupo">Nada pendente aqui. Adicione acima.</div>'}
      ${feitos.length ? `
        <div class="fr-feitos-cab">
          <span>Concluídos (${feitos.length})</span>
          <button class="fr-limpar" data-limpar>Limpar</button>
        </div>
        ${feitos.map(linha).join('')}` : ''}
    </div>

    <button class="fr-renomear" data-renomear>✏️ Renomear grupo</button>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: WIRES — delegados no overlay
// ═══════════════════════════════════════════════════════════════
// Um handler no documento cobre o popup inteiro. Registrado uma vez.
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

    const mk = e.target.closest('[data-marcar]');
    if (mk) {
      const it = _item(mk.dataset.marcar);
      if (it) { it.feito = !it.feito; desenhar(); await _salvarMarca(it); }
      return;
    }

    const ap = e.target.closest('[data-apagar]');
    if (ap) {
      const id = ap.dataset.apagar;
      _removerLocal(id); desenhar();
      try { await apagarItem(id); } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const ed = e.target.closest('[data-editar]');
    if (ed) { await editarInline(ed.dataset.editar); return; }

    if (e.target.closest('[data-limpar]')) {
      const g = grupos.find(x => x.nome === grupoAberto);
      const ok = await confirmModal({
        title: 'Limpar concluídos?',
        message: 'Os itens já riscados deste grupo serão apagados.',
        confirmText: 'Limpar', cancelText: 'Manter', danger: true,
      });
      if (!ok) return;
      if (g) g.itens = g.itens.filter(i => !i.feito);
      desenhar();
      try { await limparFeitos(grupoAberto); } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    if (e.target.closest('[data-renomear]')) { await renomear(); return; }
  });

  // adicionar item (form submit)
  document.addEventListener('submit', async (e) => {
    if (!e.target.closest('[data-nova]')) return;
    e.preventDefault();
    const campo = document.getElementById('fr-nova-input');
    const texto = campo.value.trim();
    if (!texto || !grupoAberto) return;
    campo.value = '';
    try {
      const novo = await adicionarItem(grupoAberto, texto);
      const g = grupos.find(x => x.nome === grupoAberto);
      if (g && novo) g.itens.push(novo);
      desenhar();
    } catch (err) { campo.value = texto; showToast(err.message, 'error'); }
  });
}

// ── auxiliares ──
function _item(id) {
  for (const g of grupos) { const it = g.itens.find(i => i.id === id); if (it) return it; }
  return null;
}
function _removerLocal(id) {
  for (const g of grupos) g.itens = g.itens.filter(i => i.id !== id);
}
async function _salvarMarca(it) {
  try { await marcarItem(it.id, it.feito); }
  catch (e) { it.feito = !it.feito; desenhar(); showToast(e.message, 'error'); }
}

async function editarInline(id) {
  const it = _item(id);
  if (!it) return;
  const novo = prompt('Editar item:', it.texto);   // simples e suficiente pra um recado
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === it.texto) return;
  it.texto = t; desenhar();
  try { await editarItem(id, t); } catch (e) { showToast(e.message, 'error'); }
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

// Badge do card na Home (número de pendentes).
export async function pintarBadgeFerramentas() {
  try {
    const n = await contarPendentes();
    const dot = document.getElementById('ferramentas-dot');
    if (dot) { dot.textContent = n > 0 ? n : ''; dot.style.display = n > 0 ? '' : 'none'; }
  } catch { /* badge é acessório */ }
}
