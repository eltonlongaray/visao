-- ═══════════════════════════════════════════════════════════════
-- FUNIL TAMBÉM NOS FORMULÁRIOS DA MENTORIA (26/11/2026, caso Larissa Y35)
-- Rodar no Supabase → SQL Editor. Idempotente. Precisa do sql/triagem-funil.sql antes.
-- O mesmo contador por tela da triagem passa a valer pra /selecao/<slug> (alunas) e
-- /pesquisa/<slug> (colegas). Coluna "form" separa: triagem · selecao · pesquisa.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: COLUNA DO FORMULÁRIO ===
alter table triagem_passos add column if not exists form text not null default 'triagem';
alter table triagem_passos drop constraint if exists triagem_passos_slug_sessao_passo_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'triagem_passos_slug_form_sessao_passo_key') then
    alter table triagem_passos add constraint triagem_passos_slug_form_sessao_passo_key unique (slug, form, sessao, passo);
  end if;
end $$;

-- === BLOCO 2: REGISTRAR UMA TELA (agora com o formulário) ===
drop function if exists triagem_passo(text, text, int, text, text);
create or replace function triagem_passo(p_slug text, p_sessao text, p_ordem int, p_passo text,
                                         p_origem text default null, p_form text default 'triagem')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_slug is null or p_sessao is null or p_passo is null
     or length(p_slug) > 20 or length(p_sessao) > 40 or length(p_passo) > 80
     or coalesce(p_form, 'triagem') not in ('triagem', 'selecao', 'pesquisa') then
    return;
  end if;
  if not exists (select 1 from agenda_config where slug = p_slug) then return; end if;
  insert into triagem_passos (slug, form, sessao, ordem, passo, origem)
  values (p_slug, coalesce(p_form, 'triagem'), p_sessao, coalesce(p_ordem, 0), p_passo,
          left(nullif(trim(coalesce(p_origem, '')), ''), 30))
  on conflict (slug, form, sessao, passo) do nothing;
end;
$$;
grant execute on function triagem_passo(text, text, int, text, text, text) to anon, authenticated;

-- === BLOCO 3: RESUMO (devolve o formulário junto; o app filtra) ===
drop function if exists triagem_funil(date, date);
create or replace function triagem_funil(p_de date, p_ate date default null)
returns table (form text, ordem int, passo text, origem text, pessoas bigint)
language sql security definer set search_path = public stable
as $$
  select t.form, min(t.ordem)::int as ordem, t.passo, coalesce(t.origem, 'direto') as origem,
         count(distinct t.sessao) as pessoas
  from triagem_passos t
  join agenda_config c on c.slug = t.slug and c.user_id = auth.uid()
  where t.criado_em >= p_de
    and t.criado_em < coalesce(p_ate, current_date) + 1
  group by t.form, t.passo, coalesce(t.origem, 'direto')
  order by 1, 2, 3;
$$;
grant execute on function triagem_funil(date, date) to authenticated;
