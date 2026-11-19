-- ═══════════════════════════════════════════════════════════════
-- KANBAN no formato Trello (aba do menu) — etapa 1: Pessoal e Profissional
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez.
--   kanban_quadros → cada quadro: área (pessoal/profissional), nome, cor,
--                    favorito e os nomes das etiquetas (cores).
--   kanban_listas  → as listas (colunas) de cada quadro, na ordem.
--   kanban_cartoes → os cards: lista, título, descrição, cor (etiqueta),
--                    concluído, prazo, posição e arquivado.
-- Tudo com RLS: só a dona lê e mexe. Equipe = etapa 2.
-- (A tabela kanban_cards da versão anterior não é mais usada.)
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: QUADROS ===
create table if not exists kanban_quadros (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area text not null default 'pessoal' check (area in ('pessoal', 'profissional')),
  nome text not null check (char_length(nome) between 1 and 80),
  cor text not null default 'roxo',
  favorito boolean not null default false,
  etiquetas jsonb not null default '{}'::jsonb,   -- {"verde":"Rápido","azul":"Aguardando"}
  ordem double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kanban_quadros_owner_idx on kanban_quadros (owner_id, area);

-- === BLOCO 2: LISTAS ===
create table if not exists kanban_listas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quadro_id uuid not null references kanban_quadros(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  ordem double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists kanban_listas_quadro_idx on kanban_listas (quadro_id, ordem);

-- === BLOCO 3: CARTÕES ===
create table if not exists kanban_cartoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quadro_id uuid not null references kanban_quadros(id) on delete cascade,
  lista_id uuid not null references kanban_listas(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 300),
  descricao text check (descricao is null or char_length(descricao) <= 4000),
  cor text,                                   -- etiqueta (verde, amarelo, azul…) ou null
  concluido boolean not null default false,
  prazo date,
  ordem double precision not null default 0,  -- menor = mais em cima
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kanban_cartoes_quadro_idx on kanban_cartoes (quadro_id, arquivado, lista_id, ordem);
create index if not exists kanban_cartoes_owner_idx on kanban_cartoes (owner_id);

-- === BLOCO 4: SEGURANÇA (RLS: só a dona) ===
grant select, insert, update, delete on kanban_quadros, kanban_listas, kanban_cartoes to authenticated;
alter table kanban_quadros enable row level security;
alter table kanban_listas  enable row level security;
alter table kanban_cartoes enable row level security;
drop policy if exists kanban_quadros_dona on kanban_quadros;
create policy kanban_quadros_dona on kanban_quadros for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists kanban_listas_dona on kanban_listas;
create policy kanban_listas_dona on kanban_listas for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists kanban_cartoes_dona on kanban_cartoes;
create policy kanban_cartoes_dona on kanban_cartoes for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 5: TETOS (evita abuso) ===
create or replace function kanban_teto() returns trigger language plpgsql as $$
declare n int;
begin
  if tg_table_name = 'kanban_quadros' then
    select count(*) into n from kanban_quadros where owner_id = new.owner_id;
    if n >= 50 then raise exception 'Limite de 50 quadros no Kanban'; end if;
  elsif tg_table_name = 'kanban_listas' then
    select count(*) into n from kanban_listas where quadro_id = new.quadro_id;
    if n >= 30 then raise exception 'Limite de 30 listas por quadro'; end if;
  else
    select count(*) into n from kanban_cartoes where owner_id = new.owner_id;
    if n >= 3000 then raise exception 'Limite de 3000 cards no Kanban'; end if;
  end if;
  return new;
end $$;
drop trigger if exists kanban_quadros_teto on kanban_quadros;
create trigger kanban_quadros_teto before insert on kanban_quadros for each row execute function kanban_teto();
drop trigger if exists kanban_listas_teto on kanban_listas;
create trigger kanban_listas_teto before insert on kanban_listas for each row execute function kanban_teto();
drop trigger if exists kanban_cartoes_teto on kanban_cartoes;
create trigger kanban_cartoes_teto before insert on kanban_cartoes for each row execute function kanban_teto();

notify pgrst, 'reload schema';

-- Confere: deve aparecer true
select (select count(*) from information_schema.tables where table_name in ('kanban_quadros','kanban_listas','kanban_cartoes')) = 3 as "kanban";
