// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Sala do desafio: a conversa do grupo (tela-chat.js) usa daqui
// o que é de desafio — progresso de hoje, ranking, regras e a 📷 da prova.
// A prova sai pelo mesmo registrarComProva da aba Desafios e do Pet; o banco
// (migration/desafios-sala.sql) posta a mensagem com o vídeo na sala sozinho.
// ⚠️ Mudou algo aqui? Atualizar o Pet junto (pet-desafios.js + BLOCO 8.17 + Worker).
// BLOCO 1 — DADOS DA SALA
// BLOCO 2 — RANKING E REGRAS
// BLOCO 3 — 📷 PROVA PELA SALA
// ─────────────────────────────────────────────────────────────
import { fetchDesafios, fetchParticipantes, fetchCheckins } from './desafios.js';
import { exerciciosDeHoje, diaAnterior, ehLargar, horaLimite, passouDoLimite,
         REGRAS_FIXAS, regrasDoDono } from './desafios-moldes.js';
import { registrarComProva, abrirStrava, passoAPassoCorrida, corridaPendente } from './desafios-prova.js';
import { trapModalBack } from './modal-voltar.js';
import { showToast } from './aviso-tela.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: DADOS DA SALA
// ═══════════════════════════════════════════════════════════════
// { d, parts, checks } só desse desafio. null = não achou (saiu, apagado).
export async function carregarSala(id) {
  const [ds, ps, cs] = await Promise.all([fetchDesafios(), fetchParticipantes(), fetchCheckins()]);
  const d = ds.find(x => x.id === id);
  if (!d) return null;
  return { d, parts: ps.filter(p => p.desafio_id === id), checks: cs.filter(c => c.desafio_id === id) };
}

// Pontos por pessoa: dias cumpridos (largar = todo dia com depoimento)
export function rankingDoDesafio(desafio, parts, checks) {
  const nomeById = {};
  parts.forEach(p => { nomeById[p.user_id] = p.nome || 'Falcão'; });
  const byUser = {};
  checks.forEach(c => {
    (byUser[c.user_id] ||= {});
    byUser[c.user_id][c.dia] = (byUser[c.user_id][c.dia] || 0) + (c.quantidade || 0);
  });
  const meta = desafio.meta_diaria;
  const largar = desafio.tipo === 'largar';
  return parts.map(p => {
    const days = byUser[p.user_id] || {};
    let done = 0;
    for (const d in days) if (largar || (meta ? days[d] >= meta : days[d] > 0)) done++;
    return { user_id: p.user_id, nome: nomeById[p.user_id], done };
  }).sort((a, b) => b.done - a.done);
}

// Como estou hoje nesse desafio, numa linha (subtítulo da sala)
export function resumoHoje(sala, uid) {
  const { d, parts, checks } = sala;
  const n = parts.length;
  const gente = `${n} ${n === 1 ? 'participante' : 'participantes'}`;
  if (!parts.some(p => p.user_id === uid)) return gente;
  const hoje = _hoje();
  const meus = checks.filter(c => c.user_id === uid);
  const deHoje = meus.filter(c => c.dia === hoje);
  const soma = deHoje.reduce((s, c) => s + (c.quantidade || 0), 0);
  const un = d.unidade ? ' ' + d.unidade : '';
  let st;
  if (Array.isArray(d.exercicios) && d.exercicios.length) {
    const lim = d.max_por_dia || d.meta_diaria || 1;
    st = deHoje.length >= lim ? '✅ hoje feito' : `hoje ${deHoje.length}/${lim}`;
  } else if (ehLargar(d)) {
    st = deHoje.length ? '✅ hoje contado' : 'falta o depoimento de hoje';
  } else if (d.meta_diaria) {
    st = soma >= d.meta_diaria ? '✅ meta de hoje batida' : `hoje ${soma}/${d.meta_diaria}${un}`;
  } else {
    st = soma > 0 ? '✅ hoje feito' : 'falta hoje';
  }
  return `${gente} · ${st}`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RANKING E REGRAS
// ═══════════════════════════════════════════════════════════════
function _modal(html) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal sala-modal">${html}
    <div class="modal-actions"><button class="btn-secondary" data-sala-fechar style="width:100%">Fechar</button></div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.querySelector('[data-sala-fechar]').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  return { ov, close };
}

export function abrirRanking(sala, uid) {
  const rank = rankingDoDesafio(sala.d, sala.parts, sala.checks);
  _modal(`
    <div class="modal-title">🏅 Ranking</div>
    <div class="modal-hint">${_esc(sala.d.titulo)}</div>
    <div class="ds-rank sala-rank">
      ${rank.length ? rank.map((r, i) => `
        <div class="ds-rank-row ${r.user_id === uid ? 'me' : ''}">
          <span>${i + 1} · ${_esc(r.nome)}${r.user_id === uid ? ' (você)' : ''}</span>
          <span class="ds-rank-days">${r.done} ${r.done === 1 ? 'dia' : 'dias'}${i === 0 && r.done > 0 ? ' 🔥' : ''}</span>
        </div>`).join('') : '<div class="ds-prova-dica">Ninguém no desafio ainda.</div>'}
    </div>`);
}

export function abrirRegras(d) {
  const ex = Array.isArray(d.exercicios) && d.exercicios.length ? d.exercicios : null;
  const regrasEx = ex ? [
    `Até ${d.max_por_dia || d.meta_diaria || 1} por dia, escolhidos da lista: ${ex.map(_esc).join(', ')}.`,
    ...(d.nao_repetir !== false ? ['Não pode repetir o exercício de ontem.'] : []),
  ] : [];
  if (horaLimite(d)) regrasEx.push(`Prova do dia só até as ${horaLimite(d)}.`);
  const dono = regrasDoDono(d);
  _modal(`
    <div class="modal-title">📜 Regras</div>
    <div class="modal-hint">${_esc(d.titulo)}</div>
    <div class="ds-regras sala-regras">
      ${regrasEx.length ? `<div class="ds-regras-tit">Deste desafio</div><ul>${regrasEx.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
      ${dono.length ? `<div class="ds-regras-tit">Do dono do desafio</div><ul>${dono.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>` : ''}
      <div class="ds-regras-tit">Do Falcon (valem sempre)</div>
      <ul>${REGRAS_FIXAS.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>
    </div>`);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: 📷 PROVA PELA SALA
// ═══════════════════════════════════════════════════════════════
// Abre o próximo modal só depois que o fechar do anterior voltou o histórico;
// senão o "voltar" atrasado fecha o gravador na hora.
function _depoisDoVoltar(fn) {
  let feito = false;
  const ir = () => { if (feito) return; feito = true; window.removeEventListener('popstate', onPop); fn(); };
  const onPop = () => setTimeout(ir, 0);
  window.addEventListener('popstate', onPop);
  setTimeout(ir, 600);
}

// A 📷 do lado da mensagem. Mostra o que dá pra provar hoje nesse desafio e
// grava ao vivo. true = mudou algo (registrou, ou guardou o vídeo da corrida).
export function provaPelaSala(sala, uid) {
  const { d, parts, checks } = sala;
  if (!parts.some(p => p.user_id === uid)) {
    showToast('Entre no desafio pra mandar prova 🦅', 'info');
    return Promise.resolve(false);
  }
  const hoje = _hoje();
  const meus = checks.filter(c => c.user_id === uid);
  const deHoje = meus.filter(c => c.dia === hoje);
  const soma = deHoje.reduce((s, c) => s + (c.quantidade || 0), 0);
  const un = d.unidade || '';
  const ex = Array.isArray(d.exercicios) && d.exercicios.length ? d.exercicios : null;
  const corrida = d.prova === 'strava' || (ex && ex.includes('Corrida'));
  const pend = corrida ? corridaPendente(d.id) : null;

  if (!ehLargar(d) && !soma && passouDoLimite(d)) {
    showToast(`Passou das ${horaLimite(d)}. Amanhã tem de novo 🦅`, 'info');
    return Promise.resolve(false);
  }

  // Opções do dia: { rotulo, extra, motivo? (desabilita) }
  let opcoes = [];
  let comNumero = null;   // { placeholder, rotulo } quando a pessoa digita quanto fez
  let titulo = '📷 Mandar prova';
  let dica = '';

  if (pend) {
    opcoes = [{ rotulo: '📷 Enviar o print da corrida', extra: { quantidade: pend.quantidade || 1, exercicio: pend.exercicio || null } }];
    dica = '🎥 Vídeo da corrida já guardado. Falta só o print do Strava.';
  } else if (ex) {
    const lista = exerciciosDeHoje(d, meus, hoje, diaAnterior(hoje));
    const lim = d.max_por_dia || d.meta_diaria || 1;
    if (lista.filter(x => x.feito).length >= lim) {
      showToast('✅ Exercícios de hoje feitos! Amanhã são outros 🦅', 'info');
      return Promise.resolve(false);
    }
    titulo = '📷 Qual exercício?';
    opcoes = lista.map(x => ({
      rotulo: `${x.feito ? '✅' : x.nome === 'Corrida' ? '🏃' : '🎥'} ${x.nome}`,
      extra: { quantidade: 1, exercicio: x.nome },
      motivo: x.ok ? '' : x.motivo,
    }));
  } else if (ehLargar(d)) {
    if (deHoje.length) {
      showToast('O depoimento de hoje já foi. Amanhã é um novo dia 🦅', 'info');
      return Promise.resolve(false);
    }
    titulo = '🎙️ Como foi hoje?';
    opcoes = [
      { rotulo: '✅ Consegui', extra: { quantidade: 1 } },
      { rotulo: '😔 Não consegui', extra: { falhou: true } },
    ];
    dica = 'Nos dois casos você grava um depoimento. Sem depoimento, o dia não conta.';
  } else if (d.prova === 'strava') {
    if (soma > 0) { showToast('✅ Corrida de hoje já registrada 🦅', 'info'); return Promise.resolve(false); }
    titulo = '🏃 Corrida de hoje';
    comNumero = { placeholder: `${d.meta_diaria || ''} ${un}`.trim(), rotulo: '🎥 Gravar o final da corrida', padrao: d.meta_diaria || 1 };
  } else if (d.meta_diaria) {
    if (soma >= d.meta_diaria) { showToast('✅ Meta de hoje batida! 🦅', 'info'); return Promise.resolve(false); }
    const ops = Array.isArray(d.prova_opcoes) && d.prova_opcoes.length ? d.prova_opcoes : null;
    titulo = `📷 Quanto você fez? (${soma}/${d.meta_diaria}${un ? ' ' + un : ''})`;
    if (ops) opcoes = ops.map(o => ({ rotulo: `+${o}${un ? ' ' + un : ''}`, extra: { quantidade: o } }));
    else comNumero = { placeholder: 'quanto?', rotulo: 'Mandar' };
  } else {
    if (soma > 0) { showToast('✅ Feito hoje! Volte amanhã 🦅', 'info'); return Promise.resolve(false); }
    // Uma opção só: grava direto, sem escolher nada
    return _registrar(d, { quantidade: 1 });
  }

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal sala-modal">
        <div class="modal-title">${_esc(titulo)}</div>
        <div class="modal-hint">${_esc(d.titulo)}</div>
        <div class="sala-opcoes">
          ${opcoes.map((o, i) => `
            <button class="ds-ex ${o.motivo === 'feito hoje' ? 'feito' : ''}" data-op="${i}" ${o.motivo ? 'disabled' : ''}>
              <span>${_esc(o.rotulo)}</span>${o.motivo ? `<small>${_esc(o.motivo)}</small>` : ''}
            </button>`).join('')}
          ${comNumero ? `<div class="ds-inc-row">
              <input class="ds-inc-input" id="sala-qtd" type="number" min="1" inputmode="numeric" placeholder="${_esc(comNumero.placeholder)}" />
              <button class="ds-inc" data-num="1">${_esc(comNumero.rotulo)}</button>
            </div>` : ''}
        </div>
        ${corrida && !pend ? `<div class="ds-corrida">
            <button class="ds-correr" data-correr="1">🏃 Correr com o Falcon</button>
            <button class="ds-passos-btn" data-passos="1">📋 Passo a passo</button>
          </div>` : ''}
        ${dica ? `<div class="ds-prova-dica">${_esc(dica)}</div>` : ''}
        <div class="modal-actions"><button class="btn-secondary" data-sala-fechar style="width:100%">Cancelar</button></div>
      </div>`;
    document.body.appendChild(ov);
    let escolhido = null;
    const close = trapModalBack(() => { ov.remove(); if (!escolhido) resolve(false); });
    const ir = (extra) => {
      escolhido = extra;
      close();
      _depoisDoVoltar(() => _registrar(d, extra).then(resolve));
    };
    ov.querySelector('[data-sala-fechar]').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelectorAll('[data-op]').forEach(b => b.onclick = () => ir(opcoes[+b.dataset.op].extra));
    ov.querySelector('[data-num]')?.addEventListener('click', () => {
      const q = parseInt(ov.querySelector('#sala-qtd')?.value, 10);
      if (comNumero.padrao) return ir({ quantidade: q > 0 ? q : comNumero.padrao });
      if (!q || q <= 0) { showToast('Digite quanto você fez', 'info'); return; }
      ir({ quantidade: q });
    });
    ov.querySelector('[data-correr]')?.addEventListener('click', abrirStrava);
    ov.querySelector('[data-passos]')?.addEventListener('click', () => { close(); _depoisDoVoltar(passoAPassoCorrida); });
  });
}

async function _registrar(d, extra) {
  const ok = await registrarComProva(d, extra);
  // Corrida guarda o vídeo e espera o print: também muda a sala
  return ok || d.prova === 'strava' || extra.exercicio === 'Corrida';
}
