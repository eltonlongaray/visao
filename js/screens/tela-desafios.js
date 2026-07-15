// ═══════════════════════════════════════════════════════════════
// FALCON · Tela Desafios (v1 — participar + check-in por meta + ranking)
// Admin cria por MOLDE (formato pré-pronto). Vídeo de prova: próximo incremento.
// ═══════════════════════════════════════════════════════════════
import {
  fetchDesafios, fetchParticipantes, fetchCheckins,
  joinDesafio, leaveDesafio, addCheckin,
  createDesafio, updateDesafio, deleteDesafio,
  parseOpcoes, markDesafiosSeen,
} from '../desafios.js';
import { MOLDES, emojiDoTipo } from '../desafios-moldes.js';
import { getProfile } from '../banco-dados.js';
import { isAdminPreview } from '../avisos.js';
import { auth } from '../autenticacao.js';
import { bottomNav } from '../components/menu-inferior.js';
import { showToast, confirmModal } from '../aviso-tela.js';
import { trapModalBack } from '../modal-voltar.js';
import { t } from '../idioma.js';

// ── Helpers ──────────────────────────────────────────────────
function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function _today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function _nomeFromProfile(p, email) {
  return (p?.preferredName || p?.fullName || (email || '').split('@')[0] || 'Falcão').trim();
}
function _ranking(desafio, parts, checks) {
  const nomeById = {};
  parts.forEach(p => { nomeById[p.user_id] = p.nome || 'Falcão'; });
  const byUser = {};
  checks.forEach(c => {
    (byUser[c.user_id] ||= {});
    byUser[c.user_id][c.dia] = (byUser[c.user_id][c.dia] || 0) + (c.quantidade || 0);
  });
  const meta = desafio.meta_diaria;
  return parts.map(p => {
    const days = byUser[p.user_id] || {};
    let done = 0;
    for (const d in days) if (meta ? days[d] >= meta : days[d] > 0) done++;
    return { user_id: p.user_id, nome: nomeById[p.user_id], done };
  }).sort((a, b) => b.done - a.done);
}

// ── Entry point ──────────────────────────────────────────────
export async function renderDesafios(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">${t('home.reminders.loading')}</div>`;

  const myUid = auth.currentUser?.uid;
  const myEmail = auth.currentUser?.email;
  let profile = null;
  try { profile = await getProfile(); } catch { /* segue */ }
  const meuNome = _nomeFromProfile(profile, myEmail);
  const isAdmin = !!profile?.isAdmin && !isAdminPreview();

  async function refresh() {
    let desafios = [], parts = [], checks = [];
    try {
      [desafios, parts, checks] = await Promise.all([fetchDesafios(), fetchParticipantes(), fetchCheckins()]);
    } catch (e) {
      app.innerHTML = `<div class="screen-pad"><div class="ds-empty">${_esc(e.message)}</div></div>${bottomNav('desafios')}`;
      return;
    }
    markDesafiosSeen(desafios.map(d => d.id));
    draw(desafios, parts, checks);
  }

  function draw(desafios, parts, checks) {
    const today = _today();
    const novoBtn = isAdmin ? `<button class="ds-novo" id="ds-novo">＋ Novo desafio</button>` : '';
    const cards = desafios.length === 0
      ? `<div class="ds-empty">${t('desafios.empty')}</div>`
      : desafios.map(d => {
          const dParts = parts.filter(p => p.desafio_id === d.id);
          const dChecks = checks.filter(c => c.desafio_id === d.id);
          const joined = dParts.some(p => p.user_id === myUid);
          const meta = d.meta_diaria;
          const unidade = d.unidade || '';
          const todaySum = dChecks
            .filter(c => c.user_id === myUid && c.dia === today)
            .reduce((s, c) => s + (c.quantidade || 0), 0);
          const rank = _ranking(d, dParts, dChecks);

          const adminCtrl = isAdmin ? `<div class="desafio-actions">
              <button class="ds-edit" data-edit="${d.id}" title="Editar" aria-label="Editar">✏️</button>
              <button class="ds-del" data-del="${d.id}" title="Apagar" aria-label="Apagar">🗑</button>
            </div>` : '';

          const badges = `
            ${d.dias_total ? `<span class="ds-badge amber">${d.dias_total} dias</span>` : ''}
            ${meta ? `<span class="ds-badge teal">meta ${meta}${unidade ? ' ' + _esc(unidade) : ''}/dia</span>` : ''}
            <span class="ds-badge gray">🙋 ${dParts.length}</span>`;

          let acao = '';
          if (!joined) {
            acao = `<button class="ds-join" data-join="${d.id}">🙋 Participar</button>`;
          } else if (meta) {
            const pct = Math.min(100, Math.round((todaySum / meta) * 100));
            const done = todaySum >= meta;
            const opcoes = Array.isArray(d.prova_opcoes) && d.prova_opcoes.length ? d.prova_opcoes : null;
            const controles = done
              ? `<div class="ds-done">✅ Meta de hoje batida! 🦅</div>`
              : opcoes
                ? `<div class="ds-inc-row">${opcoes.map(o =>
                    `<button class="ds-inc" data-add="${d.id}" data-qtd="${o}">+${o}${unidade ? ' ' + _esc(unidade) : ''}</button>`).join('')}</div>`
                : `<div class="ds-inc-row">
                     <input class="ds-inc-input" id="q-${d.id}" type="number" min="1" placeholder="quanto?" />
                     <button class="ds-inc" data-addinput="${d.id}">Adicionar</button>
                   </div>`;
            acao = `
              <div class="ds-progress-head"><span>Hoje</span><span class="ds-progress-val">${todaySum} / ${meta}${unidade ? ' ' + _esc(unidade) : ''}</span></div>
              <div class="ds-bar"><div class="ds-bar-fill" style="width:${pct}%"></div></div>
              ${controles}`;
          } else {
            const done = todaySum > 0;
            acao = done
              ? `<div class="ds-done">✅ Feito hoje! Volte amanhã 🦅</div>`
              : `<button class="ds-inc" data-add="${d.id}" data-qtd="1" style="width:100%">✅ Marcar feito hoje</button>`;
          }

          const rankHtml = joined && rank.length ? `
            <div class="ds-rank">
              <div class="ds-rank-title">🏅 Ranking</div>
              ${rank.slice(0, 8).map((r, i) => `
                <div class="ds-rank-row ${r.user_id === myUid ? 'me' : ''}">
                  <span>${i + 1} · ${_esc(r.nome)}${r.user_id === myUid ? ' (você)' : ''}</span>
                  <span class="ds-rank-days">${r.done} ${r.done === 1 ? 'dia' : 'dias'}${i === 0 && r.done > 0 ? ' 🔥' : ''}</span>
                </div>`).join('')}
            </div>` : '';

          const wpp = joined ? `<button class="ds-wpp" data-wpp="1">💬 Chamar alguém no WhatsApp</button>` : '';
          const sair = joined ? `<button class="ds-leave" data-leave="${d.id}">Sair do desafio</button>` : '';

          return `
            <div class="ds-card" data-id="${d.id}">
              <div class="ds-card-head">
                <div class="ds-card-title">${emojiDoTipo(d.tipo)} ${_esc(d.titulo)}</div>
                ${adminCtrl}
              </div>
              <div class="ds-badges">${badges}</div>
              <div class="ds-card-desc">${_esc(d.descricao).replace(/\n/g, '<br>')}</div>
              <div class="ds-card-acao">${acao}</div>
              ${rankHtml}
              ${wpp}
              ${sair}
            </div>`;
        }).join('');

    app.innerHTML = `
      <div class="screen-pad">
        <div class="screen-title">
          <h1>🏆 ${t('nav.desafios')}</h1>
          <div class="sub">${t('desafios.sub')}</div>
        </div>
        ${novoBtn}
        ${cards}
      </div>
      ${bottomNav('desafios')}`;

    wire(desafios);
  }

  function wire(desafios) {
    app.querySelector('#ds-novo')?.addEventListener('click', openMoldePicker);
    app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const d = desafios.find(x => x.id === b.dataset.edit);
      if (d) openDesafioForm({ desafio: d });
    });
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const ok = await confirmModal({ title: 'Apagar desafio?', message: 'O desafio e os check-ins ligados a ele serão removidos.', confirmText: 'Apagar', cancelText: 'Cancelar', danger: true });
      if (!ok) return;
      try { await deleteDesafio(b.dataset.del); await refresh(); }
      catch (e) { showToast(e.message || 'Erro ao apagar', 'error'); }
    });
    app.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await joinDesafio(b.dataset.join, meuNome); showToast('🦅 Você entrou no desafio!', 'success'); await refresh(); }
      catch (e) { showToast(e.message || 'Erro', 'error'); b.disabled = false; }
    });
    app.querySelectorAll('[data-leave]').forEach(b => b.onclick = async () => {
      const ok = await confirmModal({ title: 'Sair do desafio?', message: 'Seu progresso de check-ins é mantido, mas você sai do ranking ativo.', confirmText: 'Sair', cancelText: 'Ficar' });
      if (!ok) return;
      try { await leaveDesafio(b.dataset.leave); await refresh(); }
      catch (e) { showToast(e.message || 'Erro', 'error'); }
    });
    app.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await addCheckin(b.dataset.add, parseInt(b.dataset.qtd, 10) || 1); await refresh(); }
      catch (e) { showToast(e.message || 'Erro', 'error'); b.disabled = false; }
    });
    app.querySelectorAll('[data-addinput]').forEach(b => b.onclick = async () => {
      const id = b.dataset.addinput;
      const inp = app.querySelector(`#q-${CSS.escape(id)}`);
      const qtd = parseInt(inp?.value, 10);
      if (!qtd || qtd <= 0) { showToast('Digite quanto você fez', 'info'); return; }
      b.disabled = true;
      try { await addCheckin(id, qtd); await refresh(); }
      catch (e) { showToast(e.message || 'Erro', 'error'); b.disabled = false; }
    });
    app.querySelectorAll('[data-wpp]').forEach(b => b.onclick = () => {
      window.open('https://wa.me/', '_blank');
    });
  }

  // ── Admin: seletor de moldes ───────────────────────────────
  function openMoldePicker() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo desafio</div>
        <div class="modal-hint">Escolha o tipo — o formato já vem pronto.</div>
        <div class="ds-molde-grid">
          ${MOLDES.map(m => `
            <button class="ds-molde" data-molde="${m.id}">
              <span class="ds-molde-emoji">${m.emoji}</span>
              <span class="ds-molde-nome">${_esc(m.nome)}</span>
            </button>`).join('')}
        </div>
        <div class="modal-actions"><button class="btn-secondary" id="mp-close">Cancelar</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#mp-close').onclick = close;
    overlay.querySelectorAll('[data-molde]').forEach(b => b.onclick = () => {
      const m = MOLDES.find(x => x.id === b.dataset.molde);
      close();
      openDesafioForm({ molde: m });
    });
  }

  // ── Admin: formulário (novo a partir de molde, ou edição) ──
  function openDesafioForm({ molde, desafio }) {
    const edit = !!desafio;
    const src = desafio || molde;
    const emoji = edit ? emojiDoTipo(desafio.tipo) : molde.emoji;
    const tipo = edit ? desafio.tipo : molde.id;
    const opcoesStr = (edit ? desafio.prova_opcoes : molde.opcoes)?.join(', ') || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${emoji} ${edit ? 'Editar desafio' : _esc(molde.nome)}</div>
        <label class="input-field"><div class="input-field-label">Título</div>
          <input id="f-titulo" maxlength="120" value="${_esc(edit ? desafio.titulo : molde.titulo)}" /></label>
        <div style="display:flex;gap:8px">
          <label class="input-field" style="flex:1"><div class="input-field-label">Meta/dia</div>
            <input id="f-meta" type="number" min="1" value="${edit ? (desafio.meta_diaria ?? '') : molde.meta}" /></label>
          <label class="input-field" style="flex:1"><div class="input-field-label">Unidade</div>
            <input id="f-unidade" value="${_esc(edit ? (desafio.unidade || '') : molde.unidade)}" /></label>
        </div>
        <div style="display:flex;gap:8px">
          <label class="input-field" style="flex:1"><div class="input-field-label">Duração (dias)</div>
            <input id="f-dias" type="number" min="1" value="${edit ? (desafio.dias_total ?? '') : molde.dias}" /></label>
          <label class="input-field" style="flex:1"><div class="input-field-label">Incrementos</div>
            <input id="f-opcoes" value="${_esc(opcoesStr)}" placeholder="250, 500 (vazio = digitar)" /></label>
        </div>
        <label class="input-field"><div class="input-field-label">Descrição / regras</div>
          <textarea id="f-desc" rows="4">${_esc(edit ? desafio.descricao : molde.desc)}</textarea></label>
        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" id="f-save" style="width:100%">${edit ? 'Salvar alterações' : 'Publicar desafio'}</button>
          <button class="btn-secondary" id="f-cancel" style="width:100%">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#f-cancel').onclick = close;

    overlay.querySelector('#f-save').onclick = async () => {
      const titulo = overlay.querySelector('#f-titulo').value.trim();
      const descricao = overlay.querySelector('#f-desc').value.trim();
      const meta = parseInt(overlay.querySelector('#f-meta').value, 10) || null;
      const unidade = overlay.querySelector('#f-unidade').value.trim();
      const dias = parseInt(overlay.querySelector('#f-dias').value, 10) || null;
      const opcoes = parseOpcoes(overlay.querySelector('#f-opcoes').value);
      if (!titulo || !descricao) { showToast('Preencha título e descrição', 'error'); return; }
      const btn = overlay.querySelector('#f-save');
      btn.disabled = true; btn.textContent = edit ? 'Salvando…' : 'Publicando…';
      try {
        if (edit) await updateDesafio(desafio.id, { titulo, descricao, dias, meta, unidade, opcoes, tipo });
        else      await createDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo });
        close();
        showToast(edit ? '✅ Desafio atualizado' : '🏆 Desafio publicado!', 'success');
        await refresh();
      } catch (e) {
        showToast(e.message || 'Erro', 'error');
        btn.disabled = false; btn.textContent = edit ? 'Salvar alterações' : 'Publicar desafio';
      }
    };
  }

  await refresh();
}
