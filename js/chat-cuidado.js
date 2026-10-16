// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Faixa de cuidado contra golpe no chat privado
// Quem nunca conversou com a pessoa e chega pedindo Pix/dinheiro, código
// ou mandando link de fora: aparece uma faixa discreta no topo da conversa
// (Élton, 16/10). Só olha o texto no aparelho; nada vai pro servidor.
// BLOCO 1 — O QUE É SUSPEITO
// BLOCO 2 — A FAIXA
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: O QUE É SUSPEITO
// ═══════════════════════════════════════════════════════════════
const _sem = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const DINHEIRO = [
  /\bpix\b/, /\bchave\b.*\b(cpf|celular|email|aleatoria)\b/, /\bpicpay\b|\bnubank\b.*\b(manda|transfere)/,
  /\btransfer(e|ir|encia)\b/, /\bdeposit(a|ar|o)\b/, /\bemprest(a|ar|imo)\b/,
  /\b(manda|passa|faz|arruma|consegue)\b.{0,20}\b(dinheiro|grana|valor|reais|conto|pila)\b/,
  /r\$\s?\d/, /\b\d+\s?(reais|conto|pila)\b/, /\bboleto\b/, /\bcomprovante\b/,
];
const CODIGO = [
  /\bcodigo\b.{0,25}\b(verificacao|whats|sms|chegou|confirmacao|banco)\b/,
  /\b(me )?(passa|manda|fala)\b.{0,15}\bcodigo\b/, /\bsenha\b/,
];
const LINK = /\bhttps?:\/\/(?!(?:www\.)?estilo-falcon\.web\.app)[^\s]+|\bwww\.(?!estilo-falcon)[^\s]+|\b[a-z0-9-]+\.(com|net|org|xyz|top|site|online|br)(\/\S*)?\b/;

export function motivoSuspeito(texto) {
  const t = _sem(texto);
  if (!t) return '';
  if (DINHEIRO.some(r => r.test(t))) return 'dinheiro';
  if (CODIGO.some(r => r.test(t))) return 'codigo';
  if (LINK.test(t)) return 'link';
  return '';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: A FAIXA
// ═══════════════════════════════════════════════════════════════
// Só quando eu ainda não mandei nada na conversa (a pessoa é nova pra mim)
export function faixaCuidadoHtml(msgs, meuId) {
  if (!Array.isArray(msgs) || !msgs.length || !meuId) return '';
  if (msgs.some(m => m.autor_id === meuId)) return '';
  const motivos = new Set(msgs.map(m => motivoSuspeito(m.texto)).filter(Boolean));
  if (!motivos.size) return '';
  const titulo = motivos.has('dinheiro') ? 'pedido de dinheiro de quem tu não conhece'
    : motivos.has('codigo') ? 'pedido de código de quem tu não conhece'
      : 'link de quem tu não conhece';
  return `<div class="chat-cuidado" role="note">
    <b>⚠️ Cuidado: ${titulo}.</b>
    <span>Antes de fazer Pix, passar código ou abrir link, confirma quem é por uma ligação ou pessoalmente. O Falcon nunca pede dinheiro nem código.</span>
  </div>`;
}
