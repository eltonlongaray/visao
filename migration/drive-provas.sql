-- ═══════════════════════════════════════════════════════════════
-- FALCON · Provas guardadas sozinhas no Google Drive (Élton, 16/10/2026)
-- Rodar no SQL Editor. Pode rodar de novo sem problema.
--
-- drive_contas: a autorização de cada pessoa (refresh_token do Google) e a
--   pasta "Falcon · Provas dos desafios". SÓ o servidor (Edge Function
--   drive-oauth) lê e grava: sem nenhuma regra pro app, ninguém lê o token.
-- drive_oauth_state: o "carimbo" de quem pediu pra conectar (vale 15 min).
-- desafio_checkins.drive_file_id: o vídeo dessa prova já está no Drive.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.drive_contas (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  pasta_id      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.drive_contas enable row level security;
revoke all on public.drive_contas from anon, authenticated;

create table if not exists public.drive_oauth_state (
  state      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.drive_oauth_state enable row level security;
revoke all on public.drive_oauth_state from anon, authenticated;

alter table public.desafio_checkins add column if not exists drive_file_id text;

notify pgrst, 'reload schema';
