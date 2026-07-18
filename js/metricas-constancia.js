// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — CRITÉRIO ÚNICO DE "DIA ATIVO"
// BLOCO 3 — CÁLCULO DE CONSTÂNCIA (sequência, recorde, taxa)
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Fonte ÚNICA de verdade da constância. Desempenho e o chat do Falcon
// importam daqui — antes cada um tinha sua própria conta e os dois
// discordavam na tela (27 dias no chat vs 40 no Desempenho).
import { dayId } from './banco-dados.js';

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CRITÉRIO ÚNICO DE "DIA ATIVO"
// ═══════════════════════════════════════════════════════════════
// Um dia conta quando o usuário deixou QUALQUER rastro real nele.
// Tarefas entram aqui: elas vivem noutra tabela e eram justamente o
// que o chat não enxergava, encurtando a sequência dele.
// Docs auto-gerados (só id/generated) não contam.
export function isActiveDay(d) {
  if (!d) return false;
  return !!(
    d.hasActivity ||
    (d.hydrationMl || 0) > 0 ||
    d.sleepTime ||
    d.wakeTime ||
    (Array.isArray(d.tasks) && d.tasks.length > 0)
  );
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CÁLCULO DE CONSTÂNCIA
// ═══════════════════════════════════════════════════════════════
// allDays: saída de fetchDaysRange (days + tasks já mesclados).
// streakOriginId: "YYYY-MM-DD" do perfil, ou null pra usar o 1º dia ativo.
export function calcularConstancia(allDays, streakOriginId) {
  const vazio = { current: 0, longest: 0, rate: 0, totalRegistered: 0, totalDays: 0 };
  if (!allDays || !allDays.length) return vazio;

  const activeDays = allDays.filter(isActiveDay);
  const activeSet  = new Set(activeDays.map(d => d.id));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayId = dayId(today);

  // Origem: perfil, ou o primeiro dia ativo do histórico.
  let firstDate;
  if (streakOriginId) {
    const [y, m, d] = streakOriginId.split('-').map(Number);
    firstDate = new Date(y, m - 1, d);
  } else if (activeDays.length) {
    const [y, m, d] = [...activeSet].sort()[0].split('-').map(Number);
    firstDate = new Date(y, m - 1, d);
  } else {
    return vazio;
  }
  firstDate.setHours(0, 0, 0, 0);
  const firstId = dayId(firstDate);

  // Taxa: dias registrados ÷ dias decorridos.
  // O numerador precisa parar em HOJE. O Ritual é um planejador, então há
  // dias futuros já preenchidos; contá-los aqui estourava a conta acima
  // de 100% (o famoso "133% de constância").
  const totalDays = Math.floor((today - firstDate) / 86400000) + 1;
  const totalRegistered = activeDays.filter(d => d.id >= firstId && d.id <= todayId).length;
  const rate = totalDays > 0 ? Math.min(100, Math.round((totalRegistered / totalDays) * 100)) : 0;

  // Sequência atual: retrocede a partir de hoje até achar um buraco.
  let current = 0;
  const cursor = new Date(today);
  while (cursor >= firstDate) {
    if (!activeSet.has(dayId(cursor))) break;
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Recorde: varre todo o histórico até hoje.
  let longest = 0, streak = 0;
  const scan = new Date(firstDate);
  while (scan <= today) {
    if (activeSet.has(dayId(scan))) { streak++; if (streak > longest) longest = streak; }
    else streak = 0;
    scan.setDate(scan.getDate() + 1);
  }

  return { current, longest, rate, totalRegistered, totalDays, firstDate };
}
