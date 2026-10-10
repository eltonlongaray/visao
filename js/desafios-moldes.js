// ═══════════════════════════════════════════════════════════════
// FALCON · Moldes de desafio (pré-formatos por tipo)
// Admin escolhe um molde → formulário já vem preenchido com o formato certo.
// prova: 'video' (grava ao vivo no app) | 'strava' (print do Strava + vídeo ao vivo) | 'honra' (marca sem vídeo).
// opcoes vazio = pessoa digita a quantidade. Tudo editável na criação.
// ═══════════════════════════════════════════════════════════════
export const MOLDES = [
  { id: 'agua',          emoji: '💧', nome: 'Água',               titulo: 'Beber 2L de água',   unidade: 'ml',         meta: 2000, dias: 21, opcoes: [250, 500], prova: 'video',
    desc: 'Beba 2L de água por dia. Grave um gole a cada garrafinha até fechar a meta.' },
  { id: 'exercicio',     emoji: '🏋️', nome: 'Constância de exercício', titulo: 'Exercício todo dia', unidade: 'exercícios', meta: 2, dias: 30, opcoes: [1], prova: 'video',
    exercicios: ['Flexão', 'Agachamento', 'Abdominal', 'Prancha'], maxPorDia: 2, naoRepetir: true,
    desc: 'Até 2 exercícios por dia da lista, sem repetir o de ontem: hoje uns, amanhã outros. Cada um comprovado em vídeo ao vivo.' },
  { id: 'flexibilidade', emoji: '🤸', nome: 'Flexibilidade',      titulo: 'Alongar todo dia',    unidade: 'min',        meta: 10, dias: 21, opcoes: [5, 10],    prova: 'video',
    desc: 'Alongue por 10 minutos por dia.' },
  { id: 'meditacao',     emoji: '🧘', nome: 'Meditação',          titulo: 'Meditar todo dia',    unidade: 'min',        meta: 10, dias: 21, opcoes: [5, 10],    prova: 'honra',
    desc: 'Medite por 10 minutos por dia. (Prova por honra — meditação não se filma.)' },
  { id: 'corrida',       emoji: '🏃', nome: 'Corrida',            titulo: 'Correr 5 km',         unidade: 'km',         meta: 5,  dias: 30, opcoes: [],         prova: 'strava',
    desc: 'Corra 5 km por dia. Meça no Strava e comprove com o print + um vídeo ao vivo correndo nos últimos minutos.' },
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

// ── Regras ───────────────────────────────────────────────────
// Fixas: valem pra todo desafio, o dono não muda. As do dono vêm em
// desafio.regras_dono e aparecem logo abaixo.
export const REGRAS_FIXAS = [
  'Prova em vídeo é gravada ao vivo, pela câmera do Falcon. Vídeo da galeria não vale.',
  'Na corrida, vale o print do Strava junto com o vídeo ao vivo correndo nos últimos minutos.',
  'Os vídeos só aparecem pra quem está no desafio e somem em 7 dias.',
  'Prenda é leve e do bem, nunca constrangedora.',
  'Celebra em público, cobra em particular: ninguém expõe quem falhou fora do grupo.',
];

// O que o desafio pede como prova, em palavras
export function textoProva(d) {
  if (d.prova === 'video') return '🎥 Vídeo ao vivo';
  if (d.prova === 'strava') return '🏃 Print do Strava + vídeo ao vivo';
  if (d.prova === 'honra') return '🤝 Por honra (só marcar)';
  return '';
}

// Regras do dono em linhas (texto livre, uma por linha)
export function regrasDoDono(d) {
  return String(d?.regras_dono || '').split(/\n+/).map(x => x.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
}

// Exercícios de hoje: cada um com ok/motivo, pelas regras do desafio.
// meus = check-ins MEUS nesse desafio. Mesmas regras do gatilho do banco.
export function exerciciosDeHoje(d, meus, hoje, ontem) {
  const lista = Array.isArray(d?.exercicios) ? d.exercicios : [];
  const deHoje = meus.filter(c => c.dia === hoje);
  const feitosHoje = new Set(deHoje.map(c => c.exercicio));
  const deOntem = new Set(meus.filter(c => c.dia === ontem).map(c => c.exercicio));
  const cheio = d.max_por_dia && deHoje.length >= d.max_por_dia;
  return lista.map(nome => {
    if (feitosHoje.has(nome)) return { nome, ok: false, feito: true, motivo: 'feito hoje' };
    if (d.nao_repetir !== false && deOntem.has(nome)) return { nome, ok: false, motivo: 'feito ontem' };
    if (cheio) return { nome, ok: false, motivo: 'limite do dia' };
    return { nome, ok: true };
  });
}

// A lista fecha com o limite? Sem repetir o de ontem, quem faz N por dia
// precisa de pelo menos 2N exercícios (N hoje, outros N amanhã).
export function avisoExercicios(lista, maxPorDia, naoRepetir) {
  const n = lista.length;
  if (!n) return '';
  if (n > 5) return 'No máximo 5 opções (4 exercícios + corrida).';
  if (naoRepetir && maxPorDia && n < maxPorDia * 2) {
    return `Com ${maxPorDia} por dia e sem repetir o de ontem, a lista precisa de pelo menos ${maxPorDia * 2} exercícios.`;
  }
  return '';
}

// Dia anterior a 'YYYY-MM-DD' (sem fuso: conta só a data)
export function diaAnterior(dia) {
  const [y, m, d] = dia.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d - 1));
  return x.toISOString().slice(0, 10);
}
