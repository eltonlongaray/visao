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
let M, SERV = [], CHAVE, st, TESTE = false;

(async function carregar() {
  if (!SLUG) { app.innerHTML = '<p class="lead">Link incompleto.</p>'; return; }
  try {
    const { data } = await supabase.from('agenda_config').select('servicos, whatsapp, titulo, ativo').eq('slug', SLUG).maybeSingle();
    SERV = Array.isArray(data?.servicos) ? data.servicos : [];
  } catch (e) { SERV = []; }
  const s = document.createElement('script');
  const MOD = new URLSearchParams(location.search).get('modelo');
  const VAR = MOD === 'completa' ? '-completa' : MOD === 'nova' ? '-nova' : '';   // -completa = original guardada · -nova = versão em teste
  s.src = `/triagem-modelos/${SLUG}${VAR}.js?v=42`;
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
  if (c.cinza) raiz.setProperty('--cinza', c.cinza);     // texto de apoio (lead/ajuda)
  if (c.linha) raiz.setProperty('--linha', c.linha);
  if (c.marca) raiz.setProperty('--marca', c.marca);     // borda do quadradinho de marcar
  document.title = M.profissional.negocio + ' · ' + (M.titulo || 'Triagem');
  $('marca').innerHTML = `${esc(M.profissional.negocio)}<small>${esc(M.profissional.nome)}</small>`;
  // ?teste=1: modo teste — não grava a triagem, não carrega a tag do Google (não conta conversão)
  // e não abre a agenda de verdade (não marca horário).
  TESTE = new URLSearchParams(location.search).has('teste');
  if (TESTE) document.body.insertAdjacentHTML('afterbegin', '<div class="faixa-teste">🧪 Modo teste · nada é salvo, não marca horário</div>');
  // Tag do Google da profissional (Google Ads), só se o modelo tiver uma
  if (!TESTE && (M.googleTag || M.googleAds)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    const tag = src => { const g = document.createElement('script'); g.async = true; g.src = src; document.head.appendChild(g); };
    if (M.googleTag) tag('https://www.googletagmanager.com/gtm.js?id=' + M.googleTag);
    if (M.googleAds) { tag('https://www.googletagmanager.com/gtag/js?id=' + M.googleAds); window.gtag('config', M.googleAds); }
  }
  CHAVE = 'falcon_triagem_estado_' + SLUG + (TESTE ? '_teste' : '');
  st = { i: -1, r: {} };
  try { const x = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (x && x.r) st = x; } catch (e) {}
  // De onde veio (link do anúncio: ?utm_source=google&utm_campaign=blackfriday) — vai pro painel de Campanhas
  const q = new URLSearchParams(location.search);
  // ?cupom=CÓDIGO (link de cupom que a profissional mandou): guarda e entrega pra agenda no fim
  if (q.get('cupom')) st.cupom = q.get('cupom').trim().toUpperCase().slice(0, 30);
  if (q.get('utm_source') || q.get('utm_campaign')) st.origem = { source: q.get('utm_source') || '', campaign: q.get('utm_campaign') || '', medium: q.get('utm_medium') || '' };
  st.i >= 0 && passos().length ? tela() : intro();
}
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch (e) {} };
// Caminho da cliente (20/11, Élton): cada passo com hora, vai junto na triagem salva (ficha da profissional)
// e continua na agenda (agenda-publica.js). Antes do contato fica só no aparelho e sobe junto no envio.
function passo(txt, enviar = true) {
  st.caminho = st.caminho || [];
  st.caminho.push({ p: txt, em: new Date().toISOString() });
  if (st.caminho.length > 60) st.caminho = st.caminho.slice(-60);
  salvar();
  // .then(): o rpc do supabase-js v2 só dispara quando alguém "espera" por ele
  if (enviar && st.codigo && !TESTE) { try { supabase.rpc('triagem_atualizar', { p_slug: SLUG, p_codigo: st.codigo, p_respostas: pacote() }).then(() => {}, () => {}); } catch (e) {} }
}

// (26/11) FUNIL: quantas pessoas chegam em cada tela (sem nome nem WhatsApp). 1x por tela por visita.
// sql/triagem-funil.sql · resumo em 📣 Campanhas. Em modo teste não conta.
function funil(ordem, nome) {
  if (TESTE) return;
  if (!st.sessao) { st.sessao = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); salvar(); }
  st.funil = st.funil || [];
  if (st.funil.includes(nome)) return;
  st.funil.push(nome); salvar();
  try { supabase.rpc('triagem_passo', { p_slug: SLUG, p_sessao: st.sessao, p_ordem: ordem, p_passo: nome, p_origem: st.origem?.source || null }).then(() => {}, () => {}); } catch (e) {}
}

// Passos que valem pra essa pessoa (perguntas condicionais somem se não se aplicam)
function passos() {
  // (28/11) perguntasRapidas: triagem enxuta (só essas ids); a completa fica no modelo -completa
  const so = Array.isArray(M.perguntasRapidas) ? M.perguntasRapidas : null;
  const lista = M.perguntas.filter(p => (!so || so.includes(p.id)) && (!p.mostrarSe || condicao(p.mostrarSe)));
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
  // lista de condições: vale se QUALQUER uma valer
  if (Array.isArray(c)) return c.some(condicao);
  const v = st.r[c.campo];
  const arr = Array.isArray(v) ? v : (v ? [v] : []);
  // primeiroDe: só quando o PRIMEIRO marcado (o que mais incomoda) é um desses
  if (c.primeiroDe) return c.primeiroDe.includes(arr[0]);
  // nenhumDe: some quando a pessoa marcou algum desses
  if (c.nenhumDe && c.nenhumDe.some(x => arr.includes(x))) return false;
  return !c.algumDe || c.algumDe.some(x => arr.includes(x));
}
// "combina": opções ligadas ao que a pessoa já marcou sobem pro topo com um selo
function opsDaTela(p) {
  const marcados = Object.values(st.r).flat();
  // ocultarSe: a opção some se a pessoa já marcou isso antes (não pergunta duas vezes)
  const ops = p.ops.filter(o => !(o.ocultarSe || []).some(x => marcados.includes(x)));
  if (!p.combina) return ops.map(o => ({ ...o, combina: false }));
  const liga = o => (p.combina[o.v] || []).some(x => marcados.includes(x));
  return ops.map(o => ({ ...o, combina: liga(o) })).sort((a, b) => b.combina - a.combina);
}
function progresso() {
  const n = passos().length;
  $('barra').style.width = (st.i < 0 ? 0 : st.i >= n ? 100 : Math.round(st.i / n * 100)) + '%';
}

// === BLOCO 3: TELAS (intro, perguntas, vitrine) ===
// Depoimentos (M.depoimentos): o que combina com as respostas/indicação; senão o de destaque.
const _semAc = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function depoPara(texto, pular = []) {
  const ds = (M.depoimentos || []).filter(d => !pular.includes(d));
  if (!ds.length) return null;
  const t = _semAc(texto);
  return ds.find(d => (d.chaves || []).some(k => t.includes(_semAc(k)))) || ds.find(d => d.destaque) || ds[0];
}
function depoHtml(d) {
  if (d && d.img) return `<figure class="depo-print"><img src="/triagem-modelos/depoimentos/${esc(SLUG)}/${esc(d.img)}" alt="Depoimento de ${esc(d.nome)} pelo WhatsApp: ${esc(d.texto)}"></figure>`;
  return d ? `<figure class="depo"><blockquote>“${esc(d.texto)}”</blockquote><figcaption>— ${esc(d.nome)}${d.servico ? ` · ${esc(d.servico)}` : ''}</figcaption></figure>` : '';
}
const _respTxt = () => Object.values(st.r || {}).flat().join(' ');
const _depoAbertura = () => (M.depoimentos || []).find(d => d.destaque) || (M.depoimentos || [])[0] || null;
const _depoContato = () => depoPara(_respTxt(), [_depoAbertura()]);
const _depoResultado = ind => depoPara(ind.servico + ' ' + _respTxt(), [_depoAbertura(), _depoContato()]);

// 2ª tela: apresenta uma cliente real antes das perguntas
function depoTela() {
  const d = _depoAbertura();
  if (!d) { st.i = 0; salvar(); return tela(); }
  funil(2, 'Viu o depoimento');
  app.innerHTML = `<section class="tela">
    <h2 class="q">Veja o que a ${esc(d.nome)} diz sobre o meu trabalho ${esc(M.coracao || '💜')}</h2>
    ${depoHtml(d)}
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="go">Começar as perguntas →</button></div></section>`;
  $('volta').onclick = () => intro();
  $('go').onclick = () => { funil(3, 'Começou as perguntas'); st.i = 0; salvar(); tela(); window.scrollTo({ top: 0 }); };
  window.scrollTo({ top: 0 });
}

// (28/11) VITRINE DE OFERTAS na 1ª tela: marca o que quer → nome e WhatsApp → agenda. Ou "me ajuda" → triagem enxuta.
function ofertas() {
  const O = M.ofertas, retomar = Object.keys(st.r).length > 0;
  funil(0, 'Abriu a triagem');
  const itens = O.itens.map((it, i) => ({ ...it, i, s: servPorNome(it.nome) })).filter(x => x.s);
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(O.eyebrow || '')}</p>
    <h1>${esc(O.titulo)}</h1>
    ${O.lead ? `<p class="lead of-lead">${esc(O.lead)}</p>` : ''}
    ${O.texto ? `<p class="ajuda-destaque">💳 ${esc(O.texto)}</p>` : ''}
    ${O.direto ? Object.entries(O.grupos || { '': '' }).map(([g, gr]) => {
      const gi = itens.filter(x => !g || x.grupo === g); if (!gi.length) return '';
      const tit = typeof gr === 'string' ? gr : gr?.tit, sub = typeof gr === 'string' ? '' : gr?.sub;
      return `${tit ? `<h3 class="of-grupo">${esc(tit)}</h3>` : ''}${sub ? `<p class="of-grupo-sub">${esc(sub)}</p>` : ''}<div class="of-cards">${gi.map(x => `<div class="of-card">
        <b class="of-nome">${esc(x.rot)}</b><small class="of-sub">${esc(x.sub || '')}</small>
        ${x.desc ? `<p class="of-desc">${esc(x.desc)}</p>` : ''}
        <div class="of-pe"><span class="pr">${x.s.sessoes > 1 || x.s.pacoteDe ? precoTotal(x.s) : precoCurto(x.s)}</span>
          <button class="btn of-agendar" type="button" data-ag="${x.i}">Agendar →</button></div></div>`).join('')}</div>`; }).join('')
      + (O.comoFunciona ? `<h3 class="of-grupo">Como funciona</h3><ol class="of-passos">${O.comoFunciona.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>` : '')
      + ((M.depoimentos || []).length ? `<h3 class="of-grupo">${esc(O.depoTitulo || 'Depoimentos')}</h3><div class="of-depos">${M.depoimentos.map(depoHtml).join('')}</div>` : '')
      + `<button class="btn full of-topo" type="button" onclick="document.querySelector('.of-grupo')?.scrollIntoView({behavior:'smooth'})">Escolher meu cuidado ↑</button>`
    : `<div class="ops escolha-ofertas" role="radiogroup">${itens.map(x => `<button type="button" class="op trat oferta" role="radio" aria-checked="${st.oferta === x.s.id}" data-of="${x.i}">
      <span class="marca-op"></span><span class="trat-tx"><span class="trat-nm"><b>${esc(x.rot)}</b></span>
      <small class="of-sub">${esc(x.sub || '')}</small>${x.desc ? `<small class="of-desc">${esc(x.desc)}</small>` : ''}<small class="pr">${x.s.sessoes > 1 || x.s.pacoteDe ? precoTotal(x.s) : precoCurto(x.s)}</small></span></button>`).join('')}</div>
    <button class="btn full" id="of-go" ${st.oferta ? '' : 'disabled'}>Quero esse → escolher meu horário</button>
    <button class="voltar of-ajuda" id="of-ajuda" type="button">${retomar ? 'Continuar a triagem de onde parei →' : esc(O.ajuda || 'Me ajuda a escolher →')}</button>`}
    ${O.direto ? '' : depoHtml(_depoAbertura())}
    <p class="rodape">${esc(M.profissional.negocio)} · ${esc(M.profissional.endereco || '')}</p></section>`;
  document.body.classList.toggle('landing', !!O.direto);   // página larga no computador
  // landing direta: "Agendar" vai pra agenda com o serviço (nome e WhatsApp a agenda pede)
  app.querySelectorAll('[data-ag]').forEach(b => b.onclick = () => {
    const x = itens.find(y => y.i === Number(b.dataset.ag)); st.oferta = x.s.id; st.ofertaNome = x.rot + (x.sub ? ` (${x.sub})` : ''); salvar();
    passo('Escolheu na página: ' + st.ofertaNome, false); funil(5, 'Escolheu: ' + st.ofertaNome.slice(0, 60));
    b.disabled = true; b.textContent = 'Abrindo…';
    irParaAgenda({ servico: x.s.nome, porque: '' }, [x.s]);
  });
  app.querySelectorAll('[data-of]').forEach(b => b.onclick = () => {
    const x = itens.find(y => y.i === Number(b.dataset.of)); st.oferta = x.s.id; st.ofertaNome = x.rot + (x.sub ? ` (${x.sub})` : ''); salvar();
    app.querySelectorAll('[data-of]').forEach(o => o.setAttribute('aria-checked', o === b)); $('of-go').disabled = false;
    funil(2, 'Marcou uma opção na vitrine');
  });
  if ($('of-go')) $('of-go').onclick = () => {
    if (!st.oferta) return;
    passo('Escolheu na vitrine: ' + st.ofertaNome, false); funil(5, 'Escolheu: ' + st.ofertaNome.slice(0, 60));
    st.plano = [st.oferta]; st.i = passos().findIndex(p => p.tipo === 'contato'); salvar(); tela(); window.scrollTo({ top: 0 });
  };
  if ($('of-ajuda') && !O.direto) $('of-ajuda').onclick = () => {
    funil(1, 'Pediu ajuda pra escolher'); st.oferta = null; salvar();
    passo(retomar ? 'Voltou pra triagem' : 'Começou a triagem (me ajuda a escolher)', false);
    if (!retomar) { st.i = 0; salvar(); tela(); } else { st.i = Math.min(Math.max(st.i, 0), passos().length - 1); salvar(); tela(); }
    window.scrollTo({ top: 0 });
  };
  progresso();
}
// preço do tratamento todo (pacote): "R$ 897 (R$ 179 cada) · preço da Black"
function precoTotal(s) {
  const n = Number(s.sessoes) || 0;
  const v = blackAtiva() ? (_porNome(M.precos?.black, s.nome) ?? s.preco) : (_porNome(M.precos?.depois, s.nome) ?? s.preco);
  if (v == null) return 'valor no atendimento';
  return `<b>${reais(v)}</b>${n > 1 ? ` (${reais(Math.round(v / n))} cada)` : ''}${blackAtiva() && M.precos?.semDepois ? ' · preço da Black' : ''}`;
}

function intro() {
  if (M.ofertas) return ofertas();
  const retomar = Object.keys(st.r).length > 0;
  const rod = M.intro.rodape ?? '';
  funil(0, 'Abriu a triagem');
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(M.intro.eyebrow || '')}</p>
    <h1>${M.intro.titulo}</h1>
    ${[].concat(M.intro.texto).map(t => `<p class="lead">${esc(t)}</p>`).join('')}
    <div class="nav"><span></span><button class="btn" id="go">${retomar ? 'Continuar de onde parei' : 'Começar'} →</button></div>
    ${rod ? `<p class="rodape">${esc(rod)}</p>` : ''}</section>`;
  $('go').onclick = () => { funil(1, 'Tocou em Começar'); passo(retomar ? 'Voltou pra triagem' : 'Começou a triagem', false); if (!retomar) return depoTela(); st.i = Math.min(Math.max(st.i, 0), passos().length - 1); salvar(); tela(); };
  progresso();
}

function tela() {
  const L = passos();
  if (st.i >= L.length) return resultado();
  const p = L[st.i];
  if (p.tipo === 'vitrine') { funil(45, 'Viu os produtos'); return vitrine(); }
  if (p.tipo === 'contato') { funil(50, 'Tela de nome e WhatsApp'); return contato(); }
  { const n = M.perguntas.indexOf(p); funil(10 + n, `Pergunta ${n + 1}: ${(p.curto || p.q || p.id).slice(0, 45)}`); }
  const v = st.r[p.id];
  const multi = p.tipo === 'multi';
  const marcado = o => multi ? (v || []).includes(o.v) : v === o.v;
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(p.grupo || '')}</p>
    <h2 class="q">${esc(p.q)}</h2>
    ${p.ajuda ? `<p class="ajuda">${esc(p.ajuda)}</p>` : ''}
    ${p.destaque ? `<p class="ajuda-destaque">${[].concat(p.destaque).map(esc).join('<br>')}</p>` : ''}
    <div class="ops" role="${multi ? 'group' : 'radiogroup'}">
      ${opsDaTela(p).map(o => `<button type="button" class="op ${multi ? 'multi' : ''}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${marcado(o)}" data-v="${esc(o.v)}">
        ${o.icone ? `<span class="ic">${o.icone}</span>` : ''}<span>${esc(o.v)}${o.combina ? `<small class="combina">✨ Combina com o que tu me contou</small>` : ''}</span><span class="marca-op"></span></button>`).join('')}
    </div>
    ${p.ops.some(o => o.outro) ? `<label class="campo" id="outroBox" hidden>Qual?<input id="outroTxt" placeholder="Escreve aqui" value="${esc(st.r[p.id + '_outro'] || '')}"></label>` : ''}
    <p class="erro" id="erro"></p>
    <div id="avisoBox"></div>
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="seg">Continuar →</button></div></section>`;
  progresso();
  const opOutro = p.ops.find(o => o.outro)?.v;
  const mostrarOutro = () => { const box = $('outroBox'); if (box) box.hidden = ![].concat(st.r[p.id] || []).includes(opOutro); };
  mostrarOutro();
  $('outroTxt')?.addEventListener('input', e => { st.r[p.id + '_outro'] = e.target.value; salvar(); });
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
      avisar(); mostrarOutro();
      if (val === opOutro && a.includes(val)) setTimeout(() => $('outroTxt')?.focus(), 50);
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
  // 1ª vez na vitrine: os indicados pro caso dela já vêm marcados (ela desmarca se não quiser)
  if (!st.r.__vitrine && !st.r.__semBlend) { st.r.__vitrine = itensVitrine().filter(i => i.indicado).map(i => i.nome); salvar(); }
  const V = M.vitrine, sel = st.r.__vitrine || [], itens = itensVitrine();
  app.innerHTML = `<section class="tela">
    <p class="eyebrow">${esc(V.eyebrow || '')}</p>
    <h2 class="q">${esc(V.titulo)}</h2>
    <p class="ajuda">${esc(V.ajuda || '')}</p>
    ${V.recusa ? `<button type="button" class="op multi recusa" role="checkbox" id="recusa" aria-checked="${!!st.r.__semBlend}"><span class="marca-op"></span><span>${esc(V.recusa)}</span></button>` : ''}
    <div class="vit">${itens.map(it => `<button type="button" class="prod" role="checkbox" aria-checked="${sel.includes(it.nome)}" data-v="${esc(it.nome)}">
      <div class="foto">${it.foto ? `<img src="${esc(it.foto)}" alt="">` : (it.icone || '🌿')}</div>
      ${it.indicado ? '<em class="selo">Indicado pra você</em>' : ''}<b>${esc(it.nome)}</b><span>${esc(it.serve)}</span></button>`).join('')}</div>
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="seg">Continuar →</button></div></section>`;
  progresso();
  const pintar = () => {
    const a = st.r.__vitrine || [];
    app.querySelectorAll('.prod').forEach(x => x.setAttribute('aria-checked', a.includes(x.dataset.v)));
    $('recusa')?.setAttribute('aria-checked', !!st.r.__semBlend);
  };
  // "Prefiro não seguir…": desmarca todos os blends; marcar um blend tira essa opção
  $('recusa')?.addEventListener('click', () => {
    st.r.__semBlend = !st.r.__semBlend;
    if (st.r.__semBlend) st.r.__vitrine = [];
    salvar(); pintar();
  });
  app.querySelectorAll('.prod').forEach(b => b.onclick = () => {
    let a = st.r.__vitrine || [];
    a = a.includes(b.dataset.v) ? a.filter(x => x !== b.dataset.v) : [...a, b.dataset.v];
    st.r.__vitrine = a; if (a.length) st.r.__semBlend = false; salvar(); pintar();
  });
  $('seg').onclick = () => { st.i++; salvar(); tela(); window.scrollTo({ top: 0 }); };
  $('volta').onclick = voltar;
}

function avancar() {
  const p = passos()[st.i];
  const v = st.r[p.id];
  if (!p.opcional && (!v || (Array.isArray(v) && !v.length))) { $('erro').textContent = p.tipo === 'multi' ? 'Marca pelo menos uma opção.' : 'Escolhe uma opção pra continuar.'; return; }
  const opOutro = (p.ops || []).find(o => o.outro)?.v;
  if (opOutro && [].concat(v).includes(opOutro) && !(st.r[p.id + '_outro'] || '').trim()) { $('erro').textContent = 'Escreve o que seria no campo "Qual?".'; return; }
  st.i++; salvar(); tela(); window.scrollTo({ top: 0 });
}
function voltar() {
  // veio da vitrine (escolheu uma opção) ou é a 1ª pergunta com vitrine → volta pra vitrine
  if (M.ofertas && (st.oferta || st.i <= 0)) { st.i = -1; salvar(); return ofertas(); }
  if (st.i <= 0) { st.i = -1; salvar(); depoTela(); } else { st.i--; salvar(); tela(); }
}

// === BLOCO 4: NOME + WHATSAPP (é o que faz a cliente aparecer em "Só triagem") ===
function contato() {
  const c = st.contato || {};
  app.innerHTML = `<section class="tela">
    <h2 class="q">Quase lá! ${esc(M.coracao || '💜')}</h2>
    <p class="ajuda">Pra eu te reconhecer quando tu agendar:</p>
    <label class="campo">Teu nome<input id="c-nome" autocomplete="name" placeholder="Como tu gosta de ser chamada" value="${esc(c.nome || '')}"></label>
    <label class="campo">Teu WhatsApp<input id="c-zap" inputmode="tel" autocomplete="tel" placeholder="(51) 9 9999-9999" value="${esc(c.contato || '')}"></label>
    ${depoHtml(_depoContato())}
    <p class="erro" id="erro"></p>
    <div class="nav"><button class="voltar" id="volta">← Voltar</button>
      <button class="btn" id="seg">${st.oferta ? 'Escolher meu horário →' : 'Ver meu resultado →'}</button></div></section>`;
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
    if (!TESTE && (mudou || !st.codigo)) {
      try {
        const { data, error } = await supabase.rpc('triagem_enviar', { p_slug: SLUG, p_nome: nome, p_contato: zap, p_respostas: pacote() });
        if (!error && data?.codigo) st.codigo = data.codigo;
      } catch (e) {}
    }
    // (25/11) conversão do Google Ads = triagem enviada (nome + WhatsApp), uma vez por triagem
    if (!TESTE && st.codigo && st.convEnviada !== st.codigo) {
      try { if (window.gtag && M.conversao) { window.gtag('event', 'conversion', { send_to: M.conversao }); st.convEnviada = st.codigo; } } catch (e) {}
    }
    passo('Mandou nome e WhatsApp');
    funil(51, 'Mandou nome e WhatsApp');
    // (28/11) triagem respondida DEPOIS de agendar (?depois=1): só agradece
    if (new URLSearchParams(location.search).has('depois')) {
      app.innerHTML = `<section class="tela"><h1>Obrigada${nome ? ', ' + esc(nome.split(' ')[0]) : ''}! ${esc(M.coracao || '💜')}</h1>
        <p class="lead">Tuas respostas chegaram pra mim. Com elas eu preparo tua sessão do teu jeito.</p>
        <p class="lead">Até lá! Qualquer dúvida, me chama no WhatsApp.</p></section>`;
      return;
    }
    // (28/11) escolheu direto na vitrine: vai pra agenda com aquele serviço
    if (st.oferta) { const s = SERV.find(x => x.id === st.oferta); if (s) return irParaAgenda({ servico: s.nome, porque: '' }, [s]); }
    st.i++; salvar(); tela(); window.scrollTo({ top: 0 });
  };
}
function mascara(v) {
  // número com o 55 do Brasil na frente (digitado ou colado do WhatsApp): tira o 55 e fica DDD + número
  let d = v.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
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
// Preço por nome do serviço (o nome da agenda começa com o do modelo: "Deusa Grega – …")
const _porNome = (mapa, nome) => { if (!mapa) return undefined; const n = norm(nome); const k = Object.keys(mapa).find(x => n === norm(x) || n.startsWith(norm(x))); return k ? mapa[k] : undefined; };
function precoTxt(s) {
  const depois = _porNome(M.precos?.depois, s.nome);
  const black = _porNome(M.precos?.black, s.nome) ?? s.preco;   // preço de Black do modelo, senão o da agenda
  const atual = blackAtiva() ? black : (depois ?? s.preco);
  if (atual == null && depois == null) return `valor com a ${esc(M.profissional.nome)}`;
  // precos.semDepois (25/11, Alê): mostra só o preço da Black, sem o "a partir de 01/12" (parecia que só dava pra agendar até o prazo)
  if (black != null && depois != null && depois !== black && blackAtiva() && M.precos?.semDepois) return `<b>${reais(black)}</b> (preço da Black)`;
  // precos.legenda (modelo): texto próprio da regra da Black, com {black} {depois} {prazo} {depoisDe}
  if (black != null && depois != null && blackAtiva() && M.precos.legenda)
    return esc(M.precos.legenda).replace('{black}', `<b>${reais(black)}</b>`).replace('{depois}', reais(depois)).replace('{prazo}', esc(M.precos.prazo)).replace('{depoisDe}', proxDia());
  if (black != null && depois != null && blackAtiva())
    return `Black até ${esc(M.precos.prazo)}: <b>${reais(black)}</b> · a partir de ${proxDia()}: ${reais(depois)}`;
  return `<b>${reais(atual ?? depois)}</b>`;
}

// Pacote do serviço (item da agenda com pacoteDe): "ou pacote de 5 sessões: R$ 897 (R$ 179 cada)"
function pacoteTxt(s) {
  const pac = SERV.find(x => x.pacoteDe === s.id);
  if (!pac || pac.preco == null || !pac.sessoes) return '';
  const depois = _porNome(M.precos?.depois, pac.nome);
  const v = blackAtiva() ? pac.preco : (depois ?? pac.preco);
  return `ou pacote de ${pac.sessoes} sessões: <b>${reais(v)}</b> (${reais(Math.round(v / pac.sessoes))} cada)`;
}
// Preço dentro da opção: "Sessão: R$ 197 (R$ 227 a partir de 01/12)" + "Tratamento de 5 sessões: …"
function precoCurto(s) {
  const depois = _porNome(M.precos?.depois, s.nome);
  const black = _porNome(M.precos?.black, s.nome) ?? s.preco;
  if (blackAtiva() && black != null && depois != null && depois !== black && M.precos?.semDepois) return `<b>${reais(black)}</b> (preço da Black)`;
  if (blackAtiva() && black != null && depois != null && depois !== black) return `<b>${reais(black)}</b> (${reais(depois)} a partir de ${proxDia()})`;
  const v = blackAtiva() ? black : (depois ?? s.preco);
  return v != null ? `<b>${reais(v)}</b>` : `valor no atendimento`;
}
function precosOpcao(s) {
  if (s.sessoes > 1) return `<small class="pr">Tratamento completo: ${precoCurto(s)}</small>`;
  const pac = SERV.find(x => x.pacoteDe === s.id);
  const linhaPac = pac && pac.preco != null && pac.sessoes ? (() => {
    const v = blackAtiva() ? pac.preco : (_porNome(M.precos?.depois, pac.nome) ?? pac.preco);
    return `<small class="pr">Tratamento de ${pac.sessoes} sessões: <b>${reais(v)}</b> (${reais(Math.round(v / pac.sessoes))} cada)</small>`;
  })() : '';
  return `<small class="pr">Sessão: ${precoCurto(s)}</small>${linhaPac}`;
}
const nomeCurto = n => String(n || '').split(' – ')[0].split(' (')[0];

// === BLOCO 6: RESULTADO (indicação · vou agendar · também me interessam) ===
function resumoLinhas() {
  const L = M.perguntas.filter(p => !p.mostrarSe || condicao(p.mostrarSe));
  return L.map(p => {
    const outro = (p.ops || []).find(o => o.outro)?.v, txt = (st.r[p.id + '_outro'] || '').trim();
    return [p.curto || p.q, [].concat(st.r[p.id] || []).map(x => x === outro && txt ? `${x}: ${txt}` : x).join(', ')];
  }).filter(x => x[1]);
}
// Tudo que vai pro banco (fica no cadastro da cliente no Falcon)
function pacote() {
  const ind = M.indicacao(st.r);
  const nomeDe = id => SERV.find(s => s.id === id)?.nome || id;
  const linhas = resumoLinhas();
  return { respostas: Object.fromEntries(linhas), ordem: linhas.map(x => x[0]), bruto: st.r, blends_vitrine: st.r.__vitrine || [],
    indicacao: ind.servico, plano: (st.plano || []).map(nomeDe), interesses: st.interesses || [], origem: st.origem || null,
    caminho: st.caminho || [] };
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
  funil(60, 'Viu o resultado');
  const ind = M.indicacao(st.r);
  const servInd = servPorNome(ind.servico);
  // se as respostas mudaram (voltou e trocou), a indicação recomeça
  if (!st.plano || st.planoPara !== ind.servico) { st.plano = servInd ? [servInd.id] : []; st.planoPara = ind.servico; }
  if (st.viuResultado !== ind.servico) { st.viuResultado = ind.servico; passo('Viu o resultado (indicação: ' + ind.servico + ')'); }
  const opcoes = (ind.opcoes || []).map(servPorNome).filter(Boolean);
  const extras = (ind.extras || []).map(e => ({ ...e, s: servPorNome(e.servico) })).filter(e => e.s && !opcoes.includes(e.s) && e.s.id !== servInd?.id);
  const plano = st.plano.map(id => SERV.find(s => s.id === id)).filter(Boolean);
  const desc = s => _porNome(M.descricoes, s.nome) || '';
  const sug = sugestoes(ind, st.plano);
  const blend = M.blendPersonalizado ? M.blendPersonalizado(st.r) : null;
  const blendsVit = st.r.__vitrine || [];
  if (!st.interesses) st.interesses = [];
  // Blends da vitrine ficam sincronizados com a tela anterior: marcou lá → vem marcado aqui;
  // desmarcou lá → some daqui (e vice-versa, marcar/desmarcar aqui atualiza a vitrine)
  const nomesVit = (M.vitrine?.itens || []).map(i => i.nome);
  st.interesses = [...st.interesses.filter(x => !nomesVit.includes(x)), ...blendsVit];
  // serviços sugeridos + blends (sem preço: o valor depende da combinação, a profissional define)
  const ops = [...sug.map(s => ({ v: s.nome, blend: false })),
    ...(!servInd && ind.servico ? [{ v: ind.servico, blend: true }] : []),
    ...blendsVit.map(b => ({ v: b, blend: true })),
    ...(blend ? [{ v: blend.nome, blend: true }] : [])].filter((o, i, a) => a.findIndex(x => x.v === o.v) === i);
  salvar();
  app.innerHTML = `<section class="tela">
    <h1>${esc(M.resultado?.titulo || 'Achei o cuidado certo pra ti')} ${esc(M.coracao || '💜')}</h1>
    ${opcoes.length > 1 ? `<div class="card escolha"><h3>Escolhe o teu tratamento</h3><p class="ajuda" style="margin:0 0 .7rem">${esc(ind.porque)}</p>
      <div class="ops" role="radiogroup">${opcoes.map(s => `<button type="button" class="op trat" role="radio" aria-checked="${st.plano[0] === s.id}" data-id="${esc(s.id)}">
        <span class="marca-op"></span><span class="trat-tx"><span class="trat-nm"><b>${esc(nomeCurto(s.nome))}</b>${s.id === servInd?.id ? '<span class="selo">indicado pra ti</span>' : ''}</span>
        ${desc(s) ? `<small>${esc(desc(s))}</small>` : ''}${precosOpcao(s)}</span></button>`).join('')}</div></div>`
    : M.semIndicacao ? '' : `<div class="card"><h3>Minha indicação</h3><p class="indic">${esc(ind.servico)}</p><p class="ajuda" style="margin:.4rem 0 0">${esc(ind.porque)}</p></div>`}
    ${extras.length ? `<div class="card escolha"><h3>Quer cuidar disso também?</h3>
      <div class="ops">${extras.map(e => `<button type="button" class="op trat multi" role="checkbox" aria-checked="${st.plano.includes(e.s.id)}" data-extra="${esc(e.s.id)}">
        <span class="marca-op"></span><span class="trat-tx"><b>${esc(e.titulo || nomeCurto(e.s.nome))}</b><small>${esc(e.porque || desc(e.s))}</small><small class="pr">${precoTxt(e.s)}</small></span></button>`).join('')}</div></div>` : ''}
    ${ind.aviso ? `<div class="aviso">${esc(ind.aviso)}</div>` : ''}
    ${depoHtml(_depoResultado(ind))}
    ${plano.length ? `<div class="card plano"><h3>Vou agendar</h3>
      ${plano.map(s => `<div class="item"><span class="nm">${esc(s.nome)} · ${s.duracaoMin || 60} min</span><span class="pr">${s.sessoes > 1 ? `Pacote com ${s.sessoes} sessões` : 'Sessão'}: ${precoTxt(s)}</span>${pacoteTxt(s) ? `<span class="pr">${pacoteTxt(s)}</span>` : ''}</div>`).join('')}
      ${M.semIndicacao && ind.porque ? `<p class="ajuda" style="margin:.6rem 0 0">${esc(ind.porque)}</p>` : ''}
      ${plano.some(s => pacoteTxt(s)) ? `<p class="ajuda" style="margin:.6rem 0 0">Na agenda tu escolhe: uma sessão ou o pacote, e pode mudar depois. O tratamento completo é o que dá mais resultado, e eu te explico tudo no atendimento.</p>` : ''}
    </div>` : ''}
    ${ops.length && M.mostrarInteresses !== false ? `<div class="card int"><h3>Serviços que também me interessam</h3>
      <div class="ops">${ops.map(o => `<button type="button" class="op multi" role="checkbox" aria-checked="${st.interesses.includes(o.v)}" data-v="${esc(o.v)}"><span class="marca-op"></span><span>${esc(o.v)}${o.blend ? ' 🌿' : ''}</span></button>`).join('')}</div>
    </div>` : ''}
    ${plano.length && blackAtiva() && M.avisoAgendar ? `<p class="ajuda-destaque" style="margin-top:1.1rem">${[].concat(M.avisoAgendar).map(esc).join('<br>')}</p>` : ''}
    <div style="display:flex;flex-direction:column;gap:.6rem;margin-top:1.3rem">
      <button class="btn full" id="agendar">${plano.length ? '📅 Escolher meu horário' : `💬 Combinar com a ${esc(M.profissional.nome)} no WhatsApp`}</button>
      ${M.naoEhMomento && plano.length ? `<button class="btn full sec" id="nao-momento">${esc(M.naoEhMomento.botao || 'Ainda não é o meu momento')}</button>` : ''}
      <div class="nav" style="margin-top:.2rem"><button class="voltar" id="volta">← Voltar</button>
        <button class="voltar" id="refazer">Refazer as respostas</button></div>
    </div>
    <p class="rodape">${esc(M.profissional.negocio)} · ${esc(M.profissional.endereco || '')}</p></section>`;
  app.querySelectorAll('.op.trat[data-id]').forEach(b => b.onclick = () => {
    st.plano = [b.dataset.id, ...st.plano.slice(1).filter(id => id !== b.dataset.id)];
    passo('Escolheu ' + (SERV.find(x => x.id === b.dataset.id)?.nome || b.dataset.id), false); salvar(); resultado();
  });
  app.querySelectorAll('.op.trat[data-extra]').forEach(b => b.onclick = () => {
    const id = b.dataset.extra;
    const tira = st.plano.includes(id);
    st.plano = tira ? st.plano.filter(x => x !== id) : [...st.plano, id];
    passo((tira ? 'Tirou ' : 'Somou ') + (SERV.find(x => x.id === id)?.nome || id), false); salvar(); resultado();
  });
  app.querySelectorAll('.int .op').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    st.interesses = st.interesses.includes(v) ? st.interesses.filter(x => x !== v) : [...st.interesses, v];
    if (nomesVit.includes(v)) st.r.__vitrine = st.interesses.filter(x => nomesVit.includes(x));
    b.setAttribute('aria-checked', st.interesses.includes(v)); salvar();
  });
  $('volta').onclick = () => { st.i = passos().length - 1; salvar(); tela(); window.scrollTo({ top: 0 }); };
  $('refazer').onclick = () => { passo('Refez as respostas', false); st = { caminho: st.caminho, i: -1, r: {}, contato: st.contato, origem: st.origem }; salvar(); intro(); };
  // Indicação que ainda não está na agenda (ex.: tratamento com valor a combinar): vai pro WhatsApp dela
  $('agendar').onclick = () => plano.length ? irParaAgenda(ind, plano) : irParaWhatsApp(ind);
  if ($('nao-momento')) $('nao-momento').onclick = () => { passo('Disse que ainda não é o momento (viu outras opções)'); funil(72, 'Ainda não é o momento'); naoEhMomento(ind); window.scrollTo({ top: 0 }); };
}

// "Ainda não é o meu momento" (21/11, Élton): quem chegou até aqui e não quis agendar
// (sem nem ver os horários) costuma travar no valor → mostra os cuidados mais em conta,
// o que combina com as respostas primeiro, e cada um abre a agenda só com aquele serviço.
function naoEhMomento(ind) {
  const N = M.naoEhMomento;
  const marcados = Object.values(st.r).flat();
  const lista = (N.servicos || []).map(n => ({ n, s: servPorNome(n) })).filter(x => x.s)
    .map(({ n, s }) => ({ s, combina: (N.combinaPor?.[n] || []).some(x => marcados.includes(x)) }))
    .sort((a, b) => (b.combina - a.combina) || ((a.s.preco ?? 1e9) - (b.s.preco ?? 1e9)));
  app.innerHTML = `<section class="tela">
    <h1>${esc(N.titulo || 'Tudo bem')} ${esc(M.coracao || '💜')}</h1>
    ${N.texto ? `<p class="lead">${esc(N.texto)}</p>` : ''}
    ${lista.map(({ s, combina }) => `<div class="card">
      ${combina ? `<h3>Combina com o que você me contou</h3>` : ''}
      <p class="indic" style="margin:0">${esc(s.nome)}</p>
      <p class="ajuda" style="margin:.25rem 0 .7rem">${s.duracaoMin || 60} min${s.preco != null ? ` · <b>${reais(s.preco)}</b>` : ''}</p>
      <button class="btn full" data-alt="${esc(s.id)}">📅 Ver horários</button></div>`).join('')}
    <div style="display:flex;flex-direction:column;gap:.6rem;margin-top:1.3rem">
      <!-- (21/11, Élton) tem que ficar NÍTIDO que é WhatsApp: verde + ícone + "no WhatsApp" -->
      <button class="btn full" id="alt-zap" style="background:#25D366;color:#fff"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg> ${esc(N.botaoZap || `Quero falar com a ${M.profissional.nome} no WhatsApp`)}</button>
      <div class="nav" style="margin-top:.2rem"><button class="voltar" id="volta">← Voltar</button></div>
    </div>
    <p class="rodape">${esc(M.profissional.negocio)} · ${esc(M.profissional.endereco || '')}</p></section>`;
  app.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => {
    const s = SERV.find(x => x.id === b.dataset.alt);
    passo('Escolheu outra opção: ' + s.nome, false);
    app.querySelectorAll('[data-alt]').forEach(x => { x.removeAttribute('id'); });
    b.id = 'agendar';   // irParaAgenda mostra "Abrindo a agenda…" no botão #agendar
    irParaAgenda({ ...ind, servico: `${ind.servico} (disse que ainda não é o momento; escolheu ${s.nome})` }, [s]);
  });
  $('alt-zap').onclick = () => irParaWhatsApp({ ...ind, servico: `${ind.servico} (ainda não é o meu momento, quero conhecer outras opções)` });
  $('volta').onclick = () => { resultado(); window.scrollTo({ top: 0 }); };
}

function irParaWhatsApp(ind) {
  const msg = [`Oi ${M.profissional.nome}! Fiz a triagem ${M.coracao || '💜'}`, `✨ Indicação: ${ind.servico}`,
    'Quero saber como funciona e o valor.', '', ...resumoLinhas().map(([k, v]) => `• ${k}: ${v}`)].join('\n');
  if (TESTE) {
    app.insertAdjacentHTML('beforeend', `<div class="aviso" style="margin-top:1rem">🧪 <b>Modo teste.</b> Aqui a cliente iria pro WhatsApp da ${esc(M.profissional.nome)} com a indicação <b>${esc(ind.servico)}</b> e o resumo da triagem. Nada foi salvo.</div>`);
    $('agendar') && ($('agendar').disabled = true); app.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  passo('Foi pro WhatsApp combinar (' + ind.servico + ')');
  funil(71, 'Foi pro WhatsApp combinar');
  try { if (window.dataLayer) { window.dataLayer.push({ event: 'triagem_enviada', profissional: SLUG, servico: ind.servico });
  } } catch (e) {}
  location.href = `https://wa.me/${String(M.profissional.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

// === BLOCO 7: PASSA PRA AGENDA (já preenchida) + CONVERSÃO DO GOOGLE ===
// A agenda lê `falcon_triagem_<slug>`: serviços, nome, WhatsApp e a mensagem que a
// cliente manda pra profissional depois de confirmar ({{QUANDO}} = dia e hora).
async function irParaAgenda(ind, plano) {
  // modo teste (21/11): segue pra agenda TAMBÉM em teste (?teste=1 lá), que percorre tudo sem marcar horário
  // nem mandar nada; aqui não grava a triagem nem conta conversão (st.codigo fica vazio e a tag não carrega).
  const b = $('agendar') || $('seg'); if (b) { b.disabled = true; b.textContent = 'Abrindo a agenda…'; }
  st.interesses = st.interesses || [];   // veio direto da vitrine (sem a tela de resultado)
  passo('Tocou em Escolher meu horário (' + (plano.map(s => s.nome).join(' + ') || ind.servico) + ')', false);
  funil(70, 'Tocou em Escolher meu horário');
  const linhas = resumoLinhas();
  const msg = [`Oi ${M.profissional.nome}! Fiz a triagem e agendei pelo teu link ${M.coracao || '💜'}`, '',
    '📅 Agendei: {{SERVICO}} · {{QUANDO}}',
    (st.oferta ? `✨ Escolhi: ${st.ofertaNome || ind.servico}` : `✨ Indicação: ${ind.servico}`),
    ...(st.cupom ? [`🎟️ Cupom: ${st.cupom}`] : []),
    ...(st.interesses.length ? [`💡 Também me interessam: ${st.interesses.join(', ')}`] : []),
    ...(() => { const ps = [...new Set([].concat(st.r.casa || []).flatMap(n => M.produtosPor?.[n] || []))];
      return ps.length ? [`🌿 Produtos pra casa que combinam: ${ps.join(', ')}`] : []; })(),
    '', ...linhas.map(([k, v]) => `• ${k}: ${v}`)].join('\n');
  // foco (modelo com focoNoServico): a agenda abre só com esse serviço, sem a lista dos outros
  const handoff = { nome: st.contato?.nome, contato: st.contato?.contato, servicos: plano.map(s => s.id), msg, foco: !!M.focoNoServico,
    whatsapp: M.profissional.whatsapp, codigo: st.codigo || null, ts: Date.now(), pacote: pacote(),
    sessao: st.sessao || null, origem: st.origem?.source || null,   // funil continua na agenda
    conversao: st.oferta && M.ofertas?.direto ? (M.conversao || null) : null, googleAds: M.googleAds || null,   // landing direta: conta a conversão quando AGENDA
    triagemDepois: M.triagemDepois || null };
  try {
    localStorage.setItem('falcon_triagem_' + SLUG, JSON.stringify(handoff));
    localStorage.setItem('falcon_cliente_' + SLUG, JSON.stringify({ nome: handoff.nome, contato: handoff.contato }));
  } catch (e) {}
  try { if (st.codigo) await supabase.rpc('triagem_atualizar', { p_slug: SLUG, p_codigo: st.codigo, p_respostas: pacote() }); } catch (e) {}
  try {
    if (window.dataLayer) {
      window.dataLayer.push({ event: 'triagem_enviada', profissional: SLUG, servico: ind.servico });
    }
  } catch (e) {}
  setTimeout(() => { location.href = '/agenda-online/' + encodeURIComponent(SLUG) + '?triagem=1' + (st.cupom ? '&cupom=' + encodeURIComponent(st.cupom) : '') + (TESTE ? '&teste=1' : ''); }, 350);
}
