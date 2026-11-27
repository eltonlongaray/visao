// ─── ÍNDICE ──────────────────────────────────────────────────
// Ferramentas → 💸 FONTES DE RENDA montadas por cada pessoa (Élton, 26/11).
//   BLOCO 1: tela de cards (topo ou dentro de um card com divisões)
//   BLOCO 2: criar / editar / apagar card (janelinha)
//   BLOCO 3: 👥 Clientes de um card (lista + totais)
//   BLOCO 4: editor do cliente
// Dados: js/renda.js · SQL: sql/renda-fontes.sql · a 🎓 Mentoria segue em mentoria-ui.js
// ─────────────────────────────────────────────────────────────
import * as R from './renda.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { digitosDe } from './mentoria.js';

const SVG_VOLTAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>';
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const ICONES = ['💼', '🚀', '👑', '🎓', '📣', '🛍️', '💆', '🧠', '📚', '🏠', '🎨', '💻'];

let _fontes = [], _clientes = [], _servAg = [];
// Serviços da Agenda Online: cada um pode dizer de qual fonte é (servico.fonteId)
const _lerServicosAgenda = () => import('./agenda.js').then(A => A.getAgendaConfig()).then(c => (Array.isArray(c?.servicos) ? c.servicos : []).filter(x => !x.pacoteDe)).catch(() => []);
const _recarregar = async () => { [_fontes, _clientes, _servAg] = await Promise.all([R.lerFontes(), R.lerClientes().catch(() => []), _lerServicosAgenda()]); };
const _servicosDa = (f) => _servAg.filter(x => x.fonteId === f.id);
const _atendPadrao = () => _fontes.find(x => x.tipo === 'atendimentos') || null;
const _redesenhos = new Set();   // telas abertas (uma por nível) se repintam juntas
const _repintar = () => _redesenhos.forEach(fn => fn());

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: CARDS (topo = paiId null)
// ═══════════════════════════════════════════════════════════════
export async function abrirFontesRenda(paiId = null) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = paiId ? `renda-ov-${paiId}` : 'renda-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  const pintar = () => desenharCards(ov, paiId);
  const fechar = trapModalBack(() => { _redesenhos.delete(pintar); ov.remove(); });
  _redesenhos.add(pintar);
  try { if (!paiId || !_fontes.length) await _recarregar(); }
  catch (e) {
    // Sem o SQL ainda: mostra a Mentoria, como era antes, pra ninguém perder o acesso
    if (!paiId && /Falta rodar o SQL/.test(e.message)) {
      _fontes = [{ id: '__mentoria', nome: 'Mentoria', icone: '🎓', tipo: 'mentoria', pai_id: null, ordem: 0 }];
      pintar(); ov.querySelectorAll('[data-editar], [data-novo]').forEach(x => x.remove());
      _fontes = [];
      ov.querySelector('[data-abrir]')?.addEventListener('click', async () => (await import('./mentoria-ui.js')).abrirMentoria());
      return fechar;
    }
    ov.querySelector('.ag-corpo').innerHTML = `<div class="ag-header"><button class="fr-voltar" data-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button><div class="ag-title">💸 Fontes de renda</div></div>
      <div class="ag-erro">Não deu pra carregar.<br><small>${_esc(e.message)}</small></div>`;
    ov.querySelector('[data-voltar]').onclick = () => history.back();
    return fechar;
  }
  pintar();
  return fechar;
}

function _sub(f) {
  if (f.tipo === 'grupo') {
    const n = _fontes.filter(x => x.pai_id === f.id).length;
    return n ? `${n} ${n === 1 ? 'card' : 'cards'} dentro` : 'Toque pra criar os cards de dentro';
  }
  if (f.tipo === 'clientes') {
    const l = _clientes.filter(c => c.fonte_id === f.id);
    return l.length ? `${l.length} ${l.length === 1 ? 'cliente' : 'clientes'}` : 'Nenhum cliente ainda';
  }
  if (f.tipo === 'atendimentos') { const sv = _servicosDa(f); return sv.length ? `Agenda: ${sv.map(x => x.nome).join(', ')}` : 'Clientes da Agenda Online, ficha e financeiro'; }
  return 'Inscritas, alunas e formulários';
}

function desenharCards(ov, paiId) {
  const pai = paiId ? _fontes.find(f => f.id === paiId) : null;
  if (paiId && !pai) { history.back(); return; }   // apagaram o card aberto
  const cards = R.filhas(_fontes, paiId);
  const corpo = ov.querySelector('.ag-corpo');
  corpo.innerHTML = `
    <div class="ag-header">
      <button class="fr-voltar" data-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
      <div class="ag-title">${pai ? `${_esc(pai.icone)} ${_esc(pai.nome)}` : '💸 Fontes de renda'}</div>
    </div>
    <div class="ag-scroll">
      <div class="rf-intro">${pai ? `Os cards de ${_esc(pai.nome)}.` : 'Tudo o que você ganha, separado por negócio. Monte do seu jeito.'}</div>
      <div class="mt-hub">
        ${cards.map(f => `
        <div class="rd-card-wrap">
          <button class="fr-hubcard rd-card" data-abrir="${f.id}" type="button">
            <span class="fr-hub-ic">${_esc(f.icone)}</span>
            <span class="fr-hub-tx"><b>${_esc(f.nome)}</b><small>${_esc(_sub(f))}</small></span>
          </button>
          <button class="rd-mais" data-editar="${f.id}" type="button" aria-label="Editar ${_esc(f.nome)}">⋯</button>
        </div>`).join('')}
        <button class="rd-novo" data-novo type="button">＋ ${pai ? `Novo card em ${_esc(pai.nome)}` : 'Nova fonte de renda'}</button>
      </div>
    </div>`;
  corpo.querySelector('[data-voltar]').onclick = () => history.back();
  corpo.querySelector('[data-novo]').onclick = () => editarFonte(null, paiId);
  corpo.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editarFonte(b.dataset.editar));
  corpo.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirFonte(b.dataset.abrir));
}

export async function abrirFonte(id) {
  const f = _fontes.find(x => x.id === id);
  if (!f) return;
  if (f.tipo === 'grupo') return abrirFontesRenda(f.id);
  if (f.tipo === 'mentoria') return (await import('./mentoria-ui.js')).abrirMentoria();
  if (f.tipo === 'atendimentos') return (await import('./agenda-ui.js')).abrirAgenda({ modo: 'clientes', titulo: `${f.icone} ${f.nome}`, fonteId: f.id, padrao: _atendPadrao()?.id === f.id });
  return abrirClientes(f.id);
}

// (27/11) Vindo da Agenda Online: abre as Fontes de renda e, por cima, o card 💆 Atendimentos
// (cria o card na primeira vez). Sem o SQL novo, abre a tela de clientes direto.
export async function abrirAtendimentos() {
  await abrirFontesRenda(null);
  let f = _atendPadrao();
  // Já tem serviço da agenda ligado a alguma fonte: só mostra as Fontes de renda
  if (!f && _servAg.some(x => x.fonteId && _fontes.some(y => y.id === x.fonteId))) return;
  if (!f && _fontes.length) {
    try { f = await R.criarFonte({ nome: 'Atendimentos', icone: '💆', tipo: 'atendimentos' }, _fontes); _fontes.push(f); _repintar(); }
    catch (e) { console.warn('[renda] Atendimentos:', e.message); f = null; }
  }
  if (f) return abrirFonte(f.id);
  return (await import('./agenda-ui.js')).abrirAgenda({ modo: 'clientes' });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CRIAR / EDITAR / APAGAR CARD
// ═══════════════════════════════════════════════════════════════
function editarFonte(id, paiId = null) {
  const f = id ? _fontes.find(x => x.id === id) : null;
  const temDentro = f && (_fontes.some(x => x.pai_id === f.id) || _clientes.some(c => c.fonte_id === f.id));
  let tipo = f?.tipo || 'clientes', icone = f?.icone || '💼';
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal rd-modal"><div class="modal-title">${f ? '✏️ Editar card' : '＋ Novo card'}</div>
    <label class="mt-rot2" for="rd-nome">Nome</label>
    <input class="input-field" id="rd-nome" maxlength="40" value="${_esc(f?.nome || '')}" placeholder="Ex.: Agência de marketing" autocomplete="off">
    <div class="mt-rot2">Ícone</div>
    <div class="mt-chips rd-icones">${ICONES.map(i => `<button class="mt-chip${i === icone ? ' on' : ''}" data-ic="${i}" type="button">${i}</button>`).join('')}</div>
    <div class="mt-rot2">O que tem dentro</div>
    ${temDentro ? `<div class="fi-secao-sub">${R.tipoDe(tipo).icone} ${R.tipoDe(tipo).nome} (pra trocar, o card precisa estar vazio)</div>`
      : `<div class="rd-tipos">${R.TIPOS.map(t => `<button class="rd-tipo${t.k === tipo ? ' on' : ''}" data-tipo="${t.k}" type="button"><b>${t.icone} ${t.nome}</b><small>${t.dica}</small></button>`).join('')}</div>`}
    ${f ? '<button class="mt-apagar" data-apagar type="button">Apagar card</button>' : ''}
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">${f ? 'Salvar' : 'Criar'}</button></div></div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  const nome = ov.querySelector('#rd-nome');
  if (!f) setTimeout(() => nome.focus(), 50);
  ov.querySelector('[data-x]').onclick = () => fechar();
  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  ov.querySelectorAll('[data-ic]').forEach(b => b.onclick = () => { icone = b.dataset.ic; ov.querySelectorAll('[data-ic]').forEach(x => x.classList.toggle('on', x === b)); });
  ov.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { tipo = b.dataset.tipo; ov.querySelectorAll('[data-tipo]').forEach(x => x.classList.toggle('on', x === b)); });
  ov.querySelector('[data-apagar]')?.addEventListener('click', async () => {
    const nDentro = _fontes.filter(x => x.pai_id === f.id).length, nCli = _clientes.filter(c => c.fonte_id === f.id).length;
    const ok = await confirmModal({
      title: `Apagar "${f.nome}"?`,
      message: nDentro || nCli ? `Vai junto: ${[nDentro && `${nDentro} ${nDentro === 1 ? 'card' : 'cards'} de dentro`, nCli && `${nCli} ${nCli === 1 ? 'cliente' : 'clientes'}`].filter(Boolean).join(' e ')}.` : 'O card some das Fontes de renda.',
      confirmText: 'Apagar', cancelText: 'Manter', danger: true,
    });
    if (!ok) return;
    try { await R.apagarFonte(f.id); await _recarregar(); fechar(); _repintar(); showToast('Card apagado', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  });
  ov.querySelector('[data-ok]').onclick = async () => {
    const n = nome.value.trim();
    if (!n) { nome.focus(); return; }
    try {
      if (f) await R.mudarFonte(f.id, temDentro ? { nome: n, icone } : { nome: n, icone, tipo });
      else await R.criarFonte({ nome: n, icone, tipo, pai_id: paiId }, _fontes);
      await _recarregar(); fechar(); _repintar();
    } catch (e) { showToast(e.message, 'error'); }
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: 👥 CLIENTES DE UM CARD
// ═══════════════════════════════════════════════════════════════
export async function abrirClientes(fonteId) {
  if (!_fontes.length) { try { await _recarregar(); } catch (e) { showToast(e.message, 'error'); return; } }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = `renda-cli-${fonteId}`;
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo"></div></div>`;
  document.body.appendChild(ov);
  const pintar = () => desenharClientes(ov, fonteId);
  const fechar = trapModalBack(() => { _redesenhos.delete(pintar); ov.remove(); });
  _redesenhos.add(pintar);
  pintar();
  return fechar;
}

function desenharClientes(ov, fonteId) {
  const f = _fontes.find(x => x.id === fonteId);
  if (!f) { history.back(); return; }
  const lista = _clientes.filter(c => c.fonte_id === fonteId);
  const pago = lista.reduce((s, c) => s + (Number(c.valor_pago) || 0), 0);
  const aReceber = lista.reduce((s, c) => s + (Number(c.proximo_valor) || 0), 0);
  const corpo = ov.querySelector('.ag-corpo');
  corpo.innerHTML = `
    <div class="ag-header">
      <button class="fr-voltar" data-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
      <div class="ag-title">${_esc(f.icone)} ${_esc(f.nome)}</div>
    </div>
    <div class="ag-scroll">
      <div class="rd-totais">
        <div><small>Recebido</small><b>${R.reais(pago) || 'R$ 0,00'}</b></div>
        <div><small>A receber</small><b>${R.reais(aReceber) || 'R$ 0,00'}</b></div>
      </div>
      ${_servicosDa(f).length ? `<button class="rd-agenda" data-agenda type="button"><span>📅 Marcaram pela Agenda</span><small>${_esc(_servicosDa(f).map(x => x.nome).join(', '))}</small><b>›</b></button>` : ''}
      <button class="rd-novo" data-novo type="button">＋ Novo cliente</button>
      ${lista.length ? lista.map(c => `
      <button class="rd-cli" data-cli="${c.id}" type="button">
        <b>${_esc(c.nome)}</b>
        ${c.fase ? `<span class="rd-fase">${_esc(c.fase)}</span>` : ''}
        <small>${[c.valor_pago != null && `💰 pagou ${R.reais(c.valor_pago)}`, (c.proximo_em || c.proximo_valor != null) && `📅 próximo${c.proximo_valor != null ? ' ' + R.reais(c.proximo_valor) : ''}${c.proximo_em ? ' em ' + R.dataBR(c.proximo_em) : ''}`].filter(Boolean).join(' · ') || 'Toque pra completar'}</small>
      </button>`).join('') : '<div class="fr-vazio-grupo">Nenhum cliente aqui ainda.</div>'}
    </div>`;
  corpo.querySelector('[data-voltar]').onclick = () => history.back();
  corpo.querySelector('[data-novo]').onclick = () => editarCliente(null, fonteId);
  corpo.querySelector('[data-agenda]')?.addEventListener('click', async () => (await import('./agenda-ui.js')).abrirAgenda({ modo: 'clientes', titulo: `📅 ${f.nome} · Agenda`, fonteId: f.id, padrao: false }));
  corpo.querySelectorAll('[data-cli]').forEach(b => b.onclick = () => editarCliente(b.dataset.cli, fonteId));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: EDITOR DO CLIENTE
// ═══════════════════════════════════════════════════════════════
function editarCliente(id, fonteId) {
  const c = id ? _clientes.find(x => x.id === id) : null;
  const v = (k) => _esc(c?.[k] ?? '');
  const num = (k) => c?.[k] != null ? String(c[k]).replace('.', ',') : '';
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal rd-modal-cli"><div class="modal-title">${c ? `👤 ${_esc(c.nome)}` : '＋ Novo cliente'}</div>
    <label class="mt-rot2" for="rc-nome">Nome</label>
    <input class="input-field" id="rc-nome" maxlength="80" value="${v('nome')}" autocomplete="off">
    <label class="mt-rot2" for="rc-wpp">WhatsApp</label>
    <input class="input-field" id="rc-wpp" maxlength="40" inputmode="tel" value="${v('contato')}" placeholder="(51) 99999-9999">
    <label class="mt-rot2" for="rc-fase">Fase / o que está sendo feito</label>
    <input class="input-field" id="rc-fase" maxlength="80" value="${v('fase')}" placeholder="Ex.: Fase 1 · Campanha do Google">
    <div class="rd-2col">
      <div><label class="mt-rot2" for="rc-pago">Já pagou (R$)</label>
      <input class="input-field" id="rc-pago" inputmode="decimal" value="${num('valor_pago')}" placeholder="0,00"></div>
      <div><label class="mt-rot2" for="rc-prox">Próximo (R$)</label>
      <input class="input-field" id="rc-prox" inputmode="decimal" value="${num('proximo_valor')}" placeholder="0,00"></div>
    </div>
    <label class="mt-rot2" for="rc-data">Data do próximo pagamento</label>
    <input class="input-field" id="rc-data" type="date" value="${v('proximo_em')}">
    <label class="mt-rot2" for="rc-notas">Anotações</label>
    <textarea class="input-field" id="rc-notas" rows="3" maxlength="2000" placeholder="Só pra você: combinados, próximos passos…">${v('notas')}</textarea>
    ${c && digitosDe(c.contato || '').length >= 10 ? `<a class="btn-secondary rd-wpp" href="https://wa.me/55${digitosDe(c.contato)}" target="_blank" rel="noopener">💬 Abrir conversa no WhatsApp</a>` : ''}
    ${c ? '<button class="mt-apagar" data-apagar type="button">Apagar cliente</button>' : ''}
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">${c ? 'Salvar' : 'Adicionar'}</button></div></div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  const $ = (s) => ov.querySelector(s);
  if (!c) setTimeout(() => $('#rc-nome').focus(), 50);
  $('[data-x]').onclick = () => fechar();
  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  $('[data-apagar]')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: `Apagar ${c.nome}?`, message: 'Some da lista, com as anotações.', confirmText: 'Apagar', cancelText: 'Manter', danger: true });
    if (!ok) return;
    try { await R.apagarCliente(c.id); await _recarregar(); fechar(); _repintar(); }
    catch (e) { showToast(e.message, 'error'); }
  });
  $('[data-ok]').onclick = async () => {
    const dados = {
      nome: $('#rc-nome').value, contato: $('#rc-wpp').value, fase: $('#rc-fase').value,
      valor_pago: $('#rc-pago').value, proximo_valor: $('#rc-prox').value,
      proximo_em: $('#rc-data').value, notas: $('#rc-notas').value,
    };
    if (!dados.nome.trim()) { $('#rc-nome').focus(); return; }
    try {
      if (c) await R.mudarCliente(c.id, dados); else await R.criarCliente(fonteId, dados);
      await _recarregar(); fechar(); _repintar();
    } catch (e) { showToast(e.message, 'error'); }
  };
}

// O Pet mexeu: as telas abertas se atualizam
export async function recarregarRenda() { try { await _recarregar(); _repintar(); } catch { /* sem tela */ } }
