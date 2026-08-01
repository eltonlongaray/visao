// ═══════════════════════════════════════════════════════════════
// RECORRÊNCIA — motor puro de regras de repetição (sem DB, sem DOM)
// ═══════════════════════════════════════════════════════════════
// Regra (guardada em profile.recurrenceRules):
//   { groupId, title, desc, kind, startTime, categoryId, icon, reminderEnabled,
//     freq: 'weekly'|'monthly', interval: N, weekday: 0-6|null,
//     dayOfMonth: 1-31|null, lastDayOfMonth: bool, lastWeekday: 0-6|null,
//     anchor: 'YYYY-MM-DD' }
//
// Frequência define O ONDE do agendamento:
//   'weekly'  (qualquer intervalo) → gerado SOB DEMANDA ao navegar as semanas.
//   'monthly' (qualquer intervalo, INCL. 1×/mês) → PRÉ-CRIADO com lembrete/alfinete
//     (evento raro/importante: viagem, visita, conta, consulta — não esquecer).
//
// Dia inexistente no mês (ex.: "todo dia 31" em fev) → CAI no último dia (clamp).

// === BLOCO 1: HELPERS DE CALENDÁRIO ===
export function lastDayOfMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
export function clampDay(y, m, d) { return Math.min(d, lastDayOfMonth(y, m)); }

// Última ocorrência de um dia-da-semana no mês (ex.: último domingo)
export function lastWeekdayDate(y, m, wd) {
  const last = lastDayOfMonth(y, m);
  const d = new Date(y, m, last);
  const diff = (d.getDay() - wd + 7) % 7;
  return new Date(y, m, last - diff);
}

function _midnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function _parseAnchor(s) {
  if (s instanceof Date) return _midnight(s);
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

// Data-alvo do mês (y,m) segundo a regra monthly
export function monthlyTargetDate(rule, y, m) {
  if (rule.lastDayOfMonth) return new Date(y, m, lastDayOfMonth(y, m));
  if (rule.lastWeekday != null) return lastWeekdayDate(y, m, rule.lastWeekday);
  return new Date(y, m, clampDay(y, m, rule.dayOfMonth || 1));
}

// === BLOCO 2: A REGRA DISPARA NESSE DIA? ===
export function ruleFiresOn(rule, date) {
  const d = _midnight(date);
  const anchor = _parseAnchor(rule.anchor);
  if (d < anchor) return false;
  const interval = Math.max(1, rule.interval || 1);

  if (rule.freq === 'weekly') {
    const wd = rule.weekday != null ? rule.weekday : anchor.getDay();
    if (d.getDay() !== wd) return false;
    const weeks = Math.round((d - anchor) / (7 * 86400000));
    return weeks >= 0 && weeks % interval === 0;
  }

  if (rule.freq === 'monthly') {
    const mb = _monthsBetween(anchor, d);
    if (mb < 0 || mb % interval !== 0) return false;
    const target = _midnight(monthlyTargetDate(rule, d.getFullYear(), d.getMonth()));
    return d.getTime() === target.getTime();
  }

  return false;
}

// === BLOCO 3: PRÓXIMA OCORRÊNCIA >= from ===
export function nextOccurrence(rule, from) {
  const start = _midnight(from);
  const anchor = _parseAnchor(rule.anchor);
  const interval = Math.max(1, rule.interval || 1);

  if (rule.freq === 'monthly') {
    let y = anchor.getFullYear(), m = anchor.getMonth();
    for (let i = 0; i < 480; i++) {           // teto 40 anos
      const target = _midnight(monthlyTargetDate(rule, y, m));
      if (target >= start && target >= _midnight(anchor)) return target;
      m += interval; while (m > 11) { m -= 12; y++; }
    }
    return null;
  }

  if (rule.freq === 'weekly') {
    let d = new Date(Math.max(start.getTime(), _midnight(anchor).getTime()));
    for (let i = 0; i < 400; i++) {           // teto ~1 ano
      if (ruleFiresOn(rule, d)) return _midnight(d);
      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  return null;
}

// monthly (incl. 1×/mês) é pré-criado + alfinetado; weekly é sob demanda.
export function isPinnedFreq(rule) { return rule?.freq === 'monthly'; }

// === BLOCO 4: LABEL LEGÍVEL (card do pet / histórico) ===
const _DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function ruleLabel(rule) {
  const n = Math.max(1, rule.interval || 1);
  if (rule.freq === 'weekly') {
    const dia = _DOW[rule.weekday != null ? rule.weekday : 0];
    if (n === 1) return `toda semana (${dia})`;
    if (n === 2) return `a cada 2 semanas (${dia})`;
    return `a cada ${n} semanas (${dia})`;
  }
  // monthly
  let quando;
  if (rule.lastDayOfMonth) quando = 'no último dia';
  else if (rule.lastWeekday != null) quando = `no último ${_DOW[rule.lastWeekday]}`;
  else quando = `no dia ${rule.dayOfMonth}`;
  if (n === 1) return `todo mês ${quando}`;
  if (n === 12) return `todo ano ${quando}`;
  return `a cada ${n} meses ${quando}`;
}

// === BLOCO 5: PARSER DE LINGUAGEM NATURAL → fragmento de regra ===
// Retorna { freq, interval, lastDayOfMonth?, lastWeekday? } ou null.
// weekday/dayOfMonth/anchor são preenchidos por quem chama (vêm da DATA do comando).
const _DOW_MAP = {
  'domingo': 0, 'segunda': 1, 'segunda-feira': 1, 'terça': 2, 'terca': 2,
  'terça-feira': 2, 'terca-feira': 2, 'quarta': 3, 'quarta-feira': 3,
  'quinta': 4, 'quinta-feira': 4, 'sexta': 5, 'sexta-feira': 5,
  'sábado': 6, 'sabado': 6,
};
const _NUM_PT = {
  'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'três': 3, 'tres': 3, 'quatro': 4,
  'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10, 'onze': 11, 'doze': 12,
};
function _toN(s) { const n = parseInt(s, 10); return isNaN(n) ? (_NUM_PT[s] || null) : n; }

export function parseRecorrencia(text) {
  const t = String(text || '').toLowerCase();

  // "último dia do mês"
  if (/[úu]ltimo\s+dia\s+d[oe]\s+m[êe]s/.test(t))
    return { freq: 'monthly', interval: 1, lastDayOfMonth: true };

  // "último domingo do mês" (qualquer dia da semana)
  let m = t.match(/[úu]ltim[oa]\s+(domingo|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado)\s+d[oe]\s+m[êe]s/);
  if (m) {
    const wd = _DOW_MAP[m[1]];
    if (wd != null) return { freq: 'monthly', interval: 1, lastWeekday: wd };
  }

  // "a cada N X" / "de N em N X"  (X = semanas | meses | anos)
  m = t.match(/(?:a\s+cada|de)\s+(\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)(?:\s+em\s+(?:\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze))?\s+(semanas?|meses|m[êe]s|anos?)/);
  if (m) {
    const n = _toN(m[1]);
    if (n) {
      if (/semana/.test(m[2])) return { freq: 'weekly', interval: n };
      if (/ano/.test(m[2]))    return { freq: 'monthly', interval: n * 12 };
      return { freq: 'monthly', interval: n };  // meses/mês
    }
  }

  // Termos nomeados
  if (/quinzenal/.test(t))                                              return { freq: 'weekly', interval: 2 };
  if (/semanalmente|semanal|toda\s+semana|todas\s+as\s+semanas/.test(t)) return { freq: 'weekly', interval: 1 };
  if (/bimestral/.test(t))                                              return { freq: 'monthly', interval: 2 };
  if (/trimestral/.test(t))                                             return { freq: 'monthly', interval: 3 };
  if (/semestral/.test(t))                                              return { freq: 'monthly', interval: 6 };
  if (/anualmente|anual|todo\s+ano|todos\s+os\s+anos|uma\s+vez\s+(?:por|no|ao)\s+ano/.test(t)) return { freq: 'monthly', interval: 12 };
  if (/mensalmente|mensal|todo\s+m[êe]s|todos\s+os\s+meses|(?:uma\s+vez|1\s*x|1\s*vez)\s+(?:por|no|ao)\s+m[êe]s/.test(t)) return { freq: 'monthly', interval: 1 };

  return null;
}

// Frase de recorrência pra LIMPAR do nome da tarefa (não vira parte do título).
export const RECUR_STRIP = /\b(?:[úu]ltim[oa]\s+(?:dia|domingo|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado)\s+d[oe]\s+m[êe]s|(?:a\s+cada|de)\s+(?:\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)(?:\s+em\s+(?:\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze))?\s+(?:semanas?|meses|m[êe]s|anos?)|quinzenal(?:mente)?|semanal(?:mente)?|toda\s+semana|todas\s+as\s+semanas|bimestral|trimestral|semestral|anual(?:mente)?|todo\s+ano|mensal(?:mente)?|todo\s+m[êe]s|todos\s+os\s+meses|(?:uma\s+vez|1\s*x|1\s*vez)\s+(?:por|no|ao)\s+(?:m[êe]s|ano))\b/gi;
