-- ═══════════════════════════════════════════════════════════════
-- KANBAN das tarefas do dia (Ferramentas) — Élton, 26/11/2026
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez.
--   kanban_modalidades → os botões do topo (Trabalho, Faculdade, Casa,
--                        Pessoal…): nome, cor e ordem. A pessoa cria/edita.
--   kanban_tarefas     → os cards: modalidade, título, coluna
--                        (afazer | fazendo | feito), posição e as 3 datas:
--                        criado_em, fazendo_em (foi pra Fazendo), feito_em.
-- Nada some sozinho: Feito é o histórico. Tudo com RLS (só a dona).
-- (As tabelas kanban_quadros/listas/cartoes do PR #155 não são usadas.)
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: MODALIDADES ===
create table if not exists kanban_modalidades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),
  cor text not null default 'azul',
  ordem double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists kanban_modalidades_owner_idx on kanban_modalidades (owner_id, ordem);

-- === BLOCO 2: TAREFAS ===
create table if not exists kanban_tarefas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modalidade_id uuid not null references kanban_modalidades(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 300),
  coluna text not null default 'afazer' check (coluna in ('afazer', 'fazendo', 'feito')),
  ordem double precision not null default 0,     -- menor = mais em cima
  criado_em timestamptz not null default now(),
  fazendo_em timestamptz,                         -- última vez que entrou em Fazendo
  feito_em timestamptz,                           -- quando foi concluída
  updated_at timestamptz not null default now()
);
create index if not exists kanban_tarefas_mod_idx on kanban_tarefas (modalidade_id, coluna, ordem);
create index if not exists kanban_tarefas_owner_idx on kanban_tarefas (owner_id, feito_em);

-- === BLOCO 3: SEGURANÇA (RLS: só a dona) ===
grant select, insert, update, delete on kanban_modalidades, kanban_tarefas to authenticated;
alter table kanban_modalidades enable row level security;
alter table kanban_tarefas enable row level security;
drop policy if exists kanban_modalidades_dona on kanban_modalidades;
create policy kanban_modalidades_dona on kanban_modalidades for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists kanban_tarefas_dona on kanban_tarefas;
create policy kanban_tarefas_dona on kanban_tarefas for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 4: TETOS (evita abuso) ===
create or replace function kanban_tarefas_teto() returns trigger language plpgsql as $$
declare n int;
begin
  if tg_table_name = 'kanban_modalidades' then
    select count(*) into n from kanban_modalidades where owner_id = new.owner_id;
    if n >= 30 then raise exception 'Limite de 30 modalidades no Kanban'; end if;
  else
    select count(*) into n from kanban_tarefas where owner_id = new.owner_id;
    if n >= 5000 then raise exception 'Limite de 5000 tarefas no Kanban'; end if;
  end if;
  return new;
end $$;
drop trigger if exists kanban_modalidades_teto on kanban_modalidades;
create trigger kanban_modalidades_teto before insert on kanban_modalidades for each row execute function kanban_tarefas_teto();
drop trigger if exists kanban_tarefas_teto on kanban_tarefas;
create trigger kanban_tarefas_teto before insert on kanban_tarefas for each row execute function kanban_tarefas_teto();

notify pgrst, 'reload schema';

-- Confere: deve aparecer true
select (select count(*) from information_schema.tables where table_name in ('kanban_modalidades','kanban_tarefas')) = 2 as "kanban";
