// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — CATÁLOGO
// BLOCO 2 — RECENTES
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: CATÁLOGO
// ═══════════════════════════════════════════════════════════════
// Lista curada, não a tabela Unicode inteira. Um seletor com milhares de
// figuras exige busca, paginação e peso — e ninguém procura emoji raro no
// meio de uma conversa. Aqui entram os que a comunidade de fato usa, com uma
// aba de treino porque este é um app de rotina e disciplina.
//
// Nada de biblioteca externa: o app roda sob CSP fechada no GitHub Pages e
// qualquer CDN seria bloqueado.
export const CATEGORIAS = [
  {
    id: 'recentes', icone: '🕘', nome: 'Recentes',
    itens: [],   // preenchido em tempo de execução; ver BLOCO 2
  },
  {
    id: 'rostos', icone: '🙂', nome: 'Rostos',
    itens: ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😔','😪','🤤','😴','😷','🤒','🤕','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','🤬','😈','💀','🤡','👻','👽','🤖'],
  },
  {
    id: 'gestos', icone: '👍', nome: 'Gestos',
    itens: ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤙','💪','🦾','🙏','🤝','👏','🙌','👐','🤲','✍️','💅','🦵','🦶','👀','👁️','🧠','🫀'],
  },
  {
    id: 'amor', icone: '❤️', nome: 'Amor',
    itens: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','😻','💋','🌹','🥀','💐'],
  },
  {
    id: 'treino', icone: '💪', nome: 'Treino',
    itens: ['💪','🏋️','🏋️‍♀️','🤸','🤸‍♀️','🧘','🧘‍♀️','🏃','🏃‍♀️','🚴','🚵','🏊','🥊','🥋','🤼','⛹️','🏆','🥇','🥈','🥉','🎯','🏅','🎽','👟','⏱️','⏰','📈','📊','✅','☑️','🔋','⚡','🥗','🥤','💧','🍎','🥦','🍗','🥚','😤'],
  },
  {
    id: 'festa', icone: '🎉', nome: 'Comemorar',
    itens: ['🎉','🎊','🥳','🍾','🥂','🎂','🍰','🧁','🎁','🎈','✨','🌟','⭐','💫','🎆','🎇','🪅','🎵','🎶','🕺','💃','🙌','👑','🏁'],
  },
  {
    id: 'simbolos', icone: '🔥', nome: 'Símbolos',
    itens: ['🔥','💯','✅','❌','⚠️','❓','❗','💡','🔔','📌','📍','🔒','🔓','🗓️','📅','⌛','⏳','♻️','🆗','🆕','🔝','☑️','〽️','☯️','🦅','🌅','🌄','🌙','☀️','🌈','🌊','🏔️','🧿','⚔️','🛡️','🎖️','📿','🕯️'],
  },
];

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RECENTES
// ═══════════════════════════════════════════════════════════════
// Fica no aparelho: é preferência de teclado, não dado de comunidade — não
// tem por que ocupar linha no banco nem viajar pela rede.
const CHAVE = 'falcon_emojis_recentes';
const MAX = 24;

export function recentes() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch { return []; }
}

export function registrarUso(emoji) {
  try {
    // Tira a repetição antes de empilhar, senão o mesmo emoji ocuparia a
    // aba inteira depois de algumas mensagens.
    const lista = [emoji, ...recentes().filter(e => e !== emoji)].slice(0, MAX);
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch { /* modo privado / cota cheia: recentes é acessório */ }
}
