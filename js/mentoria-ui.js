// ─── ÍNDICE ──────────────────────────────────────────────────
// Ferramentas → 💸 Fontes de renda extra → 🎓 MENTORIA (lado da dona).
//   BLOCO 1: Fontes de renda extra (hub)       BLOCO 2: abrir a Mentoria
//   BLOCO 3: etapas e mensagens sugeridas      BLOCO 4: tela (retráteis)
//   BLOCO 5: 🤝 Colegas · 📝 Inscritas            BLOCO 6: 🎓 Alunas
//   BLOCO 7: 📊 O que elas responderam          BLOCO 8: 💬 Conversa · 📣 Grupo · 🔗 Formulários
//   BLOCO 9: ações (salvar, WhatsApp, copiar, adicionar, apagar)
// Veio do castelo (/castelo/selecao/painel + /castelo/vendas): mesma lógica de etapas,
// mensagens prontas e roteiro, agora no Falcon. Dados: js/mentoria.js · SQL: sql/mentoria.sql
// ─────────────────────────────────────────────────────────────
import { getLeads, salvarLead, criarLeadManual, apagarLead, carregarModelo, digitosDe, resumoPermuta } from './mentoria.js';
import { getAgendaConfig } from './agenda.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { abrirRelatorio, textoResumo } from './mentoria-relatorio.js?v=5';

const SVG_VOLTAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>';
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
const _brl = v => v == null ? '[valor]' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
const _wa = (contato, txt) => { const d = digitosDe(contato); return d ? `https://wa.me/55${d}${txt ? `?text=${encodeURIComponent(txt)}` : ''}` : null; };

const FORMAS = [['pix', 'Pix'], ['cartao', 'Cartão à vista'], ['parcelado', 'Cartão parcelado'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro']];
const _formaTxt = l => {
  const f = FORMAS.find(x => x[0] === l.pago_forma)?.[1] || '';
  return f + (l.pago_forma === 'parcelado' && l.pago_parcelas ? ` em ${l.pago_parcelas}x` : '');
};
let _leads = [], _M = null, _slug = '', _close = null;
let _blocos = { inscritas: true }, _filtro = 'todas', _busca = '', _aberto = null;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: FONTES DE RENDA EXTRA (hub)
// ═══════════════════════════════════════════════════════════════
// Agora cada pessoa monta as suas (js/renda-ui.js). A 🎓 Mentoria vira um card de lá.
export function abrirRendaExtra() {
  return import('./renda-ui.js').then(m => m.abrirFontesRenda());
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ABRIR A MENTORIA
// ═══════════════════════════════════════════════════════════════
export async function abrirMentoria() {
  _aberto = null;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'mentoria-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo mt-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  _close = trapModalBack(() => ov.remove());
  try {
    const cfg = await getAgendaConfig();
    _slug = cfg?.slug || '';
    [_leads, _M] = await Promise.all([getLeads(), carregarModelo(_slug)]);
  } catch (e) {
    const c = ov.querySelector('.ag-corpo');
    if (c) c.innerHTML = `<div class="ag-erro">Não deu pra carregar a mentoria.<br><small>${_esc(e.message)}</small><br><br><small>Se aparecer erro de tabela, falta rodar o SQL <b>mentoria.sql</b> no Supabase.</small></div>`;
    return;
  }
  desenhar();
}
const _corpo = () => document.querySelector('#mentoria-ov .mt-corpo');

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ETAPAS E MENSAGENS SUGERIDAS
// ═══════════════════════════════════════════════════════════════
const ETAPAS = {
  aluna: '🎓 Aluna', reservou: '⏳ Reservou, falta pagar', nao_agora: 'Não vai agora',
  selecionada: '⭐ Selecionada', inscrita: '📝 Inscrita na seleção', pesquisa: '📊 Respondeu a pesquisa', manual: '➕ Adicionada por você',
};
function etapa(l) {
  if (l.pago_em) return 'aluna';
  if (l.nao_agora) return 'nao_agora';
  if (l.reservou_em) return 'reservou';
  if (l.selecionada) return 'selecionada';
  if (l.formularios?.selecao) return 'inscrita';
  if (l.formularios?.pesquisa) return 'pesquisa';
  return 'manual';
}
const _temContato = l => digitosDe(l.contato || l.digitos).length >= 10;
// Colega = respondeu a pesquisa. Inscrita = entrou no funil da aula/mentoria
// (seleção, reserva, selecionada, pagou ou adicionada à mão). Colega que se inscreve aparece nos dois.
const ehColega = l => !!l.formularios?.pesquisa;
const ehInscrita = l => !!(l.formularios?.selecao || l.reservou_em || l.pago_em || l.selecionada || l.nao_agora
  || ['manual', 'reserva', 'castelo'].includes(l.origem));
// Mensagens do caminho de venda só fazem sentido pra quem entrou na seleção/aula ou reservou
const _noCaminho = e => ['selecionada', 'reservou', 'aluna'].includes(e);

function sugerida(l, e) {
  const f = l.followup || {};
  if (e === 'aluna') return f.boas_vindas ? null : 'boas_vindas';
  if (e === 'reservou') return f.abandono ? null : 'abandono';
  if (e !== 'selecionada') return null;
  if (l.compareceu === false && !f.d0_ausente) return 'd0_ausente';
  if (l.compareceu === true && !f.d0_presente) return 'd0_presente';
  for (const k of ['conversa', 'prazo', 'ultimo_dia', 'despedida']) if (!f[k]) return k;
  return null;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function _prazoTxt() {
  const p = _M?.oferta?.prazo; if (!p) return '[prazo]';
  const d = new Date(p), z = n => String(n).padStart(2, '0');
  return `${DIAS[d.getDay()]} (${z(d.getDate())}/${z(d.getMonth() + 1)}) às ${z(d.getHours())}h${z(d.getMinutes())}`;
}
function _varsGerais() {
  const o = _M?.oferta || {}, pagas = _leads.filter(l => l.pago_em).length;
  return { link: o.link || '', encontros: o.encontros || '', prazo: _prazoTxt(), preco: _brl(o.precoHoje), parcela: _brl(o.valorParcela),
    parcelas: o.parcelas || '', vagas: o.vagas ? o.vagas - (pagas % o.vagas) : '' };
}
function _varsPessoa(l) {
  return { ..._varsGerais(), ...(_M?.varsPessoa ? _M.varsPessoa(l) : {}), nome: String(l.nome || '').trim().split(/\s+/)[0] };
}
// Preenche {variáveis}; [[trecho]] some se alguma variável dele estiver vazia.
function _preencher(txt, v) {
  const val = k => (v[k] == null ? '' : String(v[k]).trim());
  txt = txt.replace(/\[\[([\s\S]*?)\]\]/g, (_, t) => [...t.matchAll(/\{(\w+)\}/g)].every(m => val(m[1])) ? t : '');
  return txt.replace(/\{(\w+)\}/g, (_, k) => val(k) || `[${k}]`);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: TELA (retráteis)
// ═══════════════════════════════════════════════════════════════
function _bloco(id, titulo, qtd, conteudo) {
  const ab = !!_blocos[id];
  return `<section class="ag-bloco${ab ? ' aberto' : ''}" data-bloco="${id}">
    <button class="ag-bloco-tit" type="button" aria-expanded="${ab}"><span>${titulo}${qtd != null ? ` <span class="mt-qtd">${qtd}</span>` : ''}</span><span class="ag-bloco-seta">${ab ? '▴' : '▾'}</span></button>
    <div class="ag-bloco-corpo"${ab ? '' : ' hidden'}>${ab ? conteudo() : ''}</div>
  </section>`;
}

function desenhar() {
  const corpo = _corpo(); if (!corpo) return;
  const pessoas = _leads.filter(l => _temContato(l) && ehInscrita(l));
  const colegas = _leads.filter(l => _temContato(l) && ehColega(l));
  const alunas = _leads.filter(l => l.pago_em);
  const nResp = _leads.filter(l => l.formularios && Object.keys(l.formularios).length).length;
  const n = e => pessoas.filter(l => etapa(l) === e).length;
  const scroll = corpo.querySelector('.ag-scroll')?.scrollTop || 0;
  corpo.innerHTML = `
    <div class="ag-header">
      <button class="fr-voltar" data-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
      <div class="ag-title">🎓 Mentoria${_M?.oferta?.nome ? ` · ${_esc(_M.oferta.nome)}` : ''}</div>
    </div>
    <div class="ag-scroll">
      <div class="mt-stats">
        <div><b>${colegas.length}</b><small>Colegas</small></div>
        <div><b>${pessoas.length}</b><small>Inscritas</small></div>
        <div><b>${n('selecionada') + n('reservou') + n('aluna')}</b><small>Selecionadas</small></div>
        <div><b>${alunas.length}</b><small>Alunas</small></div>
      </div>
      ${!_M ? `<div class="fi-bloco alerta"><div class="fi-bloco-tit">Formulários ainda não configurados</div><div class="fi-secao-sub" style="margin:0">Sua lista de inscritas e alunas já funciona. Os formulários e as mensagens prontas são montados sob medida pra você: fale com o suporte do Falcon.</div></div>` : ''}
      ${_M?.pesquisa || colegas.length ? _bloco('colegas', '🤝 Colegas (pesquisa)', colegas.length, () => _colegas(colegas)) : ''}
      ${_bloco('inscritas', '📝 Inscritas', pessoas.length, () => _inscritas(pessoas))}
      ${_bloco('alunas', '🎓 Alunas', alunas.length, () => _alunas(alunas))}
      ${_bloco('respostas', '📊 O que elas responderam', nResp, _respostas)}
      ${_M?.roteiro ? _bloco('conversa', '💬 Conversa e objeções', null, _conversa) : ''}
      ${_M?.grupo ? _bloco('grupo', '📣 Grupo de WhatsApp', null, _grupo) : ''}
      ${_bloco('links', '🔗 Formulários e links', null, _links)}
    </div>`;
  corpo.querySelector('.ag-scroll').scrollTop = scroll;
  ligar(corpo);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: 📝 INSCRITAS
// ═══════════════════════════════════════════════════════════════
const FILTROS = [
  ['todas', 'Todas', () => true],
  ['selecao', 'Seleção', l => !!l.formularios?.selecao],
  ['selecionadas', 'Selecionadas', l => ['selecionada', 'reservou', 'aluna'].includes(etapa(l))],
  ['reservou', 'Falta pagar', l => etapa(l) === 'reservou'],
  ['nao_agora', 'Não agora', l => etapa(l) === 'nao_agora'],
];

function _inscritas(pessoas) {
  const filt = FILTROS.find(f => f[0] === _filtro) || FILTROS[0];
  const q = _busca.trim().toLowerCase();
  const lista = pessoas.filter(filt[2]).filter(l => !q || `${l.nome} ${l.instagram} ${l.contato}`.toLowerCase().includes(q));
  return `
    <div class="mt-chips">${FILTROS.map(([k, t, fn]) => `<button class="mt-chip${_filtro === k ? ' on' : ''}" data-filtro="${k}" type="button">${t} <small>${pessoas.filter(fn).length}</small></button>`).join('')}</div>
    <input class="input-field mt-busca" id="mt-busca" type="search" placeholder="Buscar por nome, @ ou WhatsApp" value="${_esc(_busca)}">
    <div class="mt-lista">${lista.length ? lista.map(l => _cardPessoa(l, 'insc')).join('') : '<div class="ag-vazio">Ninguém aqui por enquanto.</div>'}</div>
    <button class="btn-secondary mt-add" id="mt-add" type="button">➕ Adicionar pessoa (quem comentou e não preencheu)</button>`;
}

function _cardPessoa(l, onde) {
  const e = etapa(l), chave = `${onde}:${l.id}`, ab = _aberto === chave, forms = l.formularios || {};
  const colega = onde === 'col';
  const selo = colega ? (ehInscrita(l) ? '<span class="mt-selo selecionada">📝 Também se inscreveu</span>' : '')
                      : `<span class="mt-selo ${e}">${ETAPAS[e]}</span>`;
  const sub = colega ? [forms.pesquisa?.tempo_atende, forms.pesquisa?.mais_incomoda && `mais incomoda: ${forms.pesquisa.mais_incomoda}`, _data(forms.pesquisa?._em || l.created_at)]
                     : [ehColega(l) ? '🤝 colega' : '', forms.selecao ? '📝 seleção' : '', l.instagram ? _esc(l.instagram) : '', _data(l.created_at)];
  return `<article class="mt-pessoa${ab ? ' aberta' : ''}" data-id="${l.id}">
    <button class="mt-pessoa-cab" data-abrir="${chave}" type="button">
      <span class="mt-pessoa-nome">${_esc(l.nome || 'Sem nome')}</span>
      ${selo}
      <span class="mt-pessoa-sub">${sub.filter(Boolean).map(x => _esc(x)).join(' · ')}</span>
    </button>
    ${ab ? (colega ? _detalheColega(l) : _detalhe(l, e)) : ''}
  </article>`;
}

// Colega: sem etapa nem mensagem de venda (não está no funil) — só contato, respostas e anotações
function _detalheColega(l) {
  const zap = _wa(l.contato || l.digitos);
  return `<div class="mt-det">
    <div class="mt-acoes">${zap ? `<a class="btn-secondary mt-zap" href="${zap}" target="_blank" rel="noopener">💬 WhatsApp ${_esc(l.contato || '')}</a>` : ''}</div>
    ${_respostasDe(l, 'pesquisa', true)}
    <div class="mt-sub">Anotações</div>
    <textarea class="input-field mt-notas" data-notas rows="3" placeholder="Só pra você: o que conversaram, se ela pode virar aluna…">${_esc(l.notas || '')}</textarea>
    <button class="mt-apagar" data-acao="apagar" type="button">Apagar pessoa</button>
  </div>`;
}

function _colegas(colegas) {
  const q = _busca.trim().toLowerCase();
  const lista = colegas.filter(l => !q || `${l.nome} ${l.contato}`.toLowerCase().includes(q));
  return `<div class="fi-secao-sub" style="margin-top:0">Quem respondeu a pesquisa entre colegas. Não entra no funil de venda: é daqui que vem a dor real pra grande tese.</div>
    <div class="mt-lista">${lista.length ? lista.map(l => _cardPessoa(l, 'col')).join('') : '<div class="ag-vazio">Nenhuma colega respondeu ainda. O link está em 🔗 Formulários e links.</div>'}</div>`;
}

function _detalhe(l, e) {
  const f = l.followup || {}, sug = _noCaminho(e) ? sugerida(l, e) : null, msgs = _M?.mensagens || [];
  return `<div class="mt-det">
    <div class="mt-acoes">
      ${_wa(l.contato || l.digitos) ? `<a class="btn-secondary mt-zap" href="${_wa(l.contato || l.digitos)}" target="_blank" rel="noopener">💬 WhatsApp ${_esc(l.contato || '')}</a>` : ''}
    </div>
    <div class="mt-linha"><span class="mt-rot">Seleção</span>
      <button class="mt-mini${l.selecionada ? ' on' : ''}" data-acao="selecionar" type="button">${l.selecionada ? '⭐ Selecionada' : 'Selecionar'}</button></div>
    ${_noCaminho(e) ? `<div class="mt-linha"><span class="mt-rot">Aula</span>
      <button class="mt-mini${l.compareceu === true ? ' on' : ''}" data-acao="foi" type="button">Foi</button>
      <button class="mt-mini${l.compareceu === false ? ' on' : ''}" data-acao="naofoi" type="button">Não foi</button></div>` : ''}
    <div class="mt-linha"><span class="mt-rot">Situação</span>
      ${e !== 'aluna' ? '<button class="mt-mini" data-acao="pagou" type="button">✅ Pagou (virou aluna)</button>' : '<button class="mt-mini" data-acao="desfazer" type="button">Desfazer pago</button>'}
      ${e !== 'aluna' && !l.reservou_em ? '<button class="mt-mini" data-acao="reservou" type="button">⏳ Reservou</button>' : ''}
      ${e !== 'nao_agora' && e !== 'aluna' ? '<button class="mt-mini" data-acao="naoagora" type="button">Não vai agora</button>' : ''}
      ${e === 'nao_agora' ? '<button class="mt-mini" data-acao="reabrir" type="button">Reabrir</button>' : ''}</div>
    ${l.reservou_em ? `<div class="mt-nota">Reservou ${l.reserva_forma === 'pix' ? 'no Pix' : l.reserva_forma === 'cartao' ? 'no cartão' : ''} em ${_data(l.reservou_em)}</div>` : ''}
    ${_noCaminho(e) && msgs.length ? `<div class="mt-sub">Mensagens prontas <small>toque: abre o WhatsApp já escrito e marca como enviada</small></div>
      <div class="mt-msgs">${msgs.filter(m => m.k !== 'd0_presente' || l.compareceu !== false).filter(m => m.k !== 'd0_ausente' || l.compareceu !== true).map(m => `
        <button class="mt-msg${m.k === sug ? ' sug' : ''}${f[m.k] ? ' feito' : ''}" data-msg="${m.k}" type="button">${f[m.k] ? '✓ ' : ''}${_esc(m.rot)}<small>${f[m.k] ? 'enviada em ' + _data(f[m.k]) : _esc(m.quando)}</small></button>`).join('')}</div>` : ''}
    ${['selecao', 'pesquisa'].filter(k => forms_(l)[k]).map(k => _respostasDe(l, k)).join('')}
    <div class="mt-sub">Anotações</div>
    <textarea class="input-field mt-notas" data-notas rows="3" placeholder="Só pra você: o que conversaram, próximos passos…">${_esc(l.notas || '')}</textarea>
    <button class="mt-apagar" data-acao="apagar" type="button">Apagar pessoa</button>
  </div>`;
}
const forms_ = l => l.formularios || {};

// Respostas de UM formulário da pessoa, com o texto da pergunta
function _respostasDe(l, form, aberta) {
  const r = forms_(l)[form] || {}, ps = _M?.[form]?.perguntas || [];
  const pular = new Set(['nome', 'whatsapp', 'instagram', '_contato']);
  const itens = (ps.length ? ps.map(p => [p.id, p.q]) : Object.keys(r).map(k => [k, k]))
    .filter(([k]) => !pular.has(k) && !k.startsWith('_') && r[k] != null && String(r[k]).trim() !== '');
  return `<details class="mt-resp"${form === 'selecao' || aberta ? ' open' : ''}><summary>${form === 'selecao' ? '📝 Respostas da seleção' : '📊 Respostas da pesquisa'}${r._em ? ` <small>${_data(r._em)}</small>` : ''}</summary>
    <dl>${itens.map(([k, q]) => `<dt>${_esc(q)}</dt><dd>${_esc(Array.isArray(r[k]) ? r[k].join(' · ') : r[k])}</dd>`).join('')}</dl></details>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: 🎓 ALUNAS (turma, pagamento e presença por aula)
// ═══════════════════════════════════════════════════════════════
function _alunas(alunas) {
  if (!alunas.length) return '<div class="ag-vazio">Quando alguém pagar, marque “✅ Pagou” em Inscritas e ela aparece aqui.</div>';
  const vagas = _M?.oferta?.vagas || 0, aulas = _M?.oferta?.aulas || [];
  const ordem = [...alunas].sort((a, b) => (a.pago_em < b.pago_em ? -1 : 1));
  const turmaDe = l => l.turma || (vagas ? Math.floor(ordem.indexOf(l) / vagas) + 1 : 1);
  const turmas = [...new Set(ordem.map(turmaDe))].sort((a, b) => a - b);
  return turmas.map(t => `
    <div class="mt-sub">Turma ${t} <small>${ordem.filter(l => turmaDe(l) === t).length}${vagas ? ` de ${vagas}` : ''} vagas</small></div>
    ${ordem.filter(l => turmaDe(l) === t).map(l => `
      <div class="mt-aluna" data-id="${l.id}">
        <div class="mt-aluna-top"><b>${_esc(l.nome || 'Sem nome')}</b>
          ${_wa(l.contato || l.digitos) ? `<a class="mt-zap-mini" href="${_wa(l.contato || l.digitos)}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}</div>
        <div class="mt-pessoa-sub">Pagou em ${_data(l.pago_em)}${l.pago_valor != null ? ` · <b>${_brl(Number(l.pago_valor))}</b>` : ''}${l.pago_forma ? ` · ${_esc(_formaTxt(l))}` : ''}
          ${l.permuta ? '' : `<button class="mt-link-mini" data-pagto type="button">${l.pago_valor != null ? 'Editar pagamento' : 'Lançar valor'}</button>`}
          ${l.permuta ? '' : '<button class="mt-link-mini" data-perm-ed type="button">🔁 Paga em permuta</button>'}
          <button class="mt-link-mini" data-relat type="button">📄 Gerar relatório</button>
          <button class="mt-link-mini" data-rel-zap type="button">📤 Mandar relatório</button>
          <button class="mt-link-mini" data-wpp-ed type="button">${_temContato(l) ? '📱 Trocar WhatsApp' : '📱 Salvar WhatsApp'}</button></div>
        ${_permutaHtml(l)}
        ${aulas.length ? `<div class="mt-presenca">${aulas.map((a, i) => `<button class="mt-aula${l.presenca?.[i + 1] ? ' on' : ''}" data-aula="${i + 1}" type="button" title="${_esc(a)}">${l.presenca?.[i + 1] ? '✓' : ''} Aula ${i + 1}</button>`).join('')}</div>` : ''}
      </div>`).join('')}`).join('');
}

// Permuta (27/11): aluna que paga em serviço. Barra do quanto já pagou, botões do dia e histórico.
const _hoje = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const _plural = (w, n) => n === 1 ? w : /m$/.test(w) ? w.slice(0, -1) + 'ns' : /[rsz]$/.test(w) ? w + 'es' : w + 's';
const _dBR = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}` : ''; };
function _permutaHtml(l) {
  const r = resumoPermuta(l.permuta);
  if (!r) return '';
  const itens = (l.permuta.itens || []).filter(i => i.t === 'feita' || i.t === 'repos').slice().sort((a, b) => (a.d < b.d ? 1 : -1));
  const serv = _esc(r.servico.toLowerCase());
  const hojeN = itens.filter(i => i.d === _hoje()).length;
  const situacao = r.quitada ? '✅ Quitada' : r.esperadas == null ? '' : r.atrasadas ? `<b class="mt-perm-atraso">⚠️ ${r.atrasadas} atrasada${r.atrasadas === 1 ? '' : 's'}</b>` : r.adiantadas ? `✓ Em dia (${r.adiantadas} adiantada${r.adiantadas === 1 ? '' : 's'})` : '✓ Em dia';
  return `<div class="mt-perm">
    <div class="mt-perm-top"><span>🔁 Permuta · ${_esc(r.servico)} a ${_brl(r.unit)}</span><button class="mt-link-mini" data-perm-ed type="button">Editar</button></div>
    <div class="mt-perm-barra"><i style="width:${r.pct}%"></i></div>
    <div class="mt-perm-num"><b>${r.feitas} de ${r.precisa} ${_plural(serv, 2)}</b><span>${_brl(r.pago)} de ${_brl(r.total)}</span></div>
    <div class="mt-perm-sub">${situacao}${r.quitada ? '' : `${situacao ? ' · ' : ''}faltam ${_brl(r.falta)} (${r.restam} ${_plural(serv, r.restam)})`}</div>
    ${r.quitada ? '' : `<div class="mt-perm-acoes"><button class="mt-mini on" data-perm="feita" type="button">＋ ${_esc(r.servico)} feita hoje</button>${hojeN ? `<span class="mt-perm-sub">Hoje: ${hojeN}</span>` : ''}</div>`}
    ${itens.length ? `<details class="mt-resp"><summary>Histórico <small>${itens.length}</small></summary>${itens.map((i, k) => `
      <div class="mt-perm-item"><span>${_dBR(i.d)}</span><span>✓ ${serv}</span><button class="mt-perm-x" data-perm-x="${i.d}" type="button" aria-label="Tirar">✕</button></div>`).join('')}</details>` : ''}
  </div>`;
}

async function _marcarPermuta(l, t = 'feita', dia = _hoje()) {
  const p = { ...(l.permuta || {}), itens: [...(l.permuta?.itens || []), { d: dia, t: 'feita' }] };
  await _salvarPermuta(l, p, `${p.servico || 'Massagem'} marcada ✓`);
}
async function _salvarPermuta(l, p, msg) {
  try { await salvarLead(l.id, { permuta: p }); l.permuta = p; desenhar(); if (msg) showToast(msg, 'success'); }
  catch (e) { showToast(/permuta|column/i.test(e.message) ? 'Falta rodar o SQL da permuta (sql/mentoria-permuta.sql)' : 'Não consegui salvar: ' + e.message, 'error'); }
}

function _modalPermuta(l) {
  if (!l) return;
  const p = l.permuta || {};
  const z = n => String(n).padStart(2, '0'), pd = l.pago_em ? new Date(l.pago_em) : new Date();
  const inicio = p.inicio || `${pd.getFullYear()}-${z(pd.getMonth() + 1)}-${z(pd.getDate())}`;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal mt-perm-modal"><div class="modal-title">🔁 Permuta de ${_esc((l.nome || 'aluna').split(' ')[0])}</div>
    <div class="fi-secao-sub">Ela paga a mentoria em serviço. Cada um que ela faz é um pagamento: tu marca e o saldo baixa. O atraso o app conta sozinho.</div>
    <label class="mt-rot2" for="pm-t">Valor da mentoria (R$)</label>
    <input class="input-field" id="pm-t" type="number" inputmode="decimal" min="0" step="0.01" value="${_esc(p.total ?? '')}">
    <label class="mt-rot2" for="pm-s">Serviço que ela faz</label>
    <input class="input-field" id="pm-s" value="${_esc(p.servico || 'Massagem')}" maxlength="30">
    <label class="mt-rot2" for="pm-u">Quanto vale cada um (R$)</label>
    <input class="input-field" id="pm-u" type="number" inputmode="decimal" min="1" step="0.01" value="${_esc(p.unit ?? 170)}">
    <div class="obj-linha">
      <label class="obj-mini"><span class="mt-rot2">Começou em</span><input class="input-field" id="pm-i" type="date" value="${_esc(inicio)}"></label>
      <label class="obj-mini"><span class="mt-rot2">Por semana</span><input class="input-field" id="pm-w" type="number" inputmode="numeric" min="1" max="7" value="${_esc(p.porSemana ?? 1)}"></label>
    </div>
    <label class="mt-rot2" for="pm-a">Já feitos antes de marcar aqui</label>
    <input class="input-field" id="pm-a" type="number" inputmode="numeric" min="0" value="${_esc(p.anteriores ?? 0)}">
    <div class="modal-actions">${l.permuta ? '<button class="btn-secondary" data-tirar type="button" style="color:var(--red)">Tirar permuta</button>' : ''}<button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">Salvar</button></div></div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  const num = id => parseFloat(String(ov.querySelector(id).value).replace(',', '.'));
  ov.querySelector('[data-tirar]')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Tirar a permuta?', message: 'Some o controle e o histórico das vezes marcadas.', confirmText: 'Tirar', danger: true });
    if (!ok) return;
    history.back(); _salvarPermuta(l, null, 'Permuta tirada');
  });
  ov.querySelector('[data-ok]').onclick = async () => {
    const total = num('#pm-t'), unit = num('#pm-u');
    if (!(total > 0)) return showToast('Coloque o valor da mentoria', 'error');
    if (!(unit > 0)) return showToast('Coloque quanto vale cada serviço', 'error');
    const { faltasAntes, ...resto } = p;
    const novo = { ...resto, total: Math.round(total * 100) / 100, unit: Math.round(unit * 100) / 100,
      servico: ov.querySelector('#pm-s').value.trim() || 'Massagem',
      inicio: ov.querySelector('#pm-i').value || inicio, porSemana: Math.min(7, Math.max(1, parseInt(ov.querySelector('#pm-w').value, 10) || 1)),
      anteriores: Math.max(0, parseInt(ov.querySelector('#pm-a').value, 10) || 0),
      itens: (p.itens || []).filter(i => i.t === 'feita' || i.t === 'repos') };
    history.back(); _salvarPermuta(l, novo, 'Permuta salva 🔁');
  };
  setTimeout(() => ov.querySelector('#pm-t').focus(), 60);
  return fechar;
}

// WhatsApp da aluna (27/11): salvar/trocar o número, usado no 💬, no 📤 Mandar relatório e no Resumo
function _modalWhatsApp(l) {
  if (!l) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal mt-perm-modal"><div class="modal-title">📱 WhatsApp de ${_esc((l.nome || 'aluna').split(' ')[0])}</div>
    <input class="input-field" id="mw-n" inputmode="tel" maxlength="40" value="${_esc(l.contato || '')}" placeholder="(51) 99999-9999">
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">Salvar</button></div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  ov.querySelector('[data-ok]').onclick = async () => {
    const contato = ov.querySelector('#mw-n').value.trim(), digitos = digitosDe(contato);
    if (digitos.length < 10) return showToast('Confere o número com DDD', 'error');
    try { await salvarLead(l.id, { contato, digitos }); l.contato = contato; l.digitos = digitos; history.back(); desenhar(); showToast('WhatsApp salvo ✓', 'success'); }
    catch (e) { showToast('Não consegui salvar: ' + e.message, 'error'); }
  };
  setTimeout(() => ov.querySelector('#mw-n').focus(), 60);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: 📊 O QUE ELAS RESPONDERAM (pra achar a dor real e a grande tese)
// ═══════════════════════════════════════════════════════════════
function _respostas() {
  if (!_M) return '<div class="ag-vazio">Sem formulários configurados.</div>';
  const pular = new Set(['nome', 'whatsapp', 'instagram', 'cidade', '_contato']);
  return ['pesquisa', 'selecao'].map(form => {
    const ps = (_M[form]?.perguntas || []).filter(p => !pular.has(p.id));
    const quem = _leads.filter(l => l.formularios?.[form]);
    if (!ps.length) return '';
    return `<div class="mt-sub">${form === 'pesquisa' ? '📊 Pesquisa das colegas' : '📝 Seleção'} <small>${quem.length} ${quem.length === 1 ? 'resposta' : 'respostas'}</small></div>
      ${quem.length ? `<button class="btn-secondary mt-planilha" data-planilha="${form}" type="button">📗 Compartilhar planilha com as respostas</button>` : ''}
      ${!quem.length ? '<div class="ag-vazio">Ninguém respondeu ainda.</div>' : ps.map(p => {
        const vals = quem.map(l => ({ l, v: l.formularios[form][p.id] })).filter(x => x.v != null && String(x.v).trim() !== '');
        if (p.tipo === 'escolha' || p.tipo === 'varias') {
          const cont = {};
          vals.forEach(({ v }) => (Array.isArray(v) ? v : [v]).forEach(o => { cont[o] = (cont[o] || 0) + 1; }));
          const tot = vals.length || 1;
          const linhas = Object.entries(cont).sort((a, b) => b[1] - a[1]);
          return `<details class="mt-resp"><summary>${_esc(p.q)}</summary>${linhas.map(([o, c]) => `
            <div class="mt-barra"><span>${_esc(o)}</span><b>${c}</b><i style="width:${Math.round(c / tot * 100)}%"></i></div>`).join('') || '<div class="ag-vazio">Sem respostas.</div>'}</details>`;
        }
        return `<details class="mt-resp"><summary>${_esc(p.q)} <small>${vals.length}</small></summary>
          ${vals.map(({ l, v }) => `<blockquote class="mt-cit">“${_esc(v)}”<cite>${_esc(l.nome || 'Anônima')}</cite></blockquote>`).join('') || '<div class="ag-vazio">Sem respostas.</div>'}</details>`;
      }).join('')}`;
  }).join('');
}

// (26/11) Planilha (.xlsx) com TODAS as respostas do formulário: 1 linha por pessoa, 1 coluna por pergunta.
// SheetJS vem do cdnjs só quando toca no botão. Compartilha o arquivo (WhatsApp, e-mail…) ou baixa.
async function _xlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, erro) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => erro(new Error('Sem internet pra montar a planilha')); document.head.appendChild(s); });
  return window.XLSX;
}
async function _planilha(form, botao) {
  const txt0 = botao.textContent; botao.disabled = true; botao.textContent = 'Montando a planilha…';
  try {
    const X = await _xlsx();
    const pular = new Set(['nome', 'whatsapp', 'instagram', '_contato']);
    const ps = (_M?.[form]?.perguntas || []).filter(p => !pular.has(p.id) && p.tipo !== 'contato');
    const quem = _leads.filter(l => l.formularios?.[form])
      .sort((a, b) => String(a.formularios[form]._em || a.created_at).localeCompare(String(b.formularios[form]._em || b.created_at)));
    const val = v => Array.isArray(v) ? v.join(' · ') : (v ?? '');
    const linhas = [['Respondeu em', 'Nome', 'WhatsApp', 'Instagram', ...ps.map(p => p.q)],
      ...quem.map(l => { const r = l.formularios[form];
        return [_data(r._em || l.created_at), l.nome || '', l.contato || '', l.instagram || '', ...ps.map(p => val(r[p.id]))]; })];
    const ws = X.utils.aoa_to_sheet(linhas);
    ws['!cols'] = linhas[0].map((t, i) => ({ wch: i < 4 ? 18 : Math.min(60, Math.max(20, String(t).length)) }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, form === 'selecao' ? 'Seleção (alunas)' : 'Pesquisa (colegas)');
    const blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const hoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    const nome = `${form === 'selecao' ? 'selecao-alunas' : 'pesquisa-colegas'}-${hoje}.xlsx`;
    const file = new File([blob], nome, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: nome }); } catch {} }
    else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
  finally { botao.disabled = false; botao.textContent = txt0; }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 8: 💬 CONVERSA · 📣 GRUPO · 🔗 FORMULÁRIOS
// ═══════════════════════════════════════════════════════════════
const _geral = t => _preencher(t, { ..._varsGerais(), nome: '[NOME]' });
const _copia = (rot, txt, obs) => `<div class="mt-copia"><div class="mt-copia-rot">${_esc(rot)}</div><pre>${_esc(txt)}</pre>${obs ? `<div class="mt-nota">${_esc(obs)}</div>` : ''}<button class="btn-secondary" data-copiar="${encodeURIComponent(txt)}" type="button">Copiar</button></div>`;

function _conversa() {
  return `<div class="fi-secao-sub">Use na conversa no privado, na ordem. Troque o que estiver entre [colchetes] pelas palavras da pessoa.</div>
    <div class="mt-sub">Conversa (passo a passo)</div>${_M.roteiro.map(r => _copia(r.rot, _geral(r.txt), r.obs)).join('')}
    ${_M.objecoes ? `<div class="mt-sub">Objeções</div>${_M.objecoes.map(o => _copia(o.rot, _geral(o.txt), o.obs)).join('')}` : ''}`;
}
function _grupo() {
  return `<div class="fi-secao-sub">Mensagens do grupo de WhatsApp, do convite até o encerramento. Troque [DATA], [HORÁRIO] e [LINK].</div>
    ${_M.grupo.map(g => _copia(g.quando, _geral(g.txt))).join('')}`;
}
function _links() {
  const base = location.origin, itens = [];
  if (_M?.pesquisa) itens.push(['📊 Pesquisa das colegas', `${base}/pesquisa/${_slug}`, 'Pra quem ainda não sabe do curso: gera curiosidade e coleta as dores.']);
  if (_M?.selecao) itens.push(['📝 Seleção da aula exclusiva', `${base}/selecao/${_slug}`, 'Pra quem quer concorrer à vaga da aula.']);
  if (_M?.oferta?.link) itens.push(['💳 Página da mentoria', _M.oferta.link, 'A página de vendas com a oferta e a reserva da vaga.']);
  if (!itens.length) return '<div class="ag-vazio">Sem formulários configurados.</div>';
  return itens.map(([t, u, d]) => `<div class="mt-copia"><div class="mt-copia-rot">${t}</div><div class="fi-secao-sub" style="margin:2px 0 6px">${d}</div>
    <div class="mt-link">${_esc(u)}</div>
    <div class="mt-link-btns"><button class="btn-secondary" data-copiar="${encodeURIComponent(u)}" type="button">Copiar link</button>
      <a class="btn-secondary" href="${_esc(u)}" target="_blank" rel="noopener">Abrir</a>
      ${u.startsWith(base) ? `<a class="btn-secondary" href="${_esc(u)}?teste=1" target="_blank" rel="noopener">Testar</a>` : ''}</div></div>`).join('')
    + '<div class="fi-secao-sub">“Testar” abre o formulário sem gravar nada, pra você conferir antes de mandar.</div>';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 9: AÇÕES
// ═══════════════════════════════════════════════════════════════
async function _salvar(l, patch) {
  try { await salvarLead(l.id, patch); Object.assign(l, patch); desenhar(); }
  catch (e) { showToast('Não consegui salvar: ' + e.message, 'error'); }
}

function ligar(corpo) {
  corpo.querySelector('[data-voltar]').onclick = () => history.back();
  corpo.querySelectorAll('.ag-bloco-tit').forEach(b => b.onclick = () => {
    const id = b.closest('.ag-bloco').dataset.bloco; _blocos[id] = !_blocos[id]; desenhar();
  });
  corpo.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { _filtro = b.dataset.filtro; desenhar(); });
  const busca = corpo.querySelector('#mt-busca');
  if (busca) busca.oninput = () => {
    _busca = busca.value; const pos = busca.selectionStart; desenhar();
    const nb = _corpo()?.querySelector('#mt-busca'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); }
  };
  corpo.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => { _aberto = _aberto === b.dataset.abrir ? null : b.dataset.abrir; desenhar(); });
  corpo.querySelector('#mt-add')?.addEventListener('click', _adicionar);
  corpo.querySelectorAll('[data-planilha]').forEach(b => b.onclick = () => _planilha(b.dataset.planilha, b));

  corpo.querySelectorAll('.mt-pessoa.aberta').forEach(card => {
    const l = _leads.find(x => x.id === card.dataset.id); if (!l) return;
    card.querySelectorAll('[data-acao]').forEach(b => b.onclick = () => _acao(l, b.dataset.acao));
    card.querySelectorAll('[data-msg]').forEach(b => b.onclick = () => {
      const m = (_M?.mensagens || []).find(x => x.k === b.dataset.msg);
      const link = _wa(l.contato || l.digitos, _preencher(m.txt, _varsPessoa(l)));
      if (!link) return showToast('Essa pessoa não tem WhatsApp cadastrado.', 'error');
      window.open(link, '_blank');
      _salvar(l, { followup: { ...(l.followup || {}), [m.k]: new Date().toISOString() } });
    });
    const notas = card.querySelector('[data-notas]');
    if (notas) notas.onblur = () => { if ((notas.value || '') !== (l.notas || '')) salvarLead(l.id, { notas: notas.value }).then(() => { l.notas = notas.value; showToast('Anotação salva', 'success'); }).catch(e => showToast(e.message, 'error')); };
  });

  corpo.querySelectorAll('.mt-aluna [data-pagto]').forEach(b => b.onclick = () => _modalPagamento(_leads.find(x => x.id === b.closest('.mt-aluna').dataset.id)));
  const _alunaDe = b => _leads.find(x => x.id === b.closest('.mt-aluna').dataset.id);
  corpo.querySelectorAll('.mt-aluna [data-perm-ed]').forEach(b => b.onclick = () => _modalPermuta(_alunaDe(b)));
  corpo.querySelectorAll('.mt-aluna [data-relat]').forEach(b => b.onclick = () => abrirRelatorio(_alunaDe(b)));
  corpo.querySelectorAll('.mt-aluna [data-wpp-ed]').forEach(b => b.onclick = () => _modalWhatsApp(_alunaDe(b)));
  corpo.querySelectorAll('.mt-aluna [data-rel-zap]').forEach(b => b.onclick = () => {
    const l = _alunaDe(b);
    if (!_temContato(l)) { showToast('Salva o WhatsApp dela primeiro', 'error'); return _modalWhatsApp(l); }
    window.open(_wa(l.contato || l.digitos, textoResumo(l)), '_blank', 'noopener');
  });
  corpo.querySelectorAll('.mt-aluna [data-perm]').forEach(b => b.onclick = () => _marcarPermuta(_alunaDe(b)));
  corpo.querySelectorAll('.mt-aluna [data-perm-x]').forEach(b => b.onclick = () => {
    const l = _alunaDe(b), d = b.dataset.permX, itens = [...(l.permuta.itens || [])];
    const k = itens.findIndex(i => i.d === d && (i.t === 'feita' || i.t === 'repos'));
    if (k >= 0) itens.splice(k, 1);
    _salvarPermuta(l, { ...l.permuta, itens }, 'Tirado do histórico');
  });
  corpo.querySelectorAll('.mt-aluna [data-aula]').forEach(b => b.onclick = () => {
    const l = _leads.find(x => x.id === b.closest('.mt-aluna').dataset.id), k = b.dataset.aula;
    _salvar(l, { presenca: { ...(l.presenca || {}), [k]: !l.presenca?.[k] } });
  });
  corpo.querySelectorAll('[data-copiar]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(decodeURIComponent(b.dataset.copiar)); b.textContent = '✓ Copiado'; }
    catch { b.textContent = 'Não deu pra copiar'; }
    setTimeout(() => { b.textContent = b.closest('.mt-link-btns') ? 'Copiar link' : 'Copiar'; }, 1600);
  });
}

async function _acao(l, a) {
  const agora = new Date().toISOString();
  if (a === 'selecionar') return _salvar(l, { selecionada: !l.selecionada });
  if (a === 'foi') return _salvar(l, { compareceu: l.compareceu === true ? null : true });
  if (a === 'naofoi') return _salvar(l, { compareceu: l.compareceu === false ? null : false });
  if (a === 'pagou') return _modalPagamento(l);
  if (a === 'desfazer') {
    const ok = await confirmModal({ title: 'Desfazer pagamento?', message: `${l.nome || 'Ela'} volta pra Inscritas e o valor sai da renda da mentoria.`, confirmText: 'Desfazer' });
    if (ok) _salvar(l, { pago_em: null, pago_valor: null, pago_forma: null, pago_parcelas: null });
    return;
  }
  if (a === 'reservou') return _salvar(l, { reservou_em: agora, nao_agora: false });
  if (a === 'naoagora') return _salvar(l, { nao_agora: true });
  if (a === 'reabrir') return _salvar(l, { nao_agora: false });
  if (a === 'apagar') {
    const ok = await confirmModal({ title: 'Apagar pessoa?', message: `${l.nome || 'Essa pessoa'} e as respostas dela somem da lista. Não dá pra desfazer.`, confirmText: 'Apagar', danger: true });
    if (!ok) return;
    try { await apagarLead(l.id); _leads = _leads.filter(x => x.id !== l.id); _aberto = null; desenhar(); }
    catch (e) { showToast(e.message, 'error'); }
  }
}

// ── Pagamento: valor (sugestão = preço da oferta), forma, parcelas e data ──
// Vai pro Financeiro como renda da MENTORIA (separada dos clientes): sql/mentoria-pagamento.sql
function _modalPagamento(l) {
  if (!l) return;
  const o = _M?.oferta || {};
  const z = n => String(n).padStart(2, '0'), d = l.pago_em ? new Date(l.pago_em) : new Date();
  const dataIni = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  let forma = l.pago_forma || (l.reserva_forma === 'cartao' ? 'cartao' : l.reserva_forma === 'pix' ? 'pix' : '');
  const valorIni = l.pago_valor != null ? l.pago_valor : (o.precoHoje ?? '');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal"><div class="modal-title">✅ Pagamento de ${_esc((l.nome || 'aluna').split(' ')[0])}</div>
    <div class="fi-secao-sub">Entra no Financeiro como renda da mentoria, separada dos clientes.</div>
    <label class="mt-rot2" for="mp-v">Valor recebido (R$)</label>
    <input class="input-field" id="mp-v" type="number" inputmode="decimal" min="0" step="0.01" value="${_esc(valorIni)}">
    <div class="mt-rot2">Forma de pagamento</div>
    <div class="mt-chips">${FORMAS.map(([k, t]) => `<button class="mt-chip${forma === k ? ' on' : ''}" data-forma="${k}" type="button">${t}</button>`).join('')}</div>
    <div id="mp-parc-box"${forma === 'parcelado' ? '' : ' hidden'}><label class="mt-rot2" for="mp-p">Em quantas vezes</label>
      <input class="input-field" id="mp-p" type="number" inputmode="numeric" min="2" max="24" value="${_esc(l.pago_parcelas || o.parcelas || '')}"></div>
    <label class="mt-rot2" for="mp-d">Data do pagamento</label>
    <input class="input-field" id="mp-d" type="date" value="${dataIni}">
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">Salvar</button></div></div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  ov.querySelectorAll('[data-forma]').forEach(b => b.onclick = () => {
    forma = b.dataset.forma;
    ov.querySelectorAll('[data-forma]').forEach(x => x.classList.toggle('on', x === b));
    ov.querySelector('#mp-parc-box').hidden = forma !== 'parcelado';
  });
  ov.querySelector('[data-ok]').onclick = async () => {
    const valor = parseFloat(String(ov.querySelector('#mp-v').value).replace(',', '.'));
    if (!(valor >= 0)) return showToast('Coloque o valor recebido', 'error');
    if (!forma) return showToast('Escolha a forma de pagamento', 'error');
    const parc = forma === 'parcelado' ? parseInt(ov.querySelector('#mp-p').value, 10) || null : null;
    const dia = ov.querySelector('#mp-d').value;
    const pagoEm = dia ? new Date(`${dia}T12:00:00`).toISOString() : new Date().toISOString();
    const patch = { pago_em: pagoEm, pago_valor: Math.round(valor * 100) / 100, pago_forma: forma, pago_parcelas: parc, nao_agora: false, selecionada: true };
    try { await salvarLead(l.id, patch); Object.assign(l, patch); history.back(); desenhar(); showToast('Pagamento salvo 🎓', 'success'); }
    catch (e) {
      showToast(/pago_valor|pago_forma|pago_parcelas|column/i.test(e.message) ? 'Falta rodar o SQL mentoria-pagamento.sql no Supabase' : 'Não consegui salvar: ' + e.message, 'error');
    }
  };
  setTimeout(() => ov.querySelector('#mp-v').focus(), 60);
  return fechar;
}

function _adicionar() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal"><div class="modal-title">➕ Adicionar pessoa</div>
    <div class="fi-secao-sub">Pra quem comentou ou chamou no direct e ainda não preencheu o formulário.</div>
    <input class="input-field" id="mt-n" placeholder="Nome" autocomplete="off">
    <input class="input-field" id="mt-z" type="tel" inputmode="tel" placeholder="WhatsApp com DDD">
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">Adicionar</button></div></div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  ov.querySelector('[data-ok]').onclick = async () => {
    try {
      const novo = await criarLeadManual({ nome: ov.querySelector('#mt-n').value, contato: ov.querySelector('#mt-z').value });
      _leads.unshift(novo); _aberto = novo.id; history.back(); desenhar();
    } catch (e) { showToast(e.message, 'error'); }
  };
  setTimeout(() => ov.querySelector('#mt-n').focus(), 60);
  return fechar;
}
