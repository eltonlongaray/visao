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

// Reserva 1+ números de uma vez (nome + WhatsApp). Falha tudo se algum já estiver ocupado.
export async function escolherNumeros(slug, numeros, nome, contato) {
  const { data, error } = await supabase.rpc('escolher_numeros', {
    p_slug: (slug || '').trim(), p_numeros: numeros,
    p_nome: (nome || '').trim().slice(0, 120),
    p_contato: (contato || '').trim().slice(0, 60),
  });
  if (error) throw new Error(error.message);
  return data;
}
