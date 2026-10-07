// ─── ÍNDICE ──────────────────────────────────────────────────
// Diário do Pet: guarda as frases que o Pet NÃO soube atender, pra virarem
// função nova. Só o texto da frase: sem id, nome ou e-mail de quem falou.
// Frase repetida não ocupa outra linha (só soma "vezes"), o banco guarda no
// máximo as 2000 mais recentes e, quando a função fica pronta, a frase é
// apagada (sql/pet-diario.sql). Sem a tabela criada, não faz nada.
// BLOCO 1 — ANOTAR
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// motivo: 'nao_sei_fazer' (é do app, mas não existe a ação) |
//         'nao_entendi' (nada entendeu) | 'nenhuma' (pessoa recusou o "você quis dizer?")
const MOTIVOS = new Set(['nao_sei_fazer', 'nao_entendi', 'nenhuma']);
const jaAnotadas = new Set();   // mesma frase na mesma sessão: uma vez só

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: ANOTAR
// ═══════════════════════════════════════════════════════════════
export function anotarNoDiario(texto, motivo) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (t.length < 3 || !MOTIVOS.has(motivo)) return;
  const k = `${motivo}|${t.toLowerCase()}`;
  if (jaAnotadas.has(k)) return;
  jaAnotadas.add(k);
  // Fogo e esquece: o diário nunca atrasa nem quebra a resposta do Pet
  Promise.resolve()
    .then(() => supabase.rpc('pet_diario_anotar', { p_texto: t, p_motivo: motivo }))
    .catch(() => {});
}
