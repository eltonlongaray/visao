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
// "Nome - dia 05" (também "Nome: dia 5", "Nome dia 5"), com ou sem quebra de
// linha entre os itens. Só vale como lote quando a frase fala de conta/pagar e
// tem pelo menos 2 itens com dia.
const ITEM_RE = /(.+?)\s*(?:[-–—:]\s*)?\bdia\s+(\d{1,2})\b[\s,;.]*/gi;

export function lerLoteDeContas(texto) {
  const t = String(texto || '');
  if (!/\bcontas?\b|\bpagar\b|\bboletos?\b|\bfaturas?\b/i.test(semAcento(t))) return null;
  // Começo dos itens: depois do último ":" ou quebra de linha antes do 1º "dia NN"
  const primeiro = t.search(/[-–—:]?\s*\bdia\s+\d{1,2}\b/i);
  if (primeiro < 0) return null;
  const antes = t.slice(0, primeiro);
  const corte = Math.max(antes.lastIndexOf(':'), antes.lastIndexOf('\n'));
  if (corte < 0) return null;   // sem ":" a introdução se misturaria com o 1º nome
  const corpo = t.slice(corte + 1);
  const itens = [];
  const vistos = new Set();
  for (const m of corpo.matchAll(ITEM_RE)) {
    const nome = m[1].replace(/^[\s,;.\-–—•*]+|[\s,;.\-–—:]+$/g, '').replace(/^e\s+/i, '').trim();
    const dia = Number(m[2]);
    if (!nome || dia < 1 || dia > 31) continue;
    const k = normNome(nome);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    itens.push({ nome, dia });
  }
  return itens.length >= 2 ? itens : null;
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
