// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Desafios: entende pedidos sobre a aba Desafios da Comunidade.
// Só INTERPRETA e faz as contas (sem banco, sem DOM). Quem lê e grava é o
// assistente-ia.js (BLOCO 8.17), sempre depois do card de confirmação.
// ATENÇÃO: quando a tela de Desafios mudar (tela-desafios.js / desafios.js),
// conferir se isto aqui e o BLOCO 8.17 continuam batendo com ela.
// BLOCO 1 — NORMALIZAÇÃO E MOLDES
// BLOCO 2 — PEDIDO (ação, desafio citado, quantidade, código)
// BLOCO 3 — ACHAR O DESAFIO
// BLOCO 4 — QUANTIDADE NA UNIDADE DO DESAFIO
// BLOCO 5 — RANKING (mesma conta da tela)
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NORMALIZAÇÃO E MOLDES
// ═══════════════════════════════════════════════════════════════
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9,. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Palavras que apontam pra um molde (o "tipo" salvo no desafio)
const MOLDE_RE = [
  ['agua', /\b(agua|beb\w*|tom\w* agua|litros?|ml|hidrat\w*|garraf\w*|copos?)\b/],
  ['exercicio', /\b(exercicios?|exercitar|treino|treinar|treinei|flex(oes|ao)|abdomin\w*)\b/],
  ['flexibilidade', /\b(along\w*|flexibilidade)\b/],
  ['meditacao', /\b(medit\w*)\b/],
  ['corrida', /\b(corr\w*|km|quilometros?)\b/],
  ['leitura', /\b(leitura|ler|li|paginas?|livros?)\b/],
  ['autoconhecimento', /\b(autoconhecimento|reflex\w*|refleti)\b/],
];
export function moldeDaFrase(texto) {
  const t = norm(texto);
  const m = MOLDE_RE.find(([, re]) => re.test(t));
  return m ? m[0] : null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PEDIDO
// ═══════════════════════════════════════════════════════════════
const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cem: 100, duzentos: 200, trezentos: 300, quinhentos: 500 };
const NUM_RE = '(\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta|cinquenta|cem|duzentos|trezentos|quinhentos)';
const numDe = (s) => NUM[s] ?? Number(String(s).replace(',', '.'));

// Código de convite: 4 a 8 letras/números ("código 7K2PQR", "o código é abc123")
function codigoDaFrase(texto) {
  const m = String(texto || '').match(/c[oó]digo\s+(?:é\s+|e\s+|:\s*)?([a-z0-9]{4,8})\b/i);
  if (!m) return null;
  const c = m[1];
  // com número, ou 6 letras que não sejam palavra ("código dele", "código do amigo")
  if (/\d/.test(c) || (c.length === 6 && !/^(amigos?|desafi|convit|deles?|delas?|aquele|daquel)/i.test(c))) return c.toUpperCase();
  return null;
}

// { acao: 'ver'|'ranking'|'entrar'|'codigo'|'sair'|'checkin'|'criar'|'regras'|'corrida_ajuda',
//   codigo, qtd, molde, dias, modalidade, feitoHoje, metaToda, nome, exercicios, maxPorDia } ou null.
// Só entra quando a frase fala em "desafio" (ou num código de convite, ou em
// como registrar a corrida / Strava).
export function lerDesafio(texto) {
  const t = norm(texto);
  const codigo = codigoDaFrase(texto);
  const temDesafio = /\bdesafios?\b/.test(t);
  // "manda o print da corrida": vídeo já gravado, falta o print
  if (/\bprint\b/.test(t) && /\b(corrida|strava|desafio)\b/.test(t)) return { acao: 'print' };
  // "como registro a corrida?", "abre o strava", "correr com o falcon"
  if (/\bstrava\b|\bcorrer com o falcon\b/.test(t)
    || (/\bcorrida\b/.test(t) && /\b(como|passo a passo|explica|ensina)\b/.test(t) && /\b(registr\w*|grav\w*|fa[zc]\w*|comprov\w*|prova|mand\w*)\b/.test(t))) {
    return { acao: 'corrida_ajuda', abrir: /\b(abr\w*|bora|vou correr|correr com)\b/.test(t) && !/\bcomo\b/.test(t) };
  }
  if (!temDesafio && !(codigo && /\b(entr\w*|participa\w*|convite)\b/.test(t))) return null;
  // "abre os desafios" / "vai pros desafios": só abrir a tela (Config cuida)
  if (/^(abr\w*|vai|ir|leva|mostra a tela)\s+(?:a\s+tela\s+)?(?:d?[aoe]s?\s+|pr[ao]s?\s+)?desafios?$/.test(t)) return null;

  const molde = moldeDaFrase(t.replace(/\bdesafios?\b/g, ' '));
  const qtd = lerQuantidade(t);
  const base = { codigo, qtd, molde, dias: null, modalidade: null, feitoHoje: false, metaToda: false, nome: nomeCitado(texto) };

  if (/\b(regras?|pode e o que nao pode|o que (?:nao )?pode)\b/.test(t) && !/\b(cri\w*|mud\w*|coloc\w*|bot\w*|adicion\w*)\b/.test(t)) return { ...base, acao: 'regras' };
  if (/\b(cri\w*|mont\w*|novo desafio|comec\w* um desafio|faz\w* um desafio|abr\w* um desafio)\b/.test(t) && !/\b(criei|criou|criado|criada|criaram)\b/.test(t)) {
    const d = t.match(new RegExp(`\\b${NUM_RE}\\s*dias?\\b`));
    const pd = t.match(new RegExp(`\\b${NUM_RE}\\s*(?:exercicios?\\s*)?por dia\\b`));
    const exercicios = molde === 'exercicio' || molde === null ? exerciciosDaFrase(texto) : [];
    const modalidade = /\b(amig\w*|galera|grupo|turma|familia|convid\w*|junto)\b/.test(t) ? 'amigos'
      : /\b(sozinh\w*|so meu|so pra mim|individual|so eu)\b/.test(t) ? 'individual' : null;
    // "de 3 litros por dia" vira a meta; sem número fica a do molde
    const metaDita = qtd;
    return { ...base, acao: 'criar', dias: d ? numDe(d[1]) : null, modalidade, qtd: pd ? null : metaDita,
      exercicios, maxPorDia: pd ? numDe(pd[1]) : null, molde: exercicios.length ? 'exercicio' : molde };
  }
  if (codigo) return { ...base, acao: 'codigo' };
  if (/\b(sai|saia|sair|saio|desist\w*|larg\w*|abandon\w*|me tira)\b/.test(t)) return { ...base, acao: 'sair' };
  if (/\b(ranking|posicao|colocacao|lugar|placar|quem (ta|esta) (ganhando|na frente|liderando)|lideran\w*|em primeiro)\b/.test(t)) return { ...base, acao: 'ranking' };
  if (/\b(entra|entrar|entre|participar|participa|me inscreve\w*|inscrever|aceito|topo|bora entrar|quero (?:entrar|fazer|participar))\b/.test(t)
    && !/\b(entrei|participo|participando|tou|estou)\b/.test(t)) return { ...base, acao: 'entrar' };
  const verboFeito = /\b(bebi|tomei|fiz|li|corri|meditei|alonguei|refleti|treinei|cumpri|bati|complet\w*|conclui|marc\w*|registr\w*|adicion\w*|soma\w*|bot\w*|poe|coloc\w*|anot\w*|lanc\w*|feito|check ?in)\b/.test(t);
  if (verboFeito || qtd) {
    return { ...base, acao: 'checkin', feitoHoje: true, metaToda: /\b(bati|cumpri|complet\w*|fechei|conclui)\b.*\bmeta\b|\bmeta\b.*\b(batida|completa|cumprida)\b/.test(t) };
  }
  return { ...base, acao: 'ver' };
}

// "desafio de exercício com flexão, abdominal, agachamento e corrida, 2 por dia"
// → ['Flexão', 'Abdominal', 'Agachamento', 'Corrida'] (até 5)
export function exerciciosDaFrase(texto) {
  const m = String(texto || '').match(/exerc[ií]cios?\b[^,]*?\b(?:com|:|sendo)\s*(.+)$/i);
  if (!m) return [];
  let s = ' ' + m[1] + ' ';
  s = s.replace(/\s(?:com|pra|para)\s+(?:os\s+|as\s+|a\s+|o\s+|meus\s+|minha\s+)?(?:amig\w*|galera|grupo|turma|fam[ií]lia)\b.*$/i, ' ')
    .replace(/\s(?:s[oó]\s+meu|sozinh\w*|individual)\b.*$/i, ' ')
    .replace(/[,\s]+(?:de|por|em|durante)\s+\S+\s+dias?\b.*$/i, ' ')
    .replace(/[,\s]+(?:no\s+m[aá]ximo\s+)?\S+\s+(?:exerc[ií]cios?\s+)?por\s+dia\b.*$/i, ' ');
  const out = [];
  for (const p of s.split(/\s*(?:,|;|\be\b|\+)\s*/i)) {
    const x = p.replace(/^\s*(?:o|a|os|as|um|uma)\s+/i, '').replace(/[.!?]+$/, '').trim();
    if (!x || x.length > 40) continue;
    const nome = /^corrid|^correr/i.test(x) ? 'Corrida' : x.charAt(0).toUpperCase() + x.slice(1);
    if (!out.some(y => norm(y) === norm(nome))) out.push(nome);
  }
  return out.slice(0, 5);
}

// Qual exercício da lista do desafio a frase cita ("fiz a flexão" → "Flexão")
export function exercicioCitado(lista, texto) {
  const t = norm(texto);
  const ws = t.split(' ');
  return (lista || []).find(ex => {
    const e = norm(ex);
    if (!e) return false;
    if (t.includes(e)) return true;
    if (e === 'corrida' && /\b(corri|correr|corrida)\b/.test(t)) return true;
    const raiz = e.split(' ')[0].slice(0, 5);
    return raiz.length >= 4 && ws.some(w => w.startsWith(raiz));
  }) || null;
}

// O que a pessoa chamou o desafio: "desafio da água" → "água", "desafio Beber 2L" → "Beber 2L"
function nomeCitado(texto) {
  const m = String(texto || '').match(/desafios?\s+(?:d[aoe]s?\s+|chamado\s+)?(.+?)(?=\s*(?:[,.!?;]|\bcom\b|\bhoje\b|\bontem\b|\bcomo\b|\bpra\b|\bpara\b|\bque\b|\bde\s+\d|\bpor\s+dia|\bt[aá]\b|\bestou\b|\bt[ôo]\b|\bsozinh\w*|\beu\b|\bno\b|\bna\b|\b(?:por|em|durante)\s+\S+\s+dias?\b|\bdurante\b|$))/i);
  if (!m) return null;
  const s = m[1].replace(/^(o|a|os|as|meu|minha|esse|essa|novo|nova)\s+/i, '').trim();
  return s && !/^(meu|minha|esse|isso|que|qual|quais|em|e|eu)$/i.test(s) && !/^(com|que|eu|pra|para|no|na|sozinh\w*)\b/i.test(s) ? s : null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ACHAR O DESAFIO
// ═══════════════════════════════════════════════════════════════
const VAZIAS = new Set('a o as os de do da dos das no na nos nas em pra para por com e meu minha desafio desafios dia hoje'.split(' '));
// Melhores desafios pra frase: pelo tipo (molde) e pelas palavras do título.
// [] = nenhum citado (quem chama decide: se só tem um, é ele).
export function acharDesafio(lista, texto) {
  const t = norm(texto);
  const molde = moldeDaFrase(t.replace(/\bdesafios?\b/g, ' '));
  const ws = t.split(' ').filter(w => w.length >= 3 && !VAZIAS.has(w));
  const bate = (w, doTit) => doTit.some(d => d === w || (w.length >= 4 && d.length >= 4 && (d.startsWith(w.slice(0, 5)) || w.startsWith(d.slice(0, 5)))));
  const notas = lista.map(d => {
    const doTit = norm(d.titulo).split(' ').filter(w => w.length >= 3 && !VAZIAS.has(w));
    let n = ws.filter(w => bate(w, doTit)).length * 2;
    if (molde && d.tipo === molde) n += 3;
    if (Array.isArray(d.exercicios) && exercicioCitado(d.exercicios, t)) n += 3;
    return { d, n };
  }).filter(o => o.n > 0).sort((a, b) => b.n - a.n);
  if (!notas.length) return [];
  return notas.filter(o => o.n === notas[0].n).map(o => o.d);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: QUANTIDADE
// ═══════════════════════════════════════════════════════════════
// "bebi meio litro" → { n: 0.5, un: 'l' } ; "li 20 páginas" → { n: 20, un: 'pag' }
export function lerQuantidade(t) {
  t = norm(t);
  if (/\bmeio litro\b/.test(t)) return { n: 0.5, un: 'l', dito: 'meio litro' };
  if (/\bmeia hora\b/.test(t)) return { n: 30, un: 'min', dito: 'meia hora' };
  // o primeiro número que não seja de dias ("desafio de 30 dias com 3 litros" → 3 litros)
  const re = new RegExp(`\\b${NUM_RE}\\s*(ml|mls|mililitros?|l|lt|litros?|min|mins|minutos?|h|horas?|km|kms|quilometros?|pag|paginas?|exercicios?|series?|copos?|garrafas?|garrafinhas?|reflex\\w*|vez|vezes|dias?|semanas?|mes|meses)?\\b`, 'g');
  // "um desafio", "uma vez": número por extenso sem unidade não é quantidade
  const m = [...t.matchAll(re)].find(x => !/^(dias?|semanas?|mes|meses)$/.test(x[2] || '') && (x[2] || /\d/.test(x[1])));
  if (!m) return null;
  const n = numDe(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2] || '';
  const un = /^(ml|mls|mililitro)/.test(u) ? 'ml' : /^(l|lt|litro)/.test(u) ? 'l' : /^min/.test(u) ? 'min'
    : /^(h|hora)/.test(u) ? 'h' : /^(km|quilomet)/.test(u) ? 'km' : /^pag/.test(u) ? 'pag'
    : /^copo/.test(u) ? 'copo' : /^garraf/.test(u) ? 'garrafa' : /^dia/.test(u) ? 'dia' : u ? 'un' : '';
  return { n, un, dito: m[0] };
}

// Converte o que foi dito pra unidade do desafio (ml, min, km...). null = não dá pra saber.
export function naUnidade(q, unidade) {
  if (!q) return null;
  const u = norm(unidade);
  if (q.un === 'dia') return null;
  if (u === 'ml') {
    if (q.un === 'l') return Math.round(q.n * 1000);
    if (q.un === 'copo') return Math.round(q.n * 250);
    if (q.un === 'garrafa') return Math.round(q.n * 500);
    if (q.un === 'ml' || (!q.un && q.n >= 50)) return Math.round(q.n);
    if (!q.un && q.n < 10) return Math.round(q.n * 1000);   // "bebi 2" = 2 litros
    return null;
  }
  if (u === 'l' || /^litro/.test(u)) return q.un === 'ml' ? q.n / 1000 : q.n;
  if (u === 'min' || /^minut/.test(u)) return q.un === 'h' ? Math.round(q.n * 60) : Math.round(q.n);
  return Math.round(q.n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: RANKING
// ═══════════════════════════════════════════════════════════════
// Igual ao _ranking da tela: um dia conta quando bateu a meta (ou teve
// qualquer check-in, se o desafio não tem meta). Mais dias = mais pra cima.
export function ranking(desafio, parts, checks) {
  const byUser = {};
  checks.forEach(c => {
    (byUser[c.user_id] ||= {});
    byUser[c.user_id][c.dia] = (byUser[c.user_id][c.dia] || 0) + (c.quantidade || 0);
  });
  const meta = desafio.meta_diaria;
  return parts.map(p => {
    const days = byUser[p.user_id] || {};
    let done = 0;
    for (const d in days) if (meta ? days[d] >= meta : days[d] > 0) done++;
    return { user_id: p.user_id, nome: p.nome || 'Falcão', done };
  }).sort((a, b) => b.done - a.done);
}

// Quanto a pessoa já fez hoje no desafio
export function somaHoje(checks, uid, hoje) {
  return checks.filter(c => c.user_id === uid && c.dia === hoje).reduce((s, c) => s + (c.quantidade || 0), 0);
}
