-- ═══════════════════════════════════════════════════════════════
-- FALCON · Avisos (comunicados do time para todos os usuários)
-- Rodar UMA vez no Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- 1) Flag de admin em profiles (quem pode publicar avisos)
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Marca o Elton como admin
update public.profiles set is_admin = true
  where user_id = (select id from auth.users where email = 'elton.longaray483@gmail.com');

-- 2) Tabela de avisos
create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  author_id  uuid default auth.uid()
);

alter table public.avisos enable row level security;

-- 3) RLS
--    • Todos os usuários autenticados leem avisos publicados
--    • Só admin insere / edita / apaga
drop policy if exists "avisos_read_published" on public.avisos;
create policy "avisos_read_published" on public.avisos
  for select using (published = true);

drop policy if exists "avisos_admin_insert" on public.avisos;
create policy "avisos_admin_insert" on public.avisos
  for insert with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin)
  );

drop policy if exists "avisos_admin_update" on public.avisos;
create policy "avisos_admin_update" on public.avisos
  for update using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin)
  );

drop policy if exists "avisos_admin_delete" on public.avisos;
create policy "avisos_admin_delete" on public.avisos
  for delete using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin)
  );

-- Conferência rápida:
-- select user_id, is_admin from public.profiles where is_admin;
