// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — APURAÇÃO — o que o usuário fez em cada desafio
// BLOCO 3 — RENDER — card de desafios na tela de Desempenho
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Card de desafios dentro do Desempenho: onde o usuário está no ranking dos
// que participa e quais já concluiu.
//
// VISIBILIDADE: mostra a POSIÇÃO dele e o total de participantes — nunca o
// nome ou o desempenho dos outros. É a regra que combinamos para os desafios
// ("celebra em público, cobra em particular") e ela vale aqui também.
import { fetchDesafios, fetchParticipantes, fetchCheckins } from './desafios.js';
import { emojiDoTipo } from './desafios-moldes.js';
import { auth } from './autenticacao.js';

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: APURAÇÃO
// ═══════════════════════════════════════════════════════════════
// Um dia conta quando bateu a meta diária (ou teve qualquer check-in, se o
// desafio não define meta). Mesmo critério do ranking da aba Desafios — se os
// dois divergissem, o usuário veria posições diferentes nas duas telas.
function diasCumpridos(checks, meta) {
  const porDia = {};
  for (const c of checks) porDia[c.dia] = (porDia[c.dia] || 0) + (c.quantidade || 0);
  let n = 0;
  for (const dia in porDia) if (meta ? porDia[dia] >= meta : porDia[dia] > 0) n++;
  return n;
}

export function apurarDesafios(desafios, participantes, checkins, meuId) {
  if (!meuId) return { emAndamento: [], concluidos: [], resumo: null };

  const meus = desafios.filter(d => participantes.some(p => p.desafio_id === d.id && p.user_id === meuId));
  const emAndamento = [], concluidos = [];

  for (const d of meus) {
    const parts  = participantes.filter(p => p.desafio_id === d.id);
    const checks = checkins.filter(c => c.desafio_id === d.id);
    const meta   = d.meta_diaria;

    // Ranking: posição do usuário sem expor quem são os outros.
    const placar = parts
      .map(p => ({ id: p.user_id, dias: diasCumpridos(checks.filter(c => c.user_id === p.user_id), meta) }))
      .sort((a, b) => b.dias - a.dias);
    const posicao = placar.findIndex(x => x.id === meuId) + 1;

    const meusDias = placar.find(x => x.id === meuId)?.dias || 0;
    const total    = d.dias_total || 0;
    const pct      = total ? Math.min(100, Math.round((meusDias / total) * 100)) : 0;

    const item = {
      id: d.id, titulo: d.titulo || 'Desafio', emoji: emojiDoTipo?.(d.tipo) || '🏆',
      dias: meusDias, total, pct, posicao, participantes: parts.length,
      modalidade: d.modalidade, prenda: d.prenda || '',
    };

    if (total && meusDias >= total) concluidos.push(item);
    else emAndamento.push(item);
  }

  emAndamento.sort((a, b) => b.pct - a.pct);
  concluidos.sort((a, b) => a.posicao - b.posicao);

  const vitorias = concluidos.filter(c => c.posicao === 1).length;
  return {
    emAndamento, concluidos,
    resumo: { participando: emAndamento.length, concluidos: concluidos.length, vitorias },
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: RENDER
// ═══════════════════════════════════════════════════════════════
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const medalha = (p) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : '');

function linhaAndamento(d) {
  const pos = d.participantes > 1
    ? `<span class="dd-pos">${medalha(d.posicao)}${d.posicao}º de ${d.participantes}</span>` : '';
  return `
    <div class="dd-item">
      <div class="dd-topo">
        <span class="dd-nome">${d.emoji} ${esc(d.titulo)}</span>
        ${pos}
      </div>
      <div class="dd-barra"><span style="width:${d.pct}%"></span></div>
      <div class="dd-sub">${d.dias}${d.total ? ' de ' + d.total : ''} dias · ${d.pct}%</div>
    </div>`;
}

function linhaConcluido(d) {
  const pos = d.participantes > 1
    ? `${medalha(d.posicao)} ${d.posicao}º de ${d.participantes}` : 'concluído';
  return `
    <div class="dd-item dd-feito">
      <div class="dd-topo">
        <span class="dd-nome">${d.emoji} ${esc(d.titulo)}</span>
        <span class="dd-pos dd-pos-ok">${pos}</span>
      </div>
      <div class="dd-sub">✅ ${d.total} de ${d.total} dias</div>
    </div>`;
}

// Injeta o card em `container`. Roda depois da tela pintar — desafio é
// informação extra e não pode segurar o Desempenho.
export async function renderDesafiosDoDesempenho(container) {
  if (!container) return;
  const meuId = auth.currentUser?.uid;
  if (!meuId) return;

  let dados;
  try {
    const [desafios, parts, checks] = await Promise.all([
      fetchDesafios(), fetchParticipantes(), fetchCheckins(),
    ]);
    dados = apurarDesafios(desafios, parts, checks, meuId);
  } catch (e) {
    console.warn('[Falcon] desafios no Desempenho:', e);
    return;   // silencioso: é um bloco a mais, não pode quebrar a tela
  }

  const { emAndamento, concluidos, resumo } = dados;
  if (!emAndamento.length && !concluidos.length) {
    container.innerHTML = `
      <div class="dd-card">
        <div class="dd-title">🏆 Seus desafios</div>
        <div class="dd-vazio">Você ainda não entrou em nenhum desafio.<br>
          Os que você encarar aparecem aqui com sua posição.</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="dd-card">
      <div class="dd-title">🏆 Seus desafios</div>
      <div class="dd-resumo">
        <div class="dd-r"><b>${resumo.participando}</b><span>em andamento</span></div>
        <div class="dd-r"><b>${resumo.concluidos}</b><span>concluídos</span></div>
        <div class="dd-r"><b>${resumo.vitorias}</b><span>em 1º lugar</span></div>
      </div>
      ${emAndamento.length ? `<div class="dd-sec">Em andamento</div>${emAndamento.map(linhaAndamento).join('')}` : ''}
      ${concluidos.length ? `<div class="dd-sec">Concluídos</div>${concluidos.map(linhaConcluido).join('')}` : ''}
    </div>`;
}
