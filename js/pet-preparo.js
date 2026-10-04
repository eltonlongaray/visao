// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Preparo Físico: entende frases sobre o perfil de treino e o corpo.
// Só INTERPRETA (sem banco, sem DOM): devolve o que mudar e um resumo pro card.
// Quem grava é o assistente-ia.js, sempre depois do card de confirmação.
// Medidas (cintura, braço...) + 6 fotos NÃO entram: são um bloco mensal travado
// na tela da Composição; o Pet só leva até lá.
// BLOCO 1 — NÚMEROS
// BLOCO 2 — PERFIL DE TREINO (objetivo, força, frequência, tempo, pausa)
// BLOCO 3 — CORPO (peso, altura, sexo)
// BLOCO 4 — JUNTA TUDO
// ─────────────────────────────────────────────────────────────

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NÚMEROS ("três", "3", "3x")
// ═══════════════════════════════════════════════════════════════
const EXTENSO = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const NUM = '(\\d+(?:\\.\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
function num(s) { return s in EXTENSO ? EXTENSO[s] : parseFloat(s); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PERFIL DE TREINO
// ═══════════════════════════════════════════════════════════════
export const OBJETIVO_ROTULO = { aurea: '🏛️ Proporção Áurea', volume: '💪 Máximo volume', saude: '❤️ Só saúde' };
const TEMPO_ROTULO = { novo: 'comecei agora', menos1: 'menos de 1 ano', '1a3': '1 a 3 anos', mais3: '3+ anos' };
const PAUSA_ROTULO = { nao: 'não parei', menos1m: 'menos de 1 mês', '1a3m': '1 a 3 meses',
  '3a6m': '3 a 6 meses', '6a12m': '6 meses a 1 ano', mais1a: 'mais de 1 ano' };

// Nome falado → chaves do perfil-treino-ui.js (MUSCULOS)
const MUSCULO_FALA = [
  [/\bpeito(ral)?\b/, ['peito'], 'Peito'],
  [/\bcostas?\b|\bdorsal\b/, ['costas'], 'Costas'],
  [/\bombros?\b/, ['ombros'], 'Ombros'],
  [/\btrapezio\b/, ['trapezio'], 'Trapézio'],
  [/\bbiceps\b/, ['biceps'], 'Bíceps'],
  [/\btriceps\b/, ['triceps'], 'Tríceps'],
  [/\bbracos?\b/, ['biceps', 'triceps'], 'Braço (bíceps e tríceps)'],
  [/\babd(omen|ominal|ominais)?\b|\bcore\b/, ['abdomen'], 'Abdômen'],
  [/\bgluteos?\b|\bbunda\b/, ['gluteo'], 'Glúteo'],
  [/\bquadriceps\b/, ['quadriceps'], 'Quadríceps'],
  [/\bposterior(es)?\b/, ['posterior'], 'Posterior da coxa'],
  [/\bpanturrilhas?\b/, ['panturrilha'], 'Panturrilha'],
  [/\bpernas?\b|\binferiores?\b/, ['gluteo', 'quadriceps', 'posterior', 'panturrilha'], 'Pernas'],
  [/\bsuperiores?\b/, ['peito', 'costas', 'ombros', 'trapezio', 'biceps', 'triceps'], 'Superiores'],
  [/\b(todos os|cada) musculos?\b|\bcorpo todo\b/, ['peito', 'costas', 'ombros', 'trapezio', 'biceps', 'triceps',
    'abdomen', 'gluteo', 'quadriceps', 'posterior', 'panturrilha'], 'Todos os músculos'],
];

function objetivo(t) {
  const fala = /\bobjetivo\b|\bfoco\b|\bquero (ficar|ter|ganhar|so|focar)\b|\bmeu negocio\b/.test(t);
  if (!fala) return null;
  if (/\b(aurea|estetic|atletic|estatua|tenista|jogador de tenis|shape|definid|proporc)/.test(t)) return 'aurea';
  if (/\b(volume|ficar grande|ficar enorme|crescer|massa muscular|hipertrofia|maximo)\b/.test(t)) return 'volume';
  if (/\b(saude|bem estar|qualidade de vida)\b/.test(t)) return 'saude';
  return null;
}

function forca(t) {
  if (/\b(nao quero|sem|tira|tirar|desliga|desmarca)\b[\w ]{0,20}\bforca\b/.test(t)) return false;
  if (/\b(quero|ganhar|mais|liga|marca|ativa)\b[\w ]{0,20}\bforca\b|\+ ?forca/.test(t)) return true;
  return null;
}

// "treino 5 vezes por semana" / "vou na academia 4 dias na semana"
const POR_SEMANA = new RegExp(`\\b${NUM}\\s*(?:x|vezes|vez|dias?)\\s*(?:por|na|a|numa|em uma|toda)\\s*semana\\b`);
const N_VEZES = new RegExp(`\\b${NUM}\\s*(?:x|vezes|vez|dias?)\\b`);
// "muda o peito pra 3" / "os treinos pra 4" (não pega "pra 80 kg", "pra 6 meses")
const PRA_N = new RegExp(`\\b(?:pra|para|por|em)\\s+${NUM}\\b(?!\\s*(?:kg|quilos?|kilos?|anos?|mes|meses|semanas|cm|m\\b|metros?|\\.\\d))`);

function numeroFreq(p) {
  const m = p.match(N_VEZES) || p.match(PRA_N);
  return m ? Math.round(num(m[1])) : null;
}

// Fala em pedaços ("peito pra 3, costas pra 1 e pernas 2x por semana"): cada
// pedaço com músculo leva o seu número; músculo sem número ("bíceps e tríceps
// 2x") pega o número do pedaço seguinte.
function frequencias(partes) {
  const por = {}, rotulos = [];
  let pendentes = [], semana = null;
  for (const p of partes) {
    const muscs = MUSCULO_FALA.filter(([re]) => re.test(p));
    const n = numeroFreq(p);
    if (muscs.length) {
      if (n == null) { pendentes.push(...muscs); continue; }
      const v = Math.max(0, Math.min(3, n));
      for (const [, ks, rot] of [...pendentes, ...muscs]) { for (const k of ks) por[k] = v; rotulos.push(`${rot} ${v}×`); }
      pendentes = [];
    } else if (n != null && n >= 1 && n <= 7 &&
               (POR_SEMANA.test(p) || /\b(treinos?|treino|frequencia|vezes|dias de treino|academia)\b/.test(p))) {
      semana = n;
    }
  }
  const out = {};
  if (semana) out.freqSemana = semana;
  if (rotulos.length) { out.freqPorMusculo = por; out.musculosRotulo = rotulos; }
  return out;
}

function mesesDe(qtd, unidade) {
  return /^ano/.test(unidade) ? qtd * 12 : /^semana/.test(unidade) ? qtd / 4 : /^dia/.test(unidade) ? qtd / 30 : qtd;
}
const DURACAO = `${NUM}\\s*(anos?|mes(?:es)?|semanas?|dias?)`;

function tempoTreino(t) {
  if (/\b(comecei|to comecando|estou comecando|iniciante) (agora|a treinar|ontem|essa semana|semana passada)?\b/.test(t) &&
      !new RegExp(DURACAO).test(t) && !/\bparad|\bparei\b/.test(t)) return 'novo';
  const m = t.match(new RegExp(`\\b(?:tempo de treino|experiencia)\\b[\\w. ]{0,20}?${DURACAO}`)) ||
            t.match(new RegExp(`\\b(?:treino|treinando|malho|malhando|na academia)\\b[\\w. ]{0,30}?\\b(?:ha|faz|tem)\\s+(?:uns |umas |mais de |quase )?${DURACAO}`)) ||
            t.match(new RegExp(`\\b(?:ha|faz)\\s+(?:uns |umas |mais de |quase )?${DURACAO}\\s+que\\s+(?:eu\\s+)?(?:treino|malho)`));
  if (!m) return null;
  const meses = mesesDe(num(m[1]), m[2]);
  if (meses < 1) return 'novo';
  if (meses < 12) return 'menos1';
  if (meses <= 36) return '1a3';
  return 'mais3';
}

function pausa(t) {
  if (/\bnao (parei|fiquei parad|tive pausa)|\bnunca parei\b|\bsem parar\b/.test(t)) return 'nao';
  const m = t.match(new RegExp(`\\b(?:parei|parad[oa]|sem treinar|pausa)\\b[\\w ]{0,12}?(?:por |uns |umas |de |mais de |quase )*${DURACAO}`)) ||
            t.match(new RegExp(`\\b${DURACAO}\\s+(?:parad[oa]|sem treinar|de pausa)`));
  if (!m) return null;
  const meses = mesesDe(num(m[1]), m[2]);
  if (meses < 1) return 'menos1m';
  if (meses <= 3) return '1a3m';
  if (meses <= 6) return '3a6m';
  if (meses <= 12) return '6a12m';
  return 'mais1a';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CORPO
// ═══════════════════════════════════════════════════════════════
function peso(t) {
  const m = t.match(new RegExp(`\\b(?:peso|pesando|pesei|estou com|to com|tô com)\\s+(?:e |eh |ta |esta |de |atual |hoje |agora |pra |para |em )*(\\d{2,3}(?:\\.\\d)?)\\s*(?:kg|quilos?|kilos?)?\\b`)) ||
            t.match(/\b(\d{2,3}(?:\.\d)?)\s*(?:kg|quilos?|kilos?)\b(?!\s*d[eao]s?\b)/);
  if (!m) return null;
  const kg = parseFloat(m[1]);
  return kg >= 25 && kg <= 350 ? kg : null;
}

function altura(t) {
  // "1,78", "1.78 m", "178 cm", "um e setenta e oito" fica de fora
  const m = t.match(/\b(?:altura|meco|tenho|alto|alta)\b[\w ]{0,10}?\b([12]\.\d{1,2})\s*(?:m|metros?)?\b/) ||
            t.match(/\b([12]\.\d{2})\s*(?:m|metros?)\b/) ||
            t.match(/\b(?:altura|meco|tenho)\b[\w ]{0,10}?\b(1\d{2}|2[0-3]\d)\s*(?:cm|centimetros?)\b/) ||
            t.match(/\b(1\d{2}|2[0-3]\d)\s*(?:cm|centimetros?)\s*de altura\b/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const cm = v < 3 ? Math.round(v * 100) : Math.round(v);
  return cm >= 100 && cm <= 230 ? cm : null;
}

function sexo(t) {
  if (/\b(sou|sexo)\s+(?:e\s+)?(homem|masculino)\b/.test(t)) return 'M';
  if (/\b(sou|sexo)\s+(?:e\s+)?(mulher|feminino)\b/.test(t)) return 'F';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: JUNTA TUDO
// ═══════════════════════════════════════════════════════════════
// Devolve { treino:{...}, corpo:{...}, linhas:[...] } ou null se não achou nada.
// `linhas` = resumo legível pro card ("Treinos por semana: 5×").
export function interpretarPreparo(text) {
  const t = norm(text);
  const treino = {}, corpo = {}, linhas = [];

  const obj = objetivo(t);
  if (obj) { treino.objetivo = obj; linhas.push(`Objetivo: <b>${OBJETIVO_ROTULO[obj]}</b>`); }
  const f = forca(t);
  if (f !== null) { treino.forca = f; linhas.push(`+ Força: <b>${f ? 'sim' : 'não'}</b>`); }
  const partes = String(text || '').replace(/(\d),(\d)/g, '$1.$2').split(/[,;]|\s+e\s+/i).map(norm).filter(Boolean);
  const fr = frequencias(partes);
  if (fr.freqSemana) { treino.freqSemana = fr.freqSemana; linhas.push(`Treinos por semana: <b>${fr.freqSemana}×</b>`); }
  if (fr.freqPorMusculo) {
    treino.freqPorMusculo = fr.freqPorMusculo;
    linhas.push(`Por músculo (na semana): <b>${fr.musculosRotulo.join(', ')}</b>`);
  }
  const tp = tempoTreino(t);
  if (tp) { treino.tempoTreino = tp; linhas.push(`Tempo de treino: <b>${TEMPO_ROTULO[tp]}</b>`); }
  const pz = pausa(t);
  if (pz) { treino.pausa = pz; linhas.push(`Tempo parado: <b>${PAUSA_ROTULO[pz]}</b>`); }

  const kg = peso(t);
  if (kg) { corpo.pesoKg = kg; linhas.push(`Peso: <b>${String(kg).replace('.', ',')} kg</b>`); }
  const cm = altura(t);
  if (cm) { corpo.alturaCm = cm; linhas.push(`Altura: <b>${(cm / 100).toFixed(2).replace('.', ',')} m</b>`); }
  const sx = sexo(t);
  if (sx) { corpo.sexo = sx; linhas.push(`Sexo: <b>${sx === 'F' ? 'feminino' : 'masculino'}</b>`); }

  if (!linhas.length) return null;
  return { treino, corpo, linhas };
}

// Frase pedindo pra VER o perfil ("qual meu perfil de treino", "quanto eu peso")
export function querVerPreparo(text) {
  const t = norm(text);
  return /\b(qual|quais|mostra|ver|como ta|como esta)\b.*\bperfil de treino\b|\bmeu perfil de treino\b\s*$|\bquanto (eu )?peso\b|\bqual (e )?(o )?meu peso\b|\bminha altura\b\s*$|\bqual (e )?(a )?minha altura\b/.test(t);
}

// Fala de medidas da fita (cintura, braço…) ou foto: só a tela grava isso.
export function falaDeMedidas(text) {
  const t = norm(text);
  return /\b(cintura|pescoco|quadril|peitoral|coxa|medidas?|medicao|fotos? do corpo|percentual de gordura|% de gordura|gordura corporal)\b/.test(t) &&
    /\b(registr|anot|salv|coloc|bot|minha|meu|med|tirar|fazer|atualiz)/.test(t);
}
