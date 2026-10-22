// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — QUANDO MOSTRAR (Agora não / Não exibir mais)
// BLOCO 2 — PASSO A PASSO (Organização › Clareza › Decisão › Ação)
// ─────────────────────────────────────────────────────────────
// Guia do Método Falcon (Élton, 22/10): abre junto com o card do Método e
// vai perguntando; a trilha no alto acende conforme a pessoa avança.
// As respostas viram coisa de verdade: o que ela escreve entra nos Objetivos,
// o que tira some, o que escolhe vira ⭐ Prioridade.
import { adicionarItem, apagarItem, marcarPrioridade, reordenarPrioridades } from './ferramentas.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: QUANDO MOSTRAR
// ═══════════════════════════════════════════════════════════════
// "Não exibir mais": ainda aparece mais 2 vezes e depois some (pedido do Élton).
// Terminar o guia também para de abrir sozinho. Dá pra abrir de novo no ❔.
const CHAVE = 'falcon_metodo_guia';
const _ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; } };
const _gravar = (v) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

export function guiaDeveAbrir() {
  const st = _ler();
  if (st.feito) return false;
  if (st.restam == null) return true;   // nunca pediu pra parar
  return st.restam > 0;
}
// Conta uma exibição automática (só desconta depois do "Não exibir mais")
function _contarExibicao() {
  const st = _ler();
  if (st.restam != null && st.restam > 0) { st.restam--; _gravar(st); }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PASSO A PASSO
// ═══════════════════════════════════════════════════════════════
const PASSOS = ['Organização', 'Clareza', 'Decisão', 'Ação'];

// grupos: os grupos dos Objetivos já carregados; aoMudar(): repinta quem chamou;
// irPara('prioridades' | 'metas'): abre a tela certa depois de fechar.
export function abrirGuiaMetodo({ grupos = [], aoMudar = () => {}, irPara = () => {}, automatico = false } = {}) {
  if (document.getElementById('metodo-guia-ov')) return;
  if (automatico) _contarExibicao();
  let passo = 0;          // 0 = abertura, 1..4 = passos, 5 = fim
  let grupo = grupos[0]?.nome || 'Casa';
  let itens = [];         // [{ id, texto, fora, prio }]

  const ov = document.createElement('div');
  ov.className = 'mg-ov';
  ov.id = 'metodo-guia-ov';
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());

  const trilha = () => `
    <div class="mg-trilha">
      ${PASSOS.map((p, i) => `<div class="mg-passo${passo > i + 1 ? ' feito' : passo === i + 1 ? ' atual' : ''}"><b>${passo > i + 1 ? '✓' : i + 1}</b><span>${p}</span></div>`).join('<i></i>')}
    </div>`;

  // Itens que já estavam pendentes (quando a pessoa não escreve nada novo)
  const pendentesExistentes = () => {
    const out = [];
    for (const g of grupos) {
      for (const it of g.soltos) if (!it.feito) out.push(it);
      for (const s of g.secoes) for (const it of s.itens) if (!it.feito) out.push(it);
    }
    return out.slice(0, 12).map(it => ({ id: it.id, texto: it.texto, fora: false, prio: it.prioridade != null }));
  };

  function tela() {
    if (passo === 0) return `
      <div class="mg-ic">🦅</div>
      <h2>Método Falcon</h2>
      <p>Quatro passos pra tirar a bagunça da cabeça e partir pra ação:</p>
      <ol class="mg-lista-passos">
        <li><b>Organização</b>: colocar pra fora tudo que está pendente</li>
        <li><b>Clareza</b>: tirar o que não importa de verdade</li>
        <li><b>Decisão</b>: escolher o que vem primeiro</li>
        <li><b>Ação</b>: partir pra fazer</li>
      </ol>
      <p class="mg-leve">Leva uns 2 minutos. Vamos fazer juntos?</p>
      <button class="btn-primary mg-bt" data-mg="ir">Bora começar</button>
      <div class="mg-dupla">
        <button class="mg-link" data-mg="agora-nao">Agora não</button>
        <button class="mg-link" data-mg="nao-mais">Não exibir mais</button>
      </div>`;
    if (passo === 1) return `
      <h2>O que está na tua cabeça?</h2>
      <p>Escreve tudo que precisa fazer, comprar ou resolver. <b>Uma coisa por linha.</b></p>
      <textarea class="mg-txt" rows="6" placeholder="Ex.:&#10;Pagar a conta de luz&#10;Comprar tênis de corrida&#10;Ligar pro dentista" autocorrect="on" spellcheck="true" autocapitalize="sentences"></textarea>
      ${grupos.length > 1 ? `<div class="mg-rot">Guardar em:</div><div class="mg-chips">${grupos.map(g => `<button type="button" class="mg-chip${g.nome === grupo ? ' on' : ''}" data-grupo="${esc(g.nome)}">${esc(g.nome)}</button>`).join('')}</div>` : ''}
      <button class="btn-primary mg-bt" data-mg="salvar1">Continuar</button>
      <button class="mg-link" data-mg="pular1">Já tenho tudo anotado, pular</button>`;
    if (passo === 2) return `
      <h2>Agora, clareza</h2>
      <p>Olhando a lista: tem alguma coisa que <b>não importa de verdade</b>? Toca pra tirar.</p>
      <div class="mg-chips mg-chips-col">${itens.map((it, i) => `<button type="button" class="mg-item${it.fora ? ' fora' : ''}" data-fora="${i}">${it.fora ? '✕ ' : ''}${esc(it.texto)}</button>`).join('')}</div>
      <button class="btn-primary mg-bt" data-mg="salvar2">${itens.some(i => i.fora) ? 'Tirar e continuar' : 'Tudo importa, continuar'}</button>`;
    if (passo === 3) {
      const ficam = itens.filter(i => !i.fora);
      const ordem = ficam.filter(i => i.prio).sort((a, b) => a.prio - b.prio);
      return `
      <h2>Hora de decidir</h2>
      <p>O que vem <b>primeiro</b>? Toca na ordem do mais importante pro menos (pode escolher uma ou várias).</p>
      <div class="mg-chips mg-chips-col">${ficam.map(it => {
        const n = ordem.indexOf(it) + 1;
        return `<button type="button" class="mg-item${n ? ' prio' : ''}" data-prio="${itens.indexOf(it)}">${n ? `<b class="mg-num">${n}</b>` : ''}${esc(it.texto)}</button>`;
      }).join('')}</div>
      <button class="btn-primary mg-bt" data-mg="salvar3">${ordem.length ? 'Marcar como prioridade' : 'Continuar sem escolher'}</button>`;
    }
    if (passo === 4) {
      const ordem = itens.filter(i => i.prio && !i.fora).sort((a, b) => a.prio - b.prio);
      return `
      <h2>Agora é ação 🦅</h2>
      ${ordem.length ? `<p>Teu primeiro passo é:</p><div class="mg-destaque">⭐ ${esc(ordem[0].texto)}</div>
      <p>Tuas prioridades ficam no card <b>⭐ Prioridades</b>, na ordem que tu escolheu. O que tu quiser manter todo dia vira <b>Meta</b>, e eu acompanho pelo Ritual.</p>`
      : `<p>Quando decidir o que vem primeiro, toca na ☆ do lado do item nos Objetivos. O que tu quiser manter todo dia vira <b>Meta</b>, e eu acompanho pelo Ritual.</p>`}
      <button class="btn-primary mg-bt" data-mg="ver-prio">Ver minhas Prioridades</button>
      <button class="mg-bt mg-bt2" data-mg="ver-metas">Abrir Minhas Metas</button>
      <button class="mg-link" data-mg="fim">Fechar</button>`;
    }
    return '';
  }

  function desenhar() {
    ov.innerHTML = `
      <div class="mg-caixa">
        ${passo > 0 ? `<div class="mg-topo">${trilha()}<button class="mg-x" data-mg="x" aria-label="Fechar">✕</button></div>` : ''}
        <div class="mg-corpo">${tela()}</div>
      </div>`;
    ov.querySelector('.mg-txt')?.focus();
  }

  async function salvarOrganizacao(pular) {
    const linhas = pular ? [] : String(ov.querySelector('.mg-txt')?.value || '')
      .split(/\n+/).map(l => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 20);
    if (!linhas.length) {
      itens = pendentesExistentes();
      if (!itens.length) { showToast('Escreve pelo menos uma coisa pra gente seguir 😉', 'info'); return; }
      passo = 2; desenhar(); return;
    }
    const bt = ov.querySelector('[data-mg="salvar1"]'); if (bt) bt.disabled = true;
    itens = [];
    for (const texto of linhas) {
      try {
        const novo = await adicionarItem(grupo, texto, null);
        if (novo) itens.push({ id: novo.id, texto, fora: false, prio: false });
      } catch (e) { showToast(e.message, 'error'); break; }
    }
    aoMudar();
    if (!itens.length) { if (bt) bt.disabled = false; return; }
    passo = 2; desenhar();
  }

  async function salvarClareza() {
    for (const it of itens.filter(i => i.fora)) {
      try { await apagarItem(it.id); } catch (e) { showToast(e.message, 'error'); }
    }
    if (itens.some(i => i.fora)) aoMudar();
    passo = 3; desenhar();
  }

  async function salvarDecisao() {
    const ordem = itens.filter(i => i.prio && !i.fora).sort((a, b) => a.prio - b.prio);
    // Marca e põe no topo das Prioridades, na ordem escolhida
    try {
      for (const it of ordem) await marcarPrioridade(it.id, true);
      if (ordem.length) await reordenarPrioridades(ordem.map(i => i.id));
    } catch (e) { showToast(e.message, 'error'); }
    if (ordem.length) aoMudar();
    passo = 4; desenhar();
  }

  // Fecha e só depois abre a outra tela (o fechar mexe no histórico do voltar)
  const sairPara = (alvo) => { fechar(); setTimeout(() => irPara(alvo), 80); };

  ov.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-grupo]');
    if (g) { grupo = g.dataset.grupo; ov.querySelectorAll('[data-grupo]').forEach(b => b.classList.toggle('on', b === g)); return; }
    const f = e.target.closest('[data-fora]');
    if (f) { const it = itens[Number(f.dataset.fora)]; it.fora = !it.fora; desenhar(); return; }
    const p = e.target.closest('[data-prio]');
    if (p) {
      const it = itens[Number(p.dataset.prio)];
      if (it.prio) { const tirado = it.prio; it.prio = false; itens.forEach(x => { if (x.prio > tirado) x.prio--; }); }
      else it.prio = itens.filter(x => x.prio).length + 1;
      desenhar(); return;
    }
    const a = e.target.closest('[data-mg]')?.dataset.mg;
    if (!a) return;
    if (a === 'ir') { passo = 1; desenhar(); return; }
    if (a === 'agora-nao' || a === 'x') { fechar(); return; }
    if (a === 'nao-mais') {
      const st = _ler(); if (st.restam == null) st.restam = 2; _gravar(st);
      showToast('Combinado. Ele aparece só mais umas vezes e depois some. Dá pra abrir no ❔ do Método.', 'info');
      fechar(); return;
    }
    if (a === 'salvar1' || a === 'pular1') { await salvarOrganizacao(a === 'pular1'); return; }
    if (a === 'salvar2') { await salvarClareza(); return; }
    if (a === 'salvar3') { await salvarDecisao(); return; }
    if (a === 'ver-prio' || a === 'ver-metas' || a === 'fim') {
      const st = _ler(); st.feito = true; _gravar(st);
      if (a === 'fim') { fechar(); return; }
      sairPara(a === 'ver-prio' ? 'prioridades' : 'metas');
    }
  });

  desenhar();
}
