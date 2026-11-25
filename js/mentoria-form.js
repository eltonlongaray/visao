// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA dos formulários da 🎓 Mentoria (mentoria-form.html) — abre SEM login:
//   /pesquisa/<slug>  → formulário das colegas (gera curiosidade; contato opcional no fim)
//   /selecao/<slug>   → formulário de seleção da aula exclusiva (nome + WhatsApp obrigatórios)
// Perguntas, textos e cores vêm de mentoria-modelos/<slug>.js. Uma pergunta por tela,
// rascunho salvo no aparelho. Envia pela RPC mentoria_enviar (sql/mentoria.sql) e cai
// no app em Ferramentas → 💸 Fontes de renda extra → 🎓 Mentoria.
// ?teste=1 → modo teste: faixa no topo, não grava nada, rascunho separado.
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// === BLOCO 1: QUAL FORMULÁRIO / DE QUEM ===
const PARTES = location.pathname.split('/').filter(Boolean);
const FORM = PARTES[0] === 'pesquisa' ? 'pesquisa' : 'selecao';
const SLUG = String(PARTES[1] || '').replace(/[^a-z0-9-]/gi, '');
const TESTE = new URLSearchParams(location.search).has('teste');
const app = document.getElementById('app');
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
let M, F, P, CHAVE, st = { i: -1, r: {} };

(function carregar() {
  if (!SLUG) { app.innerHTML = '<p class="lead">Link incompleto.</p>'; return; }
  const s = document.createElement('script');
  s.src = `/mentoria-modelos/${SLUG}.js?v=1`;
  s.onload = iniciar;
  s.onerror = () => { app.innerHTML = '<p class="lead">Formulário não encontrado.</p>'; };
  document.head.appendChild(s);
})();

// === BLOCO 2: ESTADO E IDENTIDADE ===
function iniciar() {
  M = window.MENTORIA_MODELO; F = M?.[FORM];
  if (!F) { app.innerHTML = '<p class="lead">Formulário não encontrado.</p>'; return; }
  P = F.perguntas;
  const c = M.cores || {}, raiz = document.documentElement.style;
  const mapa = { fundo: '--bg', tinta: '--ink', texto: '--soft', apoio: '--muted', rosa: '--rosa', rosaTxt: '--rosa-txt', clara: '--blush', cartao: '--card' };
  Object.entries(mapa).forEach(([k, v]) => c[k] && raiz.setProperty(v, c[k]));
  document.title = `${F.titulo} · ${M.marca?.nome || ''}`;
  CHAVE = `mentoria-${FORM}-${SLUG}${TESTE ? '-teste' : ''}`;
  try { const s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (s && s.r) st = s; } catch (e) {}
  if (TESTE) {
    const t = document.createElement('div'); t.className = 'faixa-teste';
    t.textContent = 'Modo teste · nada é salvo'; document.body.prepend(t);
  }
  telaIntro();
}
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch (e) {} };
const logo = () => M.marca?.logo ? `<img class="lr" src="${esc(M.marca.logo)}" alt="${esc(M.marca.nome || '')}">` : '';

function topo(prog) {
  // a tela de contato (no fim da pesquisa) não conta como pergunta
  const n = P.filter(p => p.tipo !== 'contato').length, ehContato = P[st.i]?.tipo === 'contato';
  const pct = Math.round((Math.max(st.i, 0) / P.length) * 100);
  return `<div class="top">${logo()}
    ${prog ? `<div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><p class="n">${ehContato ? 'Último passo' : `Pergunta ${st.i + 1} de ${n}`}</p></div>` : ''}</div>`;
}

// === BLOCO 3: TELAS ===
function telaIntro() {
  const retomar = Object.keys(st.r).length > 0, I = F.intro;
  app.innerHTML = topo(false) + `<section class="tela">
    <p class="eyebrow">${esc(I.eyebrow)}</p><div class="rule"></div>
    <h1 class="serif">${I.h1}</h1>
    ${I.lead.map(t => `<p class="lead">${esc(t.replace('{n}', P.filter(p => p.tipo !== 'contato').length))}</p>`).join('')}
    <div class="nav"><span></span><button class="btn" id="go">${retomar ? 'Continuar de onde parei' : 'Começar'} →</button></div>
    <p class="assin">${esc(M.marca?.assinatura || '')}</p></section>`;
  $('go').onclick = () => { st.i = retomar ? Math.min(Math.max(st.i, 0), P.length - 1) : 0; salvar(); telaPergunta(); };
}

// Opções que vêm de outra resposta (ex.: "qual mais te incomoda" = só o que ela marcou)
const opsDe = p => p.opsDe ? [].concat(st.r[p.opsDe] || []).filter(Boolean) : p.ops;
function pula(p) {
  if (!p.opsDe) return false;
  const ops = opsDe(p);
  if (ops.length > 1) { if (!ops.includes(st.r[p.id])) delete st.r[p.id]; return false; }
  st.r[p.id] = ops[0] || null; return true;
}

function campoDe(p) {
  const v = st.r[p.id] ?? '';
  if (p.tipo === 'texto' || p.tipo === 'tel') {
    const tel = p.tipo === 'tel';
    return `<input id="f" type="${tel ? 'tel' : 'text'}" inputmode="${tel ? 'tel' : 'text'}" placeholder="${esc(p.ph || '')}" value="${esc(v)}" autocomplete="${p.id === 'nome' ? 'name' : tel ? 'tel-national' : 'off'}">`;
  }
  if (p.tipo === 'longo') return `<textarea id="f" placeholder="${esc(p.ph || 'Escreva aqui…')}">${esc(v)}</textarea>`;
  if (p.tipo === 'contato') {
    return `<label class="rot" for="cn">Seu nome</label><input id="cn" type="text" autocomplete="name" placeholder="Seu nome" value="${esc(st.r._nome || '')}">
      <label class="rot" for="cz">Seu WhatsApp</label><input id="cz" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(51) 9 9999-9999" value="${esc(st.r._zap || '')}">`;
  }
  const varias = p.tipo === 'varias';
  p = { ...p, ops: opsDe(p), outro: p.opsDe ? false : p.outro };
  const marcadas = varias ? (Array.isArray(v) ? v : []) : [v];
  const extra = marcadas.find(x => x && !p.ops.includes(x));
  return `<div class="ops" role="${varias ? 'group' : 'radiogroup'}" aria-label="${esc(p.q)}">` +
    p.ops.map(o => `<button type="button" class="op${varias ? ' quad' : ''}" role="${varias ? 'checkbox' : 'radio'}" aria-checked="${marcadas.includes(o)}" data-v="${esc(o)}"><span class="dot"></span>${esc(o)}</button>`).join('') +
    (p.outro ? `<button type="button" class="op${varias ? ' quad' : ''}" role="${varias ? 'checkbox' : 'radio'}" aria-checked="${!!extra}" data-v="__outro"><span class="dot"></span>Outro</button>` : '') +
    `</div>` + (p.outro ? `<input id="outro" class="outro" type="text" placeholder="Conta qual…" value="${esc(extra || '')}" ${extra ? '' : 'hidden'}>` : '');
}

function telaPergunta() {
  const p = P[st.i], ultima = P.slice(st.i + 1).every(x => x.opsDe && opsDe(x).length <= 1);
  app.innerHTML = topo(true) + `<section class="tela">
    ${p.pre ? `<p class="pre">${esc(p.pre)}</p>` : ''}
    <h2 class="q serif">${esc(p.q)}${p.opcional ? '<span class="opc">opcional</span>' : ''}</h2>
    ${p.ajuda ? `<p class="ajuda">${esc(p.ajuda)}</p>` : ''}
    ${campoDe(p)}
    <p class="erro" id="erro" role="alert"></p>
    <div class="nav"><button class="voltar" id="volta" type="button">← Voltar</button>
      <button class="btn" id="seg" type="button">${ultima ? 'Enviar respostas' : 'Continuar →'}</button></div>
    ${p.tipo === 'longo' ? '<p class="dica">Dica: escreve com as suas palavras, do jeito que você falaria.</p>' : ''}
  </section>`;
  ligar(p);
}

function ligar(p) {
  const f = $('f');
  if (f) {
    setTimeout(() => f.focus(), 60);
    f.addEventListener('input', () => {
      st.r[p.id] = p.tipo === 'tel' ? mascara(f.value) : f.value;
      if (p.tipo === 'tel') f.value = st.r[p.id];
      salvar();
    });
    f.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (p.tipo !== 'longo' || e.ctrlKey || e.metaKey)) { e.preventDefault(); avancar(); }
    });
  }
  if (p.tipo === 'contato') {
    $('cn').oninput = () => { st.r._nome = $('cn').value; salvar(); };
    $('cz').oninput = () => { st.r._zap = mascara($('cz').value); $('cz').value = st.r._zap; salvar(); };
  }
  const out = $('outro'), varias = p.tipo === 'varias';
  const lerVarias = () => {
    const sel = [...app.querySelectorAll('.op[aria-checked="true"]')].map(b => b.dataset.v).filter(x => x !== '__outro');
    if (out && !out.hidden && out.value.trim()) sel.push(out.value.trim());
    st.r[p.id] = sel; salvar();
  };
  app.querySelectorAll('.op').forEach(b => b.onclick = () => {
    if (varias) {
      b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
      if (b.dataset.v === '__outro') { out.hidden = b.getAttribute('aria-checked') !== 'true'; if (!out.hidden) out.focus(); }
      lerVarias(); return;
    }
    app.querySelectorAll('.op').forEach(x => x.setAttribute('aria-checked', 'false'));
    b.setAttribute('aria-checked', 'true');
    if (b.dataset.v === '__outro') { out.hidden = false; out.focus(); st.r[p.id] = out.value.trim(); salvar(); return; }
    if (out) out.hidden = true;
    st.r[p.id] = b.dataset.v; salvar(); setTimeout(avancar, 220);
  });
  if (out) {
    out.addEventListener('input', () => { if (varias) lerVarias(); else { st.r[p.id] = out.value; salvar(); } });
    out.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); avancar(); } });
  }
  $('seg').onclick = avancar;
  $('volta').onclick = () => {
    let i = st.i - 1;
    while (i >= 0 && pula(P[i])) i--;
    if (i < 0) { st.i = -1; salvar(); telaIntro(); } else { st.i = i; salvar(); telaPergunta(); }
  };
}

// Preenchimento automático costuma mandar +55: tira o código do país.
function mascara(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

function valido(p) {
  if (p.tipo === 'contato') {
    const z = String(st.r._zap || '').replace(/\D/g, '');
    if (z && z.length < 10) return 'Confere o número com DDD.';
    if (z && !String(st.r._nome || '').trim()) return 'Me conta seu nome também 💛';
    return '';
  }
  const v = st.r[p.id];
  const vazio = Array.isArray(v) ? !v.length : !String(v ?? '').trim();
  if (p.opcional) return '';
  if (vazio) return p.tipo === 'escolha' || p.tipo === 'varias' ? 'Escolha uma opção pra continuar.' : 'Responde essa pra gente continuar 💛';
  if (p.tipo === 'tel' && String(v).replace(/\D/g, '').length < 10) return 'Confere o número com DDD.';
  if (p.tipo === 'longo' && String(v).trim().length < 3) return 'Escreve um pouquinho mais 💛';
  return '';
}

function avancar() {
  const p = P[st.i], e = valido(p);
  if (e) { $('erro').textContent = e; return; }
  let i = st.i + 1;
  while (i < P.length && pula(P[i])) i++;
  if (i < P.length) { st.i = i; salvar(); telaPergunta(); window.scrollTo({ top: 0 }); }
  else enviar();
}

// === BLOCO 4: ENVIO ===
async function enviar() {
  const b = $('seg'); b.disabled = true; b.textContent = 'Enviando…';
  const resp = {};
  P.forEach(p => {
    if (p.tipo === 'contato') return;
    const v = st.r[p.id];
    resp[p.id] = Array.isArray(v) ? v : (String(v ?? '').trim() || null);
  });
  const nome = String(st.r._nome ?? st.r.nome ?? '').trim();
  const zap = String(st.r._zap ?? st.r.whatsapp ?? '').trim();
  let insta = String(st.r.instagram || '').trim();
  if (insta && !insta.startsWith('@')) insta = '@' + insta;
  if (!TESTE) {
    const { error } = await supabase.rpc('mentoria_enviar', {
      p_slug: SLUG, p_form: FORM, p_nome: nome, p_contato: zap, p_instagram: insta, p_respostas: resp,
    });
    if (error) {
      b.disabled = false; b.textContent = 'Tentar enviar de novo';
      $('erro').textContent = 'Não consegui enviar agora. Suas respostas estão salvas aqui — tenta de novo em instantes.';
      console.error(error); return;
    }
  }
  try { localStorage.removeItem(CHAVE); } catch (e) {}
  telaFinal(nome, !!zap);
}

// === BLOCO 5: TELA FINAL ===
function telaFinal(nome, temContato) {
  const fim = F.final, primeiro = esc(nome.split(' ')[0]);
  const textos = fim.texto || [temContato ? fim.comContato : fim.semContato];
  document.body.classList.add('fim');
  app.innerHTML = `<section class="final">
    ${M.marca?.logo ? `<img class="final-lr" src="${esc(M.marca.logo)}" alt="">` : ''}
    <div class="final-in">
      <p class="eyebrow r1">${esc(fim.eyebrow)}</p><div class="rule r1"></div>
      <h1 class="serif r2">${fim.h1.replace('{, nome}', primeiro ? ', ' + primeiro : '')}</h1>
      ${textos.map(t => `<p class="lead r3">${t}</p>`).join('')}
      ${fim.botaoInstagram && M.marca?.instagram ? `<a class="btn final-btn r4" href="https://instagram.com/${esc(M.marca.instagram)}" target="_blank" rel="noopener">Ir pro meu Instagram →</a>` : ''}
      <p class="final-assin r5">Com carinho,<br><span>${esc(M.marca?.assinatura || '')}</span></p>
    </div></section>`;
  window.scrollTo({ top: 0 });
}
