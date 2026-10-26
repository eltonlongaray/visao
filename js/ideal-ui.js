// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS E UTILITÁRIOS
// BLOCO 2 — OS 6 PILARES (listas prontas)
// BLOCO 3 — ESTADO (carregar / migrar / salvar)
// BLOCO 4 — POPUP "ORGANIZANDO MEU IDEAL" (grade de pilares ↔ checklist)
// ─────────────────────────────────────────────────────────────
// Funil (Élton, 26/10): IDEAL (marco tudo o que me faz bem, em cada área) →
// "o que é prioridade pra manter constância?" → ⭐ PRIORIDADES › 🔥 Atividades
// (lá cria a atividade e a meta de quantas vezes) → RITUAL (execução).
// Marcar NÃO cria nada na Home: é a visão. O item mostra se já é prioridade e
// se já virou atividade com meta.

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS E UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════
import { getProfile, setProfile, getCategories } from './banco-dados.js';
import { listarObjetivos } from './objetivos.js';
import { carregarFerramentas, adicionarPrioridade, ehPrioAtividade, valorDoItem } from './ferramentas.js';
import { trapModalBack } from './modal-voltar.js';
import { showToast } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const SVG_VOLTAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>';
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const itemId = (k, txt) => `${k}:${slug(txt)}`;
const norm = (s) => String(s || '').trim().toLowerCase();

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: OS 6 PILARES (listas prontas)
// ═══════════════════════════════════════════════════════════════
export const PILARES = [
  { k: 'corpo', ic: '💪', nome: 'Físico', cor: '#22c55e', secoes: [{ itens: [
    'Treinar musculação', 'Fazer exercício aeróbico (caminhar, correr, pedalar)', 'Alongar / mobilidade',
    'Beber água suficiente', 'Dormir 7 a 8 horas', 'Comer mais proteína', 'Comer mais frutas e verduras',
    'Reduzir açúcar e ultraprocessados', 'Fazer check-up médico', 'Cuidar da postura', 'Tomar sol pela manhã',
  ] }] },
  { k: 'mente', ic: '🧠', nome: 'Mental', cor: '#3b82f6', secoes: [{ itens: [
    'Ler', 'Estudar algo novo', 'Menos tempo de tela e redes sociais', 'Meditar',
    'Breathwork (respiração consciente)',
    'Planejar o dia', 'Escrever um diário', 'Aprender um idioma', 'Resolver desafios (xadrez, quebra-cabeça)',
  ] }] },
  { k: 'emocional', ic: '❤️', nome: 'Emocional', cor: '#ec4899', secoes: [{ itens: [
    'Praticar gratidão', 'Fazer terapia', 'Saber dizer não', 'Cuidar da autoestima',
    'Controlar a ansiedade', 'Expressar o que sinto', 'Perdoar e deixar ir', 'Ter momentos só meus',
  ] }] },
  { k: 'espiritual', ic: '🙏', nome: 'Espiritual', cor: '#a855f7', secoes: [{ itens: [
    'Orar', 'Meditar em silêncio', 'Ler textos sagrados ou inspiradores', 'Frequentar minha comunidade de fé',
    'Ter contato com a natureza', 'Fazer caridade / voluntariado', 'Refletir sobre meu propósito',
  ] }] },
  { k: 'financeiro', ic: '💰', nome: 'Financeiro & Profissional', cor: '#eab308', secoes: [
    { tit: '💼 Trabalho & Renda', itens: [
      'Montar reserva de emergência', 'Investir', 'Controlar os gastos', 'Sair das dívidas',
      'Aumentar minha renda', 'Fazer um curso da minha área', 'Crescer na carreira ou empreender',
    ] },
    { tit: '✨ Propósito', itens: [
      'Fazer um trabalho que me realize', 'Ajudar pessoas com o que eu faço', 'Usar meus talentos', 'Deixar um legado',
    ] },
  ] },
  { k: 'social', ic: '🎉', nome: 'Social & Lazer', cor: '#f97316', secoes: [{ itens: [
    'Passar tempo com a família', 'Encontrar os amigos', 'Ter um hobby', 'Viajar', 'Conhecer lugares novos',
    'Sair pra me divertir', 'Praticar esporte com amigos', 'Cuidar do meu relacionamento',
  ] }] },
];

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESTADO — profile.idealItens = { [pilar]: { sel:[ids], extras:[{id,txt}] } }
// ═══════════════════════════════════════════════════════════════
let _estado = null;
let _saveT = null;

// Converte o formato antigo (textos livres em profile.idealPilares) em itens
// "seus" já marcados — assim nada que a pessoa escreveu se perde.
// Itens renomeados (o ID sai do texto): quem já tinha marcado o nome antigo
// continua marcado. Os itens não trazem frequência — quem define é a pessoa,
// na Meta de Constância.
const ALIAS = {
  'mente:ler-todos-os-dias': 'mente:ler',
  'financeiro:investir-todo-mes': 'financeiro:investir',
};
function _aplicarAlias(est) {
  for (const v of Object.values(est)) {
    if (Array.isArray(v?.sel)) v.sel = [...new Set(v.sel.map(id => ALIAS[id] || id))];
  }
  return est;
}

function _migrar(p) {
  if (p?.idealItens) return _aplicarAlias(JSON.parse(JSON.stringify(p.idealItens)));
  const est = {};
  const old = p?.idealPilares || {};
  const add = (k, txt) => {
    for (const linha of String(txt || '').split(/\n+/)) {
      const t = linha.trim(); if (!t) continue;
      est[k] = est[k] || { sel: [], extras: [] };
      const id = `${k}:x-${slug(t)}`;
      if (!est[k].extras.some(x => x.id === id)) { est[k].extras.push({ id, txt: t }); est[k].sel.push(id); }
    }
  };
  for (const k of ['corpo', 'mente', 'emocional', 'espiritual', 'social']) add(k, old[k]);
  if (old.financeiro && typeof old.financeiro === 'object') { add('financeiro', old.financeiro.trabalho); add('financeiro', old.financeiro.proposito); }
  return est;
}

const _p = (k) => (_estado[k] = _estado[k] || { sel: [], extras: [] });

function _salvarJa() {
  clearTimeout(_saveT); _saveT = null;
  return setProfile({ idealItens: _estado }).catch(e => showToast('Não salvou: ' + e.message, 'error'));
}
function _salvar() { clearTimeout(_saveT); _saveT = setTimeout(_salvarJa, 400); }

async function _carregar() {
  let p = {};
  try { p = (await getProfile()) || {}; } catch {}
  _estado = _migrar(p);
}

// Quantos itens marcados no total (pro resumo no card de Meus Objetivos).
export async function totalMarcadosIdeal() {
  if (!_estado) await _carregar();
  return Object.values(_estado).reduce((n, v) => n + (v?.sel?.length || 0), 0);
}

// ── Pro Pet (BLOCO 8.15 do assistente): ler e gravar o Ideal sem abrir a tela ──
// Lista achatada de todos os itens (sugeridos + os da pessoa) com o pilar.
export async function idealItens() {
  if (_saveT) await _salvarJa();
  await _carregar();
  const out = [];
  for (const p of PILARES) {
    const est = _p(p.k);
    p.secoes.forEach(sec => sec.itens.forEach(t => {
      const id = itemId(p.k, t);
      out.push({ k: p.k, pilar: p, id, txt: t, sel: est.sel.includes(id), seu: false });
    }));
    est.extras.forEach(x => out.push({ k: p.k, pilar: p, id: x.id, txt: x.txt, sel: est.sel.includes(x.id), seu: true }));
  }
  return out;
}
// Marca (on=true) ou desmarca itens; `novo` = { k, txt } cria um item da pessoa já marcado.
export async function idealGravar({ marcar = [], desmarcar = [], novos = [] } = {}) {
  if (_saveT) await _salvarJa();
  await _carregar();
  for (const { k, id } of marcar) { const e = _p(k); e.sel = [...new Set([...e.sel, id])]; }
  for (const { k, id } of desmarcar) { const e = _p(k); e.sel = e.sel.filter(x => x !== id); }
  for (const { k, txt } of novos) {
    const e = _p(k), id = `${k}:x-${slug(txt)}`;
    if (!e.extras.some(x => x.id === id)) e.extras.push({ id, txt });
    e.sel = [...new Set([...e.sel, id])];
  }
  return _salvarJa();
}
// 'foco' (em constância), 'ativ' (nas Atividades) ou null, por texto do item
export async function idealStatus() {
  const st = await _status();
  return { st, de: (txt) => _statusItem(st, txt) };
}

// Descobre, pelo nome, se o item já virou atividade (e se tem foco de constância).
async function _status() {
  const [cats, objs, grupos] = await Promise.all([getCategories().catch(() => []), listarObjetivos().catch(() => []), carregarFerramentas().catch(() => [])]);
  // ⭐ Prioridades de atividade, pelo texto (sem o preço, se tiver)
  const prio = new Map();
  for (const g of grupos) for (const it of [...g.soltos, ...g.secoes.flatMap(x => x.itens)]) {
    if (it.prioridade == null || !ehPrioAtividade(it)) continue;
    prio.set(norm(valorDoItem(it.texto) ? it.texto.replace(/\s*R\$.*$/i, '') : it.texto), it);
  }
  return {
    cats, prio,
    porNome: new Map(cats.map(c => [norm(c.name), c])),
    focoIds: new Set(objs.map(o => o.atividadeId).filter(Boolean)),
    metaDe: new Map(objs.filter(o => o.atividadeId).map(o => [o.atividadeId, o])),
  };
}
// Ações do item: atividade criada pela prioridade dele (prioItemId), ou com o
// mesmo nome (as criadas antes), cada uma com a meta, se tiver.
function _acoes(st, id, txt) {
  const pr = st.prio.get(norm(txt));
  return st.cats.filter(c => c.idealItem === id || norm(c.name) === norm(txt) || (pr && c.prioItemId === pr.id))
    .map(c => ({ cat: c, meta: st.metaDe.get(c.id) || null }));
}
const _metaTxt = (m) => m ? `${Math.max(1, Number(m.vezes) || 1)}x por ${m.periodo === 'mes' ? 'mês' : 'semana'}` : 'sem meta';
function _statusItem(st, txt) {
  const c = st.porNome.get(norm(txt));
  if (!c) return null;
  return st.focoIds.has(c.id) ? 'foco' : 'ativ';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: POPUP — grade dos 6 pilares ↔ checklist do pilar
// ═══════════════════════════════════════════════════════════════
export async function abrirIdeal({ aoFechar } = {}) {
  if (document.getElementById('ideal-ov')) return;
  if (_saveT) await _salvarJa();
  await _carregar();

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'ideal-ov';
  ov.innerHTML = `<div class="modal ag-modal ideal-modal"><div class="ag-corpo" id="ideal-corpo"><div class="ag-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);

  let vista = 'grade', pilarK = null, st = null, fecharPilar = null;
  const corpo = ov.querySelector('#ideal-corpo');
  // Texto de um item pelo id (lista pronta ou item da pessoa)
  const _txtDoId = (k, id) => {
    const pilar = PILARES.find(p => p.k === k);
    for (const sec of pilar?.secoes || []) for (const t of sec.itens) if (itemId(k, t) === id) return t;
    return _p(k).extras.find(x => x.id === id)?.txt || '';
  };
  // A grade mostra quantos itens já têm ação: carrega o status sem travar a tela
  _status().then(r => { st = r; if (vista === 'grade' && document.getElementById('ideal-ov')) desenharGrade(); }).catch(() => {});

  trapModalBack(() => {
    if (_saveT) _salvarJa(); ov.remove(); aoFechar?.();
    // Escolheu prioridades: abre a tela delas (ferramentas-ui escuta)
    if (irPrioridades) setTimeout(() => document.dispatchEvent(new CustomEvent('falcon:ir-prioridades')), 80);
  });
  ov.addEventListener('click', (e) => { if (e.target === ov) history.back(); });

  // Popup (não é página inteira): X no canto superior direito FECHA a janela.
  // Dentro de um pilar aparece também a seta ‹ à esquerda, que volta pra grade.
  const header = (titulo, voltar = false) => `
    <div class="ag-header">
      ${voltar ? `<button class="fr-voltar" data-voltar type="button" aria-label="Voltar aos pilares">${SVG_VOLTAR}</button>` : ''}
      <div class="ag-title">${titulo}</div>
      <button class="fr-x" data-fechar type="button" aria-label="Fechar">✕</button>
    </div>`;

  function desenharGrade() {
    corpo.innerHTML = `
      ${header('🧭 Organizando meu ideal')}
      <div class="ag-scroll">
        <div class="bloco-sub" style="margin:0 0 14px">Toque numa área da vida e marque tudo o que faz bem pra você. Depois a gente escolhe o que é prioridade pra manter a constância no dia a dia.</div>
        <div class="ideal-grid">
          ${PILARES.map(p => {
            const n = _p(p.k).sel.length;
            const comPlano = st ? _p(p.k).sel.filter(id => _acoes(st, id, _txtDoId(p.k, id)).some(a => a.meta)).length : null;
            return `<button class="ideal-pilar" data-pilar="${p.k}" type="button">
              <span class="ideal-pilar-ic" style="background:${p.cor}22">${p.ic}</span>
              <span class="ideal-pilar-nome">${p.nome}</span>
              <span class="ideal-pilar-n ${n ? 'tem' : ''}">${n ? `${n} importante${n > 1 ? 's' : ''}` : 'Nada marcado'}</span>
              ${n && comPlano ? `<span class="ideal-pilar-plano ${comPlano === n ? 'ok' : ''}">${comPlano} com meta</span>` : ''}
            </button>`;
          }).join('')}
        </div>
        ${totalSel() ? `<button class="btn-primary ideal-prio-btn" data-prio type="button">⭐ Agora: o que é prioridade pra manter constância?</button>` : ''}
      </div>`;
    corpo.querySelector('[data-fechar]').onclick = () => history.back();
    corpo.querySelectorAll('[data-pilar]').forEach(b => b.onclick = () => entrarPilar(b.dataset.pilar));
    corpo.querySelector('[data-prio]')?.addEventListener('click', entrarPrioridade);
  }
  const totalSel = () => PILARES.reduce((n, p) => n + _p(p.k).sel.length, 0);

  // ⭐ Escolher prioridades: tudo o que foi marcado, por área. O que já é
  // prioridade vem marcado (e travado). Confirmar leva pras ⭐ Prioridades.
  let irPrioridades = false;
  async function entrarPrioridade() {
    vista = 'prio';
    fecharPilar = trapModalBack(() => { vista = 'grade'; fecharPilar = null; desenharGrade(); });
    if (_saveT) await _salvarJa();
    corpo.innerHTML = `${header('⭐ Prioridades', true)}<div class="ag-load">Carregando…</div>`;
    st = await _status();
    if (vista !== 'prio') return;
    const blocos = PILARES.filter(p => _p(p.k).sel.length).map(p => `
      <div class="ideal-sec">${p.ic} ${p.nome}</div>
      ${_p(p.k).sel.map(id => {
        const txt = _txtDoId(p.k, id); if (!txt) return '';
        const ja = st.prio.has(norm(txt)) || _acoes(st, id, txt).length > 0;
        return `<div class="ideal-item ${ja ? 'on' : ''}">
          <label class="ideal-check">
            <input type="checkbox" data-pri="${esc(txt)}" ${ja ? 'checked disabled' : ''}>
            <span class="ideal-box"></span>
            <span class="ideal-txt">${esc(txt)}${ja ? ' <small class="ideal-ja">já está nas prioridades</small>' : ''}</span>
          </label>
        </div>`;
      }).join('')}`).join('');
    corpo.innerHTML = `
      ${header('⭐ O que é prioridade?', true)}
      <div class="ag-scroll">
        <div class="bloco-sub" style="margin:0 0 6px">Disso tudo, o que você quer manter com constância no dia a dia? Marque. Vai pras <b>⭐ Prioridades › 🔥 Atividades</b>, onde você põe na ordem e cria a atividade com a meta de quantas vezes.</div>
        ${blocos}
        <button class="btn-primary ideal-prio-btn" data-levar type="button" disabled>Levar pras Prioridades</button>
      </div>`;
    corpo.querySelector('[data-voltar]').onclick = () => history.back();
    corpo.querySelector('[data-fechar]').onclick = () => history.go(-2);
    const btn = corpo.querySelector('[data-levar]');
    const novos = () => [...corpo.querySelectorAll('[data-pri]:checked:not(:disabled)')].map(x => x.dataset.pri);
    corpo.querySelectorAll('[data-pri]').forEach(cb => cb.onchange = () => {
      const n = novos().length;
      btn.disabled = !n;
      btn.textContent = n ? `Levar ${n} pras Prioridades` : 'Levar pras Prioridades';
    });
    btn.onclick = async () => {
      const lista = novos(); if (!lista.length) return;
      btn.disabled = true;
      try {
        for (const t of lista) await adicionarPrioridade(t, true);
        showToast(`⭐ ${lista.length > 1 ? `${lista.length} itens foram` : 'Foi'} pras Prioridades`, 'success');
        irPrioridades = true;
        history.go(-2);   // fecha o Ideal; quem abriu leva pras Prioridades
      } catch (e) { btn.disabled = false; showToast('Erro: ' + e.message, 'error'); }
    };
  }

  async function entrarPilar(k) {
    pilarK = k; vista = 'pilar';
    // Back do aparelho no checklist volta pra grade (não fecha a janela toda).
    fecharPilar = trapModalBack(() => { vista = 'grade'; pilarK = null; fecharPilar = null; desenharGrade(); });
    corpo.innerHTML = `${header('…', true)}<div class="ag-load">Carregando…</div>`;
    st = await _status();
    if (vista === 'pilar' && pilarK === k) desenharPilar();
  }

  function desenharPilar() {
    const pilar = PILARES.find(p => p.k === pilarK); if (!pilar) return;
    const est = _p(pilar.k);
    const scrollAntes = corpo.querySelector('.ag-scroll')?.scrollTop || 0;

    const linha = (id, txt, seu) => {
      const on = est.sel.includes(id);
      let acoes = '';
      if (on) {
        const lista = _acoes(st, id, txt);
        acoes = lista.length
          ? lista.map(a => `<span class="ideal-tag ${a.meta ? 'ativ' : 'foco'}">✅ ${esc(a.cat.icon || '')} ${esc(a.cat.name)} · ${_metaTxt(a.meta)}</span>`).join('')
          : st.prio.has(norm(txt)) ? '<span class="ideal-tag foco">⭐ Nas prioridades</span>' : '';
      }
      return `
        <div class="ideal-item ${on ? 'on' : ''}">
          <label class="ideal-check">
            <input type="checkbox" data-sel="${id}" ${on ? 'checked' : ''}>
            <span class="ideal-box"></span>
            <span class="ideal-txt">${esc(txt)}</span>
          </label>
          ${seu ? `<button class="ideal-rm" data-rm="${id}" type="button" aria-label="Remover">✕</button>` : ''}
          ${on && acoes ? `<div class="ideal-acoes">${acoes}</div>` : ''}
        </div>`;
    };

    const txtDe = new Map();
    pilar.secoes.forEach(sec => sec.itens.forEach(t => txtDe.set(itemId(pilar.k, t), t)));
    est.extras.forEach(x => txtDe.set(x.id, x.txt));

    corpo.innerHTML = `
      ${header(`${pilar.ic} ${pilar.nome}`, true)}
      <div class="ag-scroll">
        <div class="bloco-sub" style="margin:0 0 6px">Marque tudo o que faz bem pra você nessa área. Depois, na tela das áreas, você escolhe o que é prioridade pra manter a constância.</div>
        ${pilar.secoes.map(sec => `
          ${sec.tit ? `<div class="ideal-sec">${sec.tit}</div>` : ''}
          ${sec.itens.map(t => linha(itemId(pilar.k, t), t, false)).join('')}`).join('')}
        ${est.extras.length ? `<div class="ideal-sec">⭐ Seus itens</div>${est.extras.map(x => linha(x.id, x.txt, true)).join('')}` : ''}
        <form class="ideal-add" data-add>
          <input maxlength="80" placeholder="Adicionar outro item…" aria-label="Adicionar outro item">
          <button class="btn-primary" type="submit">➕</button>
        </form>
      </div>`;

    const scroll = corpo.querySelector('.ag-scroll');
    if (scroll) scroll.scrollTop = scrollAntes;

    // ‹ volta pra grade (tira só a camada do pilar); X fecha tudo (as 2 camadas).
    corpo.querySelector('[data-voltar]').onclick = () => history.back();
    corpo.querySelector('[data-fechar]').onclick = () => history.go(-2);

    corpo.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => {
      const id = cb.dataset.sel;
      est.sel = cb.checked ? [...new Set([...est.sel, id])] : est.sel.filter(x => x !== id);
      _salvar(); desenharPilar();
    });

    corpo.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const id = b.dataset.rm;
      est.extras = est.extras.filter(x => x.id !== id);
      est.sel = est.sel.filter(x => x !== id);
      _salvar(); desenharPilar();
    });

    corpo.querySelector('[data-add]').onsubmit = (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const t = inp.value.trim(); if (!t) return;
      const sugerido = [...txtDe.entries()].find(([, v]) => norm(v) === norm(t));
      if (sugerido) {
        est.sel = [...new Set([...est.sel, sugerido[0]])];
      } else {
        const id = `${pilar.k}:x-${slug(t)}`;
        est.extras.push({ id, txt: t });
        est.sel = [...new Set([...est.sel, id])];
      }
      _salvar(); desenharPilar();
      corpo.querySelector('[data-add] input')?.focus();
    };
  }

  desenharGrade();
}
