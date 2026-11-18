// ─── ÍNDICE ──────────────────────────────────────────────────
// REGISTRO DE CADA SESSÃO (lado da PROFISSIONAL) — fase 1, 2, 3…
//   sessoesPerfilHtml / wireSessoesPerfil → bloco "🩺 Sessões" no perfil do cliente
//   abrirSessao → tela cheia: dor ao pressionar (0–10 por região, a profissional
//     aperta o ponto e marca o que o cliente diz), medidas antes/depois, observações
//   Estética (18/11): plano de medidas por cliente (todas × 1ª e 5ª), medidas por
//     altura, 4 fotos, áreas tratadas, técnica/blend e o "Antes × depois" (abrirComparativo)
//   Tratamentos (18/11): cada venda/serviço vira um TRATAMENTO com as suas sessões,
//     o seu plano de medidas, as suas fotos (protocolo do serviço: rosto, celulite,
//     corpo) e o seu antes × depois montado sozinho (fotos-guiadas.js)
// Cada região mostra o valor da sessão anterior pra comparar na hora.
// Dados: ficha.js (ficha_sessoes) · Regiões/medidas: ficha-modelo.js
// ─────────────────────────────────────────────────────────────
import { getSessoes, salvarSessao, excluirSessao } from './ficha.js';
import { FRENTE, COSTAS, MEDIDAS, MEDIDAS_ALTURA, AREAS_TRATADAS, POSES, sessaoDe, nomeDa, ladoDa, baseDa, mesmoNumero } from './ficha-modelo.js';
import { subirFotoCorpo, assinarFotos } from './corpo.js';
import { PROTOCOLOS, posesDe, nomePose, acompDoServico, fichaDoServico, conferirFoto, abrirCameraGuiada, montarAntesDepois, baixarArquivo, compartilharArquivos } from './fotos-guiadas.js';
import { vendasDoCliente } from './financeiro-ui.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

// === BLOCO 1: ESTADO E AJUDANTES ===
let _sessoes = [], _erroSql = false, _demo = false;
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _dataBr = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const _hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const _num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const _fmt = n => (n == null ? '' : String(Math.round(n * 10) / 10).replace('.', ','));
// Cor da dor: 0 = verde (apertou e não doeu), 1–10 = vermelho cada vez mais forte.
const _corDor = n => (n === 0 ? 'color-mix(in srgb, #10b981 45%, transparent)' : `color-mix(in srgb, #ef4444 ${18 + n * 8}%, transparent)`);

function _doCliente(c) {
  return _sessoes.filter(s => c.contato
    ? mesmoNumero(s.cliente_digitos || s.cliente_contato, c.contato)
    : (!s.cliente_digitos && (s.cliente_nome || '').trim().toLowerCase() === (c.nome || '').trim().toLowerCase()));
}
// Sessão imediatamente anterior a uma data (pra comparar).
function _anterior(lista, s) {
  const antes = lista.filter(x => x.id !== s?.id && (x.data < (s?.data || _hoje()) || (x.data === s?.data && x.created_at < (s?.created_at || '9'))));
  return antes[antes.length - 1] || null;
}

// Demonstração (demo-profissional.html): usa sessões de exemplo e não grava nada.
export function demoSessoes(lista) { _sessoes = lista; _demo = true; }

export async function carregarSessoes() {
  if (_demo) return;
  _erroSql = false;
  try { _sessoes = await getSessoes(); }
  catch { _sessoes = []; _erroSql = true; }
}

// === BLOCO 2: BLOCO "🩺 SESSÕES" NO PERFIL ===
// Plano de medidas e fotos por cliente (estética): 'todas' (padrão) ou '1e5' = na 1ª e a cada 5 sessões
// (5ª, 10ª, 15ª…: o pacote é avaliação + 4 e a cliente pode continuar em outro pacote).
const _diaDeMedir = n => n === 1 || n % 5 === 0;
// chave = DDD + 8 últimos (ignora 55 e o 9º dígito, igual mesmoNumero); sem WhatsApp, o nome
const _chaveCli = c => {
  let d = String(c.contato || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : 'n:' + (c.nome || '').trim().toLowerCase();
};
const _planoKey = (c, tratId) => (tratId && tratId !== '_sem' ? `${_chaveCli(c)}|${tratId}` : _chaveCli(c));
const _planoDe = (ctx, c, tratId) => { const pl = ctx?.cfg?.ficha_cfg?.planos || {}; return pl[_planoKey(c, tratId)] || pl[_chaveCli(c)] || 'todas'; };
// Tratamento = uma venda de pacote ou um serviço avulso. Sessões antigas (sem tratamento) ficam em "_sem".
const _tratId = s => s?.extra?.trat?.id || '_sem';
function _grupos(lista) {
  const m = new Map();
  for (const s of lista) {
    const id = _tratId(s);
    if (!m.has(id)) m.set(id, { trat: s.extra?.trat || { id: '_sem', nome: 'Sessões', acomp: null }, sessoes: [] });
    m.get(id).sessoes.push(s);
  }
  return [...m.values()].sort((a, b) => (a.sessoes.at(-1).data < b.sessoes.at(-1).data ? 1 : -1));
}
const _icone = acomp => (acomp || []).map(a => PROTOCOLOS[a]?.icone).filter(Boolean).join('') || '🩺';
const _resumoSess = s => {
  const pal = Object.values(s.palpacao || {}).filter(v => typeof v === 'number');
  const med = Object.keys(s.medidas || {}).length;
  const fts = Object.values(s.extra?.fotos || {}).filter(Boolean).length, ars = (s.extra?.areas || []).length;
  return [pal.length ? `${pal.length} ponto${pal.length > 1 ? 's' : ''} · maior dor ${Math.max(...pal)}` : '', med ? `${med} medida${med > 1 ? 's' : ''}` : '',
    fts ? `${fts} foto${fts > 1 ? 's' : ''}` : '', ars ? `${ars} área${ars > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
};
const _temMedida = o => Object.values(o || {}).some(v => v && (v.antes != null || v.depois != null));
const _temFoto = s => Object.values(s?.extra?.fotos || {}).some(Boolean);

export function sessoesPerfilHtml(c, ctx = {}) {
  const lista = _doCliente(c);
  const cs = sessaoDe(ctx.profissao);
  if (!cs.plano) {   // massoterapia: lista simples, como sempre
    return `<div class="fi-sess">
      <div class="fi-sess-tit">🩺 Sessões${lista.length ? ` <small>${lista.length}</small>` : ''}</div>
      ${_erroSql ? '<div class="fi-aviso">Falta rodar o SQL das sessões (sql/ficha-sessoes.sql).</div>' : ''}
      <button class="fi-btn" id="fi-sess-nova" type="button">➕ Registrar sessão de hoje</button>
      ${lista.slice().reverse().map(s => { const r = _resumoSess(s); return `<button class="fi-fase" data-fi-sess="${_esc(s.id)}" type="button">Sessão ${lista.indexOf(s) + 1} · ${_dataBr(s.data)}${r ? `<br><small>${r}</small>` : ''}</button>`; }).join('')}
    </div>`;
  }
  const grupos = _grupos(lista);
  return `<div class="fi-sess">
    <div class="fi-sess-tit">🩺 Tratamentos${grupos.length ? ` <small>${grupos.length}</small>` : ''}</div>
    ${_erroSql ? '<div class="fi-aviso">Falta rodar o SQL das sessões (sql/ficha-sessoes.sql).</div>' : ''}
    ${grupos.map(g => {
      const t = g.trat, plano = _planoDe(ctx, c, t.id), medeCorpo = (t.acomp || []).includes('corpo') || !t.acomp;
      const comp = g.sessoes.filter(s => _temMedida(s.medidas) || _temFoto(s)).length;
      return `<div class="fs-trat" data-trat="${_esc(t.id)}">
        <div class="fs-trat-tit">${_icone(t.acomp)} ${_esc(t.nome)}</div>
        <div class="fs-trat-sub">${g.sessoes.length} ${g.sessoes.length > 1 ? 'sessões' : 'sessão'} · última ${_dataBr(g.sessoes.at(-1).data)}</div>
        ${medeCorpo || (t.acomp || []).length ? `<div class="fs-abas fs-abas-plano"><button type="button" data-fs-plano="todas" class="${plano === 'todas' ? 'on' : ''}">Medir e fotografar sempre</button><button type="button" data-fs-plano="1e5" class="${plano === '1e5' ? 'on' : ''}">1ª e a cada 5</button></div>` : ''}
        <div class="fs-trat-btns">
          <button class="fi-btn" data-trat-nova type="button">➕ Sessão de hoje</button>
          ${comp >= 2 ? '<button class="fi-btn" data-trat-comp type="button">🖼️ Antes × depois</button>' : ''}
        </div>
        ${g.sessoes.slice().reverse().map(s => { const r = _resumoSess(s); return `<button class="fi-fase" data-fi-sess="${_esc(s.id)}" type="button">Sessão ${g.sessoes.indexOf(s) + 1} · ${_dataBr(s.data)}${r ? `<br><small>${r}</small>` : ''}</button>`; }).join('')}
      </div>`;
    }).join('')}
    <button class="fi-btn fs-trat-novo" id="fi-trat-novo" type="button">➕ Começar um tratamento</button>
  </div>`;
}

export function wireSessoesPerfil(ov, c, atualizar, ctx = {}) {
  const grupos = _grupos(_doCliente(c));
  const trat = el => grupos.find(g => g.trat.id === el.closest('[data-trat]')?.dataset.trat)?.trat || null;
  ov.querySelector('#fi-sess-nova')?.addEventListener('click', () => abrirSessao(c, null, atualizar, ctx));
  ov.querySelector('#fi-trat-novo')?.addEventListener('click', () => _escolherTratamento(c, ctx, t => abrirSessao(c, null, atualizar, { ...ctx, trat: t })));
  ov.querySelectorAll('[data-trat-nova]').forEach(b => b.addEventListener('click', () => abrirSessao(c, null, atualizar, { ...ctx, trat: trat(b) })));
  ov.querySelectorAll('[data-trat-comp]').forEach(b => b.addEventListener('click', () => abrirComparativo(c, { ...ctx, trat: trat(b) })));
  ov.querySelectorAll('[data-fi-sess]').forEach(b => b.addEventListener('click', () => {
    const s = _sessoes.find(x => x.id === b.dataset.fiSess); if (s) abrirSessao(c, s, atualizar, { ...ctx, trat: s.extra?.trat || null });
  }));
  ov.querySelectorAll('[data-fs-plano]').forEach(b => b.addEventListener('click', async () => {
    const t = trat(b);
    const fc = { ...(ctx.cfg?.ficha_cfg || {}) };
    fc.planos = { ...(fc.planos || {}), [_planoKey(c, t?.id)]: b.dataset.fsPlano };
    try {
      if (!_demo) await ctx.salvarCfg?.(fc); else if (ctx.cfg) ctx.cfg.ficha_cfg = fc;
      atualizar?.();
      showToast(b.dataset.fsPlano === '1e5' ? '📏 Medidas e fotos na 1ª sessão e a cada 5 (5ª, 10ª, 15ª…)' : '📏 Medidas e fotos em todas as sessões', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }));
}

// Escolher o tratamento: pacotes que a cliente comprou + os serviços da agenda.
function _escolherTratamento(c, ctx, escolheu) {
  const servs = ctx.cfg?.servicos || [];
  const jaTem = new Set(_grupos(_doCliente(c)).map(g => g.trat.id));
  let vendas = []; try { vendas = vendasDoCliente(c) || []; } catch { vendas = []; }
  const pacotes = vendas.filter(v => v.tipo === 'pacote' && !jaTem.has('v:' + v.id)).map(v => {
    const s = servs.find(x => x.id === v.servico_id) || servs.find(x => x.nome === v.item);
    return { id: 'v:' + v.id, nome: String(v.item || '').split(' (')[0], sub: `Pacote comprado em ${_dataBr(v.data)} · ${v.sessoes || 1} sessões`, acomp: acompDoServico(s || { nome: v.item }), ficha: fichaDoServico(s || { nome: v.item }, ctx.profissao) };
  });
  const avulsos = servs.filter(s => s.nome && !s.pacoteDe).map(s => ({ id: 's:' + s.id, nome: String(s.nome).split(' (')[0], sub: (s.sessoes || 1) > 1 ? `Pacote de ${s.sessoes} sessões` : 'Sessão', acomp: acompDoServico(s), ficha: fichaDoServico(s, ctx.profissao) }));
  const fundo = document.createElement('div'); fundo.className = 'fin-pick-ov';
  const op = o => `<button type="button" class="fin-pick-op" data-id="${_esc(o.id)}"><span class="fin-pick-txt"><b>${_icone(o.acomp)} ${_esc(o.nome)}</b><small>${_esc(o.sub)}${o.acomp.length ? ' · ' + o.acomp.map(a => PROTOCOLOS[a].nome).join(' + ') : ' · sem fotos'}</small></span></button>`;
  fundo.innerHTML = `<div class="fin-pick-folha" role="dialog" aria-label="Qual tratamento?">
    <div class="fin-pick-tit">Qual tratamento?</div>
    <div class="fin-pick-lista">
      ${pacotes.length ? `<div class="fin-pick-grupo">Pacotes que ${_esc((c.nome || 'ela').split(' ')[0])} comprou</div>${pacotes.map(op).join('')}` : ''}
      <div class="fin-pick-grupo">Serviços</div>${avulsos.map(op).join('') || '<div class="fi-vazio">Cadastre os serviços na Agenda.</div>'}
    </div></div>`;
  document.body.appendChild(fundo);
  fundo.addEventListener('click', e => { if (e.target === fundo) fundo.remove(); });
  fundo.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
    const o = pacotes.concat(avulsos).find(x => x.id === b.dataset.id); fundo.remove();
    if (o) escolheu({ id: o.id, nome: o.nome, acomp: o.acomp, ficha: o.ficha });
  });
}

// === BLOCO 3: TELA DA SESSÃO ===
export function abrirSessao(c, sessao, onSalvo, ctx = {}) {
  const trat = ctx.trat || sessao?.extra?.trat || null;
  // formato da sessão = o da ficha do tratamento (terapêutica → massagem: dor ao pressionar; acne → pele: só fotos do rosto)
  const cs = sessaoDe(trat?.ficha || ctx.profissao);
  const csPerfil = sessaoDe(ctx.profissao);
  // sessões do MESMO tratamento (numeração, "última medida" e fantasma da foto)
  const lista = _doCliente(c).filter(x => !csPerfil.plano || _tratId(x) === (trat?.id || '_sem'));
  const acomp = trat?.acomp || null;
  const poses = acomp ? posesDe(acomp) : (cs.fotos ? POSES : []);
  const medeCorpo = !acomp || acomp.includes('corpo');
  const st = {
    extra: JSON.parse(JSON.stringify(sessao?.extra || {})),
    id: sessao?.id || null, data: sessao?.data || _hoje(),
    palpacao: { ...(sessao?.palpacao || {}) }, medidas: JSON.parse(JSON.stringify(sessao?.medidas || {})),
    observacoes: sessao?.observacoes || '',
  };
  const ant = _anterior(lista, sessao || { data: st.data });
  const nSessao = sessao ? lista.indexOf(sessao) + 1 : lista.length + 1;
  let vista = 'costas', aberta = null;
  if (!st.extra.fotos) st.extra.fotos = {};
  if (!Array.isArray(st.extra.areas)) st.extra.areas = [];
  if (trat) st.extra.trat = { id: trat.id, nome: trat.nome, acomp: trat.acomp || [], ...(trat.ficha ? { ficha: trat.ficha } : {}) };
  // Plano "1ª e a cada 5": nas outras sessões, medidas e fotos ficam fechadas (dá pra abrir se quiser).
  const foraDoPlano = cs.plano && _planoDe(ctx, c, trat?.id) === '1e5' && !_diaDeMedir(nSessao) && !_temMedida(st.medidas) && !_temFoto(st);
  const fotoNegada = ctx.fotos === 'Não';
  // Dor ao pressionar: abre sozinha só se a ficha mostra dor (ou a sessão já tem pontos marcados).
  let palpAberta = cs.palpacao && (ctx.temDor !== false || Object.keys(st.palpacao).length > 0);

  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fi-sessao-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" id="fs-back" type="button" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg></button>
      <div class="ag-title">🩺 Sessão ${nSessao}${trat ? ` · ${_esc(trat.nome)}` : ''} · ${_esc((c.nome || '').split(' ')[0])}</div>
    </div>
    <div class="ag-scroll">
      <label class="input-field"><div class="input-field-label">Data da sessão</div>
        <input type="date" id="fs-data" value="${_esc(st.data)}"></label>

      ${cs.palpacao && !palpAberta ? `<div class="fi-bloco" id="fs-palp-fechada"><div class="fi-secao-sub" style="margin-top:0">🖐️ Pela ficha, ${_esc((c.nome || 'a cliente').split(' ')[0])} não tem queixa de dor.</div>
        <button class="fi-btn" id="fs-palp-abrir" type="button">Avaliar dor ao pressionar mesmo assim</button></div>` : ''}
      ${cs.palpacao ? `<div class="fi-bloco" id="fs-bl-palp"${palpAberta ? '' : ' hidden'}>
        <div class="fi-bloco-tit">🖐️ Dor ao pressionar · 0 a 10</div>
        <div class="fi-secao-sub" style="margin-top:0">Aperte o ponto, pergunte de 0 a 10 e toque na região pra marcar.${ant ? ` Entre parênteses, o valor da sessão anterior (${_dataBr(ant.data)}).` : ''}</div>
        <div class="fs-abas"><button type="button" data-vista="frente">Frente</button><button type="button" data-vista="costas">Costas</button></div>
        <div class="fs-palco"><span class="fs-lado esq" id="fs-lado-esq"></span><span class="fs-lado dir" id="fs-lado-dir"></span>
          <svg class="fs-svg" id="fs-svg" viewBox="0 0 240 500"></svg></div>
        <div id="fs-pal-lista"></div>
      </div>` : ''}

      ${foraDoPlano ? `<div class="fi-bloco" id="fs-fora"><div class="fi-secao-sub" style="margin-top:0">📏 O plano dessa cliente é medir e fotografar <b>na 1ª sessão e a cada 5</b> (5ª, 10ª, 15ª…). Essa é a sessão ${nSessao}.</div>
        <button class="fi-btn" id="fs-fora-abrir" type="button">Registrar medidas e fotos mesmo assim</button></div>` : ''}

      <div class="fi-bloco" id="fs-bl-medidas"${foraDoPlano || !cs.medidas ? ' hidden' : ''}>
        <button class="fs-med-tog" id="fs-med-tog" type="button">📏 ${cs.medidas === 'por_altura' ? 'Medidas' : 'Medidas antes e depois'} <span id="fs-med-seta">▾</span></button>
        <div id="fs-medidas" hidden></div>
      </div>

      ${poses.length ? `<div class="fi-bloco" id="fs-bl-fotos"${foraDoPlano ? ' hidden' : ''}>
        <div class="fi-bloco-tit">📸 Fotos <small>${poses.length}</small></div>
        ${(acomp || []).map(a => `<div class="fs-instr">${PROTOCOLOS[a].icone} <b>${PROTOCOLOS[a].nome}:</b> ${PROTOCOLOS[a].instr}</div>`).join('')}
        ${fotoNegada ? '<div class="fi-aviso">⚠️ Na ficha, a cliente <b>não autorizou</b> fotos.</div>'
          : ctx.insta === 'Sim, pode usar sem o rosto' ? '<div class="fi-secao-sub" style="margin-top:0">✅ Autorizou fotos e uso no Instagram sem o rosto.</div>'
          : ctx.fotos ? '<div class="fi-secao-sub" style="margin-top:0">Autorizou fotos só pro acompanhamento (não pro Instagram).</div>' : ''}
        <div class="fs-fotos" id="fs-fotos"></div>
        <button class="fi-btn" id="fs-foto-guiada" type="button">📷 Tirar as fotos com o guia</button>
        <input type="file" id="fs-foto-in" accept="image/*" hidden>
      </div>` : ''}

      ${cs.areas && (!acomp || acomp.includes('corpo') || acomp.includes('celulite')) ? `<div class="fi-bloco">
        <div class="fi-bloco-tit">🎯 Áreas tratadas hoje</div>
        <div id="fs-areas"></div>
      </div>` : ''}

      ${cs.tecnica ? `<div class="fi-bloco">
        <div class="fi-bloco-tit">🧴 Técnica e blend</div>
        <label class="input-field"><div class="input-field-label">Técnicas e blends usados</div>
          <input id="fs-tecnica" maxlength="300" placeholder="Ex: drenagem + modeladora, blend Xô Celulite" value="${_esc(st.extra.tecnica || '')}"></label>
        <label class="input-field"><div class="input-field-label">O que levou pra casa</div>
          <input id="fs-levou" maxlength="300" placeholder="Ex: Xô Celulite 30 ml" value="${_esc(st.extra.levou || '')}"></label>
      </div>` : ''}

      <div class="fi-bloco">
        <div class="fi-bloco-tit">📝 Observações da sessão</div>
        <textarea id="fs-obs" rows="4" placeholder="Ex: trapézio direito muito carregado, liberou bem; indicar 4 sessões de drenagem" style="width:100%">${_esc(st.observacoes)}</textarea>
      </div>

      ${sessao ? '<button class="fi-excluir" id="fs-excluir" type="button">🗑 Apagar essa sessão</button>' : ''}
    </div>
    <div class="ag-rodape"><button class="btn-primary" id="fs-salvar" type="button">Salvar sessão</button></div>
  </div></div>
  <div class="fs-fundo" id="fs-fundo"></div>
  <div class="fs-folha" id="fs-folha">
    <div class="fs-folha-nome" id="fs-f-nome"></div>
    <div class="fs-folha-lado" id="fs-f-lado"></div>
    <div class="fs-notas" id="fs-notas"></div>
    <div class="fs-folha-ant" id="fs-f-ant"></div>
    <div class="ag-fbtns">
      <button class="btn-secondary" id="fs-f-limpar" type="button">Limpar</button>
      <button class="btn-primary" id="fs-f-pronto" type="button">Pronto</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  const $ = sel => ov.querySelector(sel);
  $('#fs-back').onclick = () => history.back();

  // --- mapa (dor ao pressionar) ---
  const NS = 'http://www.w3.org/2000/svg';
  function desenharMapa() {
    const svg = $('#fs-svg'); svg.innerHTML = '';
    const ladoEsq = vista === 'frente' ? '_d' : '_e', ladoDir = vista === 'frente' ? '_e' : '_d';
    for (const r of (vista === 'frente' ? FRENTE : COSTAS)) {
      for (const [suf, esp] of (r.par ? [[ladoEsq, false], [ladoDir, true]] : [['', false]])) {
        const k = r.id + suf;
        const g = document.createElementNS(NS, 'g');
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', r.d);
        p.setAttribute('class', 'fs-r' + (aberta === k ? ' sel' : ''));
        if (esp) p.setAttribute('transform', 'translate(240,0) scale(-1,1)');
        const v = st.palpacao[k];
        if (typeof v === 'number') p.style.fill = _corDor(v);
        g.appendChild(p);
        g.addEventListener('click', () => abrirFolha(k));
        svg.appendChild(g);
        if (typeof v === 'number') {   // número em cima da região
          const bb = p.getBBox();
          const cx = esp ? 240 - (bb.x + bb.width / 2) : bb.x + bb.width / 2;
          const t = document.createElementNS(NS, 'text');
          t.setAttribute('x', cx); t.setAttribute('y', bb.y + bb.height / 2 + 3.5);
          t.setAttribute('class', 'fs-num'); t.textContent = v;
          g.appendChild(t);
        }
      }
    }
    $('#fs-lado-esq').textContent = vista === 'frente' ? 'Direito' : 'Esquerdo';
    $('#fs-lado-dir').textContent = vista === 'frente' ? 'Esquerdo' : 'Direito';
    ov.querySelectorAll('.fs-abas button').forEach(b => b.classList.toggle('on', b.dataset.vista === vista));
  }
  function listarPal() {
    const ks = Object.keys(st.palpacao).filter(k => typeof st.palpacao[k] === 'number');
    $('#fs-pal-lista').innerHTML = ks.length ? ks.map(k => {
      const a = ant?.palpacao?.[k];
      const seta = typeof a === 'number' ? (st.palpacao[k] < a ? ' ↓' : st.palpacao[k] > a ? ' ↑' : ' =') : '';
      return `<button class="fi-marca fs-item" data-k="${_esc(k)}" type="button"><span>${_esc(nomeDa(k))}${ladoDa(k) ? ` <small>(${ladoDa(k)})</small>` : ''}</span>
        <span class="fs-val" style="background:${_corDor(st.palpacao[k])}">${st.palpacao[k]}${typeof a === 'number' ? ` <small>(${a})${seta}</small>` : ''}</span></button>`;
    }).join('') : '<div class="fi-vazio">Nenhum ponto marcado ainda.</div>';
    ov.querySelectorAll('.fs-item').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (!(vista === 'frente' ? FRENTE : COSTAS).some(r => r.id === baseDa(k))) { vista = vista === 'frente' ? 'costas' : 'frente'; desenharMapa(); }
      abrirFolha(k);
    });
  }
  function abrirFolha(k) {
    aberta = k;
    $('#fs-f-nome').textContent = nomeDa(k);
    $('#fs-f-lado').textContent = ladoDa(k) ? 'Lado ' + ladoDa(k) : 'Meio do corpo';
    const a = ant?.palpacao?.[k];
    $('#fs-f-ant').textContent = typeof a === 'number' ? `Sessão anterior: ${a}` : '';
    const pintar = () => {
      $('#fs-notas').innerHTML = Array.from({ length: 11 }, (_, n) =>
        `<button type="button" data-n="${n}" class="${st.palpacao[k] === n ? 'on' : ''}" style="${st.palpacao[k] === n ? `background:${_corDor(n)}` : ''}">${n}</button>`).join('');
      ov.querySelectorAll('#fs-notas button').forEach(b => b.onclick = () => {
        st.palpacao[k] = parseInt(b.dataset.n, 10); pintar(); desenharMapa(); listarPal();
      });
    };
    pintar();
    $('#fs-fundo').classList.add('on'); $('#fs-folha').classList.add('on');
    desenharMapa();
  }
  function fecharFolha() {
    aberta = null;
    $('#fs-fundo').classList.remove('on'); $('#fs-folha').classList.remove('on');
    desenharMapa(); listarPal();
  }
  $('#fs-fundo').onclick = fecharFolha;
  $('#fs-f-pronto').onclick = fecharFolha;
  $('#fs-f-limpar').onclick = () => { delete st.palpacao[aberta]; fecharFolha(); };
  ov.querySelectorAll('.fs-abas button').forEach(b => b.onclick = () => { vista = b.dataset.vista; desenharMapa(); });

  // --- medidas antes/depois ---
  const extras = () => Object.keys(st.medidas).filter(k => k.startsWith('x_')).map(k => ({ k, nome: st.medidas[k].nome || k.slice(2), extra: true }))
    .concat(Object.keys(ant?.medidas || {}).filter(k => k.startsWith('x_') && !st.medidas[k]).map(k => ({ k, nome: ant.medidas[k].nome || k.slice(2), extra: true })));
  // última vez que essa medida foi tirada ANTES desta sessão (no plano 1ª e 5ª, nem toda sessão mede)
  const anteriores = sessao ? lista.slice(0, lista.indexOf(sessao)) : lista.slice();
  const ultimaDe = k => { for (let i = anteriores.length - 1; i >= 0; i--) { const m = anteriores[i].medidas?.[k]; const v = m ? (m.depois ?? m.antes) : null; if (v != null) return v; } return null; };
  function desenharMedidasAltura() {
    // um valor por sessão; mostra a última e a diferença na hora
    let grupo = '';
    $('#fs-medidas').innerHTML = MEDIDAS_ALTURA.concat(extras()).map(m => {
      let cab = '';
      if (m.grupo && m.grupo !== grupo) { grupo = m.grupo; if (m.grupo !== 'Peso') cab = `<div class="fs-med-grupo">${_esc(m.grupo)}</div>`; }
      if (m.extra && grupo !== '_x') { grupo = '_x'; cab = '<div class="fs-med-grupo">Outras</div>'; }
      const v = st.medidas[m.k] || {}, av = ultimaDe(m.k);
      const rot = m.grupo && m.grupo !== 'Peso' ? `Altura ${m.k.split('_').pop()}` : m.nome;
      return `${cab}<div class="fs-med fs-med1">
        <span class="fs-med-nome">${_esc(rot)} <small>· ${m.dica || m.un || 'cm'}</small>${av != null ? `<br><small>última: ${_fmt(av)}</small>` : ''}</span>
        <input inputmode="decimal" data-m="${_esc(m.k)}" data-q="antes" value="${_esc(_fmt(v.antes))}" placeholder="—">
        <span class="fs-dif" data-dif="${_esc(m.k)}"></span>
      </div>`;
    }).join('') + `<div class="fi-tipo-add" style="margin-top:10px">
        <input id="fs-med-nova" placeholder="Outra medida: ex. Panturrilha" maxlength="40">
        <button class="btn-secondary" id="fs-med-add" type="button">Adicionar</button>
      </div>`;
    const dif = k => {
      const el = ov.querySelector(`[data-dif="${k}"]`); if (!el) return;
      const av = ultimaDe(k), v = st.medidas[k]?.antes;
      if (av == null || v == null) { el.textContent = ''; el.className = 'fs-dif'; return; }
      const d = Math.round((v - av) * 10) / 10;
      el.textContent = d === 0 ? '=' : (d < 0 ? '↓ ' : '↑ ') + _fmt(Math.abs(d));
      el.className = 'fs-dif ' + (d < 0 ? 'menos' : d > 0 ? 'mais' : '');
    };
    ov.querySelectorAll('#fs-medidas input[data-m]').forEach(inp => {
      dif(inp.dataset.m);
      inp.oninput = () => {
        const k = inp.dataset.m;
        const m = st.medidas[k] || (k.startsWith('x_') ? { nome: (extras().find(x => x.k === k) || {}).nome } : {});
        m.antes = _num(inp.value); st.medidas[k] = m; dif(k);
      };
    });
    $('#fs-med-add').onclick = () => {
      const nome = $('#fs-med-nova').value.trim(); if (!nome) return;
      const k = 'x_' + nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      if (!st.medidas[k]) st.medidas[k] = { nome };
      desenharMedidasAltura();
    };
  }
  function desenharMedidas() {
    if (cs.medidas === 'por_altura') return desenharMedidasAltura();
    const linhas = MEDIDAS.concat(extras());
    $('#fs-medidas').innerHTML = `
      <div class="fs-med-cab"><span></span><span>Antes</span><span>Depois</span></div>
      ${linhas.map(m => {
        const v = st.medidas[m.k] || {}, a = ant?.medidas?.[m.k];
        const antTxt = a && (a.depois ?? a.antes) != null ? `última: ${_fmt(a.depois ?? a.antes)}` : '';
        return `<div class="fs-med">
          <span class="fs-med-nome">${_esc(m.nome)} <small>${m.un || 'cm'}</small>${antTxt ? `<br><small>${antTxt}</small>` : ''}</span>
          <input inputmode="decimal" data-m="${_esc(m.k)}" data-q="antes" value="${_esc(_fmt(v.antes))}" placeholder="—">
          <input inputmode="decimal" data-m="${_esc(m.k)}" data-q="depois" value="${_esc(_fmt(v.depois))}" placeholder="—">
        </div>`;
      }).join('')}
      <div class="fi-tipo-add" style="margin-top:10px">
        <input id="fs-med-nova" placeholder="Outra medida: ex. Pescoço" maxlength="40">
        <button class="btn-secondary" id="fs-med-add" type="button">Adicionar</button>
      </div>`;
    ov.querySelectorAll('#fs-medidas input[data-m]').forEach(inp => inp.oninput = () => {
      const k = inp.dataset.m, q = inp.dataset.q;
      const m = st.medidas[k] || (k.startsWith('x_') ? { nome: (MEDIDAS.concat(extras()).find(x => x.k === k) || {}).nome } : {});
      m[q] = _num(inp.value);
      st.medidas[k] = m;
    });
    $('#fs-med-add').onclick = () => {
      const nome = $('#fs-med-nova').value.trim(); if (!nome) return;
      const k = 'x_' + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      if (!st.medidas[k]) st.medidas[k] = { nome };
      desenharMedidas();
    };
  }
  const temMedida = o => Object.values(o || {}).some(v => v && (v.antes != null || v.depois != null));
  $('#fs-med-tog').onclick = () => {
    const box = $('#fs-medidas'); box.hidden = !box.hidden;
    $('#fs-med-seta').textContent = box.hidden ? '▾' : '▴';
  };
  desenharMedidas();
  if (temMedida(st.medidas) || (medeCorpo && (temMedida(ant?.medidas) || cs.medidas === 'por_altura'))) { $('#fs-medidas').hidden = false; $('#fs-med-seta').textContent = '▴'; }
  $('#fs-fora-abrir')?.addEventListener('click', () => {
    $('#fs-fora').hidden = true; $('#fs-bl-medidas').hidden = false; if ($('#fs-bl-fotos')) $('#fs-bl-fotos').hidden = false;
  });

  // --- fotos (protocolo do tratamento: câmera guiada em sequência ou galeria conferida) ---
  const previas = {};   // caminho → link assinado / blob local
  // Foto do ANTES de cada pose (1ª sessão do tratamento que tem essa pose) → fantasma na câmera
  const antesDe = k => lista.find(x => x.id !== st.id && x.extra?.fotos?.[k])?.extra.fotos[k] || null;
  function desenharFotos() {
    const box = $('#fs-fotos'); if (!box) return;
    box.innerHTML = poses.map(p => {
      const cam = st.extra.fotos[p.k], src = cam && previas[cam];
      return `<button type="button" class="fs-foto" data-pose="${p.k}">${src ? `<img src="${_esc(src)}" alt="${_esc(p.nome)}">` : `<span class="fs-foto-mais">${cam ? '⏳' : '＋'}</span>`}<span class="fs-foto-lbl">${_esc(p.nome)}</span></button>`;
    }).join('');
    box.querySelectorAll('[data-pose]').forEach(b => b.onclick = () => _escolherOrigem(poses.find(p => p.k === b.dataset.pose)));
  }
  async function guardar(pose, blob) {
    const alvo = ov.querySelector(`[data-pose="${pose.k}"]`);
    if (alvo) alvo.innerHTML = `<span class="fs-foto-mais">⏳</span><span class="fs-foto-lbl">Enviando…</span>`;
    try {
      const cam = _demo ? URL.createObjectURL(blob) : await subirFotoCorpo(blob, 'ficha-' + pose.k);
      previas[cam] = URL.createObjectURL(blob);
      st.extra.fotos[pose.k] = cam;
    } catch (err) { showToast('Não deu pra enviar a foto: ' + err.message, 'error'); }
    desenharFotos();
  }
  const instrDe = pose => { const a = (acomp || []).find(x => PROTOCOLOS[x].poses.some(p => p.k === pose.k)); return a ? PROTOCOLOS[a].instr : ''; };
  // Câmera guiada: a partir da pose escolhida, segue pras que faltam (só aprova e vai pra próxima).
  async function sequencia(desde) {
    const ordem = desde ? [desde, ...poses.filter(p => p.k !== desde.k && !st.extra.fotos[p.k])] : poses.filter(p => !st.extra.fotos[p.k]);
    for (const [i, pose] of ordem.entries()) {
      const ant = antesDe(pose.k);
      const blob = await abrirCameraGuiada(pose, { instr: instrDe(pose), fantasma: ant ? previas[ant] : null, passo: `Foto ${i + 1} de ${ordem.length}` });
      if (!blob) break;
      await guardar(pose, blob);
    }
  }
  function _escolherOrigem(pose) {
    if (!acomp) { poseGaleria = pose; $('#fs-foto-in').value = ''; $('#fs-foto-in').click(); return; }
    const fundo = document.createElement('div'); fundo.className = 'fin-pick-ov';
    fundo.innerHTML = `<div class="fin-pick-folha"><div class="fin-pick-tit">${_esc(pose.nome)}</div>
      <button type="button" class="fin-pick-op" data-o="cam"><span class="fin-pick-txt"><b>📷 Câmera com guia</b><small>O app diz como posicionar e tira sozinho</small></span></button>
      <button type="button" class="fin-pick-op" data-o="gal"><span class="fin-pick-txt"><b>🖼️ Da galeria</b><small>O app confere se a foto ficou boa</small></span></button></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', e => {
      if (e.target === fundo) return fundo.remove();
      const o = e.target.closest('[data-o]')?.dataset.o; if (!o) return; fundo.remove();
      if (o === 'cam') sequencia(pose);
      else { poseGaleria = pose; $('#fs-foto-in').value = ''; $('#fs-foto-in').click(); }
    });
  }
  let poseGaleria = null;
  if (poses.length) {
    $('#fs-foto-guiada')?.addEventListener('click', () => sequencia(null));
    if (!acomp) $('#fs-foto-guiada')?.remove();
    $('#fs-foto-in').onchange = async e => {
      const f = e.target.files?.[0], pose = poseGaleria; if (!f || !pose) return;
      let blob; try { blob = await _reduzir(f, 2000); } catch (err) { showToast(err.message, 'error'); return; }
      const ant = antesDe(pose.k);
      const avisos = acomp ? await conferirFoto(blob, pose.k, ant ? previas[ant] : null) : [];
      if (avisos.length) {
        const ok = await _avisosFoto(pose, avisos);
        if (ok === 'outra') { $('#fs-foto-in').value = ''; $('#fs-foto-in').click(); return; }
        if (ok === 'camera') { sequencia(pose); return; }
        if (!ok) return;
      }
      await guardar(pose, blob);
    };
    desenharFotos();
    const minhas = Object.values(st.extra.fotos).filter(Boolean);
    const antigas = poses.map(p => antesDe(p.k)).filter(Boolean);
    const cams = [...new Set(minhas.concat(antigas))];
    if (cams.length && !_demo) assinarFotos(cams).then(m => { m.forEach((u, k) => { previas[k] = u; }); desenharFotos(); }).catch(() => {});
    else { cams.forEach(k => { previas[k] = k; }); desenharFotos(); }
  }

  // --- áreas tratadas ---
  function desenharAreas() {
    const box = $('#fs-areas'); if (!box) return;
    box.innerHTML = Object.entries(AREAS_TRATADAS).map(([lado, ars]) => `<div class="fs-med-grupo">${lado}</div>
      <div class="fi-tipos">${ars.map(a => `<button type="button" class="fi-tipo ${st.extra.areas.includes(a) ? 'on' : ''}" data-area="${_esc(a)}"><span class="fi-chk"></span>${_esc(a)}</button>`).join('')}</div>`).join('');
    box.querySelectorAll('[data-area]').forEach(b => b.onclick = () => {
      const a = b.dataset.area;
      st.extra.areas = st.extra.areas.includes(a) ? st.extra.areas.filter(x => x !== a) : st.extra.areas.concat(a);
      desenharAreas();
    });
  }
  desenharAreas();

  // --- salvar / apagar ---
  $('#fs-salvar').onclick = async () => {
    const btn = $('#fs-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    // limpa medidas vazias (mantém o nome das extras só se tiver valor)
    const medidas = {};
    for (const [k, v] of Object.entries(st.medidas)) if (v && (v.antes != null || v.depois != null)) medidas[k] = v;
    try {
      let extra = null;
      if (cs.fotos || cs.areas || cs.tecnica) {
        extra = { ...st.extra };
        if ($('#fs-tecnica')) extra.tecnica = $('#fs-tecnica').value.trim();
        if ($('#fs-levou')) extra.levou = $('#fs-levou').value.trim();
        extra.fotos = Object.fromEntries(Object.entries(extra.fotos || {}).filter(([, v]) => v));
      }
      const salvo = _demo ? { id: st.id || 'demo' + Date.now(), data: $('#fs-data').value || _hoje(), palpacao: st.palpacao, medidas, extra,
        observacoes: $('#fs-obs').value, cliente_nome: c.nome, cliente_contato: c.contato, created_at: new Date().toISOString() }
        : await salvarSessao({ id: st.id, data: $('#fs-data').value || _hoje(), palpacao: st.palpacao, medidas, extra,
        observacoes: $('#fs-obs').value, cliente_nome: c.nome, cliente_contato: c.contato });
      const i = _sessoes.findIndex(x => x.id === salvo.id);
      if (i >= 0) _sessoes[i] = salvo; else _sessoes.push(salvo);
      _sessoes.sort((a, b) => (a.data + a.created_at < b.data + b.created_at ? -1 : 1));
      close(); onSalvo?.(); showToast('✅ Sessão salva', 'success');
    } catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar sessão'; }
  };
  $('#fs-excluir')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Apagar sessão?', message: 'Os registros dessa sessão somem pra sempre.', confirmText: 'Apagar', danger: true });
    if (!ok) return;
    try { if (!_demo) await excluirSessao(st.id); _sessoes = _sessoes.filter(x => x.id !== st.id); close(); onSalvo?.(); showToast('Sessão apagada', 'info'); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });

  if (cs.palpacao && palpAberta) { desenharMapa(); listarPal(); }
  $('#fs-palp-abrir')?.addEventListener('click', () => {
    palpAberta = true; $('#fs-palp-fechada').hidden = true; $('#fs-bl-palp').hidden = false; desenharMapa(); listarPal();
  });
}

// === BLOCO 4: ANTES × DEPOIS DO TRATAMENTO (montado sozinho: 1ª foto × a mais recente de cada pose) ===
export async function abrirComparativo(c, ctx = {}) {
  const trat = ctx.trat || null;
  const lista = _doCliente(c).filter(s => (!trat || _tratId(s) === trat.id) && (_temMedida(s.medidas) || _temFoto(s)));
  if (lista.length < 2) { showToast('Precisa de pelo menos 2 sessões com medidas ou fotos', 'info'); return; }
  const ini = lista[0], fim = lista[lista.length - 1];
  const val = (s, k) => { const m = s.medidas?.[k]; return m ? (m.depois ?? m.antes ?? null) : null; };
  const chaves = [...new Set(lista.flatMap(s => Object.keys(s.medidas || {})))];
  const nomeMed = k => (MEDIDAS_ALTURA.concat(MEDIDAS).find(m => m.k === k)?.nome) || lista.find(s => s.medidas?.[k]?.nome)?.medidas[k].nome || k.replace(/^x_/, '');
  let totalCm = 0;
  const linhas = chaves.map(k => {
    const com = lista.filter(s => val(s, k) != null); if (com.length < 2) return '';
    const a = val(com[0], k), b = val(com[com.length - 1], k), d = Math.round((b - a) * 10) / 10;
    if (k !== 'peso' && d < 0) totalCm += -d;
    return `<div class="fs-cmp-lin"><span>${_esc(nomeMed(k))}</span><span>${_fmt(a)}</span><span>${_fmt(b)}</span><span class="fs-dif ${d < 0 ? 'menos' : d > 0 ? 'mais' : ''}">${d === 0 ? '=' : (d < 0 ? '↓ ' : '↑ ') + _fmt(Math.abs(d))}</span></div>`;
  }).join('');
  // todas as poses que têm foto em mais de uma sessão
  const ks = [...new Set(lista.flatMap(s => Object.keys(s.extra?.fotos || {})))];
  const pares = ks.map(k => ({ k, nome: nomePose(k), a: lista.find(s => s.extra?.fotos?.[k])?.extra.fotos[k], b: lista.slice().reverse().find(s => s.extra?.fotos?.[k])?.extra.fotos[k] }))
    .filter(x => x.a && x.b && x.a !== x.b);
  const marca = (() => { const t = String(ctx.cfg?.titulo || ''); return (t.split(' · ')[1] || t).trim(); })();
  const primeiro = (c.nome || '').split(' ')[0];
  const temRosto = (trat?.acomp || []).includes('rosto');
  const chaveAut = _planoKey(c, trat?.id || '_sem');
  let autorizou = !!ctx.cfg?.ficha_cfg?.divulgar?.[chaveAut];

  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fs-cmp-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" id="fs-cmp-back" type="button" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg></button>
      <div class="ag-title">🖼️ Antes × depois · ${_esc(primeiro)}</div>
    </div>
    <div class="ag-scroll">
      <div class="fi-secao-sub" style="margin-top:0">${trat ? `<b>${_esc(trat.nome)}</b> · ` : ''}${_dataBr(ini.data)} → ${_dataBr(fim.data)} · ${lista.length} registros</div>
      ${totalCm > 0 ? `<div class="fs-cmp-total">↓ ${_fmt(totalCm)} cm a menos no total</div>` : ''}
      ${pares.length ? `<div class="fi-bloco"><div class="fi-bloco-tit">📸 Fotos <small>${pares.length}</small></div>
        <div class="fs-cmp-acoes">
          <button class="fi-btn" id="fs-cmp-enviar" type="button">💬 Enviar pra ${_esc(primeiro)}</button>
          <button class="fi-btn" id="fs-cmp-baixar" type="button">⬇️ Baixar todas</button>
        </div>
        <button type="button" class="fi-tipo ${autorizou ? 'on' : ''}" id="fs-cmp-aut"><span class="fi-chk"></span>📣 ${_esc(primeiro)} autorizou divulgar nas redes</button>
        <div id="fs-cmp-montagens">${pares.map((x, i) => `<div class="fs-mont" data-i="${i}"><div class="fs-med-grupo">${_esc(x.nome)}</div><div class="fs-mont-img">Montando…</div>
          <div class="fs-mont-btns"><button class="fi-btn" data-baixar="${i}" type="button">⬇️ Baixar</button><button class="fi-btn" data-comp="${i}" type="button">📤 Compartilhar</button></div></div>`).join('')}</div>
      </div>` : ''}
      ${linhas ? `<div class="fi-bloco"><div class="fi-bloco-tit">📏 Medidas</div>
        <div class="fs-cmp-lin fs-cmp-cab"><span></span><span>Antes</span><span>Agora</span><span></span></div>${linhas}</div>` : ''}
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  const $ = q => ov.querySelector(q);
  $('#fs-cmp-back').onclick = () => history.back();
  if (!pares.length) return;

  const mapa = _demo ? new Map(pares.flatMap(x => [[x.a, x.a], [x.b, x.b]])) : await assinarFotos(pares.flatMap(x => [x.a, x.b])).catch(() => new Map());
  const blobs = [];
  for (const [i, x] of pares.entries()) {
    const box = ov.querySelector(`.fs-mont[data-i="${i}"] .fs-mont-img`);
    try {
      blobs[i] = await montarAntesDepois(mapa.get(x.a), mapa.get(x.b), { marca, titulo: trat?.nome || '' });
      box.innerHTML = `<img src="${URL.createObjectURL(blobs[i])}" alt="Antes e depois: ${_esc(x.nome)}">`;
    } catch { box.textContent = 'Não consegui montar essa foto agora.'; }
  }
  const nomeArq = i => `antes-depois-${(primeiro || 'cliente').toLowerCase()}-${pares[i].k}.jpg`;
  const prontos = () => blobs.map((b, i) => [b, nomeArq(i)]).filter(([b]) => b);
  ov.querySelectorAll('[data-baixar]').forEach(b => b.onclick = () => { const i = +b.dataset.baixar; if (blobs[i]) baixarArquivo(blobs[i], nomeArq(i)); });
  ov.querySelectorAll('[data-comp]').forEach(b => b.onclick = async () => {
    const i = +b.dataset.comp; if (!blobs[i]) return;
    if (!autorizou && !(await confirmModal({ title: `${primeiro} ainda não autorizou divulgar`, message: 'Se for postar nas redes, peça a autorização antes (botão "Enviar pra cliente").', confirmText: 'Compartilhar mesmo assim', cancelText: 'Voltar' }))) return;
    compartilharArquivos([blobs[i]], [nomeArq(i)]);
  });
  $('#fs-cmp-baixar').onclick = () => prontos().forEach(([b, n]) => baixarArquivo(b, n));
  // Primeiro a cliente recebe o resultado; na mesma mensagem, o pedido pra divulgar.
  $('#fs-cmp-enviar').onclick = () => {
    const txt = `Oi ${primeiro}! 💜 Olha a tua evolução${trat ? ` no ${trat.nome}` : ''}! Fiquei muito feliz com o resultado.\n\n`
      + `Posso compartilhar esse antes e depois nas minhas redes${temRosto ? '' : ', sem mostrar teu rosto'}? Se puder, me responde "SIM" 🙏`;
    const p = prontos(); compartilharArquivos(p.map(x => x[0]), p.map(x => x[1]), txt);
  };
  $('#fs-cmp-aut').onclick = async () => {
    autorizou = !autorizou; $('#fs-cmp-aut').classList.toggle('on', autorizou);
    const fc = { ...(ctx.cfg?.ficha_cfg || {}) }; fc.divulgar = { ...(fc.divulgar || {}), [chaveAut]: autorizou };
    try { if (!_demo) await ctx.salvarCfg?.(fc); else if (ctx.cfg) ctx.cfg.ficha_cfg = fc; } catch (e) { showToast(e.message, 'error'); }
  };
}

// Foto da galeria com problema: mostra o que está errado e como tirar certo.
function _avisosFoto(pose, avisos) {
  return new Promise(res => {
    const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'fs-avisos-ov';
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">⚠️ ${_esc(pose.nome)}: a foto pode atrapalhar o antes × depois</div>
      <div class="fs-avisos">${avisos.map(a => `<div>${a}</div>`).join('')}</div>
      <button class="fi-btn" data-r="camera" type="button">📷 Tirar com a câmera guiada</button>
      <button class="fi-btn" data-r="outra" type="button">🖼️ Escolher outra da galeria</button>
      <div class="ag-fbtns"><button class="btn-secondary" data-r="nao" type="button">Cancelar</button>
        <button class="btn-primary" data-r="usar" type="button">Usar mesmo assim</button></div>
    </div></div>`;
    document.body.appendChild(ov);
    const fechar = trapModalBack(() => ov.remove());
    ov.addEventListener('click', e => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      fechar(); res(r === 'usar' ? true : r === 'nao' ? false : r);
    });
  });
}

// Reduz a foto antes de subir (padrão 1280 px; fotos de antes × depois vão com 2000 px).
async function _reduzir(file, max = 1280) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('foto inválida'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('falha')), 'image/jpeg', 0.82));
  cv.width = 0; cv.height = 0;
  return blob;
}
