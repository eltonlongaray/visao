// ─── ÍNDICE ──────────────────────────────────────────────────
// Classificador de intenção do Pet, rodando no navegador (sem servidor, sem custo).
// Lê os pesos exportados por treinar.py e reproduz: normalizar → features →
// TF-IDF → regressão logística → softmax.
// normalizar() e features() são gêmeos de texto.py: mudou lá, muda aqui.
// ─────────────────────────────────────────────────────────────

const ABREV = {
  vc: 'voce', vcs: 'voces', pq: 'porque', q: 'que', tb: 'tambem',
  tbm: 'tambem', hj: 'hoje', amnh: 'amanha', qdo: 'quando',
  qto: 'quanto', qnto: 'quanto', msg: 'mensagem', td: 'tudo',
  blz: 'beleza', obg: 'obrigado', vlw: 'valeu', p: 'pra', pro: 'pra',
};

export function normalizar(texto) {
  let t = String(texto).toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  t = t.replace(/\d+/g, '0').replace(/[^a-z0 ]+/g, ' ');
  return t.split(/\s+/).filter(Boolean).map(p => ABREV[p] || p).join(' ');
}

export function features(texto) {
  const palavras = normalizar(texto).split(' ').filter(Boolean);
  const feats = palavras.map(p => 'w:' + p);
  for (let i = 0; i + 1 < palavras.length; i++) feats.push('b:' + palavras[i] + '_' + palavras[i + 1]);
  for (const p of palavras) {
    const s = ' ' + p + ' ';
    for (let i = 0; i + 3 <= s.length; i++) feats.push('c:' + s.slice(i, i + 3));
  }
  return feats;
}

// Prepara o modelo uma vez (índice do vocabulário) e devolve a função de classificar
export function carregarModelo(json) {
  const indice = new Map(json.vocab.map((f, i) => [f, i]));
  return function classificar(texto) {
    const contagem = new Map();
    for (const f of features(texto)) {
      const i = indice.get(f);
      if (i !== undefined) contagem.set(i, (contagem.get(i) || 0) + 1);
    }
    // TF-IDF com norma L2 (igual ao TfidfVectorizer padrão)
    let norma = 0;
    const vetor = [];
    for (const [i, tf] of contagem) {
      const v = tf * json.idf[i];
      vetor.push([i, v]);
      norma += v * v;
    }
    norma = Math.sqrt(norma) || 1;
    const scores = json.coef.map((linha, c) => {
      let s = json.intercept[c];
      for (const [i, v] of vetor) s += linha[i] * (v / norma);
      return s;
    });
    const max = Math.max(...scores);
    const exps = scores.map(s => Math.exp(s - max));
    const soma = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / soma);
    let melhor = 0;
    for (let c = 1; c < probs.length; c++) if (probs[c] > probs[melhor]) melhor = c;
    return {
      intencao: json.classes[melhor],
      confianca: probs[melhor],
      entendeu: probs[melhor] >= json.limiar,
    };
  };
}
