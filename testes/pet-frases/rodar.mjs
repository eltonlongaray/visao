// ─── ÍNDICE ──────────────────────────────────────────────────
// Banco de frases do Pet: manda cada frase de frases.json pro Worker de
// TESTE (pet-ia-teste, mesma IA e mesmas instruções do Worker de verdade)
// e confere se a IA devolveu a ação e os campos esperados.
// Roda pelo GitHub (Actions → "Testar frases do Pet"). Frases são inventadas:
// nunca colar aqui frase real de usuário (o repositório é público).
// Uso: PET_URL=... PET_TESTE_CHAVE=... node testes/pet-frases/rodar.mjs [filtro]
// (comparar e perguntar ficam em comum.mjs)
// BLOCO 3 — RELATÓRIO (resumo por ação + lista do que errou)
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { provar, esperarWorker, porAcao as resumoPorAcao } from './comum.mjs';

const PET_URL = process.env.PET_URL;
const CHAVE = process.env.PET_TESTE_CHAVE;
const FILTRO = (process.argv[2] || '').trim();
if (!PET_URL || !CHAVE) { console.error('Faltam PET_URL e PET_TESTE_CHAVE'); process.exit(1); }

const casos = JSON.parse(readFileSync(new URL('./frases.json', import.meta.url), 'utf8'))
  .filter(c => !FILTRO || c.e.acao === FILTRO || c.f.includes(FILTRO));
await esperarWorker(PET_URL, CHAVE);
const resultados = await provar(casos, PET_URL, CHAVE);

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: RELATÓRIO
// ═══════════════════════════════════════════════════════════════
const porAcao = resumoPorAcao(resultados);
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
