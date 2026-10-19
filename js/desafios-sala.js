// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Sala do desafio: a conversa do grupo (tela-chat.js) usa daqui
// o que é de desafio — progresso de hoje, ranking, regras e a 📷 da prova.
// A prova sai pelo mesmo registrarComProva da aba Desafios e do Pet; o banco
// (migration/desafios-sala.sql) posta a mensagem com o vídeo na sala sozinho.
// ⚠️ Mudou algo aqui? Atualizar o Pet junto (pet-desafios.js + BLOCO 8.17 + Worker).
// BLOCO 1 — DADOS DA SALA
// BLOCO 2 — RANKING, REGRAS E RELATÓRIO DO DESAFIO ENCERRADO
// BLOCO 3 — 📷 PROVA PELA SALA
// BLOCO 4 — CONVIDAR (WhatsApp e gente do Falcon)
// BLOCO 5 — ENTRAR PELO LINK DO CONVITE
// ─────────────────────────────────────────────────────────────
import { fetchDesafios, fetchParticipantes, fetchCheckins, fetchPrendas, fetchSaidas, entrarPorCodigo, conviteAberto, MSG_CONVITE_FECHADO } from './desafios.js';
import { aceitarPrendaDoCodigo } from './desafios-prendas.js';
import { exerciciosDeHoje, diaAnterior, ehLargar, horaLimite, passouDoLimite,
         regrasFixasDo, resumoDoDesafio, aindaNaoComecou, textoComeca, feitosHoje, rotuloSerie, corridasDaSemana, semanaSemCorrida, textoSemanaPerdida,
         depoimentoConta, ehAgua, encerrado, fimDoDesafio, salaAte, relatorioDoDesafio, turmaDe, rodadaDe, dataCurta, somarDias, convitesFechados } from './desafios-moldes.js';
import { registrarComProva, abrirStrava, passoAPassoCorrida, corridaPendente, proximoPassoCorrida } from './desafios-prova.js';
import { trapModalBack } from './modal-voltar.js';
import { showToast } from './aviso-tela.js';
import { getProfile } from './banco-dados.js';
import { fetchMembros, enviarPrivado, meuNomeDeChat } from './chat.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: DADOS DA SALA
// ═══════════════════════════════════════════════════════════════
// { d, parts, checks } só desse desafio. null = não achou (saiu, apagado).
export async function carregarSala(id) {
  const [ds, ps, cs] = await Promise.all([fetchDesafios(), fetchParticipantes(id), fetchCheckins(id)]);
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
    if (c.doente) return;   // dia justificado não pontua
    (byUser[c.user_id] ||= {});
    byUser[c.user_id][c.dia] = (byUser[c.user_id][c.dia] || 0) + (c.quantidade || 0);
  });
  const meta = desafio.meta_diaria;
  const largar = desafio.tipo === 'largar';
  return parts.map(p => {
    const days = byUser[p.user_id] || {};
    let done = 0;
    for (const d in days) if (largar || (meta ? days[d] >= meta : days[d] > 0)) done++;
    // Semana sem a corrida pedida = perdeu (vai pro fim da lista)
    const perdeu = semanaSemCorrida(desafio, checks.filter(c => c.user_id === p.user_id), p.joined_at);
    return { user_id: p.user_id, nome: nomeById[p.user_id], done, perdeu };
  }).sort((a, b) => (!!a.perdeu - !!b.perdeu) || b.done - a.done);
}

// Como estou hoje nesse desafio, numa linha (subtítulo da sala)
export function resumoHoje(sala, uid) {
  const { d, parts, checks } = sala;
  const n = parts.length;
  const gente = `${n} ${n === 1 ? 'participante' : 'participantes'}`;
  if (aindaNaoComecou(d)) return `${gente} · 📅 ${textoComeca(d)}`;
  if (encerrado(d)) return `${gente} · 🏁 encerrado ${dataCurta(fimDoDesafio(d)).slice(4)}`;
  if (!parts.some(p => p.user_id === uid)) return gente;
  if (encerrado(d)) {
    showToast(`🏁 Esse desafio acabou em ${dataCurta(fimDoDesafio(d))}. O relatório está no 📊.`, 'info');
    return Promise.resolve(false);
  }
  const hoje = _hoje();
  const meus = checks.filter(c => c.user_id === uid);
  const deHoje = meus.filter(c => c.dia === hoje);
  const soma = deHoje.reduce((s, c) => s + (c.quantidade || 0), 0);
  const un = d.unidade ? ' ' + d.unidade : '';
  let st;
  if (deHoje.some(c => c.doente)) {
    st = '🤒 hoje justificado (doente)';
  } else if (Array.isArray(d.exercicios) && d.exercicios.length && semanaSemCorrida(d, meus, parts.find(p => p.user_id === uid)?.joined_at)) {
    st = '❌ perdeu (semana sem corrida)';
  } else if (Array.isArray(d.exercicios) && d.exercicios.length) {
    const lim = d.max_por_dia || d.meta_diaria || 1;
    const f = feitosHoje(exerciciosDeHoje(d, meus, hoje, diaAnterior(hoje)), lim);
    st = f >= lim ? '✅ hoje feito' : `hoje ${f}/${lim}`;
    const sem = corridasDaSemana(d, meus, hoje);
    if (sem) st += sem.troca ? ` · 🏃 corrida ${sem.falta ? 'ainda dá' : 'feita'}` : ` · 🏃 semana ${sem.feitas}/${sem.meta}`;
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
          <span class="ds-rank-days">${r.perdeu ? '❌ ficou sem corrida' : `${r.done} ${r.done === 1 ? 'dia' : 'dias'}${i === 0 && r.done > 0 ? ' 🔥' : ''}`}</span>
        </div>`).join('') : '<div class="ds-prova-dica">Ninguém no desafio ainda.</div>'}
    </div>`);
}

// ── Relatório do desafio encerrado (todos do grupo veem; Élton, 15/10) ──
// Rodadas do mesmo grupo, da primeira pra última
export function rodadasDaTurma(d, desafios) {
  return (desafios || []).filter(x => turmaDe(x) === turmaDe(d)).sort((a, b) => rodadaDe(a) - rodadaDe(b));
}
const _dm = (iso) => dataCurta(iso).slice(4);   // "12/10"
// Uma linha por pessoa (texto simples com <b>, serve pro modal e pro Pet)
export function linhaDoRelatorio(d, g, uid) {
  if (g.desistiu) {
    return `<b>${_esc(g.nome)}${g.user_id === uid ? ' (você)' : ''}</b>: 🚪 desistiu em ${_dm(g.desistiu)}${g.motivo ? `. Motivo: ${_esc(g.motivo)}` : ''}`
      + (g.total ? ` · tinha cumprido ${g.cumpridos} de ${g.total} dias` : '');
  }
  const tudo = g.total && !g.faltas.length && !g.perdeuCorrida;
  const partes = [`<b>${_esc(g.nome)}${g.user_id === uid ? ' (você)' : ''}</b>: ${g.cumpridos} de ${g.total} dias${tudo ? ' ✅' : ''}`];
  if (g.maiorSeq > 1) partes.push(`🔥 maior sequência: ${g.maiorSeq} dias`);
  if (d.tipo === 'largar') partes.push(`🌱 dias limpos: ${g.limpos}`);
  if (g.justificados?.length) partes.push(`🤒 ${g.justificados.length === 1 ? '1 dia justificado' : `${g.justificados.length} dias justificados`} (doente)`);
  if (g.faltas.length) partes.push(`faltou ${g.faltas.slice(0, 6).map(_dm).join(', ')}${g.faltas.length > 6 ? ` e mais ${g.faltas.length - 6}` : ''}`);
  if (g.perdeuCorrida) partes.push('🏃 ficou sem a corrida da semana');
  if (g.sumiu) partes.push(`👻 sumiu 3 dias (${_dm(g.sumiu)} a ${_dm(somarDias(g.sumiu, 2))})`);
  if (d.prenda && g.paga && g.pagou) partes.push('🎭 prenda paga');
  else if (g.deve) partes.push(`🎭 paga a prenda (${g.falhas} ${g.falhas === 1 ? 'falha' : 'falhas'}, a maior do grupo)`);
  return partes.join(' · ');
}
export function resumoDoRelatorio(d, rel) {
  if (!rel.gente.length) return 'Ninguém participou.';
  if (rel.gente.length === 1 && !rel.gente[0].desistiu) return '';
  if (rel.todosConcluiram) return `🎉 Todo mundo entregou todos os dias${d.prenda ? ', sem prenda pra ninguém' : ''}!`;
  const quem = rel.pagam.length ? ` Paga a prenda quem mais falhou: ${rel.pagam.map(g => _esc(g.nome)).join(', ')} (${rel.maxFalhas} ${rel.maxFalhas === 1 ? 'falha' : 'falhas'}).` : '';
  return `${rel.concluiram} de ${rel.gente.length} concluíram todos os dias.${d.prenda ? (quem || ` Prenda: ${_esc(d.prenda)}.`) : ''}`;
}
export function periodoDoRelatorio(rel) {
  return rel.fim ? `${dataCurta(rel.ini)} a ${dataCurta(rel.fim)} · ${rel.total} dias` : '';
}
// tudo = { parts, checks, prendas, desafios } de todos os desafios (filtra aqui)
export function abrirRelatorio(d, tudo, uid) {
  const de = (id) => ({ parts: (tudo.parts || []).filter(p => p.desafio_id === id), checks: (tudo.checks || []).filter(c => c.desafio_id === id) });
  const { parts, checks } = de(d.id);
  const rel = relatorioDoDesafio(d, parts, checks, tudo.prendas, undefined, tudo.saidas);
  const resumo = resumoDoRelatorio(d, rel);
  const rodadas = rodadasDaTurma(d, tudo.desafios);
  const ate = salaAte(d);
  const hist = rodadas.length > 1 ? `
    <div class="ds-regras-tit" style="margin-top:14px">🔁 Rodadas desse grupo</div>
    ${rodadas.map(r => {
      const x = de(r.id);
      const rr = relatorioDoDesafio(r, x.parts, x.checks, tudo.prendas, undefined, tudo.saidas);
      const st = !encerrado(r) ? 'em andamento' : `${rr.concluiram} de ${rr.gente.length} concluíram`;
      return `<div class="ds-rank-row ${r.id === d.id ? 'me' : ''}"><span>Rodada ${rodadaDe(r)} · ${_esc(r.titulo)}${rr.fim ? ` · ${_dm(rr.ini)} a ${_dm(rr.fim)}` : ''}</span><span class="ds-rank-days">${st}</span></div>`;
    }).join('')}` : '';
  _modal(`
    <div class="modal-title">📊 Relatório do desafio</div>
    <div class="modal-hint">${_esc(d.titulo)}${rodadaDe(d) > 1 ? ` · rodada ${rodadaDe(d)}` : ''}<br>${periodoDoRelatorio(rel)}</div>
    <div class="sala-rank">
      ${encerrado(d) ? '' : '<div class="ds-prova-dica">O desafio ainda está rolando: o relatório vai até hoje.</div>'}
      ${resumo ? `<div class="ds-rel-resumo ${rel.todosConcluiram ? '' : 'neutro'}">${resumo}</div>` : ''}
      ${rel.gente.map(g => `<div class="ds-rel-linha ${g.user_id === uid ? 'me' : ''}">${linhaDoRelatorio(d, g, uid)}</div>`).join('')}
      ${encerrado(d) && ate ? `<div class="ds-prova-dica" style="margin-top:10px">A conversa e os vídeos ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) <= ate ? `ficam até ${dataCurta(ate)}` : 'já saíram do app'}. Esse registro fica.</div>` : ''}
      ${hist}
    </div>`);
}

// Da sala (ou de onde só tem o id): busca tudo e abre o relatório
export async function abrirRelatorioDe(id, uid) {
  const [desafios, parts, checks, prendas, saidas] = await Promise.all([fetchDesafios(), fetchParticipantes(), fetchCheckins(), fetchPrendas(), fetchSaidas()]);
  const d = desafios.find(x => x.id === id);
  if (!d) { showToast('Não achei esse desafio 🤔', 'info'); return; }
  abrirRelatorio(d, { parts, checks, prendas, desafios, saidas }, uid);
}

// Sair do desafio só com motivo (Élton, 15/10). Devolve o motivo ou null.
// Quem sai perde o grupo até o fim e só volta na próxima rodada. Doente não precisa
// sair: o botão 🤒 Fiquei doente justifica o dia (Élton, 18/10).
export const MOTIVOS_SAIDA = ['Fiquei doente', 'Tive um imprevisto', 'Vou viajar', 'Não vou conseguir manter'];
export function pedirMotivoSaida(d) {
  return new Promise(resolve => {
    let feito = false;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    const grupo = d?.modalidade !== 'individual';
    ov.innerHTML = `<div class="modal sala-modal">
      <div class="modal-title">🚪 Sair do desafio?</div>
      <div class="modal-hint">${_esc(d?.titulo || '')}</div>
      <div class="ds-prova-dica">${grupo ? `Ficou doente? Não precisa sair: no desafio tem o botão 🤒 Fiquei doente, que justifica o dia. Se sair, tu perde o acesso ao grupo até o desafio acabar e só volta na próxima rodada. O motivo aparece pro grupo e no relatório.${d?.prenda ? ' Saindo com motivo, tu não paga a prenda.' : ''}` : 'O motivo fica no teu relatório.'}</div>
      <div class="ds-regras-tit" style="margin-top:12px">Por que tu está saindo?</div>
      <div class="ds-ini-chips ds-saida-chips">${MOTIVOS_SAIDA.map(m => `<button class="ds-ini-chip" data-motivo="${_esc(m)}">${_esc(m)}</button>`).join('')}</div>
      <textarea class="ds-saida-txt" maxlength="300" rows="3" placeholder="Escreve o motivo"></textarea>
      <div class="modal-actions">
        <button class="btn-secondary" data-ficar style="flex:1">Ficar</button>
        <button class="btn-danger" data-sair disabled style="flex:1">Sair</button>
      </div></div>`;
    document.body.appendChild(ov);
    const txt = ov.querySelector('.ds-saida-txt');
    const btn = ov.querySelector('[data-sair]');
    const close = trapModalBack(() => { ov.remove(); if (!feito) resolve(null); });
    const conferir = () => { btn.disabled = txt.value.trim().length < 3; };
    txt.addEventListener('input', conferir);
    ov.querySelectorAll('[data-motivo]').forEach(b => b.onclick = () => { txt.value = b.dataset.motivo; conferir(); txt.focus(); });
    ov.querySelector('[data-ficar]').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    btn.onclick = () => { feito = true; resolve(txt.value.trim()); close(); };
  });
}

export function abrirRegras(d) {
  const { info, regras } = resumoDoDesafio(d);
  const ul = (xs) => `<ul>${xs.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>`;
  _modal(`
    <div class="modal-title">📜 Regras</div>
    <div class="modal-hint">${_esc(d.titulo)}</div>
    <div class="ds-regras sala-regras">
      <div class="ds-regras-tit">O desafio</div>
      ${d.descricao ? `<p class="sala-regras-desc">${_esc(d.descricao)}</p>` : ''}
      ${info.length ? `<ul class="sala-regras-info">${info.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>` : ''}
      ${regras.length ? `<div class="ds-regras-tit">Regras do desafio</div>${ul(regras)}` : ''}
      <div class="ds-regras-tit">Do Falcon (valem sempre)</div>
      ${ul(regrasFixasDo(d))}
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
  const passo = pend ? proximoPassoCorrida(d.id) : null;

  // Fiquei doente (Élton, 18/10): dia justificado, nada mais hoje
  if (deHoje.some(c => c.doente)) {
    showToast('🤒 Hoje está justificado. Melhoras! Amanhã, se estiver melhor, volta a gravar 🦅', 'info');
    return Promise.resolve(false);
  }
  // Ainda não mandou nada hoje: dá pra justificar o dia (vale a qualquer hora)
  const podeDoente = !deHoje.length && !aindaNaoComecou(d);
  const OP_DOENTE = { rotulo: '🤒 Fiquei doente', extra: { doente: true }, doente: true };

  // Opções do dia: { rotulo, extra, motivo? (desabilita) }
  let opcoes = [];
  let comNumero = null;   // { placeholder, rotulo } quando a pessoa digita quanto fez
  let titulo = '📷 Mandar prova';
  let dica = '';
  // Uma opção só: grava direto, a não ser que dê pra justificar o dia (aí vira escolha)
  const direto = (extra, rotulo) => {
    if (!podeDoente) return _registrar(d, extra);
    opcoes = [{ rotulo, extra }];
    return null;
  };

  if (!ehLargar(d) && !soma && passouDoLimite(d)) {
    if (!podeDoente) {
      showToast(`Passou das ${horaLimite(d)}. Amanhã tem de novo 🦅`, 'info');
      return Promise.resolve(false);
    }
    titulo = `⏰ Passou das ${horaLimite(d)}`;
    dica = 'A prova de hoje fechou. Se tu está doente, ainda dá pra justificar o dia.';
  } else if (pend) {
    opcoes = [{ rotulo: passo.rotulo, extra: { quantidade: pend.quantidade || 1, exercicio: pend.exercicio || null } }];
    dica = passo.dica;
  } else if (ex && semanaSemCorrida(d, meus, parts.find(p => p.user_id === uid)?.joined_at)) {
    showToast(`❌ Tu perdeu esse desafio: ${textoSemanaPerdida(semanaSemCorrida(d, meus, parts.find(p => p.user_id === uid)?.joined_at))}.`, 'info');
    return Promise.resolve(false);
  } else if (ex) {
    const lista = exerciciosDeHoje(d, meus, hoje, diaAnterior(hoje));
    if (!lista.some(x => x.ok)) {
      showToast(lista.some(x => x.nome === 'Corrida' && x.feito) ? '🏃 Hoje fechou com a corrida! Amanhã tem mais 🦅' : '✅ Exercícios de hoje feitos! Amanhã são outros 🦅', 'info');
      return Promise.resolve(false);
    }
    titulo = '📷 Qual exercício?';
    opcoes = lista.map(x => ({
      rotulo: `${x.feito ? '✅' : x.nome === 'Corrida' ? '🏃' : '🎥'} ${x.ok ? rotuloSerie(x) : x.nome}`,
      extra: { quantidade: 1, exercicio: x.nome, serie: x.serie || null, series: x.series || null },
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
    comNumero = { placeholder: `${d.meta_diaria || ''} ${un}`.trim(), rotulo: '🏃 Registrar a corrida', padrao: d.meta_diaria || 1 };
  } else if (d.meta_diaria) {
    if (soma >= d.meta_diaria) { showToast('✅ Meta de hoje batida! 🦅', 'info'); return Promise.resolve(false); }
    const ops = Array.isArray(d.prova_opcoes) && d.prova_opcoes.length ? d.prova_opcoes : null;
    titulo = `📷 Quanto você fez? (${soma}/${d.meta_diaria}${un ? ' ' + un : ''})`;
    // Água e depoimento (Leitura, Meditação): cada vídeo, a pessoa diz quanto foi nele e o app soma
    if (ehAgua(d)) {
      titulo = `💧 Água de hoje (${soma}/${d.meta_diaria} ml)`;
      comNumero = { placeholder: 'ml nesse vídeo', rotulo: '🎥 Gravar' };
      dica = 'Copo, garrafa, o que for: digite quantos ml vai beber nesse vídeo. O app soma até fechar a meta.';
    } else if (depoimentoConta(d) && un === 'páginas') {
      // Leitura: diz quantas páginas leu nesse vídeo e o app soma
      titulo = `🎙️ Depoimento de hoje (${soma}/${d.meta_diaria} páginas)`;
      comNumero = { placeholder: 'páginas hoje', rotulo: '🎙️ Gravar' };
    } else if (depoimentoConta(d)) {
      // Depoimento (reflexão): sem número, o vídeo fecha o dia (Élton, 15/10)
      const r = direto({ quantidade: Math.max(1, d.meta_diaria - soma) }, '🎙️ Gravar o depoimento');
      if (r) return r;
      titulo = '🎙️ Depoimento de hoje';
    } else if (ops) opcoes = ops.map(o => ({ rotulo: `+${o}${un ? ' ' + un : ''}`, extra: { quantidade: o } }));
    else comNumero = { placeholder: 'quanto?', rotulo: 'Mandar' };
  } else {
    if (soma > 0) { showToast('✅ Feito hoje! Volte amanhã 🦅', 'info'); return Promise.resolve(false); }
    // Uma opção só: grava direto, sem escolher nada
    const r = direto({ quantidade: 1 }, d.prova === 'video' ? '🎥 Gravar a prova' : '✅ Marcar feito hoje');
    if (r) return r;
  }
  if (podeDoente) opcoes.push(OP_DOENTE);

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal sala-modal">
        <div class="modal-title">${_esc(titulo)}</div>
        <div class="modal-hint">${_esc(d.titulo)}</div>
        <div class="sala-opcoes">
          ${opcoes.map((o, i) => o.doente ? '' : `
            <button class="ds-ex ${o.motivo === 'feito hoje' ? 'feito' : ''}" data-op="${i}" ${o.motivo ? 'disabled' : ''}>
              <span>${_esc(o.rotulo)}</span>${o.motivo ? `<small>${_esc(o.motivo)}</small>` : ''}
            </button>`).join('')}
          ${comNumero ? `<div class="ds-inc-row">
              <input class="ds-inc-input" id="sala-qtd" type="number" min="1" inputmode="numeric" placeholder="${_esc(comNumero.placeholder)}" />
              <button class="ds-inc" data-num="1">${_esc(comNumero.rotulo)}</button>
            </div>` : ''}
          ${opcoes.map((o, i) => o.doente ? `<button class="ds-ex ds-doente-op" data-op="${i}"><span>${_esc(o.rotulo)}</span></button>` : '').join('')}
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

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: CONVIDAR (WhatsApp e gente do Falcon)
// ═══════════════════════════════════════════════════════════════
export const LINK_APP = 'https://estilo-falcon.web.app';

// Link que já leva pro grupo: ?convite=CODIGO (o app guarda e resolve depois do login)
export const linkConvite = (d) => `${LINK_APP}/?convite=${encodeURIComponent(d.codigo)}`;

// WhatsApp: "fui desafiado" + o desafio, as regras, o passo a passo e o link.
// Privado do app: curto, com o código (a pessoa já está no app).
// (WhatsApp: *negrito*)
export function textoConvite(d, { noApp = false } = {}) {
  // Nova rodada com o mesmo grupo: convite de "bora de novo"
  if (noApp && rodadaDe(d) > 1) return `🔁 Rodada ${rodadaDe(d)} do desafio "${d.titulo}"${d.data_inicio ? `, começa ${dataCurta(String(d.data_inicio).slice(0, 10))}` : ''}! Bora de novo? 🦅\nVai em Desafios → 🔑 Entrar com código, ou fala pro Pet: "entra com o código ${d.codigo}".\nCódigo: ${d.codigo}`;
  if (noApp) return `🏆 Bora encarar o desafio "${d.titulo}" comigo no Falcon? 🦅\nVai em Desafios → 🔑 Entrar com código, ou fala pro Pet: "entra com o código ${d.codigo}".\nCódigo: ${d.codigo}`;
  const link = linkConvite(d);
  const { info, regras } = resumoDoDesafio(d);
  return [
    '⚠️ *ATENÇÃO: VOCÊ FOI DESAFIADO!* 🦅',
    'Tu tem coragem pra topar esse desafio?',
    '',
    `🏆 *${d.titulo}*`,
    ...(d.descricao ? [d.descricao] : []),
    ...(info.length ? ['', ...info] : []),
    ...(regras.length ? ['', '📜 *Regras*', ...regras.map(r => `• ${r}`)] : []),
    '',
    '👣 *Passo a passo*',
    '1. Toca no link lá embaixo',
    '2. Baixa o Falcon (ou faz login, se já tiver conta)',
    '3. Faz o tutorial rapidinho e diz pro Pet como quer ser chamado e teu WhatsApp',
    '4. Pronto: tu cai direto no grupo do desafio',
    '5. Todo dia manda a prova no grupo, no 📷 do lado da mensagem',
    '',
    '🔒 Entrar é de graça. O Falcon nunca pede dinheiro, Pix nem código do WhatsApp, e o link é sempre estilo-falcon.web.app',
    '',
    `✅ *ACEITO O DESAFIO* 👉 ${link}`,
  ].join('\n');
}

export function convidarNoWhatsApp(d) {
  window.open(`https://wa.me/?text=${encodeURIComponent(textoConvite(d))}`, '_blank');
}

// Manda o convite no privado do app pra cada pessoa. Devolve quantos foram.
export async function convidarNoApp(d, ids) {
  const nome = await meuNomeDeChat();
  let n = 0;
  for (const id of ids) { await enviarPrivado(id, textoConvite(d, { noApp: true }), nome); n++; }
  return n;
}

// Folha "📨 Convidar": WhatsApp (escolhe o contato lá) ou pessoas do Falcon
// (quem já está no desafio não aparece). parts = participantes desse desafio.
export async function abrirConvidar(d, parts = [], meuId = null) {
  if (!d?.codigo) { showToast('Esse desafio não tem código de convite.', 'info'); return; }
  if (convitesFechados(d)) { showToast('🔒 Convites fechados: o desafio já começou.', 'info'); return; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal sala-modal ds-conv-modal">
      <div class="modal-title">📨 Convidar participantes</div>
      <div class="modal-hint">${_esc(d.titulo)}</div>
      <div class="ds-codigo-grande">${_esc(d.codigo)}</div>
      <button class="btn-primary ds-conv-wpp" data-conv-wpp style="width:100%">💬 Mandar no WhatsApp</button>
      <button class="btn-secondary" data-conv-copiar style="width:100%;margin-top:8px">Copiar código</button>
      <div class="ds-regras-tit" style="margin-top:16px">Pessoas do Falcon</div>
      <input class="chat-busca ds-conv-busca" data-conv-busca placeholder="Buscar pessoa…" autocomplete="off" />
      <div class="ds-conv-lista" data-conv-lista><div class="ds-prova-dica">Carregando…</div></div>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        <button class="btn-primary" data-conv-enviar style="width:100%" disabled>Mandar convite</button>
        <button class="btn-secondary" data-sala-fechar style="width:100%">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.querySelector('[data-sala-fechar]').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-conv-wpp]').onclick = () => convidarNoWhatsApp(d);
  ov.querySelector('[data-conv-copiar]').onclick = async () => {
    try { await navigator.clipboard.writeText(d.codigo); showToast('🔑 Código copiado!', 'success'); }
    catch { showToast(`Código: ${d.codigo}`, 'info'); }
  };

  const marcados = new Set();
  const btnEnviar = ov.querySelector('[data-conv-enviar]');
  const pintarBotao = () => {
    btnEnviar.disabled = !marcados.size;
    btnEnviar.textContent = marcados.size ? `Mandar convite (${marcados.size})` : 'Mandar convite';
  };
  const lista = ov.querySelector('[data-conv-lista]');
  let membros = [];
  try { membros = await fetchMembros(); }
  catch { lista.innerHTML = '<div class="ds-prova-dica">Não consegui carregar as pessoas agora.</div>'; return; }
  const dentro = new Set(parts.map(p => p.user_id));
  const fora = membros.filter(m => m.user_id !== meuId && !dentro.has(m.user_id));
  lista.innerHTML = fora.length ? fora.map(m => `
    <label class="ds-conv-item" data-nome="${_esc((m.nome || '').toLowerCase())}">
      <input type="checkbox" value="${_esc(m.user_id)}" />
      <span>${_esc(m.nome || 'Falcão')}</span>
    </label>`).join('') : '<div class="ds-prova-dica">Todo mundo do app já está nesse desafio 🦅</div>';
  lista.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    if (cb.checked) marcados.add(cb.value); else marcados.delete(cb.value);
    pintarBotao();
  });
  const busca = ov.querySelector('[data-conv-busca]');
  busca.addEventListener('input', () => {
    const q = busca.value.trim().toLowerCase();
    lista.querySelectorAll('.ds-conv-item').forEach(el => { el.style.display = el.dataset.nome.includes(q) ? '' : 'none'; });
  });
  btnEnviar.onclick = async () => {
    btnEnviar.disabled = true; btnEnviar.textContent = 'Mandando…';
    try {
      const n = await convidarNoApp(d, [...marcados]);
      showToast(`📨 Convite mandado pra ${n} ${n === 1 ? 'pessoa' : 'pessoas'} no privado`, 'success');
      close();
    } catch (e) { showToast(e.message || 'Não deu pra mandar', 'error'); pintarBotao(); }
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: ENTRAR PELO LINK DO CONVITE
// ═══════════════════════════════════════════════════════════════
const CHAVE_CONVITE = 'falcon_convite';

// Roda no carregamento do app: tira o ?convite= da barra e guarda até o login
// (quem é novo passa pelo cadastro e pela configuração antes de chegar na Home).
export function guardarConviteDoLink() {
  try {
    const q = new URLSearchParams(location.search);
    const cod = (q.get('convite') || '').trim().toUpperCase();
    if (!cod) return;
    localStorage.setItem(CHAVE_CONVITE, cod);
    q.delete('convite');
    const resto = q.toString();
    history.replaceState(history.state, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
  } catch { /* sem storage: segue pelo código */ }
}

export function temConvitePendente() {
  try { return !!localStorage.getItem(CHAVE_CONVITE); } catch { return false; }
}

// Na Home, logado. Já tem nome no perfil: entra e abre o grupo direto.
// Conta nova (sem nome): o Pet abre e pede nome e WhatsApp antes
// (assistente-ia.js BLOCO 8.17, evento 'falcon:convite-boas-vindas'), e no fim
// chama entrarNoConvite. Assim ninguém aparece no grupo como "Falcão".
export async function entrarPeloConvite() {
  let cod = null;
  try { cod = localStorage.getItem(CHAVE_CONVITE); localStorage.removeItem(CHAVE_CONVITE); } catch { /* sem storage */ }
  if (!cod) return false;
  let p = null;
  try { p = await getProfile(); } catch { /* segue sem perfil */ }
  if (!(p?.preferredName || p?.fullName || '').trim()) {
    // Conta nova nunca está dentro: desafio já começado acaba aqui
    if (!(await conviteAberto(cod))) { showToast(MSG_CONVITE_FECHADO, 'info'); return true; }
    window.dispatchEvent(new CustomEvent('falcon:convite-boas-vindas', { detail: { codigo: cod } }));
    return true;
  }
  await entrarNoConvite(cod);
  return true;
}

// Entra no desafio do código e abre a sala do grupo. true = deu certo.
export async function entrarNoConvite(cod) {
  try {
    // Já começou: o banco só deixa passar quem já está dentro (abriu o link de novo)
    const aberto = await conviteAberto(cod);
    if (aberto && !(await aceitarPrendaDoCodigo(cod))) { showToast('Tudo bem, o convite fica pra depois 🦅', 'info'); return false; }
    const id = await entrarPorCodigo(cod, await meuNomeDeChat());
    const d = (await fetchDesafios()).find(x => x.id === id);
    const detalhe = { id, titulo: d?.titulo || 'Desafio', tipo: d?.tipo };
    if (aberto) showToast('🦅 Você entrou no desafio!', 'success');
    if (document.getElementById('chat-corpo')) { window.dispatchEvent(new CustomEvent('falcon:sala-desafio', { detail: detalhe })); return true; }
    try { sessionStorage.setItem('falcon_sala_pendente', JSON.stringify(detalhe)); } catch { /* sem storage */ }
    location.hash = '#/desafios';
    return true;
  } catch (e) {
    showToast(e.message || 'Não deu pra entrar no desafio', 'error');
    return false;
  }
}
