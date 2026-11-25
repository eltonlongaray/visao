// ─── ÍNDICE ──────────────────────────────────────────────────
// Ferramentas → 💸 Fontes de renda extra → 🎓 MENTORIA (lado da dona).
//   BLOCO 1: Fontes de renda extra (hub)       BLOCO 2: abrir a Mentoria
//   BLOCO 3: etapas e mensagens sugeridas      BLOCO 4: tela (retráteis)
//   BLOCO 5: 📝 Inscritas                       BLOCO 6: 🎓 Alunas
//   BLOCO 7: 📊 O que elas responderam          BLOCO 8: 💬 Conversa · 📣 Grupo · 🔗 Formulários
//   BLOCO 9: ações (salvar, WhatsApp, copiar, adicionar, apagar)
// Veio do castelo (/castelo/selecao/painel + /castelo/vendas): mesma lógica de etapas,
// mensagens prontas e roteiro, agora no Falcon. Dados: js/mentoria.js · SQL: sql/mentoria.sql
// ─────────────────────────────────────────────────────────────
import { getLeads, salvarLead, criarLeadManual, apagarLead, carregarModelo, digitosDe } from './mentoria.js';
import { getAgendaConfig } from './agenda.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const SVG_VOLTAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>';
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
const _brl = v => v == null ? '[valor]' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
const _wa = (contato, txt) => { const d = digitosDe(contato); return d ? `https://wa.me/55${d}${txt ? `?text=${encodeURIComponent(txt)}` : ''}` : null; };

let _leads = [], _M = null, _slug = '', _close = null;
let _blocos = { inscritas: true }, _filtro = 'todas', _busca = '', _aberto = null;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: FONTES DE RENDA EXTRA (hub)
// ═══════════════════════════════════════════════════════════════
export function abrirRendaExtra() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'renda-ov';
  ov.innerHTML = `<div class="modal ag-modal"><div class="ag-corpo">
    <div class="ag-header">
      <button class="fr-voltar" data-voltar type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
      <div class="ag-title">💸 Fontes de renda extra</div>
    </div>
    <div class="ag-scroll">
      <div class="rf-intro">O que você ganha além dos atendimentos: alunas, cursos e outras rendas.</div>
      <div class="mt-hub">
        <button class="fr-hubcard" data-mentoria type="button">
          <span class="fr-hub-ic">🎓</span>
          <span class="fr-hub-tx"><b>Mentoria</b><small>Inscritas, alunas e formulários</small></span>
        </button>
        <button class="fr-hubcard" data-embreve type="button">
          <span class="fr-hub-ic">📚</span>
          <span class="fr-hub-tx"><b>Cursos e outras rendas</b><small>Curso gravado, produtos e mais</small></span>
          <span class="fr-hub-tag">EM BREVE</span>
        </button>
      </div>
    </div></div></div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-voltar]').onclick = () => history.back();
  ov.querySelector('[data-mentoria]').onclick = () => abrirMentoria();
  ov.querySelector('[data-embreve]').onclick = () => showToast('📚 Cursos e outras rendas está em desenvolvimento. Em breve! 🦅', 'info');
  return fechar;
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
  const pessoas = _leads.filter(_temContato);
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
        <div><b>${pessoas.length}</b><small>Inscritas</small></div>
        <div><b>${n('selecionada') + n('reservou') + n('aluna')}</b><small>Selecionadas</small></div>
        <div><b>${n('reservou')}</b><small>Falta pagar</small></div>
        <div><b>${alunas.length}</b><small>Alunas</small></div>
      </div>
      ${!_M ? `<div class="fi-bloco alerta"><div class="fi-bloco-tit">Formulários ainda não configurados</div><div class="fi-secao-sub" style="margin:0">Sua lista de inscritas e alunas já funciona. Os formulários e as mensagens prontas são montados sob medida pra você: fale com o suporte do Falcon.</div></div>` : ''}
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
  ['pesquisa', 'Pesquisa', l => !!l.formularios?.pesquisa],
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
    <div class="mt-lista">${lista.length ? lista.map(_cardPessoa).join('') : '<div class="ag-vazio">Ninguém aqui por enquanto.</div>'}</div>
    <button class="btn-secondary mt-add" id="mt-add" type="button">➕ Adicionar pessoa (quem comentou e não preencheu)</button>`;
}

function _cardPessoa(l) {
  const e = etapa(l), ab = _aberto === l.id, forms = l.formularios || {};
  return `<article class="mt-pessoa${ab ? ' aberta' : ''}" data-id="${l.id}">
    <button class="mt-pessoa-cab" data-abrir="${l.id}" type="button">
      <span class="mt-pessoa-nome">${_esc(l.nome || 'Sem nome')}</span>
      <span class="mt-selo ${e}">${ETAPAS[e]}</span>
      <span class="mt-pessoa-sub">${[forms.pesquisa ? '📊 pesquisa' : '', forms.selecao ? '📝 seleção' : '', l.instagram ? _esc(l.instagram) : '', _data(l.created_at)].filter(Boolean).join(' · ')}</span>
    </button>
    ${ab ? _detalhe(l, e) : ''}
  </article>`;
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
function _respostasDe(l, form) {
  const r = forms_(l)[form] || {}, ps = _M?.[form]?.perguntas || [];
  const pular = new Set(['nome', 'whatsapp', 'instagram', '_contato']);
  const itens = (ps.length ? ps.map(p => [p.id, p.q]) : Object.keys(r).map(k => [k, k]))
    .filter(([k]) => !pular.has(k) && !k.startsWith('_') && r[k] != null && String(r[k]).trim() !== '');
  return `<details class="mt-resp"${form === 'selecao' ? ' open' : ''}><summary>${form === 'selecao' ? '📝 Respostas da seleção' : '📊 Respostas da pesquisa'}${r._em ? ` <small>${_data(r._em)}</small>` : ''}</summary>
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
        <div class="mt-pessoa-sub">Pagou em ${_data(l.pago_em)}</div>
        ${aulas.length ? `<div class="mt-presenca">${aulas.map((a, i) => `<button class="mt-aula${l.presenca?.[i + 1] ? ' on' : ''}" data-aula="${i + 1}" type="button" title="${_esc(a)}">${l.presenca?.[i + 1] ? '✓' : ''} Aula ${i + 1}</button>`).join('')}</div>` : ''}
      </div>`).join('')}`).join('');
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
  if (a === 'pagou') return _salvar(l, { pago_em: agora, nao_agora: false, selecionada: true });
  if (a === 'desfazer') return _salvar(l, { pago_em: null });
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
