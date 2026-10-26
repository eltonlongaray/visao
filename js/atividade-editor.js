// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS E LISTAS (cores e ícones)
// BLOCO 2 — POPUP "Nova atividade" / "Editar atividade"
// ─────────────────────────────────────────────────────────────
// Um pop-up só pra criar ou editar atividade (Élton, 26/10): o da Home, o das
// ⭐ Prioridades e o do Ideal são o mesmo. Nome, ícone e cor. Sem descrição:
// no Ritual a descrição é o detalhe daquela vez (Élton, 26/10).

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS E LISTAS
// ═══════════════════════════════════════════════════════════════
import { getCategories, saveCategory } from './banco-dados.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { t } from './idioma.js';
import { tipoRegistro } from './treino-registro.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Paleta ampla: a lista de atividades é grande e as cores estavam repetindo.
export const CORES_ATIVIDADE = [
  '#a78bfa','#34d399','#f472b6','#60a5fa','#fbbf24','#f87171','#fb923c','#c084fc','#22d3ee','#facc15',
  '#818cf8','#2dd4bf','#e879f9','#38bdf8','#fcd34d','#fca5a5','#f59e0b','#4ade80','#f43f5e','#0ea5e9',
  '#a3e635','#c026d3','#14b8a6','#eab308','#ef4444','#3b82f6','#ec4899','#10b981','#8b5cf6','#f97316',
];
export const ICONES_ATIVIDADE = [
  // Vida diária / hábitos
  '🏷️','💧','🥗','💪','📚','🌙','💼','🧘','🥋','💰','🎨','🧹','📞','🛒','✈️','💝',
  // Esporte / fitness
  '🏃','🚶','🏋🏻‍♀️','🚴','🏊','⚽','🏀','🏐','🎾','🏓','🏸','🥊','🤸','🧗','⛳','🛹','🛼',
  // Saúde / bem-estar
  '🩺','🦷','💊','🧠','😴','🚿','🛁','🧴','🩹','☀️',
  // Estudo / trabalho
  '✏️','📝','📖','💻','🖥️','📊','🎓','🔬','🧪','📅',
  // Hobbies / arte / música
  '🎸','🎹','🥁','🎤','🎧','🎬','📷','🎮','♟️','🧩','🎯','🖌️','🧵','🪘','🃏','🔮',
  // Comida / cozinha
  '🍽️','🍳','☕','🍎','🥦','🍜','🥤',
  // Casa / tarefas
  '🛠️','🔧','🧺','📦','🏦','💳','🧾',
  // Lazer / natureza / viagem
  '🏖️','🏝️','🏔️','⛺','🥾','🗺️','🚗','🏍️','🌳','🌊','🌻',
  // Social / família / fé
  '👨‍👩‍👧','🧑‍🤝‍🧑','👶','🎉','🥳','❤️','🙏','⛪',
  // Autocuidado / beleza
  '💇🏻‍♀️','🧖🏻‍♀️','💄','🪒','👚','🛍️',
  // Pets
  '🐕','🐈‍⬛','🐾','🎁','🚨'
];
const TODOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: POPUP
// ═══════════════════════════════════════════════════════════════
// id = null cria; com id edita. `inicial` preenche nome/ícone/cor.
// `extra` vai junto na atividade nova (ex.: { prioItemId } pra saber de onde veio).
// Resolve com o id salvo, ou null se a pessoa cancelar.
export async function abrirEditorAtividade({ id = null, cats = null, inicial = {}, extra = {}, dica = null, mostrarFim = true } = {}) {
  const isNew = id === null;
  if (!cats) { try { cats = await getCategories(); } catch { cats = []; } }
  const atual = isNew ? null : cats.find(x => x.id === id);
  if (!isNew && !atual) return null;
  const c = isNew
    ? { name: inicial.nome || '', icon: inicial.icone || '🏷️',
        color: inicial.cor || CORES_ATIVIDADE[cats.length % CORES_ATIVIDADE.length], daysOfWeek: TODOS_DIAS }
    : { ...atual };
  if (!Array.isArray(c.daysOfWeek)) c.daysOfWeek = TODOS_DIAS;
  // Ícone que não está na lista (veio do Ideal, do Pet…) entra em primeiro
  const icones = ICONES_ATIVIDADE.includes(c.icon) ? ICONES_ATIVIDADE : [c.icon, ...ICONES_ATIVIDADE];
  const cores = CORES_ATIVIDADE.includes(c.color) ? CORES_ATIVIDADE : [c.color, ...CORES_ATIVIDADE];

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">${isNew ? t('home.activity.new') : t('home.activity.edit')}</div>
        <div class="modal-hint">${dica ? esc(dica) : t('home.activity.hint')}</div>

        <label class="input-field"><div class="input-field-label">Nome</div>
          <input id="m-name" value="${esc(c.name)}" maxlength="60" placeholder="ex: Meditação, Trabalho, Lazer..." /></label>

        <label class="input-field"><div class="input-field-label">Ao marcar como feita, perguntar</div>
          <select id="m-reg">
            <option value="nenhum">Nada</option>
            <option value="fisica">💪 O que treinou (modalidade e músculos)</option>
            <option value="leitura">📚 Quantas páginas leu</option>
          </select></label>
        <label class="input-field" id="m-min-wrap" hidden><div class="input-field-label">Mínimo de páginas por dia <span class="ag-lbl-opt">— leu menos, conta igual</span></div>
          <input id="m-min" type="number" inputmode="numeric" min="1" max="500" value="${Number(c.minimoPaginas) || ''}" placeholder="Ex.: 5"></label>

        <div class="modal-section-label">${t('home.activity.icon')}</div>
        <div class="icon-picker">
          ${icones.map(i => `<button type="button" class="icon-opt ${i === c.icon ? 'sel' : ''}" data-icon="${i}">${i}</button>`).join('')}
        </div>

        <div class="modal-section-label">${t('home.activity.color')}</div>
        <div class="color-picker">
          ${cores.map(col => `<button type="button" class="color-opt ${col === c.color ? 'sel' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="m-cancel">${t('ritual.cancel')}</button>
          <button class="btn-primary" id="m-save">${isNew ? t('home.activity.create') : t('home.activity.save')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    // Rolada rápida até o fim pra mostrar onde está o botão Criar, e volta.
    // Fica desligada no tour (não briga com a navegação guiada).
    if (mostrarFim) {
      setTimeout(() => {
        const inner = modal.querySelector('.modal');
        if (!inner) return;
        inner.scrollTop = inner.scrollHeight;
        setTimeout(() => {
          inner.scrollTo({ top: 0, behavior: 'smooth' });
          modal.querySelector('#m-name')?.focus();
        }, 900);
      }, 80);
    }

    // Registro ao concluir: o salvo vale; sem ele, o nome sugere (e muda junto
    // enquanto a pessoa digita, até ela escolher na mão)
    const selReg = modal.querySelector('#m-reg'), minWrap = modal.querySelector('#m-min-wrap');
    let regManual = !!c.registro;
    const syncReg = () => {
      if (!regManual) selReg.value = tipoRegistro({ name: modal.querySelector('#m-name').value }) || 'nenhum';
      minWrap.hidden = selReg.value !== 'leitura';
    };
    selReg.value = c.registro || tipoRegistro(c) || 'nenhum';
    syncReg();
    selReg.addEventListener('change', () => { regManual = true; syncReg(); });
    modal.querySelector('#m-name').addEventListener('input', syncReg);

    let pickedIcon = c.icon, pickedColor = c.color, salvo = null;
    modal.querySelectorAll('[data-icon]').forEach(b => b.onclick = () => {
      modal.querySelectorAll('[data-icon]').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); pickedIcon = b.dataset.icon;
    });
    modal.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
      modal.querySelectorAll('[data-color]').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); pickedColor = b.dataset.color;
    });
    const close = trapModalBack(() => { modal.remove(); resolve(salvo); });
    modal.querySelector('#m-cancel').onclick = close;
    // Clique fora NÃO fecha — só Cancelar ou back do celular (evita perder o que digitou)
    modal.querySelector('#m-save').onclick = async () => {
      const name = modal.querySelector('#m-name').value.trim();
      if (!name) { showToast(t('home.activity.name.required'), 'info'); return; }
      const registro = selReg.value;
      const minimoPaginas = registro === 'leitura' ? Math.max(0, Math.round(Number(modal.querySelector('#m-min').value) || 0)) : 0;
      const btn = modal.querySelector('#m-save');
      btn.disabled = true;
      try {
        if (isNew) {
          const order = (cats.length ? Math.max(...cats.map(x => x.order || 0)) : 0) + 1;
          // daysOfWeek preservado pra retrocompatibilidade com docs antigos
          // (recorrência real vive em weekdayTemplates via per-task chips no Ritual)
          salvo = await saveCategory(null, { name, icon: pickedIcon, color: pickedColor, order, daysOfWeek: TODOS_DIAS,
            ...extra, registro, ...(minimoPaginas ? { minimoPaginas } : {}) });
        } else {
          // ...c guarda o resto do extra (lembrete etc.): o extra é gravado inteiro
          await saveCategory(id, { ...c, name, icon: pickedIcon, color: pickedColor, registro, minimoPaginas });
          salvo = id;
        }
        document.dispatchEvent(new CustomEvent('falcon:cats-changed'));
        showToast(isNew ? t('home.activity.created') : t('home.activity.updated'), 'success');
        close();
      } catch (err) { btn.disabled = false; showToast('Erro: ' + err.message, 'error'); }
    };
  });
}
