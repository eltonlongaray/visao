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
const PREVIEW_KEY = 'visao_admin_preview'; // admin vendo como usuário comum

// ── "Ver como usuário" (só admin) ────────────────────────────
// Quando ligado, o admin enxerga o modal de Avisos igual a um usuário comum.
export function isAdminPreview() { return localStorage.getItem(PREVIEW_KEY) === '1'; }
export function setAdminPreview(on) {
  if (on) localStorage.setItem(PREVIEW_KEY, '1');
  else localStorage.removeItem(PREVIEW_KEY);
}

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
// Zera o "lido" deste dispositivo — usado no preview "ver como usuário"
// pra reviver a bolinha e enxergar o fluxo de um usuário novo.
export function resetAvisosRead() { localStorage.removeItem(READ_KEY); }

// ── Dados ────────────────────────────────────────────────────
export async function fetchAvisos() {
  const { data, error } = await supabase
    .from('avisos')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(10);   // mostra só os 10 mais recentes
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
// Transforma URLs em links clicáveis. Recebe texto JÁ ESCAPADO (_esc), então é
// seguro — só embrulha o que parece URL num <a>. Pega https://… e domínios crus
// como "estilo-falcon.web.app". Prepende https:// quando não tem protocolo.
function _linkify(escaped) {
  const re = /(https?:\/\/[^\s<]+)|((?:[a-z0-9][a-z0-9-]*\.)+(?:app|com|net|org|io|dev|me|co|br)(?:\.[a-z]{2})?(?:\/[^\s<]*)?)/gi;
  return escaped.replace(re, (m) => {
    const trail = (m.match(/[.,)\]!?:;]+$/) || [''])[0];   // pontuação final não entra no link
    const url = m.slice(0, m.length - trail.length);
    if (!url) return m;
    const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="aviso-link">${url}</a>${trail}`;
  });
}
function _avisoItemHtml(a, isAdmin) {
  // Escapa (anti-XSS) → vira link clicável → quebras de linha viram <br>.
  const bodyHtml = _linkify(_esc(a.body)).replace(/\n/g, '<br>');
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

  // Em modo "ver como usuário", o admin é tratado como usuário comum aqui.
  let isAdmin = false;
  try { isAdmin = !!(await getProfile())?.isAdmin && !isAdminPreview(); } catch { /* segue */ }

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

    // Lista única, mais recente no topo, rolável (últimos 10). Mais limpo que
    // separar lidos/não-lidos — a bolinha da Home já sinaliza o que é novo.
    listEl.innerHTML = list.map(a => _avisoItemHtml(a, isAdmin)).join('');

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
