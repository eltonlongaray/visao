// ─── ÍNDICE ──────────────────────────────────────────────────
// Peças comuns da prova do Pet: comparar a resposta da IA com a esperada e
// perguntar ao Worker de TESTE. Usado pelo banco de frases inventadas
// (testes/pet-frases/rodar.mjs) e pelo caderno de estudo (testes/pet-caderno).
// BLOCO 1 — COMPARAR (resposta x esperado)
// BLOCO 2 — PERGUNTAR (chama o Worker de teste, com novas tentativas)
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: COMPARAR
// ═══════════════════════════════════════════════════════════════
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const horaNorm = (h) => { const m = String(h || '').match(/(\d{1,2})[:h]?(\d{2})?/); return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : ''; };

// Campo por campo: texto = "contém" (sem acento/maiúscula), hora e número exatos,
// itens = cada item esperado aparece em algum item da resposta
export function conferir(esperado, r, frase = '') {
  const erros = [];
  for (const [k, v] of Object.entries(esperado)) {
    const got = r?.[k];
    if (k === 'acao' || k === 'campo' || k === 'consulta' || k === 'opcao') {
      if (norm(got) !== norm(v)) erros.push(`${k}: "${got ?? '—'}" (esperado "${v}")`);
    } else if (k === 'hora') {
      if (horaNorm(got) !== v) erros.push(`hora: "${got ?? '—'}" (esperado ${v})`);
    } else if (k === 'numero') {
      if (Number(got) !== v) erros.push(`numero: ${got ?? '—'} (esperado ${v})`);
    } else if (k === 'todas') {
      if (!!got !== v) erros.push(`todas: ${got ?? '—'} (esperado ${v})`);
    } else if (k === 'itens') {
      const lista = Array.isArray(got) ? got.map(norm) : [];
      // "meditar" vale por "Meditação": compara o começo da palavra
      const falta = v.filter(x => !lista.some(y => y.includes(norm(x)) || y.includes(norm(x).slice(0, 5))));
      if (falta.length) erros.push(`itens: ${JSON.stringify(got ?? [])} (faltou ${falta.join(', ')})`);
    } else if (!norm(got).includes(norm(v))) {
      erros.push(`${k}: "${got ?? '—'}" (esperado conter "${v}")`);
    }
  }
  // Dado que a pessoa não falou e o app usaria (hora 00:00, itens inventados)
  for (const k of ['hora', 'numero', 'itens']) {
    if (k === 'numero' && /\d/.test(frase)) continue;   // "últimos 10 dias": número citado, sem problema
    if (!(k in esperado) && r?.[k] != null && !(Array.isArray(r[k]) && !r[k].length)) erros.push(`${k} inventado: ${JSON.stringify(r[k])}`);
  }
  return erros;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PERGUNTAR
// ═══════════════════════════════════════════════════════════════
export async function perguntar(c, PET_URL, CHAVE) {
  const body = { texto: c.f };
  if (c.h) body.historico = c.h;
  if (c.p) { body.pergunta = c.p.pergunta; body.opcoes = c.p.opcoes; }
  let ultimo = 'sem resposta';
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    let res;
    try {
      res = await fetch(PET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pet-Teste': CHAVE },
        body: JSON.stringify(body),
      });
    } catch {   // conexão caiu (Worker recém-publicado): tenta de novo
      await new Promise(r => setTimeout(r, 2000 * (tentativa + 1)));
      continue;
    }
    const j = await res.json().catch(() => ({}));
    if (res.ok) return j;
    // 404/403 logo depois de publicar = o Worker de teste ainda está se espalhando
    if (![502, 503, 404, 403].includes(res.status)) return { erro: `${res.status} ${j.erro || ''}` };
    ultimo = `${res.status} ${j.erro || ''} ${j.detalhe || ''}`.trim();
    await new Promise(r => setTimeout(r, 1500 * (tentativa + 1)));
  }
  // Guarda o motivo da última tentativa (cota do dia, Worker fora do ar...)
  return { erro: `ia indisponível (${ultimo})` };
}

// Espera o Worker de teste responder antes de começar (até 1 min)
export async function esperarWorker(PET_URL, CHAVE) {
  for (let i = 0; i < 12; i++) {
    const r = await fetch(PET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pet-Teste': CHAVE }, body: JSON.stringify({ texto: 'oi' }) }).catch(() => null);
    if (r?.ok) return;
    await new Promise(r => setTimeout(r, 5000));
  }
}

// Roda a prova, 3 por vez. casos = [{ f, e, ou?, h?, p? }]
export async function provar(casos, PET_URL, CHAVE) {
  const resultados = new Array(casos.length);
  let prox = 0;
  await Promise.all([0, 1, 2].map(async () => {
    while (prox < casos.length) {
      const i = prox++;
      const r = await perguntar(casos[i], PET_URL, CHAVE);
      // "ou": outra resposta que também serve (ex.: média de sono pelo Desempenho)
      let erros = r.erro ? [`erro: ${r.erro}`] : conferir(casos[i].e, r, casos[i].f);
      if (erros.length && !r.erro && casos[i].ou && !conferir(casos[i].ou, r, casos[i].f).length) erros = [];
      resultados[i] = { ...casos[i], r, erros };
    }
  }));
  return resultados;
}

// Resumo por ação: { agendar: { ok, total } }
export function porAcao(resultados) {
  const m = {};
  for (const x of resultados) {
    const a = (m[x.e.acao] ||= { ok: 0, total: 0 });
    a.total++;
    if (!x.erros.length) a.ok++;
  }
  return m;
}
