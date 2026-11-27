// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × FONTES DE RENDA (Ferramentas › 💸 Fontes de renda, 26/11).
// Entende: "abre as fontes de renda", "quais minhas fontes de renda",
// "cria a fonte de renda Altas Vendas", "cria o card Mentoria dentro da Realeza",
// "adiciona a cliente Alê na Agência de marketing", "quais os clientes da Altas Vendas".
// Só INTERPRETA (sem banco, sem DOM). Quem grava é o assistente-ia.js (BLOCO 8.21),
// sempre depois do card de confirmação.
// ─────────────────────────────────────────────────────────────
// Igual ao norm de renda.js (aqui sem importar o banco)
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const FONTE = /\bfontes?\s+de\s+renda\b/;
const limpa = (s) => String(s || '').replace(/^\s*(?:chamad[oa]\s+|com\s+o\s+nome\s+(?:de\s+)?|de\s+nome\s+)/i, '')
  .replace(/^["“']|["”'.!?]+$/g, '').trim();

function tipoDaFrase(t) {
  if (/\b(com divis\w*|com (outros )?cards dentro|que abre outros|grupo|pasta)\b/.test(t)) return 'grupo';
  if (/\bde mentoria\b|\btipo mentoria\b/.test(t)) return 'mentoria';
  if (/\bde clientes?\b|\bcom clientes?\b|\btipo clientes?\b/.test(t)) return 'clientes';
  return null;
}

export function lerRenda(texto) {
  const orig = String(texto || '').trim();
  const t = norm(orig);
  if (!t || /\bkanban\b/.test(t)) return null;

  // Ver/abrir
  if (FONTE.test(t) && /\b(abr\w*|mostr\w*|ver|entra\w*|ir pra|vai pra)\b/.test(t) && !/\b(cri\w*|adicion\w*|nov[oa])\b/.test(t)) return { acao: 'abrir' };
  if (FONTE.test(t) && /\b(quais|quantas|lista\w*|que)\b/.test(t) && !/\b(cri\w*|adicion\w*)\b/.test(t)) return { acao: 'listar' };

  // Clientes de um card: "quais os clientes da Altas Vendas"
  const vc = orig.match(/\b(?:quais|quem s[aã]o|mostra|ver|lista)\b.*?\bclientes?\s+(?:d[aoe]s?|na|no)\s+(.+?)\s*\??$/i);
  if (vc) return { acao: 'ver_clientes', alvo: limpa(vc[1]) };

  // Criar fonte/card
  const cf = orig.match(/\b(?:cri[ae]r?|adiciona[r]?|faz(?:er)?|monta[r]?|bota[r]?|coloca[r]?)\s+(?:uma?\s+|o\s+|a\s+)?(?:nov[oa]\s+)?(?:fontes?\s+de\s+renda|card)\s+(?:nov[oa]\s+)?(.+)$/i);
  if (cf) {
    let resto = cf[1], dentro = null;
    const d = resto.match(/\s+(?:dentro\s+(?:d[aoe]s?\s+|de\s+)?|em\s+|n[ao]\s+)(?:card\s+|fonte\s+(?:de\s+renda\s+)?)?(.+)$/i);
    if (d) { dentro = limpa(d[1].replace(/\s+(?:de|com|tipo)\s+(?:clientes?|mentoria|divis\w*).*$/i, '')); resto = resto.slice(0, d.index); }
    const nome = limpa(resto.replace(/\s+(?:de|com|tipo)\s+(?:clientes?|mentoria|divis\w*|outros cards dentro).*$/i, ''));
    return { acao: 'criar', nome, dentro, tipo: tipoDaFrase(t) };
  }

  // Cliente novo: "adiciona a cliente Alê na Agência de marketing"
  const ac = orig.match(/\b(?:adiciona[r]?|cadastra[r]?|coloca[r]?|bota[r]?|p[oõ]e|inclui[r]?)\s+(?:uma?\s+|o\s+|a\s+)?(?:nov[oa]\s+)?(cliente\s+)?(.+?)\s+(?:como\s+cliente\s+)?(?:na|no|nas|nos|em)\s+(?:card\s+|fonte\s+(?:de\s+renda\s+)?)?(.+?)\s*[.!]?$/i);
  // Sem a palavra "cliente" (fraco): só vale se o destino for mesmo um card de clientes
  if (ac) return { acao: 'cliente', nome: limpa(ac[2].replace(/^(?:o|a)\s+/i, '')), alvo: limpa(ac[3].replace(/\s+como\s+cliente.*$/i, '')), fraco: !(ac[1] || /\bclientes?\b/.test(t)) };
  return null;
}
