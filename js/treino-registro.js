// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS E LISTAS (modalidades, músculos)
// BLOCO 2 — QUE TIPO DE REGISTRO A ATIVIDADE PEDE
// BLOCO 3 — POPUP AO CONCLUIR (atividade física / leitura)
// BLOCO 4 — CONSTÂNCIA POR MÚSCULO (Metas e Pet)
// ─────────────────────────────────────────────────────────────
// Élton, 26/10: ao marcar a atividade física no Ritual, a pessoa diz o que fez
// (Musculação, Luta…) e, na musculação, os músculos do dia. Fazer pouco ainda
// conta (foi e fez algo); o que ficou faltando fica registrado pro relatório.
// Leitura tem mínimo de páginas: leu menos, conta igual, com incentivo.
// Tudo fica no `extra` da tarefa (treino, paginas): sem SQL.

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS E LISTAS
// ═══════════════════════════════════════════════════════════════
import { fetchDaysRange, getProfile } from './banco-dados.js';
import { trapModalBack } from './modal-voltar.js';
import { GRUPOS_MUS, MUSCULOS, getPerfilTreino } from './perfil-treino-ui.js';
import { EXERCICIOS, GENERICOS, acharExercicios, nomeExibido } from './treino-exercicios.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const MODALIDADES = [
  { k: 'musculacao', nome: 'Musculação', ic: '🏋️' },
  { k: 'crossfit',   nome: 'Crossfit',   ic: '🔥' },
  { k: 'luta',       nome: 'Luta',       ic: '🥋' },
  { k: 'corrida',    nome: 'Corrida',    ic: '🏃' },
  { k: 'cardio',     nome: 'Cardio',     ic: '🚴' },
  { k: 'outro',      nome: 'Outro',      ic: '✨' },
];
// Na musculação dá pra marcar cardio junto (Élton): entra como "músculo" extra
const CARDIO = { k: 'cardio', nome: 'Cardio' };
export const nomeMusculo = (k) => (k === 'cardio' ? CARDIO : MUSCULOS.find(m => m.k === k))?.nome || k;

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: QUE TIPO DE REGISTRO A ATIVIDADE PEDE
// ═══════════════════════════════════════════════════════════════
// 'fisica' | 'leitura' | null. A escolha salva na atividade vale; sem ela, o nome decide.
export function tipoRegistro(cat) {
  if (!cat) return null;
  if (cat.registro === 'fisica' || cat.registro === 'leitura') return cat.registro;
  if (cat.registro === 'nenhum') return null;
  const n = norm(cat.name);
  if (/\b(atividade fisica|academia|musculacao|malhar|malhacao|treino|treinar|crossfit|exercicios?)\b/.test(n)) return 'fisica';
  if (/\b(leitura|ler|livros?)\b/.test(n)) return 'leitura';
  return null;
}

// Músculos citados num texto ("Treino de perna", "peito e tríceps"). Perna e
// braço viram as partes (Élton: braço = bíceps+tríceps; perna = quadríceps,
// posterior, glúteo e panturrilha).
export function musculosDoTexto(txt) {
  const t = ' ' + norm(txt) + ' ';
  const out = new Set();
  if (/\b(perna|pernas|inferiores?)\b/.test(t)) ['quadriceps', 'posterior', 'gluteo', 'panturrilha'].forEach(k => out.add(k));
  if (/\b(braco|bracos)\b/.test(t)) ['biceps', 'triceps'].forEach(k => out.add(k));
  for (const m of MUSCULOS) {
    const raiz = norm(m.nome).replace(/s$/, '');
    if (t.includes(' ' + raiz)) out.add(m.k);
  }
  if (/\b(ombro|ombros)\b/.test(t)) out.add('ombros');
  if (/\b(abdomen|abdominal|abs)\b/.test(t)) out.add('abdomen');
  if (/\b(cardio|esteira|bike)\b/.test(t)) out.add('cardio');
  return [...out];
}

// Séries × repetições de um músculo ({ s, r }) → "4x12" (só séries: "4 séries")
const fmtSerie = (v) => v?.s && v?.r ? `${v.s}x${v.r}` : v?.s ? `${v.s} série${v.s > 1 ? 's' : ''}` : v?.r ? `${v.r} rep.` : '';
// Peso do corpo (Élton, 03/11): mostra o peso da pessoa (Preparo Físico) quando o app sabe
const _kg = (n) => `${String(n).replace('.', ',')} kg`;
const fmtKg = (x) => x?.kg ? _kg(x.kg) : x?.corpo ? (x.kgCorpo ? `peso do corpo ${_kg(x.kgCorpo)}` : 'peso do corpo') : '';
// Põe o peso da pessoa nos exercícios com o peso do corpo (sem mudar os que já têm)
export function comPesoCorpo(lista = [], pesoKg) {
  const kg = Number(pesoKg) || 0;
  return lista.map(x => x?.corpo && !x.kg && kg && !x.kgCorpo ? { ...x, kgCorpo: kg } : x);
}
// "Serrote 3x10 22 kg" (o nome sem o parêntese, pra caber)
// Parte do peito (Élton, 04/11): "crossover parte inferior"
// Peito em que dá pra mirar uma parte (inclinado/declinado já dizem a parte)
export const TEM_PARTE = new Set(['Supino reto', 'Supino com halteres', 'Supino na máquina', 'Crucifixo', 'Crossover', 'Peck deck (voador)']);
export const ROTULO_PARTE = { superior: 'parte superior', meio: 'parte do meio', inferior: 'parte inferior' };
// Variação (Élton, 04/11): posição, aparelho, pegada e um lado só, pro relatório
// ficar detalhado ("tríceps testa em pé, na polia com barra")
const ROT_POS = { empe: 'em pé', sentado: 'sentado', deitado: 'deitado', inclinado: 'no banco inclinado', declinado: 'no banco declinado' };
const ROT_EQUIP = { polia_barra: 'na polia com barra', polia_corda: 'na polia com corda', polia_w: 'na polia com barra W', polia: 'na polia',
  barra_w: 'com barra W', barra: 'com barra', corda: 'com corda', halter: 'com halteres', maquina: 'na máquina', smith: 'no Smith',
  kettlebell: 'com kettlebell', anilha: 'com anilha', elastico: 'com elástico' };
const ROT_PEGADA = { pronada: 'pegada pronada', supinada: 'pegada supinada', neutra: 'pegada neutra', aberta: 'pegada aberta', fechada: 'pegada fechada' };
const _POS_RE = { empe: /\b(em pe|de pe)\b/, sentado: /\bsentad[oa]s?\b/, deitado: /\bdeitad[oa]s?\b/, inclinado: /\binclinad[oa]\b/, declinado: /\bdeclinad[oa]\b/ };
const _POS_NOME = /\s+\b(deitado|sentado|em pé|de pé)\b/;
export function lerVariacao(txt) {
  // "é de pé e não deitado": o que vem depois do "não" não vale
  const t = ' ' + norm(txt).replace(/\bnao\s+(?:e\s+|eh\s+|foi\s+|era\s+)?(?:(?:com|na|no|de|em|o|a)\s+)?\w+(?:\s+(?:w|pe))?/g, ' ') + ' ';
  const v = {};
  for (const [k, re] of Object.entries(_POS_RE)) if (re.test(t)) { v.pos = k; break; }
  const polia = /\b(polia|pulley|cabo|crossover)\b/.test(t), w = /\bbarra\s+w\b/.test(t);
  const barra = /\bbarra\b/.test(t) && !/\bbarra fixa\b/.test(t), corda = /\bcorda\b/.test(t);
  if (polia) v.equip = w ? 'polia_w' : barra ? 'polia_barra' : corda ? 'polia_corda' : 'polia';
  else if (w) v.equip = 'barra_w';
  else if (/\bsmith\b|\bbarra guiada\b/.test(t)) v.equip = 'smith';
  else if (/\bhalter\w*\b|\bdumbbell\b/.test(t)) v.equip = 'halter';
  else if (/\bmaquina\b|\baparelho\b|\barticulad[oa]\b/.test(t)) v.equip = 'maquina';
  else if (/\bkettlebell\b/.test(t)) v.equip = 'kettlebell';
  else if (/\banilha\b/.test(t)) v.equip = 'anilha';
  else if (/\belastico\b|\bfaixa elastica\b/.test(t)) v.equip = 'elastico';
  else if (corda) v.equip = 'corda';
  else if (barra) v.equip = 'barra';
  const pg = t.match(/\bpegada\s+(pronada|supinada|neutra|aberta|fechada)\b/);
  if (pg) v.pegada = pg[1];
  if (/\b(unilateral|um braco so|um braco de cada vez|uma perna so|uma perna de cada vez|um lado so)\b/.test(t)) v.uni = true;
  return v;
}
export function fmtExercicio(x) {
  let nome = nomeExibido(x.nome);
  // Posição dita diferente da que o nome técnico traz ("deitado" → em pé): tira do nome
  if (x.pos && ROT_POS[x.pos] && _POS_NOME.test(nome) && !norm(nome).includes(norm(ROT_POS[x.pos]))) nome = nome.replace(_POS_NOME, '');
  const ja = norm(nome);
  // Já está no nome ("Remada unilateral com halter" não repete "com halteres")
  const tem = (rot) => norm(rot).split(/\s+/).filter(w => w.length > 2 && !['com', 'banco', 'pegada'].includes(w))
    .every(w => ja.includes(w.slice(0, 5)));
  const vari = [ROT_POS[x.pos], ROT_EQUIP[x.equip], ROT_PEGADA[x.pegada], x.uni ? 'unilateral' : ''].filter(r => r && !tem(r));
  return [nome + (vari.length ? ', ' + vari.join(', ') : ''), ROTULO_PARTE[x.parte] || '', fmtSerie(x), fmtKg(x)].filter(Boolean).join(' ');
}

// Descrição da tarefa: "Musculação: Costas (Barra fixa 3x7, Serrote 3x10 22 kg), Bíceps 4x12 + Luta"
export function descTreino(modalidades, musculos = [], series = {}, exercicios = []) {
  const mus = [...musculos];
  for (const x of exercicios) if (x.m && !mus.includes(x.m)) mus.push(x.m);
  const parteMus = (k) => {
    const ex = exercicios.filter(x => x.m === k);
    return ex.length ? `${nomeMusculo(k)} (${ex.map(fmtExercicio).join(', ')})` : [nomeMusculo(k), fmtSerie(series[k]), fmtKg(series[k])].filter(Boolean).join(' ');
  };
  return MODALIDADES.filter(x => modalidades.includes(x.k)).map(x => x.k === 'musculacao' && mus.length
    ? `${x.nome}: ${mus.map(parteMus).join(', ')}` : x.nome).join(' + ');
}

// Junta exercícios: o mesmo exercício (nome) soma os campos; o novo vale por cima
export function juntarExercicios(antes = [], novos = []) {
  const out = antes.map(x => ({ ...x }));
  for (const n of novos) {
    // Mesma parte do peito (ou sem parte: corrige o que já tinha); parte diferente é outro
    const i = out.findIndex(x => x.nome === n.nome && (!n.parte || !x.parte || x.parte === n.parte));
    if (i < 0) { out.push({ ...n }); continue; }
    for (const c of ['m', 's', 'r', 'kg', 'corpo', 'kgCorpo', 'parte', 'pos', 'equip', 'pegada', 'uni']) if (n[c] != null && n[c] !== false) out[i][c] = n[c];
    if (n.kg) { delete out[i].corpo; delete out[i].kgCorpo; }
  }
  return out;
}

// Exercícios juntos por músculo, na ordem em que o músculo apareceu (card do Pet)
export function porMusculo(lista = []) {
  const g = new Map();
  for (const x of lista) { if (!g.has(x.m)) g.set(x.m, []); g.get(x.m).push(x); }
  return [...g.entries()];
}

// Patch da tarefa (o mesmo do pop-up): desc + treino { modalidade(s), musculos, series, exercicios, faltou }
export function patchTreino({ modalidades, musculos = [], series = {}, exercicios = [], plano = [], pesoKg = null }) {
  const lista = MODALIDADES.filter(x => modalidades.includes(x.k)).map(x => x.k);
  const musc = lista.includes('musculacao');
  const ex = musc ? comPesoCorpo(exercicios.filter(x => x?.nome && x?.m), pesoKg) : [];
  const mus = musc ? [...musculos] : [];
  for (const x of ex) if (!mus.includes(x.m)) mus.push(x.m);
  const ser = Object.fromEntries(Object.entries(series).filter(([k, v]) => mus.includes(k) && (v?.s || v?.r || v?.kg)));
  const faltou = musc ? plano.filter(k => !mus.includes(k)) : [];
  const limpo = ex.map(x => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && v !== false && v !== '')));
  return {
    patch: { desc: descTreino(lista, mus, ser, limpo), treino: { modalidade: lista[0], modalidades: lista, musculos: mus,
      ...(Object.keys(ser).length ? { series: ser } : {}), ...(limpo.length ? { exercicios: limpo } : {}), ...(faltou.length ? { faltou } : {}) } },
    msg: faltou.length ? `Boa constância! Ficou faltando ${faltou.map(nomeMusculo).join(', ')}, anotei aqui.` : null,
  };
}

// Treino falado (Pet): "fiz peito e tríceps, 4 séries de 12", "costas 3x10 e
// bíceps 4x8", "treinei perna", "fiz musculação e luta". Séries ditas depois
// de vários músculos valem pra todos os que não têm as suas.
// Com exercício (Élton, 03/11): "remada 4 séries de 8 com 50 kg", "fiz 3 séries
// de 10 no serrote; no serrote fiz com 22 kg", "na barra levantei meu peso".
const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 };
const CENTENAS = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quinhentos: 500 };
const _VAL = { ...NUM, ...CENTENAS };
const _PAL = Object.keys(_VAL).sort((a, b) => b.length - a.length).join('|');
// Número por extenso vira dígito ("vinte e dois" → 22, "cento e vinte" → 120).
// "um/uma" sozinho fica (é artigo: "uma remada").
function numeraliza(t) {
  return t.replace(new RegExp(`\\b(?:${_PAL})(?:\\s+e\\s+(?:${_PAL}))*\\b`, 'g'), (seq) => {
    const ps = seq.split(/\s+e\s+/);
    if (ps.length === 1) return ps[0] === 'um' || ps[0] === 'uma' ? seq : String(_VAL[ps[0]]);
    // Só soma do maior pro menor ("vinte e dois"); "três e dez" fica separado
    let tot = 0, ant = Infinity;
    for (const p of ps) { const v = _VAL[p]; if (v >= ant) return ps.map(x => (x === 'um' || x === 'uma') ? x : String(_VAL[x])).join(' e '); tot += v; ant = v; }
    return String(tot);
  });
}
const num = (w) => /^\d+$/.test(w) ? Number(w) : NUM[w] || null;
const W = '(\\d+|um|uma)';
const REP = '(?:repeticoes|repeticao|reps?)';
// Jeitos de falar séries × repetições (Élton, 03/11: "tem que funcionar pras
// diferentes formas faladas"): 4x8 · 4 por 8 · 4 séries de 8 (repetições) ·
// 4 séries 8 reps · séries de 8 repetições · 4 de 8 · 4 vezes 8 · 8 repetições 4 vezes
const NAO_CARGA = '(?!\\s*(?:kg|kgs|quilos?|kilos?|min\\w*|seg\\w*)|[.,]\\d)';
const RE_SERIE = new RegExp([
  `${W}\\s*(?:x|por|vezes(?:\\s+de)?)\\s*${W}\\b${NAO_CARGA}`,                                   // 1,2
  `${W}\\s*series?(?:\\s*(?:de|com|x)\\s*${W}${NAO_CARGA}(?:\\s*${REP})?|\\s*,?\\s*${W}\\s*${REP})?`, // 3,4 | 5
  `series?\\s*(?:de|com)\\s*${W}\\s*${REP}`,                                                     // 6
  `${W}\\s*${REP}\\s*,?\\s*${W}\\s*vezes`,                                                       // 7 (rep), 8 (séries)
  `\\b${W}\\s+de\\s+${W}\\b${NAO_CARGA}(?!\\s*(?:de\\s+)?(?:series?|${REP.slice(3, -1)}))`,     // 9,10 "4 de 8"
].join('|'), 'g');
// Carga: "50 kg/quilos", "meu peso", "sem peso", "com 60" (sem unidade), "botei 50"
const RE_KG = new RegExp([
  '(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kgs|quilos?|kilos?)\\b',
  '\\b(meu (?:proprio )?peso|peso do (?:meu )?corpo|peso corporal|sem peso|sem carga|so o corpo)\\b',
  `\\b(?:com|botei|coloquei|pus|usei|peguei|levantei|carga de|carga)\\s+(\\d+(?:[.,]\\d+)?)\\b(?!\\s*(?:x\\b|por\\b|vezes|series?|de\\s+\\d|${REP.slice(3, -1)}|min\\w*|seg\\w*|kg|kgs|quilos?|kilos?|[.,]?\\d))`,
].join('|'), 'g');
const valorSerie = (m) => m[1] ? { s: num(m[1]), r: num(m[2]) }
  : m[3] ? { s: num(m[3]), ...(m[4] ? { r: num(m[4]) } : m[5] ? { r: num(m[5]) } : {}) }
  : m[6] ? { r: num(m[6]) }
  : m[7] ? { r: num(m[7]), s: num(m[8]) }
  : { s: num(m[9]), r: num(m[10]) };
const kgDo = (m) => m[1] || m[3] ? { kg: Number(String(m[1] || m[3]).replace(',', '.')) } : { corpo: true };

const RE_PARTE = /\b(?:(?:parte|porcao|regiao|feixe)\s+(?:d[aeo]\s+)?(?:peito\s+|peitoral\s+)?(superior|de cima|alta|media|do meio|meio|central|inferior|de baixo|baixa)|(?:peito|peitoral)\s+(superior|alto|de cima|medio|do meio|inferior|baixo|de baixo)|(superior|inferior))\b/;
function _parteDo(txt) {
  const m = RE_PARTE.exec(txt);
  const v = m && (m[1] || m[2] || m[3]);
  if (!v) return null;
  return /^(superior|de cima|alta|alto)$/.test(v) ? 'superior' : /^(inferior|de baixo|baixa|baixo)$/.test(v) ? 'inferior' : 'meio';
}
// "tríceps com barra testa", "tríceps testa na polia com barra" (Élton, 04/11):
// o pedaço que só fala do aparelho, colado em outro exercício do mesmo músculo,
// descreve esse outro, não é um exercício a mais
const _EQUIP = /\b(barra|corda|polia|pulley|cabo|halter\w*|maquina|smith|anilha)\b/;
function _juntarColados(t, es) {
  for (let i = es.length - 1; i > 0; i--) {
    const a = es[i - 1], b = es[i];
    if (!/^\s*(?:(?:de|da|do|com|na|no|a|o)\s+)*$/.test(t.slice(a.fim, b.ini))) continue;
    // Só o aparelho ("testa com barra"): o "barra" não é a barra fixa, é do exercício do lado
    const so = (e) => !t.slice(e.ini, e.fim).replace(_EQUIP, ' ').replace(/\b(?:de|da|do|com|na|no|a|o|w|v)\b/g, ' ').trim();
    if (so(b) && !so(a)) { es.splice(i - 1, 2, { ...a, fim: b.fim }); continue; }
    if (so(a) && !so(b)) { es.splice(i - 1, 2, { ...b, ini: a.ini }); continue; }
    if (a.m !== b.m) continue;
    const ea = _EQUIP.test(t.slice(a.ini, a.fim)), eb = _EQUIP.test(t.slice(b.ini, b.fim));
    if (ea === eb) continue;
    const fica = ea ? b : a;
    es.splice(i - 1, 2, { ...fica, ini: a.ini, fim: b.fim });
  }
  return es;
}

function _exerciciosDoTexto(t) {
  const es = _juntarColados(t, acharExercicios(t));
  if (!es.length) return [];
  const itens = es.map(e => ({ ...e, d: {} }));
  const antes = (pos) => [...itens].reverse().find(e => e.fim <= pos);
  const depois = (pos) => itens.find(e => e.ini >= pos);
  // Séries: "3 séries de 10 no serrote" (vem antes, ligado por no/na) ou "remada 4x8" (depois)
  RE_SERIE.lastIndex = 0;
  let m;
  while ((m = RE_SERIE.exec(t))) {
    const fim = m.index + m[0].length, prox = depois(fim), ant = antes(m.index);
    const ligado = prox && (!ant || /^\s*(?:,\s*)?(?:no|na|nos|nas|em|de|do|da)\s+(?:(?:o|a)\s+)?$/.test(t.slice(fim, prox.ini)));
    const alvo = ligado ? prox : ant || prox;
    if (alvo) Object.assign(alvo.d, Object.fromEntries(Object.entries(valorSerie(m)).filter(([, v]) => v)));
    // "puxada 3x12 45": número solto logo depois das séries é a carga
    const solto = alvo && /^\s*,?\s*(\d+(?:[.,]\d+)?)\b(?!\s*(?:x\b|por\b|vezes|series?|repeticoes|repeticao|reps?|min\w*|seg\w*))/.exec(t.slice(fim));
    if (solto) {
      const v = Number(solto[1].replace(',', '.'));
      // "4 séries 8": o número solto é a repetição; "3x12 45": é a carga
      if (alvo.d.s && !alvo.d.r && Number.isInteger(v) && v <= 100) alvo.d.r = v;
      else if (v > 0 && v < 1000) alvo.d.kg = v;
    }
  }
  // Carga: vale pro exercício falado antes ("no serrote fiz com 22 kg")
  RE_KG.lastIndex = 0;
  while ((m = RE_KG.exec(t))) {
    // Vale pro exercício falado antes; sem nenhum antes ("botei 50 na remada"), o de depois
    const alvo = antes(m.index) || depois(m.index + m[0].length);
    if (!alvo) continue;
    const v = kgDo(m);
    if (v.kg) { if (v.kg > 0 && v.kg < 1000) { alvo.d.kg = v.kg; delete alvo.d.corpo; } }
    else if (!alvo.d.kg) alvo.d.corpo = true;
  }
  // Parte do peito: superior / meio / inferior, dita perto do exercício
  // (primeiro o que vem depois dele, até o próximo exercício; senão o de antes)
  for (const e of itens) {
    if (e.m !== 'peito') continue;
    const i = itens.indexOf(e);
    const depoisTxt = t.slice(e.fim, itens[i + 1]?.ini ?? t.length);
    const antesTxt = t.slice(itens[i - 1]?.fim ?? 0, e.ini);
    const p = _parteDo(depoisTxt) || _parteDo(antesTxt);
    if (p) e.d.parte = p;
  }
  // Variação: o que vem no nome falado e depois dele, até o próximo exercício
  for (const [i, e] of itens.entries()) Object.assign(e.d, lerVariacao(t.slice(e.ini, itens[i + 1]?.ini ?? t.length)));
  // O mesmo exercício falado duas vezes vira um só
  let lista = juntarExercicios([], itens.map(e => ({ m: e.m, nome: e.nome, ...e.d })));
  for (const x of lista) if (!x.kg && CORPO.has(x.nome)) x.corpo = true;
  // "remada" + "remada inclinada": se só tem um específico e um completa o outro, junta
  // (o microfone come palavras: "rosca nada... 10 kg" era a rosca inclinada sem carga ainda)
  for (const g of lista.filter(x => GENERICOS.has(x.nome))) {
    const choca = (e) => ['s', 'r', 'kg'].some(c => g[c] != null && e[c] != null && g[c] !== e[c]);
    const esp = lista.filter(x => x !== g && x.m === g.m && x.nome.startsWith(g.nome + ' ') && !choca(x));
    if (esp.length !== 1) continue;
    for (const c of ['s', 'r', 'kg', 'corpo']) if (g[c] != null && esp[0][c] == null) esp[0][c] = g[c];
    lista = lista.filter(x => x !== g);
  }
  // Sobrou "rosca ... com halter" sem par: é a rosca direta com halteres
  for (const x of lista) {
    const e = itens.find(i => i.nome === x.nome);
    const prox = e && itens.find(i => i.ini > e.ini);
    if (x.nome === 'Rosca' && e && /\bhalter(es)?\b/.test(t.slice(e.fim, prox?.ini ?? t.length))) x.nome = 'Rosca direta com halteres';
  }
  return lista;
}

// `livre`: com um card aberto pra corrigir, o nome do exercício sozinho já vale
export function lerTreinoFalado(texto, { livre = false } = {}) {
  const t = ' ' + numeraliza(norm(texto).replace(/[,;.!?]/g, ' , ')) + ' ';
  const exercicios = _exerciciosDoTexto(t);
  RE_SERIE.lastIndex = 0; RE_KG.lastIndex = 0;
  const temNumero = RE_SERIE.test(t) || RE_KG.test(t);
  RE_SERIE.lastIndex = 0; RE_KG.lastIndex = 0;
  // Sem "fiz/treinei", vale se citou exercício com séries ou carga ("remada 4x8 50 kg")
  // "a carga do peito foi 25 kg" também é treino (Élton, 04/11: virava o peso do corpo)
  const carga = /\bcarga\b/.test(t) && RE_KG.test(t); RE_KG.lastIndex = 0;
  if (!(livre && exercicios.length) && !/\b(fiz|treinei|treino de|malhei|terminei|acabei|registra|anota)\b/.test(t) && !(exercicios.length && (temNumero || exercicios.some(x => x.parte))) && !(carga && musculosDoTexto(t).length)) return null;
  const modalidades = new Set();
  if (/\b(muscula\w*|academia|malhei|treino de|series?|\d+\s*x\s*\d+)\b/.test(t)) modalidades.add('musculacao');
  if (/\b(crossfit|cross)\b/.test(t)) modalidades.add('crossfit');
  if (/\b(luta|karate|jiu|jiu-jitsu|muay|boxe|judo|mma|taekwondo)\b/.test(t)) modalidades.add('luta');
  if (/\b(corri|corrida|correr)\b/.test(t)) modalidades.add('corrida');
  const musculos = [], series = {};
  if (exercicios.length) {
    modalidades.add('musculacao');
    // Músculo dito com todas as letras ("treino de costas"); "cada braço" e o
    // nome do exercício ("panturrilha em pé") não contam de novo
    let resto = t.replace(/\bcada\s+(?:braco|lado|perna|mao|halter)\b/g, ' ');
    for (const e of acharExercicios(resto).reverse()) resto = resto.slice(0, e.ini) + ' ' + resto.slice(e.fim);
    for (const k of musculosDoTexto(resto)) if (k !== 'cardio' && !musculos.includes(k)) musculos.push(k);
    for (const x of exercicios) if (!musculos.includes(x.m)) musculos.push(x.m);
    if (/\b(cardio|esteira|bike)\b/.test(t)) modalidades.add('cardio');
    // Sem o número de séries, mas os outros da mesma fala têm todos o mesmo
    // (Élton: "...na barra, fiz três séries de 10 no serrote" — o "três" serve pros dois)
    const ss = [...new Set(exercicios.filter(x => x.s).map(x => x.s))];
    const supostos = [];
    if (ss.length === 1 && exercicios.filter(x => x.s).length >= 2) {
      for (const x of exercicios) if (!x.s && (x.r || x.kg || x.corpo)) { x.s = ss[0]; supostos.push(x.nome); }
    }
    return { modalidades: [...modalidades], musculos, series, exercicios, supostos };
  }
  // Músculos na ordem em que aparecem, cada um com as séries que vêm logo depois
  const pedacos = t.split(/\s(?:e|,)\s/);
  let pendentes = [];
  for (const p of pedacos) {
    const ms = musculosDoTexto(p).filter(k => k !== 'cardio');
    if (/\b(cardio|esteira|bike)\b/.test(p)) modalidades.add('cardio');
    for (const k of ms) if (!musculos.includes(k)) musculos.push(k);
    RE_SERIE.lastIndex = 0;
    const m = RE_SERIE.exec(p);
    if (ms.length) pendentes.push(...ms);
    if (m) {
      const v = valorSerie(m);
      for (const k of pendentes) if (!series[k]) series[k] = v;
      pendentes = [];
    }
  }
  if (musculos.length) modalidades.add('musculacao');
  if (!musculos.length && !modalidades.size) return null;
  // Carga sem o exercício ("3x10 com 25 kg de peito"): fica no músculo (Élton, 04/11)
  const fortes = musculos.filter(k => k !== 'cardio');
  if (fortes.length === 1) {
    RE_KG.lastIndex = 0;
    const mk = RE_KG.exec(t); RE_KG.lastIndex = 0;
    const v = mk ? kgDo(mk) : null;
    if (v?.kg > 0 && v.kg < 1000) series[fortes[0]] = { ...(series[fortes[0]] || {}), kg: v.kg };
  }
  return { modalidades: [...modalidades], musculos, series, exercicios: [] };
}

// ─── CONSULTA DO TREINO (Élton, 04/11) ───────────────────────────
// "como tá o treino de hoje?", "o que eu treinei ontem?", "quanto peguei no
// supino?", "quando fiz rosca pela última vez?". Devolve o período e/ou o
// exercício, ou null se não for pergunta sobre o treino.
const _DIAS_SEM = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
export function lerConsultaTreino(texto, hoje = new Date()) {
  const bruto = norm(texto);
  const t = ' ' + bruto.replace(/[,;.!?]/g, ' ') + ' ';
  RE_SERIE.lastIndex = 0;
  const temSerie = RE_SERIE.test(' ' + numeraliza(t) + ' '); RE_SERIE.lastIndex = 0;
  if (temSerie) return null;   // tem séries: é registro, não pergunta
  const pergunta = /\?\s*$/.test(String(texto).trim()) || /\b(como|o que|oque|qual|quais|quanto|quanta|quantas|quantos|quando|mostra|mostre|me (?:fala|diz|manda|mostra|passa)|ver|veja|lista|consulta\w*|resumo|anotac\w*|anotad\w*|registros?|registrad\w*|historico|ultim\w*)\b/.test(t);
  if (!pergunta) return null;
  // "fiz peito hoje" é registro; "o que eu treinei ontem?" é pergunta
  if (/\b(fiz|treinei|malhei|terminei|acabei|registra|anota|marca|soma)\b/.test(t) && !/\?\s*$/.test(String(texto).trim())
    && !/\b(como|o que|oque|qual|quais|quanto|quanta|quantas|quantos|quando|mostra|me (?:fala|diz|manda|mostra|passa))\b/.test(t)) return null;
  const ex = acharExercicios(t).filter(e => !GENERICOS.has(e.nome));
  const doTreino = /\b(treino|treinos|treinei|academia|muscula\w*|exercicios?)\b/.test(t);
  if (!doTreino && !ex.length) return null;
  // Período
  const d0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const menos = (n) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - n);
  let ini = null, fim = null;
  if (/\banteontem\b/.test(t)) ini = fim = menos(2);
  else if (/\bontem\b/.test(t)) ini = fim = menos(1);
  else if (/\bhoje\b/.test(t)) ini = fim = d0;
  else if (/\b(semana passada)\b/.test(t)) { const dow = (d0.getDay() + 6) % 7; ini = menos(dow + 7); fim = menos(dow + 1); }
  else if (/\b(essa|esta|nessa|nesta|da|na) semana\b|\bsemana\b/.test(t)) { ini = menos((d0.getDay() + 6) % 7); fim = d0; }
  else if (/\b(ultimos|ultimas) (\d+) dias\b/.test(t)) { const n = Number(t.match(/\b(?:ultimos|ultimas) (\d+) dias\b/)[1]); ini = menos(Math.min(n, 90) - 1); fim = d0; }
  else {
    const md = t.match(/\bdia (\d{1,2})(?:\s*(?:\/|de)\s*(\d{1,2}))?\b/);
    if (md) {
      const dia = Number(md[1]), mes = md[2] ? Number(md[2]) - 1 : d0.getMonth();
      let d = new Date(d0.getFullYear(), mes, dia);
      if (d > d0) d = new Date(d0.getFullYear() - (md[2] ? 1 : 0), md[2] ? mes : mes - 1, dia);
      ini = fim = d;
    } else {
      const i = _DIAS_SEM.findIndex(w => new RegExp(`\\b${w}(?:-feira)?\\b`).test(t));
      if (i >= 0) { const volta = ((d0.getDay() - i) + 7) % 7; ini = fim = menos(volta); }
    }
  }
  const exercicio = ex[0] ? { m: ex[0].m, nome: ex[0].nome } : null;
  // "como tá o meu treino?" sem dia segue pra constância por músculo;
  // "as anotações do treino" sem dia = hoje
  if (!ini && !exercicio) { if (!/\b(anotac\w*|anotad\w*|registros?|registrad\w*)\b/.test(t)) return null; ini = fim = d0; }
  return { ini, fim, exercicio };
}

// Linhas do treino de um dia, por músculo (pro Pet mostrar)
export function linhasTreino(tr = {}) {
  const ex = tr.exercicios || [];
  const mus = [...(tr.musculos || [])];
  for (const x of ex) if (x.m && !mus.includes(x.m)) mus.push(x.m);
  const out = [];
  for (const k of mus) {
    const xs = ex.filter(x => x.m === k);
    if (xs.length) out.push({ m: nomeMusculo(k), itens: xs.map(fmtExercicio) });
    else out.push({ m: [nomeMusculo(k), fmtSerie(tr.series?.[k]), fmtKg(tr.series?.[k])].filter(Boolean).join(' '), itens: [] });
  }
  return out;
}

// Os exercícios mais comuns do músculo (pro Pet perguntar qual foi)
export function exerciciosTop(m, n = 5) {
  return (EXERCICIOS[m] || []).filter(e => e.top && !GENERICOS.has(e.nome)).slice(0, n).map(e => e.nome);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: POPUP AO CONCLUIR
// ═══════════════════════════════════════════════════════════════
// Resolve com o patch da tarefa ({ desc, treino } ou { paginas, desc }) e a
// mensagem de incentivo, ou {} se a pessoa pular. Nunca impede de marcar.
// `inicial` (Pet): o que a pessoa já falou ({ modalidades, musculos, series })
export function perguntarAoConcluir(cat, task, inicial = null) {
  const tipo = tipoRegistro(cat);
  if (tipo === 'fisica') return _popupFisica(cat, task, inicial);
  if (tipo === 'leitura') return _popupLeitura(cat, task);
  return Promise.resolve({});
}

function _modal(html) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '9500';   // acima do Pet (9000): a lista do dia do Pet também abre este pop-up
  ov.innerHTML = `<div class="modal tr-modal">${html}</div>`;
  document.body.appendChild(ov);
  return ov;
}

// Exercícios com o peso do corpo (sem carga, a não ser que a pessoa ponha)
const CORPO = new Set(['Barra fixa', 'Flexão de braço', 'Paralelas', 'Mergulho no banco', 'Prancha', 'Abdominal', 'Elevação de pernas', 'Abdominal infra', 'Abdominal oblíquo', 'Ponte', 'Glúteo 4 apoios', 'Hiperextensão lombar', 'Flexão diamante', 'Prancha lateral', 'Abdominal bicicleta', 'Abdominal remador', 'Escalador', 'Roda abdominal', 'Agachamento sissy']);
// Os que a pessoa mais usa aparecem primeiro (só neste aparelho; é conveniência)
const _RK = 'falcon_ex_recentes';
function _recentes(k) { try { return (JSON.parse(localStorage.getItem(_RK) || '{}')[k] || []); } catch { return []; } }
function _lembrarRecente(k, nome) {
  try {
    const o = JSON.parse(localStorage.getItem(_RK) || '{}');
    o[k] = [nome, ...(o[k] || []).filter(n => n !== nome)].slice(0, 6);
    localStorage.setItem(_RK, JSON.stringify(o));
  } catch { /* sem armazenamento: só não lembra */ }
}

let _pesoCorpo = null;
function _popupFisica(cat, task, inicial = null) {
  getProfile().then(p => { _pesoCorpo = p?.pesoKg || null; }).catch(() => {});
  return new Promise((resolve) => {
    // O que estava planejado: o que já foi registrado ou o que a descrição diz
    const plano = task?.treino?.musculos?.length ? task.treino.musculos : musculosDoTexto(`${task?.desc || ''} ${task?.title || ''}`);
    // Várias modalidades no mesmo dia (Élton, 31/10: "musculação e luta")
    const mods = new Set(inicial?.modalidades || task?.treino?.modalidades || (task?.treino?.modalidade ? [task.treino.modalidade] : plano.length ? ['musculacao'] : []));
    const sel = new Set(inicial?.musculos?.length ? inicial.musculos : plano);
    // Séries × repetições por músculo (registro antigo, sem exercício): { peito: { s: 4, r: 12 } }
    const series = { ...(task?.treino?.series || {}), ...(inicial?.series || {}) };
    // Exercícios (Élton, 03/11): [{ m, nome, s, r, kg, corpo }]. O que o Pet ouviu soma ao que já tinha.
    let exercicios = juntarExercicios(task?.treino?.exercicios || [], inicial?.exercicios || []);
    for (const x of exercicios) sel.add(x.m);
    let abertoEm = null, todosEm = null;   // músculo com a lista de exercícios aberta / com "ver todos"
    const ov = _modal('');
    let resultado = {};
    const close = trapModalBack(() => { ov.remove(); resolve(resultado); });

    const desenhar = () => {
      ov.querySelector('.tr-modal').innerHTML = `
        <div class="modal-title">${esc(cat?.icon || '💪')} O que você fez hoje?</div>
        <div class="tr-dica">Pode marcar mais de um.</div>
        <div class="pt-chips tr-mods">
          ${MODALIDADES.map(m => `<button type="button" class="pt-chip ${mods.has(m.k) ? 'sel' : ''}" data-mod="${m.k}">${m.ic} ${m.nome}</button>`).join('')}
        </div>
        ${mods.has('musculacao') ? `
          <div class="tr-q">Quais músculos você treinou?</div>
          ${plano.length ? '<div class="tr-dica">Fez menos do que o planejado? Desmarque o que ficou faltando: conta igual pra constância e fica anotado.</div>' : ''}
          ${[...GRUPOS_MUS, { tit: 'Extra', mus: [CARDIO] }].map(g => `
            <div class="pt-mus-grupo">${g.tit}</div>
            <div class="pt-chips">${g.mus.map(m => `<button type="button" class="pt-chip mini tr-mus ${sel.has(m.k) ? 'sel' : ''}" data-m="${m.k}">${m.nome}</button>`).join('')}</div>`).join('')}
          <div class="tr-series"></div>` : ''}
        <div class="modal-actions">
          <button class="btn-secondary" data-pular type="button">Pular</button>
          <button class="btn-primary" data-ok type="button" ${mods.size ? '' : 'disabled'}>Pronto</button>
        </div>`;
      ov.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => {
        const k = b.dataset.mod;
        if (mods.has(k)) mods.delete(k); else mods.add(k);
        desenhar();
      });
      // Exercícios de cada músculo marcado (opcional): + Exercício abre os mais
      // usados; "Ver todos" mostra a lista inteira; dá pra escrever outro.
      const pintarSeries = () => {
        const box = ov.querySelector('.tr-series');
        if (!box) return;
        const ks = [...sel].filter(k => k !== 'cardio');
        const inp = (i, campo, ph, max, x) => `<input type="number" inputmode="${campo === 'kg' ? 'decimal' : 'numeric'}" min="0" max="${max}" step="${campo === 'kg' ? '0.5' : '1'}" data-i="${i}" data-c="${campo}" value="${x[campo] ?? ''}" placeholder="${ph}">`;
        box.innerHTML = ks.length ? `
          <div class="tr-q">Exercícios <span class="ag-lbl-opt">(opcional)</span></div>
          <div class="tr-dica">Séries × repetições e a carga em kg.</div>
          ${ks.map(k => {
            const meus = exercicios.map((x, i) => ({ x, i })).filter(o => o.x.m === k);
            const usados = new Set(meus.map(o => o.x.nome));
            const lista = (EXERCICIOS[k] || []).filter(e => !GENERICOS.has(e.nome) && !usados.has(e.nome));
            const rec = _recentes(k);
            const curtos = [...lista.filter(e => rec.includes(e.nome)).sort((a, b) => rec.indexOf(a.nome) - rec.indexOf(b.nome)), ...lista.filter(e => e.top && !rec.includes(e.nome))].slice(0, 6);
            const mostra = todosEm === k ? lista : curtos;
            return `<div class="tr-mus-bloco">
              <div class="tr-mus-cab"><b>${esc(nomeMusculo(k))}</b>
                <button type="button" class="tr-add" data-add="${k}">${abertoEm === k ? 'Fechar' : '+ Exercício'}</button></div>
              ${abertoEm === k ? `<div class="tr-pick">
                <div class="pt-chips">${mostra.map(e => `<button type="button" class="pt-chip mini" data-ex="${k}" data-nome="${esc(e.nome)}">${esc(e.nome)}</button>`).join('')}
                  ${lista.length > curtos.length ? `<button type="button" class="pt-chip mini tr-todos" data-todos="${k}">${todosEm === k ? 'Menos ▴' : 'Ver todos ▾'}</button>` : ''}</div>
                <div class="tr-outro"><input type="text" maxlength="40" data-outro="${k}" placeholder="Outro: escreve o nome"><button type="button" class="pt-chip mini" data-outro-ok="${k}">Adicionar</button></div>
              </div>` : ''}
              ${meus.map(({ x, i }) => `<div class="tr-ex-linha">
                <span>${esc(nomeExibido(x.nome))}${x.parte ? ` <small>${esc(ROTULO_PARTE[x.parte])}</small>` : ''}</span>
                ${inp(i, 's', 'sér', 20, x)}<b>x</b>${inp(i, 'r', 'rep', 100, x)}${inp(i, 'kg', x.corpo ? 'corpo' : 'kg', 999, x)}
                <button type="button" class="tr-del" data-del="${i}" aria-label="Tirar">✕</button></div>`).join('')}
              ${!meus.length && series[k] ? `<div class="tr-serie-linha"><span>Séries do músculo</span>
                <input type="number" inputmode="numeric" min="1" max="20" data-s="${k}" value="${series[k]?.s || ''}" placeholder="séries"><b>x</b>
                <input type="number" inputmode="numeric" min="1" max="100" data-r="${k}" value="${series[k]?.r || ''}" placeholder="reps"></div>` : ''}
            </div>`;
          }).join('')}` : '';
        const add = (k, nome) => {
          exercicios.push({ m: k, nome, ...(CORPO.has(nome) ? { corpo: true } : {}) });
          _lembrarRecente(k, nome);
          abertoEm = null; todosEm = null;
          pintarSeries();
          // já pronto pra digitar as séries do que acabou de entrar
          box.querySelector(`[data-i="${exercicios.length - 1}"][data-c="s"]`)?.focus();
        };
        box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { abertoEm = abertoEm === b.dataset.add ? null : b.dataset.add; todosEm = null; pintarSeries(); });
        box.querySelectorAll('[data-todos]').forEach(b => b.onclick = () => { todosEm = todosEm === b.dataset.todos ? null : b.dataset.todos; pintarSeries(); });
        box.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => add(b.dataset.ex, b.dataset.nome));
        box.querySelectorAll('[data-outro-ok]').forEach(b => b.onclick = () => {
          const v = box.querySelector(`[data-outro="${b.dataset.outroOk}"]`)?.value.trim();
          if (v) add(b.dataset.outroOk, v.charAt(0).toUpperCase() + v.slice(1));
        });
        box.querySelectorAll('[data-outro]').forEach(i => i.onkeydown = (e) => { if (e.key === 'Enter') box.querySelector(`[data-outro-ok="${i.dataset.outro}"]`)?.click(); });
        box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { exercicios.splice(Number(b.dataset.del), 1); pintarSeries(); });
        box.querySelectorAll('[data-i]').forEach(i => i.oninput = () => {
          const x = exercicios[Number(i.dataset.i)], c = i.dataset.c;
          const v = c === 'kg' ? Math.round((Number(String(i.value).replace(',', '.')) || 0) * 10) / 10 : Math.round(Number(i.value) || 0);
          if (v) x[c] = v; else delete x[c];
          if (c === 'kg' && v) { delete x.corpo; delete x.kgCorpo; }
        });
        box.querySelectorAll('[data-s],[data-r]').forEach(i => i.oninput = () => {
          const k = i.dataset.s || i.dataset.r, v = Math.round(Number(i.value) || 0);
          series[k] = { ...(series[k] || {}), [i.dataset.s ? 's' : 'r']: v || undefined };
        });
      };
      pintarSeries();
      ov.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        const k = b.dataset.m;
        if (sel.has(k)) { sel.delete(k); exercicios = exercicios.filter(x => x.m !== k); } else sel.add(k);
        b.classList.toggle('sel', sel.has(k));
        pintarSeries();
      });
      ov.querySelector('[data-pular]').onclick = () => close();
      ov.querySelector('[data-ok]').onclick = () => {
        // As modalidades, os músculos e as séries viram a descrição da tarefa (Élton)
        resultado = patchTreino({ modalidades: [...mods], musculos: [...sel], series, exercicios, plano, pesoKg: _pesoCorpo });
        close();
      };
    };
    desenhar();
  });
}

function _popupLeitura(cat, task) {
  return new Promise((resolve) => {
    const minimo = Math.max(0, Number(cat?.minimoPaginas) || 0);
    const ov = _modal(`
      <div class="modal-title">${esc(cat?.icon || '📚')} Quantas páginas você leu?</div>
      ${minimo ? `<div class="tr-dica">Seu mínimo é ${minimo} página${minimo > 1 ? 's' : ''} por dia. Leu menos? Conta igual pra constância.</div>` : ''}
      <label class="input-field"><div class="input-field-label">Páginas</div>
        <input id="tr-pag" type="number" inputmode="numeric" min="1" max="2000" value="${Number(task?.paginas) || ''}" placeholder="Ex.: 10"></label>
      <div class="modal-actions">
        <button class="btn-secondary" data-pular type="button">Pular</button>
        <button class="btn-primary" data-ok type="button">Pronto</button>
      </div>`);
    let resultado = {};
    const close = trapModalBack(() => { ov.remove(); resolve(resultado); });
    setTimeout(() => ov.querySelector('#tr-pag')?.focus(), 60);
    ov.querySelector('[data-pular]').onclick = () => close();
    ov.querySelector('[data-ok]').onclick = () => {
      const n = Math.round(Number(ov.querySelector('#tr-pag').value) || 0);
      if (n > 0) {
        const falta = minimo - n;
        resultado = {
          patch: { paginas: n, ...(task?.desc ? {} : { desc: `${n} página${n > 1 ? 's' : ''}` }) },
          msg: falta > 0 ? `Boa constância! Só faltou ${falta} página${falta > 1 ? 's' : ''} hoje.` : null,
        };
      }
      close();
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: CONSTÂNCIA POR MÚSCULO
// ═══════════════════════════════════════════════════════════════
const SEMANAS = 8;
const _seg = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const _idDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Por músculo: meta da semana (Preparo Físico), feitos nesta semana, última vez
// e semanas seguidas sem treinar. Também as modalidades das últimas semanas.
export async function constanciaPorMusculo(hoje = new Date()) {
  const ini = _seg(hoje); ini.setDate(ini.getDate() - 7 * (SEMANAS - 1));
  const [dias, profile] = await Promise.all([fetchDaysRange(ini, hoje), getProfile().catch(() => ({}))]);
  const pt = getPerfilTreino(profile);
  const segAtual = _idDia(_seg(hoje));
  const porMus = new Map(MUSCULOS.map(m => [m.k, { k: m.k, nome: m.nome, meta: pt.freqPorMusculo[m.k] ?? 0, semana: 0, ultimo: null, faltas: 0 }]));
  const modalidades = new Map();
  let registros = 0;
  for (const d of dias) {
    for (const t of d.tasks || []) {
      if (!t.done || !t.treino) continue;
      registros++;
      for (const md of t.treino.modalidades || (t.treino.modalidade ? [t.treino.modalidade] : [])) modalidades.set(md, (modalidades.get(md) || 0) + 1);
      for (const k of t.treino.musculos || []) {
        const m = porMus.get(k); if (!m) continue;
        if (!m.ultimo || d.id > m.ultimo) m.ultimo = d.id;
        if (_idDia(_seg(new Date(d.id + 'T12:00:00'))) === segAtual) m.semana++;
      }
      for (const k of t.treino.faltou || []) { const m = porMus.get(k); if (m) m.faltas++; }
    }
  }
  for (const m of porMus.values()) {
    m.semanasSem = m.ultimo
      ? Math.floor((_seg(hoje) - _seg(new Date(m.ultimo + 'T12:00:00'))) / (7 * 864e5))
      : null;   // null = nada registrado nas últimas 8 semanas
  }
  return { musculos: [...porMus.values()], modalidades, registros, semanas: SEMANAS };
}

// Frase do Pet pra "como tá meu treino?" (Élton, 26/10)
export function textoTreino(c) {
  if (!c.registros) return 'Ainda não tenho treino registrado com os músculos 🤔 Quando marcar a atividade física no Ritual, me diz o que tu treinou e eu acompanho cada músculo.';
  const atrasados = c.musculos.filter(m => m.meta > 0 && (m.semanasSem == null || m.semanasSem >= 2));
  const luta = (c.modalidades.get('luta') || 0) + (c.modalidades.get('corrida') || 0) > 0;
  const linhas = [];
  // Perna junta: "faz 2 semanas que tu não treina perna"
  const PERNA = ['quadriceps', 'posterior', 'gluteo', 'panturrilha'];
  const pernaAtras = atrasados.filter(m => PERNA.includes(m.k));
  if (pernaAtras.length >= 3) {
    const sem = Math.max(...pernaAtras.map(m => m.semanasSem ?? c.semanas));
    let f = `Cara, já faz ${sem >= c.semanas ? `mais de ${c.semanas}` : sem} semanas que tu não treina perna.`;
    if (luta && pernaAtras.some(m => m.k === 'panturrilha')) f += ' Pra ti que faz luta e já trabalha bastante a panturrilha, pelo menos quadríceps e posterior da coxa tem que fazer.';
    linhas.push(f);
  }
  for (const m of atrasados) {
    if (pernaAtras.length >= 3 && PERNA.includes(m.k)) continue;
    linhas.push(m.semanasSem == null ? `${m.nome}: nada registrado nas últimas ${c.semanas} semanas.` : `${m.nome}: ${m.semanasSem} semanas sem treinar.`);
  }
  const emDia = c.musculos.filter(m => m.meta > 0 && m.semana >= m.meta).map(m => m.nome);
  const faltas = c.musculos.filter(m => m.faltas > 0).sort((a, b) => b.faltas - a.faltas).slice(0, 3);
  let msg = '💪 <strong>Teu treino</strong><br>' + (linhas.length ? linhas.join('<br>') : 'Tudo em dia com a frequência que tu definiu no Preparo Físico 👏');
  if (emDia.length) msg += `<br><small>Nesta semana já bateu: ${emDia.join(', ')}.</small>`;
  if (faltas.length) msg += `<br><small>Mais deixado pra trás: ${faltas.map(m => `${m.nome} (${m.faltas}x)`).join(', ')}.</small>`;
  return msg;
}
