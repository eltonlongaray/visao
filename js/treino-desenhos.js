// ─── ÍNDICE ──────────────────────────────────────────────────
// Desenhos dos exercícios (Élton, 11/11): traço preto e branco, homem e
// mulher, em img/exercicios/<nome>-h.webp / -m.webp. O pop-up do treino mostra
// o do sexo do perfil; sem sexo, o do homem; sem o desenho daquele sexo, o outro.
// BLOCO 1 — QUAIS TÊM DESENHO
// BLOCO 2 — CAMINHO DO DESENHO
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: QUAIS TÊM DESENHO ('h' homem, 'm' mulher)
// ═══════════════════════════════════════════════════════════════
const HM = 'hm';
const TEM = {
  'Supino reto': HM, 'Supino inclinado': HM, 'Supino com halteres': HM, 'Crucifixo': HM, 'Crossover': HM,
  'Peck deck (voador)': HM, 'Supino declinado': HM, 'Crucifixo inclinado': HM, 'Supino na máquina': HM,
  'Flexão de braço': HM, 'Paralelas': HM, 'Crucifixo declinado': HM, 'Pullover': HM,
  'Barra fixa': HM, 'Puxada frontal': HM, 'Remada curvada': HM, 'Remada baixa': HM, 'Serrote (remada unilateral)': HM,
  'Remada inclinada': HM, 'Puxada triângulo': HM, 'Remada cavalinho': HM, 'Remada na máquina': HM,
  'Pulldown braço reto': HM, 'Levantamento terra': HM, 'Hiperextensão lombar': HM, 'Puxada supinada': HM,
  'Puxada atrás': HM, 'Remada unilateral na polia': HM,
  'Desenvolvimento com halteres': HM, 'Elevação lateral': HM, 'Elevação frontal': HM, 'Desenvolvimento militar': HM,
  'Crucifixo invertido': HM, 'Desenvolvimento na máquina': HM, 'Arnold press': HM, 'Face pull': HM, 'Remada alta': HM,
  'Encolhimento com halteres': HM, 'Encolhimento com barra': HM, 'Encolhimento na máquina': HM, 'Caminhada do fazendeiro': HM,
  'Rosca direta': HM, 'Rosca direta com halteres': HM, 'Rosca alternada': HM, 'Rosca martelo': HM, 'Rosca Scott': HM,
  'Rosca inclinada': HM, 'Rosca concentrada': HM, 'Rosca na polia': HM, 'Rosca W': HM, 'Rosca inversa': HM, 'Rosca 21': HM,
  'Tríceps na polia com barra': HM, 'Tríceps na polia com corda': HM, 'Tríceps testa': HM, 'Tríceps francês': HM,
  'Mergulho no banco': HM, 'Tríceps coice': HM, 'Supino fechado': HM, 'Tríceps unilateral na polia': HM,
  'Tríceps na máquina': HM, 'Flexão diamante': HM,
  'Abdominal': HM, 'Prancha': HM, 'Elevação de pernas': HM, 'Abdominal infra': HM, 'Abdominal oblíquo': HM,
  'Abdominal na polia': HM, 'Roda abdominal': HM, 'Prancha lateral': 'h',
};

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CAMINHO DO DESENHO
// ═══════════════════════════════════════════════════════════════
const _slug = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// sexo do perfil: 'F' → mulher; 'M' ou vazio → homem. null se não tem desenho.
export function desenhoDe(nome, sexo) {
  const tem = TEM[nome];
  if (!tem) return null;
  const quer = sexo === 'F' ? 'm' : 'h';
  const s = tem.includes(quer) ? quer : tem[0];
  return `img/exercicios/${_slug(nome)}-${s}.webp`;
}
