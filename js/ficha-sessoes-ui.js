// ─── ÍNDICE ──────────────────────────────────────────────────
// REGISTRO DE CADA SESSÃO (lado da PROFISSIONAL) — fase 1, 2, 3…
//   sessoesPerfilHtml / wireSessoesPerfil → bloco "🩺 Sessões" no perfil do cliente
//   abrirSessao → tela cheia: dor ao pressionar (0–10 por região, a profissional
//     aperta o ponto e marca o que o cliente diz), medidas antes/depois, observações
// Cada região mostra o valor da sessão anterior pra comparar na hora.
// Dados: ficha.js (ficha_sessoes) · Regiões/medidas: ficha-modelo.js
// ─────────────────────────────────────────────────────────────
import { getSessoes, salvarSessao, excluirSessao } from './ficha.js';
import { FRENTE, COSTAS, MEDIDAS, nomeDa, ladoDa, baseDa, mesmoNumero } from './ficha-modelo.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

// === BLOCO 1: ESTADO E AJUDANTES ===
let _sessoes = [], _erroSql = false;
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

export async function carregarSessoes() {
  _erroSql = false;
  try { _sessoes = await getSessoes(); }
  catch { _sessoes = []; _erroSql = true; }
}

// === BLOCO 2: BLOCO "🩺 SESSÕES" NO PERFIL ===
export function sessoesPerfilHtml(c) {
  const lista = _doCliente(c);
  return `<div class="fi-sess">
    <div class="fi-sess-tit">🩺 Sessões${lista.length ? ` <small>${lista.length}</small>` : ''}</div>
    ${_erroSql ? '<div class="fi-aviso">Falta rodar o SQL das sessões (sql/ficha-sessoes.sql).</div>' : ''}
    <button class="fi-btn" id="fi-sess-nova" type="button">➕ Registrar sessão de hoje</button>
    ${lista.slice().reverse().map(s => {
      const pal = Object.values(s.palpacao || {}).filter(v => typeof v === 'number');
      const med = Object.keys(s.medidas || {}).length;
      const resumo = [pal.length ? `${pal.length} ponto${pal.length > 1 ? 's' : ''} · maior dor ${Math.max(...pal)}` : '', med ? `${med} medida${med > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      return `<button class="fi-fase" data-fi-sess="${_esc(s.id)}" type="button">Sessão ${lista.indexOf(s) + 1} · ${_dataBr(s.data)}${resumo ? `<br><small>${resumo}</small>` : ''}</button>`;
    }).join('')}
  </div>`;
}

export function wireSessoesPerfil(ov, c, atualizar) {
  ov.querySelector('#fi-sess-nova')?.addEventListener('click', () => abrirSessao(c, null, atualizar));
  ov.querySelectorAll('[data-fi-sess]').forEach(b => b.addEventListener('click', () => {
    const s = _sessoes.find(x => x.id === b.dataset.fiSess); if (s) abrirSessao(c, s, atualizar);
  }));
}

// === BLOCO 3: TELA DA SESSÃO ===
export function abrirSessao(c, sessao, onSalvo) {
  const lista = _doCliente(c);
  const st = {
    id: sessao?.id || null, data: sessao?.data || _hoje(),
    palpacao: { ...(sessao?.palpacao || {}) }, medidas: JSON.parse(JSON.stringify(sessao?.medidas || {})),
    observacoes: sessao?.observacoes || '',
  };
  const ant = _anterior(lista, sessao || { data: st.data });
  const nSessao = sessao ? lista.indexOf(sessao) + 1 : lista.length + 1;
  let vista = 'costas', aberta = null;

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

      <div class="fi-bloco">
        <div class="fi-bloco-tit">🖐️ Dor ao pressionar · 0 a 10</div>
        <div class="fi-secao-sub" style="margin-top:0">Aperte o ponto, pergunte de 0 a 10 e toque na região pra marcar.${ant ? ` Entre parênteses, o valor da sessão anterior (${_dataBr(ant.data)}).` : ''}</div>
        <div class="fs-abas"><button type="button" data-vista="frente">Frente</button><button type="button" data-vista="costas">Costas</button></div>
        <div class="fs-palco"><span class="fs-lado esq" id="fs-lado-esq"></span><span class="fs-lado dir" id="fs-lado-dir"></span>
          <svg class="fs-svg" id="fs-svg" viewBox="0 0 240 500"></svg></div>
        <div id="fs-pal-lista"></div>
      </div>

      <div class="fi-bloco">
        <button class="fs-med-tog" id="fs-med-tog" type="button">📏 Medidas antes e depois <span id="fs-med-seta">▾</span></button>
        <div id="fs-medidas" hidden></div>
      </div>

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
  function desenharMedidas() {
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
  if (temMedida(st.medidas) || temMedida(ant?.medidas)) { $('#fs-medidas').hidden = false; $('#fs-med-seta').textContent = '▴'; }

  // --- salvar / apagar ---
  $('#fs-salvar').onclick = async () => {
    const btn = $('#fs-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    // limpa medidas vazias (mantém o nome das extras só se tiver valor)
    const medidas = {};
    for (const [k, v] of Object.entries(st.medidas)) if (v && (v.antes != null || v.depois != null)) medidas[k] = v;
    try {
      const salvo = await salvarSessao({ id: st.id, data: $('#fs-data').value || _hoje(), palpacao: st.palpacao, medidas,
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
    try { await excluirSessao(st.id); _sessoes = _sessoes.filter(x => x.id !== st.id); close(); onSalvo?.(); showToast('Sessão apagada', 'info'); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });

  desenharMapa(); listarPal();
}
