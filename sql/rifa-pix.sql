-- ═══════════════════════════════════════════════════════════════
-- FALCON RIFA — colunas + tabela pro Pix automático (Mercado Pago)
-- Rode UMA VEZ no Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════

-- Número reservado passa a ter estado de pagamento
alter table rifa_numeros add column if not exists pago boolean not null default false;
alter table rifa_numeros add column if not exists payment_id text;

-- Pagamentos (payment_id do Mercado Pago ↔ números)
create table if not exists rifa_pagamentos (
  id uuid primary key default gen_random_uuid(),
  rifa_id uuid references rifas(id) on delete cascade,
  payment_id text unique not null,
  numeros int[] not null,
  nome text,
  contato text,
  valor numeric,
  status text default 'pending',
  pago_em timestamptz,
  created_at timestamptz default now()
);
alter table rifa_pagamentos enable row level security;
-- (sem policies diretas: a Edge Function usa a service role; o anon só via RPCs)

-- Números OCUPADOS continua incluindo os reservados (pagos ou aguardando pgto).
-- rifa_ocupados já devolve todos de rifa_numeros — nada a mudar.
