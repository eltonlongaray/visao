-- ═══════════════════════════════════════════════════════════════
-- CAIXA DE FERRAMENTAS — listas de recados sem data nem hora
-- ═══════════════════════════════════════════════════════════════
-- "Coisas que eu preciso fazer", organizadas por contexto (Casa, Pessoal,
-- Trabalho, Família, Amigos...). É captura solta: não entra no Ritual, nem no
-- Desempenho, nem nos objetivos. Só uma lista com check.
--
-- Uma tabela só, com escopo = o grupo. Grupo não é tabela própria: são poucos
-- por pessoa, e uma tabela de grupos vazia (sem itens) seria peso à toa. O
-- conjunto de grupos existentes sai de um distinct sobre os itens + a lista
-- padrão no cliente.

create table if not exists public.ferramentas_itens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  grupo      text not null check (char_length(btrim(grupo)) between 1 and 40),
  texto      text not null check (char_length(btrim(texto)) between 1 and 500),
  feito      boolean not null default false,
  ord        double precision not null default 0,   -- ordem manual dentro do grupo
  created_at timestamptz not null default now()
);

alter table public.ferramentas_itens enable row level security;
create index if not exists idx_ferramentas_user on public.ferramentas_itens(user_id, grupo, ord);

-- Cada um só vê e mexe no que é seu. Sem exceção de admin: recado pessoal não
-- é conteúdo de comunidade.
drop policy if exists ferramentas_ler on public.ferramentas_itens;
create policy ferramentas_ler on public.ferramentas_itens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ferramentas_criar on public.ferramentas_itens;
create policy ferramentas_criar on public.ferramentas_itens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists ferramentas_editar on public.ferramentas_itens;
create policy ferramentas_editar on public.ferramentas_itens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ferramentas_apagar on public.ferramentas_itens;
create policy ferramentas_apagar on public.ferramentas_itens
  for delete to authenticated using (user_id = auth.uid());

-- Renomear um grupo = renomear todos os itens dele de uma vez. Sem isto, o
-- cliente teria que atualizar item por item e um erro no meio deixaria o
-- grupo partido em dois nomes.
create or replace function public.ferramentas_renomear_grupo(de text, para text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ferramentas_itens
     set grupo = btrim(para)
   where user_id = auth.uid() and grupo = de
     and char_length(btrim(para)) between 1 and 40;
$$;
grant execute on function public.ferramentas_renomear_grupo(text, text) to authenticated;

notify pgrst, 'reload schema';
