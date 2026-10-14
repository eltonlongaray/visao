// ─── ÍNDICE ──────────────────────────────────────────────────
// Banco de frases do Pet: manda cada frase de frases.json pro Worker de
// TESTE (pet-ia-teste, mesma IA e mesmas instruções do Worker de verdade)
// e confere se a IA devolveu a ação e os campos esperados.
// Roda pelo GitHub (Actions → "Testar frases do Pet"). Frases são inventadas:
// nunca colar aqui frase real de usuário (o repositório é público).
// Uso: PET_URL=... PET_TESTE_CHAVE=... node testes/pet-frases/rodar.mjs [filtro]
// BLOCO 1 — COMPARAR (resposta x esperado)
// BLOCO 2 — RODAR (chama o Worker, 3 por vez)
// BLOCO 3 — RELATÓRIO (resumo por ação + lista do que errou)
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const PET_URL = process.env.PET_URL;
const CHAVE = process.env.PET_TESTE_CHAVE;
const FILTRO = (process.argv[2] || '').trim();
if (!PET_URL || !CHAVE) { console.error('Faltam PET_URL e PET_TESTE_CHAVE'); process.exit(1); }

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: COMPARAR
// ═══════════════════════════════════════════════════════════════
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const horaNorm = (h) => { const m = String(h || '').match(/(\d{1,2})[:h]?(\d{2})?/); return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : ''; };

// Campo por campo: texto = "contém" (sem acento/maiúscula), hora e número exatos,
// itens = cada item esperado aparece em algum item da resposta
function conferir(esperado, r, frase = '') {
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
// BLOCO 2: RODAR
// ═══════════════════════════════════════════════════════════════
async function perguntar(c) {
  const body = { texto: c.f };
  if (c.h) body.historico = c.h;
  if (c.p) { body.pergunta = c.p.pergunta; body.opcoes = c.p.opcoes; }
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
    await new Promise(r => setTimeout(r, 1500 * (tentativa + 1)));
  }
  return { erro: 'ia indisponível' };
}

const casos = JSON.parse(readFileSync(new URL('./frases.json', import.meta.url), 'utf8'))
  .filter(c => !FILTRO || c.e.acao === FILTRO || c.f.includes(FILTRO));
// Espera o Worker de teste responder antes de começar (até 1 min)
for (let i = 0; i < 12; i++) {
  const r = await fetch(PET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pet-Teste': CHAVE }, body: JSON.stringify({ texto: 'oi' }) }).catch(() => null);
  if (r?.ok) break;
  await new Promise(r => setTimeout(r, 5000));
}
const resultados = new Array(casos.length);
let prox = 0;
await Promise.all([0, 1, 2].map(async () => {
  while (prox < casos.length) {
    const i = prox++;
    const r = await perguntar(casos[i]);
    // "ou": outra resposta que também serve (ex.: média de sono pelo Desempenho)
    let erros = r.erro ? [`erro: ${r.erro}`] : conferir(casos[i].e, r, casos[i].f);
    if (erros.length && !r.erro && casos[i].ou && !conferir(casos[i].ou, r, casos[i].f).length) erros = [];
    resultados[i] = { ...casos[i], r, erros };
  }
}));

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: RELATÓRIO
// ═══════════════════════════════════════════════════════════════
const porAcao = {};
for (const x of resultados) {
  const a = (porAcao[x.e.acao] ||= { ok: 0, total: 0 });
  a.total++;
  if (!x.erros.length) a.ok++;
}
const ok = resultados.filter(x => !x.erros.length).length;
const pct = Math.round((ok / resultados.length) * 100);
let md = `## Frases do Pet: ${ok}/${resultados.length} certas (${pct}%)\n\n| Ação | Certas |\n|---|---|\n`;
for (const [a, v] of Object.entries(porAcao).sort()) md += `| ${a} | ${v.ok}/${v.total}${v.ok < v.total ? ' ⚠️' : ''} |\n`;
const errados = resultados.filter(x => x.erros.length);
if (errados.length) {
  md += `\n### O que errou\n\n`;
  for (const x of errados) md += `- **${x.f}**: ${x.erros.join('; ')}\n  - veio: \`${JSON.stringify({ ...x.r, resposta: undefined })}\`\n`;
}
console.log(md);
writeFileSync('relatorio-pet.json', JSON.stringify({ ok, total: resultados.length, porAcao, resultados }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
