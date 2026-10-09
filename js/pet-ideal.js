// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Ideal (os 6 pilares): entende pedidos sobre o "Organizando meu ideal".
// Só INTERPRETA (sem banco, sem DOM). Quem grava é o assistente-ia.js
// (BLOCO 8.15), sempre depois do card de confirmação.
// BLOCO 1 — NORMALIZAÇÃO E PILARES
// BLOCO 2 — PEDIDO (ação, pilar, item, vezes)
// BLOCO 3 — ACHAR O ITEM
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NORMALIZAÇÃO E PILARES
// ═══════════════════════════════════════════════════════════════
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Nome falado → chave do pilar (as mesmas de PILARES no ideal-ui.js)
const PILAR_RE = [
  ['corpo', /\b(fisico|corpo)\b/],
  ['mente', /\b(mental|mente)\b/],
  ['emocional', /\bemocional\b/],
  ['espiritual', /\bespiritual\b/],
  ['financeiro', /\b(financeiro|profissional|proposito|dinheiro|carreira)\b/],
  ['social', /\b(social|lazer)\b/],
];
export function pilarDaFrase(texto) {
  const t = norm(texto);
  const p = PILAR_RE.find(([, re]) => re.test(t));
  return p ? p[0] : null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PEDIDO
// ═══════════════════════════════════════════════════════════════
const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

// { acao: 'ver'|'marcar'|'desmarcar'|'atividade'|'constancia', pilar, itens:[txt], vezes, periodo } ou null.
// Só entra quando a frase fala em "ideal" ou "pilar": o resto é agenda/lista.
export function lerIdeal(texto) {
  const t = norm(texto);
  if (!/\b(ideal|pilar|pilares)\b/.test(t)) return null;
  // "meu peso ideal", "horário ideal": não é o Ideal dos pilares
  if (/\b(peso|horario|hora|sono|agua|treino)\s+ideal\b/.test(t)) return null;
  let acao;
  const verboLevar = /\b(vir\w*|transform\w*|coloc\w*|bot\w*|poe|pass\w*|mand\w*|adicion\w*|cri\w*|lev\w*|faz\w*)\b/.test(t);
  if (/\b(atividades?|home)\b/.test(t) && verboLevar) acao = 'atividade';
  else if (/\b(constancia|foco|acompanh\w*)\b/.test(t)) acao = 'constancia';
  else if (/\b(desmarc\w*|tir\w*|remov\w*|apag\w*|exclu\w*)\b/.test(t)) acao = 'desmarcar';
  else if (/\b(marc\w*|adicion\w*|coloc\w*|bot\w*|poe|inclu\w*|acrescent\w*|anot\w*|add|quero)\b/.test(t)) acao = 'marcar';
  else acao = 'ver';

  const v = t.match(/\b(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:x|vezes?|dias?)\s*(?:por|na|no|ao|a cada)\s+(semana|mes)\b/);
  const vezes = v ? (Number(v[1]) || NUM[v[1]] || null) : null;
  return {
    acao,
    pilar: pilarDaFrase(texto),
    itens: acao === 'ver' ? [] : itensDaFrase(texto),
    vezes,
    periodo: v ? (v[2] === 'mes' ? 'mês' : 'semana') : null,
  };
}

// O que sobra da frase depois de tirar o pedido, o "ideal/pilar", o destino e as vezes.
// "marca ler e meditar no meu ideal mental" → ["ler", "meditar"]
export function itensDaFrase(texto) {
  let s = ' ' + String(texto || '').replace(/["“”]/g, ' ') + ' ';
  s = s.replace(/^\s*(?:(?:eu|olha|pet|falcon|por favor|pfv)[\s,]+)*/i, ' ')
    .replace(/^\s*(?:pode|podes|quero que|queria que|preciso que)\s+(?:tu\s+|voc[eê]\s+)?(?:me\s+)?/i, ' ')
  // "quero acompanhar a constância de ler": tira os verbos em sequência
  for (let i = 0; i < 3; i++) s = s
    .replace(/^\s*(?:a\s+|o\s+)?(?:constância|constancia|foco)\s+(?:d[aoe]s?\s+)?/i, ' ')
    .replace(/^\s*(?:transform\w*|coloc\w*|bot\w*|p[õo]e|pass\w*|mand\w*|adicion\w*|marc\w*|desmarc\w*|tir\w*|remov\w*|apag\w*|exclu\w*|inclu\w*|acrescent\w*|anot\w*|add|quero|cri\w*|lev\w*|faz\w*|acompanh\w*)\s+/i, ' ');
  s = s
    // destino / origem: "no meu ideal mental", "do ideal", "no pilar físico"
    .replace(/\s(?:n[oa]s?|d[oa]s?|pr[oa]|para|ao|em)\s+(?:meu\s+|minha\s+)?(?:ideal|pilar(?:es)?)(?:\s+(?:d[oa]\s+)?(?:f[ií]sico|corpo|mental|mente|emocional|espiritual|financeiro(?:\s*(?:&|e)\s*profissional)?|profissional|social(?:\s*(?:&|e)\s*lazer)?|lazer))?(?=[\s,.!?])/gi, ' ')
    .replace(/\s(?:meu\s+)?ideal\s/gi, ' ')
    .replace(/\s(?:n[ao]s|pras?|para\s+as|como|em|numa?|uma?)\s+(?:minhas?\s+)?atividades?(?:\s+da\s+home)?(?=[\s,.!?])/gi, ' ')
    .replace(/\s(?:n[ao]|pra|para\s+a)\s+home(?=[\s,.!?])/gi, ' ')
    .replace(/\s(?:vir\w*|vai\s+virar)\s*(?=[\s,.!?])/gi, ' ')
    .replace(/\s(?:com|em|pra|para|e)\s+(?:a\s+)?(?:constância|constancia|foco)(?=[\s,.!?])/gi, ' ')
    .replace(/\s(?:\d{1,2}|uma?|duas|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:x|vezes?|dias?)\s*(?:por|na|no|ao|a cada)\s+(?:semana|m[eê]s)(?=[\s,.!?])/gi, ' ')
    .replace(/\s(?:como|de)\s+(?:marcad[oa]|importante)(?=[\s,.!?])/gi, ' ');
  const vistos = new Set(), out = [];
  for (const p of s.split(/\s*(?:,|;|\be\b|\btamb[eé]m\b)\s*/i)) {
    const item = p.replace(/^\s*(?:o|a|os|as|um|uma|item|itens)\s+/i, '').replace(/^[\s,.:;-]+|[\s,.:;!?-]+$/g, '').trim();
    const k = norm(item);
    if (k && !vistos.has(k) && !/^(meu|minha|isso|esse|essa|aqui|ai|la)$/.test(k)) { vistos.add(k); out.push(item); }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ACHAR O ITEM
// ═══════════════════════════════════════════════════════════════
const VAZIAS = new Set('a o as os de do da dos das no na nos nas em pra para por com e meu minha mais'.split(' '));
// Melhores itens do Ideal pro texto dito. Igual vence; senão, todas as palavras
// ditas no item (com radical: "meditação" acha "Meditar"). [] = nada parecido.
export function acharItemIdeal(lista, dito) {
  const alvo = norm(dito);
  if (!alvo) return [];
  const iguais = lista.filter(x => norm(x.txt) === alvo);
  if (iguais.length) return iguais;
  const ws = alvo.split(' ').filter(w => w && !VAZIAS.has(w));
  if (!ws.length) return [];
  const bate = (w, doItem) => doItem.some(d => d === w || (w.length >= 4 && d.length >= 4 && (d.startsWith(w.slice(0, 5)) || w.startsWith(d.slice(0, 5)))));
  const notas = lista.map(x => {
    const doItem = norm(x.txt).split(' ');
    const n = ws.filter(w => bate(w, doItem)).length;
    return { x, n, todas: n === ws.length };
  }).filter(o => o.todas).sort((a, b) => norm(a.x.txt).length - norm(b.x.txt).length);
  return notas.map(o => o.x);
}
