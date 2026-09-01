// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA de agendamento (Fase B) — abre pelo link da bio, SEM login.
// Visitante vê os dias/horários livres do dono (via slug) e agenda com
// nome + WhatsApp. Usa só as funções anônimas de agenda.js (RPCs seguras).
// ─────────────────────────────────────────────────────────────
import { getAgendaPublica, getSlotsOcupados, criarAgendamento, cancelarAgendamentoPublico } from './agenda-publica-dados.js';

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SEM3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _turno = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');
const _fromIso = s => { const [y, m, d] = (s || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const _precoTxt = p => (p == null ? '' : Number(p).toFixed(2).replace('.', ','));
const _fim = (hora, dur) => { if (!dur) return null; const [h, m] = hora.split(':').map(Number); const t = h * 60 + m + dur; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
// Segunda-feira (ISO) da semana de uma data — bate com date_trunc('week') do Postgres.
const _segISO = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return iso(x); };
// Horários efetivos de um dia: se a SEMANA tem exceção (cfg.semanas[segunda]),
// usa ela (mesmo vazia = dia fechado); senão cai no padrão (disponibilidade[dow]).
const _horariosDoDia = (cfg, d) => {
  const wk = cfg.semanas && cfg.semanas[_segISO(d)];
  const base = wk != null ? wk : (cfg.disponibilidade || {});
  return (base[String(d.getDay())] || []).slice().sort();
};

// Histórico do cliente NO APARELHO dele (localStorage por slug). Sem conta, sem servidor.
const _histKey = slug => `falcon_ag_${slug}`;
function _lerHist(slug) {
  try { const a = JSON.parse(localStorage.getItem(_histKey(slug)) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function _salvarHist(slug, item) {
  try {
    const a = _lerHist(slug);
    if (!a.some(x => x.data === item.data && x.hora === item.hora)) a.push(item);
    localStorage.setItem(_histKey(slug), JSON.stringify(a.slice(-30)));
  } catch {}
}
function _removerHist(slug, id) {
  try {
    const a = _lerHist(slug).filter(x => x.id !== id);
    localStorage.setItem(_histKey(slug), JSON.stringify(a));
  } catch {}
}

export async function renderAgendaPublica(app, slug) {
  // esconde nav/pet caso o dono abra o link logado dentro do app
  document.body.classList.add('rota-publica');
  document.getElementById('visao-pet')?.classList.add('pet-hidden');

  app.innerHTML = `<div class="ap-wrap"><div class="ap-load">Carregando agenda…</div></div>`;

  let cfg;
  try { cfg = await getAgendaPublica((slug || '').trim()); }
  catch { app.innerHTML = _tela(`<div class="ap-erro">Não foi possível carregar esta agenda agora.</div>`); return cleanup; }
  if (!cfg) { app.innerHTML = _tela(`<div class="ap-erro">Esta agenda não existe ou está desativada. 🔒</div>`); return cleanup; }

  // Horizonte que o dono liberou pro cliente (1/2/3/6 meses; padrão 3).
  const horizonteMeses = [1, 2, 3, 6].includes(cfg.horizonte_meses) ? cfg.horizonte_meses : 3;
  const JANELA = horizonteMeses * 31;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ate = new Date(hoje); ate.setDate(ate.getDate() + JANELA);
  let ocupados = new Set();
  try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}

  // monta os dias com TODOS os horários (livres + ocupados, pra mostrar "ocupado")
  const dias = [];
  for (let i = 0; i <= JANELA; i++) {
    const d = new Date(hoje); d.setDate(d.getDate() + i);
    const times = _horariosDoDia(cfg, d);
    if (!times.length) continue;
    const horarios = times.map(h => ({ hora: h, ocupado: ocupados.has(`${iso(d)}|${h}`) }));
    dias.push({ iso: iso(d), date: d, horarios });
  }

  const servicos = Array.isArray(cfg.servicos) ? cfg.servicos : [];

  // ── Navegação por SEMANA (‹ 07–13 Set ›), igual ao lado do profissional ──
  const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const _segPub = (off) => { const d = new Date(hoje); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + off * 7); return d; };
  function _labelSem(off) {
    const seg = _segPub(off); const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    const mA = MES3[seg.getMonth()], mB = MES3[dom.getMonth()];
    return mA === mB ? `${pad(seg.getDate())}–${pad(dom.getDate())} ${mB}` : `${pad(seg.getDate())} ${mA} – ${pad(dom.getDate())} ${mB}`;
  }
  function _diasDaSemana(off) {
    const seg = _segPub(off);
    const hojeIso = iso(hoje);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(seg); d.setDate(seg.getDate() + i);
      if (!_horariosDoDia(cfg, d).length) continue;   // dia sem disponibilidade não aparece
      const isoD = iso(d);
      out.push({ iso: isoD, date: d, past: isoD < hojeIso });   // past = já passou (só estética)
    }
    return out;
  }
  const _ultimoIso = dias.length ? dias[dias.length - 1].iso : iso(hoje);
  const _maxOffset = Math.max(0, Math.round((_fromIso(_ultimoIso) - _segPub(0)) / (7 * 86400000)));
  // começa na 1ª semana que tem algum horário
  let semOffset = 0;
  while (semOffset < _maxOffset && !_diasDaSemana(semOffset).some(x => !x.past)) semOffset++;
  let selDia = _diasDaSemana(semOffset).find(x => !x.past)?.iso || dias[0]?.iso || null;
  let selHora = null;
  let selServ = servicos.length ? servicos[0].id : null;
  const _servSel = () => servicos.find(s => s.id === selServ) || null;
  const _durSel = () => (_servSel()?.duracaoMin) || cfg.duracao_min || 60;

  desenhar();

  // Re-checa os horários ocupados quando o cliente volta pra aba (auto-atualiza
  // se algo foi cancelado/marcado enquanto a página estava aberta).
  const _refreshOcupados = async () => {
    try {
      ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate));
      for (const dd of dias) for (const s of dd.horarios) s.ocupado = ocupados.has(`${dd.iso}|${s.hora}`);
      desenhar();
    } catch {}
  };
  const _onVis = () => { if (document.visibilityState === 'visible') _refreshOcupados(); };
  document.addEventListener('visibilitychange', _onVis);
  const _cleanupFull = () => { document.removeEventListener('visibilitychange', _onVis); cleanup(); };
  return _cleanupFull;

  // Banner com os agendamentos que ESTE cliente já fez (guardados no aparelho dele)
  function _histHtml() {
    const hojeIso = iso(hoje);
    const hist = _lerHist(cfg.slug).filter(h => h.data >= hojeIso)
      .sort((a, b) => (a.data + a.hora < b.data + b.hora ? -1 : 1));
    if (!hist.length) return '';
    return `<div class="ap-hist">
      <div class="ap-hist-t">📋 Seus agendamentos</div>
      ${hist.map(h => { const d = _fromIso(h.data); return `<div class="ap-hist-item">
        <span>✅ ${SEM[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às <b>${_esc(h.hora)}</b>${h.servico ? ` · ${_esc(h.servico)}` : ''}</span>
        ${h.id && h.token ? `<button class="ap-hist-cancel" data-cancel-id="${_esc(h.id)}" data-cancel-token="${_esc(h.token)}" data-cancel-data="${_esc(h.data)}" data-cancel-hora="${_esc(h.hora)}" type="button">Cancelar</button>` : ''}
      </div>`; }).join('')}
    </div>`;
  }

  // Seletor de serviço (só se o profissional cadastrou serviços)
  function _servHtml() {
    if (!servicos.length) return '';
    return `<div class="ap-serv-wrap">
      <div class="ap-serv-tit">Escolha o serviço</div>
      ${servicos.map(s => `<button class="ap-serv-op ${selServ === s.id ? 'sel' : ''}" data-serv="${_esc(s.id)}" type="button">
        <span class="ap-serv-nm">${_esc(s.nome)}</span>
        <span class="ap-serv-mt">${s.duracaoMin || cfg.duracao_min} min${s.preco != null ? ` · R$ ${_precoTxt(s.preco)}` : ''}</span>
      </button>`).join('')}
    </div>`;
  }

  // ── render principal ──
  function desenhar() {
    if (!dias.length) {
      app.innerHTML = _tela(`
        <div class="ap-head"><div class="ap-titulo">${_esc(cfg.titulo || 'Agende comigo')}</div></div>
        ${_histHtml()}
        <div class="ap-vazio">Sem horários disponíveis no momento. 😕<br><small>Volte mais tarde.</small></div>`);
      return;
    }
    const diasSem = _diasDaSemana(semOffset);
    const dia = dias.find(x => x.iso === selDia) || null;   // dias[] tem os horários
    const g = { manha: [], tarde: [], noite: [] };
    if (dia) dia.horarios.forEach(s => g[_turno(s.hora)].push(s));
    const bloco = (lbl, icon, arr) => arr.length ? `
      <div class="ap-turno"><div class="ap-turno-lbl">${icon} ${lbl}</div>
      <div class="ap-slots">${arr.map(s => s.ocupado
        ? `<span class="ap-slot ocupado" title="Já agendado">${s.hora}<small>ocupado</small></span>`
        : `<button class="ap-slot ${selHora === s.hora ? 'sel' : ''}" data-hora="${s.hora}" type="button">${s.hora}</button>`).join('')}</div></div>` : '';

    app.innerHTML = _tela(`
      <div class="ap-head">
        <div class="ap-titulo">${_esc(cfg.titulo || 'Agende comigo')}</div>
        <div class="ap-sub">${servicos.length ? 'Escolha o serviço e o horário' : 'Escolha um horário'}</div>
        ${cfg.endereco ? `<div class="ap-end">📍 ${_esc(cfg.endereco)}</div>` : ''}
        <div class="ap-aviso24">⏰ Precisa cancelar? Por favor, avise com <b>24h de antecedência</b>.</div>
      </div>
      ${_histHtml()}
      ${_servHtml()}
      <div class="ap-semnav">
        <button class="ap-semarrow" id="ap-sem-prev" type="button" ${semOffset <= 0 ? 'disabled' : ''} aria-label="Semana anterior">‹</button>
        <div class="ap-semlabel">${_labelSem(semOffset)}</div>
        <button class="ap-semarrow" id="ap-sem-next" type="button" ${semOffset >= _maxOffset ? 'disabled' : ''} aria-label="Próxima semana">›</button>
      </div>
      <div class="ap-dias">
        ${diasSem.map(x => x.past
          ? `<div class="ap-diachip past" aria-disabled="true"><span class="ap-diachip-dow">${SEM3[x.date.getDay()]}</span><span class="ap-diachip-num">${pad(x.date.getDate())}</span></div>`
          : `<button class="ap-diachip ${x.iso === selDia ? 'sel' : ''}" data-dia="${x.iso}" type="button"><span class="ap-diachip-dow">${SEM3[x.date.getDay()]}</span><span class="ap-diachip-num">${pad(x.date.getDate())}</span></button>`
        ).join('') || '<div class="ap-semvazio">Sem horários nesta semana. Use ›</div>'}
      </div>
      <div class="ap-slots-wrap">
        ${bloco('Manhã', '🌅', g.manha) + bloco('Tarde', '☀️', g.tarde) + bloco('Noite', '🌙', g.noite)}
      </div>
      ${selHora && dia ? _formHtml(dia, selHora) : ''}
    `);
    wire(dia);
  }

  function wire(dia) {
    const _irSemana = (novo) => {
      semOffset = Math.max(0, Math.min(_maxOffset, novo));
      selDia = _diasDaSemana(semOffset).find(x => !x.past)?.iso || null;
      selHora = null; desenhar();
    };
    app.querySelector('#ap-sem-prev')?.addEventListener('click', () => { if (semOffset > 0) _irSemana(semOffset - 1); });
    app.querySelector('#ap-sem-next')?.addEventListener('click', () => { if (semOffset < _maxOffset) _irSemana(semOffset + 1); });
    app.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
      selDia = b.dataset.dia; selHora = null; desenhar();
    }));
    app.querySelectorAll('[data-serv]').forEach(b => b.addEventListener('click', () => {
      selServ = b.dataset.serv; desenhar();
    }));
    app.querySelectorAll('[data-hora]').forEach(b => b.addEventListener('click', () => {
      selHora = (selHora === b.dataset.hora) ? null : b.dataset.hora; desenhar();
      const f = app.querySelector('.ap-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const btn = app.querySelector('#ap-confirmar');
    if (btn) btn.addEventListener('click', () => confirmar(dia));

    // Cancelar um agendamento do próprio cliente (libera a vaga na hora).
    app.querySelectorAll('.ap-hist-cancel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Cancelar este agendamento e liberar o horário?')) return;
      const id = b.dataset.cancelId, token = b.dataset.cancelToken;
      const dataC = b.dataset.cancelData, horaC = b.dataset.cancelHora;
      b.disabled = true; b.textContent = 'Cancelando…';
      try {
        await cancelarAgendamentoPublico(id, token);
        _removerHist(cfg.slug, id);
        // libera o slot: tira dos ocupados e re-marca os dias
        ocupados.delete(`${dataC}|${horaC}`);
        for (const dd of dias) for (const s of dd.horarios) if (dd.iso === dataC && s.hora === horaC) s.ocupado = false;
        _aviso('✅ Agendamento cancelado. Horário liberado.');
        desenhar();
      } catch (e) {
        _aviso(e.message || 'Não deu pra cancelar');
        b.disabled = false; b.textContent = 'Cancelar';
      }
    }));
  }

  function _formHtml(dia, hora) {
    const serv = _servSel();
    const fim = _fim(hora, _durSel());
    const servLinha = serv
      ? `<div class="ap-form-serv">💆 ${_esc(serv.nome)}${serv.preco != null ? ` · <b>R$ ${_precoTxt(serv.preco)}</b>` : ''}</div>`
      : '';
    return `
      <div class="ap-form">
        <div class="ap-form-res">📌 ${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)} · <b>${hora}${fim ? `–${fim}` : ''}</b></div>
        ${servLinha}
        <label class="input-field"><div class="input-field-label">Seu nome</div>
          <input id="ap-nome" placeholder="Como você se chama?" autocomplete="name"></label>
        <label class="input-field"><div class="input-field-label">Seu WhatsApp</div>
          <input id="ap-zap" inputmode="tel" placeholder="(DDD) 9 9999-9999" autocomplete="tel"></label>
        <button class="btn-primary" id="ap-confirmar" type="button">Confirmar agendamento</button>
      </div>`;
  }

  async function confirmar(dia) {
    const nome = app.querySelector('#ap-nome')?.value.trim() || '';
    const zap = app.querySelector('#ap-zap')?.value.trim() || '';
    if (nome.length < 2) { _aviso('Escreva seu nome'); return; }
    if (zap.replace(/\D/g, '').length < 8) { _aviso('Escreva um WhatsApp válido'); return; }
    const btn = app.querySelector('#ap-confirmar'); btn.disabled = true; btn.textContent = 'Agendando…';
    try {
      const hora = selHora;
      const serv = _servSel();
      const fim = _fim(hora, _durSel());
      const res = await criarAgendamento(cfg.slug, dia.iso, hora, nome, zap, selServ);
      // guarda no histórico do aparelho (com id+token pra poder cancelar) e tira dos disponíveis
      _salvarHist(cfg.slug, { data: dia.iso, hora, nome, servico: serv?.nome || null, id: res?.id, token: res?.token });
      ocupados.add(`${dia.iso}|${hora}`);
      const slot = dia.horarios.find(s => s.hora === hora); if (slot) slot.ocupado = true;
      selHora = null;
      app.innerHTML = _tela(`
        <div class="ap-ok">
          <div class="ap-ok-ic">✅</div>
          <div class="ap-ok-t">Agendamento confirmado!</div>
          <div class="ap-ok-d">${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)} às <b>${hora}${fim ? `–${fim}` : ''}</b></div>
          ${serv ? `<div class="ap-ok-sub">💆 ${_esc(serv.nome)}${serv.preco != null ? ` · R$ ${_precoTxt(serv.preco)}` : ''}</div>` : ''}
          ${cfg.endereco ? `<div class="ap-ok-end">📍 ${_esc(cfg.endereco)}</div>` : ''}
          <div class="ap-ok-sub">${_esc(cfg.titulo || '')}</div>
          <button class="btn-primary ap-ok-btn" id="ap-voltar" type="button">Ver meus agendamentos</button>
        </div>`);
      app.querySelector('#ap-voltar')?.addEventListener('click', () => desenhar());
    } catch (e) {
      _aviso(e.message || 'Não deu pra agendar');
      // horário pode ter sido pego: recarrega ocupados e re-marca todos os dias
      try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}
      for (const dd of dias) for (const s of dd.horarios) s.ocupado = ocupados.has(`${dd.iso}|${s.hora}`);
      selHora = null; desenhar();
    }
  }
}

// wrapper visual + limpeza (remove a classe da rota ao sair)
function _tela(inner) { return `<div class="ap-wrap">${inner}</div>`; }
function cleanup() { document.body.classList.remove('rota-publica'); }

let _avisoT = null;
function _aviso(msg) {
  let el = document.querySelector('.ap-toast');
  if (!el) { el = document.createElement('div'); el.className = 'ap-toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_avisoT); _avisoT = setTimeout(() => el.classList.remove('on'), 2600);
}
