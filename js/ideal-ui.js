// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS E UTILITÁRIOS
// BLOCO 2 — OS 6 PILARES (listas prontas)
// BLOCO 3 — ESTADO (carregar / migrar / salvar)
// BLOCO 4 — POPUP "ORGANIZANDO MEU IDEAL" (grade de pilares ↔ checklist)
// ─────────────────────────────────────────────────────────────
// Funil: IDEAL (marco o que importa) → FOCO (🔥 constância, com meta) ou só
// ATIVIDADE (📋 aparece na Home, sem meta) → RITUAL (execução).
// Marcar NÃO cria nada na Home: é a visão. Só os botões de cada item criam.

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS E UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════
import { getProfile, setProfile, getCategories, saveCategory } from './banco-dados.js';
import { listarObjetivos } from './objetivos.js';
import { trapModalBack } from './modal-voltar.js';
import { showToast } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
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
    'Ler todos os dias', 'Estudar algo novo', 'Menos tempo de tela e redes sociais', 'Meditar',
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
      'Montar reserva de emergência', 'Investir todo mês', 'Controlar os gastos', 'Sair das dívidas',
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
function _migrar(p) {
  if (p?.idealItens) return JSON.parse(JSON.stringify(p.idealItens));
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

// Descobre, pelo nome, se o item já virou atividade (e se tem foco de constância).
async function _status() {
  const [cats, objs] = await Promise.all([getCategories().catch(() => []), listarObjetivos().catch(() => [])]);
  return {
    cats,
    porNome: new Map(cats.map(c => [norm(c.name), c])),
    focoIds: new Set(objs.map(o => o.atividadeId).filter(Boolean)),
  };
}
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

  trapModalBack(() => { if (_saveT) _salvarJa(); ov.remove(); aoFechar?.(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) history.back(); });

  // Popup (não é página inteira): só um X no canto superior direito. Na grade o
  // X fecha a janela; dentro de um pilar ele fecha o pilar e volta pra grade.
  const header = (titulo) => `
    <div class="ag-header">
      <div class="ag-title">${titulo}</div>
      <button class="fr-x" data-back type="button" aria-label="Fechar">✕</button>
    </div>`;

  function desenharGrade() {
    corpo.innerHTML = `
      ${header('🧭 Organizando meu ideal')}
      <div class="ag-scroll">
        <div class="bloco-sub" style="margin:0 0 14px">Toque numa área da vida e marque o que é importante pra você. Depois você escolhe o que vai acompanhar com constância.</div>
        <div class="ideal-grid">
          ${PILARES.map(p => {
            const n = _p(p.k).sel.length;
            return `<button class="ideal-pilar" data-pilar="${p.k}" type="button">
              <span class="ideal-pilar-ic" style="background:${p.cor}22">${p.ic}</span>
              <span class="ideal-pilar-nome">${p.nome}</span>
              <span class="ideal-pilar-n ${n ? 'tem' : ''}">${n ? `${n} ✓` : 'Nada marcado'}</span>
            </button>`;
          }).join('')}
        </div>
      </div>`;
    corpo.querySelector('[data-back]').onclick = () => history.back();
    corpo.querySelectorAll('[data-pilar]').forEach(b => b.onclick = () => entrarPilar(b.dataset.pilar));
  }

  async function entrarPilar(k) {
    pilarK = k; vista = 'pilar';
    // Back do aparelho no checklist volta pra grade (não fecha a janela toda).
    fecharPilar = trapModalBack(() => { vista = 'grade'; pilarK = null; fecharPilar = null; desenharGrade(); });
    corpo.innerHTML = `${header('…')}<div class="ag-load">Carregando…</div>`;
    st = await _status();
    if (vista === 'pilar' && pilarK === k) desenharPilar();
  }

  function desenharPilar() {
    const pilar = PILARES.find(p => p.k === pilarK); if (!pilar) return;
    const est = _p(pilar.k);
    const scrollAntes = corpo.querySelector('.ag-scroll')?.scrollTop || 0;

    const linha = (id, txt, seu) => {
      const on = est.sel.includes(id);
      const s = on ? _statusItem(st, txt) : null;
      let acoes = '';
      if (on) {
        if (s === 'foco') acoes = '<span class="ideal-tag foco">🔥 Em constância</span>';
        else if (s === 'ativ') acoes = `<span class="ideal-tag ativ">✓ Nas Atividades</span>
            <button class="ideal-btn foco" data-foco="${id}" type="button">🔥 Acompanhar constância</button>`;
        else acoes = `<button class="ideal-btn foco" data-foco="${id}" type="button">🔥 Acompanhar constância</button>
            <button class="ideal-btn ativ" data-ativ="${id}" type="button">📋 Só nas Atividades</button>`;
      }
      return `
        <div class="ideal-item ${on ? 'on' : ''}">
          <label class="ideal-check">
            <input type="checkbox" data-sel="${id}" ${on ? 'checked' : ''}>
            <span class="ideal-box"></span>
            <span class="ideal-txt">${esc(txt)}</span>
          </label>
          ${seu ? `<button class="ideal-rm" data-rm="${id}" type="button" aria-label="Remover">✕</button>` : ''}
          ${on ? `<div class="ideal-acoes">${acoes}</div>` : ''}
        </div>`;
    };

    const txtDe = new Map();
    pilar.secoes.forEach(sec => sec.itens.forEach(t => txtDe.set(itemId(pilar.k, t), t)));
    est.extras.forEach(x => txtDe.set(x.id, x.txt));

    corpo.innerHTML = `
      ${header(`${pilar.ic} ${pilar.nome}`)}
      <div class="ag-scroll">
        <div class="bloco-sub" style="margin:0 0 6px">Marque o que é importante pra você. Em cada item marcado, escolha: <b>acompanhar a constância</b> (vira foco com meta e entra na Home) ou <b>só colocar nas Atividades</b>.</div>
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

    corpo.querySelector('[data-back]').onclick = () => history.back();

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

    // 📋 Só nas Atividades — cria a atividade na Home (sem meta de constância).
    corpo.querySelectorAll('[data-ativ]').forEach(b => b.onclick = async () => {
      const txt = txtDe.get(b.dataset.ativ); if (!txt) return;
      if (st.porNome.has(norm(txt))) { showToast('Já está nas suas Atividades', 'info'); return; }
      b.disabled = true;
      try {
        const order = (st.cats.length ? Math.max(...st.cats.map(c => c.order || 0)) : 0) + 1;
        await saveCategory(null, { name: txt, icon: pilar.ic, color: pilar.cor, order, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
        document.dispatchEvent(new CustomEvent('falcon:cats-changed'));
        showToast('📋 Adicionado às Atividades da Home', 'success');
        st = await _status(); desenharPilar();
      } catch (e) { b.disabled = false; showToast('Erro: ' + e.message, 'error'); }
    });

    // 🔥 Acompanhar constância — abre o editor de foco já com o item preenchido.
    corpo.querySelectorAll('[data-foco]').forEach(b => b.onclick = async () => {
      const txt = txtDe.get(b.dataset.foco); if (!txt) return;
      // Grava a marcação pendente ANTES: o foco também grava no perfil, e dois
      // salvamentos simultâneos se sobrescreveriam.
      if (_saveT) await _salvarJa();
      const { abrirEditorObjetivo } = await import('./objetivos-ui.js');
      abrirEditorObjetivo(null, {
        novoNome: txt, icone: pilar.ic, cor: pilar.cor,
        aoSalvar: async () => { st = await _status(); if (vista === 'pilar') desenharPilar(); },
      });
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
