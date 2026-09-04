// ─── ÍNDICE ──────────────────────────────────────────────────
// Hub "Rifa Solidária" (lado do DONO). Lista as rifas do usuário, cria/edita
// (as perguntas certas pra montar tudo), mostra o link pra compartilhar, quem
// pegou cada número (nome+WhatsApp) e o SORTEIO AO VIVO (aleatório ou manual).
// Pagamento = chave Pix do próprio criador (ele confirma quem pagou).
// ─────────────────────────────────────────────────────────────
import {
  getMinhasRifas, criarRifa, atualizarRifa, excluirRifa,
  getParticipantes, marcarPago, removerParticipante, sortearPremio, definirStatusSorteio,
  getMpConta, iniciarConexaoMp, desconectarMp,
} from './rifas.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const WA_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg>';

let _rifas = [], _sel = null, _parts = [], _premios = [], _close = null, _mpConta = null;

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _preco = v => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
const _pad2 = n => String(n).padStart(2, '0');
function _waLink(zap, msg) {
  let d = String(zap || '').replace(/\D/g, ''); if (!d) return null;
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
}
// timestamptz ↔ valor do <input type="datetime-local"> (hora local).
function _toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}T${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
}
const _fromLocalInput = s => (s ? new Date(s).toISOString() : null);
function _fmtSorteio(iso) {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d)) return null;
  return `${_pad2(d.getDate())}/${_pad2(d.getMonth() + 1)}/${d.getFullYear()} às ${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
}
const _linkDe = slug => `${location.origin}/rifa/${slug}`;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: ABRIR + LISTA
// ═══════════════════════════════════════════════════════════════
export async function abrirRifas() {
  _sel = null; _parts = []; _premios = [];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'rifas-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo rf-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) _close?.(); });
  _close = trapModalBack(() => ov.remove());
  try { [_rifas, _mpConta] = await Promise.all([getMinhasRifas(), getMpConta().catch(() => ({ connected: false }))]); }
  catch (e) {
    const c = ov.querySelector('.ag-corpo');
    if (c) c.innerHTML = `<div class="ag-erro">Não deu pra carregar suas rifas.<br><small>${_esc(e.message)}</small><br><br><small>Se aparecer erro de tabela/coluna, falta rodar o SQL <b>rifa-self-service.sql</b> no Supabase.</small></div>`;
    return;
  }
  desenharLista();
}

function _corpo() { return document.querySelector('#rifas-ov .rf-corpo'); }

function desenharLista() {
  const corpo = _corpo(); if (!corpo) return;
  corpo.innerHTML = `
    <div class="ag-header">
      <div class="ag-title">🎟️ Rifa Solidária</div>
      <button class="ag-fechar" id="rf-close" type="button">Fechar</button>
    </div>
    <div class="ag-scroll">
      <div class="rf-intro">Crie sua rifa, compartilhe o link e acompanhe quem escolheu cada número. O pagamento cai direto na <b>sua chave Pix</b>.</div>
      <button class="btn-primary rf-nova-btn" id="rf-nova" type="button">➕ Criar nova rifa</button>
      <div class="rf-minhas" id="rf-minhas">
        ${_rifas.length ? _rifas.map(r => `
          <button class="rf-card-mini" data-rifa="${_esc(r.id)}" type="button">
            <div class="rf-card-mini-top">
              <span class="rf-card-mini-nome">${_esc(r.titulo || 'Rifa')}</span>
              <span class="rf-card-mini-tag ${r.ativo ? 'on' : 'off'}">${r.ativo ? 'ativa' : 'pausada'}</span>
            </div>
            <div class="rf-card-mini-sub">${r.total_numeros || 0} números${r.valor_numero ? ` · R$ ${_preco(r.valor_numero)} cada` : ''}${r.sorteio_status === 'encerrado' ? ' · ✅ sorteada' : ''}</div>
          </button>`).join('') : '<div class="ag-vazio">Você ainda não tem rifas. Crie a primeira! 🎟️</div>'}
      </div>
    </div>`;
  corpo.querySelector('#rf-close').onclick = () => _close?.();
  corpo.querySelector('#rf-nova').onclick = () => abrirEditor(null);
  corpo.querySelectorAll('[data-rifa]').forEach(b => b.onclick = () => {
    abrirEditor(_rifas.find(r => r.id === b.dataset.rifa));
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: EDITOR (criar / editar uma rifa)
// ═══════════════════════════════════════════════════════════════
async function abrirEditor(rifa) {
  _sel = rifa ? { ...rifa } : _novaRifaVazia();
  _premios = Array.isArray(_sel.premios) ? _sel.premios.slice() : [];
  _parts = [];
  if (rifa?.id) { try { _parts = await getParticipantes(rifa.id); } catch {} }
  desenharEditor();
}

function _novaRifaVazia() {
  return { id: null, titulo: '', subtitulo: '', descricao: '', total_numeros: 100,
    valor_numero: '', valor_meta: '', sorteio_em: '', whatsapp: '', premios: [],
    pix_chave: '', pix_nome: '', pix_cidade: '', sorteio_status: 'agendado', ativo: true };
}

function desenharEditor() {
  const corpo = _corpo(); if (!corpo) return;
  const r = _sel, novo = !r.id;
  corpo.innerHTML = `
    <div class="ag-header">
      <button class="rf-voltar" id="rf-back" type="button">‹ Minhas rifas</button>
      <button class="ag-fechar" id="rf-close" type="button">Fechar</button>
    </div>
    <div class="ag-scroll">
      <div class="ag-title" style="margin:2px 0 12px">${novo ? '🎟️ Nova rifa' : '✏️ ' + _esc(r.titulo || 'Rifa')}</div>

      <div class="rf-sec-lbl">📝 Sobre a rifa</div>
      <label class="input-field"><div class="input-field-label">Título *</div>
        <input id="rf-titulo" value="${_esc(r.titulo || '')}" placeholder="Ex: Rifa Solidária pelo Pitter"></label>
      <label class="input-field"><div class="input-field-label">Subtítulo <span class="ag-lbl-opt">— uma linha de chamada</span></div>
        <input id="rf-subtitulo" value="${_esc(r.subtitulo || '')}" placeholder="Ex: Ajude o Pitter a voltar a andar"></label>
      <label class="input-field"><div class="input-field-label">História / descrição <span class="ag-lbl-opt">— explique a causa</span></div>
        <textarea id="rf-descricao" rows="4" placeholder="Conte a história e por que a rifa está sendo feita.">${_esc(r.descricao || '')}</textarea></label>

      <div class="rf-sec-lbl">🎟️ Números e valor</div>
      <div class="ag-frow">
        <label class="input-field" style="flex:1"><div class="input-field-label">Quantos números</div>
          <input id="rf-total" type="number" inputmode="numeric" min="1" step="1" value="${r.total_numeros || 100}"></label>
        <label class="input-field" style="flex:1"><div class="input-field-label">R$ por número</div>
          <input id="rf-valor" type="text" inputmode="decimal" value="${_preco(r.valor_numero)}" placeholder="10,00"></label>
      </div>
      <label class="input-field"><div class="input-field-label">Meta de arrecadação (R$) <span class="ag-lbl-opt">— opcional</span></div>
        <input id="rf-meta" type="text" inputmode="decimal" value="${_preco(r.valor_meta)}" placeholder="Ex: 3420,00"></label>

      <div class="rf-sec-lbl">🏆 Prêmios</div>
      <div class="rf-premios-ed" id="rf-premios"></div>
      <button class="ag-serv-add-btn" id="rf-premio-add" type="button">➕ Adicionar prêmio</button>

      <div class="rf-sec-lbl">💳 Como você recebe</div>
      ${_pagamentoHtml(r)}

      <div class="rf-sec-lbl">📅 Sorteio ao vivo</div>
      <label class="input-field"><div class="input-field-label">Data e hora do sorteio</div>
        <input id="rf-sorteio" type="datetime-local" value="${_toLocalInput(r.sorteio_em)}"></label>
      <label class="input-field"><div class="input-field-label">💬 Seu WhatsApp <span class="ag-lbl-opt">— botão de contato no link</span></div>
        <input id="rf-whatsapp" inputmode="tel" value="${_esc(r.whatsapp || '')}" placeholder="(DDD) 9 9999-9999"></label>

      <label class="ag-ativar" style="margin-top:14px">
        <input type="checkbox" id="rf-ativo" ${r.ativo ? 'checked' : ''}>
        <span><b>Rifa ativa</b> — ligada, o link funciona e as pessoas podem escolher números.</span>
      </label>

      ${novo ? '' : `
      <div class="rf-sec-lbl">🔗 Link pra compartilhar</div>
      <div class="ag-link-box">
        <input id="rf-link" readonly value="${_esc(_linkDe(r.slug))}">
        <button id="rf-copiar" class="btn-secondary" type="button">Copiar</button>
      </div>
      ${_participantesHtml()}
      ${_sorteioHtml()}`}
    </div>
    <div class="ag-rodape">
      ${novo ? '' : '<button class="rf-excluir-btn" id="rf-excluir" type="button">🗑</button>'}
      <button class="btn-primary" id="rf-salvar" type="button" style="flex:1">${novo ? 'Criar rifa' : 'Salvar'}</button>
    </div>`;
  pintarPremios();
  wireEditor(corpo);
}

// ── Pagamento: Mercado Pago automático × chave Pix do criador ──
function _pagamentoHtml(r) {
  const modo = r.pix_modo === 'mp_connect' ? 'mp_connect' : 'estatico';
  const conectado = !!_mpConta?.connected;
  return `
    <div class="rf-modo">
      <label class="rf-modo-op ${modo === 'mp_connect' ? 'on' : ''}">
        <input type="radio" name="rf-modo" value="mp_connect" ${modo === 'mp_connect' ? 'checked' : ''}>
        <span><b>⚡ Mercado Pago</b><small>Confirma sozinho — cai direto na sua conta MP</small></span>
      </label>
      <label class="rf-modo-op ${modo === 'estatico' ? 'on' : ''}">
        <input type="radio" name="rf-modo" value="estatico" ${modo === 'estatico' ? 'checked' : ''}>
        <span><b>🔑 Minha chave Pix</b><small>Você confere e marca quem pagou</small></span>
      </label>
    </div>
    <div id="rf-modo-mp" ${modo === 'mp_connect' ? '' : 'hidden'}>
      ${conectado
        ? `<div class="rf-dica-box">✅ <b>Mercado Pago conectado.</b> Os pagamentos caem direto na sua conta e o app confirma automático.</div>
           <button class="ag-linkbtn danger" id="rf-mp-desc" type="button">Desconectar Mercado Pago</button>`
        : `<div class="rf-dica-box">Conecte sua conta do Mercado Pago <b>uma vez</b>. Depois toda rifa sua pode receber e confirmar sozinha.</div>
           <button class="btn-primary" id="rf-mp-conectar" type="button">⚡ Conectar meu Mercado Pago</button>`}
    </div>
    <div id="rf-modo-est" ${modo === 'estatico' ? '' : 'hidden'}>
      <div class="rf-dica-box">O dinheiro cai direto na sua chave Pix. Você confirma quem pagou em "Participantes".</div>
      <label class="input-field"><div class="input-field-label">Sua chave Pix *</div>
        <input id="rf-pix" value="${_esc(r.pix_chave || '')}" placeholder="Telefone, e-mail, CPF ou chave aleatória"></label>
      <div class="ag-frow">
        <label class="input-field" style="flex:1"><div class="input-field-label">Nome no Pix</div>
          <input id="rf-pixnome" value="${_esc(r.pix_nome || '')}" placeholder="Seu nome"></label>
        <label class="input-field" style="flex:1"><div class="input-field-label">Cidade</div>
          <input id="rf-pixcidade" value="${_esc(r.pix_cidade || '')}" placeholder="Ex: Porto Alegre"></label>
      </div>
    </div>`;
}

// ── Prêmios (lista dinâmica) ───────────────────────────────────
function pintarPremios() {
  const box = document.querySelector('#rf-premios'); if (!box) return;
  box.innerHTML = _premios.length ? _premios.map((p, i) => `
    <div class="rf-premio-row" data-i="${i}">
      <span class="rf-premio-n">${i + 1}º</span>
      <input class="rf-premio-in" value="${_esc(p)}" placeholder="Ex: Massagem relaxante">
      <button class="ag-serv-x" data-rm-premio="${i}" type="button" aria-label="Remover">✕</button>
    </div>`).join('') : '<div class="ag-serv-vazio">Sem prêmios ainda (opcional).</div>';
  box.querySelectorAll('[data-rm-premio]').forEach(b => b.onclick = () => {
    _syncPremios(); _premios.splice(+b.dataset.rmPremio, 1); pintarPremios();
  });
}
function _syncPremios() {
  const box = document.querySelector('#rf-premios'); if (!box) return;
  box.querySelectorAll('.rf-premio-row').forEach(row => { _premios[+row.dataset.i] = row.querySelector('.rf-premio-in').value; });
}

// ── Participantes (quem pegou cada número) ─────────────────────
function _participantesHtml() {
  const pagos = _parts.filter(p => p.pago).length;
  const arrec = _sel.valor_numero ? pagos * Number(_sel.valor_numero) : null;
  return `
    <div class="rf-sec-lbl">👥 Participantes <span class="ag-lbl-opt">— ${_parts.length} escolhidos · ${pagos} pagos${arrec != null ? ` · R$ ${_preco(arrec)}` : ''}</span></div>
    <div class="rf-parts">
      ${_parts.length ? _parts.map(p => {
        const wa = _waLink(p.contato, `Oi ${p.nome || ''}! Sobre a ${_sel.titulo || 'rifa'} — número ${p.numero} 🎟️`);
        return `<div class="rf-part ${p.pago ? 'pago' : ''}" data-pid="${_esc(p.id)}">
          <button class="rf-part-check" data-toggle="${_esc(p.id)}" type="button" title="${p.pago ? 'Pago' : 'Marcar como pago'}">${p.pago ? '✅' : '⬜'}</button>
          <span class="rf-part-num">${p.numero}</span>
          <div class="rf-part-info"><b>${_esc(p.nome || '—')}</b>${p.contato ? `<small>${_esc(p.contato)}</small>` : '<small class="ag-sem-zap">sem WhatsApp</small>'}</div>
          ${wa ? `<a class="rf-part-wa" href="${wa}" target="_blank" rel="noopener">${WA_SVG}</a>` : ''}
          <button class="rf-part-x" data-rm-part="${_esc(p.id)}" type="button" aria-label="Remover">🗑</button>
        </div>`;
      }).join('') : '<div class="ag-vazio">Ninguém escolheu número ainda. Compartilhe o link!</div>'}
    </div>`;
}

// ── Sorteio ao vivo — 1 sorteio POR PRÊMIO (aleatório ou manual) ──
function _premiosList() {
  return (Array.isArray(_sel.premios) && _sel.premios.length) ? _sel.premios : ['Prêmio único'];
}
function _sorteioHtml() {
  const r = _sel;
  const premios = _premiosList();
  const sorteados = Array.isArray(r.sorteados) ? r.sorteados : [];
  const porOrdem = {}; sorteados.forEach(s => { porOrdem[s.ordem] = s; });
  const faltam = premios.filter((_, i) => !porOrdem[i + 1]).length;
  return `
    <div class="rf-sec-lbl">🎬 Sorteio ao vivo <span class="ag-lbl-opt">— ${premios.length} prêmio${premios.length > 1 ? 's' : ''} = ${premios.length} sorteio${premios.length > 1 ? 's' : ''}</span></div>
    <div class="rf-dica-box">${_fmtSorteio(r.sorteio_em) ? `Marcado pra <b>${_fmtSorteio(r.sorteio_em)}</b>. ` : ''}A contagem aparece no fim do link. Sorteie prêmio por prêmio — cada resultado aparece ao vivo pra todo mundo. Um número não ganha dois prêmios.</div>
    <div class="rf-sorteio-list">
      ${premios.map((p, i) => {
        const ord = i + 1, g = porOrdem[ord];
        if (g) {
          const wa = _waLink(g.contato, `Parabéns! Você ganhou "${p}" na ${r.titulo || 'rifa'} com o número ${g.numero}! 🎉`);
          return `<div class="rf-sortlinha ganho">
            <div class="rf-sortlinha-top"><span class="rf-sortlinha-premio">${ord}º · ${_esc(p)}</span><span class="rf-sortlinha-num">🎉 ${g.numero}</span></div>
            <div class="rf-sortlinha-ganhador"><b>${_esc(g.nome || 'Número não vendido')}</b>${g.contato ? ` · ${_esc(g.contato)}` : ''}${wa ? ` <a href="${wa}" target="_blank" rel="noopener" class="rf-part-wa">${WA_SVG}</a>` : ''}</div>
          </div>`;
        }
        return `<div class="rf-sortlinha" data-ord="${ord}">
          <div class="rf-sortlinha-top"><span class="rf-sortlinha-premio">${ord}º · ${_esc(p)}</span></div>
          <div class="rf-sortlinha-acoes">
            <button class="btn-secondary rf-sort-um" data-sort-rand="${ord}" type="button">🎲 Sortear</button>
            <input class="rf-sort-manual" data-manual="${ord}" type="number" inputmode="numeric" min="1" placeholder="ou nº">
            <button class="btn-secondary rf-sort-rev" data-sort-rev="${ord}" type="button" title="Revelar este número">🎯</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${faltam > 1 ? `<button class="btn-primary rf-sortear-btn" id="rf-sort-todos" type="button">🎲 Sortear os ${faltam} restantes</button>` : ''}
    ${sorteados.length ? '<button class="ag-linkbtn danger" id="rf-refazer" type="button">↩️ Refazer sorteio (zera tudo)</button>' : ''}`;
}

// ── Wiring do editor ───────────────────────────────────────────
function wireEditor(corpo) {
  corpo.querySelector('#rf-close').onclick = () => _close?.();
  corpo.querySelector('#rf-back').onclick = () => desenharLista();
  corpo.querySelector('#rf-premio-add').onclick = () => { _syncPremios(); _premios.push(''); pintarPremios(); };
  // Modo de recebimento (Mercado Pago × chave Pix)
  corpo.querySelectorAll('input[name="rf-modo"]').forEach(rb => rb.addEventListener('change', () => {
    const v = corpo.querySelector('input[name="rf-modo"]:checked')?.value || 'estatico';
    _sel.pix_modo = v;
    const mp = corpo.querySelector('#rf-modo-mp'), es = corpo.querySelector('#rf-modo-est');
    if (mp) mp.hidden = v !== 'mp_connect';
    if (es) es.hidden = v !== 'estatico';
    corpo.querySelectorAll('.rf-modo-op').forEach(op => op.classList.toggle('on', !!op.querySelector('input')?.checked));
  }));
  corpo.querySelector('#rf-mp-conectar')?.addEventListener('click', async () => {
    try { _snapshotForm(); const url = await iniciarConexaoMp(); showToast('Abrindo o Mercado Pago…', 'info'); location.href = url; }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
  corpo.querySelector('#rf-mp-desc')?.addEventListener('click', async () => {
    if (!confirm('Desconectar o Mercado Pago? As rifas no automático deixam de confirmar sozinhas.')) return;
    try { await desconectarMp(); _mpConta = { connected: false }; _snapshotForm(); desenharEditor(); showToast('Mercado Pago desconectado', 'info'); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
  corpo.querySelector('#rf-salvar').onclick = salvar;
  corpo.querySelector('#rf-excluir')?.addEventListener('click', excluir);
  corpo.querySelector('#rf-copiar')?.addEventListener('click', async () => {
    const inp = corpo.querySelector('#rf-link');
    try { await navigator.clipboard.writeText(inp.value); showToast('🔗 Link copiado!', 'success'); }
    catch { inp.focus(); inp.select(); showToast('Segure no link e copie', 'info'); }
  });
  // Participantes
  corpo.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const p = _parts.find(x => x.id === b.dataset.toggle); if (!p) return;
    try { await marcarPago(p.id, !p.pago); p.pago = !p.pago; _refreshParts(); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
  corpo.querySelectorAll('[data-rm-part]').forEach(b => b.onclick = async () => {
    const p = _parts.find(x => x.id === b.dataset.rmPart); if (!p) return;
    if (!confirm(`Remover o número ${p.numero} (${p.nome})?`)) return;
    try { await removerParticipante(p.id); _parts = _parts.filter(x => x.id !== p.id); _refreshParts(); showToast('Número liberado', 'info'); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
  // Sorteio — prêmio por prêmio
  corpo.querySelectorAll('[data-sort-rand]').forEach(b => b.onclick = () => _sortearPremio(+b.dataset.sortRand, null));
  corpo.querySelectorAll('[data-sort-rev]').forEach(b => b.onclick = () => {
    const ord = +b.dataset.sortRev;
    const n = parseInt(corpo.querySelector(`[data-manual="${ord}"]`)?.value, 10);
    if (!n || n < 1) { showToast('Digite o número (ex.: Loteria Federal)', 'info'); return; }
    _sortearPremio(ord, n);
  });
  corpo.querySelector('#rf-sort-todos')?.addEventListener('click', _sortearTodos);
  corpo.querySelector('#rf-refazer')?.addEventListener('click', async () => {
    if (!confirm('Refazer o sorteio? Todos os resultados serão apagados.')) return;
    try {
      await definirStatusSorteio(_sel.slug, 'agendado');
      _snapshotForm();
      _sel.sorteio_status = 'agendado'; _sel.sorteados = [];
      _sincLista(); desenharEditor();
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
}

// Guarda o que está digitado no form dentro de _sel, pra um re-render não perder
// edições ainda-não-salvas (ex.: marcar "pago" enquanto edita o título).
function _snapshotForm() {
  if (!document.querySelector('#rifas-ov #rf-titulo')) return;
  const f = _lerForm();
  _sel = { ..._sel, ...f, premios: f.premios };
}
// Redesenha o editor preservando o form.
function _refreshParts() {
  if (!document.querySelector('#rifas-ov')) return;
  _snapshotForm();
  desenharEditor();
}

// Sorteia UM prêmio (ordem). numero=null → aleatório; senão revela o número dado.
async function _sortearPremio(ordem, numero) {
  try {
    const res = await sortearPremio(_sel.slug, ordem, numero);
    _snapshotForm();
    _sel.sorteados = Array.isArray(res.sorteados) ? res.sorteados : [];
    _sel.sorteio_status = _sel.sorteados.length >= res.total_premios ? 'encerrado' : 'ao_vivo';
    _sincLista();
    desenharEditor();
    showToast(res.ganhador ? `🎉 ${res.premio}: ${res.ganhador} (nº ${res.numero})` : `${res.premio}: nº ${res.numero} (não vendido)`, 'success');
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// Sorteia todos os prêmios que ainda faltam (aleatório), um a um.
async function _sortearTodos() {
  const btn = document.querySelector('#rf-sort-todos');
  if (btn) { btn.disabled = true; btn.textContent = 'Sorteando…'; }
  _snapshotForm();
  const premios = _premiosList();
  const feitos = new Set((_sel.sorteados || []).map(s => s.ordem));
  let erro = null;
  for (let ord = 1; ord <= premios.length; ord++) {
    if (feitos.has(ord)) continue;
    try {
      const res = await sortearPremio(_sel.slug, ord, null);
      _sel.sorteados = Array.isArray(res.sorteados) ? res.sorteados : [];
      _sel.sorteio_status = _sel.sorteados.length >= res.total_premios ? 'encerrado' : 'ao_vivo';
    } catch (e) { erro = e; break; }
  }
  _sincLista();
  desenharEditor();
  if (erro) showToast('Parou: ' + erro.message, 'error');
  else showToast('🎉 Sorteio concluído!', 'success');
}

// Mantém _rifas em sincronia com _sel (pra a lista refletir sem re-fetch).
function _sincLista() {
  const i = _rifas.findIndex(x => x.id === _sel.id);
  if (i >= 0) _rifas[i] = { ..._rifas[i], ..._sel };
}

function _lerForm() {
  const q = id => document.querySelector('#rifas-ov ' + id);
  _syncPremios();
  return {
    titulo: q('#rf-titulo')?.value.trim() || '',
    subtitulo: q('#rf-subtitulo')?.value || '',
    descricao: q('#rf-descricao')?.value || '',
    total_numeros: parseInt(q('#rf-total')?.value, 10) || 100,
    valor_numero: (q('#rf-valor')?.value || '').replace(/\./g, '').replace(',', '.').trim(),
    valor_meta: (q('#rf-meta')?.value || '').replace(/\./g, '').replace(',', '.').trim(),
    sorteio_em: _fromLocalInput(q('#rf-sorteio')?.value),
    whatsapp: q('#rf-whatsapp')?.value || '',
    premios: _premios.map(p => String(p).trim()).filter(Boolean),
    pix_chave: q('#rf-pix')?.value || '',
    pix_nome: q('#rf-pixnome')?.value || '',
    pix_cidade: q('#rf-pixcidade')?.value || '',
    pix_modo: q('input[name="rf-modo"]:checked')?.value === 'mp_connect' ? 'mp_connect' : 'estatico',
    ativo: !!q('#rf-ativo')?.checked,
  };
}

async function salvar() {
  const dados = _lerForm();
  if (dados.titulo.length < 3) { showToast('Dê um título pra rifa', 'info'); return; }
  if (dados.pix_modo === 'mp_connect') {
    if (!_mpConta?.connected) { showToast('Conecte o Mercado Pago primeiro, ou escolha "Minha chave Pix".', 'info'); return; }
  } else if (dados.ativo && !String(dados.pix_chave).trim()) {
    showToast('Coloque sua chave Pix pra ativar (ou use o Mercado Pago)', 'info'); return;
  }
  const btn = document.querySelector('#rf-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    if (_sel.id) {
      await atualizarRifa(_sel.id, dados);
      _sel = { ..._sel, ...dados, premios: dados.premios };
      _sincLista();
      showToast('✅ Rifa salva!', 'success');
      desenharEditor();
    } else {
      const nova = await criarRifa(dados);
      _rifas.unshift(nova);
      _sel = { ...nova };
      _premios = Array.isArray(nova.premios) ? nova.premios.slice() : [];
      try { _parts = await getParticipantes(nova.id); } catch { _parts = []; }
      showToast('✅ Rifa criada! Copie o link e compartilhe. 🎟️', 'success');
      desenharEditor();
    }
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
    if (btn?.isConnected) { btn.disabled = false; btn.textContent = _sel.id ? 'Salvar' : 'Criar rifa'; }
  }
}

async function excluir() {
  if (!_sel?.id) return;
  if (!confirm(`Excluir a rifa "${_sel.titulo}"? Isso apaga os números escolhidos também.`)) return;
  try {
    await excluirRifa(_sel.id);
    _rifas = _rifas.filter(r => r.id !== _sel.id);
    showToast('Rifa excluída', 'info');
    desenharLista();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}
