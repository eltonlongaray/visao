// ═══════════════════════════════════════════════════════════════
// FALCON · Avisos (comunicados do time para todos os usuários)
// Fonte: tabela `avisos` no Supabase (RLS: todos leem publicados; só admin escreve).
// Home mostra um card 📢 com bolinha de "não lido" (estado por dispositivo, localStorage).
// O admin (is_admin em profiles) vê um compositor pra enviar avisos daqui mesmo.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';
import { getProfile } from './banco-dados.js';
import { showToast } from './aviso-tela.js';
import { t, getLang } from './idioma.js';
import { trapModalBack } from './modal-voltar.js';

const READ_KEY = 'visao_avisos_lidos';   // array de ids já vistos neste dispositivo

// ── Estado de leitura (localStorage) ─────────────────────────
function _readIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
  catch { return new Set(); }
}
function _markRead(ids) {
  const cur = _readIds();
  ids.forEach(id => cur.add(id));
  localStorage.setItem(READ_KEY, JSON.stringify([...cur]));
}

// ── Dados ────────────────────────────────────────────────────
export async function fetchAvisos() {
  const { data, error } = await supabase
    .from('avisos')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Erro ao carregar avisos');
  return data || [];
}

async function createAviso({ title, body }) {
  const { error } = await supabase.from('avisos').insert({ title, body });
  if (error) throw new Error(error.message || 'Não foi possível publicar');
}

async function updateAviso(id, { title, body }) {
  const { error } = await supabase.from('avisos').update({ title, body }).eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível editar');
}

async function deleteAviso(id) {
  const { error } = await supabase.from('avisos').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível apagar');
}

// ── Bolinha de não-lido na Home ──────────────────────────────
// Chamado no render da Home. Mostra o ponto se houver aviso não visto.
export async function loadAvisosDot() {
  const dot = document.getElementById('avisos-dot');
  if (!dot) return;
  try {
    const list = await fetchAvisos();
    const read = _readIds();
    const unread = list.filter(a => !read.has(a.id)).length;
    dot.style.display = unread > 0 ? '' : 'none';
  } catch {
    dot.style.display = 'none';
  }
}

// ── Helpers de render ────────────────────────────────────────
function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function _fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat(getLang(), { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(iso));
  } catch { return ''; }
}
function _avisoItemHtml(a, isAdmin) {
  // Quebras de linha do texto viram <br> (conteúdo é escapado antes)
  const bodyHtml = _esc(a.body).replace(/\n/g, '<br>');
  return `<div class="aviso-item" data-id="${_esc(a.id)}">
    <div class="aviso-item-head">
      <div class="aviso-item-title">${_esc(a.title)}</div>
      ${isAdmin ? `<div class="aviso-actions">
        <button class="aviso-edit" data-id="${_esc(a.id)}" title="Editar aviso" aria-label="Editar">✏️</button>
        <button class="aviso-del" data-id="${_esc(a.id)}" title="Apagar aviso" aria-label="Apagar">🗑</button>
      </div>` : ''}
    </div>
    <div class="aviso-item-date">${_fmtDate(a.created_at)}</div>
    <div class="aviso-item-body">${bodyHtml}</div>
  </div>`;
}

// Formulário de edição inline (substitui o conteúdo do .aviso-item)
function _editFormHtml(a) {
  return `<div class="aviso-composer" style="margin:0;border-style:solid">
    <div class="aviso-composer-label">✏️ Editar aviso</div>
    <input class="aviso-input aviso-edit-title" maxlength="120" value="${_esc(a.title)}" />
    <textarea class="aviso-input aviso-textarea aviso-edit-body" rows="4">${_esc(a.body)}</textarea>
    <div style="display:flex;gap:8px">
      <button class="btn-primary aviso-edit-save" style="flex:1">Salvar</button>
      <button class="btn-secondary aviso-edit-cancel" style="flex:1">Cancelar</button>
    </div>
  </div>`;
}

// ── Modal principal ──────────────────────────────────────────
export async function openAvisosModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${t('home.avisos.modal.title')}</div>
      <div class="modal-hint">${t('home.avisos.modal.hint')}</div>
      <div id="aviso-admin-slot"></div>
      <div class="aviso-list" id="aviso-list">
        <div class="reminder-empty">${t('home.reminders.loading')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn-primary" id="av-close">${t('home.close')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = trapModalBack(() => overlay.remove());
  overlay.querySelector('#av-close').onclick = close;

  let isAdmin = false;
  try { isAdmin = !!(await getProfile())?.isAdmin; } catch { /* segue */ }

  const listEl = overlay.querySelector('#aviso-list');

  async function refresh() {
    let list = [];
    try {
      list = await fetchAvisos();
    } catch (e) {
      listEl.innerHTML = `<div class="reminder-empty">${_esc(e.message)}</div>`;
      return;
    }

    const dot = document.getElementById('avisos-dot');
    if (list.length === 0) {
      listEl.innerHTML = `<div class="reminder-empty">${t('home.avisos.empty')}</div>`;
      if (dot) dot.style.display = 'none';
      return;
    }

    // Estado de leitura ANTES de marcar. O último aviso (mais recente) fica
    // sempre no topo; os já lidos e mais antigos vão para o arquivo "lidos".
    const readSet = _readIds();
    const latestId = list[0].id;                          // lista vem desc (novo→velho)
    const inMain = a => !readSet.has(a.id) || a.id === latestId;
    const mainList = list.filter(inMain);
    const archived = list.filter(a => !inMain(a));

    const mainHtml = mainList.map(a => _avisoItemHtml(a, isAdmin)).join('');
    const archHtml = archived.length ? `
      <button class="aviso-archive-toggle" id="aviso-arch-toggle" type="button">
        <span>📁 ${t('home.avisos.read')}</span>
        <span class="aviso-arch-count">${archived.length}</span>
        <span class="aviso-arch-chev">▾</span>
      </button>
      <div class="aviso-archive" id="aviso-archive" hidden>
        ${archived.map(a => _avisoItemHtml(a, isAdmin)).join('')}
      </div>` : '';
    listEl.innerHTML = mainHtml + archHtml;

    // Toggle do arquivo de lidos
    const tg = listEl.querySelector('#aviso-arch-toggle');
    if (tg) {
      tg.onclick = () => {
        const arch = listEl.querySelector('#aviso-archive');
        const opening = arch.hasAttribute('hidden');
        if (opening) arch.removeAttribute('hidden'); else arch.setAttribute('hidden', '');
        tg.classList.toggle('open', opening);
      };
    }

    // Marca todos como lidos e some com a bolinha da Home
    _markRead(list.map(a => a.id));
    if (dot) dot.style.display = 'none';

    // Handlers de admin: apagar + editar inline (em toda a lista, inclusive arquivo)
    if (isAdmin) {
      listEl.querySelectorAll('.aviso-del').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try { await deleteAviso(btn.dataset.id); await refresh(); }
          catch (e) { showToast(e.message || 'Erro ao apagar', 'error'); btn.disabled = false; }
        };
      });
      listEl.querySelectorAll('.aviso-edit').forEach(btn => {
        btn.onclick = () => {
          const a = list.find(x => x.id === btn.dataset.id);
          if (!a) return;
          const item = listEl.querySelector(`.aviso-item[data-id="${CSS.escape(a.id)}"]`);
          item.innerHTML = _editFormHtml(a);
          item.querySelector('.aviso-edit-cancel').onclick = () => refresh();
          const save = item.querySelector('.aviso-edit-save');
          save.onclick = async () => {
            const title = item.querySelector('.aviso-edit-title').value.trim();
            const body  = item.querySelector('.aviso-edit-body').value.trim();
            if (!title || !body) { showToast('Preencha título e mensagem', 'error'); return; }
            save.disabled = true; save.textContent = 'Salvando…';
            try {
              await updateAviso(a.id, { title, body });
              showToast('✅ Aviso atualizado', 'success');
              await refresh();
            } catch (e) {
              showToast(e.message || 'Erro ao editar', 'error');
              save.disabled = false; save.textContent = 'Salvar';
            }
          };
        };
      });
    }
  }

  // Compositor do admin
  if (isAdmin) {
    const slot = overlay.querySelector('#aviso-admin-slot');
    slot.innerHTML = `
      <div class="aviso-composer">
        <div class="aviso-composer-label">✍️ Enviar um aviso para todos</div>
        <input id="av-title" class="aviso-input" placeholder="Título do aviso" maxlength="120" />
        <textarea id="av-body" class="aviso-input aviso-textarea" placeholder="Escreva a mensagem que todos verão na Home…" rows="4"></textarea>
        <button class="btn-primary" id="av-send">Publicar aviso</button>
      </div>`;
    const titleEl = slot.querySelector('#av-title');
    const bodyEl  = slot.querySelector('#av-body');
    const sendBtn = slot.querySelector('#av-send');
    sendBtn.onclick = async () => {
      const title = titleEl.value.trim();
      const body  = bodyEl.value.trim();
      if (!title || !body) { showToast('Preencha título e mensagem', 'error'); return; }
      sendBtn.disabled = true; sendBtn.textContent = 'Publicando…';
      try {
        await createAviso({ title, body });
        titleEl.value = ''; bodyEl.value = '';
        showToast('📢 Aviso publicado para todos!', 'success');
        await refresh();
      } catch (e) {
        showToast(e.message || 'Erro ao publicar', 'error');
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = 'Publicar aviso';
      }
    };
  }

  await refresh();
}
