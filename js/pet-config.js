// ─── ÍNDICE ──────────────────────────────────────────────────
// Configurar o app conversando com o Pet (etapa 2 do "Pet faz tudo").
// Só funções puras (sem banco, sem DOM): quem grava e mostra o card é o
// assistente-ia.js (BLOCO 8.13).
// BLOCO 1 — HORÁRIO PADRÃO DE ACORDAR E DORMIR
// BLOCO 2 — TEMA CLARO / ESCURO
// BLOCO 3 — ABRIR UMA TELA
// BLOCO 4 — ATIVIDADES (listar, criar, renomear, ícone, cor, excluir)
// BLOCO 5 — DÚVIDA SOBRE TÍTULO E DESCRIÇÃO
// BLOCO 6 — TRANSFORMAR TAREFA EM COMPROMISSO (e o contrário)
// ─────────────────────────────────────────────────────────────

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const semPedido = (s) => String(s || '').trim()
  .replace(/^(?:(?:eu|olha|entao|então|ai|aí|tipo|por favor|pfv|falcon)[\s,]+)*/i, '')
  .replace(/^(?:pode|podes|consegue|tem como|d[aá] pra|preciso que|quero que|queria que)\s+(?:tu\s+|voc[eê]\s+|vc\s+)?(?:me\s+)?/i, '')
  .trim();
const DIA_RE = /\b(anteontem|ontem|hoje|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|semana|dia \d{1,2}|\d{1,2}\/\d{1,2})\b/;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: HORÁRIO PADRÃO DE ACORDAR E DORMIR
// ═══════════════════════════════════════════════════════════════
const NUM = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };

// Primeira hora dita no trecho → 'HH:MM' ("6h", "6:30", "seis e meia", "11 da noite", "meia noite")
function hora(trecho, dormir) {
  const t = trecho.replace(/meia[\s-]noite e meia/g, '00:30').replace(/meia[\s-]noite/g, '00:00')
    .replace(new RegExp(`\\b(${Object.keys(NUM).join('|')})\\b`, 'g'), (_, w) => String(NUM[w]));
  const m = t.match(/(?:^|\D)(\d{1,2})(?:\s*(?::|h)\s*(\d{2})|\s*e\s*(meia))?\s*(?:h(?:oras?)?)?\s*(da noite|da manha|da madrugada|de madrugada|da tarde)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mn = m[2] ? Number(m[2]) : m[3] ? 30 : 0;
  if (h > 23 || mn > 59) return null;
  if (m[4] && /noite|tarde/.test(m[4]) && h < 12) h += 12;
  // "durmo às 11" = 23h; "acordo às 6" = 6h
  if (dormir && !m[4] && h >= 7 && h <= 11) h += 12;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

// { acordar: 'HH:MM'?, dormir: 'HH:MM'? } ou null.
// "meu horário padrão de acordar é 6h", "muda o dormir padrão pra 23h",
// "eu acordo todo dia às 6 e durmo às 11", "quero dormir sempre às 22h30"
export function lerHorarioPadrao(texto) {
  const t = semAcento(semPedido(texto));
  if (/\b(acordei|dormi|fui dormir|deitei|cochil\w*)\b/.test(t)) return null;   // registro do dia
  if (!/\b(padrao|todo dia|todos os dias|sempre|costumo|normalmente|de costume|horario de (acordar|dormir)|hora de (acordar|dormir))\b/.test(t)) return null;
  if (/\b(lembr\w*|alarme|despertador|notific\w*)\b/.test(t)) return null;
  const out = {};
  const ACORDA = /\b(acord\w*|despert\w*|levant\w*)\b/g, DORME = /\b(dorm\w*|durm\w*|deit\w*|ir pra cama|vou pra cama)\b/g;
  for (const [campo, re] of [['acordar', ACORDA], ['dormir', DORME]]) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (!m) continue;
    // A hora vem depois do verbo, até o outro verbo ("acordo às 6 e durmo às 11")
    let trecho = t.slice(m.index + m[0].length);
    const outro = (campo === 'acordar' ? /\b(dorm\w*|durm\w*|deit\w*)\b/ : /\b(acord\w*|despert\w*|levant\w*)\b/).exec(trecho);
    if (outro) trecho = trecho.slice(0, outro.index);
    const h = hora(trecho, campo === 'dormir');
    if (h) out[campo] = h;
  }
  return out.acordar || out.dormir ? out : null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: TEMA CLARO / ESCURO
// ═══════════════════════════════════════════════════════════════
// 'light' | 'dark' | 'trocar' | null
export function lerTema(texto) {
  const t = semAcento(semPedido(texto));
  if (!/\b(tema|modo|app|aplicativo|tela|visual|cores do app)\b/.test(t)) return null;
  if (/\bcart(ao|oes)\b|\bfundo do cartao\b/.test(t)) return null;
  if (/\b(claro|light|branco|dia)\b/.test(t) && /\b(tema|modo)\b|deixa o app|app (mais )?claro/.test(t)) return 'light';
  if (/\b(escuro|dark|preto|noite|noturno)\b/.test(t) && /\b(tema|modo)\b|deixa o app|app (mais )?escuro/.test(t)) return 'dark';
  if (/\b(troca|trocar|muda|mudar|alterna)\w*\b.*\b(tema|modo)\b/.test(t)) return 'trocar';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ABRIR UMA TELA
// ═══════════════════════════════════════════════════════════════
const TELAS = [
  [/^(home|inicio|tela inicial|pagina inicial|meu dia)$/, '/home', 'a Home'],
  [/^(ritual|agenda)$/, '/ritual', 'o Ritual'],
  [/^(desempenho|graficos?|estatisticas?|relatorios?)$/, '/desempenho', 'o Desempenho'],
  [/^(desafios?)$/, '/desafios', 'os Desafios'],
  [/^(preparo|preparo fisico|treino|meu treino)$/, '/preparo', 'o Preparo Físico'],
  [/^(chat|mural|comunidade|falcon hunters|mensagens)$/, '/chat', 'a Comunidade'],
  [/^(ajustes|configurac\w*|configs?|perfil)$/, '/ajustes', 'os Ajustes'],
];
// { rota, nome } ou null. "abre o desempenho", "vai pro ritual", "me leva pros ajustes"
export function lerAbrirTela(texto) {
  const t = semAcento(semPedido(texto)).replace(/[.!?]+$/, '').trim();
  const m = t.match(/^(?:me\s+)?(?:abre|abrir|abra|vai|vamos|ir|leva|levar|entra|entrar|mostra|mostrar)(?:\s+(?:me|pra mim))?\s+(?:(?:pra|para|pro|pros|na|no|nos|nas|em)\s+)?(?:(?:o|a|os|as)\s+)?(?:tela\s+(?:d[eoa]s?\s+)?)?(.+)$/);
  if (!m) return null;
  const alvo = m[1].trim();
  for (const [re, rota, nome] of TELAS) if (re.test(alvo)) return { rota, nome };
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ATIVIDADES (as da Home: nome, ícone, cor)
// ═══════════════════════════════════════════════════════════════
export const CORES = {
  roxo: '#a78bfa', lilas: '#c084fc', violeta: '#8b5cf6', verde: '#34d399', 'verde claro': '#4ade80', 'verde escuro': '#10b981',
  rosa: '#f472b6', pink: '#ec4899', azul: '#60a5fa', 'azul claro': '#38bdf8', 'azul escuro': '#3b82f6', ciano: '#22d3ee',
  turquesa: '#14b8a6', amarelo: '#fbbf24', dourado: '#eab308', laranja: '#fb923c', vermelho: '#f87171', 'vermelho escuro': '#ef4444',
};
const COR_RE = new RegExp(`\\b(${Object.keys(CORES).sort((a, b) => b.length - a.length).join('|')})\\b`);
const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u;

const limpaNome = (s) => String(s || '').replace(/^["“'«]+|["”'»]+$/g, '').replace(/[.!?]+$/, '').trim();

// Pedido sobre as atividades da Home:
// { tipo: 'listar' } | { tipo: 'criar', nome } | { tipo: 'renomear', nome, novo }
// | { tipo: 'icone', nome, icone|null } | { tipo: 'cor', nome, cor|null, corNome }
// | { tipo: 'excluir', nome } | null
export function lerAtividadeConfig(texto) {
  const bruto = semPedido(texto).replace(/[.!?]+$/, '').trim();
  const t = semAcento(bruto);
  if (!/\b(atividades?|categorias?)\b/.test(t)) return null;
  // Dia ou horário = tarefa da agenda, não a atividade da biblioteca
  const temDia = DIA_RE.test(t) || /\b\d{1,2}\s*(?:h|:\d{2})\b|\bas \d{1,2}\b/.test(t);

  // Listar: "quais são minhas atividades", "lista minhas atividades cadastradas"
  if (/\b(quais|lista|listar|mostra|mostrar|ver|manda|todas)\b/.test(t) && /\batividades\b|\bcategorias\b/.test(t) && !temDia
      && !/\b(renome|muda|troca|apaga|exclui|cria|nova)\w*/.test(t)) return { tipo: 'listar' };

  // Texto original (com acento) depois de "atividade X" pra pegar o nome como a pessoa falou
  const depoisDe = (re) => { const m = bruto.match(re); return m ? m[1] : null; };

  // Renomear: "renomeia a atividade X pra Y", "muda o nome da atividade X para Y"
  if (/\b(renome\w*|(muda|mudar|troca|trocar|altera|alterar)\w* o nome)\b/i.test(t)) {
    const m = bruto.match(/(?:atividade|categoria)\s+(.+?)\s+(?:pra|para|por)\s+(.+)$/i);
    if (m) return { tipo: 'renomear', nome: limpaNome(m[1]), novo: limpaNome(m[2]) };
    return null;
  }
  // Ícone: "troca o ícone da atividade X pra 🏋️"
  if (/\b(icone|emoji|simbolo|figura|desenho)\b/.test(t)) {
    const emoji = bruto.match(EMOJI_RE)?.[0] || null;
    const nome = depoisDe(/(?:atividade|categoria)\s+(.+?)(?:\s+(?:pra|para|por|com)\b.*)?$/i);
    if (!nome) return null;
    return { tipo: 'icone', nome: limpaNome(nome.replace(EMOJI_RE, '')), icone: emoji };
  }
  // Cor: "muda a cor da atividade X pra azul"
  if (/\bcor\b/.test(t)) {
    const nome = depoisDe(/(?:atividade|categoria)\s+(.+?)(?:\s+(?:pra|para|por|de|com)\s+(?:a\s+cor\s+)?\S+(?:\s+(?:claro|escuro))?)?$/i);
    const cm = t.match(COR_RE);
    if (!nome) return null;
    return { tipo: 'cor', nome: limpaNome(nome), cor: cm ? CORES[cm[1]] : null, corNome: cm ? cm[1] : null };
  }
  if (temDia) return null;
  // Excluir: "apaga a atividade X", "exclui a categoria X da minha lista"
  if (/^(apaga|apague|apagar|exclui|exclua|excluir|deleta|deletar|delete|remove|remova|remover)\b/.test(t)) {
    if (/\b(repeti\w*|todas|todos|sempre)\b/.test(t)) return null;   // repetição de tarefa
    const nome = depoisDe(/(?:atividade|categoria)\s+(.+?)(?:\s+(?:da|das|do)\s+(?:minha\s+)?(?:biblioteca|lista|home|app)\b.*)?$/i);
    return nome ? { tipo: 'excluir', nome: limpaNome(nome) } : null;
  }
  // Criar: "cria a atividade X", "cadastra uma nova atividade chamada X"
  if (/^(cria|criar|crie|cadastra|cadastrar|cadastre|registra|registrar|adiciona|adicionar|nova)\b/.test(t)) {
    const nome = depoisDe(/(?:atividade|categoria)\s+(?:nova\s+)?(?:chamada\s+|com o nome\s+(?:de\s+)?)?(.+)$/i);
    return nome ? { tipo: 'criar', nome: limpaNome(nome) } : null;
  }
  return null;
}

// A atividade (categoria) que a pessoa citou: igual > começa com > contém > palavras
export function acharAtividade(cats, nome) {
  const alvo = semAcento(nome).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!alvo) return null;
  const n = (c) => semAcento(c.name).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cats || []).find(c => n(c) === alvo)
    || (cats || []).find(c => n(c).startsWith(alvo) || alvo.startsWith(n(c)))
    || (cats || []).find(c => n(c).includes(alvo))
    || (cats || []).find(c => alvo.split(' ').filter(w => w.length >= 4).some(w => n(c).split(' ').includes(w)))
    || null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: DÚVIDA SOBRE TÍTULO E DESCRIÇÃO
// ═══════════════════════════════════════════════════════════════
// "qual a diferença entre título e descrição?", "o que vai na descrição?",
// "pra que serve o título da atividade?"
export function lerDuvidaTituloDescricao(texto) {
  const t = semAcento(semPedido(texto)).replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!/\b(titulo|descricao|discricao)\b/.test(t)) return false;
  return /\b(diferenca|diferente|o que (e|vai|coloco|boto|escrevo|poe)|pra que serve|para que serve|qual (e|a) (a )?(funcao|ideia)|como (uso|funciona)|explica)\b/.test(t);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: TRANSFORMAR TAREFA EM COMPROMISSO (e o contrário)
// ═══════════════════════════════════════════════════════════════
// Início e fim de "das 14h às 16h", "de 2 a 4 da tarde", "às 18h" → { ini, fim }.
// "da tarde" dito só no fim vale pros dois ("de 2 a 4 da tarde" = 14h–16h).
export function faixaHorario(trecho) {
  const t = semAcento(trecho).replace(/\bdia \d{1,2}(?:\/\d{1,2})?\b|\b\d{1,2}\/\d{1,2}\b/g, ' ');
  const partes = t.split(/\s+(?:ate|as|a)\s+(?=(?:as\s+)?(?:\d|(?:meio|meia|uma|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\b))|\s*[-–]\s*(?=\d)/)
    .filter(x => /\d|meio|meia|\b(uma|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\b/.test(x));
  if (!partes.length) return { ini: null, fim: null };
  const per = (x) => (x.match(/\b(da noite|da manha|da madrugada|de madrugada|da tarde)\b/) || [])[1];
  const p0 = partes[0], p1 = partes[1] || '';
  const ini = hora(p0 + (!per(p0) && per(p1) ? ' ' + per(p1) : '').replace(/^/, ' '));
  const fim = p1 ? hora(' ' + p1) : null;
  // "das 10 às 2" = 10h–14h
  if (ini && fim && fim < ini && Number(fim.slice(0, 2)) < 12) {
    const h = Number(fim.slice(0, 2)) + 12;
    return { ini, fim: `${h}${fim.slice(2)}` };
  }
  return { ini, fim };
}

// { para: 'commitment' | 'task', nome, ini, fim, temDia } ou null.
// "transforma a tarefa academia em compromisso das 18h às 19h",
// "deixa a reunião como compromisso às 14h", "converte o compromisso X em tarefa"
export function lerConverterTipo(texto) {
  const orig = semPedido(texto).normalize('NFC').replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
  const t = semAcento(orig);
  const m = t.match(/^(?:transform\w*|convert\w*|torn\w*|passa\w*|muda\w*|troca\w*|deixa\w*|coloca\w*|bota\w*|vira\w*|faz\w*)\s+(?:(?:o|a)\s+)?(?:(?:compromisso|tarefa|atividade)\s+)?(?:d[oa]\s+)?(.+?)\s+(?:em|pra|para|pro|como|num|numa)\s+(?:um\s+|uma\s+|o\s+|a\s+)?(compromisso|tarefa|atividade)\b(.*)$/d);
  if (!m) return null;
  if (/\b(ideal|pilar|pilares)\b/.test(t)) return null;   // "ler do meu ideal em atividade" é o Ideal (BLOCO 8.15)
  // Nome com acento e maiúscula como a pessoa escreveu (pra mensagem "não encontrei")
  const bruto = orig.length === t.length ? orig.slice(m.indices[1][0], m.indices[1][1]) : m[1];
  const nome = bruto.replace(/\s+(?:de|do|da|na|no)\s+(?:hoje|amanh[aã]|ontem|(?:pr[oó]xim[ao]\s+)?(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?|dia\s+\d{1,2}(?:\/\d{1,2})?)$/i, '').trim();
  // "muda o nome da tarefa X pra tarefa Y" é renomear, não trocar o tipo
  if (!nome || /^(?:o\s+|a\s+)?(?:nome|cor|icone|horario|hora|descricao|titulo|lembrete)\b/.test(semAcento(nome))) return null;
  const { ini, fim } = faixaHorario(m[3]);
  return {
    para: m[2] === 'compromisso' ? 'commitment' : 'task',
    nome, ini, fim,
    temDia: DIA_RE.test(t.replace(/\bsemana\b/, '')),
  };
}
