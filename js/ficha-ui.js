// ─── ÍNDICE ──────────────────────────────────────────────────
// FICHA DE ATENDIMENTO — lado da PROFISSIONAL (dentro da Agenda Online).
//   secaoFichaHtml / wireSecaoFicha → bloco "📋 Ficha de atendimento" na Agenda
//     (profissão, link geral, tipos de massagem, demonstração, novas fichas)
//   perfilFichaHtml / wirePerfilFicha → botões da ficha no perfil do cliente
//   abrirFicha → tela com a ficha respondida (respostas + mapa do corpo)
//   🩺 Sessões do cliente (dor ao pressionar, medidas, observações) → ficha-sessoes-ui.js
// Dados: ficha.js · Modelos: ficha-modelo.js · Página do cliente: ficha-publica.js
// ─────────────────────────────────────────────────────────────
import { getFichas, criarConviteFicha, ligarFichaCliente, excluirFicha, salvarFichaCfg } from './ficha.js';
import { MODELOS, PROFISSOES, SUGESTOES_TIPOS, FRENTE, COSTAS, TIPOS_MARCA, NIVEIS, nomeDa, ladoDa, temMarca, mesmoNumero, faltando } from './ficha-modelo.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { carregarSessoes, sessoesPerfilHtml, wireSessoesPerfil } from './ficha-sessoes-ui.js';

// === BLOCO 1: ESTADO E AJUDANTES ===
let _fichas = [], _erroSql = false, _demo = false;
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _dataBr = iso => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; } catch { return ''; } };
const _primeiro = s => String(s || '').trim().split(/\s+/)[0] || '';
const _cfgFicha = cfg => (cfg && cfg.ficha_cfg && typeof cfg.ficha_cfg === 'object') ? cfg.ficha_cfg : {};
export const fichaAtiva = cfg => !!MODELOS[_cfgFicha(cfg).profissao];
const _linkGeral = cfg => `${location.origin}/ficha/${cfg.slug}`;
const _linkCliente = (cfg, f) => `${location.origin}/ficha/${cfg.slug}/${f.codigo}`;
function _waLink(zap, msg) {
  let d = String(zap || '').replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}
// Fichas de um cliente da Agenda: pelo WhatsApp (ignora 9º dígito) ou, sem WhatsApp, pelo nome.
function _fichasDoCliente(c) {
  return _fichas.filter(f => c.contato
    ? mesmoNumero(f.cliente_digitos || f.cliente_contato, c.contato)
    : (!f.cliente_digitos && (f.cliente_nome || '').trim().toLowerCase() === (c.nome || '').trim().toLowerCase()));
}
// Fichas respondidas que não batem com nenhum cliente da Agenda → "Novas fichas".
function _fichasSemCliente(clientes) {
  return _fichas.filter(f => f.respondida_em && !clientes.some(c => c.contato
    ? mesmoNumero(f.cliente_digitos || f.cliente_contato, c.contato)
    : (!f.cliente_digitos && (f.cliente_nome || '').trim().toLowerCase() === (c.nome || '').trim().toLowerCase())));
}

// Demonstração (demo-profissional.html): fichas de exemplo, nada é enviado nem salvo.
export function demoFichas(lista) { _fichas = lista; _demo = true; }

export async function carregarFichas(cfg) {
  if (_demo) return;
  _erroSql = false;
  if (!fichaAtiva(cfg)) { _fichas = []; return; }
  const [f] = await Promise.all([getFichas().catch(() => null), carregarSessoes()]);
  if (f) _fichas = f; else { _fichas = []; _erroSql = true; }
}

// === BLOCO 2: SEÇÃO NA AGENDA ===
export function secaoFichaHtml(cfg, clientes) {
  const fc = _cfgFicha(cfg);
  if (!fichaAtiva(cfg)) {
    return `<div class="fi-secao">
      <div class="fi-secao-tit">📋 Ficha de atendimento</div>
      <div class="fi-secao-sub">Seus clientes respondem uma ficha antes da sessão (onde dói, o que procuram, saúde) e ela aparece no perfil de cada um. Qual é a sua profissão?</div>
      <div class="fi-prof">
        ${PROFISSOES.map(p => `<button class="fi-prof-btn" data-fi-prof="${p.k}" type="button">${p.emoji} ${_esc(p.nome)}</button>`).join('')}
        <div class="fi-prof-breve">Outras profissões em breve</div>
      </div>
    </div>`;
  }
  const novas = _fichasSemCliente(clientes);
  const prof = PROFISSOES.find(p => p.k === fc.profissao);
  return `<div class="fi-secao">
    <div class="fi-secao-tit">📋 Ficha de atendimento <span class="fi-secao-prof">${prof ? prof.emoji + ' ' + _esc(prof.nome) : ''}</span></div>
    ${_erroSql ? '<div class="fi-aviso">Falta rodar o SQL da ficha no Supabase (sql/ficha.sql).</div>' : ''}
    <div class="fi-secao-sub">Pra mandar pra um cliente específico, abra o cliente em 👥 Clientes. O link geral serve pra quem ainda não é cliente: a ficha cai no perfil pelo WhatsApp.</div>
    <div class="fi-botoes">
      <button class="fi-btn" id="fi-demo" type="button">👁️ Ver como o cliente vê</button>
      <button class="fi-btn" id="fi-tipos" type="button">💆 Tipos de massagem que você atende</button>
    </div>
    <div class="input-field-label" style="margin-top:10px">Link geral da ficha</div>
    <div class="ag-link-box">
      <input id="fi-link" readonly value="${_esc(_linkGeral(cfg))}">
      <button id="fi-copiar" class="btn-secondary" type="button">Copiar</button>
    </div>
    ${novas.length ? `<div class="input-field-label" style="margin-top:12px">🆕 Novas fichas <span class="ag-lbl-opt">— de quem ainda não é cliente</span></div>
      <div class="ag-lista">${novas.map(f => `<button class="ag-cli-row" data-fi-abrir="${_esc(f.id)}" type="button">
        <div class="ag-cli-row-info"><b>${_esc(f.cliente_nome || 'Sem nome')}</b><small>${_esc(f.cliente_contato || '')} · ${_dataBr(f.respondida_em)}</small></div>
        <span class="ag-cli-row-ch">›</span></button>`).join('')}</div>` : ''}
  </div>`;
}

export function wireSecaoFicha(corpo, { cfg, clientes, redesenhar }) {
  corpo.querySelectorAll('[data-fi-prof]').forEach(b => b.addEventListener('click', async () => {
    const novo = { ..._cfgFicha(cfg), profissao: b.dataset.fiProf };
    b.disabled = true;
    try { await salvarFichaCfg(novo); cfg.ficha_cfg = novo; await carregarFichas(cfg); redesenhar(); showToast('📋 Ficha ativada!', 'success'); }
    catch (e) { showToast(e.message, 'error'); b.disabled = false; }
  }));
  corpo.querySelector('#fi-demo')?.addEventListener('click', () => abrirPaginaFicha(`/ficha/${cfg.slug}?demo=1&p=${_cfgFicha(cfg).profissao}`, 'Demonstração'));
  corpo.querySelector('#fi-tipos')?.addEventListener('click', () => _popupTipos(cfg));
  corpo.querySelector('#fi-copiar')?.addEventListener('click', async () => {
    const inp = corpo.querySelector('#fi-link');
    try { await navigator.clipboard.writeText(inp.value); showToast('🔗 Link da ficha copiado!', 'success'); }
    catch { inp.focus(); inp.select(); showToast('Segure no link e copie', 'info'); }
  });
  corpo.querySelectorAll('[data-fi-abrir]').forEach(b => b.addEventListener('click', () => {
    const f = _fichas.find(x => x.id === b.dataset.fiAbrir); if (f) abrirFicha(f, { cfg, clientes, redesenhar });
  }));
}

// === BLOCO 3: TIPOS DE MASSAGEM (a única parte ajustável da ficha) ===
function _popupTipos(cfg) {
  const fc = { desligados: [], extras: [], ..._cfgFicha(cfg) };
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fi-tipos-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">💆 Tipos de massagem</div>
    <div class="fi-secao-sub">Marque o que você atende. Desmarcado não aparece pro cliente. "Não sei, quero que a profissional indique" aparece sempre.</div>
    <div class="fi-tipos" id="fi-tipos-lista"></div>
    <div class="fi-tipo-add">
      <input id="fi-tipo-novo" placeholder="Acrescentar: ex. Massagem com bambu" maxlength="60">
      <button class="btn-secondary" id="fi-tipo-add" type="button">Adicionar</button>
    </div>
    <div class="ag-fbtns">
      <button class="btn-secondary" id="fi-tipos-cancelar" type="button">Fechar</button>
      <button class="btn-primary" id="fi-tipos-salvar" type="button">Salvar</button>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  const pintar = () => {
    ov.querySelector('#fi-tipos-lista').innerHTML =
      SUGESTOES_TIPOS.map(t => `<button class="fi-tipo ${fc.desligados.includes(t) ? '' : 'on'}" data-t="${_esc(t)}" type="button"><span class="fi-chk"></span>${_esc(t)}</button>`).join('') +
      fc.extras.map(t => `<div class="fi-tipo on extra"><span class="fi-chk"></span><span style="flex:1">${_esc(t)}</span><button class="fi-tipo-rm" data-rm="${_esc(t)}" type="button" aria-label="Remover">×</button></div>`).join('');
  };
  pintar();
  ov.querySelector('#fi-tipos-lista').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { fc.extras = fc.extras.filter(x => x !== rm.dataset.rm); pintar(); return; }
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = b.dataset.t;
    fc.desligados = fc.desligados.includes(t) ? fc.desligados.filter(x => x !== t) : fc.desligados.concat(t);
    pintar();
  });
  const add = () => {
    const inp = ov.querySelector('#fi-tipo-novo'); const v = inp.value.trim();
    if (!v) return;
    if (!SUGESTOES_TIPOS.includes(v) && !fc.extras.includes(v)) fc.extras.push(v);
    inp.value = ''; pintar();
  };
  ov.querySelector('#fi-tipo-add').onclick = add;
  ov.querySelector('#fi-tipo-novo').onkeydown = e => { if (e.key === 'Enter') add(); };
  ov.querySelector('#fi-tipos-cancelar').onclick = () => close();
  ov.querySelector('#fi-tipos-salvar').onclick = async () => {
    const btn = ov.querySelector('#fi-tipos-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try { await salvarFichaCfg(fc); cfg.ficha_cfg = fc; close(); showToast('✅ Tipos de massagem salvos', 'success'); }
    catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar'; }
  };
}

// === BLOCO 4: PÁGINA DA FICHA DENTRO DO APP (demonstração / preencher junto) ===
// prefill (opcional): { R, marcas } mandados pra página assim que ela avisa que carregou.
export function abrirPaginaFicha(url, titulo, onFechar, prefill) {
  const ov = document.createElement('div');
  ov.className = 'fi-pagina-ov';
  ov.innerHTML = `<div class="fi-pagina-top"><span>${_esc(titulo || 'Ficha')}</span>
    <button class="fi-pagina-x" type="button" aria-label="Fechar">✕</button></div>
    <iframe class="fi-pagina-frame" src="${_esc(url)}" title="Ficha de atendimento"></iframe>`;
  document.body.appendChild(ov);
  const frame = ov.querySelector('iframe');
  const aoPronto = e => {
    if (e.source !== frame.contentWindow || e.data?.tipo !== 'ficha-pronta' || !prefill) return;
    frame.contentWindow.postMessage({ tipo: 'ficha-prefill', R: prefill.R || {}, marcas: prefill.marcas || {} }, location.origin);
  };
  window.addEventListener('message', aoPronto);
  const close = trapModalBack(() => { window.removeEventListener('message', aoPronto); ov.remove(); onFechar?.(); });
  ov.querySelector('.fi-pagina-x').onclick = () => close();
  return close;
}

// === BLOCO 4B: SITUAÇÃO DA FICHA (o que falta, sem precisar abrir) ===
function _situacao(c) {
  const fs = _fichasDoCliente(c);
  const resps = fs.filter(f => f.respondida_em).sort((a, b) => (a.respondida_em < b.respondida_em ? -1 : 1));
  const resp = resps[resps.length - 1] || null;
  const rasc = fs.filter(f => f.rascunho && f.rascunho_em && (!resp || f.rascunho_em > resp.respondida_em))
    .sort((a, b) => (a.rascunho_em < b.rascunho_em ? 1 : -1))[0] || null;
  const falta = resp ? faltando(MODELOS[resp.modelo] || MODELOS.massoterapia, resp.respostas, resp.mapa) : [];
  return { resps, resp, rasc, falta, saude: falta.some(x => x.saude) };
}
const _txtFalta = st => `${st.falta.length} em branco${st.saude ? ' · ⚠️ saúde' : ''}`;
// "a, b e c"
const _lista = arr => arr.length > 1 ? arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1] : (arr[0] || '');
// Frase embaixo do botão da ficha: "Maria está com a ficha incompleta. Não respondeu: sono e alergia."
function _fraseFalta(c, st) {
  if (!st.resp || !st.falta.length) return '';
  const saude = st.falta.filter(x => x.saude).map(x => x.curta);
  const outras = st.falta.filter(x => !x.saude).map(x => x.curta);
  return `<div class="fi-perfil-falta${saude.length ? ' saude' : ''}"><b>${_esc(_primeiro(c.nome))}</b> está com a ficha incompleta.
    ${saude.length ? `<br>⚠️ <b>Saúde:</b> não respondeu ${_esc(_lista(saude))}.` : ''}
    ${outras.length ? `<br>Não respondeu ${_esc(_lista(outras))}.` : ''}</div>`;
}

// Etiqueta pra lista de 👥 Clientes da Agenda.
export function statusFichaClienteHtml(cfg, c) {
  if (!fichaAtiva(cfg)) return '';
  const st = _situacao(c);
  if (st.resp) return st.falta.length
    ? ` · <span class="fi-st aviso${st.saude ? ' saude' : ''}">📋 ${_txtFalta(st)}</span>`
    : ' · <span class="fi-st ok">📋 ficha completa</span>';
  if (st.rasc) return ' · <span class="fi-st aviso">📋 começou e não enviou</span>';
  return ' · <span class="fi-st">📋 sem ficha</span>';
}

// "Preencher/Atualizar junto": abre a ficha do cliente dentro do app, já com o que ele respondeu.
async function _abrirJunto(cfg, c, aoFechar) {
  // busca o mais recente do banco (o cliente pode ter começado a preencher agora há pouco)
  if (!_demo) try { _fichas = await getFichas(); } catch {}
  const st = _situacao(c);
  // o que já foi respondido: rascunho em andamento (se mais novo) ou a última ficha enviada
  const prefill = st.rasc ? st.rasc.rascunho : st.resp ? { R: st.resp.respostas || {}, marcas: st.resp.mapa || {} } : null;
  if (_demo) { abrirPaginaFicha(`/ficha/${cfg.slug}?demo=1&p=${_cfgFicha(cfg).profissao}`, 'Demonstração', null, prefill); return; }
  const f = await _fichaDoClienteOuNova(cfg, c);
  // ao fechar, recarrega pra ficha aparecer como respondida
  abrirPaginaFicha(`/ficha/${cfg.slug}/${f.codigo}`, `Ficha de ${_primeiro(c.nome)}`,
    async () => { await carregarFichas(cfg); aoFechar?.(); }, prefill);
}

// Depois que a PROFISSIONAL marca um atendimento: se o cliente ainda não respondeu a ficha,
// pergunta se quer mandar o link pelo WhatsApp. Espera o popup do agendamento fechar antes.
export async function oferecerFichaAposAgendar(cfg, { nome, contato } = {}) {
  try {
    if (!fichaAtiva(cfg) || String(contato || '').replace(/\D/g, '').length < 10) return;
    await new Promise(r => setTimeout(r, 450));
    if (!_demo) _fichas = await getFichas();
    const c = { nome, contato };
    if (_situacao(c).resp) return;   // já respondeu: nada a perguntar
    const ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'fi-oferta-ov';
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">📋 Enviar a ficha pra ${_esc(_primeiro(nome))} preencher?</div>
      <div class="fi-secao-sub" style="margin-top:0">${_esc(_primeiro(nome))} responde pelo celular antes da sessão (uns 5 minutos) e as respostas aparecem no perfil, em 👥 Clientes.</div>
      <div class="ag-fbtns">
        <button class="btn-secondary" id="fi-oferta-nao" type="button">Agora não</button>
        <button class="btn-primary" id="fi-oferta-sim" type="button">📤 Enviar pelo WhatsApp</button>
      </div>
    </div></div>`;
    document.body.appendChild(ov);
    const close = trapModalBack(() => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#fi-oferta-nao').onclick = () => close();
    ov.querySelector('#fi-oferta-sim').onclick = async () => {
      // abre a janela JÁ no clique (senão o navegador bloqueia depois do await)
      const w = window.open('', '_blank');
      try {
        const f = await _fichaDoClienteOuNova(cfg, c);
        const msg = `Oi ${_primeiro(nome)}! Pra eu preparar a sua sessão do seu jeito, responde essa fichinha (leva uns 5 minutos): ${_linkCliente(cfg, f)}`;
        const url = _waLink(contato, msg);
        if (w) w.location.href = url; else location.href = url;
        close();
      } catch (err) { try { w?.close(); } catch {} showToast('Erro: ' + err.message, 'error'); }
    };
  } catch { /* sem ficha/sem rede: não atrapalha o agendamento */ }
}

// === BLOCO 5: FICHA NO PERFIL DO CLIENTE ===
export function perfilFichaHtml(cfg, c) {
  if (!fichaAtiva(cfg)) return '';
  // Cada resposta é um registro (fase 1, 2, 3…): a mais recente em destaque, as anteriores embaixo.
  const st = _situacao(c);
  const { resps, resp } = st;
  return `<div class="fi-perfil">
    ${st.rasc ? `<div class="fi-perfil-rasc">✏️ Começou a preencher em ${_dataBr(st.rasc.rascunho_em)} e ainda não enviou. Dá pra continuar junto.</div>` : ''}
    ${resp
      ? `<button class="fi-perfil-ver${st.falta.length ? ' falta' : ''}${st.saude ? ' saude' : ''}" data-fi-ver="${_esc(resp.id)}" type="button"><span>📋 Ver ficha${resps.length > 1 ? ` · fase ${resps.length}` : ''}</span><small>respondida em ${_dataBr(resp.respondida_em)} · ${st.falta.length ? '⚠️ ' + _txtFalta(st) : '✅ completa'}</small></button>
        ${_fraseFalta(c, st)}
        ${resps.length > 1 ? `<div class="fi-fases">${resps.slice(0, -1).reverse().map(f => `<button class="fi-fase" data-fi-ver="${_esc(f.id)}" type="button">Fase ${resps.indexOf(f) + 1} · ${_dataBr(f.respondida_em)} ›</button>`).join('')}</div>` : ''}`
      : `<div class="fi-perfil-vazia">📋 Ficha ainda não respondida</div>`}
    <div class="fi-perfil-acoes">
      ${!resp && c.contato ? `<button class="fi-btn" id="fi-enviar" type="button">📤 Enviar ficha pelo WhatsApp</button>` : ''}
      ${!resp ? `<button class="fi-btn" id="fi-junto" type="button">✍️ ${st.rasc ? 'Continuar junto agora' : 'Preencher junto agora'}</button>` : ''}
    </div>
    ${sessoesPerfilHtml(c)}
  </div>`;
}

// Link do cliente: reaproveita o código de uma ficha dele; senão cria o convite.
async function _fichaDoClienteOuNova(cfg, c) {
  const fs = _fichasDoCliente(c);
  const comCodigo = fs.find(f => !f.respondida_em) || fs[0];
  if (comCodigo) return comCodigo;
  const f = await criarConviteFicha({ nome: c.nome, contato: c.contato, modelo: _cfgFicha(cfg).profissao });
  _fichas.unshift(f);
  return f;
}

export function wirePerfilFicha(ov, cfg, c, { clientes, redesenhar } = {}) {
  if (!fichaAtiva(cfg)) return;
  // redesenha só o pedaço da ficha dentro do perfil (o popup continua aberto)
  const atualizar = () => {
    const box = ov.querySelector('.fi-perfil'); if (!box) return;
    box.outerHTML = perfilFichaHtml(cfg, c);
    wirePerfilFicha(ov, cfg, c, { clientes, redesenhar });
    redesenhar?.();
  };
  wireSessoesPerfil(ov, c, atualizar);
  ov.querySelectorAll('.fi-perfil [data-fi-ver]').forEach(b => b.addEventListener('click', () => {
    const f = _fichas.find(x => x.id === b.dataset.fiVer);
    if (f) abrirFicha(f, { cfg, clientes, redesenhar: atualizar, cliente: c });
  }));
  ov.querySelector('#fi-enviar')?.addEventListener('click', async e => {
    if (_demo) { showToast('Na demonstração não envia nada 🙂', 'info'); return; }
    const btn = e.currentTarget; btn.disabled = true;
    // abre a janela JÁ no clique (senão o navegador bloqueia o pop-up depois do await)
    const w = window.open('', '_blank');
    try {
      const f = await _fichaDoClienteOuNova(cfg, c);
      const msg = `Oi ${_primeiro(c.nome)}! Pra eu preparar a sua sessão do seu jeito, responde essa fichinha (leva uns 5 minutos): ${_linkCliente(cfg, f)}`;
      const url = _waLink(c.contato, msg);
      if (w) w.location.href = url; else location.href = url;
    } catch (err) { try { w?.close(); } catch {} showToast('Erro: ' + err.message, 'error'); }
    finally { btn.disabled = false; }
  });
  ov.querySelector('#fi-junto')?.addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await _abrirJunto(cfg, c, atualizar); }
    catch (err) { showToast('Erro: ' + err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

// === BLOCO 6: VER A FICHA RESPONDIDA ===
function _valorTxt(p, r) {
  const v = r[p.id];
  if (v == null || v === '') return '';
  if (p.tipo === 'escala') return `${v} de 10`;
  if (p.tipo === 'data') { const [y, m, d] = String(v).split('-'); return d ? `${d}/${m}/${y}` : v; }
  let t = Array.isArray(v) ? v.join(' · ') : String(v);
  if (r[p.id + '_outro']) t = t.replace('Outro', 'Outro: ' + r[p.id + '_outro']);
  return t;
}
function _mapaSvg(lista, mapa, vista) {
  const ladoEsq = vista === 'frente' ? '_d' : '_e', ladoDir = vista === 'frente' ? '_e' : '_d';
  let out = '';
  for (const r of lista) {
    for (const [suf, esp] of (r.par ? [[ladoEsq, false], [ladoDir, true]] : [['', false]])) {
      const m = mapa[r.id + suf];
      let fill = '';
      if (temMarca(m)) {
        const t = (m.dor || 0) >= (m.inchaco || 0) ? 'dor' : 'inchaco';
        fill = ` style="fill:color-mix(in srgb, ${t === 'dor' ? '#ef4444' : '#3e9bff'} ${[0, 40, 65, 92][m[t]]}%, transparent)"`;
      }
      out += `<path class="fi-r" d="${r.d}"${esp ? ' transform="translate(240,0) scale(-1,1)"' : ''}${fill}/>`;
    }
  }
  return `<svg class="fi-mapa-svg" viewBox="0 0 240 500">${out}</svg>`;
}

export function abrirFicha(f, { cfg, clientes = [], redesenhar, cliente } = {}) {
  const modelo = MODELOS[f.modelo] || MODELOS.massoterapia;
  const r = f.respostas || {};
  const mapa = f.mapa || {};
  const marcas = Object.keys(mapa).filter(k => temMarca(mapa[k]));
  const semCliente = !cliente && !clientes.some(c => c.contato && mesmoNumero(f.cliente_digitos || f.cliente_contato, c.contato));
  const falta = faltando(modelo, r, mapa);
  const blocos = modelo.blocos.map((b, bi) => {
    const linhas = b.perguntas.filter(p => !['aviso', 'mapa'].includes(p.tipo) && !p.ident).map(p => {
      const t = _valorTxt(p, r);
      return t ? `<div class="fi-qa"><div class="fi-q">${_esc(p.q)}</div><div class="fi-a">${_esc(t)}</div></div>` : '';
    }).join('');
    const ehSaude = b.nome === 'Saúde e segurança';
    const alerta = ehSaude && ((r.saude || []).some(x => x !== 'Nenhuma dessas') || r.alergia === 'Sim' || r.remedio === 'Sim');
    const temMapa = b.perguntas.some(p => p.tipo === 'mapa');
    const mapaHtml = temMapa ? `<div class="fi-q" style="margin-bottom:6px">Onde o corpo pede atenção</div>
      <div class="fi-mapa">${_mapaSvg(FRENTE, mapa, 'frente')}${_mapaSvg(COSTAS, mapa, 'costas')}</div>
      <div class="fi-mapa-leg"><span>Frente</span><span>Costas</span></div>
      ${marcas.length ? marcas.map(k => { const m = mapa[k]; return `<div class="fi-marca">
        <span>${_esc(nomeDa(k))}${ladoDa(k) ? ` <small>(${ladoDa(k)})</small>` : ''}${m.dor > 0 && (m.quando || []).length ? `<br><small>${_esc(m.quando.join(' · ').toLowerCase())}</small>` : ''}</span>
        <span class="fi-marca-tags">${TIPOS_MARCA.filter(t => m[t.k] > 0).map(t => `<span class="fi-tag ${t.k}">${t.nome.split(' ')[0]} ${NIVEIS[m[t.k]].toLowerCase()}</span>`).join('')}</span></div>`; }).join('')
        : '<div class="fi-vazio">Nada marcado no mapa.</div>'}` : '';
    if (!linhas && !mapaHtml) return '';
    return `<div class="fi-bloco${alerta ? ' alerta' : ''}"><div class="fi-bloco-tit">${bi + 1}. ${_esc(b.nome)}${alerta ? ' · ⚠️ atenção' : ''}</div>${mapaHtml}${linhas || (temMapa ? '' : '<div class="fi-vazio">Pulou essa parte.</div>')}</div>`;
  }).join('');

  const ov = document.createElement('div');
  ov.className = 'modal-overlay fi-ver-ov'; ov.id = 'fi-ver-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" id="fi-ver-back" type="button" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg></button>
      <div class="ag-title">📋 Ficha de ${_esc(_primeiro(f.cliente_nome) || 'cliente')}</div>
    </div>
    <div class="ag-scroll">
      <div class="fi-cab"><b>${_esc(f.cliente_nome || '')}</b><small>${_esc(f.cliente_contato || '')}${f.respondida_em ? ' · respondida em ' + _dataBr(f.respondida_em) : ''}</small></div>
      ${cfg ? `<button class="fi-btn fi-editar" id="fi-editar" type="button">✏️ Editar ficha${falta.length ? ' e completar o que falta' : ''}</button>` : ''}
      ${semCliente && clientes.length ? `<label class="input-field"><div class="input-field-label">Ligar a um cliente da Agenda</div>
        <select id="fi-ligar"><option value="">— é um cliente novo —</option>
          ${clientes.map(c => `<option value="${_esc(c.key)}">${_esc(c.nome)}${c.contato ? ' · ' + _esc(c.contato) : ''}</option>`).join('')}
        </select></label>` : ''}
      ${falta.length ? `<div class="fi-falta${falta.some(x => x.saude) ? ' saude' : ''}">
        <div class="fi-falta-tit">⚠️ Ficou em branco (${falta.length})</div>
        ${[...new Set(falta.map(x => x.bloco))].map(bl => `<div class="fi-falta-bl">${_esc(bl)}</div>
          ${falta.filter(x => x.bloco === bl).map(x => `<div class="fi-falta-q">• ${_esc(x.q)}</div>`).join('')}`).join('')}
      </div>` : '<div class="fi-completa">✅ Ficha completa: todas as perguntas respondidas.</div>'}
      ${blocos}
      <button class="fi-excluir" id="fi-excluir" type="button">🗑 Apagar essa ficha</button>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.querySelector('#fi-ver-back').onclick = () => history.back();
  ov.querySelector('#fi-ligar')?.addEventListener('change', async e => {
    const c = clientes.find(x => x.key === e.target.value); if (!c) return;
    try {
      await ligarFichaCliente(f.id, { nome: c.nome, contato: c.contato });
      Object.assign(f, { cliente_nome: c.nome, cliente_contato: c.contato, cliente_digitos: String(c.contato || '').replace(/\D/g, '') });
      showToast(`✅ Ficha ligada a ${_primeiro(c.nome)}`, 'success'); close(); redesenhar?.();
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
  });
  ov.querySelector('#fi-editar')?.addEventListener('click', async () => {
    const c = cliente || { nome: f.cliente_nome, contato: f.cliente_contato };
    // abre por cima; ao terminar, fecha esta ficha (ficou velha) e atualiza o perfil
    try { await _abrirJunto(cfg, c, () => { if (ov.isConnected) close(); redesenhar?.(); }); }
    catch (err) { showToast('Erro: ' + err.message, 'error'); }
  });
  ov.querySelector('#fi-excluir').onclick = async () => {
    if (_demo) { showToast('Na demonstração não apaga nada 🙂', 'info'); return; }
    const ok = await confirmModal({ title: 'Apagar ficha?', message: 'As respostas dessa ficha somem pra sempre.', confirmText: 'Apagar', danger: true });
    if (!ok) return;
    try { await excluirFicha(f.id); _fichas = _fichas.filter(x => x.id !== f.id); close(); redesenhar?.(); showToast('Ficha apagada', 'info'); }
    catch (err) { showToast('Erro: ' + err.message, 'error'); }
  };
}
