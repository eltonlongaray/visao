// ─── ÍNDICE ──────────────────────────────────────────────────
// REGISTRO DE CADA SESSÃO (lado da PROFISSIONAL) — fase 1, 2, 3…
//   sessoesPerfilHtml / wireSessoesPerfil → bloco "🩺 Sessões" no perfil do cliente
//   abrirSessao → tela cheia: dor ao pressionar (0–10 por região, a profissional
//     aperta o ponto e marca o que o cliente diz), medidas antes/depois, observações
//   Estética (18/11): plano de medidas por cliente (todas × 1ª e 5ª), medidas por
//     altura, 4 fotos, áreas tratadas, técnica/blend e o "Antes × depois" (abrirComparativo)
// Cada região mostra o valor da sessão anterior pra comparar na hora.
// Dados: ficha.js (ficha_sessoes) · Regiões/medidas: ficha-modelo.js
// ─────────────────────────────────────────────────────────────
import { getSessoes, salvarSessao, excluirSessao } from './ficha.js';
import { FRENTE, COSTAS, MEDIDAS, MEDIDAS_ALTURA, AREAS_TRATADAS, POSES, sessaoDe, nomeDa, ladoDa, baseDa, mesmoNumero } from './ficha-modelo.js';
import { subirFotoCorpo, assinarFotos } from './corpo.js';
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
// Plano de medidas e fotos por cliente (estética): 'todas' (padrão) ou '1e5' (só 1ª e 5ª sessão).
// chave = DDD + 8 últimos (ignora 55 e o 9º dígito, igual mesmoNumero); sem WhatsApp, o nome
const _chaveCli = c => {
  let d = String(c.contato || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : 'n:' + (c.nome || '').trim().toLowerCase();
};
const _planoDe = (ctx, c) => ctx?.cfg?.ficha_cfg?.planos?.[_chaveCli(c)] || 'todas';
const _temMedida = o => Object.values(o || {}).some(v => v && (v.antes != null || v.depois != null));
const _temFoto = s => Object.values(s?.extra?.fotos || {}).some(Boolean);

export function sessoesPerfilHtml(c, ctx = {}) {
  const lista = _doCliente(c);
  const cs = sessaoDe(ctx.profissao);
  const plano = _planoDe(ctx, c);
  const comp = lista.filter(s => _temMedida(s.medidas) || _temFoto(s)).length;
  return `<div class="fi-sess">
    <div class="fi-sess-tit">🩺 Sessões${lista.length ? ` <small>${lista.length}</small>` : ''}</div>
    ${_erroSql ? '<div class="fi-aviso">Falta rodar o SQL das sessões (sql/ficha-sessoes.sql).</div>' : ''}
    ${cs.plano ? `<div class="fs-plano"><div class="fs-plano-tit">📏 Medidas e fotos</div>
      <div class="fs-abas"><button type="button" data-fs-plano="todas" class="${plano === 'todas' ? 'on' : ''}">Todas as sessões</button><button type="button" data-fs-plano="1e5" class="${plano === '1e5' ? 'on' : ''}">Só na 1ª e na 5ª</button></div></div>` : ''}
    ${cs.fotos && comp >= 2 ? '<button class="fi-btn" id="fi-sess-comp" type="button">🖼️ Antes × depois</button>' : ''}
    <button class="fi-btn" id="fi-sess-nova" type="button">➕ Registrar sessão de hoje</button>
    ${lista.slice().reverse().map(s => {
      const pal = Object.values(s.palpacao || {}).filter(v => typeof v === 'number');
      const med = Object.keys(s.medidas || {}).length;
      const fts = Object.values(s.extra?.fotos || {}).filter(Boolean).length, ars = (s.extra?.areas || []).length;
      const resumo = [pal.length ? `${pal.length} ponto${pal.length > 1 ? 's' : ''} · maior dor ${Math.max(...pal)}` : '', med ? `${med} medida${med > 1 ? 's' : ''}` : '',
        fts ? `${fts} foto${fts > 1 ? 's' : ''}` : '', ars ? `${ars} área${ars > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      return `<button class="fi-fase" data-fi-sess="${_esc(s.id)}" type="button">Sessão ${lista.indexOf(s) + 1} · ${_dataBr(s.data)}${resumo ? `<br><small>${resumo}</small>` : ''}</button>`;
    }).join('')}
  </div>`;
}

export function wireSessoesPerfil(ov, c, atualizar, ctx = {}) {
  ov.querySelector('#fi-sess-nova')?.addEventListener('click', () => abrirSessao(c, null, atualizar, ctx));
  ov.querySelectorAll('[data-fi-sess]').forEach(b => b.addEventListener('click', () => {
    const s = _sessoes.find(x => x.id === b.dataset.fiSess); if (s) abrirSessao(c, s, atualizar, ctx);
  }));
  ov.querySelector('#fi-sess-comp')?.addEventListener('click', () => abrirComparativo(c));
  ov.querySelectorAll('[data-fs-plano]').forEach(b => b.addEventListener('click', async () => {
    const fc = { ...(ctx.cfg?.ficha_cfg || {}) };
    fc.planos = { ...(fc.planos || {}), [_chaveCli(c)]: b.dataset.fsPlano };
    try {
      if (!_demo) await ctx.salvarCfg?.(fc); else if (ctx.cfg) ctx.cfg.ficha_cfg = fc;
      atualizar?.();
      showToast(b.dataset.fsPlano === '1e5' ? '📏 Medidas e fotos só na 1ª e na 5ª sessão' : '📏 Medidas e fotos em todas as sessões', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }));
}

// === BLOCO 3: TELA DA SESSÃO ===
export function abrirSessao(c, sessao, onSalvo, ctx = {}) {
  const lista = _doCliente(c);
  const cs = sessaoDe(ctx.profissao);
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
  // Plano "só 1ª e 5ª": nas outras sessões, medidas e fotos ficam fechadas (dá pra abrir se quiser).
  const foraDoPlano = cs.plano && _planoDe(ctx, c) === '1e5' && ![1, 5].includes(nSessao) && !_temMedida(st.medidas) && !_temFoto(st);
  const fotoNegada = ctx.fotos === 'Não';

  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fi-sessao-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" id="fs-back" type="button" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg></button>
      <div class="ag-title">🩺 Sessão ${nSessao} · ${_esc((c.nome || '').split(' ')[0])}</div>
    </div>
    <div class="ag-scroll">
      <label class="input-field"><div class="input-field-label">Data da sessão</div>
        <input type="date" id="fs-data" value="${_esc(st.data)}"></label>

      ${cs.palpacao ? `<div class="fi-bloco">
        <div class="fi-bloco-tit">🖐️ Dor ao pressionar · 0 a 10</div>
        <div class="fi-secao-sub" style="margin-top:0">Aperte o ponto, pergunte de 0 a 10 e toque na região pra marcar.${ant ? ` Entre parênteses, o valor da sessão anterior (${_dataBr(ant.data)}).` : ''}</div>
        <div class="fs-abas"><button type="button" data-vista="frente">Frente</button><button type="button" data-vista="costas">Costas</button></div>
        <div class="fs-palco"><span class="fs-lado esq" id="fs-lado-esq"></span><span class="fs-lado dir" id="fs-lado-dir"></span>
          <svg class="fs-svg" id="fs-svg" viewBox="0 0 240 500"></svg></div>
        <div id="fs-pal-lista"></div>
      </div>` : ''}

      ${foraDoPlano ? `<div class="fi-bloco" id="fs-fora"><div class="fi-secao-sub" style="margin-top:0">📏 O plano dessa cliente é medir e fotografar <b>só na 1ª e na 5ª sessão</b>. Essa é a sessão ${nSessao}.</div>
        <button class="fi-btn" id="fs-fora-abrir" type="button">Registrar medidas e fotos mesmo assim</button></div>` : ''}

      <div class="fi-bloco" id="fs-bl-medidas"${foraDoPlano ? ' hidden' : ''}>
        <button class="fs-med-tog" id="fs-med-tog" type="button">📏 ${cs.medidas === 'por_altura' ? 'Medidas' : 'Medidas antes e depois'} <span id="fs-med-seta">▾</span></button>
        <div id="fs-medidas" hidden></div>
      </div>

      ${cs.fotos ? `<div class="fi-bloco" id="fs-bl-fotos"${foraDoPlano ? ' hidden' : ''}>
        <div class="fi-bloco-tit">📸 Fotos</div>
        ${fotoNegada ? '<div class="fi-aviso">⚠️ Na ficha, a cliente <b>não autorizou</b> fotos.</div>'
          : ctx.insta === 'Sim, pode usar sem o rosto' ? '<div class="fi-secao-sub" style="margin-top:0">✅ Autorizou fotos e uso no Instagram sem o rosto.</div>'
          : ctx.fotos ? '<div class="fi-secao-sub" style="margin-top:0">Autorizou fotos só pro acompanhamento (não pro Instagram).</div>' : ''}
        <div class="fs-fotos" id="fs-fotos"></div>
        <input type="file" id="fs-foto-in" accept="image/*" hidden>
      </div>` : ''}

      ${cs.areas ? `<div class="fi-bloco">
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
  if (temMedida(st.medidas) || temMedida(ant?.medidas) || cs.medidas === 'por_altura') { $('#fs-medidas').hidden = false; $('#fs-med-seta').textContent = '▴'; }
  $('#fs-fora-abrir')?.addEventListener('click', () => {
    $('#fs-fora').hidden = true; $('#fs-bl-medidas').hidden = false; if ($('#fs-bl-fotos')) $('#fs-bl-fotos').hidden = false;
  });

  // --- fotos (4 poses; câmera ou galeria) ---
  const previas = {};   // caminho → link assinado / blob local
  let poseAlvo = null;
  function desenharFotos() {
    const box = $('#fs-fotos'); if (!box) return;
    box.innerHTML = POSES.map(p => {
      const cam = st.extra.fotos[p.k], src = cam && previas[cam];
      return `<button type="button" class="fs-foto" data-pose="${p.k}">${src ? `<img src="${_esc(src)}" alt="${_esc(p.nome)}">` : `<span class="fs-foto-mais">${cam ? '⏳' : '＋'}</span>`}<span class="fs-foto-lbl">${_esc(p.nome)}</span></button>`;
    }).join('');
    box.querySelectorAll('[data-pose]').forEach(b => b.onclick = () => { poseAlvo = b.dataset.pose; $('#fs-foto-in').value = ''; $('#fs-foto-in').click(); });
  }
  if (cs.fotos) {
    $('#fs-foto-in').onchange = async e => {
      const f = e.target.files?.[0], pose = poseAlvo; if (!f || !pose) return;
      const alvo = ov.querySelector(`[data-pose="${pose}"]`);
      if (alvo) alvo.innerHTML = `<span class="fs-foto-mais">⏳</span><span class="fs-foto-lbl">Enviando…</span>`;
      try {
        const blob = await _reduzir(f);
        const cam = _demo ? URL.createObjectURL(blob) : await subirFotoCorpo(blob, 'ficha-' + pose);
        previas[cam] = URL.createObjectURL(blob);
        st.extra.fotos[pose] = cam;
      } catch (err) { showToast('Não deu pra enviar a foto: ' + err.message, 'error'); }
      desenharFotos();
    };
    desenharFotos();
    const cams = Object.values(st.extra.fotos).filter(Boolean);
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

  if (cs.palpacao) { desenharMapa(); listarPal(); }
}

// === BLOCO 4: ANTES × DEPOIS (1º registro × o mais recente) ===
export async function abrirComparativo(c) {
  const lista = _doCliente(c).filter(s => _temMedida(s.medidas) || _temFoto(s));
  if (lista.length < 2) { showToast('Precisa de pelo menos 2 sessões com medidas ou fotos', 'info'); return; }
  const ini = lista[0], fim = lista[lista.length - 1];
  const val = (s, k) => { const m = s.medidas?.[k]; return m ? (m.depois ?? m.antes ?? null) : null; };
  // primeira e última vez que cada medida apareceu (nem toda sessão mede tudo)
  const chaves = [...new Set(lista.flatMap(s => Object.keys(s.medidas || {})))];
  const nomeMed = k => (MEDIDAS_ALTURA.concat(MEDIDAS).find(m => m.k === k)?.nome) || lista.find(s => s.medidas?.[k]?.nome)?.medidas[k].nome || k.replace(/^x_/, '');
  let totalCm = 0;
  const linhas = chaves.map(k => {
    const com = lista.filter(s => val(s, k) != null); if (com.length < 2) return '';
    const a = val(com[0], k), b = val(com[com.length - 1], k), d = Math.round((b - a) * 10) / 10;
    if (k !== 'peso' && d < 0) totalCm += -d;
    return `<div class="fs-cmp-lin"><span>${_esc(nomeMed(k))}</span><span>${_fmt(a)}</span><span>${_fmt(b)}</span><span class="fs-dif ${d < 0 ? 'menos' : d > 0 ? 'mais' : ''}">${d === 0 ? '=' : (d < 0 ? '↓ ' : '↑ ') + _fmt(Math.abs(d))}</span></div>`;
  }).join('');
  const fotoIni = p => lista.find(s => s.extra?.fotos?.[p])?.extra.fotos[p];
  const fotoFim = p => lista.slice().reverse().find(s => s.extra?.fotos?.[p])?.extra.fotos[p];
  const pares = POSES.map(p => ({ p, a: fotoIni(p.k), b: fotoFim(p.k) })).filter(x => x.a && x.b && x.a !== x.b);

  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fs-cmp-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" id="fs-cmp-back" type="button" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg></button>
      <div class="ag-title">🖼️ Antes × depois · ${_esc((c.nome || '').split(' ')[0])}</div>
    </div>
    <div class="ag-scroll">
      <div class="fi-secao-sub" style="margin-top:0">${_dataBr(ini.data)} → ${_dataBr(fim.data)} · ${lista.length} registros</div>
      ${totalCm > 0 ? `<div class="fs-cmp-total">↓ ${_fmt(totalCm)} cm a menos no total</div>` : ''}
      ${pares.length ? `<div class="fi-bloco"><div class="fi-bloco-tit">📸 Fotos</div>${pares.map(x => `<div class="fs-med-grupo">${_esc(x.p.nome)}</div>
        <div class="fs-cmp-fotos"><figure><img data-cam="${_esc(x.a)}" alt=""><figcaption>Antes</figcaption></figure><figure><img data-cam="${_esc(x.b)}" alt=""><figcaption>Agora</figcaption></figure></div>`).join('')}</div>` : ''}
      ${linhas ? `<div class="fi-bloco"><div class="fi-bloco-tit">📏 Medidas</div>
        <div class="fs-cmp-lin fs-cmp-cab"><span></span><span>Antes</span><span>Agora</span><span></span></div>${linhas}</div>` : ''}
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  ov.querySelector('#fs-cmp-back').onclick = () => history.back();
  const cams = [...ov.querySelectorAll('img[data-cam]')].map(i => i.dataset.cam);
  const mapa = _demo ? new Map(cams.map(k => [k, k])) : await assinarFotos(cams).catch(() => new Map());
  ov.querySelectorAll('img[data-cam]').forEach(i => { const u = mapa.get(i.dataset.cam); if (u) i.src = u; });
}

// Reduz a foto antes de subir (máx. 1280 px, JPEG 82%).
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
