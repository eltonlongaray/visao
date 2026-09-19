// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — CARD DA HOME
// BLOCO 3 — CRIAR / EDITAR
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  listarObjetivos, salvarObjetivo, removerObjetivo, progressoDosObjetivos,
  constanciaDosObjetivos,
} from './objetivos.js';
import { getCategories, saveCategory, getProfile, setProfile } from './banco-dados.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Seta de voltar — mesmo desenho da Caixa de Ferramentas
const SVG_VOLTAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>';

let _objClose = null;

// Os 6 pilares (áreas da vida) de "Organizando meu ideal".
// financeiro tem 2 campos (Trabalho + Propósito) — ter um trabalho ≠ fazer algo
// que te realiza.
const PILARES = [
  { k: 'corpo',      ic: '💪', nome: 'Saúde do Corpo',            hint: 'Ex: treinar, comer bem, dormir cedo, beber água' },
  { k: 'mente',      ic: '🧠', nome: 'Saúde da Mente',            hint: 'Ex: ler, estudar, focar, menos tela' },
  { k: 'emocional',  ic: '❤️', nome: 'Saúde Emocional',           hint: 'Ex: gratidão, terapia, relações que somam' },
  { k: 'espiritual', ic: '🙏', nome: 'Saúde Espiritual',          hint: 'Ex: orar, meditar, contato com a natureza' },
  { k: 'financeiro', ic: '💰', nome: 'Financeira & Profissional', dois: true },
  { k: 'social',     ic: '🎉', nome: 'Social & Lazer',            hint: 'Ex: amigos, família, hobbies, viagens' },
];

function _pilarHtml(p, ideal) {
  if (p.dois) {
    const f = ideal.financeiro || {};
    return `
      <div class="obj-pilar">
        <div class="obj-pilar-nome">${p.ic} ${p.nome}</div>
        <label class="obj-pilar-campo"><span>💼 Trabalho / Renda</span>
          <textarea data-ideal="financeiro.trabalho" rows="2" placeholder="Onde você quer chegar no trabalho e na renda">${esc(f.trabalho || '')}</textarea></label>
        <label class="obj-pilar-campo"><span>✨ Propósito — o que te realiza</span>
          <textarea data-ideal="financeiro.proposito" rows="2" placeholder="O que te faz sentir realizado, além do dinheiro">${esc(f.proposito || '')}</textarea></label>
      </div>`;
  }
  return `
    <div class="obj-pilar">
      <div class="obj-pilar-nome">${p.ic} ${p.nome}</div>
      <textarea data-ideal="${p.k}" rows="2" placeholder="${esc(p.hint)}">${esc(ideal[p.k] || '')}</textarea>
    </div>`;
}

// Lê todos os textareas de pilar e monta o objeto (trata "financeiro.trabalho").
function _coletarIdeal(root) {
  const ideal = {};
  root.querySelectorAll('[data-ideal]').forEach(t => {
    const key = t.dataset.ideal, val = t.value;
    if (key.includes('.')) {
      const [a, b] = key.split('.');
      ideal[a] = ideal[a] || {};
      ideal[a][b] = val;
    } else { ideal[key] = val; }
  });
  return ideal;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 0: TELA CHEIA (card "Meus Objetivos" dentro da Caixa de Ferramentas)
// Em cima: "Organizando meu ideal" (6 pilares, retrátil). Embaixo: "Foco e
// Disciplina" = o tracker de constância que já existia na Home.
// ═══════════════════════════════════════════════════════════════
export async function abrirObjetivos() {
  if (document.getElementById('objetivos-ov')) return;
  let ideal = {};
  try { ideal = (await getProfile())?.idealPilares || {}; } catch {}

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'objetivos-ov';
  ov.innerHTML = `
    <div class="modal ag-modal"><div class="ag-corpo">
      <div class="ag-header">
        <button class="fr-voltar" id="obj-back" type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
        <div class="ag-title">🎯 Meus Objetivos</div>
      </div>
      <div class="ag-scroll">
        <button class="obj-ideal-toggle" id="obj-ideal-toggle" type="button">
          <span class="obj-ideal-ic">🧭</span>
          <span class="obj-ideal-tit">Organizando meu ideal</span>
          <span class="obj-ideal-chev">▾</span>
        </button>
        <div class="obj-ideal-body" id="obj-ideal-body" hidden>
          <div class="bloco-sub" style="margin:2px 0 12px">Antes de escolher seus focos, defina o que é o <b>ideal</b> pra você em cada uma das 6 áreas da vida. Isso guia o que você vai priorizar embaixo.</div>
          ${PILARES.map(p => _pilarHtml(p, ideal)).join('')}
        </div>

        <div class="rf-sec-lbl" style="margin-top:18px">🔥 Foco e Disciplina</div>
        <div class="bloco-sub" style="margin:0 0 12px">Escolha as atividades que se repetem e que você quer manter com constância. O que entrar aqui vira atividade na sua Home — e eu conto sozinho a partir do Ritual.</div>
        <button class="btn-primary" id="obj-novo" type="button" style="width:100%;margin-bottom:14px">➕ Novo foco</button>
        <div id="obj-lista"><div class="obj-carregando">Carregando…</div></div>
      </div>
    </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) history.back(); });
  _objClose = trapModalBack(() => ov.remove());
  ov.querySelector('#obj-back').addEventListener('click', () => history.back());

  // "Organizando meu ideal" — retrátil
  const toggle = ov.querySelector('#obj-ideal-toggle');
  const body = ov.querySelector('#obj-ideal-body');
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.classList.toggle('aberto', !body.hidden);
  });

  // Auto-save dos pilares (debounce) — grava em profile.idealPilares
  let idealTimer = null;
  ov.querySelectorAll('[data-ideal]').forEach(t => t.addEventListener('input', () => {
    clearTimeout(idealTimer);
    idealTimer = setTimeout(() => { setProfile({ idealPilares: _coletarIdeal(ov) }).catch(() => {}); }, 500);
  }));

  ligarObjetivos();
  await montarObjetivos();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CARD DA HOME
// ═══════════════════════════════════════════════════════════════
export async function montarObjetivos() {
  const box = document.getElementById('obj-lista');
  if (!box) return;

  let objetivos = [];
  try { objetivos = await listarObjetivos(); }
  catch (e) { box.innerHTML = `<div class="obj-vazio">Não deu pra carregar: ${esc(e.message)}</div>`; return; }

  if (!objetivos.length) {
    // Sem botão aqui: o + ao lado do título já é o caminho, e dois botões
    // pra mesma ação fazem a pessoa procurar a diferença entre eles.
    box.innerHTML = `
      <div class="obj-vazio">
        Nenhum objetivo ainda. Toque no <strong>+</strong> pra declarar o primeiro.
        <span>Academia 4× por semana · jejum 1× por semana · lazer 1× por mês</span>
      </div>`;
    return;
  }

  // Progresso primeiro: é o que a pessoa espera ver. A constância olha meses
  // pra trás e chega depois, sem segurar o resto da tela.
  const prog = await progressoDosObjetivos(objetivos);
  box.innerHTML = objetivos.map(o => linhaObjetivo(o, prog.get(o.id))).join('');

  try {
    const cons = await constanciaDosObjetivos(objetivos);
    for (const [id, c] of cons) {
      if (!c.texto) continue;
      const alvo = box.querySelector(`[data-obj="${id}"] .obj-selo-lugar`);
      if (alvo) alvo.innerHTML = `<span class="obj-selo">🔥 ${esc(c.texto)}</span>`;
    }
  } catch (e) { console.warn('[objetivos] constância:', e.message); }
}

function linhaObjetivo(o, p) {
  const { feitos = 0, alvo = 1, pct = 0, cumprido = false } = p || {};
  const periodo = o.periodo === 'mes' ? 'este mês' : 'esta semana';
  // Bolinhas até 7: acima disso viram um monte ilegível e o número já diz.
  const bolinhas = alvo <= 7
    ? `<span class="obj-bolinhas">${Array.from({ length: alvo }, (_, i) =>
        `<i class="${i < feitos ? 'cheia' : ''}"></i>`).join('')}</span>`
    : '';

  return `
    <div class="obj-item ${cumprido ? 'cumprido' : ''}" data-obj="${o.id}" data-editar="${o.id}">
      <span class="obj-ic">🎯</span>
      <div class="obj-corpo">
        <div class="obj-topo">
          <span class="obj-nome">${esc(o.nome)}</span>
          <span class="obj-conta">${feitos} de ${alvo}</span>
        </div>
        <div class="obj-barra"><i style="width:${pct}%"></i></div>
        <div class="obj-sub">
          ${bolinhas}
          <span>${periodo}</span>
          <span class="obj-selo-lugar"></span>
        </div>
      </div>

    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CRIAR / EDITAR
// ═══════════════════════════════════════════════════════════════
// A opção "puxar do Ritual" é o coração disto: se a pessoa já marca a
// academia lá, marcar de novo aqui seria trabalho dobrado — e as duas
// contagens divergiriam na primeira vez que ela esquecesse uma das duas.
export async function abrirEditorObjetivo(id) {
  const objetivos = await listarObjetivos();
  const obj = id ? objetivos.find(o => o.id === id) : null;

  // "Atividades" na Home são as CATEGORIAS. O catálogo `activities` é outra
  // coisa e vinha vazio — por isso o seletor não abria nada.
  let atividades = [];
  try { atividades = await getCategories(); } catch (e) { console.warn('[objetivos] categorias:', e.message); }


  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal obj-modal">
      <h3>${obj ? 'Editar objetivo' : 'Novo objetivo'}</h3>

      <label class="input-field obj-campo-ativ">
        <div class="input-field-label">Qual atividade do Ritual</div>
        <select id="obj-atividade">
          <option value="">Toque para escolher…</option>
          ${atividades.map(a => `<option value="${esc(a.id)}" ${obj?.atividadeId === a.id ? 'selected' : ''}>${esc(a.icon || '')} ${esc(a.name || 'Atividade')}</option>`).join('')}
          <option value="__nova__">➕ Criar nova atividade…</option>
        </select>
      </label>
      <label class="input-field" id="obj-nova-wrap" hidden>
        <div class="input-field-label">Nome da nova atividade <span class="ag-lbl-opt">— entra também nas suas Atividades da Home</span></div>
        <input id="obj-nova-ativ" placeholder="Ex: Meditar, Ler, Correr…">
      </label>

      <label class="input-field"><div class="input-field-label">Vezes por dia</div>
        <input id="obj-vezes-dia" type="number" min="1" max="20" value="${Number(obj?.vezesDia) || 1}" /></label>

      <div class="obj-linha">
        <label class="input-field obj-mini"><div class="input-field-label">Quantos dias</div>
          <input id="obj-vezes" type="number" min="1" max="31" value="${Number(obj?.vezes) || 4}" /></label>
        <label class="input-field obj-mini"><div class="input-field-label">Em cada</div>
          <select id="obj-periodo">
            <option value="semana" ${obj?.periodo !== 'mes' ? 'selected' : ''}>semana</option>
            <option value="mes" ${obj?.periodo === 'mes' ? 'selected' : ''}>mês</option>
          </select></label>
      </div>
      <div class="obj-explica" id="obj-explica"></div>

      <div class="modal-actions">
        ${obj ? '<button class="btn-secondary" id="obj-excluir" style="color:var(--red)">Excluir</button>' : ''}
        <button class="btn-secondary" id="obj-cancelar">Cancelar</button>
        <button class="btn-primary" id="obj-salvar">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const selAtiv = ov.querySelector('#obj-atividade');
  const novaWrap = ov.querySelector('#obj-nova-wrap');
  const novaInput = ov.querySelector('#obj-nova-ativ');
  // Mostra o campo de nome quando a pessoa escolhe "Criar nova atividade…"
  const syncNova = () => {
    const isNova = selAtiv.value === '__nova__';
    novaWrap.hidden = !isNova;
    if (isNova) setTimeout(() => novaInput.focus(), 50);
  };
  selAtiv.addEventListener('change', syncNova);
  syncNova();

  // Frase em português do que foi configurado. Três campos numéricos soltos
  // não dizem o que vai acontecer; a frase diz.
  const explicar = () => {
    const dia = Math.max(1, Number(ov.querySelector('#obj-vezes-dia').value) || 1);
    const dias = Math.max(1, Number(ov.querySelector('#obj-vezes').value) || 1);
    const per = ov.querySelector('#obj-periodo').value === 'mes' ? 'mês' : 'semana';
    const parteDia = dia > 1 ? `${dia}× no mesmo dia` : 'uma vez no dia';
    ov.querySelector('#obj-explica').textContent =
      `Conta um dia quando você concluir ${parteDia} no Ritual. A meta é ${dias} ${dias > 1 ? 'dias' : 'dia'} por ${per}.`;
  };
  explicar();
  ov.querySelectorAll('#obj-vezes-dia, #obj-vezes, #obj-periodo')
    .forEach(el => el.addEventListener('input', explicar));

  const fechar = () => ov.remove();
  ov.querySelector('#obj-cancelar').addEventListener('click', fechar);
  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });

  ov.querySelector('#obj-excluir')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Excluir objetivo?',
      message: 'O histórico de marcações dele some junto.',
      confirmText: 'Excluir', cancelText: 'Manter', danger: true,
    });
    if (!ok) return;
    await removerObjetivo(obj.id);
    fechar();
    await montarObjetivos();
    showToast('Objetivo removido.', 'info');
  });

  ov.querySelector('#obj-salvar').addEventListener('click', async () => {
    let atividadeId = selAtiv.value || null;
    // Sem atividade escolhida o objetivo nasceria travado em zero pra sempre:
    // não haveria o que contar.
    if (!atividadeId) { showToast('Escolhe a atividade do Ritual.', 'info'); return; }

    let nomeAtiv;
    if (atividadeId === '__nova__') {
      // Cria a atividade que ainda não existe e já a joga nas Atividades da Home.
      const novoNome = novaInput.value.trim();
      if (!novoNome) { showToast('Dá um nome pra nova atividade.', 'info'); novaInput.focus(); return; }
      try {
        const order = (atividades.length ? Math.max(...atividades.map(a => a.order || 0)) : 0) + 1;
        atividadeId = await saveCategory(null, {
          name: novoNome, icon: '🎯', color: '#a78bfa',
          order, daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        });
        // Avisa a Home pra ela repintar as Atividades com a nova (se estiver aberta atrás).
        document.dispatchEvent(new CustomEvent('falcon:cats-changed'));
      } catch (e) { showToast('Erro ao criar atividade: ' + e.message, 'error'); return; }
      nomeAtiv = novoNome;
    } else {
      nomeAtiv = selAtiv.options[selAtiv.selectedIndex]?.text?.trim() || 'Objetivo';
    }

    await salvarObjetivo({
      id: obj?.id,
      nome: nomeAtiv,
      vezes: Math.max(1, Number(ov.querySelector('#obj-vezes').value) || 1),
      vezesDia: Math.max(1, Number(ov.querySelector('#obj-vezes-dia').value) || 1),
      periodo: ov.querySelector('#obj-periodo').value,
      origem: 'ritual',
      atividadeId,
      atividadeNome: nomeAtiv,
    });
    fechar();
    await montarObjetivos();
    showToast('✅ Objetivo salvo!', 'success');
  });
}

// Delegação: a Home é redesenhada inteira, então ouvir no documento evita
// religar os eventos a cada render.
export function ligarObjetivos() {
  if (document.body.dataset.objLigado) return;
  document.body.dataset.objLigado = '1';

  document.addEventListener('click', async (ev) => {
    if (ev.target.closest('#obj-novo')) {
      await abrirEditorObjetivo(null);
      return;
    }

    // Sem botão de três pontos: o card inteiro é o caminho de edição. Um
    // botão só pra abrir o que o toque no card já abriria era peso a mais.
    const ed = ev.target.closest('[data-editar]');
    if (ed && ed.closest('#obj-lista')) {
      await abrirEditorObjetivo(ed.dataset.editar);
    }
  });
}
