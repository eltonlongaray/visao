-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios (Fase 0 — teaser + "Quero participar")
-- Rodar UMA vez no Supabase → SQL Editor. Reusa profiles.is_admin.
-- ═══════════════════════════════════════════════════════════════

-- 1) Desafios (admin cria)
create table if not exists public.desafios (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  descricao  text not null,
  dias_total int,
  status     text not null default 'aberto',   -- rascunho | aberto | encerrado
  created_at timestamptz not null default now(),
  author_id  uuid default auth.uid()
);
alter table public.desafios enable row level security;

drop policy if exists "desafios_read" on public.desafios;
create policy "desafios_read" on public.desafios
  for select using (status <> 'rascunho' or exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin));

drop policy if exists "desafios_admin_insert" on public.desafios;
create policy "desafios_admin_insert" on public.desafios
  for insert with check (exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin));

drop policy if exists "desafios_admin_update" on public.desafios;
create policy "desafios_admin_update" on public.desafios
  for update using (exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin));

drop policy if exists "desafios_admin_delete" on public.desafios;
create policy "desafios_admin_delete" on public.desafios
  for delete using (exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin));

-- 2) Interesse ("Quero participar")
create table if not exists public.desafio_interesse (
  id         uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.desafios(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (desafio_id, user_id)
);
alter table public.desafio_interesse enable row level security;

-- Todos autenticados leem (pra contar interessados)
drop policy if exists "interesse_read" on public.desafio_interesse;
create policy "interesse_read" on public.desafio_interesse
  for select using (true);

-- Cada um entra/sai só do próprio interesse
drop policy if exists "interesse_insert_own" on public.desafio_interesse;
create policy "interesse_insert_own" on public.desafio_interesse
  for insert with check (user_id = auth.uid());

drop policy if exists "interesse_delete_own" on public.desafio_interesse;
create policy "interesse_delete_own" on public.desafio_interesse
  for delete using (user_id = auth.uid());
