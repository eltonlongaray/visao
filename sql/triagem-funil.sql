-- ═══════════════════════════════════════════════════════════════
-- FUNIL DA TRIAGEM (26/11/2026, caso Alê: 72 cliques no Google → 4 triagens)
-- Rodar no Supabase → SQL Editor. Idempotente.
-- Conta quantas PESSOAS chegaram em cada tela da triagem (sem nome, sem WhatsApp):
-- cada visita tem um código aleatório do aparelho (sessao) e cada tela conta 1 vez por visita.
-- A profissional vê o resumo em 📣 Campanhas → "Onde as pessoas param na triagem".
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELA (só acessada pelas funções abaixo) ===
create table if not exists triagem_passos (
  id        bigserial primary key,
  slug      text not null,
  sessao    text not null,
  ordem     int  not null,
  passo     text not null,
  origem    text,
  criado_em timestamptz not null default now(),
  unique (slug, sessao, passo)
);
create index if not exists triagem_passos_slug_em on triagem_passos (slug, criado_em);
alter table triagem_passos enable row level security;   -- sem policy: ninguém lê/escreve direto

-- === BLOCO 2: REGISTRAR UMA TELA (página pública, anônimo) ===
create or replace function triagem_passo(p_slug text, p_sessao text, p_ordem int, p_passo text, p_origem text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_slug is null or p_sessao is null or p_passo is null
     or length(p_slug) > 20 or length(p_sessao) > 40 or length(p_passo) > 80 then
    return;
  end if;
  if not exists (select 1 from agenda_config where slug = p_slug) then return; end if;
  insert into triagem_passos (slug, sessao, ordem, passo, origem)
  values (p_slug, p_sessao, coalesce(p_ordem, 0), p_passo, left(nullif(trim(coalesce(p_origem, '')), ''), 30))
  on conflict (slug, sessao, passo) do nothing;
end;
$$;
grant execute on function triagem_passo(text, text, int, text, text) to anon, authenticated;

-- === BLOCO 3: RESUMO PRA DONA DA AGENDA (pessoas por tela, por origem) ===
create or replace function triagem_funil(p_de date, p_ate date default null)
returns table (ordem int, passo text, origem text, pessoas bigint)
language sql security definer set search_path = public stable
as $$
  select min(t.ordem)::int as ordem, t.passo, coalesce(t.origem, 'direto') as origem, count(distinct t.sessao) as pessoas
  from triagem_passos t
  join agenda_config c on c.slug = t.slug and c.user_id = auth.uid()
  where t.criado_em >= p_de
    and t.criado_em < coalesce(p_ate, current_date) + 1
  group by t.passo, coalesce(t.origem, 'direto')
  order by 1, 2;
$$;
grant execute on function triagem_funil(date, date) to authenticated;
