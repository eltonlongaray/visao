// ═══════════════════════════════════════════════════════════════
// FALCON · Migração Firebase → Supabase (Fase 2)
// Lê Firestore + Firebase Auth (Admin SDK) e grava no Postgres (service_role).
// Uso único. NÃO faz parte do app. Idempotente (upserts) — pode rodar de novo.
//
// PRÉ-REQUISITOS (ver README.md):
//   1. migration/firebase-service-account.json  (baixado do Firebase Console)
//   2. env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (do painel do Supabase)
//   3. npm install  (dentro de migration/)
//
// MODOS:
//   node migrate.mjs --dry-run          → só lê e mostra o que migraria (sem escrever)
//   node migrate.mjs                     → migra de verdade (cria users + upsert dados)
//   node migrate.mjs --reset-passwords   → além de migrar, manda email de redefinir
//                                          senha pros usuários de email/senha
// ═══════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN         = process.argv.includes('--dry-run');
const RESET_PASSWORDS = process.argv.includes('--reset-passwords');

// ── Config ───────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ Faltam env vars: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(new URL('./firebase-service-account.json', import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const fdb = admin.firestore();

// service_role: bypassa RLS. Precisamos setar user_id explicitamente em TODO insert.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const log = (...a) => console.log(...a);
const tag = DRY_RUN ? '[DRY-RUN]' : '[MIGRAR]';


// ═══════════════════════════════════════════════════════════════
// MAPEADORES: doc do Firestore → row do Postgres
// (espelham banco-dados.js; aqui setamos user_id explícito)
// ═══════════════════════════════════════════════════════════════
function profileRow(uid, d) {
  const known = new Set(['defaultWakeTime','defaultSleepTime','template','streakOrigin','weekdayTemplates','monthlyCommitments','createdAt']);
  const extra = {};
  for (const [k, v] of Object.entries(d || {})) if (!known.has(k)) extra[k] = v;
  return {
    user_id: uid,
    default_wake_time:   d?.defaultWakeTime ?? null,
    default_sleep_time:  d?.defaultSleepTime ?? null,
    template:            d?.template ?? null,
    streak_origin:       d?.streakOrigin ?? null,
    weekday_templates:   d?.weekdayTemplates ?? {},
    monthly_commitments: d?.monthlyCommitments ?? [],
    extra,
    ...(d?.createdAt ? { created_at: toISO(d.createdAt) } : {}),
  };
}
function shiftRow(uid, id, d)  { return { id, user_id: uid, name: d.name ?? null, description: d.desc ?? null, icon: d.icon ?? null, ord: d.order ?? null, gradient: d.gradient ?? null }; }
function categoryRow(uid, id, d) {
  const { name, icon, color, order, daysOfWeek, ...rest } = d;
  const row = { id, user_id: uid, name: name ?? null, icon: icon ?? null, color: color ?? null, ord: order ?? null, days_of_week: daysOfWeek ?? [] };
  if (Object.keys(rest).length) row.extra = rest;
  return row;
}
function activityRow(uid, id, d) { return { id, user_id: uid, data: d ?? {} , ...(d?.createdAt ? { created_at: toISO(d.createdAt) } : {}) }; }
function dayRow(uid, dayId, meta) { return { user_id: uid, day: dayId, meta: stripTimestamps(meta || {}) }; }
function taskRow(uid, id, dayId, t) {
  const known = new Set(['activityId','title','desc','kind','startTime','shiftId','categoryId','icon','reminderEnabled','done','order','recurrenceGroupId','recurrenceType','cancelled','rescheduled','rescheduleCount']);
  const extra = {};
  for (const [k, v] of Object.entries(t)) if (!known.has(k) && k !== 'id') extra[k] = v;
  return {
    id, user_id: uid, day: dayId,
    activity_id: t.activityId ?? null,
    title: t.title ?? '',
    description: t.desc ?? '',
    kind: t.kind ?? 'task',
    start_time: t.startTime ?? '',
    shift_id: t.shiftId ?? null,
    category_id: t.categoryId ?? null,
    icon: t.icon ?? '',
    reminder_enabled: !!t.reminderEnabled,
    done: !!t.done,
    ord: t.order ?? 0,
    recurrence_group_id: t.recurrenceGroupId ?? null,
    recurrence_type: t.recurrenceType ?? null,
    cancelled: !!t.cancelled,
    rescheduled: !!t.rescheduled,
    reschedule_count: t.rescheduleCount ?? 0,
    extra: stripTimestamps(extra),
  };
}
function weekNoteRow(uid, mondayId, d) { return { user_id: uid, monday: mondayId, data: stripTimestamps(d || {}) }; }
function consentRow(uid, key, d) {
  return { user_id: uid, key, accepted_at: d.acceptedAt || new Date().toISOString(), version: d.version ?? null, user_agent: d.userAgent ?? null };
}

// Firestore Timestamp → ISO; recursivo pra dentro de metas/JSONB
function toISO(v) { return v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v; }
function stripTimestamps(obj) {
  if (Array.isArray(obj)) return obj.map(stripTimestamps);
  if (obj && typeof obj === 'object') {
    if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = stripTimestamps(v);
    return out;
  }
  return obj;
}


// ═══════════════════════════════════════════════════════════════
// SUPABASE: garante user + retorna uuid (mapa firebase_uid → supabase_uid por email)
// ═══════════════════════════════════════════════════════════════
async function findSupabaseUserByEmail(email) {
  // <10 usuários → 1 página basta
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function ensureSupabaseUser(fbUser) {
  const email = fbUser.email;
  if (!email) return null; // sem email não dá pra mapear
  const existing = await findSupabaseUserByEmail(email);
  if (existing) return existing.id;
  if (DRY_RUN) return '(seria-criado)';
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // já verificado no Firebase → linka com login Google por email
    user_metadata: {
      full_name: fbUser.displayName || null,
      migrated_from_firebase_uid: fbUser.uid,
    },
  });
  if (error) throw error;
  return data.user.id;
}

async function upsertRows(table, rows, onConflict) {
  if (!rows.length) return 0;
  if (DRY_RUN) return rows.length;
  const opts = onConflict ? { onConflict } : undefined;
  // chunk de 500 por segurança
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), opts);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return rows.length;
}


// ═══════════════════════════════════════════════════════════════
// LEITURA DO FIRESTORE (por usuário)
// ═══════════════════════════════════════════════════════════════
async function readUserData(fbUid) {
  const base = fdb.collection('users').doc(fbUid);
  const [profileSnap, shifts, categories, activities, weeks, consents, daysSnap] = await Promise.all([
    base.get(),
    base.collection('shifts').get(),
    base.collection('categories').get(),
    base.collection('activities').get(),
    base.collection('weeks').get(),
    base.collection('consents').get(),
    base.collection('days').get(),
  ]);
  // tasks de cada dia
  const days = [];
  for (const d of daysSnap.docs) {
    const tasksSnap = await base.collection('days').doc(d.id).collection('tasks').get();
    days.push({ id: d.id, meta: d.data(), tasks: tasksSnap.docs.map(t => ({ id: t.id, ...t.data() })) });
  }
  return {
    profile: profileSnap.exists ? profileSnap.data() : null,
    shifts:     shifts.docs.map(x => ({ id: x.id, ...x.data() })),
    categories: categories.docs.map(x => ({ id: x.id, ...x.data() })),
    activities: activities.docs.map(x => ({ id: x.id, ...x.data() })),
    weeks:      weeks.docs.map(x => ({ id: x.id, ...x.data() })),
    consents:   consents.docs.map(x => ({ id: x.id, ...x.data() })),
    days,
  };
}


// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  log(`\n${tag} Falcon · migração Firebase → Supabase\n`);

  // 1) Lista usuários do Firebase Auth
  const authUsers = [];
  let pageToken;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    authUsers.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken);

  log(`👥 ${authUsers.length} usuários no Firebase Auth\n`);

  const summary = [];
  for (const u of authUsers) {
    const providers = (u.providerData || []).map(p => p.providerId).join(', ') || 'nenhum';
    const supaUid = await ensureSupabaseUser(u);
    if (!supaUid) { log(`  ⚠️  ${u.uid} sem email — pulado`); continue; }

    const data = await readUserData(u.uid);
    const counts = {
      profile: data.profile ? 1 : 0,
      shifts: data.shifts.length, categories: data.categories.length,
      activities: data.activities.length, weeks: data.weeks.length,
      consents: data.consents.length,
      days: data.days.length, tasks: data.days.reduce((s, d) => s + d.tasks.length, 0),
    };

    if (!DRY_RUN) {
      if (data.profile) await upsertRows('profiles', [profileRow(supaUid, data.profile)], 'user_id');
      await upsertRows('shifts',     data.shifts.map(s => shiftRow(supaUid, s.id, s)), 'id');
      await upsertRows('categories', data.categories.map(c => categoryRow(supaUid, c.id, c)), 'id');
      await upsertRows('activities', data.activities.map(a => activityRow(supaUid, a.id, a)), 'id');
      await upsertRows('days',       data.days.map(d => dayRow(supaUid, d.id, d.meta)), 'user_id,day');
      const allTasks = data.days.flatMap(d => d.tasks.map(t => taskRow(supaUid, t.id, d.id, t)));
      await upsertRows('tasks',      allTasks, 'id');
      await upsertRows('week_notes', data.weeks.map(w => weekNoteRow(supaUid, w.id, w)), 'user_id,monday');
      await upsertRows('consents',   data.consents.map(c => consentRow(supaUid, c.id, c)), 'user_id,key');

      // Usuário de email/senha → não dá pra migrar o hash scrypt do Firebase direto.
      // Plano seguro: manda email de redefinir senha (só com --reset-passwords).
      const isPasswordUser = (u.providerData || []).some(p => p.providerId === 'password');
      if (RESET_PASSWORDS && isPasswordUser && u.email) {
        const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
          redirectTo: 'https://eltonlongaray.github.io/visao/',
        });
        if (error) log(`  ⚠️  reset pw falhou ${u.email}: ${error.message}`);
      }
    }

    summary.push({ email: u.email, providers, fbUid: u.uid, supaUid, ...counts });
    log(`  ✓ ${u.email}  [${providers}]  → ${JSON.stringify(counts)}`);
  }

  log(`\n${tag} concluído. ${summary.length} usuários processados.`);
  log('Resumo:'); console.table(summary.map(s => ({ email: s.email, prov: s.providers, tasks: s.tasks, days: s.days, cats: s.categories })));
  if (DRY_RUN) log('\n(DRY-RUN: nada foi escrito no Supabase. Rode sem --dry-run pra valer.)');
}

main().then(() => process.exit(0)).catch(err => { console.error('\n❌ ERRO:', err); process.exit(1); });
