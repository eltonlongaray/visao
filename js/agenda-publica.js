// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA de agendamento (Fase B) — abre pelo link da bio, SEM login.
// Visitante vê os dias/horários livres do dono (via slug) e agenda com
// nome + WhatsApp. Usa só as funções anônimas de agenda.js (RPCs seguras).
// ─────────────────────────────────────────────────────────────
import { getAgendaPublica, getSlotsOcupados, criarAgendamento, cancelarAgendamentoPublico, getMeusAgendamentos, cancelarMeuAgendamento } from './agenda-publica-dados.js';

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
    // Substitui qualquer registro do MESMO dia/horário (pega o token novo em rebooking).
    const a = _lerHist(slug).filter(x => !(x.data === item.data && x.hora === item.hora));
    a.push(item);
    localStorage.setItem(_histKey(slug), JSON.stringify(a.slice(-30)));
  } catch {}
}
function _removerHist(slug, id) {
  try {
    const a = _lerHist(slug).filter(x => x.id !== id);
    localStorage.setItem(_histKey(slug), JSON.stringify(a));
  } catch {}
}
// Identidade do cliente NO APARELHO (nome + WhatsApp) — tipo um "login" leve.
const _identKey = slug => `falcon_cliente_${slug}`;
function _lerIdent(slug) { try { return JSON.parse(localStorage.getItem(_identKey(slug)) || 'null'); } catch { return null; } }
function _salvarIdent(slug, obj) { try { localStorage.setItem(_identKey(slug), JSON.stringify(obj)); } catch {} }
// Link do WhatsApp do PROFISSIONAL (pro cliente falar). null se não configurado.
function _waProLink(cfg) {
  let d = String(cfg?.whatsapp || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}`;
}
const WA_SVG_PUB = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg>';

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
  let ident = _lerIdent(cfg.slug);   // {nome, contato} — identificação do cliente (1x)
  let meusAgs = [];                  // agendamentos do cliente (buscados do servidor pelo WhatsApp)
  const _servSel = () => servicos.find(s => s.id === selServ) || null;
  const _durSel = () => (_servSel()?.duracaoMin) || cfg.duracao_min || 60;

  // Busca os agendamentos do cliente (pelo WhatsApp) e re-renderiza quando chegam.
  async function _carregarMeusAgs() {
    if (!ident?.contato) return;
    try { meusAgs = await getMeusAgendamentos(cfg.slug, ident.contato); if (ident) desenhar(); } catch {}
  }

  // Identidade primeiro (tipo login). Depois de identificado, mostra a agenda.
  const mostrar = () => { if (!ident) desenharIdentidade(); else { desenhar(); _carregarMeusAgs(); } };
  mostrar();

  // Re-checa os horários ocupados quando o cliente volta pra aba (auto-atualiza
  // se algo foi cancelado/marcado enquanto a página estava aberta).
  const _refreshOcupados = async () => {
    try {
      ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate));
      for (const dd of dias) for (const s of dd.horarios) s.ocupado = ocupados.has(`${dd.iso}|${s.hora}`);
      if (ident?.contato) { try { meusAgs = await getMeusAgendamentos(cfg.slug, ident.contato); } catch {} }
      if (ident) desenhar();
    } catch {}
  };
  const _onVis = () => { if (document.visibilityState === 'visible') _refreshOcupados(); };
  document.addEventListener('visibilitychange', _onVis);
  const _cleanupFull = () => { document.removeEventListener('visibilitychange', _onVis); cleanup(); };
  return _cleanupFull;

  // Banner com os agendamentos que ESTE cliente já fez (guardados no aparelho dele)
  // Meus agendamentos (do servidor, pelo WhatsApp): 2 retráteis — próximos (com
  // cancelar) e histórico (passados). Status vem do servidor (feito/faltou).
  function _histHtml() {
    const hojeIso = iso(hoje);
    const ags = (meusAgs || []).slice().sort((a, b) => (a.data + a.hora < b.data + b.hora ? -1 : 1));
    const futuros = ags.filter(a => a.data >= hojeIso);
    const passados = ags.filter(a => a.data < hojeIso).reverse();   // mais recentes primeiro
    if (!futuros.length && !passados.length) return '';
    const linha = (a, comCancel) => { const d = _fromIso(a.data); const fim = _fim(a.hora, a.duracao_min);
      const st = a.status === 'finalizado' ? ' · ✅ feito' : a.status === 'faltou' ? ' · 🚫 faltou' : '';
      return `<div class="ap-hist-item">
        <span>${SEM3[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às <b>${_esc(a.hora)}${fim ? `–${fim}` : ''}</b>${a.servico ? ` · ${_esc(a.servico)}` : ''}${st}</span>
        ${comCancel ? `<button class="ap-hist-cancel" data-cancel-id="${_esc(a.id)}" data-cancel-data="${_esc(a.data)}" data-cancel-hora="${_esc(a.hora)}" type="button">Cancelar</button>` : ''}
      </div>`; };
    return `
      ${futuros.length ? `<div class="ap-accord">
        <button class="ap-accord-btn" type="button" data-accord="fut">📅 Meus agendamentos <span class="ap-accord-n">${futuros.length}</span><span class="ap-accord-seta">▾</span></button>
        <div class="ap-accord-body" hidden>${futuros.map(a => linha(a, true)).join('')}</div>
      </div>` : ''}
      ${passados.length ? `<div class="ap-accord">
        <button class="ap-accord-btn" type="button" data-accord="hist">📋 Histórico <span class="ap-accord-n">${passados.length}</span><span class="ap-accord-seta">▾</span></button>
        <div class="ap-accord-body" hidden>${passados.map(a => linha(a, false)).join('')}</div>
      </div>` : ''}`;
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
        ${ident?.nome ? `<div class="ap-ola">👋 Olá, <b>${_esc(ident.nome.split(' ')[0])}</b>!</div>` : ''}
        <div class="ap-sub">${servicos.length ? 'Escolha o serviço e o horário' : 'Escolha um horário'}</div>
        ${cfg.endereco ? `<div class="ap-end">📍 ${_esc(cfg.endereco)}</div>` : ''}
        <div class="ap-aviso24">⚠️ <b>Precisa cancelar?</b> Avise com <b>24h de antecedência</b>, por favor.</div>
        ${_waProHtml()}
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

  // Botão "Falar no WhatsApp" (do profissional), se ele configurou o número.
  function _waProHtml() {
    const wa = _waProLink(cfg);
    return wa ? `<a class="ap-wa-pro" href="${wa}" target="_blank" rel="noopener">${WA_SVG_PUB} Falar no WhatsApp</a>` : '';
  }

  // Tela de identificação (nome + WhatsApp) — aparece antes de agendar, 1x por aparelho.
  function desenharIdentidade() {
    app.innerHTML = _tela(`
      <div class="ap-head">
        <div class="ap-titulo">${_esc(cfg.titulo || 'Agende comigo')}</div>
        ${cfg.endereco ? `<div class="ap-end">📍 ${_esc(cfg.endereco)}</div>` : ''}
      </div>
      <div class="ap-ident">
        <div class="ap-ident-t">👋 Bem-vindo! Antes de agendar, se identifique:</div>
        <label class="input-field"><div class="input-field-label">Seu nome</div>
          <input id="ap-ident-nome" placeholder="Nome completo" autocomplete="name" value="${_esc(ident?.nome || '')}"></label>
        <label class="input-field"><div class="input-field-label">Seu WhatsApp</div>
          <input id="ap-ident-zap" inputmode="tel" placeholder="(DDD) 9 9999-9999" autocomplete="tel" value="${_esc(ident?.contato || '')}"></label>
        <button class="btn-primary ap-ident-btn" id="ap-ident-ok" type="button">Continuar →</button>
        ${_waProHtml()}
      </div>`);
    app.querySelector('#ap-ident-ok').onclick = () => {
      const nome = app.querySelector('#ap-ident-nome').value.trim();
      const zap = app.querySelector('#ap-ident-zap').value.trim();
      if (nome.length < 2) { _aviso('Escreva seu nome'); return; }
      if (zap.replace(/\D/g, '').length < 8) { _aviso('Escreva um WhatsApp válido'); return; }
      ident = { nome, contato: zap };
      _salvarIdent(cfg.slug, ident);
      desenhar();
    };
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

    // Retráteis (Meus agendamentos / Histórico)
    app.querySelectorAll('.ap-accord-btn').forEach(b => b.addEventListener('click', () => {
      const body = b.nextElementSibling; const seta = b.querySelector('.ap-accord-seta');
      const abrir = body.hidden; body.hidden = !abrir; if (seta) seta.textContent = abrir ? '▴' : '▾';
    }));

    // Cancelar um agendamento do próprio cliente (identificado pelo WhatsApp).
    app.querySelectorAll('.ap-hist-cancel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Cancelar este agendamento e liberar o horário?')) return;
      const id = b.dataset.cancelId, dataC = b.dataset.cancelData, horaC = b.dataset.cancelHora;
      b.disabled = true; b.textContent = 'Cancelando…';
      try {
        await cancelarMeuAgendamento(cfg.slug, ident?.contato, id);
        meusAgs = meusAgs.filter(a => a.id !== id);
        _removerHist(cfg.slug, id);
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
        <div class="ap-form-ident">Agendando como <b>${_esc(ident?.nome || '')}</b>${ident?.contato ? ` · ${_esc(ident.contato)}` : ''}</div>
        <button class="btn-primary" id="ap-confirmar" type="button">Confirmar agendamento</button>
      </div>`;
  }

  async function confirmar(dia) {
    const nome = ident?.nome || '';
    const zap = ident?.contato || '';
    if (nome.length < 2 || zap.replace(/\D/g, '').length < 8) { ident = null; mostrar(); return; }
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
      app.querySelector('#ap-voltar')?.addEventListener('click', () => { desenhar(); _carregarMeusAgs(); });
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
