// ─── ÍNDICE ──────────────────────────────────────────────────
// Caderno de estudo do Pet (FIAP Fase 6, cap. 6): a "prova" de cada versão.
// Lê o caderno no Supabase (frases que o Pet não entendeu + a resposta certa),
// manda cada uma pro Worker de TESTE, guarda no banco o que o Pet respondeu e
// fecha uma versão nova com o placar. Assim dá pra ver, versão a versão, se o
// Pet melhorou ou piorou (sql/pet-caderno.sql).
//
// PRIVACIDADE: o repositório e os logs do GitHub são públicos. Este script
// NUNCA imprime frase nem resposta: só totais por ação. O detalhe fica no
// banco (pet_caderno.ultimo_ok / ultima_resp), que só a revisão semanal lê.
//
// Uso: PET_URL=... PET_TESTE_CHAVE=... PET_DIARIO_CHAVE=... \
//      node testes/pet-caderno/estudar.mjs [limite] [nota]
// limite = quantas frases entram na prova (padrão 60; poupa a cota da IA).
// BLOCO 1 — LER O CADERNO
// BLOCO 2 — ESCOLHER AS FRASES DA PROVA
// BLOCO 3 — PROVA E PLACAR
// ─────────────────────────────────────────────────────────────
import { readFileSync, appendFileSync } from 'node:fs';
import { provar, esperarWorker, porAcao } from '../pet-frases/comum.mjs';

const { PET_URL, PET_TESTE_CHAVE, PET_DIARIO_CHAVE } = process.env;
const LIMITE = Math.max(1, Math.min(200, Number(process.argv[2]) || 60));
const NOTA = (process.argv[3] || '').slice(0, 300);
if (!PET_URL || !PET_TESTE_CHAVE || !PET_DIARIO_CHAVE) {
  console.error('Faltam PET_URL, PET_TESTE_CHAVE e PET_DIARIO_CHAVE');
  process.exit(1);
}

// O endereço e a chave pública do Supabase são os mesmos do app
const cfg = readFileSync(new URL('../../js/config-supabase.js', import.meta.url), 'utf8');
const SUPABASE_URL = process.env.SUPABASE_URL_TESTE || cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
const SUPABASE_KEY = cfg.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
async function rpc(nome, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_chave: PET_DIARIO_CHAVE, ...corpo }),
  });
  if (!r.ok) throw new Error(`${nome}: ${r.status}`);   // sem o corpo: pode ecoar frase
  return r.json();
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: LER O CADERNO
// ═══════════════════════════════════════════════════════════════
const caderno = await rpc('pet_caderno_ler', {});
if (!caderno.length) {
  console.log('Caderno vazio: nada pra provar.');
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ESCOLHER AS FRASES DA PROVA
// ═══════════════════════════════════════════════════════════════
// Primeiro as que nunca fizeram prova, depois as que o Pet errou na última,
// depois as que ele acertou (pra ver se não piorou). Cada grupo, mais nova antes.
const ordem = (c) => (c.ultimo_ok == null ? 0 : c.ultimo_ok === false ? 1 : 2);
const escolhidas = [...caderno]
  .sort((a, b) => ordem(a) - ordem(b) || String(b.entrou_em).localeCompare(String(a.entrou_em)))
  .slice(0, LIMITE);

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: PROVA E PLACAR
// ═══════════════════════════════════════════════════════════════
await esperarWorker(PET_URL, PET_TESTE_CHAVE);
const resultados = await provar(escolhidas.map(c => ({ id: c.id, f: c.texto, e: c.esperado })), PET_URL, PET_TESTE_CHAVE);
const semIa = resultados.filter(x => x.r?.erro).length;
if (semIa > resultados.length / 2) {
  console.error(`A IA não respondeu ${semIa} de ${resultados.length} frases (cota do dia?). Versão NÃO fechada.`);
  process.exit(1);
}
const validos = resultados.filter(x => !x.r?.erro);
await rpc('pet_caderno_resultado', {
  p_res: validos.map(x => ({ id: x.id, ok: !x.erros.length, resp: { ...x.r, resposta: undefined } })),
});
const placar = porAcao(validos);
const certas = validos.filter(x => !x.erros.length).length;
const versao = await rpc('pet_caderno_fechar_versao', {
  p_provadas: validos.length, p_certas: certas, p_por_acao: placar, p_nota: NOTA || null,
});

const pct = validos.length ? Math.round((certas / validos.length) * 100) : 0;
let md = `## Caderno do Pet — versão ${versao}: ${certas}/${validos.length} certas (${pct}%)\n\n`;
md += `Caderno com ${caderno.length} frases; ${validos.length} na prova${semIa ? ` (${semIa} sem resposta da IA)` : ''}.\n\n| Ação | Certas |\n|---|---|\n`;
for (const [a, v] of Object.entries(placar).sort()) md += `| ${a} | ${v.ok}/${v.total}${v.ok < v.total ? ' ⚠️' : ''} |\n`;
md += '\n_As frases não aparecem aqui (repositório público). O detalhe fica no banco._\n';
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
