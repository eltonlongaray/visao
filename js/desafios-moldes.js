// ═══════════════════════════════════════════════════════════════
// FALCON · Moldes de desafio (pré-formatos por tipo)
// Admin escolhe um molde → formulário já vem preenchido com o formato certo.
// prova: 'video' (grava comprovando) | 'honra' (marca sem vídeo).
// opcoes vazio = pessoa digita a quantidade. Tudo editável na criação.
// ═══════════════════════════════════════════════════════════════
export const MOLDES = [
  { id: 'agua',          emoji: '💧', nome: 'Água',               titulo: 'Beber 2L de água',   unidade: 'ml',         meta: 2000, dias: 21, opcoes: [250, 500], prova: 'video',
    desc: 'Beba 2L de água por dia. Grave um gole a cada garrafinha até fechar a meta.' },
  { id: 'exercicio',     emoji: '🏋️', nome: 'Exercício físico',   titulo: '3 exercícios por dia', unidade: 'exercícios', meta: 3,  dias: 30, opcoes: [1],        prova: 'video',
    desc: 'Faça 3 exercícios por dia e comprove cada um em vídeo.' },
  { id: 'flexibilidade', emoji: '🤸', nome: 'Flexibilidade',      titulo: 'Alongar todo dia',    unidade: 'min',        meta: 10, dias: 21, opcoes: [5, 10],    prova: 'video',
    desc: 'Alongue por 10 minutos por dia.' },
  { id: 'meditacao',     emoji: '🧘', nome: 'Meditação',          titulo: 'Meditar todo dia',    unidade: 'min',        meta: 10, dias: 21, opcoes: [5, 10],    prova: 'honra',
    desc: 'Medite por 10 minutos por dia. (Prova por honra — meditação não se filma.)' },
  { id: 'corrida',       emoji: '🏃', nome: 'Corrida',            titulo: 'Correr 5 km',         unidade: 'km',         meta: 5,  dias: 30, opcoes: [],         prova: 'video',
    desc: 'Corra 5 km por dia. Comprove com o print do app + um vídeo curto.' },
  { id: 'leitura',       emoji: '📖', nome: 'Leitura',            titulo: 'Ler 20 páginas',      unidade: 'páginas',    meta: 20, dias: 30, opcoes: [],         prova: 'video',
    desc: 'Leia 20 páginas por dia.' },
  { id: 'autoconhecimento', emoji: '🧠', nome: 'Autoconhecimento', titulo: 'Uma reflexão por dia', unidade: 'reflexão',  meta: 1,  dias: 21, opcoes: [1],        prova: 'honra',
    desc: 'Reserve um momento por dia pra se olhar por dentro: como foi seu dia, o que você sentiu e o que aprendeu. (Prova por honra — isso é seu.)' },
];

export const MOLDE_BY_ID = Object.fromEntries(MOLDES.map(m => [m.id, m]));

// ── Modalidades ──────────────────────────────────────────────
// oficial só aparece pra admin. A prenda é combinada ANTES de abrir.
export const MODALIDADES = [
  { id: 'individual', emoji: '🧍', nome: 'Sozinho',
    desc: 'Só você. Ninguém mais pode ver o que acontece dentro.' },
  { id: 'amigos',     emoji: '👥', nome: 'Com amigos',
    desc: 'Você convida por código. Só os convidados entram, e mais ninguém pode ver o que acontece dentro.' },
  { id: 'oficial',    emoji: '🏆', nome: 'Oficial', adminOnly: true,
    desc: 'Aberto a todos que quiserem participar, mas só os participantes veem o que acontece dentro.' },
];

// ── Prendas sugeridas (quem não conclui paga) ────────────────
// Regra de ouro: leve e do bem, nunca degradante. O criador pode escrever a sua.
export const PRENDAS = [
  'Cantar o refrão de uma música no grupo 🎤',
  'Pagar o café do grupo ☕',
  'Contar a pior piada que sabe 😂',
  '20 flexões em vídeo 💪',
  'Elogiar publicamente cada membro do grupo 💛',
  'Postar uma foto ridícula de criança 👶',
  'Mandar um áudio cantando o hino do Falcon 🦅',
];

// Código de convite curto e legível (sem 0/O/1/I pra não confundir)
export function gerarCodigo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// Emoji do desafio a partir do tipo salvo (fallback 🏆)
export function emojiDoTipo(tipo) {
  return MOLDE_BY_ID[tipo]?.emoji || '🏆';
}
