// ─── ÍNDICE ──────────────────────────────────────────────────
// Modal "Agenda Online" (lado do DONO): escolhe UM dia por vez (abas),
// adiciona horários específicos (agrupados por turno: manhã/tarde/noite),
// pode repetir o dia na semana toda, copia o link público e vê/cancela
// os agendamentos. A página pública (cliente agenda) é a Fase B.
// ─────────────────────────────────────────────────────────────
import { getAgendaConfig, salvarAgendaConfig, getAgendamentos, cancelarAgendamento } from './agenda.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const DOWS = [
  { k: 1, lbl: 'Seg', full: 'Segunda' }, { k: 2, lbl: 'Ter', full: 'Terça' },
  { k: 3, lbl: 'Qua', full: 'Quarta' }, { k: 4, lbl: 'Qui', full: 'Quinta' },
  { k: 5, lbl: 'Sex', full: 'Sexta' }, { k: 6, lbl: 'Sáb', full: 'Sábado' },
  { k: 0, lbl: 'Dom', full: 'Domingo' },
];
let _cfg = null, _ags = [], _close = null, _diaSel = 1;

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _fmtData = iso => { try { const [, m, d] = iso.split('-'); return `${d}/${m}`; } catch { return iso; } };
const _linkPublico = () => `${location.origin}${location.pathname}#/agenda/${_cfg.slug}`;
const _turno = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');
function _norm(h) { const m = /^(\d{1,2}):?(\d{2})$/.exec((h || '').trim()); if (!m) return null; const hh = String(Math.min(23, +m[1])).padStart(2, '0'); const mm = String(Math.min(59, +m[2])).padStart(2, '0'); return `${hh}:${mm}`; }
const _horasDoDia = k => (_cfg.disponibilidade?.[String(k)] || []).slice().sort();

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
    [_cfg, _ags] = await Promise.all([getAgendaConfig(), getAgendamentos().catch(() => [])]);
    if (!_cfg.disponibilidade || typeof _cfg.disponibilidade !== 'object') _cfg.disponibilidade = {};
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
  const agsHtml = _ags.length ? _ags.map(a => `
    <div class="ag-item">
      <div class="ag-item-info">
        <b>${_esc(a.cliente_nome)}</b>
        <small>${_fmtData(a.data)} · ${_esc(a.hora)}${a.cliente_contato ? ` · ${_esc(a.cliente_contato)}` : ''}</small>
      </div>
      <button class="ag-item-x" data-cancel="${_esc(a.id)}" title="Cancelar" aria-label="Cancelar">✕</button>
    </div>`).join('') : '<div class="ag-vazio">Nenhum agendamento ainda.</div>';

  corpo.innerHTML = `
    <div class="ag-header">
      <div class="ag-title">📅 Agenda Online</div>
      <button class="ag-fechar" id="ag-close" type="button">Fechar</button>
    </div>
    <div class="ag-scroll">
      <label class="input-field"><div class="input-field-label">Título (o que o cliente vê)</div>
        <input id="ag-titulo" value="${_esc(_cfg.titulo || '')}" placeholder="Ex: Agende sua sessão"></label>
      <label class="input-field"><div class="input-field-label">Duração de cada atendimento</div>
        <select id="ag-dur">
          ${[30, 45, 60, 90, 120].map(m => `<option value="${m}" ${_cfg.duracao_min === m ? 'selected' : ''}>${m} min</option>`).join('')}
        </select></label>

      <div class="input-field-label" style="margin-top:12px">Horários disponíveis — escolha o dia e adicione os horários</div>
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

      <div class="input-field-label" style="margin-top:14px">Agendamentos recebidos</div>
      <div class="ag-lista">${agsHtml}</div>
    </div>
    <div class="ag-rodape">
      <button class="btn-primary" id="ag-salvar" type="button">Salvar</button>
    </div>`;
  wireFixos(corpo);
  pintarTabs();
  pintarDiaEditor();
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
  corpo.querySelector('#ag-salvar').onclick = salvar;
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
      <input type="time" id="ag-add-hora" value="09:00">
      <button class="btn-secondary" id="ag-add-btn" type="button">+ Adicionar horário</button>
    </div>
    <div class="ag-dia-acoes">
      <button class="ag-linkbtn" id="ag-repetir" type="button">🔁 Repetir na semana toda</button>
      ${times.length ? '<button class="ag-linkbtn danger" id="ag-limpar" type="button">Limpar dia</button>' : ''}
    </div>`;
  wireEditor(box);
}

function wireEditor(box) {
  box.querySelector('#ag-add-btn').onclick = () => {
    const h = _norm(box.querySelector('#ag-add-hora').value);
    if (!h) { showToast('Horário inválido', 'info'); return; }
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
  const rep = box.querySelector('#ag-repetir');
  if (rep) rep.onclick = () => {
    const arr = _horasDoDia(_diaSel);
    if (!arr.length) { showToast('Adicione horários neste dia primeiro', 'info'); return; }
    for (const d of DOWS) _cfg.disponibilidade[String(d.k)] = arr.slice();
    pintarTabs(); pintarDiaEditor();
    showToast('🔁 Horários repetidos na semana toda', 'success');
  };
  const lim = box.querySelector('#ag-limpar');
  if (lim) lim.onclick = () => { delete _cfg.disponibilidade[String(_diaSel)]; pintarTabs(); pintarDiaEditor(); };
}

async function salvar() {
  const corpo = document.querySelector('#agenda-ov .ag-corpo');
  if (!corpo) return;
  const titulo = corpo.querySelector('#ag-titulo').value.trim() || 'Agende comigo';
  const duracao_min = parseInt(corpo.querySelector('#ag-dur').value, 10) || 60;
  const ativo = corpo.querySelector('#ag-ativo').checked;
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
    await salvarAgendaConfig({ titulo, duracao_min, disponibilidade: disp, ativo });
    _cfg = { ..._cfg, titulo, duracao_min, disponibilidade: disp, ativo };
    showToast('✅ Agenda salva!', 'success');
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
  if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar'; }
}
