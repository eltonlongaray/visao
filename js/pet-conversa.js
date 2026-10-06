// ─── ÍNDICE ──────────────────────────────────────────────────
// Conversa guiada do Pet: entende RESPOSTAS em texto livre dentro de um
// assunto que ele mesmo puxou (ex.: "teu perfil diz 4×, mas vi 1 treino").
// Fora de contexto, "eu só fiz um na terça" não quer dizer nada; dentro da
// conversa sobre treino, quer dizer "faltei". Aqui só INTERPRETA (sem banco,
// sem DOM); quem conduz a conversa e grava é o assistente-ia.js (BLOCO 8.9).
// BLOCO 1 — NORMALIZAÇÃO E NÚMEROS
// BLOCO 2 — "MUDEI O PLANO, FALTEI OU NÃO MARQUEI?"
// BLOCO 3 — MOTIVO DA FALTA
// BLOCO 4 — RESPOSTAS CURTAS (sim/não, número, depois)
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NORMALIZAÇÃO E NÚMEROS
// ═══════════════════════════════════════════════════════════════
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const EXTENSO = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, nenhum: 0, nenhuma: 0, zero: 0 };
const NUM = '(\\d|um|uma|dois|duas|tres|quatro|cinco|seis|sete|nenhum|nenhuma|zero)';
const num = (s) => (s in EXTENSO ? EXTENSO[s] : parseInt(s, 10));

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: "MUDEI O PLANO, FALTEI OU NÃO MARQUEI?"
// ═══════════════════════════════════════════════════════════════
// Devolve { op: 'faltou'|'mudou'|'esqueci'|'parou'|'depois'|null, feitos?, novo? }
//   feitos = quantos treinos a pessoa diz que fez ("só fiz 2")
//   novo   = novo plano por semana ("agora treino 3x")
export function respostaPlano(text) {
  const t = norm(text);
  const out = { op: null };
  const mFeitos = t.match(new RegExp(`\\b(?:fiz|fui|treinei|consegui fazer|consegui ir)\\s+(?:so\\s+)?(?:a\\s+)?${NUM}\\b`)) ||
                  t.match(new RegExp(`\\bso\\s+${NUM}\\s+(?:treinos?|vezes|dias)\\b`));
  if (mFeitos) out.feitos = num(mFeitos[1]);
  // "fiz um na terça e outro na quinta" = 2
  if (out.feitos == null && /\bfiz (um|uma)\b.*\boutr[oa]\b/.test(t)) out.feitos = 2;
  // "hoje ainda estou treinando" / "hoje eu vou" (e não "hoje não vou")
  if (/\bhoje\b(?!.*\bnao\b).*\b(trein\w*|academia|vou)\b/.test(t)) out.hoje = true;

  if (/\b(depois|agora nao|mais tarde|outra hora)\b/.test(t) && t.split(' ').length <= 5) return { op: 'depois' };
  if (/\b(esqueci de marcar|nao marquei|nao to marcando|nao estou marcando|so nao marco|fiz mas nao marquei|treinei mas nao marquei|treinei todos|fiz todos)\b/.test(t)) {
    return { ...out, op: 'esqueci' };
  }
  const mNovo = t.match(new RegExp(`\\b(?:agora|vou|passei a|mudei pra|mudei para|diminui pra|diminui para|baixei pra|baixei para)\\s+(?:treinar\\s+|treino\\s+|so\\s+)?${NUM}\\s*(?:x|vezes|vez|dias)\\b`));
  if (/\b(mudei o plano|mudei meu plano|mudei o treino|diminui o ritmo|diminui|reduzi|baixei)\b/.test(t) || mNovo) {
    return { ...out, op: 'mudou', novo: mNovo ? num(mNovo[1]) : undefined };
  }
  if (/\b(parei|dei uma parada|to parado|estou parado|fiquei parado|nao to treinando|nao estou treinando)\b/.test(t)) {
    return { ...out, op: 'parou' };
  }
  if (/\b(faltei|falhei|nao fui|perdi|so fiz|deixei de ir|nao consegui|furei|matei)\b/.test(t) || out.feitos != null) {
    return { ...out, op: 'faltou' };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: MOTIVO DA FALTA
// ═══════════════════════════════════════════════════════════════
export const MOTIVOS = {
  rotina:     { label: '🔄 Mudança na rotina', nome: 'a rotina' },
  cansaco:    { label: '😴 Cansaço',           nome: 'o cansaço' },
  preguica:   { label: '🛋️ Preguiça mesmo',     nome: 'a preguiça' },
  saude:      { label: '🤕 Dor ou doença',     nome: 'a saúde' },
  imprevisto: { label: '📅 Imprevisto',        nome: 'um imprevisto' },
};

const MOTIVO_RE = [
  ['saude',      /\b(dor|doi|doendo|lesao|lesionei|machuc\w*|torci|doente|gripe|gripado|resfriad\w*|febre|covid|virose|medico|hospital|cirurgia|joelho|ombro|lombar|coluna|costas doendo)\b/],
  ['preguica',   /\b(preguica|preguicoso|desanim\w*|sem vontade|sem animo|enrolei|procrastin\w*|nao quis|nao tava a fim|nao estava a fim|bateu a pregui\w*|moleza)\b/],
  ['cansaco',    /\b(cansad\w*|cansaco|exaust\w*|esgotad\w*|sono|dormi mal|dormi pouco|nao dormi|sem energia|morto|quebrado|estressad\w*|estresse)\b/],
  ['rotina',     /\b(rotina|trabalh\w*|trampo|servico|emprego|horario|faculdade|fiap|aula|prova|estud\w*|viagem|viajei|viajando|mudanca|mudei de|turno|plantao|hora extra|reuniao|filho|filha|bebe)\b/],
  ['imprevisto', /\b(imprevisto|compromisso|aniversario|festa|casamento|velorio|evento|visita|chuva|choveu|carro|transito|academia fechada|feriado)\b/],
];

// Devolve a chave do motivo ou null se não deu pra saber
export function motivoFalta(text) {
  const t = norm(text);
  for (const [k, re] of MOTIVO_RE) if (re.test(t)) return k;
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: RESPOSTAS CURTAS
// ═══════════════════════════════════════════════════════════════
// "pode mudar a academia pra sexta" NÃO é "sim": é um pedido novo começando com "pode"
const VERBO_OK = /^(ser|salvar|confirmar|gravar|seguir|fazer|mandar|ir|deixar|marcar|apagar|continuar|comecar|crer|botar|por|colocar|anotar|agendar|passar)$/;
export function simNao(text) {
  const t = norm(text);
  const pedido = t.match(/^(?:pode|vai|quero|manda)\s+(\w+(?:ar|er|ir))\b/);
  if (pedido && !VERBO_OK.test(pedido[1])) return null;
  if (/^(sim|s|isso|isso mesmo|pode|pode ser|bora|claro|ok|beleza|blz|fechado|quero|manda|com certeza|uhum|aham|vamos|vai)\b/.test(t)) return true;
  if (/^(nao|n|nem|negativo|deixa|deixa quieto|melhor nao|nao precisa|agora nao)\b/.test(t)) return false;
  return null;
}

// "3", "3x", "três vezes", "pode ser 3"
export function numeroPorSemana(text) {
  const t = norm(text);
  const m = t.match(new RegExp(`(?:^|\\s)${NUM}(?:\\s*(?:x|vezes|vez|dias))?(?:\\s|$)`));
  if (!m) return null;
  const n = num(m[1]);
  return n >= 1 && n <= 7 ? n : null;
}

// "manter", "continua 4", "deixa como tá"
export function querManter(text) {
  return /\b(mant\w*|continua\w*|deixa como (ta|esta)|fica (como|assim)|nao muda\w*|foi so essa semana|so essa semana|semana atipica)\b/.test(norm(text));
}
