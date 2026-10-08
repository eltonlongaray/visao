// ─── ÍNDICE ──────────────────────────────────────────────────
// Ritual pelo Pet: entende frases do dia a dia que mexem na agenda e no dia
// ("bebi 500 ml", "acordei 6h30", "anota na nota de ontem que…", "apaga a
// academia de sexta", "fiz a leitura ontem", "o que tenho sexta?").
// Só funções puras (sem banco, sem DOM); quem grava, com card de confirmação,
// é o assistente-ia.js (BLOCO 8.11).
// BLOCO 1 — TEXTO E DIAS ("ontem", "segunda", "dia 5")
// BLOCO 2 — ÁGUA
// BLOCO 3 — O QUE A FRASE PEDE (nota, excluir, feito, consulta, sono)
// BLOCO 4 — ACHAR A TAREFA PELO NOME
// ─────────────────────────────────────────────────────────────

export const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Tira o "jeito de pedir" do começo: "pode", "eu quero que tu", "por favor"…
export function semPedido(texto) {
  return String(texto || '').trim()
    .replace(/^(?:(?:eu|olha|entao|então|ai|aí|tipo|por favor|pfv)[\s,]+)*/i, '')
    .replace(/^(?:pode|podes|consegue|tem como|d[aá] pra|preciso que|quero que|queria que)\s+(?:tu\s+|voc[eê]\s+|vc\s+)?(?:me\s+)?/i, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: DIAS
// ═══════════════════════════════════════════════════════════════
const DIA_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
export const DIA_RE = /\b(anteontem|ontem|hoje|depois de amanha|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|dia \d{1,2}|\d{1,2}\/\d{1,2})\b/;

// Dia citado na frase. sentido: 'passado' (registrar o que já foi: "segunda" =
// a última segunda, hoje incluído) ou 'futuro' (consultar a agenda: a próxima).
// Devolve { data, dito } — sem dia na frase, hoje com dito=false.
export function diaDaFrase(texto, agora = new Date(), sentido = 'passado') {
  const t = semAcento(texto).replace(/-feira/g, '');
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const mais = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d; };
  const m = t.match(DIA_RE);
  if (!m) return { data: hoje, dito: false };
  const w = m[1];
  if (w === 'anteontem') return { data: mais(-2), dito: true };
  if (w === 'ontem') return { data: mais(-1), dito: true };
  if (w === 'hoje') return { data: hoje, dito: true };
  if (w === 'depois de amanha') return { data: mais(2), dito: true };
  if (w === 'amanha') return { data: mais(1), dito: true };
  if (w in DIA_SEMANA) {
    const alvo = DIA_SEMANA[w], dow = hoje.getDay();
    // "semana que vem" / "passada" desempata
    const segDaSemana = -((dow + 6) % 7), noDia = (alvo + 6) % 7;   // semana começa na segunda
    if (/semana que vem|proxima semana/.test(t)) return { data: mais(segDaSemana + 7 + noDia), dito: true };
    if (/semana passada|ultima semana/.test(t)) return { data: mais(segDaSemana - 7 + noDia), dito: true };
    return { data: mais(sentido === 'futuro' ? (alvo - dow + 7) % 7 : -((dow - alvo + 7) % 7)), dito: true };
  }
  const dm = w.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dm) return { data: new Date(hoje.getFullYear(), +dm[2] - 1, +dm[1]), dito: true };
  const dd = +w.slice(4);
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), dd);
  // "dia 30" no passado = este mês se já passou, senão o mês anterior (e o contrário no futuro)
  if (sentido === 'passado' && d > hoje) d.setMonth(d.getMonth() - 1);
  if (sentido === 'futuro' && d < hoje) d.setMonth(d.getMonth() + 1);
  return { data: d, dito: true };
}

export const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// "hoje", "ontem", "amanhã" ou "sex 09/10"
export function nomeDia(d, agora = new Date()) {
  const h = new Date(agora); h.setHours(0, 0, 0, 0);
  const dif = Math.round((new Date(d).setHours(0, 0, 0, 0) - h) / 86400000);
  if (dif === 0) return 'hoje';
  if (dif === -1) return 'ontem';
  if (dif === 1) return 'amanhã';
  return `${CURTOS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ÁGUA
// ═══════════════════════════════════════════════════════════════
const AGUA_RE = /\b(agua|copos?|garrafas?|garrafinhas?|litros?|ml|hidrat\w*)\b|\d\s*(?:ml|l)\b/;
const NUM_PALAVRA = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

// Quantidade de água na frase, em ml (null = não disse quanto)
export function mlDaFrase(texto) {
  let t = ` ${semAcento(texto)} `
    .replace(/\bmeio litro\b/g, '500 ml')
    .replace(/\b(um|1) litro e meio\b/g, '1500 ml')
    .replace(/\b(\d+) litros? e meio\b/g, (_, n) => `${n * 1000 + 500} ml`)
    .replace(new RegExp(`\\b(${Object.keys(NUM_PALAVRA).join('|')})\\b`, 'g'), (_, w) => String(NUM_PALAVRA[w]))
    .replace(/(\d),(\d)/g, '$1.$2');
  let total = 0, achou = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(ml|mls|mililitros?|l|litros?|copos?|garrafas?|garrafinhas?)\b/g)) {
    const n = Number(m[1]), u = m[2];
    achou = true;
    if (/^ml|^mili/.test(u)) total += n;
    else if (/^l/.test(u)) total += n * 1000;
    else if (/^copo/.test(u)) total += n * 250;
    else total += n * 500;
  }
  // "um copo" sem número já virou "1 copo"; "copo d'água" sem número = 1 copo
  if (!achou && /\bcopo\b/.test(t)) { total = 250; achou = true; }
  if (!achou && /\bgarraf(a|inha)\b/.test(t)) { total = 500; achou = true; }
  return achou ? Math.round(total) : null;
}

// { ml, modo: 'somar'|'tirar'|'definir' } ou null (não é registro de água)
export function lerAgua(texto) {
  const t = semAcento(semPedido(texto));
  if (!AGUA_RE.test(t)) return null;
  if (/\b(zera|zerar|zere)\b/.test(t)) return { ml: 0, modo: 'definir' };
  const ml = mlDaFrase(t);
  const pergunta = /\?\s*$/.test(t) || /\b(quanto|quantos|quanta|qual|como ta|como esta|ja bati|bati a meta)\b/.test(t);
  if (pergunta && ml == null) return null;
  if (ml == null) return /\b(bebi|tomei|registra|anota|adiciona|soma|coloca|bota)\b/.test(t) ? { ml: null, modo: 'somar' } : null;
  if (/\b(tira|tirar|tire|diminui|diminuir|remove|remover|desconta|menos)\b/.test(t)) return { ml, modo: 'tirar' };
  if (/\b(foi|foram|ficou|total|no total|corrige|corrigir|muda|mudar|troca|trocar|ajusta|deixa|era)\b/.test(t)) return { ml, modo: 'definir' };
  return { ml, modo: 'somar' };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: O QUE A FRASE PEDE
// ═══════════════════════════════════════════════════════════════
const PERGUNTA_RE = /\?\s*$|^(qual|quais|quanto|quantos|quanta|como|que horas|o que|quando)\b/;
export const ehPergunta = (texto) => PERGUNTA_RE.test(semAcento(semPedido(texto)).trim());

// Acordei / dormi: 'acordei' | 'dormi' | null (cochilo e madrugada vêm do pet-nota)
export function lerSonoDoDia(texto) {
  const t = semAcento(semPedido(texto));
  if (ehPergunta(t)) return null;
  if (/\b(acordei|levantei|despertei|acordar foi|hora que acordei)\b/.test(t)) return 'acordei';
  if (/\b(dormi|fui dormir|fui pra cama|deitei|peguei no sono|apaguei|capotei|cochilei|soneca|fiquei acordad\w*)\b/.test(t)) return 'dormi';
  return null;
}

// Nota do dia: { campo: 'prideFail'|'improve'|null, conteudo, apagar, abrir }
// "anota na nota de ontem que eu me orgulho de ter treinado"
// "na nota de segunda, melhorar: dormir mais cedo"
// "preenche a nota de segunda" (sem conteúdo → conversa guiada)
// "apaga a nota de ontem"
export function lerNota(texto) {
  const bruto = semPedido(texto);
  const t = semAcento(bruto);
  if (!/\bnota\b/.test(t) || /^editar?\b/.test(t) || /\bnota (fiscal|musical)\b/.test(t)) return null;
  if (/\b(compromisso|tarefa)\b/.test(t)) return null;   // "nota do compromisso X" = descrição
  if (/\b(apaga|apagar|apague|exclui|excluir|exclua|deleta|limpa|limpar|remove|remover)\b/.test(t) && !/\bque\b|:/.test(t))
    return { apagar: true };
  // Conteúdo: depois de ":" ou de "que" / "dizendo"
  const i = bruto.search(/:|\bque\b|\bdizendo\b|\bfalando\b/i);
  let conteudo = i >= 0 ? bruto.slice(i).replace(/^(:|que|dizendo|falando)\s*/i, '').trim() : '';
  let campo = null;
  const rotulo = semAcento(conteudo).match(/^(orgulho|melhorar|melhoria|medidas?)\s*[:,-]\s*/);
  if (/\b(melhorar|melhoria|medidas?|vou fazer melhor|fazer melhor)\b/.test(semAcento(bruto.slice(0, Math.max(i, 0) + 20)))) campo = 'improve';
  if (rotulo) {
    campo = /^orgulho/.test(rotulo[1]) ? 'prideFail' : 'improve';
    conteudo = conteudo.slice(rotulo[0].length).trim();
  }
  conteudo = conteudo.replace(/[.!]+$/, '').trim();
  // "a nota de ontem foi preenchida?", "já preenchi a nota?": é pergunta, responde
  // se está feita (e oferece preencher se não estiver)
  if (!conteudo && (ehPergunta(texto) || /\b(foi|esta|ta|ja)\b.{0,25}\b(preenchid\w*|feit\w*|complet\w*)\b/.test(t)))
    return { consultar: true };
  if (!conteudo) return /\b(preench\w*|faz\w*|fazer|abre|abrir|anota\w*|escreve\w*|registra\w*|completa\w*)\b/.test(t) ? { abrir: true } : null;
  return { campo: campo || 'prideFail', conteudo };
}

const EXCLUIR_RE = /^(apaga|apague|apagar|exclui|exclua|excluir|deleta|deletar|delete|remove|remova|remover|tira|tire|tirar)\b/;
// Excluir tarefa: { todas } ou null
export function lerExcluir(texto) {
  const t = semAcento(semPedido(texto));
  if (!EXCLUIR_RE.test(t)) return null;
  if (/\b(lista|lembrete|sininho|nota|aviso|alarme)\b/.test(t)) return null;
  return { todas: /\b(todas?|todos|sempre|de vez|repeti\w*|toda semana|todo dia|todos os dias|pra frente|em diante)\b/.test(t) };
}

// Marcar/desmarcar feito: 'marcar' | 'desmarcar' | null
export function lerFeito(texto) {
  const t = semAcento(semPedido(texto));
  if (ehPergunta(t)) return null;
  if (/\b(desmarc\w*|nao fiz|nao foi feit\w*|tira o feito|tira o check)\b/.test(t)) return 'desmarcar';
  if (/\b(fiz|feit[oa]s?|terminei|conclui\w*|concluid\w*|check|cumpri)\b/.test(t)) return 'marcar';
  return null;
}

// Consulta da agenda: { semana } ou null. "o que tenho sexta?", "minha agenda de amanhã",
// "compromissos da semana", "o que eu fiz ontem"
export function lerConsultaAgenda(texto) {
  const t = semAcento(semPedido(texto));
  const pede = /\b(o que (eu )?(tenho|tem|vou ter|vou fazer|fiz|fica)|minha agenda|agenda d[aeo]|como (ta|esta|ficou) (minha|a) (agenda|semana|dia)|compromissos?|tarefas?|atividades?)\b/.test(t);
  if (!pede) return null;
  if (/\b(semana|proximos dias)\b/.test(t)) return { semana: true, proxima: /semana que vem|proxima semana/.test(t) };
  if (!DIA_RE.test(t)) return null;
  // "compromisso" sozinho sem "o que/qual/quais" pode ser registro ("compromisso sexta 10h")
  if (!/\b(o que|qual|quais|minha agenda|agenda d|como|mostra|ve|ver|lista)\b/.test(t) && !/\?\s*$/.test(t)) return null;
  return { semana: false };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ACHAR A TAREFA PELO NOME
// ═══════════════════════════════════════════════════════════════
const NAO_E_NOME = new Set(('pode podes consegue preciso quero queria que tu voce vc me eu por favor pfv ' +
  'apaga apague apagar exclui exclua excluir deleta deletar delete remove remova remover tira tire tirar ' +
  'marca marcar marque desmarca desmarcar desmarque fiz feito feita feitos feitas terminei conclui concluida concluido check cumpri nao ' +
  'como de da do das dos na no nas nos em pra para pro a o as os um uma e com ja hoje ontem anteontem amanha depois ' +
  'domingo segunda terca quarta quinta sexta sabado feira dia dias semana semanas passada que vem proxima ultima ' +
  'todas todos toda todo sempre vez repeticao repeticoes frente diante agenda tarefa tarefas compromisso compromissos atividade atividades so esse essa este esta').split(' '));
const radical = (w) => w.length >= 5 ? w.slice(0, 5) : w;
export const palavrasDoNome = (texto) => [...new Set(semAcento(texto).split(/[^a-z0-9]+/)
  .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !NAO_E_NOME.has(w)).map(radical))];

// Tarefas do dia que mais batem com as palavras da frase (empate = todas)
export function acharTarefas(tasks, texto, filtro = () => true) {
  const palavras = palavrasDoNome(texto);
  if (!palavras.length) return [];
  let melhor = 0, achados = [];
  for (const tk of tasks || []) {
    if (!filtro(tk)) continue;
    const alvo = semAcento(tk.title || '');
    const nota = palavras.filter(w => alvo.includes(w)).length;
    if (!nota) continue;
    // título citado inteiro vence ("academia" vs "academia de luta")
    const bonus = semAcento(texto).includes(alvo) ? 0.5 : 0;
    if (nota + bonus > melhor) { melhor = nota + bonus; achados = []; }
    if (nota + bonus === melhor) achados.push(tk);
  }
  return achados;
}

// ── Várias atividades citadas numa frase só ──
// "alongamento eu fiz e a respiração, janta leve sim, hidratação três, academia
// sim": devolve as tarefas pendentes citadas, na ordem do dia. Título repetido
// (5× Hidratação) usa o número dito logo depois ("hidratação três" = 3); sem
// número, 1. "não fiz a academia" fica de fora.
const SINAL_FEITO = /\b(fiz|feit[oa]s?|sim|terminei|conclui\w*|cumpri|consegui|tomei|bebi)\b/;
export const temSinalFeito = (texto) => SINAL_FEITO.test(semAcento(semPedido(texto)));
export function tarefasCitadas(tasks, texto) {
  const t = semAcento(semPedido(texto));
  if (!SINAL_FEITO.test(t)) return [];
  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  const raiz = tokens.map(radical);
  const grupos = new Map();   // título normalizado → tarefas pendentes
  for (const tk of tasks || []) {
    if (tk.done || tk.cancelled) continue;
    const k = semAcento(tk.title || '').trim();
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(tk);
  }
  const achados = [];
  for (const [k, lista] of grupos) {
    const palavras = palavrasDoNome(k);
    if (!palavras.length) continue;
    const posPrimeira = raiz.findIndex(r => r === palavras[0] || (palavras[0].length >= 4 && r.startsWith(palavras[0])));
    if (posPrimeira < 0) continue;
    const batem = palavras.filter(w => raiz.includes(w)).length;
    if (batem < Math.max(1, palavras.length - 1)) continue;
    // "não fiz a academia" / "academia não"
    const antes = tokens.slice(Math.max(0, posPrimeira - 3), posPrimeira);
    const depois = tokens.slice(posPrimeira + 1, posPrimeira + 1 + palavras.length + 1);
    if (antes.includes('nao') || depois[palavras.length - 1] === 'nao' || depois[0] === 'nao') continue;
    let n = 1;
    if (lista.length > 1) {
      for (const w of tokens.slice(posPrimeira + 1, posPrimeira + 5)) {
        const v = /^\d{1,2}$/.test(w) ? Number(w) : NUM_PALAVRA[w];
        if (v && v <= lista.length) { n = v; break; }
      }
    }
    const ordem = [...lista].sort((a, b) => String(a.startTime || '99').localeCompare(String(b.startTime || '99')));
    achados.push({ titulo: lista[0].title, pos: posPrimeira, tarefas: ordem.slice(0, n), total: lista.length });
  }
  return achados.sort((a, b) => a.pos - b.pos);
}
