// ═══════════════════════════════════════════════════════════════
// FALCON · Exclusão de conta (LGPD Art. 18, VI)
// Apaga TODOS os dados do usuário no Postgres (via RLS). O registro de
// auth em si (só email) precisa de um Edge Function admin pra sumir — TODO.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — PUBLIC API (excluir conta)
// BLOCO 2 — EXCLUIR MÊS (admin)
// BLOCO 3 — EXCLUIR SEMANA (admin)
// ─────────────────────────────────────────────────────────────
import { auth } from './autenticacao.js';
import { supabase } from './config-supabase.js';
import * as biometric from './biometria.js';

// Ordem: filhos antes de pais (por via das dúvidas; RLS + on delete cascade cobrem também)
const USER_TABLES = ['tasks', 'days', 'week_notes', 'consents', 'activities', 'categories', 'shifts', 'profiles'];


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PUBLIC API
// ═══════════════════════════════════════════════════════════════
// Retorna { firestore: true, auth: 'signed-out' } (mantém a chave 'firestore'
// só pra não quebrar quem consome; hoje é Postgres).
export async function deleteMyAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  const uid = user.uid;

  // 1) Limpa a bio local pra não deixar órfã
  biometric.disable();

  // 2) Apaga todos os dados do usuário (RLS já escopa; filtro explícito por segurança)
  for (const table of USER_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', uid);
    if (error) console.warn('[delete]', table, error.message);
  }

  // 3) Desloga. O registro de auth (só email) é removido por Edge Function admin depois.
  await supabase.auth.signOut();
  return { firestore: true, auth: 'signed-out' };
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: EXCLUIR MÊS (admin) — reset de dados de teste. monthKey 'YYYY-MM'
// ═══════════════════════════════════════════════════════════════
export async function deleteMonth(monthKey) {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Formato inválido');
  const uid = user.uid;
  const like = `${monthKey}-%`;

  const { data: dayRows } = await supabase.from('days').select('day').eq('user_id', uid).like('day', like);
  await supabase.from('tasks').delete().eq('user_id', uid).like('day', like);
  await supabase.from('days').delete().eq('user_id', uid).like('day', like);
  return dayRows ? dayRows.length : 0;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: EXCLUIR SEMANA (admin). mondayId 'YYYY-MM-DD' (segunda-feira)
// ═══════════════════════════════════════════════════════════════
export async function deleteWeek(mondayId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mondayId)) throw new Error('Formato inválido');
  const uid = user.uid;
  const monday = new Date(mondayId + 'T00:00:00');

  const dayIds = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dayIds.push(`${y}-${m}-${dd}`);
  }

  await supabase.from('tasks').delete().eq('user_id', uid).in('day', dayIds);
  await supabase.from('days').delete().eq('user_id', uid).in('day', dayIds);
  await supabase.from('week_notes').delete().eq('user_id', uid).eq('monday', mondayId);
  return dayIds.length;
}
