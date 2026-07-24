// ═══════════════════════════════════════════════════════════════
// JUNTAR TRECHOS DE VOZ SEM REPETIR
// ═══════════════════════════════════════════════════════════════
// O reconhecedor do Android reentrega o enunciado INTEIRO a cada reinício,
// cada vez um pouco mais completo:
//
//   1) "10:00 título lazer descrição"
//   2) "Agendar compromisso para domingo às 10:00 título lazer descrição aniversário"
//   3) "Agendar compromisso para domingo às 10 horas título lazer descrição aniversário"
//
// Emendar isso na unha produz o texto triplicado que apareceu no campo.
// Aqui a junção olha a SOBREPOSIÇÃO entre o que já existe e o que chegou:
//   • um contém o outro  -> fica o mais completo
//   • terminam/começam igual -> emenda só a parte nova
//   • nada em comum      -> emenda de verdade (ditado longo, legítimo)

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Quantas palavras do FIM de `a` são iguais ao COMEÇO de `b`.
function palavrasSobrepostas(a, b) {
  const pa = normalizar(a).split(' ').filter(Boolean);
  const pb = normalizar(b).split(' ').filter(Boolean);
  const max = Math.min(pa.length, pb.length);
  for (let n = max; n > 0; n--) {
    if (pa.slice(-n).join(' ') === pb.slice(0, n).join(' ')) return n;
  }
  return 0;
}

// Quantas palavras do COMEÇO das duas são iguais. É o sinal de reentrega:
// o reconhecedor recomeça a frase do zero, corrigindo pedaços no meio
// ("às 10:00" vira "às 10 horas") — nesse caso nem um contém o outro nem há
// sobreposição de ponta, mas o início bate.
function prefixoComum(a, b) {
  const pa = normalizar(a).split(' ').filter(Boolean);
  const pb = normalizar(b).split(' ').filter(Boolean);
  let n = 0;
  while (n < pa.length && n < pb.length && pa[n] === pb[n]) n++;
  return { n, menor: Math.min(pa.length, pb.length) };
}

export function juntarFala(atual, novo) {
  const a = String(atual || '').trim();
  const b = String(novo || '').trim();
  if (!a) return b;
  if (!b) return a;

  const na = normalizar(a), nb = normalizar(b);
  // Reentrega do mesmo enunciado: fica o mais completo, não os dois.
  if (nb.includes(na)) return b;
  if (na.includes(nb)) return a;

  // Mesma frase recomeçada com correções no meio: fica a mais longa. O corte
  // em 40% separa isso de duas frases distintas que por acaso começam igual —
  // ditando, ninguém repete metade da frase anterior de propósito.
  const pre = prefixoComum(a, b);
  if (pre.menor >= 3 && pre.n / pre.menor >= 0.4) {
    return nb.length >= na.length ? b : a;
  }

  const n = palavrasSobrepostas(a, b);
  if (n > 0) {
    const resto = b.split(/\s+/).slice(n).join(' ');
    return resto ? `${a} ${resto}` : a;
  }
  return `${a} ${b}`;
}
