-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios v1 (aba: participar + check-in por meta + ranking)
-- Rodar no Supabase → SQL Editor. Depende de migration/desafios.sql.
-- ═══════════════════════════════════════════════════════════════

-- 1) Configuração por desafio (cada desafio é diferente)
alter table public.desafios add column if not exists meta_diaria int;      -- null = modo simples (1 check-in = dia feito)
alter table public.desafios add column if not exists unidade text;         -- ex: ml, exercício, página, min, km
alter table public.desafios add column if not exists prova_opcoes int[];    -- incrementos permitidos, ex: {250,500}. null = livre

-- 2) Participantes (guarda nome p/ ranking — RLS de profiles é só o próprio)
create table if not exists public.desafio_participantes (
  id         uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.desafios(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  nome       text,
  joined_at  timestamptz not null default now(),
  unique (desafio_id, user_id)
);
alter table public.desafio_participantes enable row level security;

drop policy if exists "part_read" on public.desafio_participantes;
create policy "part_read" on public.desafio_participantes for select using (true);
drop policy if exists "part_insert_own" on public.desafio_participantes;
create policy "part_insert_own" on public.desafio_participantes for insert with check (user_id = auth.uid());
drop policy if exists "part_delete_own" on public.desafio_participantes;
create policy "part_delete_own" on public.desafio_participantes for delete using (user_id = auth.uid());

-- 3) Check-ins (cada marcação; video_url/expira entram na fase do vídeo)
create table if not exists public.desafio_checkins (
  id              uuid primary key default gen_random_uuid(),
  desafio_id      uuid not null references public.desafios(id) on delete cascade,
  user_id         uuid not null default auth.uid(),
  dia             date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  quantidade      int not null default 1,
  video_url       text,
  video_expira_em timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.desafio_checkins enable row level security;

drop policy if exists "checkin_read" on public.desafio_checkins;
create policy "checkin_read" on public.desafio_checkins for select using (true);
drop policy if exists "checkin_insert_own" on public.desafio_checkins;
create policy "checkin_insert_own" on public.desafio_checkins for insert with check (user_id = auth.uid());
drop policy if exists "checkin_delete_own" on public.desafio_checkins;
create policy "checkin_delete_own" on public.desafio_checkins for delete using (user_id = auth.uid());
