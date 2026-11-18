-- ═══════════════════════════════════════════════════════════════
-- DEPOIMENTOS DOS CLIENTES (18/11/2026) — prints do WhatsApp e vídeos
-- Rodar no Supabase → SQL Editor. Idempotente.
-- O arquivo fica no Cloudflare R2 (tipo "depo", só a dona vê); aqui fica o
-- registro: de quem é, legenda e se pode divulgar. Só a dona lê e mexe (RLS).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELA ===
create table if not exists depoimentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cliente_nome text,
  cliente_contato text,
  cliente_digitos text,
  tipo text not null default 'print',      -- print | video
  arquivo text not null,                   -- caminho no R2 (<uid>/depo-....r2.ext)
  mime text,
  legenda text,
  pode_divulgar boolean not null default false,
  data date not null default current_date,
  created_at timestamptz default now()
);
create index if not exists depoimentos_owner_idx on depoimentos (owner_id, created_at desc);

-- === BLOCO 2: PERMISSÕES + RLS ===
grant select, insert, update, delete on depoimentos to authenticated;
alter table depoimentos enable row level security;
drop policy if exists depoimentos_owner on depoimentos;
create policy depoimentos_owner on depoimentos
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
