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
    E('Supino reto', ['supino reto', 'supino', 'supino com barra', 'supino reto com barra', 'supino horizontal', 'supino plano', 'bench press'], true),
    E('Supino inclinado', ['supino inclinado', 'supino inclinado com barra', 'supino inclinado com halter', 'supino inclinado com halteres', 'incline press'], true),
    E('Supino com halteres', ['supino com halter', 'supino com halteres', 'supino halter', 'supino reto com halter', 'supino reto com halteres', 'dumbbell press'], true),
    E('Crucifixo', ['crucifixo', 'crucifixo reto', 'crucifixo com halter', 'crucifixo com halteres', 'crucifixo reto com halteres', 'fly com halteres', 'abertura com halteres'], true),
    E('Crossover', ['crossover', 'cross over', 'cruzamento na polia', 'crossover na polia', 'cross over na polia', 'crucifixo na polia', 'voador na polia', 'cross'], true),
    E('Peck deck (voador)', ['peck deck', 'peckdeck', 'voador', 'fly']),
    E('Supino declinado', ['supino declinado', 'supino declinado com barra', 'supino declinado com halteres', 'decline press']),
    E('Crucifixo inclinado', ['crucifixo inclinado']),
    E('Supino na máquina', ['supino na maquina', 'supino maquina', 'chest press']),
    E('Flexão de braço', ['flexao de braco', 'flexao', 'flexoes', 'flexao de bracos', 'apoio de frente', 'push up', 'pushup']),
    E('Paralelas', ['paralela', 'paralelas', 'mergulho na paralela']),
    E('Pullover', ['pullover', 'pull over']),
  ],
  costas: [
    E('Barra fixa', ['barra fixa', 'barra', 'pull up', 'pullup', 'barra fixa pronada', 'barra fixa supinada', 'chin up', 'graviton', 'barra pegada pronada', 'barra pegada supinada'], true),
    E('Puxada frontal', ['puxada frontal', 'puxada', 'puxada alta', 'pulley', 'pulldown frente', 'puxada pela frente', 'puxada aberta', 'puxada na frente', 'pulldown', 'lat pulldown', 'pulley frente', 'puxada alta pela frente'], true),
    E('Remada curvada', ['remada curvada', 'remada com barra', 'remada curvada com barra', 'remada curvada pronada', 'remada curvada supinada', 'bent over row'], true),
    E('Remada baixa', ['remada baixa', 'remada sentada', 'remada no cabo', 'remada sentada na polia', 'remada baixa no cabo', 'remada baixa com triangulo', 'seated row'], true),
    E('Serrote (remada unilateral)', ['serrote', 'remada unilateral', 'remada com halter', 'remada unilateral com halter', 'remada serrote', 'remada com halter unilateral', 'one arm row'], true),
    E('Remada inclinada', ['remada inclinada', 'remada no banco inclinado']),
    E('Puxada triângulo', ['puxada triangulo', 'triangulo']),
    E('Remada cavalinho', ['remada cavalinho', 'cavalinho', 't bar']),
    E('Remada na máquina', ['remada na maquina', 'remada maquina', 'remada articulada']),
    E('Pulldown braço reto', ['pulldown', 'braco reto', 'pullover na polia']),
    E('Levantamento terra', ['levantamento terra', 'terra', 'deadlift', 'terra convencional', 'levantamento terra convencional']),
    E('Hiperextensão lombar', ['hiperextensao', 'extensao lombar', 'lombar']),
    E('Remada', ['remada']),   // genérico: quando a pessoa fala só "remada"
  ],
  ombros: [
    E('Desenvolvimento com halteres', ['desenvolvimento com halter', 'desenvolvimento com halteres', 'desenvolvimento', 'desenvolvimento sentado com halteres', 'desenvolvimento de ombros com halteres', 'shoulder press'], true),
    E('Elevação lateral', ['elevacao lateral', 'lateral', 'elevacao lateral com halteres', 'elevacao lateral com halter', 'elevacao lateral na polia', 'abducao de ombros', 'lateral raise'], true),
    E('Elevação frontal', ['elevacao frontal', 'frontal', 'elevacao frontal com halteres', 'elevacao frontal com halter', 'elevacao frontal com barra', 'elevacao frontal com anilha', 'front raise'], true),
    E('Desenvolvimento militar', ['desenvolvimento militar', 'militar', 'desenvolvimento com barra', 'desenvolvimento militar com barra', 'desenvolvimento em pe', 'overhead press', 'press militar'], true),
    E('Crucifixo invertido', ['crucifixo invertido', 'voador invertido', 'peck deck invertido', 'posterior de ombro', 'crucifixo inverso', 'voador inverso', 'peck deck inverso', 'elevacao posterior', 'reverse fly']),
    E('Desenvolvimento na máquina', ['desenvolvimento na maquina', 'desenvolvimento maquina']),
    E('Arnold press', ['arnold']),
    E('Face pull', ['face pull']),
    E('Remada alta', ['remada alta']),
  ],
  trapezio: [
    E('Encolhimento com halteres', ['encolhimento com halter', 'encolhimento com halteres', 'encolhimento', 'encolhimento de ombros com halteres', 'encolhimento de ombros'], true),
    E('Encolhimento com barra', ['encolhimento com barra', 'encolhimento de ombros com barra'], true),
    E('Encolhimento na máquina', ['encolhimento na maquina']),
    E('Caminhada do fazendeiro', ['farmer', 'caminhada do fazendeiro']),
  ],
  biceps: [
    E('Rosca direta', ['rosca direta', 'rosca direto', 'rosca com barra', 'rosca na barra', 'rosca barra', 'rosca direta com barra', 'rosca direta barra reta', 'rosca biceps com barra', 'barbell curl', 'flexao de cotovelo com barra'], true),
    E('Rosca direta com halteres', ['rosca direta com halteres', 'rosca direta com halter', 'rosca direto com halteres', 'rosca direto com halter', 'rosca com halteres', 'rosca com halter'], true),
    E('Rosca alternada', ['rosca alternada', 'alternada', 'rosca alternada com halteres', 'rosca alternada com halter', 'rosca biceps alternada'], true),
    E('Rosca martelo', ['rosca martelo', 'martelo', 'rosca martelo com halteres', 'rosca martelo com halter', 'hammer curl', 'rosca neutra'], true),
    E('Rosca inclinada', ['rosca inclinada', 'rosca inclinada com halteres', 'rosca inclinada com halter', 'rosca no banco inclinado'], true),
    E('Rosca Scott', ['rosca scott', 'scott', 'rosca scott com barra', 'rosca scott com halter', 'rosca no banco scott', 'preacher curl'], true),
    E('Rosca concentrada', ['rosca concentrada', 'concentrada', 'rosca concentrada com halter', 'concentration curl']),
    E('Rosca na polia', ['rosca na polia', 'rosca no cabo', 'rosca polia']),
    E('Rosca W', ['rosca w', 'barra w']),
    E('Rosca', ['rosca']),     // genérico
  ],
  triceps: [
    E('Tríceps na polia com barra', ['triceps na polia', 'triceps pulley', 'triceps polia', 'triceps barra', 'pulley de triceps', 'triceps na polia com barra', 'triceps na polia com a barra', 'triceps polia com barra', 'triceps pulley com barra', 'triceps com barra', 'triceps com a barra', 'triceps na barra', 'triceps de barra', 'polia com barra', 'pulley com barra', 'extensao de triceps na polia', 'extensao de triceps na polia com barra', 'extensao de cotovelo na polia', 'triceps pushdown', 'pushdown', 'triceps puxada', 'triceps no pulley', 'triceps no cabo', 'triceps no cabo com barra', 'triceps pulley barra reta', 'triceps barra v', 'triceps com barra v'], true),
    E('Tríceps na polia com corda', ['triceps corda', 'triceps na corda', 'corda', 'triceps na polia com corda', 'triceps na polia com a corda', 'triceps polia com corda', 'triceps pulley com corda', 'triceps com corda', 'triceps com a corda', 'triceps de corda', 'polia com corda', 'pulley com corda', 'extensao de triceps na polia com corda', 'extensao de triceps com corda', 'triceps pushdown com corda', 'pushdown com corda', 'triceps no cabo com corda', 'triceps pulley corda'], true),
    E('Tríceps testa', ['triceps testa', 'testa', 'triceps testa com barra', 'triceps testa com barra w', 'triceps testa com halteres', 'extensao de triceps deitado', 'skull crusher', 'rosca testa'], true),
    E('Tríceps francês', ['triceps frances', 'frances', 'triceps frances com halter', 'triceps frances com halteres', 'extensao de triceps acima da cabeca', 'extensao de triceps sentado', 'triceps overhead', 'triceps frances na polia'], true),
    E('Mergulho no banco', ['mergulho no banco', 'triceps banco', 'triceps no banco', 'mergulho entre bancos', 'triceps mergulho', 'tricep dips', 'dips no banco']),
    E('Tríceps coice', ['triceps coice', 'coice', 'kickback', 'triceps coice com halter', 'triceps coice na polia', 'extensao de triceps unilateral curvado']),
    E('Supino fechado', ['supino fechado', 'supino com pegada fechada', 'supino pegada fechada', 'close grip']),
  ],
  abdomen: [
    E('Abdominal', ['abdominal', 'crunch', 'abdominal supra', 'abdominal reto', 'abdominal no solo', 'crunch abdominal'], true),
    E('Prancha', ['prancha'], true),
    E('Elevação de pernas', ['elevacao de pernas', 'elevacao de perna', 'elevacao de pernas na barra', 'elevacao de pernas suspenso', 'abdominal na barra', 'leg raise'], true),
    E('Abdominal infra', ['abdominal infra', 'infra']),
    E('Abdominal oblíquo', ['abdominal obliquo', 'obliquo']),
    E('Abdominal na polia', ['abdominal na polia', 'abdominal no cabo']),
    E('Roda abdominal', ['roda abdominal', 'rodinha']),
  ],
  gluteo: [
    E('Elevação pélvica', ['elevacao pelvica', 'pelvica', 'hip thrust', 'elevacao pelvica com barra', 'elevacao de quadril', 'ponte com barra'], true),
    E('Glúteo na polia', ['gluteo na polia', 'gluteo no cabo', 'coice na polia'], true),
    E('Abdutora', ['abdutora', 'abducao', 'cadeira abdutora'], true),
    E('Agachamento sumô', ['agachamento sumo', 'sumo']),
    E('Glúteo 4 apoios', ['quatro apoios', '4 apoios']),
    E('Ponte', ['ponte']),
  ],
  quadriceps: [
    E('Agachamento livre', ['agachamento livre', 'agachamento', 'agachamento livre com barra', 'agachamento com barra', 'agachamento back squat', 'back squat', 'squat'], true),
    E('Leg press', ['leg press', 'leg', 'leg press 45', 'leg 45', 'leg press horizontal', 'prensa de pernas', 'leg press inclinado'], true),
    E('Cadeira extensora', ['cadeira extensora', 'extensora', 'extensao de joelhos', 'extensora de pernas', 'leg extension', 'cadeira extensora unilateral'], true),
    E('Afundo (passada)', ['afundo', 'passada', 'avanco', 'avanco com halteres', 'passada com halteres', 'lunge', 'afundo com halteres', 'avanco caminhando'], true),
    E('Hack', ['hack machine', 'hack']),
    E('Agachamento no Smith', ['agachamento no smith', 'smith']),
    E('Agachamento búlgaro', ['agachamento bulgaro', 'bulgaro']),
    E('Agachamento goblet', ['goblet']),
  ],
  posterior: [
    E('Mesa flexora', ['mesa flexora', 'flexora deitada', 'flexora', 'flexao de joelhos deitado', 'mesa flexora deitada', 'leg curl'], true),
    E('Cadeira flexora', ['cadeira flexora', 'flexora sentada', 'flexao de joelhos sentado', 'flexora sentado'], true),
    E('Stiff', ['stiff', 'stiff com barra', 'stiff com halteres', 'levantamento terra stiff', 'terra stiff'], true),
    E('Terra romeno', ['terra romeno', 'levantamento terra romeno', 'romeno']),
    E('Flexora em pé', ['flexora em pe']),
    E('Good morning', ['good morning']),
  ],
  panturrilha: [
    E('Panturrilha em pé', ['panturrilha em pe', 'gemeos em pe', 'panturrilha na maquina', 'elevacao de panturrilha em pe', 'gemeos em pe na maquina', 'panturrilha no smith', 'flexao plantar em pe'], true),
    E('Panturrilha sentado', ['panturrilha sentado', 'panturrilha sentada', 'gemeos sentado', 'elevacao de panturrilha sentado', 'flexao plantar sentado', 'panturrilha no banco'], true),
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
