// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — CARD DA HOME
// BLOCO 3 — CRIAR / EDITAR
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import {
  listarObjetivos, salvarObjetivo, removerObjetivo, alternarMarcacao,
  progressoDosObjetivos, marcadoHoje,
} from './objetivos.js';
import { getCategories } from './banco-dados.js';
import { showToast, confirmModal } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

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

  const prog = await progressoDosObjetivos(objetivos);
  box.innerHTML = objetivos.map(o => linhaObjetivo(o, prog.get(o.id))).join('');
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
    <div class="obj-item ${cumprido ? 'cumprido' : ''}" data-obj="${o.id}">
      <span class="obj-ic">${esc(o.icone || '🎯')}</span>
      <div class="obj-corpo">
        <div class="obj-topo">
          <span class="obj-nome">${esc(o.nome)}</span>
          <span class="obj-conta">${feitos} de ${alvo}</span>
        </div>
        <div class="obj-barra"><i style="width:${pct}%"></i></div>
        <div class="obj-sub">
          ${bolinhas}
          <span>${periodo}${o.origem === 'ritual' ? ' · pelo Ritual' : ''}</span>
        </div>
      </div>
      ${o.origem === 'manual'
        ? `<button class="obj-check ${marcadoHoje(o) ? 'feito' : ''}" data-marcar="${o.id}"
             aria-label="Marcar hoje">${marcadoHoje(o) ? '✓' : ''}</button>`
        : `<button class="obj-check obj-auto" data-editar="${o.id}" aria-label="Editar">⋯</button>`}
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
  try { atividades = await getCategories(); } catch { /* segue no modo manual */ }

  const manualInicial = obj?.origem === 'manual';

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box obj-modal">
      <h3>${obj ? 'Editar objetivo' : 'Novo objetivo'}</h3>

      <label class="input-field" id="obj-campo-ativ">
        <div class="input-field-label">Qual atividade do Ritual</div>
        <select id="obj-atividade">
          <option value="">— escolher —</option>
          ${atividades.map(a => `<option value="${esc(a.id)}" ${obj?.atividadeId === a.id ? 'selected' : ''}>${esc(a.icon || '')} ${esc(a.name || 'Atividade')}</option>`).join('')}
        </select>
      </label>

      <label class="input-field" id="obj-campo-nome" hidden>
        <div class="input-field-label">Nome do objetivo</div>
        <input id="obj-nome" placeholder="Ligar pra minha mãe" maxlength="40" value="${esc(obj?.nome || '')}" />
      </label>

      <label class="obj-manual">
        <input type="checkbox" id="obj-eh-manual" ${manualInicial ? 'checked' : ''} />
        <span>
          <strong>Não está no Ritual — vou marcar na mão</strong>
          <em>Sem isto, a contagem anda sozinha quando você conclui a atividade.</em>
        </span>
      </label>

      <div class="obj-linha">
        <label class="input-field obj-mini"><div class="input-field-label">Ícone</div>
          <input id="obj-icone" maxlength="2" value="${esc(obj?.icone || '🎯')}" /></label>
        <label class="input-field obj-mini"><div class="input-field-label">Vezes por dia</div>
          <input id="obj-vezes-dia" type="number" min="1" max="20" value="${Number(obj?.vezesDia) || 1}" /></label>
      </div>

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

  const chkManual = ov.querySelector('#obj-eh-manual');
  const campoAtiv = ov.querySelector('#obj-campo-ativ');
  const campoNome = ov.querySelector('#obj-campo-nome');
  const selAtiv   = ov.querySelector('#obj-atividade');

  // Frase em português do que foi configurado. Três campos numéricos soltos
  // não dizem o que vai acontecer; a frase diz.
  const explicar = () => {
    const dia = Math.max(1, Number(ov.querySelector('#obj-vezes-dia').value) || 1);
    const dias = Math.max(1, Number(ov.querySelector('#obj-vezes').value) || 1);
    const per = ov.querySelector('#obj-periodo').value === 'mes' ? 'mês' : 'semana';
    const parteDia = dia > 1 ? `${dia}× no mesmo dia` : 'uma vez no dia';
    ov.querySelector('#obj-explica').textContent =
      `Conta um dia quando você fizer ${parteDia}. A meta é ${dias} ${dias > 1 ? 'dias' : 'dia'} por ${per}.`;
  };

  const pintarModo = () => {
    const manual = chkManual.checked;
    campoAtiv.hidden = manual;
    campoNome.hidden = !manual;
    explicar();
  };
  pintarModo();
  chkManual.addEventListener('change', pintarModo);
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
    const manual = chkManual.checked;
    const atividadeId = selAtiv.value || null;
    const nomeManual = ov.querySelector('#obj-nome').value.trim();

    // Sem atividade escolhida, "pelo Ritual" não teria o que contar e o
    // objetivo nasceria travado em zero pra sempre.
    if (!manual && !atividadeId) {
      showToast('Escolhe a atividade do Ritual — ou marca que vai contar na mão.', 'info');
      return;
    }
    if (manual && !nomeManual) { showToast('Dá um nome pro objetivo.', 'info'); return; }

    const nomeAtiv = selAtiv.options[selAtiv.selectedIndex]?.text?.trim() || '';
    await salvarObjetivo({
      id: obj?.id,
      nome: manual ? nomeManual : nomeAtiv,
      icone: ov.querySelector('#obj-icone').value.trim() || '🎯',
      vezes: Math.max(1, Number(ov.querySelector('#obj-vezes').value) || 1),
      vezesDia: Math.max(1, Number(ov.querySelector('#obj-vezes-dia').value) || 1),
      periodo: ov.querySelector('#obj-periodo').value,
      origem: manual ? 'manual' : 'ritual',
      atividadeId: manual ? null : atividadeId,
      atividadeNome: manual ? null : nomeAtiv,
      marcados: obj?.marcados || [],
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
    const ed = ev.target.closest('[data-editar]');
    if (ed && ed.closest('#obj-lista')) { await abrirEditorObjetivo(ed.dataset.editar); return; }

    const mk = ev.target.closest('[data-marcar]');
    if (mk && mk.closest('#obj-lista')) {
      try { await alternarMarcacao(mk.dataset.marcar); await montarObjetivos(); }
      catch (e) { showToast(e.message, 'error'); }
    }
  });
}
