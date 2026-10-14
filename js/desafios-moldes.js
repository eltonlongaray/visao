// ═══════════════════════════════════════════════════════════════
// FALCON · Moldes de desafio (pré-formatos por tipo)
// Admin escolhe um molde → formulário já vem preenchido com o formato certo.
// prova: 'video' (grava ao vivo no app) | 'strava' (print do Strava + vídeo ao vivo)
//        | 'depoimento' (vídeo ao vivo falando, até 5 min, com roteiro)
//        | 'honra' (marca sem vídeo: só desafios antigos, não se cria mais).
// largar: true = desafio de largar um vício (todo dia: "consegui" ou "não consegui", os dois com depoimento).
// horaLimite: check-in só até esse horário (o banco confere).
// opcoes vazio = pessoa digita a quantidade. Tudo editável na criação.
// ═══════════════════════════════════════════════════════════════
export const MOLDES = [
  { id: 'agua',          emoji: '💧', nome: 'Água',               titulo: 'Beber 2L de água',   unidade: 'ml',         meta: 2000, dias: 21, opcoes: [],         prova: 'video',
    desc: 'Beba 2L de água por dia, no copo ou na garrafa. Em cada vídeo, diga quantos ml está bebendo; o app soma até fechar a meta.' },
  { id: 'exercicio',     emoji: '🏋️', nome: 'Constância de exercício', titulo: 'Exercício todo dia', unidade: 'exercícios', meta: 2, dias: 30, opcoes: [1], prova: 'video',
    exercicios: ['Flexão', 'Agachamento', 'Abdominal', 'Prancha'], maxPorDia: 2, naoRepetir: true,
    desc: 'Até 2 exercícios por dia da lista, sem repetir o de ontem: hoje uns, amanhã outros. Cada um comprovado em vídeo ao vivo.' },
  { id: 'flexibilidade', emoji: '🤸', nome: 'Flexibilidade',      titulo: 'Alongar todo dia',    unidade: 'min',        meta: 10, dias: 21, opcoes: [5, 10],    prova: 'video',
    desc: 'Alongue por 10 minutos por dia.' },
  { id: 'meditacao',     emoji: '🧘', nome: 'Meditação',          titulo: 'Meditar todo dia',    unidade: 'min',        meta: 10, dias: 21, opcoes: [],         prova: 'depoimento',
    desc: 'Medite no mínimo 10 minutos por dia. Depois, num vídeo de depoimento, conte quanto tempo meditou e como você se sentiu.' },
  { id: 'corrida',       emoji: '🏃', nome: 'Corrida',            titulo: 'Correr 5 km',         unidade: 'km',         meta: 5,  dias: 30, opcoes: [],         prova: 'strava',
    desc: 'Corra 5 km por dia, na rua ou na esteira. Na rua, meça no Strava e mande o print; na esteira, foto do painel antes e depois. Nos dois, um vídeo ao vivo correndo nos últimos minutos.' },
  { id: 'leitura',       emoji: '📖', nome: 'Leitura',            titulo: 'Ler 20 páginas',      unidade: 'páginas',    meta: 20, dias: 30, opcoes: [],         prova: 'depoimento',
    desc: 'Leia no mínimo 20 páginas por dia. No vídeo de depoimento, conte quantas páginas leu e até 5 coisas que você aprendeu ou que te marcaram.' },
  { id: 'largar',        emoji: '🚭', nome: 'Largar um vício',    titulo: 'Parar de fumar',      unidade: '',           meta: null, dias: 30, opcoes: [],       prova: 'depoimento', largar: true,
    desc: 'Todo dia você grava um depoimento contando como foi: conseguiu ou não, e como está sendo o processo. A constância é o depoimento: quem não grava perde o dia. Os dias limpos contam numa sequência à parte. Ninguém julga, todo mundo apoia.' },
  { id: 'acordar',       emoji: '⏰', nome: 'Acordar cedo',       titulo: 'Acordar às 5h',       unidade: '',           meta: null, dias: 21, opcoes: [],       prova: 'video', horaLimite: '05:30',
    desc: 'Acorde às 5h e grave um vídeo ao vivo mostrando a hora no celular. O check-in só vale até o horário limite.' },
  { id: 'autoconhecimento', emoji: '🧠', nome: 'Autoconhecimento', titulo: 'Uma reflexão por dia', unidade: 'reflexão',  meta: 1,  dias: 21, opcoes: [],         prova: 'depoimento',
    desc: 'Reserve um momento por dia pra se olhar por dentro. Num vídeo de depoimento, conte como foi seu dia, o que você sentiu e o que aprendeu.' },
  { id: 'livre',         emoji: '✏️', nome: 'Do seu jeito',       titulo: '',                    unidade: '',           meta: null, dias: 21, opcoes: [],       prova: 'video',
    desc: '' },
];

// Roteiro do depoimento: aparece na tela de gravar, pra pessoa saber o que falar
// Quantas coisas contar no depoimento: o número que o criador pôs na descrição
// ou nas regras ("3 coisas", "duas lições"). Sem número, até 5.
const NUM_EXTENSO = { uma: 1, um: 1, duas: 2, dois: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
export function coisasDoDesafio(d) {
  const t = `${d?.descricao || ''}\n${d?.regras_dono || ''}`.toLowerCase();
  const m = t.match(/\b(\d{1,2}|uma|um|duas|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(coisas?|ideias?|li[cç](?:ão|ões)|aprendizados?|pontos?|frases?|trechos?)\b/);
  if (!m) return 5;
  const n = /\d/.test(m[1]) ? parseInt(m[1], 10) : NUM_EXTENSO[m[1]];
  return n >= 1 && n <= 20 ? n : 5;
}

export function roteiroDepoimento(d, { falhou = false } = {}) {
  if (d?.tipo === 'meditacao') return ['Quanto tempo você meditou hoje', 'Como você se sentiu antes e depois', 'O que passou pela sua cabeça'];
  if (d?.tipo === 'autoconhecimento') return ['Como foi o seu dia', 'O que você sentiu', 'O que você aprendeu sobre você'];
  if (d?.tipo === 'leitura') return ['Qual livro e quantas páginas você leu hoje', (coisasDoDesafio(d) === 1 ? 'Uma coisa que você aprendeu ou que te marcou' : `Até ${coisasDoDesafio(d)} coisas que você aprendeu ou que te marcaram`), 'O que vai levar pra sua vida'];
  if (ehLargar(d)) return falhou
    ? ['O que aconteceu hoje e o que te levou a escorregar', 'Como você está se sentindo', 'O que vai fazer diferente amanhã']
    : ['Como foi o dia sem o vício', 'Se deu vontade, o que você fez na hora', 'Como está sendo o processo pra você'];
  return ['O que você fez hoje no desafio', 'Como está sendo o processo pra você'];
}

// Depoimento com meta (Leitura, Meditação): a meta é o mínimo do grupo; a pessoa
// digita quanto fez e conta no vídeo, e o app soma
export function depoimentoConta(d) {
  return d?.prova === 'depoimento' && !ehLargar(d);
}
export const MIN_PAGINAS = 2;

// Água: cada vídeo a pessoa diz quantos ml bebe nele e o app soma até a meta
export function ehAgua(d) {
  return d?.tipo === 'agua';
}

// Desafio de largar um vício (pelo molde)
export function ehLargar(d) {
  return d?.tipo === 'largar';
}

// Horário limite em 'HH:MM' (o banco guarda 'HH:MM:SS')
export function horaLimite(d) {
  const h = String(d?.hora_limite || '').slice(0, 5);
  return /^\d\d:\d\d$/.test(h) ? h : '';
}

// Já passou do horário limite agora? (hora de Brasília, igual ao banco)
export function passouDoLimite(d, agora = new Date()) {
  const h = horaLimite(d);
  if (!h) return false;
  const now = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  return now > h;
}

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
  // Do Élton (13/10)
  'Fazer 30 agachamentos com um ovo na boca 🥚',
  'Chupar 1 limão sem fazer careta 🍋',
  'Fritar um ovo como se fosse um MasterChef 🍳',
  'Se filmar soltando um pum barulhento 💨',
  // Mais ideias
  'Dançar 30 segundos de uma música que o grupo escolher 💃',
  'Imitar um bicho por 15 segundos 🐔',
  'Falar um trava-língua 3 vezes seguidas sem errar 👅',
  'Narrar um lance de futebol como locutor de TV ⚽',
  'Cantar uma música infantil com voz de ópera 🎶',
  'Desfilar pela casa como modelo, com roupa improvisada 👗',
  'Andar 20 passos como pinguim 🐧',
  'Comer batata frita com molho no umbigo de alguém da família 🍟',
  'Fazer 20 polichinelos cantando parabéns 🎂',
  'Comer uma colher BEM cheia de farofa, sem beber nada depois 🥄',
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
  'Prova em vídeo e depoimento são gravados ao vivo, pela câmera do Falcon. Vídeo da galeria não vale.',
  'Na corrida, vale o print do Strava (ou, na esteira, a foto do painel antes e depois, tirada pelo Falcon) junto com o vídeo ao vivo correndo nos últimos minutos.',
  'Os vídeos das provas só aparecem pra quem está no desafio e somem em 7 dias.',
  'Prenda é leve e do bem, nunca constrangedora. Quem não concluir grava a prenda em vídeo ao vivo e ela vai pro Mural das Prendas do app: todo mundo do Falcon vê, por 7 dias, sem opção de download.',
  'Fora o Mural das Prendas, ninguém expõe quem falhou fora do grupo.',
];

// Aviso que quem é desafiado precisa ver ANTES de entrar (Élton, 13/10)
export const AVISO_MURAL = 'A prenda é gravada em vídeo e fica no Mural das Prendas do app, pra todo mundo ver, por 7 dias, sem download.';

// Deve a prenda? Devolve o motivo (texto) ou null.
//   • perdeu a semana da corrida (na hora), ou
//   • o desafio acabou e faltou dia com a meta batida, contando do dia em
//     que a pessoa entrou (ou do início, se entrou antes).
export function devePrenda(d, meus, joinedAt, hoje = _hojeBR()) {
  if (!d?.prenda) return null;
  const seg = semanaSemCorrida(d, meus, joinedAt, hoje);
  if (seg) return `a semana fechou sem a corrida (${textoSemanaPerdida(seg)})`;
  const fim = String(d.data_fim || '').slice(0, 10);
  if (!fim || hoje <= fim) return null;
  let ini = String(d.data_inicio || d.created_at || '').slice(0, 10);
  const entrou = joinedAt ? new Date(joinedAt).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
  if (entrou > ini) ini = entrou;
  if (!ini || ini > fim) return null;
  const porDia = {};
  (meus || []).forEach(c => { porDia[c.dia] = (porDia[c.dia] || 0) + (c.quantidade || 0); });
  const largar = d.tipo === 'largar', meta = d.meta_diaria;
  let faltou = 0;
  for (let dia = ini; dia <= fim; dia = somarDias(dia, 1)) {
    const q = porDia[dia];
    const ok = q !== undefined && (largar || (meta ? q >= meta : q > 0));
    if (!ok) faltou++;
  }
  return faltou ? `o desafio acabou e ${faltou === 1 ? 'faltou 1 dia' : `faltaram ${faltou} dias`}` : null;
}

// O que o desafio pede como prova, em palavras
export function textoProva(d) {
  if (d.prova === 'video') return '🎥 Vídeo ao vivo';
  if (d.prova === 'strava') return '🏃 Print do Strava (ou painel da esteira) + vídeo ao vivo';
  if (d.prova === 'depoimento') return '🎙️ Depoimento em vídeo';
  if (d.prova === 'honra') return '🤝 Por honra (só marcar)';
  return '';
}

// ── Data de início ───────────────────────────────────────────
// 'YYYY-MM-DD' ± n dias (meio-dia: sem susto de fuso)
export function somarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}
const _hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
// "seg 19/10"
export function dataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  return `${sem} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
// Começa no futuro? (sem data = já está valendo)
export function aindaNaoComecou(d, hoje = _hojeBR()) {
  const ini = String(d?.data_inicio || '').slice(0, 10);
  return !!ini && hoje < ini;
}
// Dá pra mudar a regra? (mesma conta do banco, migration/desafios-propostas.sql)
//   'livre'    = ninguém além do dono (ou não é de amigos): edita direto
//   'proposta' = tem gente e ninguém mandou prova ainda: vai pro grupo aceitar
//   'travada'  = alguém já mandou a primeira prova: não muda mais
export function modoEdicao(d, parts, checks) {
  const temGente = (parts || []).some(p => p.desafio_id === d.id && p.user_id !== d.author_id);
  if (d.modalidade !== 'amigos' || !temGente) return 'livre';
  const temProva = (checks || []).some(c => c.desafio_id === d.id);
  return temProva ? 'travada' : 'proposta';
}
// Dia N do desafio (1 = primeiro dia). null sem data de início.
export function diaDoDesafio(d, hoje = _hojeBR()) {
  const ini = String(d?.data_inicio || '').slice(0, 10);
  if (!ini) return null;
  return Math.round((new Date(hoje + 'T12:00:00') - new Date(ini + 'T12:00:00')) / 86400000) + 1;
}
// "começa amanhã", "começa seg 19/10"
export function textoComeca(d, hoje = _hojeBR()) {
  const ini = String(d?.data_inicio || '').slice(0, 10);
  if (!ini) return '';
  if (ini === hoje) return 'começa hoje';
  if (ini === somarDias(hoje, 1)) return 'começa amanhã';
  return `começa ${dataCurta(ini)}`;
}

// Regras do Falcon que valem PRA ESSE desafio (sem falar de Strava num desafio de leitura)
export function regrasFixasDo(d) {
  const ex = Array.isArray(d?.exercicios) ? d.exercicios : [];
  const comVideo = ['video', 'depoimento', 'strava'].includes(d?.prova);
  const corrida = d?.prova === 'strava' || d?.tipo === 'corrida' || ex.some(x => /corrida/i.test(x));
  return [
    comVideo && REGRAS_FIXAS[0],
    corrida && REGRAS_FIXAS[1],
    comVideo && REGRAS_FIXAS[2],
    d?.prenda && REGRAS_FIXAS[3],
    REGRAS_FIXAS[4],
  ].filter(Boolean);
}

// O mesmo resumo no convite do WhatsApp e no 📜 Regras do grupo:
// info = como funciona; regras = exercícios + o que o dono escreveu.
export function resumoDoDesafio(d) {
  const prova = textoProva(d);
  const ini = String(d.data_inicio || '').slice(0, 10);
  const info = [
    ini ? `📅 Começa ${dataCurta(ini)}${d.dias_total ? ` · ${d.dias_total} dias` : ''}` : (d.dias_total && `📅 ${d.dias_total} dias`),
    d.meta_diaria && `🎯 ${depoimentoConta(d) ? 'Mínimo' : 'Meta'}: ${d.meta_diaria} ${d.unidade || ''} por dia`.replace(/\s+por/, ' por'),
    prova && `✅ Prova: ${prova.replace(/^\S+\s/, '')}`,
    horaLimite(d) && `⏰ Prova do dia só até as ${horaLimite(d)}`,
    d.prenda && `🎭 Quem não concluir: ${d.prenda}`,
    d.prenda && `📢 ${AVISO_MURAL}`,
  ].filter(Boolean);
  const ex = Array.isArray(d.exercicios) && d.exercicios.length ? d.exercicios : null;
  const regras = [
    ...(ex ? [`Até ${d.max_por_dia || d.meta_diaria || 1} por dia, da lista: ${ex.join(', ')}`] : []),
    ...(ex && d.nao_repetir !== false ? ['Não pode repetir o exercício de ontem'] : []),
    ...regrasCorrida(d),
    ...regrasDoDono(d),
  ];
  return { info, regras };
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
  const correuHoje = feitosHoje.has('Corrida');
  return lista.map(nome => {
    if (feitosHoje.has(nome)) return { nome, ok: false, feito: true, motivo: 'feito hoje' };
    // Corrida fecha o dia sozinha: fora do limite e do "não repetir"
    if (nome === 'Corrida') {
      const sem = corridaTroca(d) ? corridasDaSemana(d, meus, hoje) : null;
      if (sem && !sem.falta) return { nome, ok: false, motivo: 'corrida da semana já feita' };
      return { nome, ok: true };
    }
    if (correuHoje) return { nome, ok: false, motivo: 'o dia fechou com a corrida' };
    if (d.nao_repetir !== false && deOntem.has(nome)) return { nome, ok: false, motivo: 'feito ontem' };
    if (cheio) return { nome, ok: false, motivo: 'limite do dia' };
    return { nome, ok: true };
  });
}

// Quantos exercícios contam hoje: a corrida vale o dia todo (= o limite)
export function feitosHoje(lista, lim) {
  if (lista.some(x => x.nome === 'Corrida' && x.feito)) return lim;
  return lista.filter(x => x.feito).length;
}

// ── Corrida por semana (desafio de exercício com Corrida na lista) ──
// Semana de segunda a domingo. null quando o desafio não pede.
export function segundaDaSemana(hoje) {
  const dow = new Date(hoje + 'T12:00:00').getDay();
  return somarDias(hoje, -((dow + 6) % 7));
}
export function corridasDaSemana(d, meus, hoje) {
  const meta = Number(d?.corridas_semana) || 0;
  if (!meta || !(Array.isArray(d?.exercicios) && d.exercicios.includes('Corrida'))) return null;
  const seg = segundaDaSemana(hoje), dom = somarDias(seg, 6);
  const feitas = new Set(meus.filter(c => c.exercicio === 'Corrida' && c.dia >= seg && c.dia <= dom).map(c => c.dia)).size;
  return { feitas, meta, falta: Math.max(0, meta - feitas), domingo: dom, troca: corridaTroca(d) };
}
export const textoCorridasSemana = (n) => `${n} ${n === 1 ? 'corrida' : 'corridas'} por semana`;
// Modo da corrida no desafio de exercício:
//   'obrigatoria' (padrão): X corridas por semana, quem não corre perde
//   'troca': opcional, dá pra trocar um dia de exercício por corrida X vez(es) na semana
export const corridaTroca = (d) => d?.corrida_modo === 'troca';
export function regrasCorrida(d) {
  const ex = Array.isArray(d?.exercicios) ? d.exercicios : [];
  if (!ex.includes('Corrida') || !d.corridas_semana) return [];
  const km = d.km_corrida ? ` de ${d.km_corrida} km` : '';
  if (corridaTroca(d)) {
    const n = d.corridas_semana === 1 ? '1 vez' : `${d.corridas_semana} vezes`;
    return [`🔁 Corrida${km} ${n} por semana (de segunda a domingo), na rua ou na esteira, no lugar dos exercícios daquele dia. Se não correr, os exercícios de todo dia seguem valendo`];
  }
  return [`🏃 Corrida: ${textoCorridasSemana(d.corridas_semana)}${km} (de segunda a domingo), na rua ou na esteira. No dia que correr, a corrida vale o dia todo, sem os outros exercícios`,
    '❌ Quem fechar a semana sem a corrida perde o desafio'];
}
// Distância de cada corrida: até 5 km, que cabe em 30 min pra quase todo mundo
export const KM_CORRIDA = [2, 3, 4, 5];
export const MAX_KM_CORRIDA = 5;

// Perdeu o desafio? Semana CHEIA (seg a dom, dentro do desafio e depois que a
// pessoa entrou) que terminou sem as corridas pedidas. Devolve a segunda
// dessa semana, ou null. A mesma conta está no gatilho do banco.
export function semanaSemCorrida(d, meus, joinedAt, hoje = _hojeBR()) {
  const meta = Number(d?.corridas_semana) || 0;
  if (!meta || corridaTroca(d) || !(Array.isArray(d?.exercicios) && d.exercicios.includes('Corrida'))) return null;
  const diaBR = (t) => (t ? new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '');
  const ini = [String(d.data_inicio || '').slice(0, 10) || diaBR(d.created_at), diaBR(joinedAt)].filter(Boolean).sort().pop();
  if (!ini) return null;
  const fim = String(d.data_fim || '').slice(0, 10);
  const corri = new Set(meus.filter(c => c.exercicio === 'Corrida').map(c => c.dia));
  let seg = segundaDaSemana(ini);
  if (seg < ini) seg = somarDias(seg, 7);
  for (; somarDias(seg, 6) < hoje && (!fim || somarDias(seg, 6) <= fim); seg = somarDias(seg, 7)) {
    let n = 0;
    for (let i = 0; i < 7; i++) if (corri.has(somarDias(seg, i))) n++;
    if (n < meta) return seg;
  }
  return null;
}
export const textoSemanaPerdida = (seg) => `a semana de ${dataCurta(seg).split(' ')[1]} a ${dataCurta(somarDias(seg, 6)).split(' ')[1]} fechou sem a corrida`;

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

// ── Proposta de mudança: o que mudou, em palavras ────────────
// atual = desafio como está; patch = colunas do formulário (patchDesafio).
// Devolve { mudancas: {coluna: novo}, resumo: ['Prenda: X → Y', …] }.
const ROTULO_COLUNA = {
  titulo: 'Título', descricao: 'Descrição', dias_total: 'Dias', meta_diaria: 'Meta por dia',
  unidade: 'Unidade', prova_opcoes: 'Botões de somar', prenda: 'Prenda', data_inicio: 'Começa',
  data_fim: 'Termina', prova: 'Prova', exercicios: 'Exercícios', max_por_dia: 'Exercícios por dia',
  nao_repetir: 'Não repetir o de ontem', regras_dono: 'Regras do dono', hora_limite: 'Prova do dia só até',
  corridas_semana: 'Corridas por semana', km_corrida: 'Km por corrida', corrida_modo: 'Como a corrida entra',
  tipo: 'Tipo',
};
const _normCampo = (k, v) => {
  if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (k === 'hora_limite' && v) return String(v).slice(0, 5);
  if (k === 'corrida_modo' && v === 'obrigatoria') return null;   // sem modo = obrigatória
  if (k === 'data_inicio' || k === 'data_fim') return v ? String(v).slice(0, 10) : null;
  if (typeof v === 'string') return v.trim() || null;
  return v;
};
function _textoCampo(k, v, inteiro = false) {
  if (v === null) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (k === 'data_inicio' || k === 'data_fim') return dataCurta(v);
  if (k === 'prova') return textoProva({ prova: v }).replace(/^\S+\s/, '') || v;
  if (k === 'corrida_modo') return v === 'troca' ? 'corrida ou exercícios' : 'obrigatória';
  const t = String(v).replace(/[ \t]+/g, ' ').trim();
  return inteiro || t.length <= 60 ? t : t.slice(0, 57) + '…';
}
// Compara palavra por palavra: devolve os pedaços do antes e do depois, cada um
// marcado se saiu/entrou. Texto grande demais vira "tudo mudou" (a conta é n×m).
function _diffPalavras(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  if (A.length * B.length > 250000) return { antes: [[a, true]], depois: [[b, true]] };
  const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const antes = [], depois = [];
  const poe = (lista, t, mudou) => {
    const u = lista[lista.length - 1];
    // espaço entre duas palavras mudadas fica junto do destaque
    if (u && (u[1] === mudou || (/^\s+$/.test(t) && mudou === false && u[1]))) u[0] += t;
    else lista.push([t, mudou]);
  };
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { poe(antes, A[i], false); poe(depois, B[j], false); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) poe(antes, A[i++], true);
    else poe(depois, B[j++], true);
  }
  while (i < A.length) poe(antes, A[i++], true);
  while (j < B.length) poe(depois, B[j++], true);
  return { antes, depois };
}
// O que a proposta muda, campo por campo, com o antes e o depois inteiros.
// Cada lado vem em pedaços [texto, mudou] pra tela destacar só o que mudou.
export function comparacaoProposta(atual, mudancas) {
  const out = [];
  for (const k of Object.keys(ROTULO_COLUNA)) {
    if (!mudancas || !(k in mudancas)) continue;
    if (k === 'data_fim' && ('data_inicio' in mudancas || 'dias_total' in mudancas)) continue;
    const a = _textoCampo(k, _normCampo(k, atual?.[k]), true);
    const n = _textoCampo(k, _normCampo(k, mudancas[k]), true);
    const texto = (k === 'descricao' || k === 'regras_dono' || k === 'titulo' || k === 'exercicios') && a !== '—' && n !== '—';
    const d = texto ? _diffPalavras(a, n) : { antes: [[a, true]], depois: [[n, true]] };
    out.push({ rotulo: ROTULO_COLUNA[k], ...d });
  }
  return out;
}
export function diffDesafio(atual, patch) {
  const mudancas = {}, resumo = [];
  for (const k of Object.keys(ROTULO_COLUNA)) {
    if (!(k in patch)) continue;
    const a = _normCampo(k, atual?.[k]), n = _normCampo(k, patch[k]);
    if (JSON.stringify(a) === JSON.stringify(n)) continue;
    mudancas[k] = n;
    // data_fim acompanha a data de início/dias: não precisa de linha própria
    if (k === 'data_fim' && ('data_inicio' in mudancas || 'dias_total' in mudancas)) continue;
    resumo.push(`• ${ROTULO_COLUNA[k]}: ${_textoCampo(k, a, true)} → ${_textoCampo(k, n, true)}`);
  }
  return { mudancas, resumo };
}
