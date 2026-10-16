-- ═══════════════════════════════════════════════════════════════
-- FICHA DE ATENDIMENTO — REGISTRO DE CADA SESSÃO (fase 1, 2, 3…)
-- Rodar no Supabase → SQL Editor (depois do sql/ficha.sql). Idempotente.
-- A profissional registra no app: dor ao pressionar (0–10 por região),
-- medidas antes/depois e observações. Só a dona lê e mexe (RLS).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELA ===
create table if not exists ficha_sessoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cliente_nome text,
  cliente_contato text,
  cliente_digitos text,                   -- só números (liga a sessão ao cliente da Agenda)
  data date not null default current_date,
  palpacao jsonb default '{}'::jsonb,     -- { "lombar_d": 7, "trapezio_e": 4 }  dor ao pressionar, 0–10
  medidas jsonb default '{}'::jsonb,      -- { "Cintura": { "antes": 72, "depois": 70.5 } }  em cm (peso em kg)
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ficha_sessoes_owner_idx on ficha_sessoes (owner_id, data);

-- === BLOCO 2: PERMISSÕES + RLS ===
grant select, insert, update, delete on ficha_sessoes to authenticated;
alter table ficha_sessoes enable row level security;
drop policy if exists ficha_sessoes_owner on ficha_sessoes;
create policy ficha_sessoes_owner on ficha_sessoes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
