// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA de agendamento (Fase B) — abre pelo link da bio, SEM login.
// Visitante vê os dias/horários livres do dono (via slug) e agenda com
// nome + WhatsApp. Usa só as funções anônimas de agenda.js (RPCs seguras).
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { getAgendaPublica, getSlotsOcupados, estaOcupado, criarAgendamento, criarAgendamentoCombo, cancelarAgendamentoPublico, getMeusAgendamentos, cancelarMeuAgendamento, fichaStatusPublico, validarCupom, aplicarCupom } from './agenda-publica-dados.js';

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SEM3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _turno = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');
const _fromIso = s => { const [y, m, d] = (s || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const _precoTxt = p => (p == null ? '' : Number(p).toFixed(2).replace('.', ','));
const _fim = (hora, dur) => { if (!dur) return null; const [h, m] = hora.split(':').map(Number); const t = h * 60 + m + dur; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
const _hm = t => { const p = String(t || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
// Segunda-feira (ISO) da semana de uma data — bate com date_trunc('week') do Postgres.
const _segISO = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return iso(x); };
// Horários efetivos de um dia: se a SEMANA tem exceção (cfg.semanas[segunda]),
// usa ela (mesmo vazia = dia fechado); senão cai no padrão (disponibilidade[dow]).
// (21/11) Serviço com HORÁRIO PRÓPRIO (servico.horarios = {dow: [horas]}, ex.: Black da
// Larissa só seg–sex a partir das 17h e sábado o dia todo): vale o horário do serviço.
// Semana de exceção com o dia fechado continua fechada. cfg.__servHorarios = serviço escolhido.
const _horariosDoDia = (cfg, d) => {
  const wk = cfg.semanas && cfg.semanas[_segISO(d)];
  const base = wk != null ? wk : (cfg.disponibilidade || {});
  const dia = base[String(d.getDay())] || [];
  const hs = cfg.__servHorarios;
  if (hs) return (wk != null && !dia.length) ? [] : (hs[String(d.getDay())] || []).slice().sort();
  return dia.slice().sort();
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
// Vindo da TRIAGEM (/triagem/<slug>): serviços escolhidos, nome, WhatsApp e a mensagem
// que a cliente manda pra profissional depois de confirmar. Só vale com ?triagem=1 e por 1 dia.
const _triKey = slug => `falcon_triagem_${slug}`;
function _lerTriagem(slug) {
  if (!new URLSearchParams(location.search).has('triagem')) return null;
  try {
    const t = JSON.parse(localStorage.getItem(_triKey(slug)) || 'null');
    return t && Date.now() - (t.ts || 0) < 86400000 ? t : null;
  } catch { return null; }
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
  const msg = encodeURIComponent('Olá, vim através do Falcon Agenda e tenho dúvidas');
  return `https://wa.me/${d}?text=${msg}`;
}
// (18/11/2026) O aviso automático por CallMeBot SAIU: depois de agendar, toda
// cliente vai pro WhatsApp da profissional com a mensagem pronta (serviço, dia,
// hora). A profissional também recebe o push do Falcon (_avisarDono).
const WA_SVG_PUB = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg>';

// (25/11) Aviso no topo da agenda por profissional, com data pra sumir sozinho (ate = último dia que aparece)
const _AVISO_TOPO = {
  V83: { ate: '2026-11-30', txt: '💳 Não paga nada agora: o pagamento é no dia, depois do atendimento. Agendando até 30/11, tu garante o preço da Black, mesmo marcando a sessão para dezembro.' },
};
function _avisoTopo(slug) {
  const a = _AVISO_TOPO[slug]; if (!a) return '';
  if (iso(new Date()) > a.ate) return '';
  return `<div class="ap-aviso-topo">${_esc(a.txt)}</div>`;
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
  const DUR = cfg.duracao_min || 60;   // duração-padrão do slot (pra checar sobreposição)
  let ocupados = new Map();
  try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}

  // monta os dias com TODOS os horários (livres + ocupados, pra mostrar "ocupado")
  // Antecedência mínima: o cliente só marca um horário com pelo menos 5h à
  // frente de agora (marcou de manhã → só tarde/noite). Isso também tira os
  // horários que já passaram hoje.
  const AGORA = Date.now();
  const MIN_ANTEC_MS = 5 * 60 * 60 * 1000;
  const dias = [];
  function _montarDias() {
  dias.length = 0;
  for (let i = 0; i <= JANELA; i++) {
    const d = new Date(hoje); d.setDate(d.getDate() + i);
    const times = _horariosDoDia(cfg, d);
    if (!times.length) continue;
    const horarios = times.map(h => {
      const [hh, mm] = h.split(':').map(Number);
      const slotTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0).getTime();
      const passou = slotTs < AGORA;   // já passou → some (não é "cedo")
      // "cedo" = ainda vai acontecer, mas falta menos de 5h de antecedência.
      return { hora: h, ocupado: estaOcupado(ocupados, iso(d), h, DUR), passou, cedo: !passou && (slotTs - AGORA) < MIN_ANTEC_MS };
    });
    dias.push({ iso: iso(d), date: d, horarios });
  }
  }
  _montarDias();

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
  // Dia "com vaga": tem pelo menos um horário que ainda dá pra marcar (não passou, não está
  // a menos de 5h, não ocupado). A agenda abre já no 1º dia assim — não num dia vazio.
  const _temVaga = isoD => { const d = dias.find(x => x.iso === isoD); return !!d && d.horarios.some(h => !h.passou && !h.cedo && !h.ocupado); };
  const _primeiroComVaga = off => _diasDaSemana(off).find(x => !x.past && _temVaga(x.iso))?.iso || null;
  // (20/11, Élton) Calendário de 2 semanas sempre visível: abre em ESTA semana + a próxima,
  // já selecionando o 1º dia com vaga dessas 2; "Ver mais datas →" anda de 2 em 2 semanas.
  let semOffset = 0;
  const _vagasDoDia = isoD => { const d = dias.find(x => x.iso === isoD); return d ? d.horarios.filter(h => !h.passou && !h.cedo && !h.ocupado).length : 0; };
  const _semana7 = off => { const seg = _segPub(off); const hojeIso = iso(hoje); const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(seg); d.setDate(seg.getDate() + i); const isoD = iso(d);
      out.push({ iso: isoD, date: d, past: isoD < hojeIso, hoje: isoD === hojeIso, aberto: _horariosDoDia(cfg, d).length > 0, vagas: isoD < hojeIso ? 0 : _vagasDoDia(isoD) }); }
    return out; };
  const _primeiroNoBloco = off => _primeiroComVaga(off) || _primeiroComVaga(off + 1);
  // Próximo horário livre (de toda a agenda): atalho "Quero esse"
  const _proximoLivre = () => { for (const d of dias) { const h = d.horarios.find(x => !x.passou && !x.cedo && !x.ocupado); if (h) return { iso: d.iso, date: d.date, hora: h.hora }; } return null; };
  let selDia = _primeiroNoBloco(0) || null;
  let selHora = null;
  let chamaHora = false;   // (25/11) tocou num dia → desce até os horários e chama atenção pra escolher a hora
  // (21/11) serviço com `destaque` (ex.: "Black Friday") abre já escolhido e vem 1º na lista
  let selServ = (servicos.find(s => s.destaque && !s.pacoteDe) || servicos.find(s => !s.pacoteDe) || servicos[0])?.id || null;
  let ident = _lerIdent(cfg.slug);   // {nome, contato} — identificação do cliente (1x)
  // Triagem: já chega identificada e com o(s) serviço(s) escolhido(s)
  const TRI = _lerTriagem(cfg.slug);
  // (21/11) ?teste=1: modo teste — percorre tudo, mas NÃO marca horário, não aplica cupom,
  // não registra passos da triagem e não abre o WhatsApp sozinho (só mostra a mensagem).
  const TESTE = new URLSearchParams(location.search).has('teste');
  if (TESTE && !document.querySelector('.ap-faixa-teste')) document.body.insertAdjacentHTML('afterbegin',
    '<div class="ap-faixa-teste" style="position:sticky;top:0;z-index:50;background:#FEF3C7;color:#78350F;text-align:center;font:600 .85rem/1.3 system-ui,sans-serif;padding:.55rem .8rem">🧪 Modo teste · nada é salvo, não marca horário</div>');
  let combo = [];                    // 2+ serviços num horário só (da triagem)
  const cupomUrl = (new URLSearchParams(location.search).get('cupom') || '').trim().toUpperCase().slice(0, 30);
  // cupom conferido ({codigo, desconto, descricao}). ?cupom= no link: o campo já abre preenchido e é aplicado sozinho
  let cupom = null, cupomAberto = !!cupomUrl, cupomAuto = false;
  let servAberto = false;            // lista de serviços aberta (botão retrátil)
  // Caminho da cliente que veio da triagem (20/11): cada passo daqui vai pra triagem salva,
  // pra profissional ver na ficha até onde a cliente chegou (abriu, escolheu dia/hora, confirmou, WhatsApp).
  const _passo = (txt) => {
    if (TESTE || !TRI || !TRI.codigo || !TRI.pacote) return;
    const pc = TRI.pacote; pc.caminho = (pc.caminho || []).concat([{ p: txt, em: new Date().toISOString() }]).slice(-60);
    try { if (localStorage.getItem(_triKey(cfg.slug))) localStorage.setItem(_triKey(cfg.slug), JSON.stringify(TRI)); } catch {}
    try { supabase.rpc('triagem_atualizar', { p_slug: cfg.slug, p_codigo: TRI.codigo, p_respostas: pc }); } catch {}
  };
  const _diaTxt = isoD => { const [y, m, d] = String(isoD || '').split('-'); return d ? `${d}/${m}` : ''; };
  if (TRI) {
    if (TRI.nome && TRI.contato) { ident = { nome: TRI.nome, contato: TRI.contato }; _salvarIdent(cfg.slug, ident); }
    const ids = (TRI.servicos || []).filter(id => servicos.some(s => s.id === id));
    if (ids.length) { selServ = ids[0]; if (ids.length > 1) combo = ids; }
  }
  let meusAgs = [];                  // agendamentos do cliente (buscados do servidor pelo WhatsApp)
  const _servSel = () => servicos.find(s => s.id === selServ) || null;
  // Pacote dentro do serviço: o item do pacote (pacoteDe) não aparece na lista, vira opção do serviço.
  const _lista = () => servicos.filter(s => !s.pacoteDe).sort((a, b) => (!!b.destaque) - (!!a.destaque));
  // Veio da triagem com foco num produto só (modelo com focoNoServico): sem lista de outros serviços
  const FOCO = !!(TRI && TRI.foco && (TRI.servicos || []).length);
  const _baseDe = s => (s && s.pacoteDe ? servicos.find(x => x.id === s.pacoteDe) || s : s);
  const _pacoteDe = s => (s ? servicos.find(x => x.pacoteDe === s.id) || null : null);
  const _comboServs = () => combo.map(id => servicos.find(s => s.id === id)).filter(Boolean);
  const _durSel = () => combo.length > 1
    ? _comboServs().reduce((t, s) => t + (s.duracaoMin || cfg.duracao_min || 60), 0)
    : ((_servSel()?.duracaoMin) || cfg.duracao_min || 60);
  // nome e preço do que vai ser agendado (1 serviço ou a soma do combo)
  const _comboNome = () => _comboServs().map(s => s.nome).join(' + ');
  const _comboPreco = () => { const c = _comboServs(); return c.some(s => s.preco == null) ? null : c.reduce((t, s) => t + Number(s.preco), 0); };
  // Serviço com horário próprio: refaz os dias/horários e reposiciona o dia escolhido
  function _aplicarHorariosServ() {
    const comH = (combo.length > 1 ? _comboServs() : [_servSel()]).find(s => s && s.horarios);
    const novo = comH ? comH.horarios : null;
    if (novo === (cfg.__servHorarios || null)) return;
    cfg.__servHorarios = novo;
    _montarDias();
    for (const dd of dias) for (const s of dd.horarios) s.ocupado = estaOcupado(ocupados, dd.iso, s.hora, DUR);
    if (!selDia || !_temVaga(selDia)) { selDia = _primeiroNoBloco(semOffset) || null; selHora = null; }
  }
  _aplicarHorariosServ();
  if (TRI) {
    const prim = _primeiroComVaga(semOffset);
    _passo('Abriu a agenda' + (prim ? ` (primeiro dia com horário livre: ${_diaTxt(prim)})` : ' (sem horário livre)'));
  }

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
      for (const dd of dias) for (const s of dd.horarios) s.ocupado = estaOcupado(ocupados, dd.iso, s.hora, DUR);
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
  // Seletor de serviço: mostra só o(s) escolhido(s) + um botão retrátil bem visível
  // "Ver todos os serviços" (lista longa não empurra os horários pra baixo).
  function _pacoteHtml() {
    const base = _baseDe(_servSel()), pac = _pacoteDe(base);
    if (combo.length > 1 || !base || !pac) return '';
    const ehPac = selServ === pac.id;
    const cada = pac.preco != null && pac.sessoes ? pac.preco / pac.sessoes : null;
    const eco = base.preco != null && pac.preco != null && pac.sessoes ? base.preco * pac.sessoes - pac.preco : 0;
    return `<div class="ap-pac">
      <button type="button" class="ap-pac-op ${ehPac ? '' : 'on'}" data-pac="${_esc(base.id)}"><span class="ap-pac-mk"></span><span><b>Sessão avulsa</b>${base.preco != null ? ` · R$ ${_precoTxt(base.preco)}` : ''}</span></button>
      <button type="button" class="ap-pac-op ${ehPac ? 'on' : ''}" data-pac="${_esc(pac.id)}"><span class="ap-pac-mk"></span><span><b>Pacote ${pac.sessoes} sessões</b>${pac.preco != null ? ` · R$ ${_precoTxt(pac.preco)}` : ''}
        ${cada ? `<small>R$ ${_precoTxt(cada)} cada${eco > 0 ? ` · economiza R$ ${_precoTxt(eco)}` : ''}</small>` : ''}</span></button>
    </div>`;
  }
  function _servCard(s, sel) {
    return `<button class="ap-serv-op ${sel ? 'sel' : ''}" data-serv="${_esc(s.id)}" type="button">
        <span class="ap-serv-nm">${_esc(s.nome)}${s.destaque ? ` <span style="display:inline-block;vertical-align:middle;margin-left:.35rem;padding:.12rem .5rem;border-radius:999px;background:#050404;color:#fff;font-size:.68rem;font-weight:700;letter-spacing:.04em;white-space:nowrap">🖤 ${_esc(s.destaque)}</span>` : ''}</span>
        <span class="ap-serv-mt">${s.duracaoMin || cfg.duracao_min} min${s.preco != null ? ` · R$ ${_precoTxt(s.preco)}` : ''}</span>
        ${s.nota ? `<span class="ap-serv-mt" style="display:block;margin-top:.2rem;opacity:.85">🕔 ${_esc(s.nota)}</span>` : ''}
      </button>`;
  }
  // (21/11) Serviço com horário próprio (ex.: Black da Larissa): frase "quero muito, mas os
  // meus horários não batem" + botão "Me ajuda, Lari". O botão NÃO diz que é WhatsApp (Élton:
  // a função fica escondida pra curioso não ficar chamando) — só ao tocar abre o WhatsApp dela
  // com a mensagem pronta. Textos: servico.ajuda = { texto, botao } (padrão abaixo).
  function _ajudaHorarioHtml() { return ''; }   // (21/11) agora mora dentro do card do serviço (_servCardHorario)
  // (21/11, Élton) Serviço com horário próprio = UM card só: serviço + horários (letra maior)
  // + "meus horários não batem" + botão de ajuda. É <div> (não <button>) pra caber o botão dentro.
  function _servCardHorario(s) {
    const _sepH = '<span style="display:block;height:1px;background:var(--border);margin:12px 0 10px"></span>';
    const aj = s.ajuda || {};
    const ajuda = _waProLink(cfg) ? `${_sepH}
        <span class="ap-serv-nm" style="display:block;text-align:center;text-wrap:balance">${_esc(aj.texto || 'Eu quero muito, mas os meus horários não batem')}</span>
        <span class="ap-serv-mt" style="display:block;text-align:center;text-wrap:balance">${_esc(aj.sub || 'Toque no botão abaixo para pedir ajuda')}</span>
        <span style="display:block;text-align:center;margin-top:8px"><button type="button" class="btn-primary" id="ap-ajuda-btn" style="width:auto;padding:.7rem 1.4rem">${_esc(aj.botao || 'Me ajuda')}</button></span>` : '';
    return `<div class="ap-serv-op sel ap-serv-unico" style="cursor:default">
        <span class="ap-serv-nm">${_esc(s.nome)}${s.destaque ? ` <span style="display:inline-block;vertical-align:middle;margin-left:.35rem;padding:.12rem .5rem;border-radius:999px;background:#050404;color:#fff;font-size:.68rem;font-weight:700;letter-spacing:.04em;white-space:nowrap">🖤 ${_esc(s.destaque)}</span>` : ''}</span>
        <span class="ap-serv-mt">${s.duracaoMin || cfg.duracao_min} min${s.preco != null ? ` · R$ ${_precoTxt(s.preco)}` : ''}</span>
        ${s.promo ? `<span class="ap-serv-mt" style="display:block;opacity:1;font-weight:700;margin-top:2px">${_esc(s.promo)}</span>` : ''}
        ${s.nota ? `${_sepH}
        <span class="ap-serv-mt" style="display:block;text-align:center;opacity:1;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase">🕔 Horários desta sessão</span>
        ${String(s.nota).split('·').map(t => t.trim()).filter(Boolean).map(t => `<span style="display:block;text-align:center;font-size:1.08rem;font-weight:800;margin-top:2px">${_esc(t.charAt(0).toUpperCase() + t.slice(1))}</span>`).join('')}` : ''}
        ${ajuda}
      </div>`;
  }
  function _servHtml() {
    if (!servicos.length) return '';
    const escolhido = combo.length > 1
      ? `<button class="ap-serv-op sel" type="button" disabled style="opacity:1">
        <span class="ap-serv-nm">${_esc(_comboNome())}</span>
        <span class="ap-serv-mt">${_durSel()} min${_comboPreco() != null ? ` · R$ ${_precoTxt(_comboPreco())}` : ''}</span>
      </button>`
      : (_servSel() ? (_baseDe(_servSel()).horarios ? _servCardHorario(_baseDe(_servSel())) : _servCard(_baseDe(_servSel()), true)) + _pacoteHtml() : '');
    if (FOCO || _lista().length <= 1) return `<div class="ap-serv-wrap"><div class="ap-serv-tit">Serviço</div>${escolhido}</div>`;
    return `<div class="ap-serv-wrap">
      <div class="ap-serv-tit">Serviço escolhido</div>
      <button class="ap-serv-toggle" id="ap-serv-toggle" type="button" aria-expanded="${servAberto}">
        <span>${servAberto ? '▴ Fechar a lista de serviços' : `▾ Aperte aqui para ver todos os serviços (${_lista().length})`}</span>
      </button>
      ${servAberto
        ? _lista().map(s => _servCard(s, combo.length <= 1 && _baseDe(_servSel())?.id === s.id)).join('')
        : escolhido}
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
    // Horários que já passaram somem da lista (não têm por que aparecer).
    if (dia) dia.horarios.forEach(s => { if (!s.passou && !s.cedo) g[_turno(s.hora)].push(s); });   // sem 5h de antecedência: some (o cliente não entende "cedo")
    const bloco = (lbl, icon, arr) => arr.length ? `
      <div class="ap-turno"><div class="ap-turno-lbl">${icon} ${lbl}</div>
      <div class="ap-slots">${arr.map(s => (s.ocupado || s.cedo)
        ? `<span class="ap-slot ocupado" title="${s.cedo ? 'Precisa de no mínimo 5h de antecedência' : 'Já agendado'}">${s.hora}<small>${s.cedo ? 'cedo' : 'ocupado'}</small></span>`
        : `<button class="ap-slot ${selHora === s.hora ? 'sel' : ''}" data-hora="${s.hora}" type="button">${s.hora}</button>`).join('')}</div></div>` : '';

    app.innerHTML = _tela(`
      <div class="ap-head">
        <div class="ap-titulo">${_esc(cfg.titulo || 'Agende comigo')}</div>
        ${ident?.nome ? `<div class="ap-ola">👋 Olá, <b>${_esc(ident.nome.split(' ')[0])}</b>! <button class="ap-trocar" id="ap-trocar" type="button">Não é você? Trocar</button></div>` : ''}
        <div class="ap-sub">${servicos.length ? 'Escolha o serviço e o horário' : 'Escolha um horário'}</div>
        ${cfg.endereco ? `<div class="ap-end">📍 ${_esc(cfg.endereco)}</div>` : ''}
        ${_avisoTopo(cfg.slug)}
        <div class="ap-aviso24">⚠️ <b>Precisa cancelar?</b> Avise com <b>24h de antecedência</b>, por favor.</div>
      </div>
      ${_histHtml()}
      ${_servHtml()}
      ${_ajudaHorarioHtml()}
      ${(() => {   // atalho: próximo horário livre
        const p = _proximoLivre(); if (!p) return '';
        return `<div class="ap-prox"><div class="ap-prox-tx">📅 Próximo horário livre<b>${SEM[p.date.getDay()]} ${pad(p.date.getDate())}/${pad(p.date.getMonth() + 1)} às ${p.hora}</b></div>
          <button class="ap-prox-btn" id="ap-prox-ok" type="button">Quero esse</button></div>`;
      })()}
      <div class="ap-cal-tit">Ou escolha o dia</div>
      <div class="ap-cal">
        <div class="ap-cal-dow">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(x => `<span>${x}</span>`).join('')}</div>
        ${[semOffset, semOffset + 1].map(off => `
          <div class="ap-cal-lbl">${off === 0 ? 'Esta semana' : off === 1 ? 'Semana que vem' : _labelSem(off)}</div>
          <div class="ap-cal-row">${_semana7(off).map(x => {
            const est = x.past ? 'past' : !x.aberto ? 'fechado' : x.vagas ? 'livre' : 'lotado';
            const info = x.past ? '' : !x.aberto ? '' : x.vagas ? `${x.vagas} ${x.vagas === 1 ? 'horário' : 'horários'}` : 'lotado';
            const cls = `ap-cal-d ${est}${x.iso === selDia ? ' sel' : ''}${x.hoje ? ' hoje' : ''}`;
            const inner = `<span class="ap-cal-n">${x.date.getDate()}</span><span class="ap-cal-i">${info}</span>`;
            return est === 'livre' ? `<button class="${cls}" data-dia="${x.iso}" type="button">${inner}</button>` : `<div class="${cls}" aria-disabled="true">${inner}</div>`;
          }).join('')}</div>`).join('')}
        ${[semOffset, semOffset + 1].some(off => _semana7(off).some(x => x.vagas)) ? '' : `<div class="ap-cal-vazio">Sem horário livre nessas 2 semanas.</div>`}
        <div class="ap-cal-nav">
          ${semOffset > 0 ? `<button class="ap-cal-voltar ap-sem-prev" type="button">‹ Voltar</button>` : ''}
          ${semOffset + 2 <= _maxOffset ? `<button class="ap-cal-mais ap-sem-next" type="button">Ver mais datas →</button>` : ''}
        </div>
      </div>
      ${dia ? `<div class="ap-hor-tit${chamaHora && !selHora ? ' chama' : ''}">${chamaHora && !selHora ? '👇 Agora escolha o horário' : 'Horários disponíveis'}<small>${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)}</small></div>` : ''}
      <div class="ap-slots-wrap${chamaHora && !selHora ? ' chama' : ''}">
        ${(g.manha.length + g.tarde.length + g.noite.length)
          ? bloco('Manhã', '🌅', g.manha) + bloco('Tarde', '☀️', g.tarde) + bloco('Noite', '🌙', g.noite)
          : (dia ? '<div class="ap-vazio">Nenhum horário disponível neste dia. 🌙<br><small>Escolha outro dia acima.</small></div>' : '')}
      </div>
      ${selHora && dia ? _formHtml(dia, selHora) : ''}
      <div class="ap-wa-pro-wrap">${_waProHtml()}</div>
    `);
    wire(dia);
  }

  // Botão "Falar no WhatsApp" (do profissional), se ele configurou o número.
  function _waProHtml() {
    if (TRI) return '';   // veio da triagem: o WhatsApp é o último passo, com a mensagem pronta
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
    // "Não é você? Trocar" — limpa a identificação salva e volta pra tela de cadastro.
    app.querySelector('#ap-trocar')?.addEventListener('click', () => {
      ident = null; selHora = null;
      try { localStorage.removeItem(_identKey(cfg.slug)); } catch {}
      desenharIdentidade();
    });
    const _irSemana = (novo) => {
      _passo(novo > semOffset ? 'Foi pra semana seguinte' : 'Voltou uma semana');
      semOffset = Math.max(0, Math.min(_maxOffset, novo));
      selDia = _primeiroNoBloco(semOffset) || null;
      selHora = null; desenhar();
    };
    app.querySelectorAll('.ap-sem-prev').forEach(b => b.addEventListener('click', () => { if (semOffset > 0) _irSemana(semOffset - 2); }));
    app.querySelectorAll('.ap-sem-next').forEach(b => b.addEventListener('click', () => { if (semOffset + 2 <= _maxOffset) _irSemana(semOffset + 2); }));
    app.querySelector('#ap-prox-ok')?.addEventListener('click', () => {
      const p = _proximoLivre(); if (!p) return;
      _passo(`Tocou em "Quero esse" (próximo livre: ${_diaTxt(p.iso)} às ${p.hora})`);
      const alvo = Math.floor((_fromIso(p.iso) - _segPub(0)) / (7 * 86400000));
      semOffset = Math.max(0, alvo - (alvo % 2)); selDia = p.iso; selHora = p.hora; desenhar();
      const f = app.querySelector('.ap-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    app.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
      selDia = b.dataset.dia; selHora = null; _passo('Olhou o dia ' + _diaTxt(selDia));
      chamaHora = true; desenhar();
      // desce sozinho até os horários (a cliente nem sempre percebe que falta escolher a hora)
      const t = app.querySelector('.ap-hor-tit');
      if (t) requestAnimationFrame(() => t.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }));
    app.querySelectorAll('[data-serv]').forEach(b => b.addEventListener('click', () => {
      selServ = b.dataset.serv; combo = []; servAberto = false;
      _aplicarHorariosServ();
      _passo('Trocou o serviço pra ' + (servicos.find(x => x.id === selServ)?.nome || '')); desenhar();
    }));
    app.querySelector('#ap-serv-toggle')?.addEventListener('click', () => { servAberto = !servAberto; desenhar(); });
    app.querySelector('#ap-ajuda-btn')?.addEventListener('click', () => {
      const s = _servSel();
      let d = String(cfg.whatsapp || '').replace(/\D/g, ''); if (d.length <= 11) d = '55' + d;
      const txt = `Oi! Eu quero muito a ${s?.nome || 'sessão'}${s?.destaque ? ` da ${s.destaque}` : ''}, mas os meus horários não batem${s?.nota ? ` (${s.nota})` : ''}. Tem como você me ajudar?`
        + (ident?.nome ? `\n\n👤 ${ident.nome}` : '');
      _passo('Pediu ajuda no WhatsApp (horários não batem)');
      if (TESTE) { _aviso('🧪 Modo teste: aqui abriria o WhatsApp com: "' + txt.split('\n')[0] + '"'); return; }
      location.href = `https://wa.me/${d}?text=${encodeURIComponent(txt)}`;
    });
    app.querySelectorAll('[data-pac]').forEach(b => b.addEventListener('click', () => { selServ = b.dataset.pac; _aplicarHorariosServ(); desenhar(); }));
    app.querySelectorAll('[data-hora]').forEach(b => b.addEventListener('click', () => {
      selHora = (selHora === b.dataset.hora) ? null : b.dataset.hora;
      if (selHora) chamaHora = false;
      if (selHora) _passo(`Escolheu o horário ${selHora} de ${_diaTxt(selDia)}`);
      desenhar();
      const f = app.querySelector('.ap-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const btn = app.querySelector('#ap-confirmar');
    if (btn) btn.addEventListener('click', () => confirmar(dia));
    // cupom de desconto
    app.querySelector('#ap-cupom-tog')?.addEventListener('click', () => { cupomAberto = true; desenhar(); app.querySelector('#ap-cupom')?.focus(); });
    app.querySelector('#ap-cupom-tirar')?.addEventListener('click', () => { cupom = null; cupomAberto = false; desenhar(); });
    app.querySelector('#ap-cupom-ok')?.addEventListener('click', async () => {
      const inp = app.querySelector('#ap-cupom'), msg = app.querySelector('#ap-cupom-msg'), b = app.querySelector('#ap-cupom-ok');
      const cod = (inp?.value || '').trim(); if (!cod) { inp?.focus(); return; }
      b.disabled = true; b.textContent = '…';
      const r = await validarCupom(cfg.slug, cod, ident?.contato || '');
      if (r.ok) {
        cupom = r; cupomAberto = false;
        // cartão presente: já escolhe o serviço do presente
        if (r.tipo === 'presente' && r.servico) {
          const n = x => String(x || '').toLowerCase();
          const sv = (cfg.servicos || []).find(s => n(s.nome) === n(r.servico)) || (cfg.servicos || []).find(s => n(s.nome).startsWith(n(r.servico).split(' (')[0]));
          if (sv) { selServ = sv.id; combo = []; _aplicarHorariosServ(); }
        }
        desenhar();
      }
      else {
        b.disabled = false; b.textContent = 'Aplicar';
        if (msg) msg.textContent = r.motivo === 'esgotado' ? 'As sessões desse cupom já acabaram. Fala com a profissional pra renovar.'
          : r.motivo === 'outra_pessoa' ? 'Esse cupom é de outra pessoa (vale só pro WhatsApp de quem recebeu).'
          : r.motivo === 'vencido' ? 'Esse código venceu. Fala com a profissional.'
          : r.motivo === 'usado' ? 'Esse cartão presente já foi usado.'
          : 'Cupom não encontrado. Confere o código.';
      }
    });
    // veio com ?cupom= no link: aplica sozinho uma vez, quando aparece o formulário de confirmar
    if (cupomUrl && !cupomAuto && !cupom && app.querySelector('#ap-cupom-ok')) { cupomAuto = true; app.querySelector('#ap-cupom-ok').click(); }

    // Retráteis (Meus agendamentos / Histórico)
    app.querySelectorAll('.ap-accord-btn').forEach(b => b.addEventListener('click', () => {
      const body = b.nextElementSibling; const seta = b.querySelector('.ap-accord-seta');
      const abrir = body.hidden; body.hidden = !abrir; if (seta) seta.textContent = abrir ? '▴' : '▾';
    }));

    // Cancelar um agendamento do próprio cliente (identificado pelo WhatsApp).
    app.querySelectorAll('.ap-hist-cancel').forEach(b => b.addEventListener('click', async () => {
      if (!(await _confirmarBonito('Cancelar este agendamento?', 'O horário fica livre pra outra pessoa marcar.', 'Sim, cancelar', 'Voltar'))) return;
      const id = b.dataset.cancelId, dataC = b.dataset.cancelData, horaC = b.dataset.cancelHora;
      b.disabled = true; b.textContent = 'Cancelando…';
      try {
        await cancelarMeuAgendamento(cfg.slug, ident?.contato, id);
        meusAgs = meusAgs.filter(a => a.id !== id);
        _removerHist(cfg.slug, id);
        try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}
        for (const dd of dias) for (const s of dd.horarios) s.ocupado = estaOcupado(ocupados, dd.iso, s.hora, DUR);
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
    const servLinha = combo.length > 1
      ? `<div class="ap-form-serv">💆 ${_esc(_comboNome())}${_comboPreco() != null ? ` · <b>R$ ${_precoTxt(_comboPreco())}</b>` : ''}</div>`
      : serv
      ? `<div class="ap-form-serv">💆 ${_esc(serv.nome)}${serv.preco != null ? ` · <b>R$ ${_precoTxt(serv.preco)}</b>` : ''}</div>`
      : '';
    return `
      <div class="ap-form">
        <div class="ap-form-res">📌 ${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)} · <b>${hora}${fim ? `–${fim}` : ''}</b></div>
        ${servLinha}
        <div class="ap-form-ident">Agendando como <b>${_esc(ident?.nome || '')}</b>${ident?.contato ? ` · ${_esc(ident.contato)}` : ''}</div>
        ${cupom && cupom.tipo === 'presente' ? `<div class="ap-cupom-ok">🎁 Cartão presente <b>${_esc(cupom.codigo)}</b> · ${_esc(String(cupom.servico || '').split(' (')[0])} sem custo <button type="button" id="ap-cupom-tirar" aria-label="Tirar cartão">✕</button></div>`
          : cupom ? `<div class="ap-cupom-ok">🎟️ Cupom <b>${_esc(cupom.codigo)}</b> · ${cupom.desconto >= 100 ? 'desconto integral (sem custo)' : `${cupom.desconto}% de desconto`}${cupom.restantes != null ? ` · <b>${cupom.restantes} de ${cupom.limite}</b> sessões disponíveis` : ''} <button type="button" id="ap-cupom-tirar" aria-label="Tirar cupom">✕</button></div>`
          : cupomAberto ? `<div class="ap-cupom-linha"><input id="ap-cupom" value="${_esc(cupomUrl)}" placeholder="Código do cupom" maxlength="30" autocapitalize="characters" autocomplete="off"><button class="btn-secondary" id="ap-cupom-ok" type="button">Aplicar</button></div><div class="ap-cupom-msg" id="ap-cupom-msg"></div>`
          : '<button class="ap-cupom-tog" id="ap-cupom-tog" type="button">🎟️ Tenho um cupom de desconto</button>'}
        <button class="btn-primary" id="ap-confirmar" type="button">Confirmar agendamento</button>
      </div>`;
  }

  async function confirmar(dia) {
    const nome = ident?.nome || '';
    const zap = ident?.contato || '';
    if (nome.length < 2 || zap.replace(/\D/g, '').length < 8) { ident = null; mostrar(); return; }
    const btn = app.querySelector('#ap-confirmar'); btn.disabled = true; btn.textContent = 'Agendando…';
    _passo('Tocou em confirmar');
    try {
      const hora = selHora;
      const serv = _servSel();
      const fim = _fim(hora, _durSel());
      const ehCombo = combo.length > 1;
      const nomeServ = ehCombo ? _comboNome() : (serv?.nome || null);
      const res = TESTE ? {} : ehCombo
        ? await criarAgendamentoCombo(cfg.slug, dia.iso, hora, nome, zap, combo)
        : await criarAgendamento(cfg.slug, dia.iso, hora, nome, zap, selServ);
      // guarda no histórico do aparelho (com id+token pra poder cancelar) e tira dos disponíveis
      if (!TESTE) _salvarHist(cfg.slug, { data: dia.iso, hora, nome, servico: nomeServ, id: res?.id, token: res?.token });
      _passo(`Agendou: ${nomeServ || 'serviço'} · ${_diaTxt(dia.iso)} às ${hora}`);
      // cupom: grava no agendamento recém-criado (falhar aqui não desfaz o agendamento)
      let cupomOk = null;
      if (cupom && TESTE) { cupomOk = cupom; cupom = null; }
      if (cupom) { try { const r = await aplicarCupom(cfg.slug, dia.iso, hora, zap, cupom.codigo); if (r.ok) cupomOk = r; } catch {} cupom = null; }
      // marca o intervalo recém-agendado (início→fim do serviço/duração) como ocupado
      const iniB = _hm(hora); const durB = _durSel() || DUR;
      if (!ocupados.has(dia.iso)) ocupados.set(dia.iso, []);
      ocupados.get(dia.iso).push({ ini: iniB, fim: iniB + durB });
      for (const s of dia.horarios) s.ocupado = estaOcupado(ocupados, dia.iso, s.hora, DUR);
      selHora = null;
      const dataTxt = `${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)}`;
      const precoOk = ehCombo ? _comboPreco() : (serv?.preco ?? null);
      // Veio da triagem: último passo = a cliente manda o resumo pro WhatsApp da profissional
      // Último passo: a cliente manda a confirmação pro WhatsApp da profissional.
      // Veio da triagem → mensagem da triagem; senão → mensagem com o que ela escolheu.
      let waTri = '';
      const quando = `${dataTxt} às ${hora}${fim ? `–${fim}` : ''}`;
      if (TRI && TRI.whatsapp && TRI.msg) {
        const txt = TRI.msg.replace('{{QUANDO}}', quando).replace('{{SERVICO}}', nomeServ || '—');
        waTri = `https://wa.me/${String(TRI.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`;
        try { localStorage.removeItem(_triKey(cfg.slug)); } catch {}
        combo = [];
      } else if (String(cfg.whatsapp || '').replace(/\D/g, '').length >= 10) {
        let d = String(cfg.whatsapp).replace(/\D/g, ''); if (d.length <= 11) d = '55' + d;
        const pro = (cfg.titulo || '').split(' · ')[0].trim().split(/\s+/)[0];
        // ficha ainda não respondida? avisa a profissional na própria mensagem (ela manda o link na conversa)
        let semFicha = false;
        try { const st = await Promise.race([fichaStatusPublico(cfg.slug, zap), new Promise(r => setTimeout(() => r({}), 1500))]); semFicha = !!(st.ativa && !st.tem); } catch {}
        const txt = `Olá${pro ? ', ' + pro : ''}! Acabei de agendar pelo seu link 😊\n\n`
          + (nomeServ ? `💆 ${nomeServ}\n` : '') + `📅 ${quando}\n👤 ${nome}`
          + (cupomOk ? `\n🎟️ Cupom ${cupomOk.codigo}` : '')
          + (semFicha ? '\n\n📋 Ainda não preenchi a ficha de atendimento.' : '');
        waTri = `https://wa.me/${d}?text=${encodeURIComponent(txt)}`;
      }
      app.innerHTML = _tela(`
        <div class="ap-ok">
          <div class="ap-ok-ic">✅</div>
          <div class="ap-ok-t">Agendamento confirmado!</div>
          ${TESTE ? '<div class="ap-ok-sub" style="color:#78350F;font-weight:600">🧪 Modo teste: nada foi marcado na agenda.</div>' : ''}
          <div class="ap-ok-d">${dataTxt} às <b>${hora}${fim ? `–${fim}` : ''}</b></div>
          ${nomeServ ? `<div class="ap-ok-sub">💆 ${_esc(nomeServ)}${precoOk != null && !(cupomOk && cupomOk.desconto >= 100) ? ` · R$ ${_precoTxt(precoOk)}` : ''}</div>` : ''}
          ${cupomOk ? `<div class="ap-ok-sub">🎟️ Cupom ${_esc(cupomOk.codigo)} · ${cupomOk.desconto >= 100 ? 'desconto integral (sem custo)' : `${cupomOk.desconto}% de desconto`}</div>
          ${cupomOk.restantes != null ? `<div class="ap-ok-cupom">${cupomOk.restantes > 0 ? `Você ainda tem <b>${cupomOk.restantes} de ${cupomOk.limite}</b> sessões nesse cupom.` : `Essa foi a última sessão do cupom (${cupomOk.limite} de ${cupomOk.limite}).`}</div>` : ''}` : ''}
          ${waTri ? `<div class="ap-cd">
            <div class="ap-cd-t">Agora só falta confirmar o serviço que você agendou com ${(cfg.titulo || '').split(' · ')[0] ? `a <b>${_esc((cfg.titulo || '').split(' · ')[0])}</b>` : 'a profissional'} no WhatsApp.</div>
            <div class="ap-cd-sub">Você será direcionado em:</div>
            <div class="ap-cd-anel">
              <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ap-cd-fundo" cx="60" cy="60" r="52"/><circle class="ap-cd-prog" cx="60" cy="60" r="52"/></svg>
              <span class="ap-cd-n" id="ap-ok-cont">5</span>
            </div>
            <a class="ap-cd-link" id="ap-ok-wa-link" href="${waTri}" hidden>Não abriu? Toque aqui</a>
          </div>` : ''}
          ${cfg.endereco ? `<div class="ap-ok-end">📍 ${_esc(cfg.endereco)}</div>` : ''}
          <div class="ap-ok-sub">${_esc(cfg.titulo || '')}</div>
          <div id="ap-ficha"></div>
          <button class="btn-primary ap-ok-btn" id="ap-voltar" type="button">Ver meus agendamentos</button>
        </div>`);
      app.querySelector('#ap-voltar')?.addEventListener('click', () => { desenhar(); _carregarMeusAgs(); });
      if (waTri && TESTE) {
        // modo teste: mostra a mensagem que iria pro WhatsApp, sem abrir nada
        const txtWa = decodeURIComponent(waTri.split('?text=')[1] || '');
        const cd = app.querySelector('.ap-cd');
        if (cd) cd.innerHTML = `<div class="ap-cd-t">🧪 Aqui a cliente iria pro WhatsApp da profissional com esta mensagem pronta (no teste, nada é aberto nem enviado):</div>
          <pre style="white-space:pre-wrap;text-align:left;font:inherit;font-size:.85rem;background:rgba(0,0,0,.05);border-radius:10px;padding:.7rem .8rem;margin:.6rem 0 0">${_esc(txtWa)}</pre>`;
      } else if (waTri) {
        // 5, 4, 3, 2, 1 → abre o WhatsApp da profissional com tudo que ela escolheu
        let n = 5;
        const tick = setInterval(() => {
          n--; const el = document.getElementById('ap-ok-cont'); if (el) { el.textContent = String(Math.max(n, 0)); el.classList.remove('pula'); void el.offsetWidth; el.classList.add('pula'); }
          if (n <= 0) {
            clearInterval(tick);
            document.getElementById('ap-ok-wa-link')?.removeAttribute('hidden');
            _passo('Abriu o WhatsApp com a mensagem pronta (enviar é com ela)');
            location.href = waTri;
          }
        }, 1000);
      } else {
        _oferecerFicha(cfg.slug, nome, zap);
      }
    } catch (e) {
      _aviso(e.message || 'Não deu pra agendar');
      _passo('Erro ao agendar: ' + (e.message || 'sem detalhe'));
      // horário pode ter sido pego: recarrega ocupados e re-marca todos os dias
      try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}
      for (const dd of dias) for (const s of dd.horarios) s.ocupado = estaOcupado(ocupados, dd.iso, s.hora, DUR);
      selHora = null; desenhar();
    }
  }
}

// Depois de agendar: se a profissional usa ficha e esse WhatsApp ainda não respondeu,
// oferece a ficha na hora, já com nome e WhatsApp (passados pelo rascunho do aparelho,
// nunca pela URL).
async function _oferecerFicha(slug, nome, zap) {
  const st = await fichaStatusPublico(slug, zap);
  const box = document.getElementById('ap-ficha');
  if (!box || !st.ativa || st.tem) return;
  box.innerHTML = `<div class="ap-ficha-card">
    <div class="ap-ficha-t">📋 Um passo antes da sua sessão</div>
    <div class="ap-ficha-d">Responda uma ficha rápida (uns 5 minutos) pra sua sessão ser preparada pro seu corpo.</div>
    <button class="btn-primary" id="ap-ficha-btn" type="button">Preencher minha ficha</button>
  </div>`;
  box.querySelector('#ap-ficha-btn').onclick = () => {
    const chave = `falcon_ficha_${slug}_geral`;
    let d = {};
    try { d = JSON.parse(localStorage.getItem(chave) || '{}') || {}; } catch {}
    const dig = String(zap || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
    const whats = dig.length >= 10 ? `(${dig.slice(0, 2)}) ${dig.slice(2, dig.length - 4)}-${dig.slice(-4)}` : zap;
    d.R = { ...(d.R || {}), nome, whatsapp: whats };
    d.marcas = d.marcas || {};
    try { localStorage.setItem(chave, JSON.stringify(d)); } catch {}
    location.href = `/ficha/${encodeURIComponent(slug)}`;
  };
}

// Pergunta de confirmação no estilo do app (no lugar do confirm() feio do navegador).
function _confirmarBonito(titulo, texto, sim, nao) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'ap-conf-ov';
    ov.innerHTML = `<div class="ap-conf" role="dialog" aria-modal="true">
      <div class="ap-conf-t">${_esc(titulo)}</div>
      ${texto ? `<div class="ap-conf-d">${_esc(texto)}</div>` : ''}
      <div class="ap-conf-btns">
        <button type="button" class="ap-conf-nao">${_esc(nao || 'Voltar')}</button>
        <button type="button" class="ap-conf-sim">${_esc(sim || 'Confirmar')}</button>
      </div></div>`;
    const fim = v => { ov.classList.add('sai'); setTimeout(() => ov.remove(), 160); resolve(v); };
    ov.addEventListener('click', e => { if (e.target === ov) fim(false); });
    ov.querySelector('.ap-conf-nao').onclick = () => fim(false);
    ov.querySelector('.ap-conf-sim').onclick = () => fim(true);
    document.body.appendChild(ov);
    ov.querySelector('.ap-conf-nao').focus();
  });
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
