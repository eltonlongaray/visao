-- ═══════════════════════════════════════════════════════════════
-- FONTES DE RENDA montadas por cada pessoa (Caixa de Ferramentas) — Élton, 26/11/2026
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez.
--   renda_fontes   → os cards. pai_id = dentro de qual card está (null = topo).
--                    tipo: 'grupo' (abre outros cards dentro), 'mentoria' (a tela
--                    da Mentoria que já existe) ou 'clientes' (lista de clientes).
--   renda_clientes → os clientes de um card do tipo 'clientes': contato, fase,
--                    quanto pagou, próximo pagamento e anotações.
-- Tudo com RLS (só a dona vê e mexe).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: FONTES ===
create table if not exists renda_fontes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pai_id uuid references renda_fontes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),
  icone text not null default '💼' check (char_length(icone) between 1 and 16),
  tipo text not null default 'clientes' check (tipo in ('grupo', 'mentoria', 'clientes')),
  ordem double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists renda_fontes_owner_idx on renda_fontes (owner_id, pai_id, ordem);

-- === BLOCO 2: CLIENTES ===
create table if not exists renda_clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fonte_id uuid not null references renda_fontes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  contato text check (char_length(contato) <= 40),
  fase text check (char_length(fase) <= 80),
  valor_pago numeric(12,2),
  proximo_valor numeric(12,2),
  proximo_em date,
  notas text check (char_length(notas) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists renda_clientes_fonte_idx on renda_clientes (fonte_id, created_at);

-- === BLOCO 3: SEGURANÇA (RLS: só a dona) ===
grant select, insert, update, delete on renda_fontes, renda_clientes to authenticated;
alter table renda_fontes enable row level security;
alter table renda_clientes enable row level security;
drop policy if exists renda_fontes_dona on renda_fontes;
create policy renda_fontes_dona on renda_fontes for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists renda_clientes_dona on renda_clientes;
create policy renda_clientes_dona on renda_clientes for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 4: TETOS (evita abuso) ===
create or replace function renda_teto() returns trigger language plpgsql as $$
declare n int;
begin
  if tg_table_name = 'renda_fontes' then
    select count(*) into n from renda_fontes where owner_id = new.owner_id;
    if n >= 60 then raise exception 'Limite de 60 fontes de renda'; end if;
  else
    select count(*) into n from renda_clientes where owner_id = new.owner_id;
    if n >= 3000 then raise exception 'Limite de 3000 clientes'; end if;
  end if;
  return new;
end $$;
drop trigger if exists renda_fontes_teto on renda_fontes;
create trigger renda_fontes_teto before insert on renda_fontes for each row execute function renda_teto();
drop trigger if exists renda_clientes_teto on renda_clientes;
create trigger renda_clientes_teto before insert on renda_clientes for each row execute function renda_teto();

notify pgrst, 'reload schema';

-- Confere: deve aparecer true
select (select count(*) from information_schema.tables where table_name in ('renda_fontes','renda_clientes')) = 2 as "fontes_de_renda";
