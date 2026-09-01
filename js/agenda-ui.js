// ─── ÍNDICE ──────────────────────────────────────────────────
// Modal "Agenda Online" (lado do DONO): escolhe UM dia por vez (abas),
// adiciona horários específicos (agrupados por turno: manhã/tarde/noite),
// pode repetir o dia na semana toda, copia o link público e vê/cancela
// os agendamentos. A página pública (cliente agenda) é a Fase B.
// ─────────────────────────────────────────────────────────────
import { getAgendaConfig, salvarAgendaConfig, getAgendamentos, cancelarAgendamento, sincronizarCompromissos, salvarAgendamentoManual, getAgendamentosTodos, atualizarStatusAgendamento, getAgendamentoById, excluirAtendimento, sincronizarTaskDoAgendamento, atualizarContatoCliente, atualizarCliente } from './agenda.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { openTimePicker } from './seletor-horario.js';
import { forceRender } from './roteador.js';

const DOWS = [
  { k: 1, lbl: 'Seg', full: 'Segunda' }, { k: 2, lbl: 'Ter', full: 'Terça' },
  { k: 3, lbl: 'Qua', full: 'Quarta' }, { k: 4, lbl: 'Qui', full: 'Quinta' },
  { k: 5, lbl: 'Sex', full: 'Sexta' }, { k: 6, lbl: 'Sáb', full: 'Sábado' },
  { k: 0, lbl: 'Dom', full: 'Domingo' },
];
let _cfg = null, _ags = [], _todos = [], _close = null, _diaSel = 1, _semanaOffset = 0;

// Ícone oficial do WhatsApp (SVG inline).
const WA_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg>';

// Link do WhatsApp (Brasil): tira não-dígitos e garante o 55.
function _waLink(zap) {
  let d = String(zap || '').replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}`;
}
// Agrupa os atendimentos por cliente (chave = WhatsApp, ou nome se não tiver).
function _clientes() {
  const map = new Map();
  for (const a of _todos) {
    const key = (a.cliente_contato || '').replace(/\D/g, '') || (a.cliente_nome || '').trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, { key, nome: a.cliente_nome, contato: a.cliente_contato, ags: [] });
    const c = map.get(key);
    c.ags.push(a);
    if (!c.contato && a.cliente_contato) c.contato = a.cliente_contato;   // completa o zap se algum tiver
  }
  return [...map.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

// Lista corrida dos atendimentos marcados daqui pra frente (todas as semanas).
function _proximosHtml() {
  const hoje = _hojeISO();
  const prox = _todos.filter(a => a.data >= hoje && a.status === 'confirmado')
    .sort((a, b) => (a.data + a.hora < b.data + b.hora ? -1 : 1));
  if (!prox.length) return '<div class="ag-vazio">Nenhum atendimento marcado. Crie um pelo Ritual.</div>';
  return prox.map(a => {
    const fim = _fimHora(a.hora, a.duracao_min);
    return `<div class="ag-prox" data-detalhe="${_esc(a.id)}">
      <div class="ag-prox-info"><b>${_fmtData(a.data)} · ${_esc(a.hora)}${fim ? `–${fim}` : ''}</b>
        <small>${_esc(a.cliente_nome)}${a.servico ? ` · ${_esc(a.servico)}` : ''}</small></div>
      <span class="ag-cli-h-seta">›</span>
    </div>`;
  }).join('');
}

// Editar CONTATO de um cliente: nome + WhatsApp (atualiza TODOS os atendimentos dele).
async function _editarZapCliente(c) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ag-zap-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">✏️ Editar contato</div>
    <label class="input-field"><div class="input-field-label">Nome do cliente</div>
      <input id="agz-nome" value="${_esc(c.nome || '')}" placeholder="Nome"></label>
    <label class="input-field"><div class="input-field-label">WhatsApp</div>
      <input id="agz-num" inputmode="tel" value="${_esc(c.contato || '')}" placeholder="(DDD) 9 9999-9999"></label>
    <div class="ag-fbtns">
      <button class="btn-secondary" id="agz-cancelar" type="button">Fechar</button>
      <button class="btn-primary" id="agz-salvar" type="button">Salvar</button>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#agz-cancelar').onclick = () => close();
  ov.querySelector('#agz-salvar').onclick = async () => {
    const nome = ov.querySelector('#agz-nome').value.trim();
    const num = ov.querySelector('#agz-num').value.trim();
    if (nome.length < 2) { showToast('Escreva o nome do cliente', 'info'); return; }
    const btn = ov.querySelector('#agz-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await atualizarCliente(c.ags.map(a => a.id), { nome, contato: num });
      _todos = await getAgendamentosTodos().catch(() => _todos);
      close(); desenhar(); showToast('✅ Contato atualizado', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar'; } }
  };
}

// Popup com o histórico de atendimentos de um cliente.
function _popupHistoricoCliente(c) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ag-hist-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">📋 Histórico de ${_esc(c.nome)}</div>
    <div class="ag-cli-hist-tit">${c.ags.length} atendimento${c.ags.length > 1 ? 's' : ''}</div>
    <div class="ag-hist-lista">
      ${c.ags.map((a, i) => { const fim = _fimHora(a.hora, a.duracao_min); return `<div class="ag-cli-h${i > 0 ? ' div' : ''}">
        <span>${_fmtData(a.data)} · ${_esc(a.hora)}${fim ? `–${fim}` : ''}${a.servico ? ` · ${_esc(a.servico)}` : ''}${a.status === 'finalizado' ? ' · ✅' : a.status === 'faltou' ? ' · 🚫' : ''}</span>
      </div>`; }).join('')}
    </div>
    <div class="ag-fbtns"><button class="btn-primary" id="agh-ok" type="button">Fechar</button></div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#agh-ok').onclick = () => close();
}

function _clientesHtml() {
  const cs = _clientes();
  if (!cs.length) return '<div class="ag-vazio">Nenhum cliente ainda. Os clientes aparecem aqui quando você agenda um atendimento (pelo Ritual ou pelo link).</div>';
  return cs.map(c => {
    const wa = _waLink(c.contato);
    return `<div class="ag-cli" data-clikey="${_esc(c.key)}">
      <div class="ag-cli-top" data-cli-toggle>
        <div class="ag-cli-info"><b>${_esc(c.nome)}</b>
          <small>${c.ags.length} atend.${c.contato ? ` · ${_esc(c.contato)}` : ' · <span class="ag-sem-zap">sem WhatsApp</span>'}</small></div>
        <span class="ag-cli-ch">▾</span>
      </div>
      <div class="ag-cli-hist" hidden>
        <div class="ag-cli-acoes">
          ${wa ? `<a class="ag-cli-wa" href="${wa}" target="_blank" rel="noopener">${WA_SVG} Chamar no WhatsApp</a>` : ''}
          <button class="ag-cli-wa-ed" data-hist-cli="${_esc(c.key)}" type="button">📋 Histórico</button>
          <button class="ag-cli-wa-ed" data-edit-zap="${_esc(c.key)}" type="button">✏️ Editar contato</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _fmtData = iso => { try { const [, m, d] = iso.split('-'); return `${d}/${m}`; } catch { return iso; } };
const _hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const _SEML = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const _fmtDataLonga = iso => { try { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${_SEML[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; } catch { return iso; } };
const _fimHora = (hora, dur) => { if (!dur) return null; const [h, m] = hora.split(':').map(Number); const t = h * 60 + m + dur; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const _difMin = (a, b) => { try { const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1); } catch { return 0; } };

// Renderiza os campos de agendamento DENTRO de um container (inline no modal de
// compromisso do Ritual) — NÃO abre pop-up novo. Devolve helpers pra ler/salvar.
export async function montarAgendaInline(container, { dataISO } = {}) {
  try {
    if (!_cfg) [_cfg, _todos] = await Promise.all([getAgendaConfig(), getAgendamentosTodos().catch(() => [])]);
    if (!Array.isArray(_cfg.servicos)) _cfg.servicos = [];
  } catch (e) { showToast('Não deu pra carregar a agenda: ' + e.message, 'error'); }
  const servs = _cfg?.servicos || [];
  const cls = _clientes();
  container.innerHTML = `
    ${cls.length ? `<label class="input-field"><div class="input-field-label">Cliente já cadastrado?</div>
      <select id="mi-cli"><option value="">— novo cliente —</option>
        ${cls.map(c => `<option value="${_esc(c.key)}">${_esc(c.nome)}${c.contato ? ` · ${_esc(c.contato)}` : ''}</option>`).join('')}
      </select></label>` : ''}
    <label class="input-field"><div class="input-field-label">Nome do cliente</div>
      <input id="mi-nome" placeholder="Nome"></label>
    <label class="input-field"><div class="input-field-label">WhatsApp <span style="color:var(--muted);font-weight:500">(opcional)</span></div>
      <input id="mi-zap" inputmode="tel" placeholder="(DDD) 9 9999-9999"></label>
    ${servs.length ? `<label class="input-field"><div class="input-field-label">Serviço</div>
      <select id="mi-serv"><option value="">— sem serviço —</option>
        ${servs.map(s => `<option value="${_esc(s.id)}" data-dur="${s.duracaoMin || 60}">${_esc(s.nome)} · ${s.duracaoMin || 60}min${s.preco != null ? ` · R$ ${_preco(s.preco)}` : ''}</option>`).join('')}
      </select></label>` : ''}`;
  container.querySelector('#mi-cli')?.addEventListener('change', (e) => {
    const c = cls.find(x => x.key === e.target.value);
    if (c) { container.querySelector('#mi-nome').value = c.nome || ''; container.querySelector('#mi-zap').value = c.contato || ''; }
  });
  return {
    onServico(cb) { container.querySelector('#mi-serv')?.addEventListener('change', () => cb(this.duracaoServico())); },
    duracaoServico() { const o = container.querySelector('#mi-serv')?.selectedOptions?.[0]; return o && o.value ? (parseInt(o.dataset.dur, 10) || null) : null; },
    async salvar({ hora, horaFim }) {
      const nome = (container.querySelector('#mi-nome')?.value || '').trim();
      const zap = (container.querySelector('#mi-zap')?.value || '').trim();
      const servId = container.querySelector('#mi-serv')?.value || '';
      if (nome.length < 2) { showToast('Escreva o nome do cliente', 'info'); return null; }
      if (!hora) { showToast('Escolha o horário de início', 'info'); return null; }
      const serv = servs.find(s => s.id === servId) || null;
      let dur = serv?.duracaoMin || null;
      if (horaFim) { const d = _difMin(hora, horaFim); if (d > 0) dur = d; }
      const patch = { id: null, data: dataISO, hora, cliente_nome: nome, cliente_contato: zap, servico: serv?.nome || null, preco: serv?.preco ?? null, duracao_min: dur };
      const novoId = await salvarAgendamentoManual(patch);
      marcarAgendamentoVisto(novoId);   // o dono criou → não é "novo" pra ele
      await sincronizarCompromissos().catch(() => {});
      return patch;
    },
  };
}
function _waLembrete(ag) {
  const wa = _waLink(ag.cliente_contato); if (!wa) return null;
  const msg = `Oi ${ag.cliente_nome || ''}! Passando pra lembrar do seu atendimento em ${_fmtData(ag.data)} às ${ag.hora}${ag.servico ? ` (${ag.servico})` : ''}. Até lá! 🦅`;
  return `${wa}?text=${encodeURIComponent(msg)}`;
}
const _linkPublico = () => `${location.origin}/agenda-online/${_cfg.slug}`;
const _turno = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');
const _sid = () => 's' + Math.random().toString(36).slice(2, 8);
const _preco = v => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
// ─── DISPONIBILIDADE POR SEMANA ──────────────────────────────
// offset 0 = semana atual = PADRÃO (`disponibilidade`), que se repete pra frente.
// offset ≥1 = semana específica: exceção guardada em `semanas[<segunda ISO>]`
// (materializada a partir do padrão no 1º ajuste). Semana sem exceção segue o padrão.
const _pad2 = n => String(n).padStart(2, '0');
const _isoDe = d => `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
// Segunda-feira da semana (offset em semanas a partir de hoje) — bate com date_trunc('week') do Postgres.
function _segundaDaSemana(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;            // 0=segunda .. 6=domingo
  d.setDate(d.getDate() - dow + offset * 7);
  return d;
}
const _segundaISO = (offset = 0) => _isoDe(_segundaDaSemana(offset));
// Data real de um dia-da-semana (k: 0=dom..6=sáb) dentro da semana do offset atual.
function _dataDoDia(k, offset = _semanaOffset) {
  const seg = _segundaDaSemana(offset);
  const delta = (k + 6) % 7;                   // segunda=0 .. domingo=6
  const d = new Date(seg); d.setDate(seg.getDate() + delta);
  return d;
}
// Objeto de disponibilidade EFETIVO da semana atual (só leitura): exceção ou padrão.
function _dispRead() {
  if (_semanaOffset === 0) return _cfg.disponibilidade || {};
  const wk = _cfg.semanas?.[_segundaISO(_semanaOffset)];
  return wk != null ? wk : (_cfg.disponibilidade || {});
}
// Objeto pra ESCREVER (materializa a exceção da semana a partir do padrão).
function _dispWrite() {
  if (_semanaOffset === 0) return (_cfg.disponibilidade ||= {});
  if (!_cfg.semanas) _cfg.semanas = {};
  const key = _segundaISO(_semanaOffset);
  if (_cfg.semanas[key] == null) _cfg.semanas[key] = JSON.parse(JSON.stringify(_cfg.disponibilidade || {}));
  return _cfg.semanas[key];
}
const _temExcecao = () => _semanaOffset > 0 && _cfg.semanas?.[_segundaISO(_semanaOffset)] != null;
const _horasDoDia = k => (_dispRead()?.[String(k)] || []).slice().sort();
// Rótulo da semana: "Toda semana (padrão)" no offset 0, senão "01–07 set".
const _MESES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function _labelSemana() {
  if (_semanaOffset === 0) return 'Toda semana (padrão)';
  const seg = _segundaDaSemana(_semanaOffset);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  const mA = _MESES3[seg.getMonth()], mB = _MESES3[dom.getMonth()];
  return mA === mB
    ? `${_pad2(seg.getDate())}–${_pad2(dom.getDate())} ${mB}`
    : `${_pad2(seg.getDate())} ${mA} – ${_pad2(dom.getDate())} ${mB}`;
}

// ─── NOVOS AGENDAMENTOS (feitos pelos clientes) ──────────────
// Marca quais agendamentos o dono já viu (localStorage por aparelho). Quando
// chega um novo pelo link, mostra um popup na abertura do app.
const _VISTOS_KEY = 'falcon_ag_vistos';
function _vistosSet() { try { return new Set(JSON.parse(localStorage.getItem(_VISTOS_KEY) || '[]')); } catch { return new Set(); } }
export function marcarAgendamentoVisto(id) {
  if (!id) return;
  const s = _vistosSet(); s.add(id);
  try { localStorage.setItem(_VISTOS_KEY, JSON.stringify([...s].slice(-800))); } catch {}
}
function _marcarVistos(ids) { const s = _vistosSet(); ids.forEach(i => s.add(i)); try { localStorage.setItem(_VISTOS_KEY, JSON.stringify([...s].slice(-800))); } catch {} }

// Checa se há agendamentos novos (do cliente, ainda não vistos) e mostra o popup.
// Na PRIMEIRA vez cria a linha de base (marca tudo como visto, sem popup).
export async function checarNovosAgendamentos() {
  let todos = [];
  try { todos = await getAgendamentosTodos(); } catch { return; }
  const hoje = _hojeISO();
  const relevantes = todos.filter(a => a.status === 'confirmado' && a.data >= hoje);
  const primeiraVez = localStorage.getItem(_VISTOS_KEY) == null;
  if (primeiraVez) { _marcarVistos(relevantes.map(a => a.id)); return; }
  const seen = _vistosSet();
  const novos = relevantes.filter(a => !seen.has(a.id))
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  if (!novos.length) return;
  _popupNovosAgendamentos(novos);
}

function _popupNovosAgendamentos(novos) {
  if (document.getElementById('ag-novos-ov')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ag-novos-ov';
  ov.innerHTML = `<div class="modal ag-novos">
    <div class="ag-novos-head">📅 ${novos.length === 1 ? 'Novo agendamento!' : `${novos.length} novos agendamentos!`}</div>
    <div class="ag-novos-sub">Um cliente marcou pelo seu link da Agenda:</div>
    <div class="ag-novos-lista">
      ${novos.map(a => { const fim = _fimHora(a.hora, a.duracao_min); return `<div class="ag-novos-item">
        <div class="ag-novos-nome">${_esc(a.cliente_nome)}</div>
        ${a.servico ? `<div class="ag-novos-serv">💆 ${_esc(a.servico)}</div>` : ''}
        <div class="ag-novos-quando">${_fmtDataLonga(a.data)} · <b>${_esc(a.hora)}${fim ? `–${fim}` : ''}</b></div>
      </div>`; }).join('')}
    </div>
    <div class="modal-actions"><button class="btn-primary" id="ag-novos-ok" type="button">Entendi</button></div>
  </div>`;
  document.body.appendChild(ov);
  const fechar = () => { _marcarVistos(novos.map(a => a.id)); close(); };
  const close = trapModalBack(() => ov.remove());
  ov.querySelector('#ag-novos-ok').onclick = fechar;
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
}

export async function abrirAgenda() {
  _diaSel = new Date().getDay(); // começa no dia de hoje
  _semanaOffset = 0;             // começa na semana atual (padrão)
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'agenda-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) _close?.(); });
  _close = trapModalBack(() => ov.remove());
  try {
    [_cfg, _ags, _todos] = await Promise.all([getAgendaConfig(), getAgendamentos().catch(() => []), getAgendamentosTodos().catch(() => [])]);
    if (!_cfg.disponibilidade || typeof _cfg.disponibilidade !== 'object') _cfg.disponibilidade = {};
    if (!_cfg.semanas || typeof _cfg.semanas !== 'object') _cfg.semanas = {};
    if (!Array.isArray(_cfg.servicos)) _cfg.servicos = [];
    sincronizarCompromissos().catch(() => {}); // garante que os recebidos viraram compromissos no Ritual
    _marcarVistos((_todos || []).map(a => a.id));   // abriu a agenda = viu os agendamentos
  } catch (e) {
    const c = ov.querySelector('.ag-corpo');
    if (c) c.innerHTML = `<div class="ag-erro">Não deu pra carregar a agenda.<br><small>${_esc(e.message)}</small><br><br><small>Se aparecer erro de tabela/função, o SQL da agenda ainda não foi rodado no Supabase.</small></div>`;
    return;
  }
  desenhar();
}

function desenhar() {
  const corpo = document.querySelector('#agenda-ov .ag-corpo');
  if (!corpo) return;
  const clientesHtml = _clientesHtml();

  corpo.innerHTML = `
    <div class="ag-header">
      <div class="ag-title">📅 Agenda Online</div>
      <button class="ag-fechar" id="ag-close" type="button">Fechar</button>
    </div>
    <div class="ag-scroll">
      <label class="input-field"><div class="input-field-label">Título (o que o cliente vê)</div>
        <input id="ag-titulo" value="${_esc(_cfg.titulo || '')}" placeholder="Ex: Agende sua sessão"></label>
      <label class="input-field"><div class="input-field-label">📍 Endereço de atendimento <span class="ag-lbl-opt">— aparece pro cliente ao agendar</span></div>
        <input id="ag-endereco" value="${_esc(_cfg.endereco || '')}" placeholder="Ex: Rua das Flores, 123 — Centro, Porto Alegre"></label>
      <label class="input-field"><div class="input-field-label">Duração padrão (quando o cliente não escolhe um serviço)</div>
        <select id="ag-dur">
          ${[30, 45, 60, 90, 120].map(m => `<option value="${m}" ${_cfg.duracao_min === m ? 'selected' : ''}>${m} min</option>`).join('')}
        </select></label>

      <div class="input-field-label" style="margin-top:12px">Serviços que você oferece <span class="ag-lbl-opt">— o cliente escolhe e a duração vem daqui</span></div>
      <div class="ag-servs" id="ag-servs"></div>
      <button class="ag-serv-add-btn" id="ag-serv-add" type="button">➕ Adicionar serviço</button>

      <div class="input-field-label" style="margin-top:14px">Horários que você deixa livres pro cliente marcar <span class="ag-lbl-opt">— use as setas pra abrir semanas futuras</span></div>
      <div class="ag-sem-nav">
        <button class="ag-sem-arrow" id="ag-sem-prev" type="button" aria-label="Semana anterior">‹</button>
        <div class="ag-sem-label" id="ag-sem-label">Toda semana (padrão)</div>
        <button class="ag-sem-arrow" id="ag-sem-next" type="button" aria-label="Próxima semana">›</button>
      </div>
      <div class="ag-sem-hint" id="ag-sem-hint"></div>
      <div class="ag-tabs" id="ag-tabs">
        ${DOWS.map(d => `<button class="ag-tab" data-tab="${d.k}" type="button"><span class="ag-tab-dow">${d.lbl}</span><span class="ag-tab-data"></span><i class="ag-tab-dot"></i></button>`).join('')}
      </div>
      <div class="ag-dia-editor" id="ag-dia-editor"></div>

      <label class="ag-ativar">
        <input type="checkbox" id="ag-ativo" ${_cfg.ativo ? 'checked' : ''}>
        <span><b>Agenda ativa</b> — ligada, o link funciona e as pessoas podem agendar.</span>
      </label>

      <div class="input-field-label" style="margin-top:12px">Seu link (põe na bio do Instagram)</div>
      <div class="ag-link-box">
        <input id="ag-link" readonly value="${_esc(_linkPublico())}">
        <button id="ag-copiar" class="btn-secondary" type="button">Copiar</button>
      </div>

      <div class="input-field-label" style="margin-top:14px">📅 Próximos atendimentos</div>
      <div class="ag-lista">${_proximosHtml()}</div>

      <div class="ag-ags-top">
        <div class="input-field-label" style="margin:0">👥 Clientes</div>
      </div>
      <div class="ag-lista">${clientesHtml}</div>
    </div>
    <div class="ag-rodape">
      <button class="btn-primary" id="ag-salvar" type="button">Salvar</button>
    </div>`;
  wireFixos(corpo);
  pintarTabs();
  pintarDiaEditor();
  pintarServicos();
}

// Handlers que existem uma vez só (tabs, fechar, copiar, salvar, cancelar).
function wireFixos(corpo) {
  corpo.querySelector('#ag-close').onclick = () => _close?.();
  corpo.querySelectorAll('.ag-tab').forEach(t => {
    t.addEventListener('click', () => { _diaSel = parseInt(t.dataset.tab, 10); pintarTabs(); pintarDiaEditor(); });
  });
  // Setas de navegação de semana (‹ ›): offset 0 = padrão; ≥1 = semana específica.
  corpo.querySelector('#ag-sem-prev').onclick = () => { if (_semanaOffset > 0) { _semanaOffset--; pintarTabs(); pintarDiaEditor(); } };
  corpo.querySelector('#ag-sem-next').onclick = () => { if (_semanaOffset < 13) { _semanaOffset++; pintarTabs(); pintarDiaEditor(); } };
  corpo.querySelector('#ag-copiar').onclick = async () => {
    const inp = corpo.querySelector('#ag-link');
    try { await navigator.clipboard.writeText(inp.value); showToast('🔗 Link copiado!', 'success'); }
    catch { inp.focus(); inp.select(); showToast('Segure no link e copie', 'info'); }
  };
  corpo.querySelectorAll('[data-cancel]').forEach(b => {
    b.addEventListener('click', async () => {
      try {
        await cancelarAgendamento(b.dataset.cancel);
        _ags = _ags.filter(a => a.id !== b.dataset.cancel);
        desenhar();
        showToast('Agendamento cancelado', 'info');
      } catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
  });
  corpo.querySelector('#ag-add-ag')?.addEventListener('click', () => _formAgendamento(null));
  corpo.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); _formAgendamento(_todos.find(a => a.id === b.dataset.edit)); });
  });
  corpo.querySelectorAll('[data-detalhe]').forEach(row => {
    row.addEventListener('click', () => { const a = _todos.find(x => x.id === row.dataset.detalhe); if (a) abrirDetalheAtendimento(a); });
  });
  corpo.querySelectorAll('[data-edit-zap]').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); const c = _clientes().find(x => x.key === b.dataset.editZap); if (c) _editarZapCliente(c); });
  });
  corpo.querySelectorAll('[data-hist-cli]').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); const c = _clientes().find(x => x.key === b.dataset.histCli); if (c) _popupHistoricoCliente(c); });
  });
  corpo.querySelectorAll('[data-cli-toggle]').forEach(top => {
    top.addEventListener('click', (e) => {
      if (e.target.closest('.ag-cli-zap')) return;   // clicou no WhatsApp: deixa abrir o link
      const cli = top.closest('.ag-cli');
      const hist = cli?.querySelector('.ag-cli-hist');
      if (hist) { hist.hidden = !hist.hidden; cli.classList.toggle('aberto', !hist.hidden); }
    });
  });
  corpo.querySelector('#ag-serv-add').onclick = () => {
    _syncServicos();
    _cfg.servicos.push({ id: _sid(), nome: '', duracaoMin: 60, preco: null });
    pintarServicos();
  };
  corpo.querySelector('#ag-salvar').onclick = salvar;
}

// Lê os inputs das linhas de serviço de volta pro _cfg.servicos (antes de re-render/salvar).
function _syncServicos() {
  const box = document.querySelector('#ag-servs');
  if (!box) return;
  box.querySelectorAll('.ag-serv').forEach(row => {
    const s = _cfg.servicos.find(x => x.id === row.dataset.sid);
    if (!s) return;
    s.nome = row.querySelector('.ag-serv-nome').value;
    s.duracaoMin = parseInt(row.querySelector('.ag-serv-dur').value, 10) || 60;
    const p = row.querySelector('.ag-serv-preco').value.replace(',', '.').trim();
    s.preco = p === '' ? null : Number(p);
  });
}

function pintarServicos() {
  const box = document.querySelector('#ag-servs');
  if (!box) return;
  box.innerHTML = _cfg.servicos.length ? _cfg.servicos.map(s => `
    <div class="ag-serv" data-sid="${s.id}">
      <input class="ag-serv-nome" value="${_esc(s.nome || '')}" placeholder="Nome do serviço (ex: Massagem relaxante)">
      <div class="ag-serv-linha">
        <span class="ag-serv-lb">⏱️</span>
        <input class="ag-serv-dur" type="number" inputmode="numeric" min="10" step="5" value="${s.duracaoMin || 60}"><span class="ag-serv-un">min</span>
        <span class="ag-serv-lb">R$</span>
        <input class="ag-serv-preco" type="text" inputmode="decimal" value="${_preco(s.preco)}" placeholder="0,00">
        <button class="ag-serv-x" data-rm-serv="${s.id}" type="button" aria-label="Remover">✕</button>
      </div>
    </div>`).join('') : '<div class="ag-serv-vazio">Nenhum serviço ainda. Sem serviços, o cliente agenda com a duração padrão.</div>';
  box.querySelectorAll('[data-rm-serv]').forEach(b => b.onclick = () => {
    _syncServicos();
    _cfg.servicos = _cfg.servicos.filter(s => s.id !== b.dataset.rmServ);
    pintarServicos();
  });
}

function pintarTabs() {
  const root = document.querySelector('#agenda-ov');
  if (!root) return;
  // Cabeçalho da semana
  const lab = root.querySelector('#ag-sem-label'); if (lab) lab.textContent = _labelSemana();
  const prev = root.querySelector('#ag-sem-prev'); if (prev) prev.disabled = _semanaOffset === 0;
  const hint = root.querySelector('#ag-sem-hint');
  if (hint) {
    if (_semanaOffset === 0) hint.textContent = 'Estes horários se repetem em todas as semanas — salvo nas que você ajustar aqui do lado.';
    else if (_temExcecao()) hint.textContent = 'Semana personalizada — vale só pra esta semana.';
    else hint.textContent = 'Seguindo o padrão. Edite pra deixar horários diferentes só nesta semana.';
  }
  // Abas com o dia + a data real da semana selecionada
  root.querySelectorAll('.ag-tab').forEach(t => {
    const k = parseInt(t.dataset.tab, 10);
    t.classList.toggle('ativo', k === _diaSel);
    t.querySelector('.ag-tab-dot').style.opacity = _horasDoDia(k).length ? '1' : '0';
    const dataEl = t.querySelector('.ag-tab-data');
    if (dataEl) dataEl.textContent = _semanaOffset === 0 ? '' : _pad2(_dataDoDia(k).getDate());
  });
}

function pintarDiaEditor() {
  const box = document.querySelector('#ag-dia-editor');
  if (!box) return;
  const times = _horasDoDia(_diaSel);
  const g = { manha: [], tarde: [], noite: [] };
  times.forEach(h => g[_turno(h)].push(h));
  const bloco = (lbl, icon, arr) => arr.length ? `
    <div class="ag-turno">
      <div class="ag-turno-lbl">${icon} ${lbl}</div>
      <div class="ag-chips">${arr.map(h => `<span class="ag-chip">${h}<button data-rm="${h}" type="button" aria-label="remover">✕</button></span>`).join('')}</div>
    </div>` : '';
  const diaFull = DOWS.find(d => d.k === _diaSel)?.full || '';
  const nome = _semanaOffset === 0 ? diaFull : `${diaFull} ${_pad2(_dataDoDia(_diaSel).getDate())}/${_pad2(_dataDoDia(_diaSel).getMonth() + 1)}`;
  box.innerHTML = `
    <div class="ag-dia-nome">${nome}</div>
    ${times.length
      ? bloco('Manhã', '🌅', g.manha) + bloco('Tarde', '☀️', g.tarde) + bloco('Noite', '🌙', g.noite)
      : '<div class="ag-vazio-dia">Nenhum horário neste dia ainda.</div>'}
    <div class="ag-add">
      <button class="btn-secondary" id="ag-add-btn" type="button">+ Adicionar horário</button>
    </div>
    <div class="ag-dia-acoes">
      ${times.length ? '<button class="ag-linkbtn danger" id="ag-limpar" type="button">Limpar dia</button>' : ''}
      ${_semanaOffset > 0 ? '<button class="ag-linkbtn" id="ag-copiar-sem" type="button">📋 Copiar da semana anterior</button>' : ''}
      ${_temExcecao() ? '<button class="ag-linkbtn" id="ag-voltar-padrao" type="button">↩️ Voltar ao padrão nesta semana</button>' : ''}
    </div>`;
  wireEditor(box);
}

function wireEditor(box) {
  box.querySelector('#ag-add-btn').onclick = async () => {
    const nome = DOWS.find(d => d.k === _diaSel)?.full || '';
    const h = await openTimePicker('09:00', { title: `Novo horário — ${nome}` });
    if (!h) return;
    const dia = String(_diaSel);
    const disp = _dispWrite();
    const arr = disp[dia] || [];
    if (arr.includes(h)) { showToast('Esse horário já está no dia', 'info'); return; }
    arr.push(h); arr.sort();
    disp[dia] = arr;
    pintarTabs(); pintarDiaEditor();
  };
  box.querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = () => {
      const dia = String(_diaSel);
      const disp = _dispWrite();
      disp[dia] = (disp[dia] || []).filter(h => h !== b.dataset.rm);
      if (!disp[dia].length) delete disp[dia];
      pintarTabs(); pintarDiaEditor();
    };
  });
  const lim = box.querySelector('#ag-limpar');
  if (lim) lim.onclick = () => { const disp = _dispWrite(); delete disp[String(_diaSel)]; pintarTabs(); pintarDiaEditor(); };
  // Copiar os horários da semana ANTERIOR (exceção dela, ou o padrão) pra esta semana
  const cop = box.querySelector('#ag-copiar-sem');
  if (cop) cop.onclick = () => {
    const antKey = _segundaISO(_semanaOffset - 1);
    const fonte = _semanaOffset - 1 === 0
      ? (_cfg.disponibilidade || {})
      : (_cfg.semanas?.[antKey] != null ? _cfg.semanas[antKey] : (_cfg.disponibilidade || {}));
    _cfg.semanas[_segundaISO(_semanaOffset)] = JSON.parse(JSON.stringify(fonte));
    pintarTabs(); pintarDiaEditor();
    showToast('Horários copiados da semana anterior', 'success');
  };
  // Descartar a exceção → esta semana volta a seguir o padrão
  const volta = box.querySelector('#ag-voltar-padrao');
  if (volta) volta.onclick = () => { delete _cfg.semanas[_segundaISO(_semanaOffset)]; pintarTabs(); pintarDiaEditor(); showToast('Semana voltou ao padrão', 'info'); };
}

// Abre o form de agendamento a partir de FORA (ex.: do Ritual), carregando a
// config/clientes se preciso. dataISO pré-preenche o dia; onSaved roda após salvar.
export async function abrirAgendamentoCliente({ dataISO, onSaved } = {}) {
  try {
    if (!_cfg) [_cfg, _todos] = await Promise.all([getAgendaConfig(), getAgendamentosTodos().catch(() => [])]);
    if (!Array.isArray(_cfg.servicos)) _cfg.servicos = [];
  } catch (e) { showToast('Não deu pra abrir a agenda: ' + e.message, 'error'); return; }
  _formAgendamento(null, { dataISO, onSaved });
}

// Tela de detalhe de um atendimento (tipo o print): status, WhatsApp, lembrete,
// editar, finalizar/faltou, excluir. Chamável do card Clientes e do Ritual.
export async function abrirDetalheAtendimento(agOrId) {
  let ag = agOrId;
  if (typeof agOrId === 'string') {
    ag = _todos.find(a => a.id === agOrId) || await getAgendamentoById(agOrId).catch(() => null);
    if (!ag) { showToast('Atendimento não encontrado', 'error'); return; }
  }
  if (!_cfg) { try { [_cfg, _todos] = await Promise.all([getAgendaConfig(), getAgendamentosTodos().catch(() => [])]); } catch {} }
  if (!Array.isArray(_cfg?.servicos)) { if (_cfg) _cfg.servicos = []; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ag-det-ov';
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

  async function recarregar() {
    [_ags, _todos] = await Promise.all([getAgendamentos().catch(() => _ags), getAgendamentosTodos().catch(() => _todos)]);
    if (document.querySelector('#agenda-ov .ag-corpo')) desenhar();
    else if (location.hash.startsWith('#/ritual')) { try { forceRender(); } catch {} }   // reflete no Ritual aberto
  }
  function draw() {
    const wa = _waLink(ag.cliente_contato);
    const fim = _fimHora(ag.hora, ag.duracao_min);
    const stLbl = { confirmado: '🕐 Agendado', finalizado: '✅ Finalizado', faltou: '🚫 Faltou' }[ag.status] || ag.status;
    ov.innerHTML = `<div class="modal ag-det"><div class="ag-det-corpo">
      <div class="ag-det-head"><div class="ag-det-t">📅 Atendimento</div><button class="ag-fechar" id="agd-close" type="button">Fechar</button></div>
      <div class="ag-det-dt">${_fmtDataLonga(ag.data)} · <b>${_esc(ag.hora)}${fim ? `–${fim}` : ''}</b></div>
      <span class="ag-det-status st-${ag.status}">${stLbl}</span>
      <div class="ag-det-cli">
        <div class="ag-det-cli-nome"><b>${_esc(ag.cliente_nome)}</b>${ag.cliente_contato ? `<small>${_esc(ag.cliente_contato)}</small>` : '<small class="ag-sem-zap">sem WhatsApp</small>'}</div>
      </div>
      ${ag.servico ? `<div class="ag-det-serv">💆 ${_esc(ag.servico)}${ag.preco != null ? ` · <b>R$ ${_preco(ag.preco)}</b>` : ''}</div>` : ''}
      ${_cfg?.endereco ? `<div class="ag-det-serv">📍 ${_esc(_cfg.endereco)}</div>` : ''}
      <div class="ag-det-acoes">
        ${wa ? `<a class="ag-det-btn" href="${_waLembrete(ag)}" target="_blank" rel="noopener">🔔 Lembrete</a>` : ''}
        <button class="ag-det-btn" id="agd-editar" type="button">✏️ Reagendar / Editar</button>
        ${ag.status !== 'finalizado' ? '<button class="ag-det-btn ok" id="agd-finalizar" type="button">✅ Finalizar</button>' : ''}
        ${ag.status !== 'faltou' ? '<button class="ag-det-btn" id="agd-faltou" type="button">🚫 Faltou</button>' : ''}
        <button class="ag-det-btn danger" id="agd-excluir" type="button">🗑 Excluir</button>
      </div>
    </div></div>`;
    ov.querySelector('#agd-close').onclick = () => close();
    ov.querySelector('#agd-editar').onclick = () => { close(); _formAgendamento(ag, { onSaved: recarregar }); };
    ov.querySelector('#agd-finalizar')?.addEventListener('click', () => _setStatus('finalizado'));
    ov.querySelector('#agd-faltou')?.addEventListener('click', () => _setStatus('faltou'));
    ov.querySelector('#agd-excluir').onclick = async () => {
      try { await excluirAtendimento(ag); await recarregar(); close(); showToast('Atendimento excluído', 'info'); }
      catch (e) { showToast('Erro: ' + e.message, 'error'); }
    };
  }
  async function _setStatus(s) {
    try { await atualizarStatusAgendamento(ag.id, s); ag.status = s; await recarregar(); draw(); showToast(s === 'finalizado' ? '✅ Finalizado!' : 'Marcado como falta', 'success'); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  }
  draw();
}

// Abre DIRETO o form de edição de um atendimento (reagendar/serviço/nome+WhatsApp/
// cancelar) — sem passar pela tela de detalhe. Usado pelo "Editar" do Ritual.
export async function abrirEdicaoAtendimento(agOrId) {
  let ag = agOrId;
  try {
    if (!_cfg) [_cfg, _todos] = await Promise.all([getAgendaConfig(), getAgendamentosTodos().catch(() => [])]);
    if (!Array.isArray(_cfg.servicos)) _cfg.servicos = [];
  } catch (e) { showToast('Não deu pra abrir a agenda: ' + e.message, 'error'); return; }
  if (typeof agOrId === 'string') {
    ag = _todos.find(a => a.id === agOrId) || await getAgendamentoById(agOrId).catch(() => null);
    if (!ag) { showToast('Atendimento não encontrado', 'error'); return; }
  }
  _formAgendamento(ag, { onSaved: async () => {
    [_ags, _todos] = await Promise.all([getAgendamentos().catch(() => _ags), getAgendamentosTodos().catch(() => _todos)]);
    if (document.querySelector('#agenda-ov .ag-corpo')) desenhar();
    else if (location.hash.startsWith('#/ritual')) { try { forceRender(); } catch {} }
  } });
}

// Form do PROFISSIONAL pra criar (ag=null) ou editar um agendamento.
async function _formAgendamento(ag, opts = {}) {
  const isEdit = !!ag;
  const servs = _cfg.servicos || [];
  const _sidIni = (ag?.servico && (servs.find(s => s.nome === ag.servico)?.id)) || '';
  const st = {
    id: ag?.id || null,
    data: ag?.data || opts.dataISO || _hojeISO(),
    hora: ag?.hora || '09:00',
    servicoId: _sidIni,
    dur: ag?.duracao_min || (servs.find(s => s.id === _sidIni)?.duracaoMin) || 60,
  };
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ag-form-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">${isEdit ? '✏️ Editar agendamento' : '➕ Novo agendamento'}</div>
    ${!isEdit && _clientes().length ? `<label class="input-field"><div class="input-field-label">Cliente já cadastrado?</div>
      <select id="agf-cli"><option value="">— novo cliente —</option>
        ${_clientes().map(c => `<option value="${_esc(c.key)}">${_esc(c.nome)}${c.contato ? ` · ${_esc(c.contato)}` : ''}</option>`).join('')}
      </select></label>` : ''}
    <label class="input-field"><div class="input-field-label">Nome do cliente</div>
      <input id="agf-nome" value="${_esc(ag?.cliente_nome || '')}" placeholder="Nome"></label>
    <label class="input-field"><div class="input-field-label">WhatsApp</div>
      <input id="agf-zap" inputmode="tel" value="${_esc(ag?.cliente_contato || '')}" placeholder="(DDD) 9 9999-9999"></label>
    ${servs.length ? `<label class="input-field"><div class="input-field-label">Serviço</div>
      <select id="agf-serv"><option value="">— sem serviço —</option>
        ${servs.map(s => `<option value="${_esc(s.id)}" ${st.servicoId === s.id ? 'selected' : ''}>${_esc(s.nome)} · ${s.duracaoMin || 60}min${s.preco != null ? ` · R$ ${_preco(s.preco)}` : ''}</option>`).join('')}
      </select></label>` : ''}
    <div class="ag-frow">
      <label class="input-field" style="flex:1"><div class="input-field-label">Data</div>
        <input id="agf-data" type="date" value="${st.data}"></label>
      <div class="input-field" style="flex:1"><div class="input-field-label">Hora início</div>
        <button class="ag-hora-btn" id="agf-hora" type="button">${st.hora}</button></div>
    </div>
    <div class="ag-frow">
      <label class="input-field" style="flex:1"><div class="input-field-label">Duração (min)</div>
        <input id="agf-dur" type="number" inputmode="numeric" min="10" step="5" value="${st.dur}"></label>
      <div class="input-field" style="flex:1"><div class="input-field-label">Termina</div>
        <div class="ag-fim-view" id="agf-fim">${_fimHora(st.hora, st.dur) || '—'}</div></div>
    </div>
    ${isEdit ? '<button class="ag-linkbtn danger" id="agf-cancelar-atend" type="button" style="margin:2px 0 10px">🗑 Cancelar este atendimento</button>' : ''}
    <div class="ag-fbtns">
      <button class="btn-secondary" id="agf-cancelar" type="button">Fechar</button>
      <button class="btn-primary" id="agf-salvar" type="button">${isEdit ? 'Salvar' : 'Adicionar'}</button>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#agf-cli')?.addEventListener('change', (e) => {
    const c = _clientes().find(x => x.key === e.target.value);
    if (c) { ov.querySelector('#agf-nome').value = c.nome || ''; ov.querySelector('#agf-zap').value = c.contato || ''; }
  });
  ov.querySelector('#agf-cancelar').onclick = () => close();
  ov.querySelector('#agf-cancelar-atend')?.addEventListener('click', async () => {
    try {
      await cancelarAgendamento(st.id);
      [_ags, _todos] = await Promise.all([getAgendamentos().catch(() => _ags), getAgendamentosTodos().catch(() => _todos)]);
      close(); desenhar(); showToast('Atendimento cancelado', 'info');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
  const upFim = () => { const el = ov.querySelector('#agf-fim'); if (el) el.textContent = _fimHora(st.hora, st.dur) || '—'; };
  ov.querySelector('#agf-hora').onclick = async () => {
    const h = await openTimePicker(st.hora, { title: 'Horário de início' });
    if (h) { st.hora = h; ov.querySelector('#agf-hora').textContent = h; upFim(); }
  };
  ov.querySelector('#agf-dur')?.addEventListener('input', (e) => { st.dur = parseInt(e.target.value, 10) || 0; upFim(); });
  ov.querySelector('#agf-serv')?.addEventListener('change', (e) => {
    const s = servs.find(x => x.id === e.target.value);
    if (s && s.duracaoMin) { st.dur = s.duracaoMin; const di = ov.querySelector('#agf-dur'); if (di) di.value = s.duracaoMin; upFim(); }
  });
  ov.querySelector('#agf-salvar').onclick = async () => {
    const nome = ov.querySelector('#agf-nome').value.trim();
    const zap = ov.querySelector('#agf-zap').value.trim();
    const data = ov.querySelector('#agf-data').value;
    const servId = ov.querySelector('#agf-serv')?.value || '';
    if (nome.length < 2) { showToast('Escreva o nome do cliente', 'info'); return; }
    if (!data) { showToast('Escolha a data', 'info'); return; }
    const serv = servs.find(s => s.id === servId) || null;
    const dur = parseInt(ov.querySelector('#agf-dur')?.value, 10) || serv?.duracaoMin || null;
    const btn = ov.querySelector('#agf-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const patch = {
        id: st.id, data, hora: st.hora, cliente_nome: nome, cliente_contato: zap,
        servico: serv?.nome || null, preco: serv?.preco ?? null, duracao_min: dur,
      };
      const savedId = await salvarAgendamentoManual(patch);
      marcarAgendamentoVisto(st.id || savedId);   // o dono criou/editou → não é "novo"
      if (st.id) await sincronizarTaskDoAgendamento(patch, ag?.data).catch(() => {});
      else await sincronizarCompromissos().catch(() => {});
      [_ags, _todos] = await Promise.all([getAgendamentos().catch(() => _ags), getAgendamentosTodos().catch(() => _todos)]);
      close();
      if (opts.onSaved) { try { await opts.onSaved(); } catch {} } else { desenhar(); }
      showToast(st.id ? '✅ Agendamento atualizado' : '✅ Agendamento adicionado', 'success');
    } catch (e) {
      showToast('Erro: ' + e.message, 'error');
      if (btn.isConnected) { btn.disabled = false; btn.textContent = st.id ? 'Salvar' : 'Adicionar'; }
    }
  };
}

async function salvar() {
  const corpo = document.querySelector('#agenda-ov .ag-corpo');
  if (!corpo) return;
  const titulo = corpo.querySelector('#ag-titulo').value.trim() || 'Agende comigo';
  const endereco = corpo.querySelector('#ag-endereco').value.trim() || null;
  const duracao_min = parseInt(corpo.querySelector('#ag-dur').value, 10) || 60;
  const ativo = corpo.querySelector('#ag-ativo').checked;
  // serviços: sincroniza inputs e mantém só os com nome
  _syncServicos();
  const servicos = _cfg.servicos
    .filter(s => (s.nome || '').trim())
    .map(s => ({ id: s.id, nome: s.nome.trim(), duracaoMin: parseInt(s.duracaoMin, 10) || 60, preco: (s.preco == null || s.preco === '') ? null : Number(s.preco) }));
  // limpa dias vazios do PADRÃO
  const disp = {};
  for (const k of Object.keys(_cfg.disponibilidade)) {
    const arr = (_cfg.disponibilidade[k] || []).slice().sort();
    if (arr.length) disp[k] = arr;
  }
  // exceções por SEMANA: descarta semanas passadas; mantém a semana mesmo vazia
  // (semana vazia = fechada de propósito, NÃO pode cair no padrão).
  const currentMon = _segundaISO(0);
  const semanas = {};
  for (const wk of Object.keys(_cfg.semanas || {})) {
    if (wk < currentMon) continue;
    const src = _cfg.semanas[wk] || {};
    const clean = {};
    for (const k of Object.keys(src)) {
      const arr = (src[k] || []).slice().sort();
      if (arr.length) clean[k] = arr;
    }
    semanas[wk] = clean;
  }
  if (ativo && Object.keys(disp).length === 0) {
    showToast('Adicione horários em ao menos um dia pra ativar', 'info'); return;
  }
  const btn = corpo.querySelector('#ag-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    await salvarAgendaConfig({ titulo, endereco, duracao_min, disponibilidade: disp, semanas, ativo, servicos });
    _cfg = { ..._cfg, titulo, endereco, duracao_min, disponibilidade: disp, semanas, ativo, servicos };
    showToast('✅ Agenda salva!', 'success');
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
  if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar'; }
}
