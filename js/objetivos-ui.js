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
import { getActivities } from './banco-dados.js';
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
    box.innerHTML = `
      <div class="obj-vazio">
        <strong>O que você quer manter com constância?</strong>
        Academia 4× por semana, dormir cedo, jejum 1× por semana…<br>
        Declare o alvo e o Desempenho passa a medir contra ele.
        <button class="btn-secondary obj-vazio-btn" id="obj-primeiro">Criar meu primeiro objetivo</button>
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

  let atividades = [];
  try { atividades = await getActivities(); } catch { /* segue com marcação manual */ }

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box obj-modal">
      <h3>${obj ? 'Editar objetivo' : 'Novo objetivo'}</h3>

      <label class="input-field"><div class="input-field-label">O que você quer manter</div>
        <input id="obj-nome" placeholder="Academia" maxlength="40" value="${esc(obj?.nome || '')}" /></label>

      <div class="obj-linha">
        <label class="input-field obj-mini"><div class="input-field-label">Ícone</div>
          <input id="obj-icone" maxlength="2" value="${esc(obj?.icone || '🎯')}" /></label>
        <label class="input-field obj-mini"><div class="input-field-label">Quantas vezes</div>
          <input id="obj-vezes" type="number" min="1" max="31" value="${Number(obj?.vezes) || 4}" /></label>
        <label class="input-field obj-mini"><div class="input-field-label">Período</div>
          <select id="obj-periodo">
            <option value="semana" ${obj?.periodo !== 'mes' ? 'selected' : ''}>por semana</option>
            <option value="mes" ${obj?.periodo === 'mes' ? 'selected' : ''}>por mês</option>
          </select></label>
      </div>

      <div class="input-field-label" style="margin-top:6px">Como contar</div>
      <div class="obj-modos">
        <button type="button" class="obj-modo ${obj?.origem !== 'manual' ? 'ativo' : ''}" data-modo="ritual">
          <strong>Pelo Ritual</strong>
          <span>Conta sozinho quando você conclui a atividade</span>
        </button>
        <button type="button" class="obj-modo ${obj?.origem === 'manual' ? 'ativo' : ''}" data-modo="manual">
          <strong>Na mão</strong>
          <span>Você marca aqui quando fizer</span>
        </button>
      </div>

      <label class="input-field" id="obj-ativ-campo"><div class="input-field-label">Qual atividade do Ritual</div>
        <select id="obj-atividade">
          <option value="">— escolher —</option>
          ${atividades.map(a => `<option value="${esc(a.id)}" ${obj?.atividadeId === a.id ? 'selected' : ''}>${esc(a.name || a.title || a.nome || 'Atividade')}</option>`).join('')}
        </select></label>

      <div class="modal-actions">
        ${obj ? '<button class="btn-secondary" id="obj-excluir" style="color:var(--red)">Excluir</button>' : ''}
        <button class="btn-secondary" id="obj-cancelar">Cancelar</button>
        <button class="btn-primary" id="obj-salvar">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  let modo = obj?.origem === 'manual' ? 'manual' : 'ritual';
  const campoAtiv = ov.querySelector('#obj-ativ-campo');
  const pintarModo = () => {
    ov.querySelectorAll('.obj-modo').forEach(b => b.classList.toggle('ativo', b.dataset.modo === modo));
    campoAtiv.style.display = modo === 'ritual' ? '' : 'none';
  };
  pintarModo();

  ov.querySelectorAll('.obj-modo').forEach(b =>
    b.addEventListener('click', () => { modo = b.dataset.modo; pintarModo(); }));

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
    const nome = ov.querySelector('#obj-nome').value.trim();
    if (!nome) { showToast('Dá um nome pro objetivo.', 'info'); return; }
    const atividadeId = ov.querySelector('#obj-atividade').value || null;
    // Sem atividade escolhida, "pelo Ritual" não teria o que contar e o
    // objetivo nasceria travado em zero pra sempre.
    if (modo === 'ritual' && !atividadeId) {
      showToast('Escolhe a atividade do Ritual que conta pra este objetivo.', 'info');
      return;
    }
    const sel = ov.querySelector('#obj-atividade');
    await salvarObjetivo({
      id: obj?.id,
      nome,
      icone: ov.querySelector('#obj-icone').value.trim() || '🎯',
      vezes: Math.max(1, Number(ov.querySelector('#obj-vezes').value) || 1),
      periodo: ov.querySelector('#obj-periodo').value,
      origem: modo,
      atividadeId: modo === 'ritual' ? atividadeId : null,
      atividadeNome: modo === 'ritual' ? (sel.options[sel.selectedIndex]?.text || '') : null,
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
    if (ev.target.closest('#obj-novo') || ev.target.closest('#obj-primeiro')) {
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
