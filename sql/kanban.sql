-- ═══════════════════════════════════════════════════════════════
-- KANBAN (aba do menu) — etapa 1: Kanban PESSOAL
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez.
--   kanban_cards → cada card: título, descrição, coluna (a fazer / fazendo /
--                  feito) e a posição dele dentro da coluna.
-- equipe_id fica reservado pra etapa 2 (Kanban da equipe); por enquanto
-- todo card é pessoal e só a dona lê e mexe (RLS).
-- ═══════════════════════════════════════════════════════════════
create table if not exists kanban_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  equipe_id uuid,                        -- etapa 2 (null = pessoal)
  titulo text not null check (char_length(titulo) between 1 and 200),
  descricao text check (descricao is null or char_length(descricao) <= 2000),
  coluna text not null default 'afazer' check (coluna in ('afazer', 'fazendo', 'feito')),
  ordem double precision not null default 0,   -- menor = mais em cima
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kanban_cards_owner_idx on kanban_cards (owner_id, coluna, ordem);

grant select, insert, update, delete on kanban_cards to authenticated;
alter table kanban_cards enable row level security;
drop policy if exists kanban_pessoal on kanban_cards;
create policy kanban_pessoal on kanban_cards
  for all using (auth.uid() = owner_id and equipe_id is null)
  with check (auth.uid() = owner_id and equipe_id is null);

-- Teto por pessoa (evita abuso): 500 cards pessoais
create or replace function kanban_teto() returns trigger language plpgsql as $$
begin
  if (select count(*) from kanban_cards where owner_id = new.owner_id and equipe_id is null) >= 500 then
    raise exception 'Limite de 500 cards no Kanban pessoal';
  end if;
  return new;
end $$;
drop trigger if exists kanban_teto_trg on kanban_cards;
create trigger kanban_teto_trg before insert on kanban_cards
  for each row when (new.equipe_id is null) execute function kanban_teto();
