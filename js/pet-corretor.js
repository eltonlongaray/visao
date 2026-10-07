// ─── ÍNDICE ──────────────────────────────────────────────────
// Corretor de digitação do Pet: "qual meu perfip de treino" → "perfil".
// Só troca palavra que (1) o Pet não conhece e (2) fica a 1 letra (ou 2, em
// palavra longa) de UMA palavra de comando. Nome de item, título e afins quase
// nunca ficam tão perto de uma palavra de comando, então passam intactos.
// BLOCO 1 — PALAVRAS DE COMANDO
// BLOCO 2 — DISTÂNCIA (Damerau: troca, falta, sobra, inversão)
// BLOCO 3 — CORRIGIR
// ─────────────────────────────────────────────────────────────

const sem = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PALAVRAS DE COMANDO (forma certa, com acento)
// ═══════════════════════════════════════════════════════════════
const COMANDO = (
  'perfil treino treinos semana objetivo peso altura força volume saúde áurea proporção parado parei ' +
  'músculo músculos perna pernas peito costas ombro ombros trapézio bíceps tríceps braço braços abdômen ' +
  'glúteo glúteos quadríceps posterior panturrilha vezes frequência experiência medidas cintura ' +
  'lista listas mercado caixa ferramentas adiciona adicionar coloca apaga apagar remove remover ' +
  'marca marcar desmarca desmarcar feito feita concluído troca trocar muda mudar mostra mostrar ' +
  'compromisso compromissos tarefa tarefas atividade atividades agendar agenda registrar próximo próxima ' +
  'lembrete lembretes hidratação água sono dormi constância sequência ajuda notificação notificações ' +
  'instalar horário descrição título repetir repetição editar amanhã hoje ontem segunda terça quarta ' +
  'quinta sexta sábado domingo semana manhã tarde noite academia qual quais quanto quantos'
).split(' ');
const COMANDO_SEM = COMANDO.map(sem);

// Palavras comuns que NÃO são erro (evita "fiz" → "fiz" ok, "peso" vs "pego")
const COMUNS = new Set(('a o e é de do da dos das em no na nos nas um uma pra para por com que como ' +
  'meu minha teu tua seu sua eu tu ele ela me te se já não sim mais menos muito pouco agora depois ' +
  'antes ficou fica fiz fez faz vou vai foi tem ter tenho tô to está estou era ser são isso esse essa ' +
  'aquilo aqui ali lá ai aí ok oi olá bom boa dia dias mes mês ano anos hora horas vez quero queria ' +
  'pode posso quer deu dar bota põe pôe tira tirar pego pega pegar leite arroz pão café ovo ovos ' +
  'conta contas pagar pago paga paguei pagando boleto boletos fatura faturas vence vencem vencimento cartão luz').split(' ').map(sem));

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: DISTÂNCIA (Damerau–Levenshtein restrita)
// ═══════════════════════════════════════════════════════════════
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let menor = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      menor = Math.min(menor, d[i][j]);
    }
    if (menor > max) return max + 1;
  }
  return d[a.length][b.length];
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CORRIGIR
// ═══════════════════════════════════════════════════════════════
// Palavras que dá pra corrigir SEMPRE, antes de rotear: longas ou estruturais,
// e quase nenhuma palavra real fica a 1 letra delas ("lsita" → "lista",
// "apga" → "apaga"). As outras só são corrigidas se a frase não foi entendida.
export const SEGURAS = new Set(('lista listas compromisso compromissos perfil constância hidratação lembrete ' +
  'lembretes notificação notificações descrição título horário próximo próxima frequência ferramentas ' +
  'adiciona adicionar apaga apagar remove remover desmarca desmarcar agendar concluído').split(' ').map(sem));

// `conhecidas`: palavras extras que já são certas (ex.: vocabulário do modelo).
// `soSeguras`: só troca pelas palavras de SEGURAS.
// Devolve { texto, trocas: [[errada, certa], ...] }.
export function corrigirTexto(text, conhecidas = null, soSeguras = false) {
  const trocas = [];
  const texto = String(text || '').replace(/[\p{L}]+/gu, (palavra) => {
    const w = sem(palavra);
    if (w.length < 4 || COMUNS.has(w) || COMANDO_SEM.includes(w) || conhecidas?.has(w)) return palavra;
    const max = w.length >= 7 ? 2 : 1;
    let melhor = null, dMelhor = max + 1, empate = false;
    COMANDO_SEM.forEach((k, i) => {
      if (soSeguras && !SEGURAS.has(k)) return;
      const d = distancia(w, k, max);
      if (d < dMelhor) { dMelhor = d; melhor = i; empate = false; }
      else if (d === dMelhor && d <= max && COMANDO_SEM[melhor] !== k) empate = true;
    });
    if (melhor == null || dMelhor > max || empate) return palavra;
    let certa = COMANDO[melhor];
    if (palavra[0] === palavra[0].toUpperCase()) certa = certa[0].toUpperCase() + certa.slice(1);
    trocas.push([palavra, certa]);
    return certa;
  });
  return { texto, trocas };
}
