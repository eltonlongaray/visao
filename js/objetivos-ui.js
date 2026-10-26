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
import { getCategories, saveCategory } from './banco-dados.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { abrirIdeal, totalMarcadosIdeal } from './ideal-ui.js';
import { tipoRegistro, constanciaPorMusculo } from './treino-registro.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Seta de voltar — mesmo desenho da Caixa de Ferramentas
const SVG_VOLTAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4M11 19l-7-7 7-7"/></svg>';

let _objClose = null;

// ═══════════════════════════════════════════════════════════════
// BLOCO 0: TELA CHEIA (card "Meus Objetivos" dentro da Caixa de Ferramentas)
// Em cima: botão "Organizando meu ideal" (abre popup com os 6 pilares — ver
// ideal-ui.js). Embaixo: "Foco e Disciplina" = o tracker de constância.
// ═══════════════════════════════════════════════════════════════
export async function abrirObjetivos() {
  if (document.getElementById('objetivos-ov')) return;

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'objetivos-ov';
  ov.innerHTML = `
    <div class="modal ag-modal"><div class="ag-corpo">
      <div class="ag-header">
        <button class="fr-voltar" id="obj-back" type="button" aria-label="Voltar">${SVG_VOLTAR}</button>
        <div class="ag-title">🏁 Minhas Metas</div>
      </div>
      <div class="ag-scroll">
        <button class="fr-hubcard obj-ideal-card" id="obj-ideal-abrir" type="button">
          <span class="fr-hub-ic">🧭</span>
          <span class="fr-hub-tx"><b>Organizando meu ideal</b><small>Marque o que é importante em cada área da vida: físico, mental, emocional…</small></span>
          <span class="fr-hub-tag" id="obj-ideal-resumo" hidden></span>
          <span class="obj-ideal-seta" aria-hidden="true">›</span>
        </button>

        <div class="rf-sec-lbl" style="margin-top:18px">🔥 Foco e Disciplina</div>
        <div class="bloco-sub" style="margin:0 0 12px">Escolha as atividades que se repetem e que você quer manter com constância. O que entrar aqui vira atividade na sua Home — e eu conto sozinho a partir do Ritual.</div>
        <button class="btn-primary" id="obj-novo" type="button" style="width:100%;margin-bottom:14px">➕ Novo foco</button>
        <div class="rf-sec-lbl" style="margin:4px 0 10px">Meta de Constância</div>
        <div id="obj-lista"><div class="obj-carregando">Carregando…</div></div>
      </div>
    </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) history.back(); });
  _objClose = trapModalBack(() => ov.remove());
  ov.querySelector('#obj-back').addEventListener('click', () => history.back());

  // "Organizando meu ideal" — abre em popup (ideal-ui.js). O selo mostra quantos
  // itens a pessoa já marcou nos 6 pilares.
  const pintarResumoIdeal = async () => {
    const el = ov.querySelector('#obj-ideal-resumo'); if (!el) return;
    const n = await totalMarcadosIdeal().catch(() => 0);
    el.hidden = !n; el.textContent = `${n} ✓`;
  };
  ov.querySelector('#obj-ideal-abrir').addEventListener('click', () => abrirIdeal({ aoFechar: pintarResumoIdeal }));
  pintarResumoIdeal();

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
  const [prog, cats] = await Promise.all([progressoDosObjetivos(objetivos), getCategories().catch(() => [])]);
  // Meta de atividade física: o card abre e mostra a constância de cada músculo
  const fisica = new Set(objetivos.filter(o => tipoRegistro(cats.find(c => c.id === o.atividadeId))).map(o => o.id));
  box.innerHTML = objetivos.map(o => linhaObjetivo(o, prog.get(o.id), fisica.has(o.id))).join('');
  if (fisica.size) _pintarMusculos(box);

  try {
    const cons = await constanciaDosObjetivos(objetivos);
    for (const [id, c] of cons) {
      if (!c.texto) continue;
      const alvo = box.querySelector(`[data-obj="${id}"] .obj-selo-lugar`);
      if (alvo) alvo.innerHTML = `<span class="obj-selo">🔥 ${esc(c.texto)}</span>`;
    }
  } catch (e) { console.warn('[objetivos] constância:', e.message); }
}

// ── Atividade física: constância por músculo (Élton, 26/10) ──
// A frequência de cada músculo vem do Preparo Físico; o Ritual registra o que
// foi treinado. Aberto/fechado fica lembrado no aparelho.
const CH_MUS = 'falcon_obj_musculos';
const _musAberto = () => { try { return localStorage.getItem(CH_MUS) === '1'; } catch { return false; } };
async function _pintarMusculos(box) {
  const lugares = [...box.querySelectorAll('.obj-mus')];
  if (!lugares.length || !_musAberto()) return;
  let c;
  try { c = await constanciaPorMusculo(); } catch (e) { lugares.forEach(l => { l.innerHTML = `<div class="obj-mus-vazio">Não deu pra carregar: ${esc(e.message)}</div>`; }); return; }
  const html = !c.registros
    ? '<div class="obj-mus-vazio">Ao marcar a atividade física no Ritual, escolha o que treinou. A constância de cada músculo aparece aqui.</div>'
    : c.musculos.filter(m => m.meta > 0 || m.ultimo).map(m => {
        const atras = m.meta > 0 && (m.semanasSem == null || m.semanasSem >= 2);
        const quando = m.semanasSem == null ? `nada em ${c.semanas} semanas` : m.semanasSem === 0 ? 'treinado nesta semana' : m.semanasSem === 1 ? 'última vez semana passada' : `${m.semanasSem} semanas sem treinar`;
        return `<div class="obj-mus-linha ${atras ? 'atras' : m.meta && m.semana >= m.meta ? 'ok' : ''}">
          <span class="obj-mus-nome">${esc(m.nome)}</span>
          <span class="obj-mus-conta">${m.semana}${m.meta ? ` de ${m.meta}` : ''}</span>
          <span class="obj-mus-quando">${atras ? '⚠️ ' : ''}${quando}</span>
        </div>`;
      }).join('') + '<div class="obj-mus-rodape">A frequência de cada músculo você ajusta no Preparo Físico.</div>';
  lugares.forEach(l => { l.innerHTML = html; });
}

function linhaObjetivo(o, p, fisica = false) {
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
        ${fisica ? `<button type="button" class="obj-mus-toggle" data-mus-toggle aria-expanded="${_musAberto()}">💪 Constância por músculo <i>${_musAberto() ? '▾' : '›'}</i></button>
        ${_musAberto() ? '<div class="obj-mus"><div class="obj-mus-vazio">Carregando…</div></div>' : ''}` : ''}
      </div>

    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CRIAR / EDITAR
// ═══════════════════════════════════════════════════════════════
// A opção "puxar do Ritual" é o coração disto: se a pessoa já marca a
// academia lá, marcar de novo aqui seria trabalho dobrado — e as duas
// contagens divergiriam na primeira vez que ela esquecesse uma das duas.
// opts (vindo do "Organizando meu ideal"): novoNome = já escolhe/preenche a
// atividade; icone/cor = da atividade nova; aoSalvar = avisa quem abriu.
export async function abrirEditorObjetivo(id, opts = {}) {
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
      <h3>${obj ? 'Editar objetivo' : esc(opts.titulo || 'Novo objetivo')}</h3>
      ${!obj && opts.dica ? `<div class="modal-hint">${esc(opts.dica)}</div>` : ''}

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
  // Veio do "Organizando meu ideal": se a atividade já existe, seleciona ela;
  // senão já deixa "Criar nova" com o nome preenchido.
  // Veio de "Criar atividade" (Prioridades/Ideal): a atividade acabou de nascer.
  if (!obj && opts.atividadeId && atividades.some(a => a.id === opts.atividadeId)) selAtiv.value = opts.atividadeId;
  else if (!obj && opts.novoNome) {
    const alvo = String(opts.novoNome).trim().toLowerCase();
    const existente = atividades.find(a => String(a.name || '').trim().toLowerCase() === alvo);
    if (existente) selAtiv.value = existente.id;
    else { selAtiv.value = '__nova__'; novaInput.value = opts.novoNome; }
  }
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
          name: novoNome, icon: opts.icone || '🎯', color: opts.cor || '#a78bfa',
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
    try { await opts.aoSalvar?.(); } catch {}
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

    // 💪 abre/fecha a constância por músculo (sem abrir a edição da meta)
    if (ev.target.closest('#obj-lista [data-mus-toggle]')) {
      try { localStorage.setItem(CH_MUS, _musAberto() ? '0' : '1'); } catch { /* sem storage */ }
      await montarObjetivos();
      return;
    }
    if (ev.target.closest('#obj-lista .obj-mus')) return;

    // Sem botão de três pontos: o card inteiro é o caminho de edição. Um
    // botão só pra abrir o que o toque no card já abriria era peso a mais.
    const ed = ev.target.closest('[data-editar]');
    if (ed && ed.closest('#obj-lista')) {
      await abrirEditorObjetivo(ed.dataset.editar);
    }
  });
}
