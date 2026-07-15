// ═══════════════════════════════════════════════════════════════
// FALCON · Desafios (Fase 0 — teaser na Home)
// Admin publica um desafio de grupo; usuários tocam "Quero participar".
// Mesma engenharia do Avisos: tabela Supabase + RLS admin + bolinha de novo.
// Sem dinheiro. A tela completa (ranking + chat) vem depois.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';
import { getProfile } from './banco-dados.js';
import { auth } from './autenticacao.js';
import { showToast } from './aviso-tela.js';
import { t } from './idioma.js';
import { trapModalBack } from './modal-voltar.js';
import { isAdminPreview } from './avisos.js';

const SEEN_KEY = 'visao_desafios_vistos';   // ids já vistos neste dispositivo

// ── Estado de "visto" (bolinha) ──────────────────────────────
function _seen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function _markSeen(ids) {
  const cur = _seen();
  ids.forEach(id => cur.add(id));
  localStorage.setItem(SEEN_KEY, JSON.stringify([...cur]));
}

// ── Dados ────────────────────────────────────────────────────
export async function fetchDesafios() {
  const { data, error } = await supabase
    .from('desafios')
    .select('*')
    .neq('status', 'rascunho')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message || 'Erro ao carregar desafios');
  return data || [];
}

async function fetchInteresses() {
  const { data, error } = await supabase.from('desafio_interesse').select('desafio_id, user_id');
  if (error) return [];
  return data || [];
}

async function createDesafio({ titulo, descricao, dias }) {
  const { error } = await supabase.from('desafios').insert({ titulo, descricao, dias_total: dias || null });
  if (error) throw new Error(error.message || 'Não foi possível publicar');
}
async function updateDesafio(id, { titulo, descricao, dias }) {
  const { error } = await supabase.from('desafios').update({ titulo, descricao, dias_total: dias || null }).eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível editar');
}
async function deleteDesafio(id) {
  const { error } = await supabase.from('desafios').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível apagar');
}
async function addInteresse(desafioId) {
  const { error } = await supabase.from('desafio_interesse').insert({ desafio_id: desafioId });
  if (error) throw new Error(error.message || 'Erro ao entrar');
}
async function removeInteresse(desafioId) {
  const uid = auth.currentUser?.uid;
  const { error } = await supabase.from('desafio_interesse').delete().eq('desafio_id', desafioId).eq('user_id', uid);
  if (error) throw new Error(error.message || 'Erro ao sair');
}

// ── Bolinha de novo na Home ──────────────────────────────────
export async function loadDesafiosDot() {
  const dot = document.getElementById('desafios-dot');
  if (!dot) return;
  try {
    const list = await fetchDesafios();
    const seen = _seen();
    const novos = list.filter(d => !seen.has(d.id)).length;
    dot.style.display = novos > 0 ? '' : 'none';
  } catch {
    dot.style.display = 'none';
  }
}

// ── Helpers de render ────────────────────────────────────────
function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function _desafioItemHtml(d, isAdmin, count, joined) {
  const bodyHtml = _esc(d.descricao).replace(/\n/g, '<br>');
  const diasBadge = d.dias_total ? `<span class="desafio-dias">${d.dias_total} dias</span>` : '';
  return `<div class="desafio-item" data-id="${_esc(d.id)}">
    <div class="desafio-item-head">
      <div class="desafio-item-title">${_esc(d.titulo)}</div>
      ${isAdmin ? `<div class="desafio-actions">
        <button class="desafio-edit" data-id="${_esc(d.id)}" title="Editar" aria-label="Editar">✏️</button>
        <button class="desafio-del" data-id="${_esc(d.id)}" title="Apagar" aria-label="Apagar">🗑</button>
      </div>` : ''}
    </div>
    ${diasBadge}
    <div class="desafio-item-body">${bodyHtml}</div>
    <div class="desafio-item-foot">
      <span class="desafio-count">🙋 ${count} ${count === 1 ? 'interessado' : 'interessados'}</span>
      <button class="desafio-join ${joined ? 'joined' : ''}" data-id="${_esc(d.id)}">
        ${joined ? '✅ Você está dentro' : '🙋 Quero participar'}
      </button>
    </div>
  </div>`;
}
function _editFormHtml(d) {
  return `<div class="desafio-composer" style="margin:0;border-style:solid">
    <div class="desafio-composer-label">✏️ Editar desafio</div>
    <input class="aviso-input desafio-edit-titulo" maxlength="120" value="${_esc(d.titulo)}" placeholder="Título" />
    <input class="aviso-input desafio-edit-dias" type="number" min="1" value="${d.dias_total ?? ''}" placeholder="Dias (ex: 21)" />
    <textarea class="aviso-input aviso-textarea desafio-edit-desc" rows="4" placeholder="Descrição">${_esc(d.descricao)}</textarea>
    <div style="display:flex;gap:8px">
      <button class="btn-primary desafio-edit-save" style="flex:1">Salvar</button>
      <button class="btn-secondary desafio-edit-cancel" style="flex:1">Cancelar</button>
    </div>
  </div>`;
}

// ── Modal principal ──────────────────────────────────────────
export async function openDesafiosModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${t('home.desafios.modal.title')}</div>
      <div class="modal-hint">${t('home.desafios.modal.hint')}</div>
      <div id="desafio-admin-slot"></div>
      <div class="desafio-list" id="desafio-list">
        <div class="reminder-empty">${t('home.reminders.loading')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn-primary" id="ds-close">${t('home.close')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = trapModalBack(() => overlay.remove());
  overlay.querySelector('#ds-close').onclick = close;

  // Em "ver como usuário", admin é tratado como usuário comum.
  let isAdmin = false;
  try { isAdmin = !!(await getProfile())?.isAdmin && !isAdminPreview(); } catch { /* segue */ }

  const listEl = overlay.querySelector('#desafio-list');
  const myUid = auth.currentUser?.uid;

  async function refresh() {
    let list = [], interesses = [];
    try {
      [list, interesses] = await Promise.all([fetchDesafios(), fetchInteresses()]);
    } catch (e) {
      listEl.innerHTML = `<div class="reminder-empty">${_esc(e.message)}</div>`;
      return;
    }

    const countMap = {};
    const mySet = new Set();
    for (const r of interesses) {
      countMap[r.desafio_id] = (countMap[r.desafio_id] || 0) + 1;
      if (r.user_id === myUid) mySet.add(r.desafio_id);
    }

    const dot = document.getElementById('desafios-dot');
    if (list.length === 0) {
      listEl.innerHTML = `<div class="reminder-empty">${t('home.desafios.empty')}</div>`;
      if (dot) dot.style.display = 'none';
      return;
    }

    listEl.innerHTML = list.map(d =>
      _desafioItemHtml(d, isAdmin, countMap[d.id] || 0, mySet.has(d.id))).join('');

    _markSeen(list.map(d => d.id));
    if (dot) dot.style.display = 'none';

    // Botão "Quero participar" (toggle) — todos
    listEl.querySelectorAll('.desafio-join').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const joined = mySet.has(id);
        btn.disabled = true;
        try {
          if (joined) await removeInteresse(id); else await addInteresse(id);
          await refresh();
          if (!joined) showToast('🦅 Você está dentro! Já já a gente organiza tudo.', 'success', 5000);
        } catch (e) { showToast(e.message || 'Erro', 'error'); btn.disabled = false; }
      };
    });

    // Admin: apagar + editar inline
    if (isAdmin) {
      listEl.querySelectorAll('.desafio-del').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try { await deleteDesafio(btn.dataset.id); await refresh(); }
          catch (e) { showToast(e.message || 'Erro ao apagar', 'error'); btn.disabled = false; }
        };
      });
      listEl.querySelectorAll('.desafio-edit').forEach(btn => {
        btn.onclick = () => {
          const d = list.find(x => x.id === btn.dataset.id);
          if (!d) return;
          const item = listEl.querySelector(`.desafio-item[data-id="${CSS.escape(d.id)}"]`);
          item.innerHTML = _editFormHtml(d);
          item.querySelector('.desafio-edit-cancel').onclick = () => refresh();
          const save = item.querySelector('.desafio-edit-save');
          save.onclick = async () => {
            const titulo    = item.querySelector('.desafio-edit-titulo').value.trim();
            const descricao = item.querySelector('.desafio-edit-desc').value.trim();
            const dias      = parseInt(item.querySelector('.desafio-edit-dias').value, 10) || null;
            if (!titulo || !descricao) { showToast('Preencha título e descrição', 'error'); return; }
            save.disabled = true; save.textContent = 'Salvando…';
            try { await updateDesafio(d.id, { titulo, descricao, dias }); showToast('✅ Desafio atualizado', 'success'); await refresh(); }
            catch (e) { showToast(e.message || 'Erro ao editar', 'error'); save.disabled = false; save.textContent = 'Salvar'; }
          };
        };
      });
    }
  }

  // Compositor do admin
  if (isAdmin) {
    const slot = overlay.querySelector('#desafio-admin-slot');
    slot.innerHTML = `
      <div class="desafio-composer">
        <div class="desafio-composer-label">🏆 Lançar um desafio</div>
        <input id="ds-titulo" class="aviso-input" placeholder="Título (ex: Beber 2L de água por 21 dias)" maxlength="120" />
        <input id="ds-dias" class="aviso-input" type="number" min="1" placeholder="Duração em dias (ex: 21)" />
        <textarea id="ds-desc" class="aviso-input aviso-textarea" placeholder="Descreva o desafio e as regras…" rows="4"></textarea>
        <button class="btn-primary" id="ds-send">Publicar desafio</button>
      </div>`;
    const tituloEl = slot.querySelector('#ds-titulo');
    const diasEl   = slot.querySelector('#ds-dias');
    const descEl   = slot.querySelector('#ds-desc');
    const sendBtn  = slot.querySelector('#ds-send');
    sendBtn.onclick = async () => {
      const titulo = tituloEl.value.trim();
      const descricao = descEl.value.trim();
      const dias = parseInt(diasEl.value, 10) || null;
      if (!titulo || !descricao) { showToast('Preencha título e descrição', 'error'); return; }
      sendBtn.disabled = true; sendBtn.textContent = 'Publicando…';
      try {
        await createDesafio({ titulo, descricao, dias });
        tituloEl.value = ''; diasEl.value = ''; descEl.value = '';
        showToast('🏆 Desafio publicado!', 'success');
        await refresh();
      } catch (e) {
        showToast(e.message || 'Erro ao publicar', 'error');
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = 'Publicar desafio';
      }
    };
  }

  await refresh();
}
