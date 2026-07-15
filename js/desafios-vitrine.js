// ═══════════════════════════════════════════════════════════════
// FALCON · Desafios — modal-vitrine da Home ("o que tá em jogo")
// Mostra os desafios em oferta. Participar → entra e vai pra aba (a arena).
// ═══════════════════════════════════════════════════════════════
import { fetchDesafios, fetchParticipantes, joinDesafio, markDesafiosSeen } from './desafios.js';
import { emojiDoTipo } from './desafios-moldes.js';
import { getProfile } from './banco-dados.js';
import { auth } from './autenticacao.js';
import { navigate } from './roteador.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { t } from './idioma.js';

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function _nome(p, email) {
  return (p?.preferredName || p?.fullName || (email || '').split('@')[0] || 'Falcão').trim();
}

export async function openDesafiosVitrine() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">🏆 ${t('home.desafios.title')}</div>
      <div class="modal-hint">${t('home.desafios.modal.hint')}</div>
      <div class="vitrine-list" id="vitrine-list">
        <div class="reminder-empty">${t('home.reminders.loading')}</div>
      </div>
      <div class="modal-actions"><button class="btn-secondary" id="vt-close">${t('home.close')}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = trapModalBack(() => overlay.remove());
  overlay.querySelector('#vt-close').onclick = close;

  const myUid = auth.currentUser?.uid;
  let profile = null;
  try { profile = await getProfile(); } catch { /* segue */ }
  const meuNome = _nome(profile, auth.currentUser?.email);

  const listEl = overlay.querySelector('#vitrine-list');
  let desafios = [], parts = [];
  try {
    [desafios, parts] = await Promise.all([fetchDesafios(), fetchParticipantes()]);
  } catch (e) {
    listEl.innerHTML = `<div class="reminder-empty">${_esc(e.message)}</div>`;
    return;
  }

  markDesafiosSeen(desafios.map(d => d.id));
  const dot = document.getElementById('desafios-dot');
  if (dot) dot.style.display = 'none';

  if (!desafios.length) {
    listEl.innerHTML = `<div class="reminder-empty">${t('home.desafios.empty')}</div>`;
    return;
  }

  listEl.innerHTML = desafios.map(d => {
    const dParts = parts.filter(p => p.desafio_id === d.id);
    const joined = dParts.some(p => p.user_id === myUid);
    const meta = d.meta_diaria, unidade = d.unidade || '';
    return `<div class="vitrine-item">
      <div class="vitrine-title">${emojiDoTipo(d.tipo)} ${_esc(d.titulo)}</div>
      <div class="ds-badges">
        ${d.dias_total ? `<span class="ds-badge amber">${d.dias_total} dias</span>` : ''}
        ${meta ? `<span class="ds-badge teal">meta ${meta}${unidade ? ' ' + _esc(unidade) : ''}/dia</span>` : ''}
        <span class="ds-badge gray">🙋 ${dParts.length}</span>
      </div>
      <div class="vitrine-desc">${_esc(d.descricao).replace(/\n/g, '<br>')}</div>
      <button class="ds-join ${joined ? 'joined' : ''}" data-go="${d.id}" data-joined="${joined ? '1' : ''}">
        ${joined ? 'Ir pro desafio →' : '🙋 Participar'}
      </button>
    </div>`;
  }).join('');

  listEl.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => {
    const id = b.dataset.go;
    if (b.dataset.joined) { close(); navigate('/desafios'); return; }
    b.disabled = true;
    try {
      await joinDesafio(id, meuNome);
      close();
      navigate('/desafios');
    } catch (e) { showToast(e.message || 'Erro', 'error'); b.disabled = false; }
  });
}
