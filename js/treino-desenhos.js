// ─── ÍNDICE ──────────────────────────────────────────────────
// Bonequinhos dos exercícios (Élton, 03-04/11): pictograma estilo placa,
// branco no fundo escuro; a parte de trás do corpo fica mais apagada.
// Cada exercício com o equipamento dele (barra comprida com anilhas, halter
// curtinho, polia = torre com cabo, máquina = banco e alavanca).
// BLOCO 1 — BONECO E EQUIPAMENTOS
// BLOCO 2 — POSES BASE
// BLOCO 3 — DESENHO DE CADA EXERCÍCIO (nomes de js/treino-exercicios.js)
// BLOCO 4 — SVG PRONTO
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: BONECO E EQUIPAMENTOS
// ═══════════════════════════════════════════════════════════════
const L = (a, b, w) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${w}"/>`;

// p = juntas (cabeca, pesco, ombro, quadril, joelho, pe, cotovelo, mao) e as
// do lado de trás com T (joelhoT, peT, cotoveloT, maoT). forte = trás sem apagar.
function boneco(p, forte = false) {
  const corpo = [];
  const ombro = p.ombro || p.pesco;
  const membro = (a, b, c, w) => { if (b) { corpo.push(L(a, b, w)); if (c) corpo.push(L(b, c, w)); } };
  membro(p.quadril, p.joelhoT, p.peT, 10); membro(ombro, p.cotoveloT, p.maoT, 8);
  const tras = corpo.splice(0).join('');
  membro(p.quadril, p.joelho, p.pe, 11);
  const pernas = corpo.splice(0).join('');
  membro(ombro, p.cotovelo, p.mao, 9);
  const braco = corpo.join('');
  // contorno da cor do fundo: o braço da frente aparece mesmo na frente do tronco
  const contorno = braco.replace(/stroke-width="(\d+)"/g, (_, w) => `stroke-width="${+w + 5}"`);
  const frente = pernas + `<g stroke="var(--bn-fundo, #1c2140)">${contorno}</g>` + braco;
  return `<g stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"${forte ? '' : ' opacity=".55"'}>${tras}</g>`
    + `<g stroke-linecap="round" stroke-linejoin="round" stroke="currentColor">${L(p.pesco, p.quadril, 17)}${frente}</g>`
    + `<circle cx="${p.cabeca[0]}" cy="${p.cabeca[1]}" r="8.5" fill="currentColor"/>`;
}

const EQ = (s) => `<g fill="none" stroke="var(--bn-eq, #8b8fa8)" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">${s}</g>`;
const linha = (pts, w = 4) => `<polyline points="${pts.map(p => p.join(',')).join(' ')}" stroke-width="${w}"/>`;
const chao = EQ('<line x1="8" y1="99" x2="112" y2="99" stroke-width="2" opacity=".5"/>');
const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n, n]; };
// Barra: comprida, com anilha grande em cada ponta
const barra = (a, b, w = false) => {
  const [ux, uy, n] = unit(a, b), px = -uy, py = ux;
  const an = (t) => { const x = a[0] + ux * t, y = a[1] + uy * t; return L([x + px * 11, y + py * 11], [x - px * 11, y - py * 11], 6); };
  // barra W: o meio em zigue-zague
  const meio = w ? (() => { const m = (t, d) => [a[0] + ux * t + px * d, a[1] + uy * t + py * d];
    return linha([a, m(n * .35, 0), m(n * .42, 3), m(n * .5, -1), m(n * .58, 3), m(n * .65, 0), b], 3); })() : L(a, b, 3);
  return EQ(meio + an(5) + an(n - 5));
};
// Barra vista de lado (atravessa o desenho): só a anilha redonda
const anilha = (x, y, r = 10) => EQ(`<circle cx="${x}" cy="${y}" r="${r}" fill="var(--bn-eq, #8b8fa8)" stroke="none"/><circle cx="${x}" cy="${y}" r="2.5" fill="var(--bn-fundo, #1c2140)" stroke="none"/>`);
// Halter: curtinho, duas anilhas pequenas (ang em graus; 90 = em pé)
const halter = (x, y, ang = 0, op = 1, g = 1) => {
  const r = ang * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r), px = -uy, py = ux;
  const an = (t) => { const cx = x + ux * t * g, cy = y + uy * t * g; return L([cx + px * 6 * g, cy + py * 6 * g], [cx - px * 6 * g, cy - py * 6 * g], 5 * g); };
  return `<g opacity="${op}">${EQ(L([x - ux * 8 * g, y - uy * 8 * g], [x + ux * 8 * g, y + uy * 8 * g], 3) + an(-7) + an(7))}</g>`;
};
// Polia: torre com roldana e o cabo até a mão
const polia = (torreX, roldana, mao) => EQ(`<line x1="${torreX}" y1="6" x2="${torreX}" y2="99" stroke-width="5"/>`
  + `<circle cx="${roldana[0]}" cy="${roldana[1]}" r="4" stroke-width="3"/>`
  + `<line x1="${roldana[0]}" y1="${roldana[1]}" x2="${mao[0]}" y2="${mao[1]}" stroke-width="1.6"/>`);
const pegador = (a, b) => EQ(L(a, b, 4));
const corda = (m) => EQ(`<line x1="${m[0]}" y1="${m[1] - 3}" x2="${m[0] - 5}" y2="${m[1] + 6}" stroke-width="3"/><line x1="${m[0]}" y1="${m[1] - 3}" x2="${m[0] + 5}" y2="${m[1] + 6}" stroke-width="3"/>`);
const triangulo = (m) => EQ(`<polygon points="${m[0]},${m[1] - 5} ${m[0] - 6},${m[1] + 5} ${m[0] + 6},${m[1] + 5}" stroke-width="3"/>`);
const rolo = (x, y, r = 5) => EQ(`<circle cx="${x}" cy="${y}" r="${r}" fill="var(--bn-eq, #8b8fa8)" stroke="none"/>`);
const seta = (x, y, dir = -1) => EQ(`<path d="M${x} ${y} l0 ${dir * 10} m-4 ${-dir * 4} l4 ${dir * 4} l4 ${-dir * 4}" stroke-width="2.5"/>`);
// Banco reto (deitado) e assento com/sem encosto
const BANCO = EQ('<line x1="22" y1="64" x2="88" y2="64"/><line x1="30" y1="64" x2="30" y2="92"/><line x1="80" y1="64" x2="80" y2="92"/>');
const ASSENTO = EQ('<line x1="34" y1="69" x2="64" y2="69" stroke-width="6"/><line x1="49" y1="69" x2="49" y2="99"/>');
const ENCOSTO = EQ('<line x1="35" y1="22" x2="35" y2="69" stroke-width="6"/>');
const SEM = (s) => s;   // marca de leitura: desenho sem equipamento

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: POSES BASE
// ═══════════════════════════════════════════════════════════════
const P = (base, extra) => ({ ...base, ...extra });
// Em pé, de lado, olhando pra direita
const PE = { cabeca: [52, 13], pesco: [52, 25], ombro: [53, 28], quadril: [52, 60], joelho: [54, 79], pe: [54, 98], joelhoT: [50, 79], peT: [48, 98] };
const BRACO_BAIXO = { cotovelo: [55, 45], mao: [56, 61], cotoveloT: [52, 45], maoT: [53, 61] };
// Em pé, de frente
const FR = { cabeca: [60, 13], pesco: [60, 25], ombro: [60, 28], quadril: [60, 60], joelho: [54, 79], pe: [52, 98], joelhoT: [66, 79], peT: [68, 98] };
// Sentado, de lado
const SENT = { cabeca: [46, 20], pesco: [45, 31], ombro: [45, 33], quadril: [44, 62], joelho: [70, 64], pe: [72, 96], joelhoT: [68, 64], peT: [66, 96] };
// Sentado, de frente
const SENT_FR = { cabeca: [60, 18], pesco: [60, 30], ombro: [60, 32], quadril: [60, 62], joelho: [52, 70], pe: [50, 96], joelhoT: [68, 70], peT: [70, 96] };
// Deitado no banco, barriga pra cima
const DEITADO = { cabeca: [24, 50], pesco: [34, 54], quadril: [70, 54], joelho: [86, 62], pe: [86, 97], joelhoT: [84, 62], peT: [92, 97], ombro: [38, 54] };
// Banco inclinado (cabeça pra cima)
const INCL = { cabeca: [36, 34], pesco: [43, 43], ombro: [45, 45], quadril: [66, 66], joelho: [86, 68], pe: [88, 97], joelhoT: [84, 68], peT: [94, 97] };
const BANCO_INCL = EQ('<line x1="36" y1="53" x2="60" y2="76"/><line x1="60" y1="76" x2="84" y2="76"/><line x1="64" y1="76" x2="64" y2="98"/>');
// Banco declinado (cabeça pra baixo)
const DECL = { cabeca: [22, 64], pesco: [32, 60], ombro: [36, 59], quadril: [68, 48], joelho: [84, 56], pe: [92, 72], joelhoT: [82, 58], peT: [90, 74] };
const BANCO_DECL = EQ('<line x1="26" y1="70" x2="72" y2="56"/><line x1="50" y1="63" x2="50" y2="98"/>') + rolo(94, 76, 4);
// Agachado
const AGACHA = { cabeca: [62, 28], pesco: [56, 39], ombro: [56, 41], quadril: [34, 64], joelho: [64, 70], pe: [58, 97], joelhoT: [60, 72], peT: [54, 97] };
// Curvado (remada): tronco pra frente, joelho dobrado
const CURVO = { cabeca: [84, 30], pesco: [74, 37], ombro: [72, 39], quadril: [40, 52], joelho: [50, 74], pe: [44, 97], joelhoT: [46, 74], peT: [40, 97] };
// Quadril pra trás, perna quase reta (stiff)
const STIFF = { cabeca: [86, 46], pesco: [76, 50], ombro: [74, 52], quadril: [46, 56], joelho: [52, 77], pe: [52, 98], joelhoT: [48, 77], peT: [48, 98] };
// Prancha nas mãos (flexão), cabeça pra esquerda
const FLEX = { cabeca: [20, 62], pesco: [30, 66], ombro: [34, 68], quadril: [74, 78], joelho: [92, 86], pe: [108, 94], cotovelo: [34, 83], mao: [34, 97], joelhoT: [90, 88], peT: [106, 96], cotoveloT: [38, 83], maoT: [38, 97] };
// Deitado no chão (abdominal)
const CHAO = { cabeca: [30, 70], pesco: [38, 78], ombro: [40, 79], quadril: [62, 92], joelho: [78, 72], pe: [92, 96], joelhoT: [76, 74], peT: [90, 96], cotovelo: [44, 64], mao: [32, 62] };
// Puxada: sentado na máquina, de lado
const PUXADA = { cabeca: [46, 22], pesco: [45, 33], ombro: [45, 35], quadril: [44, 64], joelho: [70, 66], pe: [72, 96], joelhoT: [68, 66], peT: [66, 96] };
const MAQ_PUXADA = EQ('<line x1="98" y1="4" x2="98" y2="99" stroke-width="5"/><line x1="56" y1="4" x2="98" y2="4"/><line x1="34" y1="71" x2="62" y2="71" stroke-width="6"/><line x1="48" y1="71" x2="48" y2="99"/>') + rolo(70, 58, 5);

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: DESENHO DE CADA EXERCÍCIO
// ═══════════════════════════════════════════════════════════════
const ROSCA = P(PE, { cotovelo: [58, 47], mao: [74, 33], cotoveloT: [55, 47], maoT: [71, 34] });
const PUX = (mao, eq) => MAQ_PUXADA + EQ(`<line x1="${mao[0]}" y1="4" x2="${mao[0]}" y2="${mao[1]}" stroke-width="1.6"/>`) + chao
  + boneco(P(PUXADA, { cotovelo: [56, 26], mao, cotoveloT: [52, 26], maoT: [mao[0] - 3, mao[1]] })) + eq;
const ASSENTO_FR = EQ('<line x1="44" y1="68" x2="76" y2="68" stroke-width="6"/><line x1="60" y1="68" x2="60" y2="99"/>');
const DESENV = (cot, mao, eq) => ASSENTO_FR + chao + boneco(P(SENT_FR, { cotovelo: cot, mao, cotoveloT: [120 - cot[0], cot[1]], maoT: [120 - mao[0], mao[1]] }), true) + eq;
const TRI_POLIA = (pega) => chao + polia(104, [98, 10], [76, 58])
  + boneco(P(PE, { pesco: [53, 25], ombro: [54, 28], cotovelo: [60, 46], mao: [76, 58], cotoveloT: [57, 46], maoT: [73, 57] })) + pega;
const PEITO_FR_MAQ = (abre) => EQ('<line x1="16" y1="6" x2="104" y2="6"/><line x1="16" y1="6" x2="16" y2="99" stroke-width="5"/><line x1="104" y1="6" x2="104" y2="99" stroke-width="5"/><line x1="46" y1="66" x2="74" y2="66" stroke-width="6"/>') + chao
  + (abre ? EQ('<line x1="20" y1="22" x2="20" y2="42"/><line x1="100" y1="22" x2="100" y2="42"/>') : EQ('<line x1="30" y1="22" x2="30" y2="46" stroke-width="6"/><line x1="90" y1="22" x2="90" y2="46" stroke-width="6"/>'))
  + boneco(P(SENT_FR, abre ? { cotovelo: [40, 32], mao: [22, 32], cotoveloT: [80, 32], maoT: [98, 32] } : { cotovelo: [34, 34], mao: [36, 18], cotoveloT: [86, 34], maoT: [84, 18] }), true);
const CRUCI = (base, banco, ombro) => banco + chao + halter(ombro[0] - 12, ombro[1] - 14, 90, .55)
  + boneco(P(base, { cotovelo: [ombro[0] + 8, ombro[1] - 12], mao: [ombro[0] + 18, ombro[1] - 20], cotoveloT: [ombro[0] - 6, ombro[1] - 10], maoT: [ombro[0] - 12, ombro[1] - 18] }))
  + halter(ombro[0] + 18, ombro[1] - 21, 90);
const AGACH = (extra, eq = '', antes = '') => antes + chao + boneco(P(AGACHA, extra)) + eq;
const SERROTE = { cabeca: [28, 40], pesco: [38, 44], ombro: [40, 45], quadril: [78, 48], joelho: [88, 74], pe: [88, 98], joelhoT: [84, 66], peT: [100, 66], cotoveloT: [40, 58], maoT: [40, 66] };
const BANCO_SERROTE = EQ('<line x1="30" y1="70" x2="104" y2="70"/><line x1="36" y1="70" x2="36" y2="98"/><line x1="98" y1="70" x2="98" y2="98"/>');
const PRONO = { cabeca: [20, 56], pesco: [30, 60], ombro: [32, 61], quadril: [66, 61], joelho: [86, 61], pe: [90, 40], joelhoT: [84, 62], peT: [88, 42], cotovelo: [28, 72], mao: [18, 74] };
const LEGPRESS = (pe) => EQ('<line x1="12" y1="56" x2="40" y2="92" stroke-width="6"/><line x1="40" y1="92" x2="104" y2="28" stroke-width="3"/><line x1="40" y1="92" x2="40" y2="99"/>')
  + EQ(`<line x1="${pe[0] - 2}" y1="${pe[1] - 12}" x2="${pe[0] + 10}" y2="${pe[1] + 4}" stroke-width="6"/>`) + chao;

export const DESENHOS = {
  // ── Peito
  'Supino reto': () => BANCO + chao + boneco(P(DEITADO, { cotovelo: [42, 38], mao: [43, 23] })) + barra([22, 29], [64, 17]),
  'Supino inclinado': () => BANCO_INCL + chao + boneco(P(INCL, { cotovelo: [52, 30], mao: [54, 14] })) + barra([34, 20], [74, 8]),
  'Supino com halteres': () => BANCO + chao + halter(49, 20, 0, .55) + boneco(P(DEITADO, { cotovelo: [42, 38], mao: [43, 23] })) + halter(43, 23),
  'Crucifixo': () => CRUCI(DEITADO, BANCO, [38, 54]),
  'Crossover': () => chao + polia(10, [16, 12], [55, 60]) + polia(110, [104, 12], [65, 60])
    + boneco(P(FR, { cotovelo: [44, 44], mao: [55, 60], cotoveloT: [76, 44], maoT: [65, 60] }), true),
  'Peck deck (voador)': () => PEITO_FR_MAQ(false),
  'Supino declinado': () => BANCO_DECL + chao + boneco(P(DECL, { cotovelo: [40, 43], mao: [42, 27] })) + barra([22, 33], [62, 21]),
  'Crucifixo inclinado': () => CRUCI(INCL, BANCO_INCL, [45, 45]),
  'Supino na máquina': () => chao + EQ('<line x1="104" y1="8" x2="104" y2="99" stroke-width="5"/><line x1="104" y1="14" x2="86" y2="30"/>') + ASSENTO + ENCOSTO
    + boneco(P(SENT, { cotovelo: [62, 44], mao: [82, 40], cotoveloT: [60, 42], maoT: [80, 37] })) + EQ('<line x1="86" y1="30" x2="86" y2="50" stroke-width="5"/>'),
  'Flexão de braço': () => chao + boneco(FLEX),
  'Paralelas': () => chao + EQ('<line x1="26" y1="50" x2="86" y2="50"/><line x1="30" y1="50" x2="30" y2="99"/><line x1="82" y1="50" x2="82" y2="99"/>')
    + boneco({ cabeca: [57, 18], pesco: [55, 30], ombro: [55, 32], quadril: [52, 62], joelho: [50, 79], pe: [38, 86], joelhoT: [48, 80], peT: [36, 90], cotovelo: [42, 42], mao: [56, 50], cotoveloT: [44, 44], maoT: [58, 50] }),
  'Pullover': () => BANCO + chao + boneco(P(DEITADO, { cotovelo: [22, 38], mao: [8, 44] })) + halter(8, 44, 90),
  'Crucifixo declinado': () => CRUCI(DECL, BANCO_DECL, [36, 59]),

  // ── Costas
  'Barra fixa': () => EQ('<line x1="18" y1="10" x2="102" y2="10"/><line x1="18" y1="10" x2="18" y2="99"/><line x1="102" y1="10" x2="102" y2="99"/>')
    + boneco({ cabeca: [60, 24], pesco: [60, 35], ombro: [60, 37], quadril: [60, 66], cotovelo: [78, 30], mao: [76, 11], cotoveloT: [42, 30], maoT: [44, 11], joelho: [64, 82], pe: [56, 94], joelhoT: [56, 82], peT: [50, 92] }),
  'Puxada frontal': () => PUX([60, 12], pegador([38, 10], [84, 14])),
  'Remada curvada': () => chao + boneco(P(CURVO, { cotovelo: [56, 44], mao: [60, 62] })) + barra([44, 72], [78, 52]),
  'Remada baixa': () => chao + EQ('<line x1="28" y1="82" x2="60" y2="82" stroke-width="6"/><line x1="44" y1="82" x2="44" y2="99"/><line x1="94" y1="62" x2="94" y2="90" stroke-width="5"/>') + polia(110, [106, 74], [56, 62])
    + boneco({ cabeca: [44, 34], pesco: [42, 46], ombro: [43, 48], quadril: [40, 76], joelho: [66, 66], pe: [90, 76], joelhoT: [64, 68], peT: [90, 80], cotovelo: [32, 60], mao: [56, 62], cotoveloT: [34, 58], maoT: [54, 60] }) + triangulo([58, 62]),
  'Serrote (remada unilateral)': () => BANCO_SERROTE + chao + boneco(P(SERROTE, { cotovelo: [56, 34], mao: [52, 56] })) + halter(52, 58, 0, 1, 1.1),
  'Remada inclinada': () => EQ('<line x1="52" y1="84" x2="86" y2="52" stroke-width="5"/><line x1="64" y1="73" x2="64" y2="99"/>') + chao
    + boneco({ cabeca: [86, 36], pesco: [76, 44], ombro: [74, 46], quadril: [48, 70], joelho: [38, 86], pe: [30, 98], joelhoT: [42, 86], peT: [36, 98], cotovelo: [60, 52], mao: [68, 66] }) + halter(68, 68, 0),
  'Puxada triângulo': () => PUX([60, 14], triangulo([60, 12])),
  'Remada cavalinho': () => chao + EQ('<line x1="10" y1="97" x2="66" y2="66" stroke-width="3"/>') + anilha(64, 70, 9) + boneco(P(CURVO, { cotovelo: [56, 46], mao: [62, 64] })),
  'Remada na máquina': () => chao + ASSENTO + EQ('<line x1="100" y1="8" x2="100" y2="99" stroke-width="5"/><line x1="100" y1="14" x2="82" y2="38"/><line x1="70" y1="30" x2="70" y2="58" stroke-width="6"/>')
    + boneco(P(SENT, { cotovelo: [40, 46], mao: [62, 46], cotoveloT: [42, 44], maoT: [62, 44] })) + EQ('<line x1="62" y1="46" x2="82" y2="38" stroke-width="3"/>'),
  'Pulldown braço reto': () => chao + polia(104, [98, 10], [78, 54])
    + boneco(P(PE, { cabeca: [56, 15], pesco: [54, 27], ombro: [55, 30], quadril: [50, 60], cotovelo: [66, 42], mao: [78, 54], cotoveloT: [63, 42], maoT: [75, 54] })) + pegador([70, 56], [86, 52]),
  'Levantamento terra': () => chao + boneco({ cabeca: [78, 46], pesco: [68, 52], ombro: [66, 54], quadril: [40, 60], joelho: [58, 76], pe: [52, 98], joelhoT: [54, 77], peT: [48, 98], cotovelo: [64, 70], mao: [62, 85] }) + anilha(62, 86, 12),
  'Hiperextensão lombar': () => chao + EQ('<line x1="56" y1="60" x2="74" y2="60" stroke-width="6"/><line x1="66" y1="60" x2="96" y2="98"/>') + rolo(100, 82, 5)
    + boneco({ cabeca: [20, 44], pesco: [30, 46], ombro: [32, 47], quadril: [66, 50], joelho: [84, 64], pe: [98, 78], cotovelo: [38, 56], mao: [46, 48] }),
  'Puxada supinada': () => PUX([60, 12], pegador([48, 11], [72, 13])),
  'Puxada atrás': () => PUX([40, 12], pegador([18, 10], [62, 14])),
  'Remada unilateral na polia': () => chao + polia(108, [104, 46], [60, 46])
    + boneco(P(PE, { joelho: [62, 79], pe: [68, 98], joelhoT: [46, 79], peT: [38, 98], cotovelo: [40, 44], mao: [60, 46] })) + pegador([60, 40], [60, 52]),
  'Remada': () => DESENHOS['Remada curvada'](),

  // ── Ombros
  'Desenvolvimento com halteres': () => DESENV([38, 30], [38, 12], halter(38, 10) + halter(82, 10)),
  'Elevação lateral': () => chao + boneco(P(FR, { joelho: [53, 79], pe: [50, 98], joelhoT: [67, 79], peT: [70, 98], cotovelo: [40, 31], mao: [22, 33], cotoveloT: [80, 31], maoT: [98, 33] }), true) + halter(20, 33, 90) + halter(100, 33, 90),
  'Elevação frontal': () => chao + boneco(P(PE, { cotovelo: [70, 29], mao: [86, 30], cotoveloT: [53, 45], maoT: [54, 61] })) + halter(88, 30, 90),
  'Desenvolvimento militar': () => chao + boneco(P(FR, { cotovelo: [38, 24], mao: [36, 8], cotoveloT: [82, 24], maoT: [84, 8] }), true) + barra([18, 8], [102, 8]),
  'Crucifixo invertido': () => PEITO_FR_MAQ(true),
  'Desenvolvimento na máquina': () => EQ('<line x1="16" y1="4" x2="16" y2="99" stroke-width="5"/><line x1="104" y1="4" x2="104" y2="99" stroke-width="5"/><line x1="16" y1="20" x2="38" y2="12"/><line x1="104" y1="20" x2="82" y2="12"/>') + DESENV([38, 30], [38, 12], pegador([34, 12], [42, 12]) + pegador([78, 12], [86, 12])),
  'Arnold press': () => DESENV([48, 46], [50, 24], halter(50, 22, 90) + halter(70, 22, 90)) + seta(30, 26) + seta(90, 26),
  'Face pull': () => chao + polia(106, [100, 16], [72, 14])
    + boneco(P(PE, { cotovelo: [64, 22], mao: [72, 14], cotoveloT: [61, 22], maoT: [69, 14] })) + corda([74, 14]),
  'Remada alta': () => chao + boneco(P(FR, { cotovelo: [40, 22], mao: [54, 38], cotoveloT: [80, 22], maoT: [66, 38] }), true) + barra([24, 38], [96, 38]),

  // ── Trapézio
  'Encolhimento com halteres': () => chao + boneco(P(FR, { cotovelo: [46, 44], mao: [44, 60], cotoveloT: [74, 44], maoT: [76, 60] }), true) + halter(44, 62, 90) + halter(76, 62, 90) + seta(38, 22) + seta(82, 22),
  'Encolhimento com barra': () => chao + boneco(P(PE, BRACO_BAIXO)) + barra([40, 68], [74, 56]) + seta(66, 22),
  'Encolhimento na máquina': () => chao + EQ('<line x1="22" y1="4" x2="22" y2="99" stroke-width="3"/><line x1="98" y1="4" x2="98" y2="99" stroke-width="3"/><line x1="18" y1="62" x2="102" y2="62" stroke-width="4"/>')
    + boneco(P(FR, { cotovelo: [46, 44], mao: [44, 62], cotoveloT: [74, 44], maoT: [76, 62] }), true) + seta(38, 22) + seta(82, 22),
  'Caminhada do fazendeiro': () => chao + boneco(P(PE, { joelho: [62, 78], pe: [68, 98], joelhoT: [46, 78], peT: [36, 96], ...BRACO_BAIXO })) + halter(56, 64, 0, 1, 1.1),

  // ── Bíceps
  'Rosca direta': () => chao + boneco(ROSCA) + barra([60, 41], [90, 25]),
  'Rosca direta com halteres': () => chao + boneco(ROSCA) + halter(75, 32, 0, 1, 1.1),
  'Rosca alternada': () => chao + boneco(P(FR, { cotovelo: [48, 46], mao: [46, 62], cotoveloT: [72, 46], maoT: [70, 30] }), true) + halter(46, 64, 0) + halter(70, 28, 0),
  'Rosca martelo': () => chao + boneco(ROSCA) + halter(75, 32, 90, 1, 1.1),
  'Rosca inclinada': () => BANCO_INCL + chao + boneco(P(INCL, { cotovelo: [46, 62], mao: [60, 56] })) + halter(61, 55, 0),
  'Rosca Scott': () => chao + EQ('<line x1="50" y1="44" x2="70" y2="62" stroke-width="7"/><line x1="66" y1="62" x2="66" y2="99"/><line x1="30" y1="71" x2="52" y2="71" stroke-width="6"/><line x1="40" y1="71" x2="40" y2="99"/>')
    + boneco({ cabeca: [44, 22], pesco: [44, 33], ombro: [46, 36], quadril: [40, 64], joelho: [58, 66], pe: [58, 96], cotovelo: [64, 54], mao: [76, 38] }) + barra([64, 46], [92, 30], true),
  'Rosca concentrada': () => chao + EQ('<line x1="30" y1="69" x2="58" y2="69" stroke-width="6"/><line x1="44" y1="69" x2="44" y2="99"/>')
    + boneco({ cabeca: [64, 28], pesco: [56, 36], ombro: [56, 38], quadril: [42, 62], joelho: [70, 64], pe: [72, 96], joelhoT: [68, 64], peT: [66, 96], cotovelo: [64, 60], mao: [72, 44] }) + halter(73, 42, 0),
  'Rosca na polia': () => chao + polia(108, [104, 94], [74, 33]) + boneco(ROSCA) + pegador([68, 31], [82, 35]),
  'Rosca W': () => chao + boneco(ROSCA) + barra([60, 41], [90, 25], true),
  'Rosca inversa': () => chao + boneco(ROSCA) + barra([60, 41], [90, 25]),
  'Rosca 21': () => chao + boneco(P(PE, { cotovelo: [58, 47], mao: [74, 44], cotoveloT: [55, 47], maoT: [71, 45] })) + barra([60, 50], [90, 40]),
  'Rosca': () => DESENHOS['Rosca direta com halteres'](),

  // ── Tríceps
  'Tríceps na polia com barra': () => TRI_POLIA(pegador([68, 59], [86, 57])),
  'Tríceps na polia com corda': () => TRI_POLIA(corda([77, 57])),
  'Tríceps testa': () => BANCO + chao + boneco(P(DEITADO, { cotovelo: [40, 30], mao: [28, 38] })) + barra([12, 44], [44, 30], true),
  'Tríceps francês': () => chao + boneco({ cabeca: [60, 32], pesco: [60, 43], ombro: [60, 45], quadril: [60, 71], joelho: [55, 85], pe: [53, 98], joelhoT: [65, 85], peT: [67, 98], cotovelo: [40, 24], mao: [54, 10], cotoveloT: [80, 24], maoT: [66, 10] }, true) + halter(60, 8, 0, 1, 1.2),
  'Mergulho no banco': () => chao + EQ('<line x1="12" y1="62" x2="40" y2="62"/><line x1="16" y1="62" x2="16" y2="99"/><line x1="36" y1="62" x2="36" y2="99"/>')
    + boneco({ cabeca: [46, 28], pesco: [44, 40], ombro: [44, 42], quadril: [44, 72], joelho: [68, 80], pe: [94, 96], joelhoT: [68, 82], peT: [92, 98], cotovelo: [30, 50], mao: [34, 62] }),
  'Tríceps coice': () => BANCO_SERROTE + chao + boneco(P(SERROTE, { cotovelo: [58, 46], mao: [78, 40] })) + halter(80, 40, 90),
  'Supino fechado': () => BANCO + chao + boneco(P(DEITADO, { cotovelo: [44, 38], mao: [43, 23] })) + barra([26, 28], [60, 18]),
  'Tríceps unilateral na polia': () => TRI_POLIA(pegador([76, 52], [76, 64])),
  'Tríceps na máquina': () => ASSENTO + ENCOSTO + chao + EQ('<line x1="100" y1="8" x2="100" y2="99" stroke-width="5"/><line x1="100" y1="30" x2="60" y2="62"/>')
    + boneco(P(SENT, { cotovelo: [42, 48], mao: [58, 62], cotoveloT: [44, 48], maoT: [60, 60] })) + pegador([56, 56], [60, 68]),
  'Flexão diamante': () => chao + boneco(P(FLEX, { maoT: [34, 97], cotoveloT: [36, 83] })) + EQ('<polygon points="34,88 30,94 34,99 38,94" stroke-width="2"/>'),

  // ── Abdômen
  'Abdominal': () => chao + boneco(CHAO),
  'Prancha': () => chao + boneco({ cabeca: [20, 72], pesco: [30, 76], ombro: [32, 78], quadril: [70, 81], joelho: [88, 87], pe: [106, 94], joelhoT: [88, 89], peT: [104, 96], cotovelo: [32, 95], mao: [16, 96] }),
  'Elevação de pernas': () => chao + boneco({ cabeca: [20, 90], pesco: [30, 92], ombro: [32, 92], quadril: [66, 92], joelho: [72, 72], pe: [76, 50], joelhoT: [70, 72], peT: [72, 52], cotovelo: [44, 96], mao: [56, 97] }) + seta(86, 66),
  'Abdominal infra': () => chao + boneco({ cabeca: [20, 90], pesco: [30, 92], ombro: [32, 92], quadril: [64, 90], joelho: [58, 66], pe: [78, 60], joelhoT: [60, 68], peT: [80, 62], cotovelo: [44, 96], mao: [56, 97] }),
  'Abdominal oblíquo': () => chao + boneco(P(CHAO, { cotovelo: [54, 70], mao: [36, 64] })),
  'Abdominal na polia': () => chao + polia(108, [102, 8], [80, 56])
    + boneco({ cabeca: [76, 66], pesco: [66, 60], ombro: [64, 60], quadril: [44, 60], joelho: [46, 92], pe: [24, 96], joelhoT: [42, 92], peT: [20, 96], cotovelo: [70, 48], mao: [80, 56] }) + corda([81, 56]),
  'Roda abdominal': () => chao + boneco({ cabeca: [84, 70], pesco: [74, 74], ombro: [72, 75], quadril: [44, 72], joelho: [38, 96], pe: [16, 96], joelhoT: [36, 96], peT: [14, 98], cotovelo: [84, 84], mao: [96, 91] })
    + EQ('<circle cx="98" cy="92" r="6" stroke-width="3"/>'),
  'Prancha lateral': () => chao + boneco({ cabeca: [24, 58], pesco: [32, 64], ombro: [34, 66], quadril: [70, 82], joelho: [88, 90], pe: [106, 96], cotovelo: [34, 82], mao: [34, 97], cotoveloT: [38, 48], maoT: [42, 32] }),
  'Abdominal bicicleta': () => chao + boneco(P(CHAO, { joelho: [56, 68], pe: [72, 64], joelhoT: [84, 84], peT: [104, 82], cotovelo: [52, 70], mao: [34, 62] })),
  'Abdominal remador': () => chao + boneco({ cabeca: [32, 50], pesco: [36, 62], ombro: [37, 64], quadril: [50, 92], joelho: [66, 66], pe: [86, 90], joelhoT: [64, 68], peT: [84, 92], cotovelo: [52, 66], mao: [68, 62] }),
  'Escalador': () => chao + boneco(P(FLEX, { joelho: [52, 84], pe: [66, 94], joelhoT: [90, 86], peT: [108, 94] })),

  // ── Glúteo
  'Elevação pélvica': () => chao + EQ('<line x1="8" y1="64" x2="34" y2="64"/><line x1="12" y1="64" x2="12" y2="99"/><line x1="30" y1="64" x2="30" y2="99"/>')
    + boneco({ cabeca: [16, 54], pesco: [26, 58], ombro: [28, 58], quadril: [62, 56], joelho: [82, 58], pe: [84, 97], joelhoT: [80, 60], peT: [90, 97], cotovelo: [44, 54], mao: [60, 46] }) + anilha(62, 44, 11),
  'Glúteo na polia': () => chao + polia(104, [100, 94], [28, 90])
    + boneco(P(PE, { joelho: [40, 76], pe: [28, 90], joelhoT: [54, 79], peT: [54, 98], cotovelo: [70, 40], mao: [100, 40] })),
  'Abdutora': () => chao + EQ('<line x1="44" y1="66" x2="76" y2="66" stroke-width="6"/><line x1="30" y1="58" x2="30" y2="82" stroke-width="6"/><line x1="90" y1="58" x2="90" y2="82" stroke-width="6"/>')
    + boneco(P(SENT_FR, { joelho: [38, 70], pe: [34, 96], joelhoT: [82, 70], peT: [86, 96], cotovelo: [48, 48], mao: [46, 64], cotoveloT: [72, 48], maoT: [74, 64] }), true),
  'Agachamento sumô': () => chao + boneco({ cabeca: [60, 26], pesco: [60, 38], ombro: [60, 40], quadril: [60, 66], joelho: [38, 74], pe: [34, 98], joelhoT: [82, 74], peT: [86, 98], cotovelo: [54, 54], mao: [60, 70], cotoveloT: [66, 54], maoT: [60, 70] }, true) + halter(60, 76, 90, 1, 1.3),
  'Glúteo 4 apoios': () => chao + boneco({ cabeca: [22, 58], pesco: [30, 62], ombro: [32, 64], quadril: [68, 64], joelho: [88, 58], pe: [92, 38], joelhoT: [68, 96], peT: [90, 96], cotovelo: [32, 80], mao: [32, 96], cotoveloT: [36, 80], maoT: [36, 96] }) + seta(100, 44),
  'Ponte': () => chao + boneco({ cabeca: [16, 92], pesco: [26, 92], ombro: [28, 92], quadril: [62, 72], joelho: [80, 70], pe: [84, 97], joelhoT: [78, 72], peT: [90, 97], cotovelo: [40, 96], mao: [52, 97] }) + seta(62, 60),
  'Glúteo na máquina': () => chao + EQ('<line x1="22" y1="74" x2="46" y2="74" stroke-width="6"/><line x1="34" y1="74" x2="34" y2="99"/><line x1="98" y1="22" x2="98" y2="54" stroke-width="6"/>')
    + boneco({ cabeca: [22, 52], pesco: [30, 58], ombro: [32, 60], quadril: [68, 62], joelho: [86, 50], pe: [98, 36], joelhoT: [66, 92], peT: [88, 96], cotovelo: [32, 74], mao: [44, 72] }),

  // ── Quadríceps
  'Agachamento livre': () => AGACH({ cotovelo: [66, 50], mao: [60, 38] }, '', anilha(56, 37, 10)),
  'Leg press': () => LEGPRESS([80, 50]) + boneco({ cabeca: [18, 52], pesco: [24, 62], ombro: [25, 64], quadril: [40, 84], joelho: [58, 54], pe: [80, 52], joelhoT: [60, 56], peT: [82, 54], cotovelo: [36, 76], mao: [46, 84] }),
  'Cadeira extensora': () => ASSENTO + ENCOSTO + chao + boneco(P(SENT, { joelho: [70, 64], pe: [94, 58], joelhoT: [68, 64], peT: [92, 56], cotovelo: [46, 50], mao: [56, 66] })) + rolo(96, 64, 5),
  'Afundo (passada)': () => chao + boneco({ cabeca: [52, 18], pesco: [52, 30], ombro: [52, 32], quadril: [52, 62], joelho: [72, 74], pe: [72, 98], joelhoT: [42, 92], peT: [24, 96], cotovelo: [53, 48], mao: [54, 64] }) + halter(54, 66, 0),
  'Hack': () => AGACH({ cotovelo: [48, 50], mao: [52, 36] }, EQ('<line x1="58" y1="32" x2="48" y2="40" stroke-width="5"/>'), EQ('<line x1="20" y1="70" x2="58" y2="10" stroke-width="6"/>') + EQ('<line x1="50" y1="98" x2="74" y2="98" stroke-width="5"/>')),
  'Agachamento no Smith': () => AGACH({ cotovelo: [66, 50], mao: [60, 38] }, '', EQ('<line x1="56" y1="4" x2="56" y2="99" stroke-width="3"/>') + anilha(56, 37, 10)),
  'Agachamento búlgaro': () => chao + EQ('<line x1="6" y1="68" x2="30" y2="68"/><line x1="10" y1="68" x2="10" y2="99"/><line x1="26" y1="68" x2="26" y2="99"/>')
    + boneco({ cabeca: [54, 20], pesco: [52, 32], ombro: [52, 34], quadril: [50, 64], joelho: [68, 76], pe: [68, 98], joelhoT: [40, 88], peT: [22, 64], cotovelo: [53, 50], mao: [54, 66] }) + halter(54, 68, 0),
  'Agachamento goblet': () => AGACH({ cotovelo: [64, 56], mao: [66, 44], cotoveloT: [62, 56], maoT: [64, 44] }, halter(68, 44, 90, 1, 1.3)),
  'Agachamento frontal': () => AGACH({ cotovelo: [72, 44], mao: [64, 38] }, anilha(62, 38, 9)),
  'Subida no banco': () => chao + EQ('<rect x="62" y="74" width="34" height="25" stroke-width="3"/>')
    + boneco({ cabeca: [52, 12], pesco: [52, 24], ombro: [52, 26], quadril: [50, 56], joelho: [68, 60], pe: [72, 73], joelhoT: [46, 78], peT: [40, 98], cotovelo: [53, 42], mao: [54, 58] }) + halter(54, 60, 0),
  'Adutora': () => chao + EQ('<line x1="44" y1="66" x2="76" y2="66" stroke-width="6"/><line x1="56" y1="60" x2="56" y2="80" stroke-width="4"/><line x1="64" y1="60" x2="64" y2="80" stroke-width="4"/>')
    + boneco(P(SENT_FR, { joelho: [50, 70], pe: [46, 96], joelhoT: [70, 70], peT: [74, 96], cotovelo: [46, 48], mao: [40, 62], cotoveloT: [74, 48], maoT: [80, 62] }), true),
  'Agachamento sissy': () => chao + EQ('<line x1="88" y1="20" x2="88" y2="99" stroke-width="4"/>')
    + boneco({ cabeca: [34, 22], pesco: [40, 33], ombro: [41, 35], quadril: [52, 60], joelho: [70, 80], pe: [58, 97], joelhoT: [68, 82], peT: [56, 98], cotovelo: [64, 36], mao: [88, 36] }),

  // ── Posterior
  'Mesa flexora': () => chao + EQ('<line x1="14" y1="68" x2="94" y2="68"/><line x1="20" y1="68" x2="20" y2="98"/><line x1="88" y1="68" x2="88" y2="98"/>') + boneco(PRONO) + rolo(92, 42, 5),
  'Cadeira flexora': () => ASSENTO + ENCOSTO + chao + EQ('<line x1="52" y1="54" x2="76" y2="54" stroke-width="6"/>')
    + boneco(P(SENT, { joelho: [70, 64], pe: [62, 90], joelhoT: [68, 64], peT: [60, 88], cotovelo: [46, 50], mao: [56, 66] })) + rolo(64, 86, 5),
  'Stiff': () => chao + boneco(P(STIFF, { cotovelo: [74, 68], mao: [72, 84] })) + barra([56, 92], [90, 76]),
  'Terra romeno': () => chao + boneco(P(STIFF, { joelho: [58, 77], pe: [54, 98], joelhoT: [54, 77], peT: [50, 98], cotovelo: [72, 66], mao: [68, 80] })) + barra([52, 88], [86, 72]),
  'Flexora em pé': () => chao + EQ('<line x1="88" y1="28" x2="88" y2="99" stroke-width="5"/>')
    + boneco(P(PE, { joelho: [52, 80], pe: [34, 74], joelhoT: [54, 79], peT: [54, 98], cotovelo: [68, 42], mao: [86, 42] })) + rolo(32, 72, 5),
  'Good morning': () => chao + anilha(74, 46, 10) + boneco(P(STIFF, { cotovelo: [64, 62], mao: [72, 48] })),
  'Stiff unilateral': () => chao + boneco({ cabeca: [88, 50], pesco: [78, 54], ombro: [76, 55], quadril: [50, 58], joelho: [54, 78], pe: [54, 98], joelhoT: [32, 56], peT: [12, 52], cotovelo: [76, 70], mao: [74, 84] }) + halter(74, 86, 0),

  // ── Panturrilha
  'Panturrilha em pé': () => chao + EQ('<rect x="46" y="91" width="22" height="8" stroke-width="3"/>') + boneco(P(PE, { joelho: [56, 74], pe: [58, 91], joelhoT: [52, 74], peT: [54, 91], ...BRACO_BAIXO })) + halter(56, 63, 0) + seta(38, 92),
  'Panturrilha sentado': () => chao + ASSENTO + EQ('<rect x="62" y="91" width="22" height="8" stroke-width="3"/><line x1="58" y1="58" x2="84" y2="58" stroke-width="6"/>')
    + boneco(P(SENT, { joelho: [70, 66], pe: [74, 91], joelhoT: [68, 66], peT: [72, 91], cotovelo: [52, 50], mao: [64, 58] })) + seta(92, 92),
  'Panturrilha no leg press': () => LEGPRESS([88, 42]) + boneco({ cabeca: [18, 52], pesco: [24, 62], ombro: [25, 64], quadril: [40, 84], joelho: [64, 62], pe: [88, 42], joelhoT: [66, 64], peT: [90, 44], cotovelo: [36, 76], mao: [46, 84] }),
  'Panturrilha unilateral': () => chao + EQ('<line x1="90" y1="20" x2="90" y2="99" stroke-width="4"/><rect x="46" y="91" width="22" height="8" stroke-width="3"/>')
    + boneco(P(PE, { joelho: [56, 74], pe: [58, 91], joelhoT: [46, 80], peT: [36, 72], cotovelo: [70, 40], mao: [90, 40] })) + seta(38, 92),
};

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: SVG PRONTO
// ═══════════════════════════════════════════════════════════════
export const temDesenho = (nome) => !!DESENHOS[nome];
export function svgExercicio(nome, cls = 'bn') {
  const f = DESENHOS[nome];
  return f ? `<svg viewBox="0 0 120 100" class="${cls}" aria-hidden="true">${f()}</svg>` : '';
}
void SEM;
