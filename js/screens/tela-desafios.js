// ═══════════════════════════════════════════════════════════════
// FALCON · Tela Desafios (v1 — participar + check-in por meta + ranking)
// Cria por MOLDE (formato pré-pronto). Prova em vídeo AO VIVO (desafios-prova.js),
// exercícios com limite por dia e sem repetir o de ontem, regras fixas + do dono.
// ⚠️ Mudou algo aqui? Atualizar o Pet junto (pet-desafios.js + BLOCO 8.17 + Worker).
// ═══════════════════════════════════════════════════════════════
import {
  fetchDesafios, fetchParticipantes, fetchCheckins, fetchPlacar,
  joinDesafio, leaveDesafio, entrarPorCodigo,
  createDesafio, updateDesafio, deleteDesafio, patchDesafio, proporMudanca,
  markDesafiosSeen, assinarProvas, faxinaProvas, fetchPrendas,
} from '../desafios.js';
import { MOLDES, MOLDE_BY_ID, MODALIDADES, PRENDAS, gerarCodigo, emojiDoTipo,
         regrasFixasDo, textoProva, regrasDoDono, aindaNaoComecou, textoComeca, feitosHoje, corridasDaSemana, textoCorridasSemana, semanaSemCorrida, textoSemanaPerdida, regrasCorrida, modoEdicao, diffDesafio, KM_CORRIDA, MAX_KM_CORRIDA, diaDoDesafio, dataCurta, somarDias, exerciciosDeHoje, avisoExercicios, diaAnterior,
         ehLargar, horaLimite, passouDoLimite, devePrenda } from '../desafios-moldes.js';
import { registrarComProva, abrirStrava, passoAPassoCorrida, corridaPendente, proximoPassoCorrida } from '../desafios-prova.js';
import { rankingDoDesafio, abrirConvidar, convidarNoWhatsApp } from '../desafios-sala.js';
import { aceitarPrenda, aceitarPrendaDoCodigo, gravarPrenda, minhaPrenda, muralCarrosselHtml, ligarMuralCarrossel } from '../desafios-prendas.js';
import { abrirSugestoes, sugestoesTop } from '../prendas-sugestoes.js';
import { getProfile } from '../banco-dados.js';
import { isAdminPreview } from '../avisos.js';
import { auth } from '../autenticacao.js';
import { bottomNav } from '../components/menu-inferior.js';
import { showToast, confirmModal } from '../aviso-tela.js';
import { trapModalBack } from '../modal-voltar.js';
import { openTimePicker } from '../seletor-horario.js';
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
const _ranking = rankingDoDesafio;   // mesma conta da sala do grupo

// ── Entry point ──────────────────────────────────────────────
// embedded=true → renderiza SÓ o conteúdo (sem screen-pad/título/cinturão),
// pra viver dentro da aba Desafios da Comunidade (tela-chat.js).
export async function renderDesafios(app, embedded = false) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">${t('home.reminders.loading')}</div>`;

  const _wrapO = embedded ? '<div class="ds-embed">' : '<div class="screen-pad ds-embed">';
  const _wrapC = '</div>';
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
      [desafios, parts, checks, placar, prendas] = await Promise.all([
        fetchDesafios(), fetchParticipantes(), fetchCheckins(), fetchPlacar(), fetchPrendas(),
      ]);
    } catch (e) {
      app.innerHTML = `${_wrapO}<div class="ds-empty">${_esc(e.message)}</div>${_wrapC}${_nav()}`;
      return;
    }
    markDesafiosSeen(desafios.map(d => d.id));
    lastParts = parts;
    lastChecks = checks;
    draw(desafios, parts, checks, placar);
    if (!_faxinou) { _faxinou = true; faxinaProvas(); }
  }
  let _faxinou = false;
  let prendas = [];   // mural das prendas (desafios-prendas.js)
  let lastParts = [];
  let lastChecks = [];

  function draw(desafios, parts, checks, placar) {
    const today = _today();
    const topo = `
      <div class="ds-topo">
        <button class="ds-novo" id="ds-novo">＋ Novo desafio</button>
        <button class="ds-codigo-btn" id="ds-codigo">🔑 Entrar com código</button>
      </div>
      ${muralCarrosselHtml(prendas)}`;

    // Prenda: quem não concluiu grava; quem já pagou vê até quando fica no mural
    const prendaDoCard = (d, joined, dChecks, dParts) => {
      if (!joined || !d.prenda) return '';
      const paga = minhaPrenda(prendas, d.id, myUid);
      if (paga) {
        const noAr = new Date(paga.expira_em).getTime() > Date.now();
        return `<div class="ds-prenda-paga">✅ Prenda paga${noAr ? ` · no mural até ${new Date(paga.expira_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}</div>`;
      }
      const motivo = devePrenda(d, dChecks.filter(c => c.user_id === myUid), dParts.find(p => p.user_id === myUid)?.joined_at, today);
      if (!motivo) return '';
      return `<div class="ds-prenda-deve">🎭 ${_esc(motivo[0].toUpperCase() + motivo.slice(1))}: hora de pagar a prenda (<b>${_esc(d.prenda)}</b>). Ela vai pro Mural das Prendas por 7 dias.</div>
              <button class="ds-inc ds-prenda-btn" data-prenda="${d.id}" style="width:100%">🎥 Gravar a prenda</button>`;
    };

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
            ${aindaNaoComecou(d) ? `<span class="ds-badge teal">📅 ${textoComeca(d)}</span>` : ''}
            ${d.dias_total ? `<span class="ds-badge amber">${!aindaNaoComecou(d) && diaDoDesafio(d) && diaDoDesafio(d) <= d.dias_total ? `dia ${diaDoDesafio(d)} de ${d.dias_total}` : `${d.dias_total} dias`}</span>` : ''}
            ${meta ? `<span class="ds-badge teal">meta ${meta}${unidade ? ' ' + _esc(unidade) : ''}/dia</span>` : ''}
            ${d.modalidade !== 'individual' ? `<span class="ds-badge gray">🙋 ${totalParts}</span>` : ''}
            ${horaLimite(d) ? `<span class="ds-badge amber">⏰ até ${horaLimite(d)}</span>` : ''}
            ${textoProva(d) ? `<span class="ds-badge gray">${textoProva(d)}</span>` : ''}`;

          // Código de convite — só o dono de um desafio de amigos vê (pra compartilhar)
          const codigoHtml = (d.modalidade === 'amigos' && d.codigo && souDono)
            ? `<div class="ds-codigo-box">🔑 Código do convite: <strong>${_esc(d.codigo)}</strong>
                 <button class="ds-copy-cod" data-cod="${_esc(d.codigo)}">copiar</button></div>` : '';

          const prendaHtml = d.prenda
            ? `<div class="ds-prenda">🎭 <strong>Quem não concluir paga:</strong> ${_esc(d.prenda)}</div>` : '';

          const exercicios = Array.isArray(d.exercicios) && d.exercicios.length ? d.exercicios : null;
          const corrida = d.prova === 'strava' || (exercicios && exercicios.includes('Corrida'));
          const pend = joined && corrida ? proximoPassoCorrida(d.id) : null;
          const corridaBtns = (joined && corrida) ? `
              <div class="ds-corrida">
                <button class="ds-correr" data-correr="1">🏃 Correr com o Falcon</button>
                <button class="ds-passos-btn" data-passos="1">📋 Passo a passo</button>
              </div>
              ${pend ? `<button class="ds-inc ds-print" data-print="${d.id}" style="width:100%">${pend.rotulo}</button>
                        <div class="ds-prova-dica">${pend.dica}</div>` : ''}` : '';

          let acao = '';
          if (!joined) {
            acao = `<button class="ds-join" data-join="${d.id}">🙋 Participar</button>`;
          } else if (exercicios && semanaSemCorrida(d, dChecks.filter(c => c.user_id === myUid), dParts.find(p => p.user_id === myUid)?.joined_at)) {
            // Semana fechou sem a corrida pedida: perdeu o desafio
            const seg = semanaSemCorrida(d, dChecks.filter(c => c.user_id === myUid), dParts.find(p => p.user_id === myUid)?.joined_at);
            acao = `<div class="ds-perdeu">❌ Tu perdeu esse desafio: ${textoSemanaPerdida(seg)}.${d.prenda ? ` Prenda: ${_esc(d.prenda)}.` : ''} Bora no próximo 🦅</div>`;
          } else if (exercicios) {
            // Constância de exercício: um botão por exercício, com as regras do dia
            const meus = dChecks.filter(c => c.user_id === myUid);
            const lista = exerciciosDeHoje(d, meus, today, diaAnterior(today));
            const lim = d.max_por_dia || meta || lista.filter(x => x.feito).length;
            const feitos = feitosHoje(lista, lim);
            const sem = corridasDaSemana(d, meus, today);
            const pct = lim ? Math.min(100, Math.round((feitos / lim) * 100)) : 0;
            acao = `
              <div class="ds-progress-head"><span>Hoje</span><span class="ds-progress-val">${feitos} / ${lim} ${lim === 1 ? 'exercício' : 'exercícios'}</span></div>
              <div class="ds-bar"><div class="ds-bar-fill" style="width:${pct}%"></div></div>
              ${feitos >= lim ? `<div class="ds-done">✅ ${lista.some(x => x.nome === 'Corrida' && x.feito) ? 'Hoje fechou com a corrida! 🏃' : 'Exercícios de hoje feitos! Amanhã são outros 🦅'}</div>` : ''}
              ${sem && sem.troca ? `<div class="ds-corrida-semana ${sem.falta ? '' : 'ok'}">🏃 Corrida da semana: <b>${sem.falta ? 'ainda dá' : 'feita ✅'}</b>${sem.falta ? ' · no lugar dos exercícios do dia' : ''}</div>`
                : sem ? `<div class="ds-corrida-semana ${sem.falta ? '' : 'ok'}">🏃 Corrida da semana: <b>${sem.feitas}/${sem.meta}</b>${sem.falta ? ` · até domingo` : ' ✅'}</div>` : ''}
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
                <button class="ds-inc" data-corrida="${d.id}">🏃 Registrar a corrida</button>
              </div>`}`;
          } else if (ehLargar(d)) {
            // Largar um vício: todo dia conta como foi, conseguindo ou não (com depoimento)
            const meusHoje = dChecks.filter(c => c.user_id === myUid && c.dia === today);
            const limpos = new Set(dChecks.filter(c => c.user_id === myUid && c.quantidade > 0).map(c => c.dia));
            let seguidos = 0;
            for (let dia = limpos.has(today) ? today : diaAnterior(today); limpos.has(dia); dia = diaAnterior(dia)) seguidos++;
            const serie = seguidos ? `<div class="ds-serie">🔥 ${seguidos} ${seguidos === 1 ? 'dia limpo seguido' : 'dias limpos seguidos'}</div>` : '';
            acao = meusHoje.length
              ? `${serie}<div class="ds-done">${todaySum > 0 ? '✅ Mais um dia limpo! 🦅' : '💪 Depoimento de hoje enviado, dia contado. Amanhã é um novo dia.'}</div>`
              : `${serie}<div class="ds-largar">
                   <button class="ds-inc" data-add="${d.id}" data-qtd="1">✅ Consegui</button>
                   <button class="ds-inc ds-falhei" data-falhei="${d.id}">😔 Não consegui</button>
                 </div>
                 <div class="ds-prova-dica">Nos dois casos você grava um depoimento. Sem depoimento, o dia não conta.</div>`;
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

          // Horário limite (ex.: acordar às 5h): passou e não marcou, fecha por hoje
          if (joined && !todaySum && !ehLargar(d) && passouDoLimite(d)) {
            acao = `<div class="ds-prova-dica">⏰ Passou das ${horaLimite(d)}. Amanhã tem de novo 🦅</div>`;
          }

          const rankHtml = joined && rank.length ? `
            <div class="ds-rank">
              <div class="ds-rank-title">🏅 Ranking</div>
              ${rank.slice(0, 8).map((r, i) => `
                <div class="ds-rank-row ${r.user_id === myUid ? 'me' : ''}">
                  <span>${i + 1} · ${_esc(r.nome)}${r.user_id === myUid ? ' (você)' : ''}</span>
                  <span class="ds-rank-days">${r.perdeu ? '❌ ficou sem corrida' : `${r.done} ${r.done === 1 ? 'dia' : 'dias'}${i === 0 && r.done > 0 ? ' 🔥' : ''}`}</span>
                </div>`).join('')}
            </div>` : '';

          // Regras: as fixas do app + as do dono (+ a regra dos exercícios)
          const regrasEx = exercicios ? [
            `Até ${d.max_por_dia || meta || 1} por dia, escolhidos da lista: ${exercicios.map(_esc).join(', ')}.`,
            ...(d.nao_repetir !== false ? ['Não pode repetir o exercício de ontem.'] : []),
            ...regrasCorrida(d),
          ] : [];
          const dono = regrasDoDono(d);
          const regrasHtml = `
            <details class="ds-regras">
              <summary>📜 Regras</summary>
              ${regrasEx.length ? `<div class="ds-regras-tit">Deste desafio</div><ul>${regrasEx.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
              ${dono.length ? `<div class="ds-regras-tit">Do dono do desafio</div><ul>${dono.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>` : ''}
              <div class="ds-regras-tit">Do Falcon (valem sempre)</div>
              <ul>${regrasFixasDo(d).map(r => `<li>${_esc(r)}</li>`).join('')}</ul>
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
          // Grupo: abre a sala (conversa do desafio, com as provas e o ranking)
          const wpp = (joined && !solo) ? `<button class="ds-wpp ds-sala-btn" data-sala="${d.id}">💬 Abrir o grupo</button>` : '';
          // Convidar: desafio com amigos, pra quem já está dentro
          const convidar = (joined && d.modalidade === 'amigos' && d.codigo)
            ? `<button class="ds-wpp ds-convidar" data-convidar="${d.id}">📨 Convidar participantes</button>` : '';
          const sair = joined ? `<button class="ds-leave" data-leave="${d.id}">Sair do desafio</button>` : '';

          return `
            <div class="ds-card" data-id="${d.id}">
              <div class="ds-card-head">
                <div class="ds-card-title" ${joined && !solo ? `data-sala="${d.id}" role="button"` : ''}>${emojiDoTipo(d.tipo)} ${_esc(d.titulo)}</div>
                ${adminCtrl}
              </div>
              <div class="ds-badges">${badges}</div>
              <div class="ds-card-desc">${_esc(d.descricao).replace(/\n/g, '<br>')}</div>
              ${prendaHtml}
              ${codigoHtml}
              <div class="ds-card-acao">${acao}</div>
              ${prendaDoCard(d, joined, dChecks, dParts)}
              ${regrasHtml}
              ${provasHtml}
              ${solo ? '' : rankHtml}
              ${convidar}
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
    ligarMuralCarrossel(app, prendas);
    app.querySelector('#ds-sugestoes')?.addEventListener('click', abrirSugestoes);
    app.querySelectorAll('[data-prenda]').forEach(b => b.onclick = async () => {
      const d = desafios.find(x => x.id === b.dataset.prenda);
      if (d && await gravarPrenda(d)) await refresh();
    });
    app.querySelectorAll('[data-cod]').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.cod); showToast('🔑 Código copiado!', 'success'); }
      catch { showToast(`Código: ${b.dataset.cod}`, 'info'); }
    });
    app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const d = desafios.find(x => x.id === b.dataset.edit);
      if (d && modoEdicao(d, lastParts, lastChecks) === 'travada') {
        showToast('Já mandaram prova no desafio: as regras não mudam mais 🔒', 'info');
        return;
      }
      if (d) openDesafioForm({ desafio: d });
    });
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const ok = await confirmModal({ title: 'Apagar desafio?', message: 'O desafio e os check-ins ligados a ele serão removidos.', confirmText: 'Apagar', cancelText: 'Cancelar', danger: true });
      if (!ok) return;
      try { await deleteDesafio(b.dataset.del); await refresh(); }
      catch (e) { showToast(e.message || 'Erro ao apagar', 'error'); }
    });
    app.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
      const d = desafios.find(x => x.id === b.dataset.join);
      if (!(await aceitarPrenda(d || {}))) return;
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
    app.querySelectorAll('[data-falhei]').forEach(b => b.onclick = () =>
      comProva(b, b.dataset.falhei, { falhou: true }));
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
    app.querySelectorAll('[data-convidar]').forEach(b => b.onclick = () => {
      const d = desafios.find(x => x.id === b.dataset.convidar);
      if (d) abrirConvidar(d, (lastParts || []).filter(p => p.desafio_id === d.id), myUid);
    });
    // A sala vive na Comunidade (tela-chat.js): ela escuta e abre
    app.querySelectorAll('[data-sala]').forEach(b => b.onclick = () => {
      const d = desafios.find(x => x.id === b.dataset.sala);
      if (d) window.dispatchEvent(new CustomEvent('falcon:sala-desafio', { detail: { id: d.id, titulo: d.titulo, tipo: d.tipo } }));
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

  // Abre o próximo modal só depois que o fechar do anterior voltou o histórico;
  // senão esse "voltar" atrasado fecha o modal novo na hora.
  function _depoisDoVoltar(fn) {
    let feito = false;
    const ir = () => { if (feito) return; feito = true; window.removeEventListener('popstate', onPop); fn(); };
    const onPop = () => setTimeout(ir, 0);
    window.addEventListener('popstate', onPop);
    setTimeout(ir, 600);
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
      _depoisDoVoltar(() => openMoldePicker(b.dataset.mod));
    });
  }

  // ── Passo 2: escolher o molde ──────────────────────────────
  function openMoldePicker(modalidade) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo desafio</div>
        <div class="modal-hint">Escolha um modelo: ele vem pronto e você muda o que quiser. Ou crie do seu jeito.</div>
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
      _depoisDoVoltar(() => openDesafioForm({ molde: m, modalidade }));
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
        if (!(await aceitarPrendaDoCodigo(cod))) { go.disabled = false; go.textContent = 'Entrar no desafio'; return; }
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

  // Explicação curta do modo da corrida no formulário
  function textoModoCorrida(modo) {
    return modo === 'troca'
      ? `1 vez por semana a corrida entra no lugar dos exercícios do dia (até ${MAX_KM_CORRIDA} km, cabe em 30 min). Se não correr, os exercícios de todo dia seguem valendo e ninguém perde.`
      : `Até ${MAX_KM_CORRIDA} km: cabe em 30 min. No dia que correr, a corrida vale o dia todo. Quem fechar a semana sem correr perde o desafio.`;
  }

  const PROVA_ROTULO = {
    video: '🎥 Vídeo ao vivo',
    strava: '🏃 Corrida: Strava ou esteira + vídeo',
    depoimento: '🎙️ Depoimento em vídeo',
    honra: '🤝 Por honra (só marcar)',
  };

  // ── Admin: formulário (novo a partir de molde, ou edição) ──
  function openDesafioForm({ molde, desafio, modalidade }) {
    const edit = !!desafio;
    // Com gente no grupo (antes de começar), salvar vira proposta pro grupo aceitar
    const proposta = edit && modoEdicao(desafio, lastParts, lastChecks) === 'proposta';
    const emoji = edit ? emojiDoTipo(desafio.tipo) : molde.emoji;
    const tipo = edit ? desafio.tipo : molde.id;
    const mod = edit ? desafio.modalidade : modalidade;
    const opcoesAtuais = (edit ? desafio.prova_opcoes : molde.opcoes) || [];
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
    const corrSemAtual = Math.min(2, (edit && desafio.corridas_semana) || 1);
    const modoAtual = edit && desafio.corrida_modo === 'troca' ? 'troca' : 'obrigatoria';
    // Desafio antigo sem km: nenhum chip marcado (não inventa uma mudança)
    const kmAtual = edit ? (Number(desafio.km_corrida) ? Math.min(MAX_KM_CORRIDA, Number(desafio.km_corrida)) : '') : 3;
    // Descrição e regras do dono num campo só: regras antigas entram no fim do texto
    const descAtual = edit ? [desafio.descricao || '', desafio.regras_dono || ''].filter(x => x.trim()).join('\n') : (molde.desc || '');
    const largar = tipo === 'largar';
    const horaAtual = edit ? horaLimite(desafio) : (molde.horaLimite || '');
    // Cada modelo já vem com prova e unidade fixas: só o "Do seu jeito" escolhe
    const livre = tipo === 'livre' || !moldeBase;
    const provaFixa = !livre;
    const unidadeAtual = edit ? (desafio.unidade || '') : (molde.unidade || '');
    const semMeta = temEx || largar || (!livre && !unidadeAtual);
    const ROTULO_UN = { ml: 'Água por dia (ml)', km: 'Km por dia', min: 'Minutos por dia', 'reflexão': 'Reflexões por dia' };
    const rotuloMeta = ROTULO_UN[unidadeAtual] || (unidadeAtual ? unidadeAtual.charAt(0).toUpperCase() + unidadeAtual.slice(1) + ' por dia' : 'Meta por dia');
    const metaLivreAtual = edit && desafio.meta_diaria ? `${desafio.meta_diaria} ${desafio.unidade || ''}`.trim() : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${emoji} ${edit ? 'Editar desafio' : _esc(molde.nome)}</div>
        ${proposta ? `<div class="ds-proposta-aviso">👥 Já tem gente no grupo. O que tu mudar vai como <b>proposta</b> e só vale se <b>todo mundo aceitar</b>. Depois que alguém manda a primeira prova, as regras não mudam mais.</div>` : ''}
        <label class="input-field"><div class="input-field-label">Título</div>
          <input id="f-titulo" maxlength="120" value="${_esc(edit ? desafio.titulo : molde.titulo)}"
                 placeholder="${largar ? 'Ex.: Parar de fumar, Sem refrigerante' : 'Ex.: Acordar às 5h, Sem açúcar, Dormir às 22h'}" /></label>
        ${temEx ? `
        <div class="ds-form-sec">
          <div class="input-field-label">Exercícios (até 4)</div>
          <div class="ds-ex-campos">${[0, 1, 2, 3].map(i => `
            <input class="aviso-input ds-ex-in" maxlength="40" placeholder="Exercício ${i + 1}" value="${_esc(exSemCorrida[i] || '')}" />`).join('')}</div>
          <label class="ds-check"><input type="checkbox" id="f-corrida" ${comCorrida ? 'checked' : ''}/> 🏃 Incluir corrida (rua ou esteira, com vídeo ao vivo)</label>
          <div class="input-field ds-corr-sem" id="f-corr-sem-box" ${comCorrida ? '' : 'hidden'}>
            <div class="input-field-label">🏃 Como a corrida entra</div>
            <div class="ds-ini-chips" data-chips="f-corr-modo">
              <button type="button" class="ds-ini-chip ${modoAtual === 'obrigatoria' ? 'on' : ''}" data-v="obrigatoria">🏃 Obrigatória</button>
              <button type="button" class="ds-ini-chip ${modoAtual === 'troca' ? 'on' : ''}" data-v="troca">🔁 Corrida ou exercícios</button></div>
            <input type="hidden" id="f-corr-modo" value="${modoAtual}" />
            <div id="f-corr-sem-sec" ${modoAtual === 'troca' ? 'hidden' : ''}>
            <div class="input-field-label" style="margin-top:10px">🏃 Corridas por semana</div>
            <div class="ds-ini-chips" data-chips="f-corr-sem">${[1, 2].map(n => `
              <button type="button" class="ds-ini-chip ${n === corrSemAtual ? 'on' : ''}" data-v="${n}">${n}x por semana</button>`).join('')}</div>
            <input type="hidden" id="f-corr-sem" value="${corrSemAtual}" />
            </div>
            <div class="input-field-label" style="margin-top:10px">📏 Distância de cada corrida</div>
            <div class="ds-ini-chips" data-chips="f-km">${KM_CORRIDA.map(n => `
              <button type="button" class="ds-ini-chip ${n === kmAtual ? 'on' : ''}" data-v="${n}">${n} km</button>`).join('')}</div>
            <input type="hidden" id="f-km" value="${kmAtual}" />
            <div class="ds-ini-txt" id="f-corr-txt">${textoModoCorrida(modoAtual)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <label class="input-field" style="flex:1"><div class="input-field-label">Máximo por dia</div>
              <select id="f-max">${[1, 2, 3].map(n => `<option value="${n}"${n === maxAtual ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          </div>
          <label class="ds-check"><input type="checkbox" id="f-naorep" ${naoRepAtual ? 'checked' : ''}/> Não pode repetir o exercício de ontem</label>
          <div class="ds-form-aviso" id="f-ex-aviso" hidden></div>
        </div>` : ''}
        ${provaFixa ? `
        <div class="input-field"><div class="input-field-label">Prova</div>
          <div class="ds-prova-fixa">${PROVA_ROTULO[provaAtual] || provaAtual}</div>
          <input type="hidden" id="f-prova" value="${provaAtual}" /></div>` : `
        <label class="input-field"><div class="input-field-label">Prova</div>
          <select id="f-prova">${Object.entries(PROVA_ROTULO).map(([v, r]) => `
            <option value="${v}"${provaAtual === v ? ' selected' : ''}>${r}</option>`).join('')}
          </select></label>`}
        <input type="hidden" id="f-unidade" value="${_esc(unidadeAtual)}" />
        <div style="display:flex;gap:8px">
          ${semMeta ? '' : livre ? `
          <label class="input-field" style="flex:1"><div class="input-field-label">Meta por dia (opcional)</div>
            <input id="f-meta-livre" maxlength="40" value="${_esc(metaLivreAtual)}" placeholder="ex.: 10 flexões" /></label>` : `
          <label class="input-field" style="flex:1"><div class="input-field-label">${_esc(rotuloMeta)}</div>
            <input id="f-meta" type="number" min="1" value="${edit ? (desafio.meta_diaria ?? '') : molde.meta}" /></label>`}
          <label class="input-field" style="flex:1"><div class="input-field-label">Duração (dias)</div>
            <input id="f-dias" type="number" min="1" value="${edit ? (desafio.dias_total ?? '') : molde.dias}" /></label>
        </div>
        <label class="input-field"><div class="input-field-label">📜 Descrição e regras</div>
          <textarea id="f-desc" rows="5" maxlength="1500" placeholder="O que é pra fazer, como provar e as tuas regras (ex.: vale até 23h59)">${_esc(descAtual)}</textarea></label>
        ${largar ? '' : `<div class="input-field"><div class="input-field-label">⏰ Prova do dia só até (opcional)</div>
          <div class="ds-hora-row">
            <button type="button" class="ds-hora-btn ${horaAtual ? '' : 'vazio'}" id="f-hora-btn">${horaAtual ? _esc(horaAtual) : 'Sem horário · vale o dia todo'}</button>
            <button type="button" class="ds-hora-x" id="f-hora-limpar" aria-label="Tirar o horário" ${horaAtual ? '' : 'hidden'}>✕</button>
          </div>
          <input id="f-hora" type="hidden" value="${_esc(horaAtual)}" /></div>`}
        <div class="ds-prenda-aviso">As regras do Falcon valem sempre: vídeo só ao vivo, prenda leve e do bem. A prenda paga vai pro Mural das Prendas por 7 dias.</div>

        ${mod === 'oficial' ? `
        <div style="display:flex;gap:8px">
          <label class="input-field" style="flex:1"><div class="input-field-label">Começa em</div>
            <input id="f-inicio" type="date" value="${edit ? (desafio.data_inicio || '') : ''}" /></label>
          <label class="input-field" style="flex:1"><div class="input-field-label">Termina em</div>
            <input id="f-fim" type="date" value="${edit ? (desafio.data_fim || '') : ''}" /></label>
        </div>` : `
        <div class="input-field"><div class="input-field-label">📅 Começa</div>
          <div class="ds-ini-chips" id="f-ini-chips"></div>
          <input id="f-inicio" type="date" class="ds-ini-data" hidden />
          <div class="ds-ini-txt" id="f-ini-txt"></div>
        </div>`}

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
        <div class="ds-prenda-aviso">Combine antes de abrir: quem entra já aceita. Leve e do bem, nunca constrangedora. Quem não concluir grava a prenda e ela fica no Mural das Prendas do app, pra todo mundo, por 7 dias, sem download.</div>`}

        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" id="f-save" style="width:100%">${proposta ? 'Mandar proposta pro grupo' : edit ? 'Salvar alterações' : 'Publicar desafio'}</button>
          <button class="btn-secondary" id="f-cancel" style="width:100%">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = trapModalBack(() => overlay.remove());
    overlay.querySelector('#f-cancel').onclick = close;

    // Horário limite pelo relógio do Falcon (o nativo do Android vinha verde
    // e cortando o texto). Vazio = vale o dia todo.
    const horaBtn = overlay.querySelector('#f-hora-btn');
    const pintarHora = (h) => {
      overlay.querySelector('#f-hora').value = h || '';
      horaBtn.textContent = h || 'Sem horário · vale o dia todo';
      horaBtn.classList.toggle('vazio', !h);
      overlay.querySelector('#f-hora-limpar').hidden = !h;
    };
    horaBtn?.addEventListener('click', async () => {
      const h = await openTimePicker(overlay.querySelector('#f-hora').value || '05:30', { title: 'Prova do dia só até' });
      if (h) pintarHora(h);
    });
    overlay.querySelector('#f-hora-limpar')?.addEventListener('click', () => pintarHora(''));

    // 📅 Começa (amigos/individual): Hoje · Amanhã · Segunda · Outra data.
    // O fim sai sozinho: início + duração.
    const iniChips = overlay.querySelector('#f-ini-chips');
    if (iniChips) {
      const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const amanha = somarDias(hojeIso, 1);
      const dow = new Date(hojeIso + 'T12:00:00').getDay();
      const segunda = somarDias(hojeIso, ((8 - dow) % 7) || 7);
      const opts = [['Hoje', hojeIso], ['Amanhã', amanha], ...(segunda !== amanha ? [[`Seg ${dataCurta(segunda).slice(4)}`, segunda]] : []), ['📆 Outra', '']];
      const inp = overlay.querySelector('#f-inicio');
      const txtIni = overlay.querySelector('#f-ini-txt');
      inp.min = hojeIso;
      const pintarIni = () => {
        const v = inp.value;
        const dias = parseInt(overlay.querySelector('#f-dias').value, 10) || 0;
        iniChips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.ini ? (inp.hidden && b.dataset.ini === v) : !inp.hidden));
        txtIni.textContent = v ? `Começa ${dataCurta(v)}${dias ? ` · termina ${dataCurta(somarDias(v, dias - 1))}` : ''}` : '';
      };
      iniChips.innerHTML = opts.map(([l, v]) => `<button type="button" class="ds-ini-chip" data-ini="${v}">${l}</button>`).join('');
      iniChips.addEventListener('click', (e) => {
        const b = e.target.closest('.ds-ini-chip'); if (!b) return;
        if (b.dataset.ini) { inp.value = b.dataset.ini; inp.hidden = true; }
        else { inp.hidden = false; inp.focus(); try { inp.showPicker?.(); } catch { /* sem showPicker */ } }
        pintarIni();
      });
      inp.addEventListener('change', pintarIni);
      overlay.querySelector('#f-dias').addEventListener('input', pintarIni);
      const atual = edit ? String(desafio.data_inicio || '').slice(0, 10) : '';
      inp.value = atual || hojeIso;
      if (atual && !opts.some(o => o[1] === atual)) inp.hidden = false;
      pintarIni();
    }

    // A descrição do molde fala da prova ("Prova por honra"): trocou a prova,
    // tira esse trecho pra não contradizer o que foi escolhido
    overlay.querySelector('#f-prova')?.addEventListener('change', (e) => {
      const desc = overlay.querySelector('#f-desc');
      if (!desc || e.target.value === 'honra') return;
      desc.value = desc.value.replace(/\s*\(Prova por honra[^)]*\)/i, '').trim();
    });

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
    overlay.querySelector('#f-corrida')?.addEventListener('change', (e) => { overlay.querySelector('#f-corr-sem-box').hidden = !e.target.checked; });
    // Chips da corrida (vezes por semana e km): marcam um e guardam no hidden
    overlay.querySelectorAll('[data-chips]').forEach(box => box.addEventListener('click', (e) => {
      const b = e.target.closest('.ds-ini-chip');
      if (!b) return;
      box.querySelectorAll('.ds-ini-chip').forEach(x => x.classList.toggle('on', x === b));
      overlay.querySelector('#' + box.dataset.chips).value = b.dataset.v;
      if (box.dataset.chips === 'f-corr-modo') {
        overlay.querySelector('#f-corr-sem-sec').hidden = b.dataset.v === 'troca';
        overlay.querySelector('#f-corr-txt').textContent = textoModoCorrida(b.dataset.v);
      }
    }));
    atualizarAviso();

    // "Escrever outra…" revela o campo livre da prenda
    const sel = overlay.querySelector('#f-prenda-sel');
    const txt = overlay.querySelector('#f-prenda-txt');
    // Sugestões aprovadas da galera entram na lista (as mais curtidas)
    if (sel) sugestoesTop(20).then(lista => {
      const novas = lista.filter(p => !PRENDAS.includes(p));
      if (!novas.length || !sel.isConnected) return;
      const g = document.createElement('optgroup');
      g.label = '💡 Sugestões da galera';
      novas.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; g.appendChild(o); });
      sel.insertBefore(g, sel.querySelector('option[value="__outra"]'));
      // Editando um desafio cuja prenda veio de sugestão: seleciona ela
      if (txt && novas.includes(txt.value.trim())) { sel.value = txt.value.trim(); txt.value = ''; txt.style.display = 'none'; }
    }).catch(() => {});
    sel?.addEventListener('change', () => {
      const outra = sel.value === '__outra';
      txt.style.display = outra ? '' : 'none';
      if (outra) txt.focus();
    });

    overlay.querySelector('#f-save').onclick = async () => {
      const titulo = overlay.querySelector('#f-titulo').value.trim();
      const prova = overlay.querySelector('#f-prova').value;
      let descricao = overlay.querySelector('#f-desc').value.trim();
      if (prova !== 'honra') descricao = descricao.replace(/\s*\(Prova por honra[^)]*\)/i, '').trim();
      let meta = parseInt(overlay.querySelector('#f-meta')?.value, 10) || null;
      let unidade = overlay.querySelector('#f-unidade').value.trim();
      // "Do seu jeito": um campo só ("10 flexões" = meta 10, unidade flexões)
      const metaLivre = overlay.querySelector('#f-meta-livre');
      if (metaLivre) {
        const m = metaLivre.value.trim().match(/^(\d+)\s*(.*)$/);
        if (metaLivre.value.trim() && !m) { showToast('Na meta, comece pelo número. Ex.: 10 flexões', 'error'); return; }
        meta = m ? parseInt(m[1], 10) || null : null;
        unidade = m ? m[2].trim() : '';
      }
      if (semMeta) meta = null;
      // Corrida: no máximo 5 km por dia (cabe em 30 min, dá pra encaixar na rotina)
      if (prova === 'strava' && /^km$/i.test(unidade) && meta > MAX_KM_CORRIDA) {
        showToast(`Corrida até ${MAX_KM_CORRIDA} km por dia: cabe em 30 min e dá pra todo mundo encaixar na rotina`, 'info');
        return;
      }
      // As regras agora vão junto na descrição. Editou sem mexer no texto: fica como estava
      let regrasDono = '';
      if (edit && descricao === descAtual.trim()) { descricao = (desafio.descricao || '').trim(); regrasDono = desafio.regras_dono || ''; }
      let exercicios, maxPorDia, naoRepetir, corridasSemana, kmCorrida, corridaModo;
      if (temEx) {
        exercicios = lerEx();
        maxPorDia = parseInt(overlay.querySelector('#f-max').value, 10) || 1;
        naoRepetir = overlay.querySelector('#f-naorep').checked;
        corridaModo = exercicios.includes('Corrida') ? overlay.querySelector('#f-corr-modo').value : null;
        // Troca opcional: 1 vez por semana
        corridasSemana = exercicios.includes('Corrida')
          ? (corridaModo === 'troca' ? 1 : Math.min(2, parseInt(overlay.querySelector('#f-corr-sem').value, 10) || 1)) : null;
        kmCorrida = exercicios.includes('Corrida') ? (Math.min(MAX_KM_CORRIDA, parseInt(overlay.querySelector('#f-km').value, 10)) || null) : null;
        if (!exercicios.length) { showToast('Coloque pelo menos um exercício', 'error'); return; }
        const aviso = atualizarAviso();
        if (aviso) { showToast(aviso, 'error'); return; }
        meta = maxPorDia; unidade = 'exercícios';   // o dia conta quando faz o máximo do dia
      }
      const dias = parseInt(overlay.querySelector('#f-dias').value, 10) || null;
      if (largar) { meta = null; unidade = ''; }
      // Botões de somar saíram do formulário: valem os do modelo (ou os que o desafio já tinha)
      const opcoes = semMeta || !meta ? [] : opcoesAtuais;
      const horaLim = overlay.querySelector('#f-hora')?.value || null;
      const extras = { prova, regrasDono, horaLimite: horaLim, ...(temEx ? { exercicios, maxPorDia, naoRepetir, corridasSemana, kmCorrida, corridaModo } : {}) };
      const dataInicio = overlay.querySelector('#f-inicio')?.value || null;
      let dataFim = overlay.querySelector('#f-fim')?.value || null;
      if (mod !== 'oficial' && dataInicio && dias) dataFim = somarDias(dataInicio, dias - 1);   // fim = início + duração
      const prenda = sel ? (sel.value === '__outra' ? txt.value.trim() : sel.value) : null;
      if (!titulo || !descricao) { showToast('Preencha título e descrição', 'error'); return; }
      const btn = overlay.querySelector('#f-save');
      btn.disabled = true; btn.textContent = proposta ? 'Enviando…' : edit ? 'Salvando…' : 'Publicando…';
      try {
        if (proposta) {
          const { mudancas, resumo } = diffDesafio(desafio, patchDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo, prenda, dataInicio, dataFim, ...extras }));
          if (!Object.keys(mudancas).length) {
            showToast('Nada mudou 🙂', 'info');
            btn.disabled = false; btn.textContent = 'Mandar proposta pro grupo';
            return;
          }
          await proporMudanca(desafio.id, mudancas, resumo);
          close();
          showToast('📝 Proposta enviada pro grupo. Só muda se todo mundo aceitar.', 'success');
          await refresh();
        } else if (edit) {
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
          // Desafio completo: o convite do WhatsApp leva as regras junto
          const novo = { id: novoId, titulo, codigo, descricao, dias_total: dias, meta_diaria: meta, unidade, tipo, prenda,
                         prova: extras.prova, regras_dono: extras.regrasDono, hora_limite: extras.horaLimite,
                         exercicios: extras.exercicios, max_por_dia: extras.maxPorDia, nao_repetir: extras.naoRepetir, corridas_semana: extras.corridasSemana, km_corrida: extras.kmCorrida, corrida_modo: extras.corridaModo, data_inicio: dataInicio };
          if (codigo) _depoisDoVoltar(() => mostrarCodigo(codigo, novo));
          else showToast('🏆 Desafio criado!', 'success');
          await refresh();
        }
      } catch (e) {
        showToast(e.message || 'Erro', 'error');
        btn.disabled = false; btn.textContent = proposta ? 'Mandar proposta pro grupo' : edit ? 'Salvar alterações' : 'Publicar desafio';
      }
    };
  }

  // ── Mostra o código pro criador compartilhar ───────────────
  function mostrarCodigo(codigo, d = null) {
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
          ${d ? `<button class="btn-secondary" id="cg-app" style="width:100%">📨 Convidar gente do Falcon</button>` : ''}
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
    overlay.querySelector('#cg-wpp').onclick = () => convidarNoWhatsApp(d || { titulo: 'um desafio', codigo });
    overlay.querySelector('#cg-app')?.addEventListener('click', () => {
      close();
      _depoisDoVoltar(() => abrirConvidar(d, [], myUid));
    });
  }

  await refresh();
}
