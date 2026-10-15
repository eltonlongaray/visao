// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA da ficha de atendimento (ficha.html) — abre SEM login.
//   /ficha/<slug>           → link geral: pede nome + WhatsApp (o app liga ao cliente pelo número)
//   /ficha/<slug>/<codigo>  → link do cliente: já sabe quem é, não pergunta nome/WhatsApp
//   ?demo=1                 → modo demonstração (aberto de dentro do Falcon): sem preencher,
//                             sem validar, sem salvar; passa as telas arrastando pro lado
// Lê só o necessário via RPC (ficha_info) e envia via RPC (ficha_enviar).
// Nunca mostra respostas anteriores (dado de saúde).
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { avisarDonoPush } from './agenda-publica-dados.js';
import { MODELOS, FRENTE, COSTAS, TIPOS_MARCA, NIVEIS, MOMENTOS, ladoDa, baseDa, nomeDa, temMarca } from './ficha-modelo.js';

// === BLOCO 1: ESTADO ===
const [SLUG, CODIGO] = location.pathname.replace(/^\/ficha\/?/, '').replace(/\/+$/, '').split('/').map(s => decodeURIComponent(s || '').trim());
const CHAVE = `falcon_ficha_${SLUG}_${CODIGO || 'geral'}`;
const DEMO = new URLSearchParams(location.search).has('demo');
let INFO = null, MODELO = null, PRO = '', CLIENTE = '';
let R = {}, marcas = {}, tela = -1, consentiu = false, enviando = false;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const primeiro = s => String(s || '').trim().split(/\s+/)[0] || '';
const proCurto = () => (INFO && INFO.nome ? primeiro(INFO.nome) : 'a profissional');
function salvar() { if (DEMO) return; try { localStorage.setItem(CHAVE, JSON.stringify({ R, marcas, consentiu, tela })); } catch {} }
function carregarRascunho() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s) { R = s.R || {}; marcas = s.marcas || {}; consentiu = !!s.consentiu; }
  } catch {}
}

// === BLOCO 2: ENTRADA ===
async function iniciar() {
  try {
    if (!SLUG) throw new Error('sem link');
    const { data, error } = await supabase.rpc('ficha_info', { p_slug: SLUG, p_codigo: CODIGO || null });
    if (error) throw new Error(error.message);
    INFO = data || {};
    MODELO = MODELOS[INFO.profissao];
    if (!MODELO) throw new Error('modelo');
  } catch {
    if (DEMO) INFO = { nome: '', profissao: new URLSearchParams(location.search).get('p') || 'massoterapia' };
    MODELO = INFO && MODELOS[INFO.profissao];
    if (!DEMO || !MODELO) {
      $('app').innerHTML = `<div class="carregando">Esse link de ficha não está ativo.<br><small>Confira o link com quem te enviou.</small></div>`;
      return;
    }
  }
  if (DEMO) { consentiu = true; ligarArraste(); }
  PRO = INFO.nome || 'sua profissional';
  CLIENTE = INFO.cliente_nome || '';
  if (!DEMO) carregarRascunho();
  if (CLIENTE && !R.nome) R.nome = CLIENTE;
  desenharTela();
}

// === BLOCO 3: TELAS ===
function desenharTela() {
  window.scrollTo(0, 0);
  const app = $('app');
  if (tela === -1) return telaInicio(app);
  if (tela === MODELO.blocos.length) return telaFinal(app);
  const b = MODELO.blocos[tela];
  const total = MODELO.blocos.length;
  app.innerHTML = `
    ${faixaDemo()}
    <div class="topo"><span>Parte ${tela + 1} de ${total}</span><span>${esc(PRO)}</span></div>
    <div class="barra"><i style="width:${((tela + 1) / total) * 100}%"></i></div>
    <h1>${esc(b.nome)}</h1>
    <p class="sub">${tela === 0 && CODIGO ? 'Já sei quem você é, ' + esc(primeiro(CLIENTE)) + '. Só complete o que faltar.' : 'O que não souber, pode pular. A gente completa junto na sessão.'}</p>
    <div id="perguntas"></div>
    ${tela > 0 ? '<button class="pular" id="b-pular" type="button">Pular essa parte</button>' : ''}
    <div class="erro-envio" id="erro-envio"></div>`;
  const box = $('perguntas');
  for (const p of b.perguntas) {
    if (p.ident && CODIGO) continue;
    box.appendChild(montarPergunta(p));
  }
  atualizarCondicionais();
  if ($('b-pular')) $('b-pular').onclick = seguir;
  $('rodape').hidden = false;
  $('b-voltar').hidden = false;
  $('b-seguir').textContent = tela === total - 1 ? (DEMO ? 'Ver tela final' : 'Enviar ficha') : 'Continuar';
  $('b-seguir').disabled = false;
}

function telaInicio(app) {
  app.innerHTML = `
    ${faixaDemo()}
    <div class="topo"><span>${esc(PRO)}</span></div>
    <div class="barra"><i style="width:0"></i></div>
    <h1>${CLIENTE ? 'Oi, ' + esc(primeiro(CLIENTE)) + '!' : esc(MODELO.titulo)}</h1>
    <p class="sub">Essas respostas me ajudam a preparar uma sessão feita pro seu corpo. Leva uns 5 minutos.<br><br>
    O que você não souber, pode pular. A gente completa junto na sessão.</p>
    <div class="consent ${consentiu ? 'on' : ''}" id="consent" role="checkbox" aria-checked="${consentiu}" tabindex="0">
      <span class="mk"></span>
      <span>Autorizo guardar essas informações exclusivamente para meu atendimento.</span>
    </div>
    <p class="seguro">🔒 Só ${esc(proCurto())} vê suas respostas.</p>`;
  $('consent').onclick = () => { consentiu = !consentiu; salvar(); telaInicio(app); };
  $('rodape').hidden = false;
  $('b-voltar').hidden = true;
  $('b-seguir').textContent = 'Começar';
  $('b-seguir').disabled = !consentiu;
}

function faixaDemo() {
  return DEMO ? '<div class="demo-faixa">👁️ Modo demonstração · arraste pro lado · nada é salvo</div>' : '';
}

function telaFinal(app) {
  $('rodape').hidden = true;
  app.innerHTML = `
    <div class="final">
      <div class="ok"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Pronto${primeiro(R.nome) ? ', ' + esc(primeiro(R.nome)) : ''}!</h1>
      <p>Sua ficha chegou até ${esc(proCurto())}.<br>Agora é só chegar e aproveitar a sua sessão.</p>
      ${DEMO ? '<p style="margin-top:28px;font-size:13px">👁️ Essa é a tela que o cliente vê no final.<br>Na demonstração nada foi enviado.</p><button class="btn" id="b-recomecar" type="button" style="margin-top:8px">Ver de novo</button>' : ''}
    </div>`;
  if (DEMO) { $('b-recomecar').onclick = () => { tela = -1; desenharTela(); }; return; }
  try { localStorage.removeItem(CHAVE); } catch {}
}

// === BLOCO 4: MONTAR CADA PERGUNTA ===
function montarPergunta(p) {
  const el = document.createElement('div');
  el.className = 'q' + (p.sub ? ' sub-q' : '');
  el.dataset.id = p.id;
  if (p.tipo === 'aviso') { el.className = 'aviso'; el.textContent = p.q; return el; }
  el.innerHTML = `<div class="t">${esc(p.q)}</div>${p.aj ? `<div class="aj">${esc(p.aj)}</div>` : ''}<div class="corpo-q"></div>`;
  const c = el.querySelector('.corpo-q');

  if (['texto', 'whats', 'data', 'longo'].includes(p.tipo)) {
    const inp = document.createElement(p.tipo === 'longo' ? 'textarea' : 'input');
    if (p.tipo !== 'longo') inp.type = p.tipo === 'whats' ? 'tel' : p.tipo === 'data' ? 'date' : 'text';
    if (p.ph) inp.placeholder = p.ph;
    inp.maxLength = p.tipo === 'longo' ? 1500 : 200;
    inp.value = R[p.id] || '';
    inp.oninput = () => {
      if (p.tipo === 'whats') inp.value = mascaraWhats(inp.value);
      R[p.id] = inp.value; el.classList.remove('erro'); el.querySelector('.msg-erro')?.remove(); salvar();
    };
    c.appendChild(inp);
  }

  if (p.tipo === 'unica' || p.tipo === 'varias') {
    const ops = document.createElement('div'); ops.className = 'ops';
    const lista = (typeof p.op === 'function' ? p.op(INFO) : p.op).slice(); if (p.outro) lista.push('Outro');
    const outroIn = document.createElement('input');
    outroIn.type = 'text'; outroIn.className = 'outro-in'; outroIn.placeholder = 'Qual?'; outroIn.maxLength = 200;
    outroIn.value = R[p.id + '_outro'] || '';
    outroIn.oninput = () => { R[p.id + '_outro'] = outroIn.value; salvar(); };
    const pintar = () => {
      ops.querySelectorAll('.op').forEach(b => {
        const v = b.dataset.v;
        b.classList.toggle('on', p.tipo === 'unica' ? R[p.id] === v : (R[p.id] || []).includes(v));
      });
      outroIn.hidden = !(p.tipo === 'unica' ? R[p.id] === 'Outro' : (R[p.id] || []).includes('Outro'));
    };
    for (const v of lista) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'op ' + p.tipo; b.dataset.v = v;
      b.innerHTML = `<span class="mk"></span><span>${esc(v)}</span>`;
      b.onclick = () => {
        if (p.tipo === 'unica') R[p.id] = R[p.id] === v ? undefined : v;
        else {
          let a = (R[p.id] || []).slice();
          if (a.includes(v)) a = a.filter(x => x !== v);
          else if ((p.so || []).includes(v)) a = [v];                 // opção exclusiva: limpa as outras
          else a = a.filter(x => !(p.so || []).includes(x)).concat(v);
          R[p.id] = a;
        }
        pintar(); atualizarCondicionais(); salvar();
      };
      ops.appendChild(b);
    }
    c.appendChild(ops);
    if (p.outro) c.appendChild(outroIn);
    pintar();
  }

  if (p.tipo === 'escala') {
    const e = document.createElement('div'); e.className = 'escala';
    for (let i = 0; i <= 10; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = i;
      b.classList.toggle('on', R[p.id] === i);
      b.onclick = () => { R[p.id] = R[p.id] === i ? undefined : i; e.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', R[p.id] === j)); salvar(); };
      e.appendChild(b);
    }
    c.appendChild(e);
    const l = document.createElement('div'); l.className = 'escala-leg';
    l.innerHTML = `<span>0 · ${esc(p.de)}</span><span>10 · ${esc(p.ate)}</span>`;
    c.appendChild(l);
  }

  if (p.tipo === 'mapa') c.appendChild(montarMapa());
  return el;
}

function atualizarCondicionais() {
  document.querySelectorAll('#perguntas [data-id]').forEach(el => {
    const p = MODELO.blocos[tela].perguntas.find(x => x.id === el.dataset.id);
    if (p && p.se) el.hidden = !p.se(R);
  });
}

function mascaraWhats(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? '(' + d : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

// === BLOCO 5: NAVEGAÇÃO, VALIDAÇÃO E ENVIO ===
function validar() {
  if (DEMO) return true;
  if (tela < 0) return consentiu;
  let ok = true;
  for (const p of MODELO.blocos[tela].perguntas) {
    if (!p.obrig || (p.ident && CODIGO)) continue;
    const v = String(R[p.id] || '').trim();
    const bom = p.tipo === 'whats' ? v.replace(/\D/g, '').length >= 10 : v.length >= 2;
    if (!bom) {
      ok = false;
      const el = document.querySelector(`[data-id="${p.id}"]`);
      if (el && !el.querySelector('.msg-erro')) {
        el.classList.add('erro');
        el.insertAdjacentHTML('beforeend', `<div class="msg-erro">${p.tipo === 'whats' ? 'Coloca o WhatsApp com DDD' : 'Esse campo é necessário'}</div>`);
      }
    }
  }
  if (!ok) document.querySelector('.q.erro')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return ok;
}

// Só guarda o que a pessoa respondeu (tira vazios e respostas de perguntas que sumiram).
function respostasLimpas() {
  const out = {};
  for (const b of MODELO.blocos) for (const p of b.perguntas) {
    if (p.tipo === 'aviso' || p.tipo === 'mapa') continue;
    if (p.se && !p.se(R)) continue;
    const v = R[p.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[p.id] = v;
    if (p.outro && R[p.id + '_outro'] && (v === 'Outro' || (Array.isArray(v) && v.includes('Outro')))) out[p.id + '_outro'] = R[p.id + '_outro'];
  }
  return out;
}
function mapaLimpo() {
  const out = {};
  for (const [k, m] of Object.entries(marcas)) if (temMarca(m)) out[k] = { dor: m.dor || 0, inchaco: m.inchaco || 0, quando: (m.dor || 0) > 0 ? (m.quando || []) : [] };
  return out;
}

async function enviar() {
  if (enviando) return;
  enviando = true;
  const b = $('b-seguir'); b.disabled = true; b.textContent = 'Enviando…';
  $('erro-envio').textContent = '';
  try {
    const { data, error } = await supabase.rpc('ficha_enviar', {
      p_slug: SLUG, p_codigo: CODIGO || null,
      p_nome: (R.nome || CLIENTE || '').trim(), p_contato: (R.whatsapp || '').trim(),
      p_respostas: respostasLimpas(), p_mapa: mapaLimpo(),
    });
    if (error) throw new Error(error.message);
    avisarDonoPush(data?.owner_id, '📋 Ficha recebida!', `${(R.nome || CLIENTE || 'Um cliente').trim()} respondeu a ficha de atendimento`, `visao-${new Date().toISOString().slice(0, 10)}-ficha-${Date.now()}`);
    tela++; desenharTela();
  } catch (e) {
    $('erro-envio').textContent = 'Não consegui enviar agora. Confere a internet e tenta de novo — suas respostas estão guardadas.';
    b.disabled = false; b.textContent = 'Enviar ficha';
  } finally { enviando = false; }
}

$('b-seguir').onclick = () => { if (validar()) seguir(); };

// Demonstração: arrastar pro lado passa a tela (esquerda = próxima, direita = volta).
function ligarArraste() {
  let x0 = null, y0 = null;
  document.addEventListener('touchstart', e => {
    if ($('folha').classList.contains('on') || e.target.closest('svg')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) seguir();
    else if (tela > -1) { tela--; desenharTela(); }
  }, { passive: true });
}
function seguir() {
  if (DEMO) { if (tela < MODELO.blocos.length) { tela++; desenharTela(); } return; }
  if (tela === MODELO.blocos.length - 1) return enviar();
  tela++; salvar(); desenharTela();
}
$('b-voltar').onclick = () => { if (tela > -1) { tela--; desenharTela(); } };

// === BLOCO 6: MAPA DO CORPO ===
let vista = 'frente', aberta = null;
const NS = 'http://www.w3.org/2000/svg';
function corDa(c) {
  const m = marcas[c]; if (!m) return null;
  const t = (m.dor || 0) >= (m.inchaco || 0) ? 'dor' : 'inchaco';
  if (!(m[t] > 0)) return null;
  return `color-mix(in srgb, var(--${t}) ${[0, 40, 65, 92][m[t]]}%, transparent)`;
}
const corTipo = k => `var(--${k})`;
function montarMapa() {
  const w = document.createElement('div');
  w.innerHTML = `
    <div class="legenda"><span><i style="background:var(--dor)"></i>Dor ou tensão</span><span><i style="background:var(--inchaco)"></i>Inchaço</span></div>
    <div class="abas"><button type="button" id="ab-frente">Frente</button><button type="button" id="ab-costas">Costas</button></div>
    <div class="palco"><span class="lado esq" id="lado-esq"></span><span class="lado dir" id="lado-dir"></span>
      <svg class="corpo" id="svg" viewBox="0 0 240 500" aria-label="Desenho do corpo"></svg></div>
    <p class="dica" id="dica"></p>
    <div class="marcas" id="lista"></div>`;
  w.querySelector('#ab-frente').onclick = () => trocar('frente');
  w.querySelector('#ab-costas').onclick = () => trocar('costas');
  setTimeout(() => { trocar(vista); listar(); });
  return w;
}
function desenharCorpo() {
  const svg = $('svg'); if (!svg) return;
  svg.innerHTML = '';
  const ladoEsq = vista === 'frente' ? '_d' : '_e', ladoDir = vista === 'frente' ? '_e' : '_d';
  for (const r of (vista === 'frente' ? FRENTE : COSTAS)) {
    for (const [suf, espelho] of (r.par ? [[ladoEsq, false], [ladoDir, true]] : [['', false]])) {
      const c = r.id + suf;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', r.d);
      p.setAttribute('class', 'r' + (aberta === c ? ' sel' : ''));
      if (espelho) p.setAttribute('transform', 'translate(240,0) scale(-1,1)');
      const cor = corDa(c); if (cor) p.style.fill = cor;
      p.addEventListener('click', () => abrirFolha(c));
      svg.appendChild(p);
    }
  }
  $('lado-esq').textContent = vista === 'frente' ? 'Direito' : 'Esquerdo';
  $('lado-dir').textContent = vista === 'frente' ? 'Esquerdo' : 'Direito';
  $('dica').textContent = vista === 'frente' ? 'Você está vendo a pessoa de frente' : 'Você está vendo a pessoa de costas';
}
function trocar(v) {
  vista = v;
  $('ab-frente')?.classList.toggle('on', v === 'frente');
  $('ab-costas')?.classList.toggle('on', v === 'costas');
  desenharCorpo();
}
function listar() {
  const box = $('lista'); if (!box) return;
  const chaves = Object.keys(marcas).filter(c => temMarca(marcas[c]));
  if (!chaves.length) { box.innerHTML = '<p class="vazio">Nada marcado ainda.</p>'; return; }
  box.innerHTML = '';
  for (const c of chaves) {
    const m = marcas[c];
    const tags = TIPOS_MARCA.filter(t => m[t.k] > 0).map(t =>
      `<span class="tag" style="background:color-mix(in srgb, ${corTipo(t.k)} 16%, transparent);color:${corTipo(t.k)}">${t.nome.split(' ')[0]} ${NIVEIS[m[t.k]].toLowerCase()}</span>`).join('');
    const quando = (m.quando || []).length && m.dor > 0 ? `<br><small>${esc(m.quando.join(' · ').toLowerCase())}</small>` : '';
    const div = document.createElement('div'); div.className = 'item';
    div.innerHTML = `<span class="nm">${esc(nomeDa(c))}${ladoDa(c) ? ` <small>(${ladoDa(c)})</small>` : ''}${quando}</span><span style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">${tags}</span>`;
    div.onclick = () => {
      if (!(vista === 'frente' ? FRENTE : COSTAS).some(r => r.id === baseDa(c))) trocar(vista === 'frente' ? 'costas' : 'frente');
      abrirFolha(c);
    };
    box.appendChild(div);
  }
}
function abrirFolha(c) {
  aberta = c;
  const m = marcas[c] || { dor: 0, inchaco: 0, quando: [] };
  if (!m.quando) m.quando = [];
  $('f-nome').textContent = nomeDa(c);
  $('f-lado').textContent = ladoDa(c) ? 'Lado ' + ladoDa(c) : 'Meio do corpo';
  const box = $('f-linhas'); box.innerHTML = '';
  for (const t of TIPOS_MARCA) {
    const linha = document.createElement('div'); linha.className = 'linha';
    linha.innerHTML = `<div class="rot" style="color:${corTipo(t.k)}">${t.nome}</div><div class="seg"></div>`;
    const seg = linha.querySelector('.seg');
    NIVEIS.forEach((n, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = n;
      b._pintar = () => {
        const on = (m[t.k] || 0) === i && i > 0;
        b.style.background = on ? `color-mix(in srgb, ${corTipo(t.k)} 18%, transparent)` : '';
        b.style.color = on ? corTipo(t.k) : ''; b.style.borderColor = on ? corTipo(t.k) : '';
      };
      b.onclick = () => { m[t.k] = i; marcas[c] = m; seg.querySelectorAll('button').forEach(x => x._pintar()); mostrarQuando(m); desenharCorpo(); listar(); salvar(); };
      b._pintar(); seg.appendChild(b);
    });
    box.appendChild(linha);
  }
  const chips = $('f-chips'); chips.innerHTML = '';
  for (const mo of MOMENTOS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = mo;
    b.classList.toggle('on', m.quando.includes(mo));
    b.onclick = () => {
      m.quando = m.quando.includes(mo) ? m.quando.filter(x => x !== mo) : m.quando.concat(mo);
      b.classList.toggle('on'); marcas[c] = m; listar(); salvar();
    };
    chips.appendChild(b);
  }
  mostrarQuando(m);
  $('fundo').classList.add('on'); $('folha').classList.add('on');
  desenharCorpo();
}
function mostrarQuando(m) { $('f-quando').hidden = !((m.dor || 0) > 0); }
function fecharFolha() {
  const c = aberta; aberta = null;
  if (c && marcas[c] && !temMarca(marcas[c])) delete marcas[c];
  $('fundo').classList.remove('on'); $('folha').classList.remove('on');
  desenharCorpo(); listar(); salvar();
}
$('fundo').onclick = fecharFolha;
$('f-pronto').onclick = fecharFolha;
$('f-limpar').onclick = () => { delete marcas[aberta]; fecharFolha(); };

iniciar();
