// ─── ÍNDICE ──────────────────────────────────────────────────
// Desempenho e objetivos pelo Pet (etapa 3 do "Pet faz tudo").
// Só funções puras (sem banco, sem DOM): quem busca os dias, grava e mostra
// o card é o assistente-ia.js (BLOCO 8.14). As contas seguem as da tela
// Desempenho (tela-desempenho.js) pra o Pet nunca dizer um número diferente.
// BLOCO 1 — PERÍODO DITO NA FRASE
// BLOCO 2 — CONSULTAS DE DESEMPENHO (geral, por atividade, recorde, sono)
// BLOCO 3 — REFLEXÃO DA SEMANA
// BLOCO 4 — OBJETIVOS (ver, criar, mudar, apagar)
// BLOCO 5 — CONTAS (sono médio, melhor mês)
// ─────────────────────────────────────────────────────────────

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const semPedido = (s) => String(s || '').trim()
  .replace(/^(?:(?:eu|olha|entao|então|ai|aí|tipo|por favor|pfv|falcon)[\s,]+)*/i, '')
  .replace(/^(?:pode|podes|consegue|tem como|d[aá] pra|preciso que|quero que|queria que)\s+(?:tu\s+|voc[eê]\s+|vc\s+)?(?:me\s+)?/i, '')
  .trim();
const NUM = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30 };
const numero = (w) => /^\d+$/.test(w) ? Number(w) : NUM[w];

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PERÍODO DITO NA FRASE
// ═══════════════════════════════════════════════════════════════
// { ini, fim, rotulo, chave } — semana começa na segunda (igual Objetivos)
export function periodoDaFrase(t, agora = new Date(), padrao = 'mes') {
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const seg = new Date(hoje); seg.setDate(seg.getDate() - ((hoje.getDay() + 6) % 7));
  const mes = (n) => ({ ini: new Date(hoje.getFullYear(), hoje.getMonth() + n, 1), fim: n ? new Date(hoje.getFullYear(), hoje.getMonth() + n + 1, 0) : hoje });
  const nd = t.match(/\b(?:ultimos?|nos|dos)\s+(\d{1,3}|\w+)\s+dias\b/);
  const n = nd ? numero(nd[1]) : null;
  if (n) { const ini = new Date(hoje); ini.setDate(ini.getDate() - (n - 1)); return { ini, fim: hoje, rotulo: `nos últimos ${n} dias`, chave: 'dias' }; }
  if (/\bsemana passada\b|\bultima semana\b/.test(t)) { const ini = new Date(seg); ini.setDate(ini.getDate() - 7); const fim = new Date(seg); fim.setDate(fim.getDate() - 1); return { ini, fim, rotulo: 'na semana passada', chave: 'semana' }; }
  if (/\bsemana\b/.test(t)) return { ini: seg, fim: hoje, rotulo: 'nesta semana', chave: 'semana' };
  if (/\bmes passado\b|\bultimo mes\b/.test(t)) return { ...mes(-1), rotulo: 'no mês passado', chave: 'mes' };
  if (/\b(ano|anual)\b/.test(t)) return { ini: new Date(hoje.getFullYear(), 0, 1), fim: hoje, rotulo: 'neste ano', chave: 'ano' };
  if (/\bhoje\b/.test(t)) return { ini: hoje, fim: hoje, rotulo: 'hoje', chave: 'dia' };
  if (/\bmes\b/.test(t) || padrao === 'mes') return { ...mes(0), rotulo: 'neste mês', chave: 'mes' };
  return { ini: seg, fim: hoje, rotulo: 'nesta semana', chave: 'semana' };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONSULTAS DE DESEMPENHO
// ═══════════════════════════════════════════════════════════════
// { tipo: 'geral'|'atividade'|'recorde'|'sono', periodo, nome? } ou null
// "como tá meu desempenho esse mês?", "quantos % eu fiz na semana", "quantas
// vezes fui na academia esse mês", "desempenho da leitura", "meu recorde",
// "qualidade do meu sono na semana", "média de sono do mês"
export function lerConsultaDesempenho(texto, agora = new Date()) {
  const t = semAcento(semPedido(texto)).replace(/[?!.]+$/, '').trim();
  if (/\b(objetivos?|reflex\w*|nota|notas|lista)\b/.test(t)) return null;
  if (/\b(recorde|maior sequencia|melhor sequencia|mais dias seguidos|melhor mes)\b/.test(t) || /^(qual|como (ta|esta)) (e |a )?minha constancia$|^minha constancia$/.test(t))
    return { tipo: 'recorde' };
  if (/\b(qualidade|media|medio)\b.*\bsono\b|\bsono\b.*\b(semana|mes|media|qualidade|ultimos)\b|\bquanto (eu )?(tenho|to|estou|ando) dormindo\b/.test(t))
    return { tipo: 'sono', periodo: periodoDaFrase(t, agora, 'semana') };
  // Uma atividade: "quantas vezes (eu) fui na/fiz a X", "desempenho da X", "como tá a X esse mês"
  const vezes = t.match(/\bquantas vezes (?:eu )?(?:fui|fiz|treinei|pratiquei|fui pr[ao]|cumpri|marquei)\s+(?:n[ao]s?\s+|[ao]s?\s+|d[ao]s?\s+)?(.+?)(?:\s+(?:esse|essa|nesse|nessa|este|esta|neste|nesta|no|na|em|desde|nos|dos|hoje|semana|mes|ano)\b.*)?$/);
  if (vezes) return { tipo: 'atividade', nome: vezes[1].replace(/\s+(?:d[aoe]s?|n[ao]s?)$/, '').trim(), periodo: periodoDaFrase(t, agora) };
  const dsp = t.match(/\b(?:desempenho|aproveitamento|porcentagem|constancia|rendimento)\s+(?:d[aoe]s?|n[ao]s?)\s+(?!mes\b|semana\b|ano\b|hoje\b|ultim|esse\b|essa\b|este\b|esta\b|nesse\b|nessa\b)(.+?)(?:\s+(?:esse|essa|nesse|nessa|este|esta|neste|nesta|no|na|em|nos|dos|semana|mes|ano)\b.*)?$/);
  if (dsp && !/^(meu|minha|geral|app)$/.test(dsp[1])) return { tipo: 'atividade', nome: dsp[1].replace(/^(minha|meu)\s+/, '').trim(), periodo: periodoDaFrase(t, agora) };
  // Geral
  if (/\b(desempenho|aproveitamento|rendimento|porcentagem|percentual|quantos por cento|como (fui|me sai|eu fui)|meu resultado|meu balanco)\b/.test(t)
      || /quant[oa]s?\s*%/.test(t) || /\bquanto (eu )?(fiz|cumpri|conclui)\b.*\b(semana|mes|ano)\b/.test(t))
    return { tipo: 'geral', periodo: periodoDaFrase(t, agora) };
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: REFLEXÃO DA SEMANA
// ═══════════════════════════════════════════════════════════════
// { passada, consultar } | { passada, conteudo } | { passada, abrir } ou null
// "anota na reflexão da semana que aprendi a dizer não", "minha reflexão da
// semana: ...", "qual foi minha reflexão da semana passada?"
export function lerReflexao(texto) {
  const bruto = semPedido(texto);
  const t = semAcento(bruto);
  if (!/\breflex(ao|oes)\b/.test(t)) return null;
  const passada = /\bsemana passada\b|\bultima semana\b/.test(t);
  const i = bruto.search(/:|\bque\b|\bdizendo\b/i);
  const conteudo = i >= 0 ? bruto.slice(i).replace(/^(:|que|dizendo)\s*/i, '').replace(/[.!]+$/, '').trim() : '';
  if (conteudo && !/^(eu )?(escrevi|anotei|fiz)\b/i.test(semAcento(conteudo))) return { passada, conteudo };
  if (/\?\s*$/.test(bruto) || /\b(qual|quais|o que|mostra|ver|le|ler|manda)\b/.test(t)) return { passada, consultar: true };
  if (/\b(preench\w*|escrev\w*|faz\w*|anota\w*|registra\w*)\b/.test(t)) return { passada, abrir: true };
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: OBJETIVOS
// ═══════════════════════════════════════════════════════════════
// { tipo: 'ver' } | { tipo: 'criar'|'mudar', nome, vezes, periodo, vezesDia } | { tipo: 'apagar', nome } ou null
// "como tão meus objetivos?", "cria um objetivo de academia 4 vezes por semana",
// "muda o objetivo da leitura pra 20 vezes por mês", "apaga o objetivo da academia"
export function lerObjetivo(texto) {
  const bruto = semPedido(texto).replace(/[?!.]+$/, '').trim();
  const t = semAcento(bruto);
  if (!/\bobjetivos?\b/.test(t)) return null;
  if (/\b(treino|hipertrofia|volume|emagrec\w*|forca|definicao)\b/.test(t)) return null;   // objetivo do treino (Preparo)
  if (/^(apaga|apague|apagar|exclui|exclua|excluir|deleta|remove|remova|remover|tira)\b/.test(t)) {
    const m = bruto.match(/objetivos?\s+(?:d[aoe]s?\s+|de\s+)?(.+)$/i);
    return m ? { tipo: 'apagar', nome: m[1].trim() } : null;
  }
  // Alvo: "4 vezes por semana", "20x por mês", "3 vezes ao dia, 5 dias por semana"
  const alvo = t.match(/\b(\d{1,2}|\w+)\s*(?:x|vezes?|dias?)\s*(?:por|na|no|ao|a cada)\s+(semana|mes)\b/);
  const porDia = t.match(/\b(\d{1,2}|\w+)\s*(?:x|vezes?)\s*(?:por|ao|no)\s+dia\b/);
  const vezes = alvo ? numero(alvo[1]) : null;
  if (vezes) {
    const mudar = /\b(muda|mudar|troca|trocar|altera|alterar|ajusta|ajustar|aumenta|diminui|passa)\w*\b/.test(t);
    // Nome: entre "objetivo de/da/pra" e o número
    const m = bruto.match(/objetivos?\s*:?\s+(?:novo\s+)?(?:d[aoe]s?\s+|de\s+|pra\s+|para\s+|com\s+)?(?:a\s+atividade\s+)?(.+?)\s*(?:,|:|\bpra\b|\bpara\b|\bde\b)?\s*(?:\d{1,2}|\w+)\s*(?:x|vezes?|dias?)\s*(?:por|na|no|ao|a cada)\s+(?:semana|m[eê]s)/i);
    let nome = m ? m[1].replace(/\s+(?:pra|para|de|com)$/i, '').replace(/\s+\d+\s*(?:x|vezes?)\s*(?:por|ao|no)\s+dia$/i, '').trim() : '';
    if (!nome) { const m2 = bruto.match(/(?:atividade|objetivo)\s+(?:d[aoe]\s+)?([\p{L} ]+?)\s*$/iu); nome = m2 ? m2[1].trim() : ''; }
    return { tipo: mudar ? 'mudar' : 'criar', nome, vezes, periodo: alvo[2] === 'mes' ? 'mes' : 'semana', vezesDia: porDia ? (numero(porDia[1]) || 1) : 1 };
  }
  if (/\b(meus objetivos|os objetivos|objetivos|como (ta|esta|anda)\w* (o|meu) objetivo|progresso)\b/.test(t)
      && !/\b(cria|criar|novo|nova|muda|troca)\b/.test(t)) return { tipo: 'ver' };
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: CONTAS
// ═══════════════════════════════════════════════════════════════
// Sono médio em minutos dos dias com acordou+dormiu (mesma regra do card do
// Desempenho: 1h a 16h). { media, dias } ou null
export function sonoMedio(dias, sleepDuration) {
  const durs = [];
  for (const d of dias || []) {
    if (!d.wakeTime || !d.sleepTime) continue;
    const dur = sleepDuration(d.sleepTime, d.wakeTime);
    if (dur && dur >= 60 && dur <= 16 * 60) durs.push(dur);
  }
  return durs.length ? { media: durs.reduce((s, x) => s + x, 0) / durs.length, dias: durs.length } : null;
}
export function classeSono(min) {
  const h = min / 60;
  if (h < 6) return '😴 Ruim, abaixo do mínimo. Procura dormir mais.';
  if (h < 7) return '⚠️ Mínimo, funcional mas longe do ideal.';
  if (h <= 8) return '✅ Ideal, sono saudável.';
  return '💤 Desperdício, pode estar dormindo em excesso.';
}
export const fmtHM = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };

// Melhor mês (maior % de tarefas feitas) entre os dias dados: { chave 'AAAA-MM', pct, done, total } ou null
export function melhorMes(dias, hojeId) {
  const porMes = new Map();
  for (const d of dias || []) {
    if (d.id > hojeId) continue;
    const k = d.id.slice(0, 7);
    const m = porMes.get(k) || { done: 0, total: 0 };
    for (const tk of d.tasks || []) { m.total++; if (tk.done) m.done++; }
    porMes.set(k, m);
  }
  let best = null;
  for (const [k, m] of porMes) {
    if (m.total < 10) continue;   // mês com quase nada não vale como recorde
    const pct = Math.round(m.done / m.total * 100);
    if (!best || pct > best.pct) best = { chave: k, pct, ...m };
  }
  return best;
}
