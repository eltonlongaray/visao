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

// Emoji do desafio a partir do tipo salvo (fallback 🏆)
export function emojiDoTipo(tipo) {
  return MOLDE_BY_ID[tipo]?.emoji || '🏆';
}
