// ═══════════════════════════════════════════════════════════════
// FALCON · Canal de feedback (sugestões de melhoria)
// Guarda na tabela `feedback` (RLS: cada um só vê o próprio; admin lê via service_role).
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';

export async function submitFeedback(message) {
  const msg = (message || '').trim();
  if (!msg) throw new Error('Escreva sua sugestão antes de enviar.');
  const { error } = await supabase.from('feedback').insert({ message: msg }); // user_id = auth.uid() (default)
  if (error) throw new Error(error.message);
}
