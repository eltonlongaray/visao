// ─── ÍNDICE ──────────────────────────────────────────────────
// Funções de dados da AGENDA PÚBLICA (sem login). Isoladas aqui pra que a
// página leve (agenda.html → agenda-lite.js) só carregue o supabase, e NÃO o
// app inteiro (nada de auth, banco-dados, roteador…). agenda.js re-exporta.
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// Lê a agenda de um dono pelo slug (só o que é público: título, duração, dias).
export async function getAgendaPublica(slug) {
  const { data, error } = await supabase.from('agenda_config')
    .select('slug, titulo, duracao_min, disponibilidade, ativo, servicos')
    .eq('slug', (slug || '').trim()).eq('ativo', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

// Slots já ocupados (data+hora), via RPC que NÃO expõe nome/contato do cliente.
export async function getSlotsOcupados(slug, deISO, ateISO) {
  const { data, error } = await supabase.rpc('slots_ocupados', { p_slug: slug, p_from: deISO, p_to: ateISO });
  if (error) throw new Error(error.message);
  const set = new Set();
  for (const r of data || []) set.add(`${r.data}|${r.hora}`);
  return set;
}

// Cria um agendamento via RPC (valida disponibilidade + não estar ocupado).
export async function criarAgendamento(slug, dataISO, hora, nome, contato, servicoId) {
  const { data, error } = await supabase.rpc('criar_agendamento', {
    p_slug: slug, p_data: dataISO, p_hora: hora,
    p_nome: (nome || '').trim().slice(0, 120),
    p_contato: (contato || '').trim().slice(0, 60),
    p_servico_id: servicoId || null,
  });
  if (error) throw new Error(error.message);
  return data;
}
