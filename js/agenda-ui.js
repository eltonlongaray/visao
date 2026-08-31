// ─── ÍNDICE ──────────────────────────────────────────────────
// Modal "Agenda Online" (lado do DONO): escolhe UM dia por vez (abas),
// adiciona horários específicos (agrupados por turno: manhã/tarde/noite),
// pode repetir o dia na semana toda, copia o link público e vê/cancela
// os agendamentos. A página pública (cliente agenda) é a Fase B.
// ─────────────────────────────────────────────────────────────
import { getAgendaConfig, salvarAgendaConfig, getAgendamentos, cancelarAgendamento, sincronizarCompromissos, salvarAgendamentoManual, getAgendamentosTodos, atualizarStatusAgendamento, getAgendamentoById, excluirAtendimento, sincronizarTaskDoAgendamento, atualizarContatoCliente } from './agenda.js';
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
let _cfg = null, _ags = [], _todos = [], _close = null, _diaSel = 1;

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

// Editar/adicionar o WhatsApp de um cliente (atualiza TODOS os atendimentos dele).
async function _editarZapCliente(c) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ag-zap-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">💬 WhatsApp de ${_esc(c.nome)}</div>
    <label class="input-field"><div class="input-field-label">Número</div>
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
    const num = ov.querySelector('#agz-num').value.trim();
    const btn = ov.querySelector('#agz-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await atualizarContatoCliente(c.ags.map(a => a.id), num);
      _todos = await getAgendamentosTodos().catch(() => _todos);
      close(); desenhar(); showToast('✅ WhatsApp atualizado', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar'; } }
  };
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
          <button class="ag-cli-wa-ed" data-edit-zap="${_esc(c.key)}" type="button">✏️ ${c.contato ? 'Editar' : 'Adicionar'} WhatsApp</button>
        </div>
        <div class="ag-cli-hist-tit">Histórico</div>
        ${c.ags.map((a, i) => `<div class="ag-cli-h${i > 0 ? ' div' : ''}">
          <span>${_fmtData(a.data)} · ${_esc(a.hora)}${a.servico ? ` · ${_esc(a.servico)}` : ''}${a.status === 'finalizado' ? ' · ✅' : a.status === 'faltou' ? ' · 🚫' : ''}</span>
        </div>`).join('')}
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
function _waLembrete(ag) {
  const wa = _waLink(ag.cliente_contato); if (!wa) return null;
  const msg = `Oi ${ag.cliente_nome || ''}! Passando pra lembrar do seu atendimento em ${_fmtData(ag.data)} às ${ag.hora}${ag.servico ? ` (${ag.servico})` : ''}. Até lá! 🦅`;
  return `${wa}?text=${encodeURIComponent(msg)}`;
}
const _linkPublico = () => `${location.origin}/agenda-online/${_cfg.slug}`;
const _turno = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');
const _sid = () => 's' + Math.random().toString(36).slice(2, 8);
const _preco = v => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
const _horasDoDia = k => (_cfg.disponibilidade?.[String(k)] || []).slice().sort();
// true quando TODOS os dias têm exatamente os mesmos horários do dia atual (e não vazio)
function _todosIguais() {
  const cur = _horasDoDia(_diaSel).join(',');
  if (!cur) return false;
  return DOWS.every(d => _horasDoDia(d.k).join(',') === cur);
}

export async function abrirAgenda() {
  _diaSel = new Date().getDay(); // começa no dia de hoje
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
    if (!Array.isArray(_cfg.servicos)) _cfg.servicos = [];
    sincronizarCompromissos().catch(() => {}); // garante que os recebidos viraram compromissos no Ritual
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

      <div class="input-field-label" style="margin-top:14px">Horários disponíveis — escolha o dia e adicione os horários</div>
      <div class="ag-tabs" id="ag-tabs">
        ${DOWS.map(d => `<button class="ag-tab" data-tab="${d.k}" type="button"><span>${d.lbl}</span><i class="ag-tab-dot"></i></button>`).join('')}
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
  document.querySelectorAll('#agenda-ov .ag-tab').forEach(t => {
    const k = parseInt(t.dataset.tab, 10);
    t.classList.toggle('ativo', k === _diaSel);
    t.querySelector('.ag-tab-dot').style.opacity = _horasDoDia(k).length ? '1' : '0';
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
  const nome = DOWS.find(d => d.k === _diaSel)?.full || '';
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
    </div>`;
  wireEditor(box);
}

function wireEditor(box) {
  box.querySelector('#ag-add-btn').onclick = async () => {
    const nome = DOWS.find(d => d.k === _diaSel)?.full || '';
    const h = await openTimePicker('09:00', { title: `Novo horário — ${nome}` });
    if (!h) return;
    const dia = String(_diaSel);
    const arr = _cfg.disponibilidade[dia] || [];
    if (arr.includes(h)) { showToast('Esse horário já está no dia', 'info'); return; }
    arr.push(h); arr.sort();
    _cfg.disponibilidade[dia] = arr;
    pintarTabs(); pintarDiaEditor();
  };
  box.querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = () => {
      const dia = String(_diaSel);
      _cfg.disponibilidade[dia] = (_cfg.disponibilidade[dia] || []).filter(h => h !== b.dataset.rm);
      if (!_cfg.disponibilidade[dia].length) delete _cfg.disponibilidade[dia];
      pintarTabs(); pintarDiaEditor();
    };
  });
  const lim = box.querySelector('#ag-limpar');
  if (lim) lim.onclick = () => { delete _cfg.disponibilidade[String(_diaSel)]; pintarTabs(); pintarDiaEditor(); };
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
        <button class="ag-det-btn" id="agd-editar" type="button">✏️ Editar</button>
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
      await salvarAgendamentoManual(patch);
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
  // limpa dias vazios
  const disp = {};
  for (const k of Object.keys(_cfg.disponibilidade)) {
    const arr = (_cfg.disponibilidade[k] || []).slice().sort();
    if (arr.length) disp[k] = arr;
  }
  if (ativo && Object.keys(disp).length === 0) {
    showToast('Adicione horários em ao menos um dia pra ativar', 'info'); return;
  }
  const btn = corpo.querySelector('#ag-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    await salvarAgendaConfig({ titulo, endereco, duracao_min, disponibilidade: disp, ativo, servicos });
    _cfg = { ..._cfg, titulo, endereco, duracao_min, disponibilidade: disp, ativo, servicos };
    showToast('✅ Agenda salva!', 'success');
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
  if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar'; }
}
