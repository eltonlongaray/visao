// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — POPUP (grupos → itens/seções)
// BLOCO 3 — WIRES
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  carregarFerramentas, adicionarItem, marcarItem, editarItem, apagarItem,
  renomearGrupo, contarPendentes,
  adicionarSecao, renomearSecao, apagarSecao, criarGrupo, apagarGrupo,
  reordenarItens, valorDoItem, reais, marcarPrioridade, reordenarPrioridades,
  ehPrioAtividade, adicionarPrioridade, moverPrioridade,
} from './ferramentas.js';
import { getCategories } from './banco-dados.js';
import { abrirEditorAtividade } from './atividade-editor.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { abrirAgenda } from './agenda-ui.js';
import { abrirRifas } from './rifas-ui.js';
import { abrirObjetivos, abrirEditorObjetivo } from './objetivos-ui.js';
import { abrirIdeal } from './ideal-ui.js';
import { abrirGuiaMetodo, guiaDeveAbrir } from './metodo-guia.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Seta de voltar — mesmo desenho da comunidade.
const SVG_VOLTAR = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>`;

let grupos = [];
let cats = [];            // Atividades da Home (pra saber qual prioridade já virou atividade)
let vista = 'hub';        // 'hub' (cards) | 'listas' (grupos) | 'prioridades'
let grupoAberto = null;   // nome do grupo aberto; null = lista de grupos
let _hist = 0;            // camadas empurradas no histórico (pro voltar do aparelho)
// Cada camada nossa vai no histórico como { fr: nível }. No voltar, o nível que
// sobrou diz até onde subir; janelinha por cima (confirmar, nova categoria) não
// tem nível próprio, então fechar ela não tira a pessoa do grupo.
const _empurrar = () => { _hist++; history.pushState({ fr: _hist }, ''); };

// O que a pessoa deixou aberto e onde parou (vale entre aberturas do app)
const _lerLS = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
const _gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };
const CH_ABERTAS = 'falcon_obj_abertas', CH_POS = 'falcon_obj_pos', CH_RASC = 'falcon_obj_rascunhos';
const abertas = new Set(_lerLS(CH_ABERTAS, []));
const _salvarAbertas = () => _gravarLS(CH_ABERTAS, [...abertas]);

// Sugestões de categoria por grupo (a pessoa escreve OU toca numa sugestão).
const SUGESTOES = {
  Casa:     ['Cozinha', 'Mercado', 'Limpeza', 'Contas', 'Conserto'],
  Pessoal:  ['Saúde', 'Estudos', 'Documentos', 'Compras', 'Metas'],
  Trabalho: ['Reuniões', 'Projetos', 'E-mails', 'Ideias', 'Prazos'],
  Família:  ['Filhos', 'Compromissos', 'Compras', 'Casa'],
  Amigos:   ['Rolês', 'Aniversários', 'Combinar'],
  Academia: ['Peito', 'Costas', 'Pernas', 'Braços', 'Ombros', 'Abdômen'],
};
const SUGESTOES_GERAIS = ['A comprar', 'A ligar', 'A resolver', 'Ideias', 'Importante'];

const _pendGrupo = (g) =>
  g.soltos.filter(i => !i.feito).length + g.secoes.reduce((n, s) => n + s.itens.filter(i => !i.feito).length, 0);

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: POPUP
// ═══════════════════════════════════════════════════════════════
// Dois cards na Home usam a mesma tela (Élton, 22/10): Método Falcon
// (Objetivos, Ideal, Prioridades, Metas) e Ferramentas (Agenda e Rifa).
let modo = 'metodo';
export function abrirMetodo() { return _abrir('metodo'); }
export function abrirFerramentas() { return _abrir('ferramentas'); }

async function _abrir(m) {
  if (document.getElementById('ferramentas-ov')) return;   // já aberto
  modo = m;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay fr-overlay';   // fr-overlay = tela inteira
  ov.id = 'ferramentas-ov';
  ov.innerHTML = `<div class="modal fr-modal"><div class="fr-corpo"><div class="fr-carregando">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  _hist = 0; _empurrar();   // voltar do aparelho fecha a camada
  vista = 'hub'; grupoAberto = null;
  desenhar();   // mostra o hub na hora (não espera as listas)

  try { [grupos, cats] = await Promise.all([carregarFerramentas(), getCategories().catch(() => [])]); }
  catch (e) { grupos = []; }
  if (vista === 'hub') desenhar();   // repinta o badge de Listas quando carregar
  // Guia do Método: abre sozinho até a pessoa terminar ou pedir pra parar
  if (modo === 'metodo' && vista === 'hub' && document.getElementById('ferramentas-ov') && guiaDeveAbrir()) abrirGuia(true);
}

function abrirGuia(automatico = false) {
  abrirGuiaMetodo({
    grupos, automatico,
    aoMudar: async () => { try { grupos = await carregarFerramentas(); desenhar(); pintarBadgeFerramentas(); } catch { /* repinta depois */ } },
    irPara: (alvo) => {
      if (!document.getElementById('ferramentas-ov')) return;
      if (alvo === 'metas') { abrirObjetivos(); return; }
      _empurrar(); vista = 'prioridades'; grupoAberto = null; desenhar();
    },
  });
}

function fechar() {
  _confirmarApagar();
  if (grupoAberto) _guardarRascunhos();
  const ov = document.getElementById('ferramentas-ov');
  if (ov) ov.remove();
  const n = _hist; _hist = 0; vista = 'hub'; grupoAberto = null;
  if (n > 0) history.go(-n);   // consome as camadas que empurramos
}

// Repinta sem a tela pular: guarda a rolagem, o que estava escrito em cada
// campo e qual campo tinha o cursor, e devolve tudo depois.
function desenhar() {
  const corpo = document.querySelector('#ferramentas-ov .fr-corpo');
  if (!corpo) return;
  const sc = corpo.querySelector('.fr-scroll');
  const tela = _telaAtual();
  const mesmo = sc && sc.dataset.frGrupo === tela;
  const topo = mesmo ? sc.scrollTop : null;
  const foco = document.activeElement?.closest?.('#ferramentas-ov [data-nova]')?.dataset.secao;
  if (mesmo) _guardarRascunhos();
  corpo.innerHTML = vista === 'hub' ? telaHub() : vista === 'prioridades' ? telaPrioridades() : (grupoAberto ? telaItens() : telaGrupos());
  const novo = corpo.querySelector('.fr-scroll');
  if (!novo) return;
  novo.scrollTop = topo ?? (_lerLS(CH_POS, {})[tela] || 0);
  const rasc = _lerLS(CH_RASC, {});
  novo.querySelectorAll('[data-nova]').forEach(f => {
    const campo = f.querySelector('.fr-nova-input');
    const txt = rasc[_chaveRasc(f.dataset.secao)];
    if (txt) { campo.value = txt; _crescer(campo); }
  });
  if (foco != null) {
    const campo = novo.querySelector(`[data-nova][data-secao="${foco}"] .fr-nova-input`);
    if (campo) { campo.focus({ preventScroll: true }); campo.setSelectionRange(campo.value.length, campo.value.length); }
  }
  novo.addEventListener('scroll', () => {
    clearTimeout(novo._t);
    novo._t = setTimeout(() => { const pos = _lerLS(CH_POS, {}); pos[tela] = novo.scrollTop; _gravarLS(CH_POS, pos); }, 200);
  }, { passive: true });
}

// Tela com rolagem própria: o grupo aberto ou o card Prioridades
const _telaAtual = () => grupoAberto || (vista === 'prioridades' ? '__prio' : null);

// Rascunho de cada campo de adicionar (sair e voltar não perde o que foi escrito)
const _chaveRasc = (secao) => `${grupoAberto}|${secao || ''}`;
function _guardarRascunhos() {
  const rasc = _lerLS(CH_RASC, {});
  document.querySelectorAll('#ferramentas-ov [data-nova]').forEach(f => {
    const v = f.querySelector('.fr-nova-input')?.value || '';
    const k = _chaveRasc(f.dataset.secao);
    if (v.trim()) rasc[k] = v; else delete rasc[k];
  });
  _gravarLS(CH_RASC, rasc);
}
// Campo cresce com o texto: dá pra ver tudo que foi escrito e onde está o cursor
function _crescer(campo) {
  campo.style.height = 'auto';
  campo.style.height = Math.min(campo.scrollHeight + 2, 160) + 'px';
}

// ── Hub: cards Metas / Agenda Online / Rifa Solidária / Objetivos ──
// (Élton, 21/10: "Listas" virou Objetivos e "Meus Objetivos" virou Minhas Metas)
function telaHub() {
  if (modo === 'ferramentas') return `
    <div class="fr-cab">
      <span class="fr-titulo">🛠️ Ferramentas</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>
    <div class="fr-hub">
      <button class="fr-hubcard" data-hub-agenda type="button">
        <span class="fr-hub-ic">📅</span>
        <span class="fr-hub-tx"><b>Agenda Online</b><small>Seu link de agendamento + seus clientes</small></span>
        <span class="fr-hub-tag">PRO</span>
      </button>
      <button class="fr-hubcard" data-hub-rifa type="button">
        <span class="fr-hub-ic">🎟️</span>
        <span class="fr-hub-tx"><b>Rifa Solidária</b><small>Crie sua rifa e compartilhe o link</small></span>
        <span class="fr-hub-tag">PRO</span>
      </button>
      <button class="fr-hubcard" data-hub-lingua type="button">
        <span class="fr-hub-ic">🌎</span>
        <span class="fr-hub-tx"><b>Aprenda outra língua</b><small>15 minutos por dia</small></span>
        <span class="fr-hub-tag">EM BREVE</span>
      </button>
    </div>`;
  const pend = grupos.reduce((n, g) => n + _pendGrupo(g), 0);
  const prio = _prioridades().filter(x => !x.item.feito).length;
  // Método: organizar → clareza → decisão → ação (Élton, 21/10). Cada passo
  // abre a tela dele; os cards seguem a mesma ordem.
  return `
    <div class="fr-cab">
      <span class="fr-titulo">🦅 Método Falcon</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>
    <div class="fr-hub">
      <div class="fr-metodo">
        <div class="fr-metodo-tit">Os 4 passos <button type="button" class="fr-metodo-ajuda" data-guia aria-label="Como funciona">❔ Como funciona</button></div>
        <div class="fr-metodo-passos">
          <button type="button" data-hub-clareza><b>1</b><span>Organização</span></button>
          <i aria-hidden="true">›</i>
          <button type="button" data-hub-listas><b>2</b><span>Clareza</span></button>
          <i aria-hidden="true">›</i>
          <button type="button" data-hub-prioridades><b>3</b><span>Decisão</span></button>
          <i aria-hidden="true">›</i>
          <button type="button" data-hub-objetivos><b>4</b><span>Ação</span></button>
        </div>
        <div class="fr-metodo-sub">Organize pra ter clareza, decida o que vem primeiro e parta pra ação.</div>
      </div>
      <button class="fr-hubcard" data-hub-clareza type="button">
        <span class="fr-hub-ic">🧭</span>
        <span class="fr-hub-tx"><small class="fr-hub-passo">1 · Organização</small><b>Organizando meu ideal</b><small>Marque o que é importante em cada área da vida</small></span>
      </button>
      <button class="fr-hubcard" data-hub-listas type="button">
        <span class="fr-hub-ic">🎯</span>
        <span class="fr-hub-tx"><small class="fr-hub-passo">2 · Clareza</small><b>Objetivos</b><small>O que você precisa fazer ou comprar, sem data nem hora</small></span>
        ${pend ? `<span class="fr-hub-badge">${pend}</span>` : ''}
      </button>
      <button class="fr-hubcard" data-hub-prioridades type="button">
        <span class="fr-hub-ic">⭐</span>
        <span class="fr-hub-tx"><small class="fr-hub-passo">3 · Decisão</small><b>Prioridades</b><small>O que vem primeiro: as atividades e o que fazer ou comprar</small></span>
        ${prio ? `<span class="fr-hub-badge fr-hub-badge-ouro">${prio}</span>` : ''}
      </button>
      <button class="fr-hubcard" data-hub-objetivos type="button">
        <span class="fr-hub-ic">🏁</span>
        <span class="fr-hub-tx"><small class="fr-hub-passo">4 · Ação</small><b>Minhas Metas</b><small>Escolha o que manter com constância; eu conto sozinho pelo Ritual</small></span>
      </button>
    </div>`;
}

// Itens com ⭐ (de todos os grupos), do mais importante pro menos
function _prioridades() {
  const out = [];
  for (const g of grupos) {
    for (const it of g.soltos) if (it.prioridade != null) out.push({ item: it, grupo: g, secao: null });
    for (const sec of g.secoes) for (const it of sec.itens) if (it.prioridade != null) out.push({ item: it, grupo: g, secao: sec });
  }
  return out.sort((a, b) => a.item.prioridade - b.item.prioridade);
}

// ── Card Prioridades em duas listas (Élton, 26/10) ──
// 🔥 Atividades: o que fazer com o tempo; cada item vira atividade no Ritual.
// 🛒 Realizar e Comprar: com a caixinha de R$ e o total. Arrasta pra ordenar.
const _virouAtividade = (it) => cats.find(c => c.prioItemId === it.id);
function telaPrioridades() {
  const todas = _prioridades();
  const ativ = todas.filter(x => ehPrioAtividade(x.item)), compra = todas.filter(x => !ehPrioAtividade(x.item));
  const ordem = (l) => [...l.filter(x => !x.item.feito), ...l.filter(x => x.item.feito)];
  const onde = (x) => x.secao ? `${x.grupo.nome} › ${x.secao.nome}` : x.grupo.nome;
  const linhaAtiv = (x) => {
    const c = _virouAtividade(x.item);
    const extra = c
      ? `<span class="fr-prio-feita">✓ Virou atividade: ${esc(c.icon || '')} ${esc(c.name)}</span>`
      : (x.item.feito ? '' : `<button type="button" class="fr-prio-criar" data-criar-ativ="${x.item.id}">➕ Criar atividade</button>`);
    return linhaItem(x.item, '', { semValor: true, extra: `${extra}<button type="button" class="fr-prio-mover" data-mover-prio="${x.item.id}" data-pra="compra">mover pra 🛒 Realizar e Comprar</button>` });
  };
  // Escrito direto aqui não precisa dizer de onde veio
  const linhaCompra = (x) => linhaItem(x.item, x.grupo.nome === 'Realizar e Comprar' && !x.secao ? '' : onde(x), {
    extra: `<button type="button" class="fr-prio-mover" data-mover-prio="${x.item.id}" data-pra="ativ">mover pra 🔥 Atividades</button>` });
  const total = somaValores(compra.filter(x => !x.item.feito).map(x => x.item));
  return `
    <div class="fr-cab">
      <button class="fr-voltar" data-voltar aria-label="Voltar">${SVG_VOLTAR}</button>
      <span class="fr-titulo">⭐ Prioridades</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>
    <div class="fr-scroll" data-fr-grupo="__prio">
      <div class="fr-sub">Segure o ⠿ e arraste pra deixar no topo o que é mais importante. Toque na ⭐ pra tirar daqui.</div>

      <div class="fr-prio-tit">🔥 Atividades <small>o que você vai fazer com o seu tempo</small></div>
      ${formNova('__prio-ativ', 'Ex.: Ler, Musculação, Estudar inglês…')}
      ${ativ.length ? `<div class="fr-lista" data-lista="__prio-ativ">${ordem(ativ).map(linhaAtiv).join('')}</div>`
        : '<div class="fr-vazio-grupo">Escreva acima o que você quer começar a fazer. Depois toque em <b>➕ Criar atividade</b> pra ela entrar no seu Ritual.</div>'}

      <div class="fr-prio-tit">🛒 Realizar e Comprar ${total ? `<span class="fr-secao-total">${reais(total)}</span>` : ''}<small>o que você quer realizar ou comprar</small></div>
      ${formNova('__prio-compra', 'Ex.: Tênis de corrida, Consertar a janela…')}
      ${compra.length ? `<div class="fr-lista" data-lista="__prio-compra">${ordem(compra).map(linhaCompra).join('')}</div>`
        : '<div class="fr-vazio-grupo">Escreva acima, ou toque na ☆ de um item nos <b>Objetivos</b> pra ele vir pra cá. O valor você põe quando pesquisar o preço.</div>'}
    </div>`;
}

// ── ícone do grupo num círculo colorido ──
// svg pega a cor do círculo (currentColor); emoji fica como está.
function icone(g) {
  const dentro = g.svg
    ? `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" style="display:block">${g.svg}</svg>`
    : esc(g.icone || '📌');
  return `<span class="fr-ic-circ" style="background:${g.cor}22;color:${g.cor}">${dentro}</span>`;
}

// ── Lista de grupos ──
function telaGrupos() {
  return `
    <div class="fr-cab">
      <button class="fr-voltar" data-voltar aria-label="Voltar">${SVG_VOLTAR}</button>
      <span class="fr-titulo">🎯 Objetivos</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>
    <div class="fr-sub">Coisas que você precisa fazer, sem data nem hora. Toque num grupo.</div>
    <div class="fr-grupos">
      ${grupos.map(g => {
        const pend = _pendGrupo(g);
        return `
        <button class="fr-grupo" data-grupo="${esc(g.nome)}">
          ${icone(g)}
          <span class="fr-grupo-nome">${esc(g.nome)}</span>
          ${pend ? `<span class="fr-grupo-badge">${pend}</span>` : ''}
        </button>`;
      }).join('')}
      <button class="fr-grupo fr-grupo-novo" data-novo-grupo>
        <span class="fr-ic-circ fr-ic-novo">＋</span>
        <span class="fr-grupo-nome">Novo grupo</span>
      </button>
    </div>`;
}

// ── linha de item (checkbox + texto + apagar) ──
// opc.semValor tira a caixinha de R$; opc.extra vai embaixo do texto (botões)
function linhaItem(i, onde = '', opc = {}) {
  const prio = i.prioridade != null;
  const { base, valor } = separarValor(i.texto);
  return `
    <div class="fr-item ${i.feito ? 'feito' : ''}${prio ? ' prio' : ''}" data-id="${i.id}">
      <span class="fr-arrastar" data-arrastar aria-label="Segure e arraste pra mudar a ordem">⠿</span>
      <button class="fr-check" data-marcar="${i.id}" aria-label="Marcar">${i.feito ? '✓' : ''}</button>
      <span class="fr-texto" data-editar="${i.id}">${esc(base)}${onde ? `<small class="fr-onde">${esc(onde)}</small>` : ''}${opc.extra ? `<span class="fr-prio-acoes">${opc.extra}</span>` : ''}</span>
      ${!opc.semValor && (valor || !i.feito) ? `<button class="fr-valor${valor ? ' tem' : ''}" data-valor="${i.id}" aria-label="${valor ? 'Mudar o valor' : 'Adicionar valor'}">${valor ? reais(valor) : '+ R$'}</button>` : ''}
      <button class="fr-estrela${prio ? ' on' : ''}" data-estrela="${i.id}" aria-label="${prio ? 'Tirar das prioridades' : 'Marcar como prioridade'}">${prio ? '★' : '☆'}</button>
      <button class="fr-item-x" data-apagar="${i.id}" aria-label="Apagar">✕</button>
    </div>`;
}

// ── bloco de uma lista (pendentes + concluídos), reusado em soltos e seções ──
function bloco(itens, vazioTxt) {
  const pend = itens.filter(i => !i.feito), feitos = itens.filter(i => i.feito);
  return `
    ${pend.length ? pend.map(i => linhaItem(i)).join('') : (vazioTxt ? `<div class="fr-vazio-grupo">${vazioTxt}</div>` : '')}
    ${feitos.length ? feitos.map(i => linhaItem(i)).join('') : ''}`;
}

// ── form de adicionar (solto = data-secao vazio; ou de uma seção) ──
function formNova(secaoId, ph) {
  return `
    <form class="fr-nova" data-nova data-secao="${secaoId || ''}">
      <textarea class="fr-nova-input" rows="1" placeholder="${esc(ph)}" maxlength="500" autocomplete="off" enterkeyhint="send"></textarea>
      <button type="submit" class="fr-nova-btn" aria-label="Adicionar">＋</button>
    </form>`;
}

// Soma dos preços escritos nos itens (0 = nenhum tem preço)
const somaValores = (itens) => itens.reduce((n, i) => n + (valorDoItem(i.texto) || 0), 0);

// Tira o preço do texto pra mostrar na caixinha do lado ("Janela R$ 658" →
// "Janela" + R$ 658,00). O preço continua guardado no texto (a soma e o Pet leem dali).
const RE_PRECO = /\s*[-–:,]?\s*(?:R\$\s*(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|pila)\b)/i;
function separarValor(texto) {
  const valor = valorDoItem(texto);
  if (!valor) return { base: texto, valor: null };
  const base = String(texto).replace(RE_PRECO, '').trim();
  return { base: base || texto, valor };
}

// ── Itens de um grupo (soltos + seções) ──
function telaItens() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g) { grupoAberto = null; return telaGrupos(); }

  // Categoria = título que abre e fecha. Aberta: o campo de adicionar vem
  // logo embaixo do título e os itens depois (o novo entra em primeiro).
  const secoesHtml = g.secoes.map(sec => {
    const aberta = abertas.has(sec.id);
    const pend = sec.itens.filter(i => !i.feito);
    const total = somaValores(pend);
    return `
    <div class="fr-secao${aberta ? ' aberta' : ''}" data-secao-id="${sec.id}">
      <div class="fr-secao-cab">
        <button type="button" class="fr-secao-toggle" data-toggle-secao="${sec.id}" aria-expanded="${aberta}">
          <span class="fr-secao-seta" aria-hidden="true">›</span>
          <span class="fr-secao-nome">${esc(sec.nome)}</span>
          ${total ? `<span class="fr-secao-total">${reais(total)}</span>` : ''}
          ${pend.length ? `<span class="fr-secao-cont">${pend.length}</span>` : ''}
        </button>
        ${aberta ? `<button class="fr-secao-x" data-editar-secao="${sec.id}" aria-label="Renomear categoria">✏️</button>
        <button class="fr-secao-x" data-apagar-secao="${sec.id}" aria-label="Apagar categoria">🗑</button>` : ''}
      </div>
      ${aberta ? `${formNova(sec.id, 'Adicionar em ' + sec.nome + '…')}
      <div class="fr-lista" data-lista="${sec.id}">${bloco(sec.itens, 'Vazio por enquanto.')}</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="fr-cab">
      <button class="fr-voltar" data-voltar aria-label="Voltar">${SVG_VOLTAR}</button>
      <span class="fr-titulo">${icone(g)} ${esc(g.nome)}</span>
      <button class="fr-x" data-fechar aria-label="Fechar">✕</button>
    </div>

    <div class="fr-scroll" data-fr-grupo="${esc(g.nome)}">
      ${g.soltos.length ? `<div class="fr-lista" data-lista="">${bloco(g.soltos, '')}</div>` : ''}

      <button class="fr-add-secao" data-nova-secao>＋ Adicionar categoria</button>

      ${g.secoes.length ? secoesHtml
        : '<div class="fr-vazio-grupo">Crie uma categoria pra começar (ex.: Cozinha, Mercado).</div>'}

      <div class="fr-rodape">
        ${g.custom ? `<button class="fr-renomear" data-renomear>✏️ Renomear grupo</button>` : ''}
        ${g.custom ? `<button class="fr-apagar-grupo" data-apagar-grupo>🗑 Apagar grupo</button>` : ''}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: WIRES — delegados no overlay
// ═══════════════════════════════════════════════════════════════
let ligado = false;
export function ligarFerramentas() {
  if (ligado) return;
  ligado = true;

  // Voltar do aparelho: fecha a camada (grupo → lista → fecha), em vez de sair
  // da Caixa e cair no menu.
  window.addEventListener('popstate', () => {
    const ov = document.getElementById('ferramentas-ov');
    if (!ov || _hist === 0) return;
    // Agenda/Rifa aberta POR CIMA do hub → deixa o modal dela tratar o back (ela fecha,
    // o hub reaparece). Sem isso, o back fechava o hub junto.
    if (document.getElementById('agenda-ov') || document.getElementById('rifas-ov') || document.getElementById('objetivos-ov') || document.getElementById('ideal-ov')) return;
    // Nível que ficou no histórico. Igual ao nosso = só fechou uma janelinha
    // por cima (confirmar, nova categoria): a pessoa continua onde estava.
    const nivel = Number(history.state?.fr) || 0;
    if (nivel >= _hist) return;
    if (grupoAberto) _guardarRascunhos();
    while (_hist > nivel) {
      _hist--;
      if (grupoAberto) grupoAberto = null;                  // grupo → Objetivos
      else if (vista !== 'hub') vista = 'hub';              // Objetivos/Prioridades → hub
      else { ov.remove(); _hist = 0; vista = 'hub'; return; } // hub → fecha
    }
    desenhar();
  });

  // Campo de adicionar: cresce com o texto; Enter adiciona (Shift+Enter quebra linha)
  document.addEventListener('input', (e) => {
    const campo = e.target.closest?.('#ferramentas-ov .fr-nova-input');
    if (campo) _crescer(campo);
  });
  document.addEventListener('keydown', (e) => {
    const campo = e.target.closest?.('#ferramentas-ov .fr-nova-input');
    if (campo && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); campo.form?.requestSubmit(); }
  });
  ligarArrastar();

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#ferramentas-ov')) return;

    if (e.target.closest('[data-fechar]')) { fechar(); return; }
    if (e.target.closest('[data-voltar]')) { history.back(); return; }  // popstate volta um nível

    // Hub → cards
    if (e.target.closest('[data-hub-listas]')) { _empurrar(); vista = 'listas'; grupoAberto = null; desenhar(); return; }
    if (e.target.closest('[data-hub-prioridades]')) { _empurrar(); vista = 'prioridades'; grupoAberto = null; desenhar(); return; }
    if (e.target.closest('[data-hub-clareza]')) { abrirIdeal(); return; }       // abre por cima do hub
    if (e.target.closest('[data-hub-objetivos]')) { abrirObjetivos(); return; } // abre por cima do hub
    if (e.target.closest('[data-hub-agenda]')) { abrirAgenda(); return; }   // abre por cima do hub
    if (e.target.closest('[data-hub-rifa]')) { abrirRifas(); return; }
    if (e.target.closest('[data-guia]')) { abrirGuia(false); return; }
    if (e.target.closest('[data-hub-lingua]')) { showToast('🌎 Aprenda outra língua está em desenvolvimento. Em breve! 🦅', 'info'); return; }

    const abrir = e.target.closest('[data-grupo]');
    if (abrir) { _empurrar(); grupoAberto = abrir.dataset.grupo; desenhar(); return; }

    const tg = e.target.closest('[data-toggle-secao]');
    if (tg) {
      const id = tg.dataset.toggleSecao;
      _guardarRascunhos();
      if (abertas.has(id)) abertas.delete(id); else abertas.add(id);
      _salvarAbertas(); desenhar();
      return;
    }

    if (e.target.closest('[data-novo-grupo]')) { await novoGrupo(); return; }
    if (e.target.closest('[data-nova-secao]')) { await novaSecao(); return; }

    const mk = e.target.closest('[data-marcar]');
    if (mk) {
      const it = _item(mk.dataset.marcar);
      if (it) { it.feito = !it.feito; desenhar(); await _salvarMarca(it); }
      return;
    }

    const st = e.target.closest('[data-estrela]');
    if (st) {
      const it = _item(st.dataset.estrela);
      if (!it) return;
      const antes = it.prioridade;
      const ligar = antes == null;
      it.prioridade = ligar ? Date.now() : null; desenhar();
      try {
        await marcarPrioridade(it.id, ligar);
        if (ligar) showToast('⭐ Foi pras Prioridades', 'success');
      } catch (err) { it.prioridade = antes; desenhar(); showToast(err.message, 'error'); }
      return;
    }

    const cr = e.target.closest('[data-criar-ativ]');
    if (cr) { await criarAtividadeDaPrioridade(cr.dataset.criarAtiv); return; }

    const mv = e.target.closest('[data-mover-prio]');
    if (mv) {
      try { await moverPrioridade(mv.dataset.moverPrio, mv.dataset.pra === 'ativ'); await _recarregar(); }
      catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const ap = e.target.closest('[data-apagar]');
    if (ap) { apagarComDesfazer(ap.dataset.apagar); return; }

    const vl = e.target.closest('[data-valor]');
    if (vl) { await editarValor(vl.dataset.valor); return; }

    const ed = e.target.closest('[data-editar]');
    if (ed) { await editarInline(ed.dataset.editar); return; }

    const edS = e.target.closest('[data-editar-secao]');
    if (edS) { await renomearSecaoUI(edS.dataset.editarSecao); return; }

    const apS = e.target.closest('[data-apagar-secao]');
    if (apS) { await apagarSecaoUI(apS.dataset.apagarSecao); return; }

    if (e.target.closest('[data-renomear]')) { await renomear(); return; }
    if (e.target.closest('[data-apagar-grupo]')) { await apagarGrupoUI(); return; }
  });

  // adicionar item — cada form (soltos ou seção) traz seu próprio input e data-secao
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-nova]');
    if (!form || !form.closest('#ferramentas-ov')) return;
    e.preventDefault();
    const campo = form.querySelector('.fr-nova-input');
    const texto = campo.value.trim();
    // Campo das listas de Prioridades: o item nasce com a ⭐
    if (texto && vista === 'prioridades' && !grupoAberto) {
      campo.value = ''; _crescer(campo);
      try { await adicionarPrioridade(texto, form.dataset.secao === '__prio-ativ'); await _recarregar(); }
      catch (err) { campo.value = texto; showToast(err.message, 'error'); }
      return;
    }
    if (!texto || !grupoAberto) return;
    const secaoId = form.dataset.secao || null;
    campo.value = ''; _crescer(campo);
    const rasc = _lerLS(CH_RASC, {}); delete rasc[_chaveRasc(form.dataset.secao)]; _gravarLS(CH_RASC, rasc);
    try {
      const novo = await adicionarItem(grupoAberto, texto, secaoId);
      const g = grupos.find(x => x.nome === grupoAberto);
      if (g && novo) {
        // entra em primeiro, logo embaixo do campo (a tela não se mexe)
        if (secaoId) { const s = g.secoes.find(x => x.id === secaoId); s?.itens.unshift(novo); }
        else g.soltos.unshift(novo);
      }
      desenhar();
    } catch (err) { campo.value = texto; showToast(err.message, 'error'); }
  });
}

// ── Arrastar pra mudar a ordem ──
// Segura o ⠿ e arrasta: o item anda entre os da mesma lista (pendentes com
// pendentes, feitos com feitos). Perto da borda, a tela rola sozinha.
function ligarArrastar() {
  document.addEventListener('pointerdown', (e) => {
    const alca = e.target.closest?.('#ferramentas-ov [data-arrastar]');
    if (!alca) return;
    e.preventDefault();
    const item = alca.closest('.fr-item'), lista = item?.parentElement;
    const sc = document.querySelector('#ferramentas-ov .fr-scroll');
    if (!item || !lista || !sc) return;
    const antes = [...lista.querySelectorAll('.fr-item')].map(x => x.dataset.id).join();
    const feito = item.classList.contains('feito');
    let y = e.clientY;
    item.classList.add('arrastando');
    const posicionar = () => {
      const irmaos = [...lista.querySelectorAll('.fr-item')].filter(x => x !== item && x.classList.contains('feito') === feito);
      if (!irmaos.length) return;
      const depois = irmaos.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (depois) { if (item.nextElementSibling !== depois) lista.insertBefore(item, depois); }
      else { const ult = irmaos[irmaos.length - 1]; if (ult.nextElementSibling !== item) ult.after(item); }
    };
    const rolar = setInterval(() => {
      const r = sc.getBoundingClientRect();
      const passo = y < r.top + 60 ? -10 : y > r.bottom - 60 ? 10 : 0;
      if (passo) { sc.scrollTop += passo; posicionar(); }
    }, 16);
    const mover = (ev) => { y = ev.clientY; posicionar(); };
    const soltar = async () => {
      clearInterval(rolar);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      item.classList.remove('arrastando');
      const ids = [...lista.querySelectorAll('.fr-item')].map(x => x.dataset.id);
      if (ids.join() === antes) return;
      _reordenarLocal(lista.dataset.lista, ids);
      try { await (lista.dataset.lista.startsWith('__prio') ? reordenarPrioridades(ids) : reordenarItens(ids)); }
      catch (err) { showToast(err.message, 'error'); }
    };
    // Na janela (não na alça): mover o item no DOM solta a captura do dedo
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  });
}

// Mesma ordem na memória (o próximo repintar não desfaz o arrasto)
function _reordenarLocal(secaoId, ids) {
  if (secaoId.startsWith('__prio')) { ids.forEach((id, i) => { const it = _item(id); if (it) it.prioridade = i; }); return; }
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g) return;
  const sec = secaoId ? g.secoes.find(s => s.id === secaoId) : null;
  const arr = sec ? sec.itens : g.soltos;
  const pos = new Map(ids.map((id, i) => [id, i]));
  arr.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  arr.forEach((it, i) => { it.ord = i; });
}

// ── auxiliares ──
async function _recarregar() {
  try { [grupos, cats] = await Promise.all([carregarFerramentas(), getCategories().catch(() => cats)]); } catch { /* repinta com o que tem */ }
  desenhar();
}

// ➕ Criar atividade: o mesmo pop-up da Home (nome, descrição, ícone, cor) e,
// em seguida, a meta: quantas vezes por semana ou por mês (Élton, 26/10).
async function criarAtividadeDaPrioridade(id) {
  const it = _item(id);
  if (!it) return;
  const { base } = separarValor(it.texto);
  const novoId = await abrirEditorAtividade({
    cats, inicial: { nome: base.slice(0, 60) }, extra: { prioItemId: it.id },
    dica: 'Dê um nome pro que você vai fazer de verdade. Ex.: em vez de "Ler", "Leitura 20 min". Na descrição, como vai ser e pra quê.',
  });
  if (!novoId) return;
  await _recarregar();
  abrirEditorObjetivo(null, {
    atividadeId: novoId, titulo: 'Quantas vezes você vai fazer?',
    dica: 'Escolha quantos dias por semana ou por mês. Eu conto sozinho pelo Ritual, nas Minhas Metas.',
  });
}

function _item(id) {
  for (const g of grupos) {
    const s = g.soltos.find(i => i.id === id); if (s) return s;
    for (const sec of g.secoes) { const it = sec.itens.find(i => i.id === id); if (it) return it; }
  }
  return null;
}
function _removerItemLocal(id) {
  for (const g of grupos) {
    g.soltos = g.soltos.filter(i => i.id !== id);
    for (const sec of g.secoes) sec.itens = sec.itens.filter(i => i.id !== id);
  }
}
async function _salvarMarca(it) {
  try { await marcarItem(it.id, it.feito); }
  catch (e) { it.feito = !it.feito; desenhar(); showToast(e.message, 'error'); }
}

// ── Apagar com "Desfazer" (Élton, 22/10): some na hora e só apaga de vez
// depois de 5 s. Tocar em Desfazer devolve o item no mesmo lugar.
let _apagando = null;   // { it, lista, pos, timer, barra }
function _confirmarApagar() {
  const a = _apagando;
  if (!a) return;
  _apagando = null;
  clearTimeout(a.timer); a.barra.remove();
  apagarItem(a.it.id).catch((err) => showToast(err.message, 'error'));
}
function _listaDoItem(id) {
  for (const g of grupos) {
    if (g.soltos.some(i => i.id === id)) return g.soltos;
    for (const sec of g.secoes) if (sec.itens.some(i => i.id === id)) return sec.itens;
  }
  return null;
}
function apagarComDesfazer(id) {
  _confirmarApagar();   // um por vez: o anterior apaga de vez
  const lista = _listaDoItem(id);
  const it = _item(id);
  if (!lista || !it) return;
  const pos = lista.indexOf(it);
  lista.splice(pos, 1); desenhar();
  const barra = document.createElement('div');
  barra.className = 'fr-desfazer';
  barra.innerHTML = `<span>Item apagado</span><button type="button">↩ Desfazer</button>`;
  document.getElementById('ferramentas-ov')?.appendChild(barra);
  const a = { it, lista, pos, barra, timer: setTimeout(_confirmarApagar, 5000) };
  _apagando = a;
  barra.querySelector('button').onclick = () => {
    if (_apagando !== a) return;
    _apagando = null; clearTimeout(a.timer); barra.remove();
    a.lista.splice(Math.min(a.pos, a.lista.length), 0, a.it); desenhar();
  };
}

// ── Caixinha de valor (opcional): grava o preço no fim do texto ──
async function editarValor(id) {
  const it = _item(id);
  if (!it) return;
  const { base, valor } = separarValor(it.texto);
  const atual = valor ? String(valor.toFixed(2)).replace('.', ',') : '';
  const novo = await pedirTexto({ titulo: valor ? 'Quanto custa?' : 'Adicionar valor', valor: atual, placeholder: 'Ex.: 25,90 (vazio = sem valor)', ok: 'Salvar', max: 15, numero: true });
  if (novo == null) return;
  const limpo = novo.replace(/[^\d.,]/g, '');
  const n = limpo ? Number(limpo.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) : 0;
  if (limpo && !(n > 0)) { showToast('Não entendi o valor. Ex.: 25,90', 'error'); return; }
  const texto = n > 0 ? `${base} ${reais(n).replace(/\u00a0/g, ' ')}` : base;
  if (texto === it.texto) return;
  const antes = it.texto;
  it.texto = texto; desenhar();
  try { await editarItem(id, texto); } catch (e) { it.texto = antes; desenhar(); showToast(e.message, 'error'); }
}

async function editarInline(id) {
  const it = _item(id);
  if (!it) return;
  const novo = await pedirTexto({ titulo: 'Editar item', valor: it.texto, max: 500 });
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === it.texto) return;
  it.texto = t; desenhar();
  try { await editarItem(id, t); } catch (e) { showToast(e.message, 'error'); }
}

// Mini-modal bonito (substitui o prompt() nativo): título, campo, sugestões
// opcionais, Cancelar/OK. Resolve com o texto (ou null se cancelar).
// numero = teclado de número e aceita vazio (caixinha de valor: vazio tira o valor)
function pedirTexto({ titulo, valor = '', placeholder = '', sugestoes = [], ok = 'Salvar', max = 60, numero = false }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'fr-mini-ov';
    ov.innerHTML = `
      <div class="fr-mini">
        <div class="fr-mini-tit">${esc(titulo)}</div>
        <input class="fr-mini-input" id="fr-mini-in" value="${esc(valor)}" placeholder="${esc(placeholder)}" maxlength="${max}" autocomplete="off"${numero ? ' inputmode="decimal"' : ''} />
        ${sugestoes.length ? `<div class="fr-mini-sugs">${sugestoes.map(s => `<button type="button" class="fr-sug" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
        <div class="fr-mini-acoes">
          <button type="button" class="fr-mini-cancel" data-c>Cancelar</button>
          <button type="button" class="fr-mini-ok" data-k>${esc(ok)}</button>
        </div>
      </div>`;
    document.getElementById('ferramentas-ov')?.appendChild(ov);
    const input = ov.querySelector('#fr-mini-in');
    setTimeout(() => { input?.focus(); if (valor) input?.select(); }, 30);
    // Voltar do aparelho fecha só a janelinha (a pessoa fica no grupo)
    let porVoltar = false;
    const aoVoltar = () => { porVoltar = true; fim(null); };
    window.addEventListener('popstate', aoVoltar);
    history.pushState({ ...(history.state || {}), frMini: 1 }, '');
    const fim = (v) => {
      if (!ov.isConnected) return;
      window.removeEventListener('popstate', aoVoltar);
      ov.remove();
      if (!porVoltar) history.back();
      resolve(v);
    };
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-c]')) return fim(null);
      const sug = e.target.closest('[data-sug]');
      if (sug) { input.value = sug.dataset.sug; input.focus(); return; }
      if (e.target.closest('[data-k]')) { const t = input.value.trim(); return t || numero ? fim(t) : input.focus(); }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const t = input.value.trim(); if (t || numero) fim(t); } });
  });
}

async function novaSecao() {
  const n = await pedirTexto({ titulo: 'Nova categoria', placeholder: 'Escreva a categoria…', ok: 'Criar', sugestoes: SUGESTOES[grupoAberto] || SUGESTOES_GERAIS });
  if (!n) return;
  const g = grupos.find(x => x.nome === grupoAberto);
  try {
    const s = await adicionarSecao(grupoAberto, n);
    if (g && s) { g.secoes.push({ id: s.id, nome: s.nome, itens: [] }); abertas.add(s.id); _salvarAbertas(); }
    desenhar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function renomearSecaoUI(id) {
  const g = grupos.find(x => x.nome === grupoAberto);
  const sec = g?.secoes.find(s => s.id === id);
  if (!sec) return;
  const novo = await pedirTexto({ titulo: 'Renomear categoria', valor: sec.nome });
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === sec.nome) return;
  sec.nome = t; desenhar();
  try { await renomearSecao(id, t); } catch (e) { showToast(e.message, 'error'); }
}

async function apagarSecaoUI(id) {
  const g = grupos.find(x => x.nome === grupoAberto);
  const sec = g?.secoes.find(s => s.id === id);
  if (!sec) return;
  const ok = await confirmModal({
    title: `Apagar "${sec.nome}"?`,
    message: 'A seção e os itens dentro dela serão apagados.',
    confirmText: 'Apagar', cancelText: 'Manter', danger: true,
  });
  if (!ok) return;
  g.secoes = g.secoes.filter(s => s.id !== id); desenhar();
  try { await apagarSecao(id); } catch (e) { showToast(e.message, 'error'); }
}

async function renomear() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g) return;
  const novo = await pedirTexto({ titulo: 'Renomear grupo', valor: g.nome });
  if (novo == null) return;
  const t = novo.trim();
  if (!t || t === g.nome) return;
  const de = g.nome;
  g.nome = t; grupoAberto = t; desenhar();
  try { await renomearGrupo(de, t); } catch (e) { showToast(e.message, 'error'); }
}

async function novoGrupo() {
  const nome = await pedirTexto({ titulo: 'Novo grupo', placeholder: 'Nome do grupo', ok: 'Criar', max: 40 });
  if (nome == null) return;
  const n = nome.trim();
  if (!n) return;
  if (grupos.some(g => g.nome.toLowerCase() === n.toLowerCase())) { showToast('Já existe um grupo com esse nome.', 'info'); return; }
  try {
    const novo = await criarGrupo(n);
    if (novo) grupos.push({ nome: novo.nome, icone: novo.icone || '📌', cor: '#60a5fa', custom: true, grupoId: novo.id, soltos: [], secoes: [] });
    desenhar();
  } catch (e) { showToast(e.message, 'error'); }
}

async function apagarGrupoUI() {
  const g = grupos.find(x => x.nome === grupoAberto);
  if (!g || !g.custom) return;
  const ok = await confirmModal({
    title: `Apagar o grupo "${g.nome}"?`,
    message: 'O grupo e tudo dentro dele (seções e itens) serão apagados.',
    confirmText: 'Apagar', cancelText: 'Manter', danger: true,
  });
  if (!ok) return;
  grupos = grupos.filter(x => x !== g); grupoAberto = null; desenhar();
  try { await apagarGrupo(g.grupoId, g.nome); } catch (e) { showToast(e.message, 'error'); }
}

// Badge do card na Home (número de pendentes).
export async function pintarBadgeFerramentas() {
  try {
    const n = await contarPendentes();
    const dot = document.getElementById('metodo-dot');
    if (dot) { dot.textContent = n > 0 ? n : ''; dot.style.display = n > 0 ? '' : 'none'; }
  } catch { /* badge é acessório */ }
}
