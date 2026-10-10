// ═══════════════════════════════════════════════════════════════
// FALCON · Tela Desafios (v1 — participar + check-in por meta + ranking)
// Cria por MOLDE (formato pré-pronto). Prova em vídeo AO VIVO (desafios-prova.js),
// exercícios com limite por dia e sem repetir o de ontem, regras fixas + do dono.
// ⚠️ Mudou algo aqui? Atualizar o Pet junto (pet-desafios.js + BLOCO 8.17 + Worker).
// ═══════════════════════════════════════════════════════════════
import {
  fetchDesafios, fetchParticipantes, fetchCheckins, fetchPlacar,
  joinDesafio, leaveDesafio, entrarPorCodigo,
  createDesafio, updateDesafio, deleteDesafio,
  parseOpcoes, markDesafiosSeen, assinarProvas, faxinaProvas,
} from '../desafios.js';
import { MOLDES, MOLDE_BY_ID, MODALIDADES, PRENDAS, gerarCodigo, emojiDoTipo,
         REGRAS_FIXAS, textoProva, regrasDoDono, exerciciosDeHoje, avisoExercicios, diaAnterior } from '../desafios-moldes.js';
import { registrarComProva, abrirStrava, passoAPassoCorrida, corridaPendente } from '../desafios-prova.js';
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
// embedded=true → renderiza SÓ o conteúdo (sem screen-pad/título/cinturão),
// pra viver dentro da aba Desafios da Comunidade (tela-chat.js).
export async function renderDesafios(app, embedded = false) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">${t('home.reminders.loading')}</div>`;

  const _wrapO = embedded ? '' : '<div class="screen-pad">';
  const _wrapC = embedded ? '' : '</div>';
  const _tit = embedded ? '' : `<div class="screen-title"><h1>🏆 ${t('nav.desafios')}</h1><div class="sub">${t('desafios.sub')}</div></div>`;
  const _nav = () => (embedded ? '' : bottomNav('desafios'));

  const myUid = auth.currentUser?.uid;
  const myEmail = auth.currentUser?.email;
  let profile = null;
  try { profile = await getProfile(); } catch { /* segue */ }
  const meuNome = _nomeFromProfile(profile, myEmail);
  const isAdmin = !!profile?.isAdmin && !isAdminPreview();

  async function refresh() {
    let desafios = [], parts = [], checks = [], placar = {};
    try {
      [desafios, parts, checks, placar] = await Promise.all([
        fetchDesafios(), fetchParticipantes(), fetchCheckins(), fetchPlacar(),
      ]);
    } catch (e) {
      app.innerHTML = `${_wrapO}<div class="ds-empty">${_esc(e.message)}</div>${_wrapC}${_nav()}`;
      return;
    }
    markDesafiosSeen(desafios.map(d => d.id));
    draw(desafios, parts, checks, placar);
    if (!_faxinou) { _faxinou = true; faxinaProvas(); }
  }
  let _faxinou = false;

  function draw(desafios, parts, checks, placar) {
    const today = _today();
    const topo = `
      <div class="ds-topo">
        <button class="ds-novo" id="ds-novo">＋ Novo desafio</button>
        <button class="ds-codigo-btn" id="ds-codigo">🔑 Entrar com código</button>
      </div>`;

    const cardHtml = (d) => {
          const dParts = parts.filter(p => p.desafio_id === d.id);
          const dChecks = checks.filter(c => c.desafio_id === d.id);
          const joined = dParts.some(p => p.user_id === myUid);
          const meta = d.meta_diaria;
          const unidade = d.unidade || '';
          const todaySum = dChecks
            .filter(c => c.user_id === myUid && c.dia === today)
            .reduce((s, c) => s + (c.quantidade || 0), 0);
          const rank = _ranking(d, dParts, dChecks);

          // Edita/apaga: o dono do desafio ou o admin
          const souDono = isAdmin || d.author_id === myUid;
          const adminCtrl = souDono ? `<div class="desafio-actions">
              <button class="ds-edit" data-edit="${d.id}" title="Editar" aria-label="Editar">✏️</button>
              <button class="ds-del" data-del="${d.id}" title="Apagar" aria-label="Apagar">🗑</button>
            </div>` : '';

          // Oficial: quem não entrou não lê os participantes (RLS) → usa o agregado
          const totalParts = d.modalidade === 'oficial'
            ? (placar[d.id]?.total ?? dParts.length)
            : dParts.length;
          const badges = `
            ${d.dias_total ? `<span class="ds-badge amber">${d.dias_total} dias</span>` : ''}
            ${meta ? `<span class="ds-badge teal">meta ${meta}${unidade ? ' ' + _esc(unidade) : ''}/dia</span>` : ''}
            ${d.modalidade !== 'individual' ? `<span class="ds-badge gray">🙋 ${totalParts}</span>` : ''}
            ${textoProva(d) ? `<span class="ds-badge gray">${textoProva(d)}</span>` : ''}`;

          // Código de convite — só o dono de um desafio de amigos vê (pra compartilhar)
          const codigoHtml = (d.modalidade === 'amigos' && d.codigo && souDono)
            ? `<div class="ds-codigo-box">🔑 Código do convite: <strong>${_esc(d.codigo)}</strong>
                 <button class="ds-copy-cod" data-cod="${_esc(d.codigo)}">copiar</button></div>` : '';

          const prendaHtml = d.prenda
            ? `<div class="ds-prenda">🎭 <strong>Quem não concluir paga:</strong> ${_esc(d.prenda)}</div>` : '';

          const exercicios = Array.isArray(d.exercicios) && d.exercicios.length ? d.exercicios : null;
          const corrida = d.prova === 'strava' || (exercicios && exercicios.includes('Corrida'));
          const pend = joined && corrida ? corridaPendente(d.id) : null;
          const corridaBtns = (joined && corrida) ? `
              <div class="ds-corrida">
                <button class="ds-correr" data-correr="1">🏃 Correr com o Falcon</button>
                <button class="ds-passos-btn" data-passos="1">📋 Passo a passo</button>
              </div>
              ${pend ? `<button class="ds-inc ds-print" data-print="${d.id}" style="width:100%">📷 Enviar o print da corrida</button>
                        <div class="ds-prova-dica">🎥 Vídeo da corrida já guardado. Falta só o print do Strava.</div>` : ''}` : '';

          let acao = '';
          if (!joined) {
            acao = `<button class="ds-join" data-join="${d.id}">🙋 Participar</button>`;
          } else if (exercicios) {
            // Constância de exercício: um botão por exercício, com as regras do dia
            const meus = dChecks.filter(c => c.user_id === myUid);
            const lista = exerciciosDeHoje(d, meus, today, diaAnterior(today));
            const feitos = lista.filter(x => x.feito).length;
            const lim = d.max_por_dia || meta || feitos;
            const pct = lim ? Math.min(100, Math.round((feitos / lim) * 100)) : 0;
            acao = `
              <div class="ds-progress-head"><span>Hoje</span><span class="ds-progress-val">${feitos} / ${lim} ${lim === 1 ? 'exercício' : 'exercícios'}</span></div>
              <div class="ds-bar"><div class="ds-bar-fill" style="width:${pct}%"></div></div>
              ${feitos >= lim ? `<div class="ds-done">✅ Exercícios de hoje feitos! Amanhã são outros 🦅</div>` : ''}
              <div class="ds-ex-lista">${lista.map(x => `
                <button class="ds-ex ${x.feito ? 'feito' : ''}" data-ex="${d.id}" data-exnome="${_esc(x.nome)}" ${x.ok ? '' : 'disabled'}>
                  <span>${x.feito ? '✅' : x.nome === 'Corrida' ? '🏃' : d.prova === 'video' ? '🎥' : '▫️'} ${_esc(x.nome)}</span>
                  ${x.ok ? '' : `<small>${_esc(x.motivo)}</small>`}
                </button>`).join('')}</div>
              ${corridaBtns}`;
          } else if (d.prova === 'strava') {
            const feito = todaySum > 0;
            acao = feito ? `<div class="ds-done">✅ Corrida de hoje registrada! 🦅</div>` : `
              ${corridaBtns}
              ${pend ? '' : `<div class="ds-inc-row">
                <input class="ds-inc-input" id="q-${d.id}" type="number" min="1" placeholder="${meta ? meta : ''} ${_esc(unidade)}" />
                <button class="ds-inc" data-corrida="${d.id}">🎥 Gravar o final da corrida</button>
              </div>`}`;
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

          // Regras: as fixas do app + as do dono (+ a regra dos exercícios)
          const regrasEx = exercicios ? [
            `Até ${d.max_por_dia || meta || 1} por dia, escolhidos da lista: ${exercicios.map(_esc).join(', ')}.`,
            ...(d.nao_repetir !== false ? ['Não pode repetir o exercício de ontem.'] : []),
          ] : [];
          const dono = regrasDoDono(d);
          const regrasHtml = `
            <details class="ds-regras">
              <summary>📜 Regras</summary>
              ${regrasEx.length ? `<div class="ds-regras-tit">Deste desafio</div><ul>${regrasEx.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
              ${dono.length ? `<div class="ds-regras-tit">Do dono do desafio</div><ul>${dono.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>` : ''}
              <div class="ds-regras-tit">Do Falcon (valem sempre)</div>
              <ul>${REGRAS_FIXAS.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>
            </details>`;

          // Provas de hoje e ontem (vídeo/print): só quem está dentro vê
          const provas = joined ? dChecks
            .filter(c => (c.video_path || c.print_path) && (c.dia === today || c.dia === diaAnterior(today)))
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : [];
          const nomeDe = (uid) => dParts.find(p => p.user_id === uid)?.nome || 'Falcão';
          const provasHtml = provas.length ? `
            <div class="ds-provas">
              <div class="ds-rank-title">🎥 Provas</div>
              ${provas.slice(0, 12).map(c => `
                <button class="ds-prova" data-video="${_esc(c.video_path || '')}" data-printp="${_esc(c.print_path || '')}">
                  <span>▶ ${c.user_id === myUid ? 'Você' : _esc(nomeDe(c.user_id))}${c.exercicio ? ` · ${_esc(c.exercicio)}` : ''}</span>
                  <small>${c.dia === today ? 'hoje' : 'ontem'}</small>
                </button>`).join('')}
            </div>` : '';

          // Individual é só seu: sem ranking, sem WhatsApp
          const solo = d.modalidade === 'individual';
          const wpp = (joined && !solo) ? `<button class="ds-wpp" data-wpp="1">💬 Chamar alguém no WhatsApp</button>` : '';
          const sair = joined ? `<button class="ds-leave" data-leave="${d.id}">Sair do desafio</button>` : '';

          return `
            <div class="ds-card" data-id="${d.id}">
              <div class="ds-card-head">
                <div class="ds-card-title">${emojiDoTipo(d.tipo)} ${_esc(d.titulo)}</div>
                ${adminCtrl}
              </div>
              <div class="ds-badges">${badges}</div>
              <div class="ds-card-desc">${_esc(d.descricao).replace(/\n/g, '<br>')}</div>
              ${prendaHtml}
              ${codigoHtml}
              <div class="ds-card-acao">${acao}</div>
              ${regrasHtml}
              ${provasHtml}
              ${solo ? '' : rankHtml}
              ${wpp}
              ${sair}
            </div>`;
    };

    // Agrupa por modalidade — cada uma tem um papel diferente
    const grupos = [
      { titulo: '🏆 Oficiais',    lista: desafios.filter(d => d.modalidade === 'oficial') },
      { titulo: '👥 Com amigos',  lista: desafios.filter(d => d.modalidade === 'amigos') },
      { titulo: '🧍 Só meus',     lista: desafios.filter(d => d.modalidade === 'individual') },
    ].filter(g => g.lista.length);

    const corpo = grupos.length === 0
      ? `<div class="ds-empty">${t('desafios.empty')}</div>`
      : grupos.map(g => `
          <div class="ds-grupo-title">${g.titulo}</div>
          ${g.lista.map(cardHtml).join('')}`).join('');

    app.innerHTML = `${_wrapO}${_tit}${topo}${corpo}${_wrapC}${_nav()}`;

    wire(desafios);
  }

  function wire(desafios) {
    app.querySelector('#ds-novo')?.addEventListener('click', openModalidadePicker);
    app.querySelector('#ds-codigo')?.addEventListener('click', openEntrarCodigo);
    app.querySelectorAll('[data-cod]').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.cod); showToast('🔑 Código copiado!', 'success'); }
      catch { showToast(`Código: ${b.dataset.cod}`, 'info'); }
    });
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
    // Check-in: com prova (vídeo ao vivo) quando o desafio pede
    const comProva = async (b, id, extra) => {
      const d = desafios.find(x => x.id === id);
      if (!d) return;
      b.disabled = true;
      const ok = await registrarComProva(d, extra);
      if (ok || d.prova === 'strava' || extra.exercicio === 'Corrida') await refresh();
      else b.disabled = false;
    };
    app.querySelectorAll('[data-add]').forEach(b => b.onclick = () =>
      comProva(b, b.dataset.add, { quantidade: parseInt(b.dataset.qtd, 10) || 1 }));
    app.querySelectorAll('[data-addinput]').forEach(b => b.onclick = () => {
      const id = b.dataset.addinput;
      const inp = app.querySelector(`#q-${CSS.escape(id)}`);
      const qtd = parseInt(inp?.value, 10);
      if (!qtd || qtd <= 0) { showToast('Digite quanto você fez', 'info'); return; }
      comProva(b, id, { quantidade: qtd });
    });
    app.querySelectorAll('[data-ex]').forEach(b => b.onclick = () =>
      comProva(b, b.dataset.ex, { quantidade: 1, exercicio: b.dataset.exnome }));
    app.querySelectorAll('[data-corrida]').forEach(b => b.onclick = () => {
      const id = b.dataset.corrida;
      const d = desafios.find(x => x.id === id);
      const qtd = parseInt(app.querySelector(`#q-${CSS.escape(id)}`)?.value, 10) || d?.meta_diaria || 1;
      comProva(b, id, { quantidade: qtd });
    });
    app.querySelectorAll('[data-print]').forEach(b => b.onclick = () => {
      const pend = corridaPendente(b.dataset.print);
      comProva(b, b.dataset.print, { quantidade: pend?.quantidade || 1, exercicio: pend?.exercicio || null });
    });
    app.querySelectorAll('[data-correr]').forEach(b => b.onclick = abrirStrava);
    app.querySelectorAll('[data-passos]').forEach(b => b.onclick = passoAPassoCorrida);
    app.querySelectorAll('[data-video]').forEach(b => b.onclick = () => verProva(b.dataset.video, b.dataset.printp));
    app.querySelectorAll('[data-wpp]').forEach(b => b.onclick = () => {
      window.open('https://wa.me/', '_blank');
    });
  }

  // ── Ver a prova (vídeo + print) ────────────────────────────
  async function verProva(videoPath, printPath) {
    const urls = await assinarProvas([videoPath, printPath]);
    const v = urls.get(videoPath), p = urls.get(printPath);
    if (!v && !p) { showToast('Essa prova já venceu (os vídeos somem em 7 dias).', 'info'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ds-prova-modal">
        ${v ? `<video src="${_esc(v)}" controls autoplay playsinline></video>` : ''}
        ${p ? `<img src="${_esc(p)}" alt="Print da corrida" />` : ''}
        <div class="modal-actions"><button class="btn-secondary" id="pv-close" style="width:100%">Fechar</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#pv-close').onclick = close;
  }

  // ── Passo 1: escolher a modalidade ─────────────────────────
  function openModalidadePicker() {
    const opts = MODALIDADES.filter(m => !m.adminOnly || isAdmin);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo desafio</div>
        <div class="modal-hint">Com quem você vai encarar?</div>
        ${opts.map(m => `
          <button class="ds-modalidade" data-mod="${m.id}">
            <span class="ds-molde-emoji">${m.emoji}</span>
            <span>
              <span class="ds-molde-nome">${_esc(m.nome)}</span>
              <small class="ds-modalidade-desc">${_esc(m.desc)}</small>
            </span>
          </button>`).join('')}
        <div class="modal-actions"><button class="btn-secondary" id="mod-close">Cancelar</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#mod-close').onclick = close;
    overlay.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => {
      close();
      openMoldePicker(b.dataset.mod);
    });
  }

  // ── Passo 2: escolher o molde ──────────────────────────────
  function openMoldePicker(modalidade) {
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
      openDesafioForm({ molde: m, modalidade });
    });
  }

  // ── Entrar num desafio de amigos pelo código ───────────────
  function openEntrarCodigo() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-title">🔑 Entrar com código</div>
        <div class="modal-hint">Cole aqui o código que seu amigo te mandou.</div>
        <label class="input-field"><div class="input-field-label">Código</div>
          <input id="cod-input" maxlength="8" placeholder="Ex: 7K2PQR" style="text-transform:uppercase;letter-spacing:2px;font-weight:700" /></label>
        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" id="cod-go" style="width:100%">Entrar no desafio</button>
          <button class="btn-secondary" id="cod-close" style="width:100%">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#cod-close').onclick = close;
    const go = overlay.querySelector('#cod-go');
    go.onclick = async () => {
      const cod = overlay.querySelector('#cod-input').value.trim();
      if (!cod) { showToast('Digite o código', 'info'); return; }
      go.disabled = true; go.textContent = 'Entrando…';
      try {
        await entrarPorCodigo(cod, meuNome);
        close();
        showToast('🦅 Você entrou no desafio!', 'success');
        await refresh();
      } catch (e) {
        showToast(e.message || 'Erro', 'error');
        go.disabled = false; go.textContent = 'Entrar no desafio';
      }
    };
  }

  // ── Admin: formulário (novo a partir de molde, ou edição) ──
  function openDesafioForm({ molde, desafio, modalidade }) {
    const edit = !!desafio;
    const emoji = edit ? emojiDoTipo(desafio.tipo) : molde.emoji;
    const tipo = edit ? desafio.tipo : molde.id;
    const mod = edit ? desafio.modalidade : modalidade;
    const opcoesStr = (edit ? desafio.prova_opcoes : molde.opcoes)?.join(', ') || '';
    const prendaAtual = edit ? (desafio.prenda || '') : '';
    // Prova, exercícios e regras do dono (desafios-provas.sql)
    const moldeBase = edit ? MOLDE_BY_ID[desafio.tipo] : molde;
    const provaAtual = edit ? (desafio.prova || moldeBase?.prova || 'honra') : (molde.prova || 'honra');
    const exAtual = edit ? (desafio.exercicios || []) : (molde.exercicios || []);
    const temEx = exAtual.length > 0 || tipo === 'exercicio';
    const exSemCorrida = exAtual.filter(x => x !== 'Corrida');
    const comCorrida = exAtual.includes('Corrida');
    const maxAtual = edit ? (desafio.max_por_dia || desafio.meta_diaria || 2) : (molde.maxPorDia || 2);
    const naoRepAtual = edit ? desafio.nao_repetir !== false : molde.naoRepetir !== false;
    const regrasAtual = edit ? (desafio.regras_dono || '') : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${emoji} ${edit ? 'Editar desafio' : _esc(molde.nome)}</div>
        <label class="input-field"><div class="input-field-label">Título</div>
          <input id="f-titulo" maxlength="120" value="${_esc(edit ? desafio.titulo : molde.titulo)}" /></label>
        ${temEx ? `
        <div class="ds-form-sec">
          <div class="input-field-label">Exercícios (até 4)</div>
          <div class="ds-ex-campos">${[0, 1, 2, 3].map(i => `
            <input class="aviso-input ds-ex-in" maxlength="40" placeholder="Exercício ${i + 1}" value="${_esc(exSemCorrida[i] || '')}" />`).join('')}</div>
          <label class="ds-check"><input type="checkbox" id="f-corrida" ${comCorrida ? 'checked' : ''}/> 🏃 Incluir corrida (print do Strava + vídeo ao vivo)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <label class="input-field" style="flex:1"><div class="input-field-label">Máximo por dia</div>
              <select id="f-max">${[1, 2, 3].map(n => `<option value="${n}"${n === maxAtual ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          </div>
          <label class="ds-check"><input type="checkbox" id="f-naorep" ${naoRepAtual ? 'checked' : ''}/> Não pode repetir o exercício de ontem</label>
          <div class="ds-form-aviso" id="f-ex-aviso" hidden></div>
        </div>` : ''}
        <label class="input-field"><div class="input-field-label">Prova</div>
          <select id="f-prova">
            <option value="video"${provaAtual === 'video' ? ' selected' : ''}>🎥 Vídeo ao vivo</option>
            <option value="strava"${provaAtual === 'strava' ? ' selected' : ''}>🏃 Print do Strava + vídeo ao vivo</option>
            <option value="honra"${provaAtual === 'honra' ? ' selected' : ''}>🤝 Por honra (só marcar)</option>
          </select></label>
        <div style="display:flex;gap:8px${temEx ? ';display:none' : ''}">
          <label class="input-field" style="flex:1"><div class="input-field-label">Meta/dia</div>
            <input id="f-meta" type="number" min="1" value="${edit ? (desafio.meta_diaria ?? '') : molde.meta}" /></label>
          <label class="input-field" style="flex:1"><div class="input-field-label">Unidade</div>
            <input id="f-unidade" value="${_esc(edit ? (desafio.unidade || '') : molde.unidade)}" /></label>
        </div>
        <div style="display:flex;gap:8px">
          <label class="input-field" style="flex:1"><div class="input-field-label">Duração (dias)</div>
            <input id="f-dias" type="number" min="1" value="${edit ? (desafio.dias_total ?? '') : molde.dias}" /></label>
          <label class="input-field" style="flex:1${temEx ? ';display:none' : ''}"><div class="input-field-label">Incrementos</div>
            <input id="f-opcoes" value="${_esc(opcoesStr)}" placeholder="250, 500 (vazio = digitar)" /></label>
        </div>
        <label class="input-field"><div class="input-field-label">Descrição</div>
          <textarea id="f-desc" rows="3">${_esc(edit ? desafio.descricao : molde.desc)}</textarea></label>
        <label class="input-field"><div class="input-field-label">📜 Tuas regras (uma por linha, opcional)</div>
          <textarea id="f-regras" rows="3" maxlength="800" placeholder="Ex.: vale até 23h59&#10;O vídeo tem que mostrar o exercício inteiro">${_esc(regrasAtual)}</textarea></label>
        <div class="ds-prenda-aviso">As regras do Falcon valem sempre: vídeo só ao vivo, prenda leve e ninguém expõe quem falhou.</div>

        ${mod === 'oficial' ? `
        <div style="display:flex;gap:8px">
          <label class="input-field" style="flex:1"><div class="input-field-label">Começa em</div>
            <input id="f-inicio" type="date" value="${edit ? (desafio.data_inicio || '') : ''}" /></label>
          <label class="input-field" style="flex:1"><div class="input-field-label">Termina em</div>
            <input id="f-fim" type="date" value="${edit ? (desafio.data_fim || '') : ''}" /></label>
        </div>` : ''}

        ${mod === 'individual' ? '' : `
        <label class="input-field"><div class="input-field-label">🎭 Prenda de quem não concluir</div>
          <select id="f-prenda-sel">
            <option value="">— sem prenda —</option>
            ${PRENDAS.map(p => `<option value="${_esc(p)}"${prendaAtual === p ? ' selected' : ''}>${_esc(p)}</option>`).join('')}
            <option value="__outra"${prendaAtual && !PRENDAS.includes(prendaAtual) ? ' selected' : ''}>✏️ Escrever outra…</option>
          </select></label>
        <input class="aviso-input" id="f-prenda-txt" placeholder="Escreva a prenda combinada"
               value="${_esc(prendaAtual && !PRENDAS.includes(prendaAtual) ? prendaAtual : '')}"
               style="${prendaAtual && !PRENDAS.includes(prendaAtual) ? '' : 'display:none'};margin-bottom:10px" />
        <div class="ds-prenda-aviso">Combine antes de abrir: quem entra já aceita. Leve e do bem — nunca constrangedora.</div>`}

        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" id="f-save" style="width:100%">${edit ? 'Salvar alterações' : 'Publicar desafio'}</button>
          <button class="btn-secondary" id="f-cancel" style="width:100%">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#f-cancel').onclick = close;

    // Lista de exercícios x limite por dia: avisa na hora se não fecha
    const lerEx = () => {
      const lista = [...overlay.querySelectorAll('.ds-ex-in')].map(i => i.value.trim()).filter(Boolean)
        .filter((x, i, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i);
      if (overlay.querySelector('#f-corrida')?.checked) lista.push('Corrida');
      return lista;
    };
    const avisoEl = overlay.querySelector('#f-ex-aviso');
    const atualizarAviso = () => {
      if (!avisoEl) return '';
      const msg = avisoExercicios(lerEx(), parseInt(overlay.querySelector('#f-max').value, 10), overlay.querySelector('#f-naorep').checked);
      avisoEl.textContent = msg ? `⚠️ ${msg}` : '';
      avisoEl.hidden = !msg;
      return msg;
    };
    overlay.querySelectorAll('.ds-ex-in, #f-corrida, #f-max, #f-naorep').forEach(el => el.addEventListener('input', atualizarAviso));
    overlay.querySelectorAll('#f-corrida, #f-max, #f-naorep').forEach(el => el.addEventListener('change', atualizarAviso));
    atualizarAviso();

    // "Escrever outra…" revela o campo livre da prenda
    const sel = overlay.querySelector('#f-prenda-sel');
    const txt = overlay.querySelector('#f-prenda-txt');
    sel?.addEventListener('change', () => {
      const outra = sel.value === '__outra';
      txt.style.display = outra ? '' : 'none';
      if (outra) txt.focus();
    });

    overlay.querySelector('#f-save').onclick = async () => {
      const titulo = overlay.querySelector('#f-titulo').value.trim();
      const descricao = overlay.querySelector('#f-desc').value.trim();
      let meta = parseInt(overlay.querySelector('#f-meta').value, 10) || null;
      let unidade = overlay.querySelector('#f-unidade').value.trim();
      const prova = overlay.querySelector('#f-prova').value;
      const regrasDono = overlay.querySelector('#f-regras').value;
      let exercicios, maxPorDia, naoRepetir;
      if (temEx) {
        exercicios = lerEx();
        maxPorDia = parseInt(overlay.querySelector('#f-max').value, 10) || 1;
        naoRepetir = overlay.querySelector('#f-naorep').checked;
        if (!exercicios.length) { showToast('Coloque pelo menos um exercício', 'error'); return; }
        const aviso = atualizarAviso();
        if (aviso) { showToast(aviso, 'error'); return; }
        meta = maxPorDia; unidade = 'exercícios';   // o dia conta quando faz o máximo do dia
      }
      const dias = parseInt(overlay.querySelector('#f-dias').value, 10) || null;
      const opcoes = temEx ? [] : parseOpcoes(overlay.querySelector('#f-opcoes').value);
      const extras = { prova, regrasDono, ...(temEx ? { exercicios, maxPorDia, naoRepetir } : {}) };
      const dataInicio = overlay.querySelector('#f-inicio')?.value || null;
      const dataFim = overlay.querySelector('#f-fim')?.value || null;
      const prenda = sel ? (sel.value === '__outra' ? txt.value.trim() : sel.value) : null;
      if (!titulo || !descricao) { showToast('Preencha título e descrição', 'error'); return; }
      const btn = overlay.querySelector('#f-save');
      btn.disabled = true; btn.textContent = edit ? 'Salvando…' : 'Publicando…';
      try {
        if (edit) {
          await updateDesafio(desafio.id, { titulo, descricao, dias, meta, unidade, opcoes, tipo, prenda, dataInicio, dataFim, ...extras });
          close();
          showToast('✅ Desafio atualizado', 'success');
          await refresh();
        } else {
          const codigo = mod === 'amigos' ? gerarCodigo() : null;
          const novoId = await createDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo,
                                               modalidade: mod, codigo, prenda, dataInicio, dataFim, ...extras });
          // O criador entra automaticamente no próprio desafio
          try { await joinDesafio(novoId, meuNome); } catch { /* segue */ }
          close();
          if (codigo) mostrarCodigo(codigo);
          else showToast('🏆 Desafio criado!', 'success');
          await refresh();
        }
      } catch (e) {
        showToast(e.message || 'Erro', 'error');
        btn.disabled = false; btn.textContent = edit ? 'Salvar alterações' : 'Publicar desafio';
      }
    };
  }

  // ── Mostra o código pro criador compartilhar ───────────────
  function mostrarCodigo(codigo) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center">
        <div style="font-size:40px">🔑</div>
        <div class="modal-title">Desafio criado!</div>
        <div class="modal-hint">Mande este código pros seus amigos entrarem:</div>
        <div class="ds-codigo-grande">${_esc(codigo)}</div>
        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" id="cg-wpp" style="width:100%">💬 Mandar no WhatsApp</button>
          <button class="btn-secondary" id="cg-copy" style="width:100%">Copiar código</button>
          <button class="btn-secondary" id="cg-ok" style="width:100%">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#cg-ok').onclick = close;
    overlay.querySelector('#cg-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(codigo); showToast('🔑 Código copiado!', 'success'); }
      catch { showToast(`Código: ${codigo}`, 'info'); }
    };
    overlay.querySelector('#cg-wpp').onclick = () => {
      const msg = encodeURIComponent(`Bora encarar um desafio comigo no Falcon? 🦅\nEntra com o código: ${codigo}`);
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    };
  }

  await refresh();
}
