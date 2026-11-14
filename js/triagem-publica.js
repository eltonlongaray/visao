// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA da TRIAGEM (triagem.html) — abre SEM login em /triagem/<slug>.
// Fluxo: perguntas → vitrine de blends → nome + WhatsApp → resultado
//        (indicação · vou agendar · também me interessam) → agenda já preenchida
//        → depois de confirmar o horário, a cliente manda o resumo pro WhatsApp da profissional.
// Serviços e preços vêm da agenda <slug> do Falcon; perguntas/regras do arquivo
// triagem-modelos/<slug>.js. Salva em `fichas` (modelo 'triagem') via RPC — SQL: sql/triagem.sql
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// === BLOCO 1: CARREGA A AGENDA (serviços/preços) E O MODELO DA PROFISSIONAL ===
const SLUG = location.pathname.replace(/^\/triagem\/?/, '').replace(/\/+$/, '').split('/')[0].replace(/[^a-z0-9-]/gi, '');
const app = document.getElementById('app');
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
let M, SERV = [], CHAVE, st;

(async function carregar() {
  if (!SLUG) { app.innerHTML = '<p class="lead">Link incompleto.</p>'; return; }
  try {
    const { data } = await supabase.from('agenda_config').select('servicos, whatsapp, titulo, ativo').eq('slug', SLUG).maybeSingle();
    SERV = Array.isArray(data?.servicos) ? data.servicos : [];
  } catch (e) { SERV = []; }
  const s = document.createElement('script');
  s.src = `/triagem-modelos/${SLUG}.js?v=5`;
  s.onload = iniciar;
  s.onerror = () => { app.innerHTML = '<p class="lead">Triagem não encontrada.</p>'; };
  document.head.appendChild(s);
})();

// === BLOCO 2: ESTADO (fica salvo no celular: se sair, continua de onde parou) ===
function iniciar() {
  M = window.TRIAGEM;
  const c = M.cores || {};
  const raiz = document.documentElement.style;
  if (c.principal) raiz.setProperty('--cor', c.principal);
  if (c.clara) raiz.setProperty('--cor-clara', c.clara);
  if (c.fundo) { raiz.setProperty('--fundo', c.fundo); document.body.style.background = c.fundo; }
  if (c.tinta) raiz.setProperty('--tinta', c.tinta);
  document.title = M.profissional.negocio + ' · ' + (M.titulo || 'Triagem');
  $('marca').innerHTML = `${esc(M.profissional.negocio)}<small>${esc(M.profissional.nome)}</small>`;
  // Tag do Google da profissional (Google Ads), só se o modelo tiver uma
  if (M.googleTag || M.googleAds) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    const tag = src => { const g = document.createElement('script'); g.async = true; g.src = src; document.head.appendChild(g); };
    if (M.googleTag) tag('https://www.googletagmanager.com/gtm.js?id=' + M.googleTag);
    if (M.googleAds) { tag('https://www.googletagmanager.com/gtag/js?id=' + M.googleAds); window.gtag('config', M.googleAds); }
  }
  CHAVE = 'falcon_triagem_estado_' + SLUG;
  st = { i: -1, r: {} };
  try { const x = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (x && x.r) st = x; } catch (e) {}
  // De onde veio (link do anúncio: ?utm_source=google&utm_campaign=blackfriday) — vai pro painel de Campanhas
  const q = new URLSearchParams(location.search);
  if (q.get('utm_source') || q.get('utm_campaign')) st.origem = { source: q.get('utm_source') || '', campaign: q.get('utm_campaign') || '', medium: q.get('utm_medium') || '' };
  st.i >= 0 && passos().length ? tela() : intro();
}
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch (e) {} };

// Passos que valem pra essa pessoa (perguntas condicionais somem se não se aplicam)
function passos() {
  const lista = M.perguntas.filter(p => !p.mostrarSe || condicao(p.mostrarSe));
  if (M.vitrine) lista.push({ id: '__vitrine', tipo: 'vitrine' });
  lista.push({ id: '__contato', tipo: 'contato' });
  return lista;
}
function itensVitrine() {
  const marcados = Object.values(st.r).flat();
  const indicado = it => (it.para || []).some(x => marcados.includes(x));
  return M.vitrine.itens.map(it => ({ ...it, indicado: indicado(it) })).sort((a, b) => b.indicado - a.indicado);
}
function condicao(c) {
  const v = st.r[c.campo];
  const arr = Array.isArray(v) ? v : (v ? [v] : []);
  return c.algumDe.some(x => arr.includes(x));
}
function progresso() {
  const n = passos().length;
  $('barra').style.width = (st.i < 0 ? 0 : st.i >= n ? 100 : Math.round(st.i / n * 100)) + '%';
}

// === BLOCO 3: TELAS (intro, perguntas, vitrine) ===
function intro() {
  const retomar = Object.keys(st.r).length > 0;
  const rod = M.intro.rodape ?? '';
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(M.intro.eyebrow || '')}</p>
    <h1>${M.intro.titulo}</h1>
    ${[].concat(M.intro.texto).map(t => `<p class="lead">${esc(t)}</p>`).join('')}
    <div class="nav"><span></span><button class="btn" id="go">${retomar ? 'Continuar de onde parei' : 'Começar'} →</button></div>
    ${rod ? `<p class="rodape">${esc(rod)}</p>` : ''}</section>`;
  $('go').onclick = () => { st.i = retomar ? Math.min(Math.max(st.i, 0), passos().length - 1) : 0; salvar(); tela(); };
  progresso();
}

function tela() {
  const L = passos();
  if (st.i >= L.length) return resultado();
  const p = L[st.i];
  if (p.tipo === 'vitrine') return vitrine();
  if (p.tipo === 'contato') return contato();
  const v = st.r[p.id];
  const multi = p.tipo === 'multi';
  const marcado = o => multi ? (v || []).includes(o.v) : v === o.v;
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(p.grupo || '')}</p>
    <h2 class="q">${esc(p.q)}</h2>
    ${p.ajuda ? `<p class="ajuda">${esc(p.ajuda)}</p>` : ''}
    <div class="ops" role="${multi ? 'group' : 'radiogroup'}">
      ${p.ops.map(o => `<button type="button" class="op ${multi ? 'multi' : ''}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${marcado(o)}" data-v="${esc(o.v)}">
        ${o.icone ? `<span class="ic">${o.icone}</span>` : ''}<span>${esc(o.v)}</span><span class="marca-op"></span></button>`).join('')}
    </div>
    <p class="erro" id="erro"></p>
    <div id="avisoBox"></div>
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="seg">Continuar →</button></div></section>`;
  progresso();
  const avisar = () => {
    const at = (p.avisos || []).find(a => (Array.isArray(st.r[p.id]) ? st.r[p.id] : [st.r[p.id]]).includes(a.se));
    $('avisoBox').innerHTML = at ? `<div class="aviso">${esc(at.texto)}</div>` : '';
  };
  avisar();
  app.querySelectorAll('.op').forEach(b => b.onclick = () => {
    const val = b.dataset.v;
    if (multi) {
      let a = st.r[p.id] || [];
      const exclusivo = (p.exclusivas || []).includes(val);
      if (a.includes(val)) a = a.filter(x => x !== val);
      else a = exclusivo ? [val] : [...a.filter(x => !(p.exclusivas || []).includes(x)), val];
      st.r[p.id] = a; salvar();
      app.querySelectorAll('.op').forEach(x => x.setAttribute('aria-checked', a.includes(x.dataset.v)));
      avisar();
    } else {
      st.r[p.id] = val; salvar();
      app.querySelectorAll('.op').forEach(x => x.setAttribute('aria-checked', x.dataset.v === val));
      avisar();
      if (!(p.avisos || []).some(a => a.se === val)) setTimeout(avancar, 230);
    }
  });
  $('seg').onclick = avancar;
  $('volta').onclick = voltar;
}

function vitrine() {
  const V = M.vitrine, sel = st.r.__vitrine || [], itens = itensVitrine();
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(V.eyebrow || '')}</p>
    <h2 class="q">${esc(V.titulo)}</h2>
    <p class="ajuda">${esc(V.ajuda || '')}</p>
    <div class="vit">${itens.map(it => `<button type="button" class="prod" role="checkbox" aria-checked="${sel.includes(it.nome)}" data-v="${esc(it.nome)}">
      <div class="foto">${it.foto ? `<img src="${esc(it.foto)}" alt="">` : (it.icone || '🌿')}</div>
      ${it.indicado ? '<em class="selo">Indicado pra você</em>' : ''}<b>${esc(it.nome)}</b><span>${esc(it.serve)}</span></button>`).join('')}</div>
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="seg">${sel.length ? 'Continuar' : 'Pular'} →</button></div></section>`;
  progresso();
  app.querySelectorAll('.prod').forEach(b => b.onclick = () => {
    let a = st.r.__vitrine || [];
    a = a.includes(b.dataset.v) ? a.filter(x => x !== b.dataset.v) : [...a, b.dataset.v];
    st.r.__vitrine = a; salvar();
    b.setAttribute('aria-checked', a.includes(b.dataset.v));
    $('seg').textContent = (a.length ? 'Continuar' : 'Pular') + ' →';
  });
  $('seg').onclick = () => { st.i++; salvar(); tela(); };
  $('volta').onclick = voltar;
}

function avancar() {
  const p = passos()[st.i];
  const v = st.r[p.id];
  if (!p.opcional && (!v || (Array.isArray(v) && !v.length))) { $('erro').textContent = p.tipo === 'multi' ? 'Marca pelo menos uma opção.' : 'Escolhe uma opção pra continuar.'; return; }
  st.i++; salvar(); tela(); window.scrollTo({ top: 0 });
}
function voltar() { if (st.i <= 0) { st.i = -1; salvar(); intro(); } else { st.i--; salvar(); tela(); } }

// === BLOCO 4: NOME + WHATSAPP (é o que faz a cliente aparecer em "Só triagem") ===
function contato() {
  const c = st.contato || {};
  app.innerHTML = `<section class="tela">
    <h2 class="q">Quase lá! 💜</h2>
    <p class="ajuda">Pra ${esc(M.profissional.nome)} te reconhecer quando tu agendar:</p>
    <label class="campo">Teu nome<input id="c-nome" autocomplete="name" placeholder="Como tu gosta de ser chamada" value="${esc(c.nome || '')}"></label>
    <label class="campo">Teu WhatsApp<input id="c-zap" inputmode="tel" autocomplete="tel" placeholder="(51) 9 9999-9999" value="${esc(c.contato || '')}"></label>
    <p class="erro" id="erro"></p>
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="seg">Ver meu resultado →</button></div></section>`;
  progresso();
  $('c-zap').oninput = e => { e.target.value = mascara(e.target.value); };
  $('volta').onclick = voltar;
  $('seg').onclick = async () => {
    const nome = $('c-nome').value.trim(), zap = $('c-zap').value.trim();
    if (nome.length < 2) { $('erro').textContent = 'Escreve teu nome.'; return; }
    if (zap.replace(/\D/g, '').length < 10) { $('erro').textContent = 'Escreve teu WhatsApp com DDD.'; return; }
    const mudou = !st.contato || st.contato.contato !== zap || st.contato.nome !== nome;
    st.contato = { nome, contato: zap }; salvar();
    $('seg').disabled = true; $('seg').textContent = 'Só um instante…';
    if (mudou || !st.codigo) {
      try {
        const { data, error } = await supabase.rpc('triagem_enviar', { p_slug: SLUG, p_nome: nome, p_contato: zap, p_respostas: pacote() });
        if (!error && data?.codigo) st.codigo = data.codigo;
      } catch (e) {}
    }
    st.i++; salvar(); tela(); window.scrollTo({ top: 0 });
  };
}
function mascara(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

// === BLOCO 5: PREÇOS (Black até o prazo, depois o preço novo) ===
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
// nome igual ou o da agenda começando com o do modelo ("Deusa Grega – … (avaliação + 4 sessões)")
const servPorNome = nome => { const n = norm(nome); return n ? (SERV.find(s => norm(s.nome) === n) || SERV.find(s => norm(s.nome).startsWith(n)) || null) : null; };
const reais = n => 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(',00', '');
function _prazo() {
  const [d, m] = String(M.precos?.prazo || '').split('/').map(Number);
  return d && m ? new Date(new Date().getFullYear(), m - 1, d, 23, 59, 59) : null;
}
const blackAtiva = () => { const p = _prazo(); return !!p && Date.now() <= p.getTime(); };
function proxDia() {
  const p = _prazo(); const x = new Date(p.getFullYear(), p.getMonth(), p.getDate() + 1);
  return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0');
}
function precoTxt(s) {
  const depois = M.precos?.depois?.[s.nome];
  if (s.preco == null && depois == null) return `valor com a ${esc(M.profissional.nome)}`;
  if (s.preco != null && depois != null && blackAtiva())
    return `Black até ${esc(M.precos.prazo)}: <b>${reais(s.preco)}</b> · a partir de ${proxDia()}: ${reais(depois)}`;
  return `<b>${reais(s.preco ?? depois)}</b>`;
}

// === BLOCO 6: RESULTADO (indicação · vou agendar · também me interessam) ===
function resumoLinhas() {
  const L = M.perguntas.filter(p => !p.mostrarSe || condicao(p.mostrarSe));
  return L.map(p => [p.curto || p.q, [].concat(st.r[p.id] || []).join(', ')]).filter(x => x[1]);
}
// Tudo que vai pro banco (fica no cadastro da cliente no Falcon)
function pacote() {
  const ind = M.indicacao(st.r);
  const nomeDe = id => SERV.find(s => s.id === id)?.nome || id;
  return { respostas: Object.fromEntries(resumoLinhas()), bruto: st.r, blends_vitrine: st.r.__vitrine || [],
    indicacao: ind.servico, plano: (st.plano || []).map(nomeDe), interesses: st.interesses || [], origem: st.origem || null };
}
function sugestoes(ind, planoIds) {
  const nomes = [];
  const junto = norm(ind.junto || '');
  for (const s of SERV) { const base = norm(s.nome).split(' (')[0].split(' –')[0]; if (base && junto.includes(base)) nomes.push(s.nome); }
  for (const inc of (st.r.incomodo || [])) for (const n of (M.interessesPor?.[inc] || [])) nomes.push(n);
  const out = [];
  for (const n of nomes) { const s = servPorNome(n); if (s && !planoIds.includes(s.id) && !out.find(x => x.id === s.id)) out.push(s); }
  return out.slice(0, 5);
}
function resultado() {
  $('barra').style.width = '100%';
  const ind = M.indicacao(st.r);
  const servInd = servPorNome(ind.servico);
  if (!st.plano) st.plano = servInd ? [servInd.id] : [];
  const plano = st.plano.map(id => SERV.find(s => s.id === id)).filter(Boolean);
  const sug = sugestoes(ind, st.plano);
  const blend = M.blendPersonalizado ? M.blendPersonalizado(st.r) : null;
  const blendsVit = st.r.__vitrine || [];
  if (!st.interesses) st.interesses = [...blendsVit];
  // serviços sugeridos + blends (sem preço: o valor depende da combinação, a profissional define)
  const ops = [...sug.map(s => ({ v: s.nome, blend: false })),
    ...(!servInd && ind.servico ? [{ v: ind.servico, blend: true }] : []),
    ...blendsVit.map(b => ({ v: b, blend: true })),
    ...(blend ? [{ v: blend.nome, blend: true }] : [])].filter((o, i, a) => a.findIndex(x => x.v === o.v) === i);
  salvar();
  app.innerHTML = `<section class="tela">
    <h1>${esc(M.resultado?.titulo || 'Achei o cuidado certo pra você')} 💜</h1>
    <div class="card"><h3>Minha indicação</h3><p class="indic">${esc(ind.servico)}</p><p class="ajuda" style="margin:.4rem 0 0">${esc(ind.porque)}</p></div>
    ${ind.aviso ? `<div class="aviso">${esc(ind.aviso)}</div>` : ''}
    ${plano.length ? `<div class="card plano"><h3>Vou agendar</h3>
      ${plano.map(s => `<div class="item"><span class="nm">${esc(s.nome)} · ${s.duracaoMin || 60} min</span><span class="pr">${precoTxt(s)}</span></div>`).join('')}
    </div>` : ''}
    ${ops.length ? `<div class="card int"><h3>Serviços que também me interessam</h3>
      <div class="ops">${ops.map(o => `<button type="button" class="op multi" role="checkbox" aria-checked="${st.interesses.includes(o.v)}" data-v="${esc(o.v)}"><span class="marca-op"></span><span>${esc(o.v)}${o.blend ? ' 🌿' : ''}</span></button>`).join('')}</div>
    </div>` : ''}
    <div style="display:flex;flex-direction:column;gap:.6rem;margin-top:1.3rem">
      <button class="btn full" id="agendar">📅 Escolher meu horário</button>
      <button class="voltar" id="refazer" style="text-align:center">Refazer as respostas</button>
    </div>
    <p class="rodape">${esc(M.profissional.negocio)} · ${esc(M.profissional.endereco || '')}</p></section>`;
  app.querySelectorAll('.int .op').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    st.interesses = st.interesses.includes(v) ? st.interesses.filter(x => x !== v) : [...st.interesses, v];
    b.setAttribute('aria-checked', st.interesses.includes(v)); salvar();
  });
  $('refazer').onclick = () => { st = { i: -1, r: {}, contato: st.contato, origem: st.origem }; salvar(); intro(); };
  $('agendar').onclick = () => irParaAgenda(ind, plano);
}

// === BLOCO 7: PASSA PRA AGENDA (já preenchida) + CONVERSÃO DO GOOGLE ===
// A agenda lê `falcon_triagem_<slug>`: serviços, nome, WhatsApp e a mensagem que a
// cliente manda pra profissional depois de confirmar ({{QUANDO}} = dia e hora).
async function irParaAgenda(ind, plano) {
  const b = $('agendar'); b.disabled = true; b.textContent = 'Abrindo a agenda…';
  const linhas = resumoLinhas();
  const msg = [`Oi ${M.profissional.nome}! Fiz a triagem e agendei pelo teu link 💜`, '',
    `📅 Agendei: ${plano.length ? plano.map(s => s.nome).join(' + ') : '—'} · {{QUANDO}}`,
    `✨ Indicação: ${ind.servico}`,
    ...(st.interesses.length ? [`💡 Também me interessam: ${st.interesses.join(', ')}`] : []),
    '', ...linhas.map(([k, v]) => `• ${k}: ${v}`)].join('\n');
  const handoff = { nome: st.contato?.nome, contato: st.contato?.contato, servicos: plano.map(s => s.id), msg,
    whatsapp: M.profissional.whatsapp, codigo: st.codigo || null, ts: Date.now() };
  try {
    localStorage.setItem('falcon_triagem_' + SLUG, JSON.stringify(handoff));
    localStorage.setItem('falcon_cliente_' + SLUG, JSON.stringify({ nome: handoff.nome, contato: handoff.contato }));
  } catch (e) {}
  try { if (st.codigo) await supabase.rpc('triagem_atualizar', { p_slug: SLUG, p_codigo: st.codigo, p_respostas: pacote() }); } catch (e) {}
  try {
    if (window.dataLayer) {
      window.dataLayer.push({ event: 'triagem_enviada', profissional: SLUG, servico: ind.servico });
      if (M.conversao) window.gtag('event', 'conversion', { send_to: M.conversao, transport_type: 'beacon' });
    }
  } catch (e) {}
  setTimeout(() => { location.href = '/agenda-online/' + encodeURIComponent(SLUG) + '?triagem=1'; }, 350);
}
