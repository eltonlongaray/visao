-- ═══════════════════════════════════════════════════════════════
-- CAIXA DE FERRAMENTAS v2 — seções (títulos) dentro dos grupos + grupos custom
-- ═══════════════════════════════════════════════════════════════
-- Dentro de um grupo (ex.: Casa) a pessoa cria TÍTULOS (ex.: Cozinha, Mercado),
-- e cada título tem sua própria lista de checkbox embaixo. Também pode criar
-- grupos além dos 5 padrão. Os 5 padrão + Academia ficam no código; a tabela
-- guarda só os grupos CRIADOS pela pessoa (pra persistirem vazios).

-- ─── BLOCO 1: GRUPOS CUSTOM ────────────────────────────────────
create table if not exists public.ferramentas_grupos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nome       text not null check (char_length(btrim(nome)) between 1 and 40),
  icone      text default '📌',
  ord        double precision not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ferramentas_grupos enable row level security;
create index if not exists idx_ferr_grupos_user on public.ferramentas_grupos(user_id, ord);

drop policy if exists ferr_grupos_ler on public.ferramentas_grupos;
create policy ferr_grupos_ler on public.ferramentas_grupos for select to authenticated using (user_id = auth.uid());
drop policy if exists ferr_grupos_criar on public.ferramentas_grupos;
create policy ferr_grupos_criar on public.ferramentas_grupos for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ferr_grupos_editar on public.ferramentas_grupos;
create policy ferr_grupos_editar on public.ferramentas_grupos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ferr_grupos_apagar on public.ferramentas_grupos;
create policy ferr_grupos_apagar on public.ferramentas_grupos for delete to authenticated using (user_id = auth.uid());

-- ─── BLOCO 2: SEÇÕES (títulos dentro de um grupo) ──────────────
-- A seção pertence a um grupo pelo NOME (text), igual os itens. Persiste mesmo
-- vazia (a pessoa cria o título e depois enche).
create table if not exists public.ferramentas_secoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  grupo      text not null check (char_length(btrim(grupo)) between 1 and 40),
  nome       text not null check (char_length(btrim(nome)) between 1 and 60),
  ord        double precision not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ferramentas_secoes enable row level security;
create index if not exists idx_ferr_secoes_user on public.ferramentas_secoes(user_id, grupo, ord);

drop policy if exists ferr_secoes_ler on public.ferramentas_secoes;
create policy ferr_secoes_ler on public.ferramentas_secoes for select to authenticated using (user_id = auth.uid());
drop policy if exists ferr_secoes_criar on public.ferramentas_secoes;
create policy ferr_secoes_criar on public.ferramentas_secoes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ferr_secoes_editar on public.ferramentas_secoes;
create policy ferr_secoes_editar on public.ferramentas_secoes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ferr_secoes_apagar on public.ferramentas_secoes;
create policy ferr_secoes_apagar on public.ferramentas_secoes for delete to authenticated using (user_id = auth.uid());

-- ─── BLOCO 3: ITEM PODE PERTENCER A UMA SEÇÃO ──────────────────
-- secao_id null = item "solto" no topo do grupo (sem título). Apagar a seção
-- leva junto os itens dela (cascade).
alter table public.ferramentas_itens
  add column if not exists secao_id uuid references public.ferramentas_secoes(id) on delete cascade;
create index if not exists idx_ferr_itens_secao on public.ferramentas_itens(secao_id);

-- ─── BLOCO 4: RENOMEAR GRUPO leva as seções junto ──────────────
-- O RPC antigo só mexia nos itens; agora as seções também guardam o nome do
-- grupo, então renomear precisa atualizar as duas tabelas.
create or replace function public.ferramentas_renomear_grupo(de text, para text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(btrim(para)) not between 1 and 40 then return; end if;
  update public.ferramentas_itens  set grupo = btrim(para) where user_id = auth.uid() and grupo = de;
  update public.ferramentas_secoes set grupo = btrim(para) where user_id = auth.uid() and grupo = de;
  update public.ferramentas_grupos set nome  = btrim(para) where user_id = auth.uid() and nome  = de;
end $$;
grant execute on function public.ferramentas_renomear_grupo(text, text) to authenticated;

notify pgrst, 'reload schema';
