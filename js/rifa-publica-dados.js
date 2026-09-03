// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados da RIFA pública (sem login). Só supabase — pra a página leve não
// arrastar o app inteiro. RPCs security definer no Supabase.
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// Dados públicos da rifa (título, total de números, ativo).
export async function getRifa(slug) {
  const { data, error } = await supabase.rpc('rifa_publica', { p_slug: (slug || '').trim() });
  if (error) throw new Error(error.message);
  return data || null;
}

// Números já escolhidos (array de int).
export async function getNumerosOcupados(slug) {
  const { data, error } = await supabase.rpc('rifa_ocupados', { p_slug: (slug || '').trim() });
  if (error) throw new Error(error.message);
  return new Set(Array.isArray(data) ? data : []);
}

// Escolhe um número (nome + WhatsApp). Falha se já estiver ocupado.
export async function escolherNumero(slug, numero, nome, contato) {
  const { data, error } = await supabase.rpc('escolher_numero', {
    p_slug: (slug || '').trim(), p_numero: numero,
    p_nome: (nome || '').trim().slice(0, 120),
    p_contato: (contato || '').trim().slice(0, 60),
  });
  if (error) throw new Error(error.message);
  return data;
}
