// Verifica no SUPABASE o que foi migrado, por usuário. Só leitura.
// Uso: set -a; source .env; set +a; node verify.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAILS = [
  'elton.longaray483@gmail.com',
  'patyh.orth@gmail.com',
  'sistrikermnk@gmail.com',
  'longarayleonel@gmail.com',
  'ruth.masui@hotmail.com',
  'saude10academia@gmail.com',
];

async function countFor(table, uid) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', uid);
  if (error) return `ERRO:${error.message}`;
  return count;
}

const { data: list, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.error(error); process.exit(1); }

const rows = [];
for (const email of EMAILS) {
  const u = list.users.find(x => (x.email || '').toLowerCase() === email.toLowerCase());
  if (!u) { rows.push({ email, supabase_uid: '❌ NÃO EXISTE' }); continue; }
  const [prof, shifts, cats, days, tasks, consents] = await Promise.all([
    countFor('profiles', u.id), countFor('shifts', u.id), countFor('categories', u.id),
    countFor('days', u.id), countFor('tasks', u.id), countFor('consents', u.id),
  ]);
  rows.push({
    email, uid: u.id.slice(0, 8) + '…',
    fb_uid_meta: (u.user_metadata?.migrated_from_firebase_uid || '—').slice(0, 8) + '…',
    prof, shifts, cats, days, tasks, consents,
  });
}
console.log('\n📊 DADOS NO SUPABASE (por usuário):\n');
console.table(rows);

// Totais
for (const t of ['profiles', 'shifts', 'categories', 'days', 'tasks', 'consents', 'week_notes', 'activities']) {
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t.padEnd(12)} → ${count} linhas (total, inclui usuários de teste)`);
}
process.exit(0);
