// ─── ÍNDICE ──────────────────────────────────────────────────
// Exercícios de cada músculo (Élton, 03/11): a pessoa escolhe o que fez,
// porque nem toda academia tem todo aparelho. `top` = aparece primeiro no
// pop-up; o resto fica em "Ver todos". `al` = jeitos de falar (Pet), sem acento.
// BLOCO 1 — LISTA POR MÚSCULO
// BLOCO 2 — ACHAR EXERCÍCIOS NUM TEXTO
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: LISTA POR MÚSCULO
// ═══════════════════════════════════════════════════════════════
const E = (nome, al = [], top = false) => ({ nome, al, top });

export const EXERCICIOS = {
  peito: [
    E('Supino reto', ['supino reto', 'supino', 'supino com barra'], true),
    E('Supino inclinado', ['supino inclinado'], true),
    E('Supino com halteres', ['supino com halter', 'supino com halteres', 'supino halter'], true),
    E('Crucifixo', ['crucifixo', 'crucifixo reto'], true),
    E('Crossover', ['crossover', 'cross over', 'cruzamento na polia'], true),
    E('Peck deck (voador)', ['peck deck', 'peckdeck', 'voador', 'fly']),
    E('Supino declinado', ['supino declinado']),
    E('Crucifixo inclinado', ['crucifixo inclinado']),
    E('Supino na máquina', ['supino na maquina', 'supino maquina', 'chest press']),
    E('Flexão de braço', ['flexao de braco', 'flexao', 'flexoes']),
    E('Paralelas', ['paralela', 'paralelas', 'mergulho na paralela']),
    E('Pullover', ['pullover', 'pull over']),
  ],
  costas: [
    E('Barra fixa', ['barra fixa', 'barra', 'pull up', 'pullup'], true),
    E('Puxada frontal', ['puxada frontal', 'puxada', 'puxada alta', 'pulley', 'pulldown frente'], true),
    E('Remada curvada', ['remada curvada', 'remada com barra'], true),
    E('Remada baixa', ['remada baixa', 'remada sentada', 'remada no cabo'], true),
    E('Serrote (remada unilateral)', ['serrote', 'remada unilateral', 'remada com halter'], true),
    E('Remada inclinada', ['remada inclinada', 'remada no banco inclinado']),
    E('Puxada triângulo', ['puxada triangulo', 'triangulo']),
    E('Remada cavalinho', ['remada cavalinho', 'cavalinho', 't bar']),
    E('Remada na máquina', ['remada na maquina', 'remada maquina', 'remada articulada']),
    E('Pulldown braço reto', ['pulldown', 'braco reto', 'pullover na polia']),
    E('Levantamento terra', ['levantamento terra', 'terra', 'deadlift']),
    E('Hiperextensão lombar', ['hiperextensao', 'extensao lombar', 'lombar']),
    E('Remada', ['remada']),   // genérico: quando a pessoa fala só "remada"
  ],
  ombros: [
    E('Desenvolvimento com halteres', ['desenvolvimento com halter', 'desenvolvimento com halteres', 'desenvolvimento'], true),
    E('Elevação lateral', ['elevacao lateral', 'lateral'], true),
    E('Elevação frontal', ['elevacao frontal', 'frontal'], true),
    E('Desenvolvimento militar', ['desenvolvimento militar', 'militar', 'desenvolvimento com barra'], true),
    E('Crucifixo invertido', ['crucifixo invertido', 'voador invertido', 'peck deck invertido', 'posterior de ombro']),
    E('Desenvolvimento na máquina', ['desenvolvimento na maquina', 'desenvolvimento maquina']),
    E('Arnold press', ['arnold']),
    E('Face pull', ['face pull']),
    E('Remada alta', ['remada alta']),
  ],
  trapezio: [
    E('Encolhimento com halteres', ['encolhimento com halter', 'encolhimento com halteres', 'encolhimento'], true),
    E('Encolhimento com barra', ['encolhimento com barra'], true),
    E('Encolhimento na máquina', ['encolhimento na maquina']),
    E('Caminhada do fazendeiro', ['farmer', 'caminhada do fazendeiro']),
  ],
  biceps: [
    E('Rosca direta', ['rosca direta', 'rosca direto', 'rosca com barra', 'rosca na barra', 'rosca barra'], true),
    E('Rosca direta com halteres', ['rosca direta com halteres', 'rosca direta com halter', 'rosca direto com halteres', 'rosca direto com halter', 'rosca com halteres', 'rosca com halter'], true),
    E('Rosca alternada', ['rosca alternada', 'alternada'], true),
    E('Rosca martelo', ['rosca martelo', 'martelo'], true),
    E('Rosca inclinada', ['rosca inclinada'], true),
    E('Rosca Scott', ['rosca scott', 'scott'], true),
    E('Rosca concentrada', ['rosca concentrada', 'concentrada']),
    E('Rosca na polia', ['rosca na polia', 'rosca no cabo', 'rosca polia']),
    E('Rosca W', ['rosca w', 'barra w']),
    E('Rosca', ['rosca']),     // genérico
  ],
  triceps: [
    E('Tríceps na polia com barra', ['triceps na polia', 'triceps pulley', 'triceps polia', 'triceps barra', 'pulley de triceps', 'triceps na polia com barra', 'triceps na polia com a barra', 'triceps polia com barra', 'triceps pulley com barra', 'triceps com barra', 'triceps com a barra', 'triceps na barra', 'triceps de barra', 'polia com barra', 'pulley com barra'], true),
    E('Tríceps na polia com corda', ['triceps corda', 'triceps na corda', 'corda', 'triceps na polia com corda', 'triceps na polia com a corda', 'triceps polia com corda', 'triceps pulley com corda', 'triceps com corda', 'triceps com a corda', 'triceps de corda', 'polia com corda', 'pulley com corda'], true),
    E('Tríceps testa', ['triceps testa', 'testa'], true),
    E('Tríceps francês', ['triceps frances', 'frances'], true),
    E('Mergulho no banco', ['mergulho no banco', 'triceps banco', 'triceps no banco']),
    E('Tríceps coice', ['triceps coice', 'coice', 'kickback']),
    E('Supino fechado', ['supino fechado']),
  ],
  abdomen: [
    E('Abdominal', ['abdominal', 'crunch'], true),
    E('Prancha', ['prancha'], true),
    E('Elevação de pernas', ['elevacao de pernas', 'elevacao de perna'], true),
    E('Abdominal infra', ['abdominal infra', 'infra']),
    E('Abdominal oblíquo', ['abdominal obliquo', 'obliquo']),
    E('Abdominal na polia', ['abdominal na polia', 'abdominal no cabo']),
    E('Roda abdominal', ['roda abdominal', 'rodinha']),
  ],
  gluteo: [
    E('Elevação pélvica', ['elevacao pelvica', 'pelvica', 'hip thrust'], true),
    E('Glúteo na polia', ['gluteo na polia', 'gluteo no cabo', 'coice na polia'], true),
    E('Abdutora', ['abdutora', 'abducao', 'cadeira abdutora'], true),
    E('Agachamento sumô', ['agachamento sumo', 'sumo']),
    E('Glúteo 4 apoios', ['quatro apoios', '4 apoios']),
    E('Ponte', ['ponte']),
  ],
  quadriceps: [
    E('Agachamento livre', ['agachamento livre', 'agachamento'], true),
    E('Leg press', ['leg press', 'leg'], true),
    E('Cadeira extensora', ['cadeira extensora', 'extensora'], true),
    E('Afundo (passada)', ['afundo', 'passada', 'avanco'], true),
    E('Hack', ['hack machine', 'hack']),
    E('Agachamento no Smith', ['agachamento no smith', 'smith']),
    E('Agachamento búlgaro', ['agachamento bulgaro', 'bulgaro']),
    E('Agachamento goblet', ['goblet']),
  ],
  posterior: [
    E('Mesa flexora', ['mesa flexora', 'flexora deitada', 'flexora'], true),
    E('Cadeira flexora', ['cadeira flexora', 'flexora sentada'], true),
    E('Stiff', ['stiff'], true),
    E('Terra romeno', ['terra romeno', 'levantamento terra romeno', 'romeno']),
    E('Flexora em pé', ['flexora em pe']),
    E('Good morning', ['good morning']),
  ],
  panturrilha: [
    E('Panturrilha em pé', ['panturrilha em pe', 'gemeos em pe', 'panturrilha na maquina'], true),
    E('Panturrilha sentado', ['panturrilha sentado', 'panturrilha sentada', 'gemeos sentado'], true),
    E('Panturrilha no leg press', ['panturrilha no leg', 'panturrilha no leg press']),
  ],
};

// Nome genérico ("Rosca", "Remada"): só serve pro Pet quando a pessoa não diz qual
export const GENERICOS = new Set(['Rosca', 'Remada']);

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ACHAR EXERCÍCIOS NUM TEXTO (já sem acento e em minúsculas)
// ═══════════════════════════════════════════════════════════════
// [{ m, nome, ini, fim }] na ordem do texto. O jeito de falar mais longo
// ganha ("remada inclinada" e não "remada"; "puxada frontal" e não "frontal").
const _ALIAS = Object.entries(EXERCICIOS).flatMap(([m, lista]) => lista.flatMap(e => e.al.map(a => ({ a, m, nome: e.nome }))))
  .sort((x, y) => y.a.length - x.a.length);
export function acharExercicios(t) {
  const achados = [];
  const livre = (i, f) => !achados.some(x => i < x.fim && f > x.ini);
  for (const { a, m, nome } of _ALIAS) {
    const re = new RegExp(`(^|[^a-z0-9])(${a.replace(/ /g, '\\s+')})(?=$|[^a-z0-9])`, 'g');
    let r;
    while ((r = re.exec(t))) {
      const ini = r.index + r[1].length, fim = ini + r[2].length;
      if (livre(ini, fim)) achados.push({ m, nome, ini, fim });
    }
  }
  return achados.sort((x, y) => x.ini - y.ini);
}
