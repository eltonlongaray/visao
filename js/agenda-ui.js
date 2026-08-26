// ─── ÍNDICE ──────────────────────────────────────────────────
// Modal "Agenda disponível" (lado do DONO): define dias/horários livres +
// duração, copia o link público e vê/cancela os agendamentos recebidos.
// A página pública (onde o cliente agenda) é outro fluxo (Fase B).
// ─────────────────────────────────────────────────────────────
import { getAgendaConfig, salvarAgendaConfig, getAgendamentos, cancelarAgendamento } from './agenda.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const DOWS = [
  { k: 1, lbl: 'Segunda' }, { k: 2, lbl: 'Terça' }, { k: 3, lbl: 'Quarta' },
  { k: 4, lbl: 'Quinta' }, { k: 5, lbl: 'Sexta' }, { k: 6, lbl: 'Sábado' }, { k: 0, lbl: 'Domingo' },
];
let _cfg = null, _ags = [], _close = null;

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _fmtData = iso => { try { const [, m, d] = iso.split('-'); return `${d}/${m}`; } catch { return iso; } };
const _linkPublico = () => `${location.origin}${location.pathname}#/agenda/${_cfg.slug}`;

export async function abrirAgenda() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'agenda-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) _close?.(); });
  _close = trapModalBack(() => ov.remove());
  try {
    [_cfg, _ags] = await Promise.all([getAgendaConfig(), getAgendamentos().catch(() => [])]);
  } catch (e) {
    const c = ov.querySelector('.ag-corpo');
    if (c) c.innerHTML = `<div class="ag-erro">Não deu pra carregar a agenda.<br><small>${_esc(e.message)}</small><br><br><small>Se aparecer erro de tabela, o SQL da agenda ainda não foi rodado no Supabase.</small></div>`;
    return;
  }
  desenhar();
}

function desenhar() {
  const corpo = document.querySelector('#agenda-ov .ag-corpo');
  if (!corpo) return;
  const disp = _cfg.disponibilidade || {};
  const linhasDias = DOWS.map(d => {
    const on = !!disp[d.k];
    const ini = disp[d.k]?.inicio || '09:00';
    const fim = disp[d.k]?.fim || '18:00';
    return `<div class="ag-dia ${on ? '' : 'off'}" data-dow="${d.k}">
      <label class="ag-dia-chk"><input type="checkbox" ${on ? 'checked' : ''} data-dia-on="${d.k}"><span>${d.lbl}</span></label>
      <div class="ag-dia-horas">
        <input type="time" value="${ini}" data-dia-ini="${d.k}" ${on ? '' : 'disabled'}>
        <span>às</span>
        <input type="time" value="${fim}" data-dia-fim="${d.k}" ${on ? '' : 'disabled'}>
      </div>
    </div>`;
  }).join('');
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

      <div class="input-field-label" style="margin-top:10px">Seus dias e horários disponíveis</div>
      <div class="ag-dias">${linhasDias}</div>

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
  wire(corpo);
}

function wire(corpo) {
  corpo.querySelector('#ag-close').onclick = () => _close?.();
  corpo.querySelectorAll('[data-dia-on]').forEach(chk => {
    chk.addEventListener('change', () => {
      const dow = chk.dataset.diaOn;
      const row = corpo.querySelector(`.ag-dia[data-dow="${dow}"]`);
      row.classList.toggle('off', !chk.checked);
      row.querySelectorAll('input[type=time]').forEach(i => { i.disabled = !chk.checked; });
    });
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

async function salvar() {
  const corpo = document.querySelector('#agenda-ov .ag-corpo');
  if (!corpo) return;
  const titulo = corpo.querySelector('#ag-titulo').value.trim() || 'Agende comigo';
  const duracao_min = parseInt(corpo.querySelector('#ag-dur').value, 10) || 60;
  const ativo = corpo.querySelector('#ag-ativo').checked;
  const disp = {};
  for (const d of DOWS) {
    if (!corpo.querySelector(`[data-dia-on="${d.k}"]`).checked) continue;
    const ini = corpo.querySelector(`[data-dia-ini="${d.k}"]`).value;
    const fim = corpo.querySelector(`[data-dia-fim="${d.k}"]`).value;
    if (ini && fim && ini < fim) disp[d.k] = { inicio: ini, fim };
  }
  if (ativo && Object.keys(disp).length === 0) {
    showToast('Marque ao menos um dia com horário pra ativar', 'info'); return;
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
