// ─── ÍNDICE ──────────────────────────────────────────────────
// Check-in do Pet: ele puxa conversa quando os dados não batem com a vida real
// (perfil diz 4 treinos/semana e só tem 1 marcado, ontem ficou coisa sem marcar…).
// Só DECIDE a pergunta (sem banco, sem DOM). Quem busca os dados, mostra a
// bolinha e executa a resposta é o assistente-ia.js (BLOCO 8.8).
// Ele conduz a pessoa por TODOS os assuntos pendentes, um de cada vez (a
// bolinha mostra quantos são). Pra não virar chato:
//  • cada tipo tem sua folga depois de perguntado (treino/peso: 7 dias; ontem/nota: 1);
//  • "Depois" segura aquele tipo (treino/peso: 30 dias; ontem/nota: 1 dia).
// BLOCO 1 — O QUE CONTA COMO TREINO
// BLOCO 2 — REGRAS (uma função por pergunta)
// BLOCO 3 — ESCOLHER A PERGUNTA DO DIA
// ─────────────────────────────────────────────────────────────

const DIA = 86400000;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: O QUE CONTA COMO TREINO (pelo nome da atividade)
// ═══════════════════════════════════════════════════════════════
export const TREINO_RE = /\b(academia|treino|treinar|muscula\w*|malha\w*|gym|crossfit|funcional|karat[eê]|jiu|muay|boxe|luta|corrida|correr|pedal\w*|bike|nata[çc][aã]o|futebol|t[eê]nis|pilates|yoga|ioga|calistenia)\b/i;

function idParaData(id) { const [y, m, d] = String(id).split('-').map(Number); return new Date(y, m - 1, d); }
const diasAtras = (id, agora) => Math.floor((new Date(agora).setHours(0, 0, 0, 0) - idParaData(id).getTime()) / DIA);

// Treinos (tarefas com nome de treino) com quantos dias atrás foram
function treinos(dias, agora) {
  const out = [];
  for (const d of dias || []) for (const t of d.tasks || []) {
    if (t.cancelled || !TREINO_RE.test(t.title || '')) continue;
    out.push({ atras: diasAtras(d.id, agora), feito: !!t.done });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: REGRAS
// ═══════════════════════════════════════════════════════════════
// Cada regra devolve a pergunta ou null. `ctx` = { dias (últimos 60, até hoje), prof, agora, ontemId, hojeId }

// Parou? Tinha treino feito entre 22 e 60 dias atrás e nenhum nos últimos 21.
function regraParou({ dias, agora }) {
  const tr = treinos(dias, agora).filter(x => x.feito);
  if (!tr.length || tr.some(x => x.atras <= 21)) return null;
  return {
    tipo: 'parou',
    conversa: true,   // vira conversa guiada (pergunta o porquê antes de agir)
    texto: 'Faz umas 3 semanas que não vejo treino marcado como feito. Tu deu uma parada ou só não tá marcando?',
    botoes: [
      { label: '⏸️ Parei um tempo', resp: 'parei' },
      { label: '💪 Tô treinando, só não marco', resp: 'nao_marco' },
      { label: '⏰ Depois', resp: 'depois' },
    ],
  };
}

// Ritmo: perfil diz N/semana, mas nas últimas 2 semanas a média ficou 1,5+ abaixo.
// Só pra quem já tem treino na agenda (senão não dá pra saber) e perfil salvo.
function regraRitmo({ dias, prof, agora }) {
  const f = prof?.perfilTreino?.freqSemana;
  if (!f) return null;
  const tr = treinos(dias, agora).filter(x => x.atras >= 1 && x.atras <= 14);
  if (!tr.length) return null;
  const feitos = tr.filter(x => x.feito).length;
  const porSemana = feitos / 2;
  if (f - porSemana < 1.5) return null;
  const novo = Math.max(1, Math.round(porSemana));
  return {
    tipo: 'ritmo',
    conversa: true,   // vira conversa guiada (pergunta o porquê antes de agir)
    dados: { f, feitos },
    texto: `Teu perfil diz <strong>${f}× por semana</strong>, mas nas últimas 2 semanas eu vi <strong>${feitos} treino${feitos === 1 ? '' : 's'}</strong> marcado${feitos === 1 ? '' : 's'} como feito. O que rolou? Tu mudou o plano, faltou alguns dias ou só não marcou?`,
    botoes: [
      { label: `📉 Diminuí (${novo}× por semana)`, resp: 'diminui', valor: novo },
      { label: '✍️ Esqueci de marcar', resp: 'nao_marco' },
      { label: '⏰ Depois', resp: 'depois' },
    ],
  };
}

// Peso: ainda não informado (coach e meta de água dependem dele)
function regraPeso({ prof }) {
  if (prof?.pesoKg) return null;
  return {
    tipo: 'peso',
    texto: 'Pra eu te acompanhar melhor (e calcular tua meta de água): quanto tu tá pesando hoje? É só me falar, tipo <em>"meu peso é 80 kg"</em>.',
    botoes: [{ label: '⏰ Depois', resp: 'depois' }],
  };
}

// Ontem: coisas que ficaram sem marcar (constância da organização)
function regraOntem({ dias, ontemId }) {
  const ontem = (dias || []).find(d => d.id === ontemId);
  const soltas = (ontem?.tasks || []).filter(t => !t.done && !t.cancelled).slice(0, 4);
  if (!soltas.length) return null;
  const limpa = (x) => String(x || '').replace(/[&<>"']/g, '').trim();
  // Descrição junto do nome: duas "Contas a pagar" ficam diferentes ("Contas a pagar · luz")
  const desc = (t) => { const d = limpa(t.desc).replace(/\s+/g, ' '); return d ? (d.length > 40 ? d.slice(0, 39) + '…' : d) : ''; };
  const nome = (t) => limpa(t.title) + (desc(t) ? ` · ${desc(t)}` : '');
  const nomes = soltas.map(t => `<strong>${limpa(t.title)}</strong>${desc(t) ? ` (${desc(t)})` : ''}`).join(', ');
  return {
    tipo: 'ontem',
    texto: `Ontem ${soltas.length === 1 ? 'ficou 1 coisa' : `ficaram ${soltas.length} coisas`} sem marcar: ${nomes}. ${soltas.length === 1 ? 'Tu fez?' : 'Tu fez alguma?'}`,
    botoes: [
      ...soltas.map(t => ({ label: `✅ ${nome(t)}`, resp: 'marcar_ontem', valor: t.id })),
      { label: '🙅 Não fiz', resp: 'nao_fiz' },
    ],
  };
}

// Nota do dia: em branco (ou sem a hora de dormir). Só pra quem usa o dia:
// o dia teve atividade ou já escreveu alguma nota nos últimos 60 dias.
function notaVazia(d) {
  const n = d?.dayNote || {};
  return !(String(n.prideFail || '').trim() || String(n.improve || '').trim() || n.daySleepMinutes || n.nightAwakeMinutes || n.daySleepHours || n.nightAwakeHours);
}
const usaNota = (dias, dia, id) => (dia?.tasks || []).length || (dias || []).some(d => d.id !== id && !notaVazia(d));

function regraNota({ dias, ontemId }) {
  const ontem = (dias || []).find(d => d.id === ontemId);
  if (!usaNota(dias, ontem, ontemId)) return null;
  const semNota = notaVazia(ontem), semSono = !ontem?.sleepTime;
  if (!semNota && !semSono) return null;
  return {
    tipo: 'nota',
    conversa: true,
    dados: { semNota, semSono, diaId: ontemId, hoje: false },
    texto: semNota
      ? `Tua nota de ontem ficou em branco${semSono ? ' (e a hora que tu foi dormir também)' : ''}. Bora preencher comigo? É rapidinho, uma pergunta por vez.`
      : 'Ontem ficou faltando a hora que tu foi dormir. Bora anotar?',
    botoes: [],
  };
}

// Fim do dia (a partir das 21h): o Pet já puxa a nota de HOJE.
// A hora de dormir de hoje ainda não aconteceu, então só pergunta a nota.
export const HORA_NOTA_HOJE = 21;
function regraNotaHoje({ dias, hojeId, agora }) {
  if (!hojeId || new Date(agora).getHours() < HORA_NOTA_HOJE) return null;
  const hoje = (dias || []).find(d => d.id === hojeId);
  if (!usaNota(dias, hoje, hojeId) || !notaVazia(hoje)) return null;
  return {
    tipo: 'nota_hoje',
    conversa: true,
    dados: { semNota: true, semSono: false, diaId: hojeId, hoje: true },
    texto: 'Bora fechar o dia? 🌙 Tua nota de hoje ainda tá em branco. Te faço umas perguntas rápidas, uma por vez.',
    botoes: [],
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ESCOLHER A PERGUNTA DO DIA
// ═══════════════════════════════════════════════════════════════
const ORDEM = [regraParou, regraRitmo, regraOntem, regraNota, regraNotaHoje, regraPeso];
export const FOLGA = { parou: 7, ritmo: 7, peso: 7, ontem: 1, nota: 1, nota_hoje: 0.5 };       // dias depois de perguntar
export const ADIA = { parou: 30, ritmo: 30, peso: 30, ontem: 1, nota: 1, nota_hoje: 0.5 };     // dias depois do "Depois"

// `estado` = { tipos: { [tipo]: { perguntadoEm, adiadoAte } } }
// Devolve a fila de perguntas pendentes, na ordem de prioridade.
export function listarPerguntas(ctx, estado = {}) {
  const agora = ctx.agora, fila = [];
  for (const regra of ORDEM) {
    const p = regra(ctx);
    if (!p) continue;
    if (p.tipo === 'ritmo' && fila.some(x => x.tipo === 'parou')) continue;   // mesmo assunto
    const st = estado.tipos?.[p.tipo] || {};
    if (st.adiadoAte && agora < st.adiadoAte) continue;
    if (st.perguntadoEm && agora - st.perguntadoEm < FOLGA[p.tipo] * DIA) continue;
    fila.push(p);
  }
  return fila;
}
