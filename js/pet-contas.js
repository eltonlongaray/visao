// ─── ÍNDICE ──────────────────────────────────────────────────
// Contas a pagar em lote: "crie contas a pagar pra essa lista: Internet do
// celular - dia 02, Seguro do carro - dia 05…". Cada item vira um compromisso
// "Contas a pagar" (descrição = nome da conta) que repete todo mês no mesmo
// dia, com lembrete. Aqui só o que é puro (ler a frase, comparar nomes); quem
// grava é o BLOCO 8.12 do assistente-ia.js.
// BLOCO 1 — LER A LISTA
// BLOCO 2 — JÁ ESTÁ AGENDADO?
// ─────────────────────────────────────────────────────────────

export const TITULO_CONTA = 'Contas a pagar';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normNome = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: LER A LISTA
// ═══════════════════════════════════════════════════════════════
// Aceita vários jeitos de falar:
//   "contas a pagar: Internet - dia 02 Seguro - dia 05" (o formato do Élton)
//   "minhas contas são luz todo dia 10 e água no dia 15"
//   "tenho que pagar a luz dia 10 e a água dia 15"
//   "coloca nas contas a pagar dia 10 luz, dia 15 água" (dia antes do nome)
//   "cria conta a pagar da luz dia 10" (uma conta só)
//   "boletos:\nLuz 10\nÁgua 15" (lista sem a palavra "dia")
// Pergunta ("quais contas vencem dia 10?") não é lote: fica pra consulta.
const GATILHO = /\b(?:contas?|pagar|boletos?|faturas?|vencimentos?)\b/i;
const GATILHO_G = /\b(?:contas?\s+a\s+pagar|contas?|pagar|boletos?|faturas?|vencimentos?)\b/gi;
// Marca de dia, com o que costuma vir junto: "- todo dia 10 de cada mês"
const DIA_G = /(?:\s*[-–—:]\s*|\s+)?(?:\b(?:todo|toda|todos|no|nos|em|at[eé]|que\s+vence[m]?|vence[m]?|com\s+vencimento|vencimento)\s+){0,3}(?:o\s+)?\bdia\s+(\d{1,2})\b(?:\s+(?:de\s+cada|de\s+todo|do|todo)\s+m[eê]s)?/gi;
const PERGUNTA = /\?\s*$|^\s*(?:quais|qual|quanto|quantas?|o\s+que|tem\s+(?:alguma|conta)|que\s+contas?)\b/i;

function limparNome(n) {
  let x = String(n || '')
    .replace(/^[\s,;.\-–—•*:]+|[\s,;.\-–—:]+$/g, '')
    .replace(/^(?:e|mais|tamb[eé]m)\s+/i, '')
    .replace(/^(?:contas?|boletos?|faturas?)\s+(?:de|da|do|das|dos)\s+/i, '')
    .replace(/^(?:a|o|as|os|da|do|das|dos|de|pra|para|com)\s+/i, '')
    .replace(/\s+(?:e|que|todo|toda|no|nos|em|vence[m]?)$/i, '')
    .replace(/[\s,;.\-–—:]+$/g, '')
    .trim();
  if (/^(?:e|a|o|de|da|do|que|mais)$/i.test(x)) return '';
  return x ? x[0].toUpperCase() + x.slice(1) : '';
}

// Onde a lista começa: depois do último ":" (ou quebra de linha) antes do 1º
// item; sem isso, depois da última palavra-gatilho ("…contas a pagar| luz…")
function inicioDaLista(t, ate) {
  const antes = t.slice(0, ate);
  const corte = Math.max(antes.lastIndexOf(':'), antes.lastIndexOf('\n'));
  if (corte >= 0) return corte + 1;
  let fim = -1;
  for (const m of antes.matchAll(GATILHO_G)) fim = m.index + m[0].length;
  if (fim < 0) return -1;
  // "contas a pagar SÃO luz…", "pagar A luz…": o conector fica no nome e sai na limpeza
  const resto = antes.slice(fim).match(/^\s*(?:s[aã]o|que\s+(?:s[aã]o|tenho|vencem)|tenho)?\s*/i);
  return fim + (resto ? resto[0].length : 0);
}

export function lerLoteDeContas(texto) {
  const t = String(texto || '');
  const s = semAcento(t);
  if (!GATILHO.test(s) || PERGUNTA.test(t.trim())) return null;
  const marcas = [...t.matchAll(DIA_G)];
  const itens = [];
  const vistos = new Set();
  const por = (nome, dia) => {
    nome = limparNome(nome);
    if (!nome || dia < 1 || dia > 31 || nome.length > 60) return;
    const k = normNome(nome);
    if (!k || vistos.has(k) || GATILHO.test(semAcento(nome)) && k.split(' ').length > 4) return;
    vistos.add(k);
    itens.push({ nome, dia });
  };

  if (marcas.length) {
    const ini = inicioDaLista(t, marcas[0].index);
    if (ini < 0) return null;
    const antesDo1o = t.slice(ini, marcas[0].index).trim();
    const diaPrimeiro = !limparNome(antesDo1o);
    marcas.forEach((m, i) => {
      const dia = Number(m[1]);
      if (diaPrimeiro) {
        const fim = i + 1 < marcas.length ? marcas[i + 1].index : t.length;
        por(t.slice(m.index + m[0].length, fim), dia);
      } else {
        const de = i === 0 ? ini : marcas[i - 1].index + marcas[i - 1][0].length;
        por(t.slice(de, m.index), dia);
      }
    });
  } else {
    // Lista sem "dia": "Luz 10", "Água - 15", um por linha ou separado por vírgula
    const ini = Math.max(t.indexOf(':'), t.indexOf('\n'));
    if (ini < 0) return null;
    for (const pedaco of t.slice(ini + 1).split(/\n|[,;]/)) {
      const m = pedaco.trim().match(/^(.+?)\s*[-–—:]?\s*(\d{1,2})\.?$/);
      if (m) por(m[1], Number(m[2]));
    }
    if (itens.length < 2) return null;
  }
  // Uma conta só vale quando a frase diz claramente que é conta/boleto/pagar
  if (itens.length === 1 && !/\bcontas?\s+a\s+pagar\b|\bboleto|\bfatura|\bpagar\b|\bconta\s+(?:de|da|do)\b/i.test(s)) return null;
  return itens.length ? itens : null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: JÁ ESTÁ AGENDADO?
// ═══════════════════════════════════════════════════════════════
// Uma recorrência/tarefa "já é" essa conta quando a descrição ou o título têm
// o nome dela (ou o contrário: "Internet" cadastrada e "Internet da Casa" na
// lista não conta — o nome inteiro tem que estar lá).
export function mesmaConta(nome, coisa) {
  const n = normNome(nome);
  if (!n) return false;
  const campos = [coisa?.desc, coisa?.title].map(normNome).filter(Boolean);
  // Nome de uma palavra só ("Internet") tem que bater inteiro; com mais
  // palavras ("Seguro do carro") vale estar contido ("Seguro do carro Porto")
  const varias = n.includes(' ');
  return campos.some(c => c === n || (varias && (` ${c} `).includes(` ${n} `)));
}

// Outra "Contas a pagar" no mesmo dia, com outro nome: pode ser a mesma conta
// escrita diferente ("Faculdade" x "FIAP"). Não decide sozinho: o card avisa.
export function ehContaAPagar(coisa) {
  return normNome(coisa?.title) === normNome(TITULO_CONTA);
}
