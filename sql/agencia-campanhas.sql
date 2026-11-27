-- ═══════════════════════════════════════════════════════════════
-- AGÊNCIA: relatório automático da campanha do cliente. Élton, 27/11/2026
-- Rodar no Supabase do FALCON → SQL Editor. Seguro rodar mais de uma vez.
--   1. agenda_config.agencia_ids: quem cuida da campanha vê os NÚMEROS da agenda/triagem
--      (sem nome, sem WhatsApp, sem respostas da cliente).
--   2. anuncios_dia: o script do Google Ads manda impressões, cliques e gasto todo dia.
--   3. campanha_agencia(slug, desde): o funil da cliente pra agência.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: QUEM PODE VER ===
alter table agenda_config add column if not exists agencia_ids uuid[] not null default '{}';

-- === BLOCO 2: ANÚNCIOS POR DIA (vem do script do Google Ads) ===
create table if not exists anuncios_dia (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  data       date not null,
  campanha   text not null,
  impressoes int not null default 0,
  cliques    int not null default 0,
  custo      numeric(12,2) not null default 0,
  conversoes numeric(10,2) not null default 0,
  atualizado timestamptz not null default now(),
  primary key (owner_id, data, campanha)
);
alter table anuncios_dia enable row level security;
drop policy if exists "dono le anuncios" on anuncios_dia;
create policy "dono le anuncios" on anuncios_dia for select to authenticated using (owner_id = auth.uid());

-- Chave do script (cada pessoa tem a sua; o app cria e mostra dentro do script)
create table if not exists agencia_chaves (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  chave    text not null unique check (char_length(chave) >= 32),
  criada   timestamptz not null default now()
);
alter table agencia_chaves enable row level security;
drop policy if exists "dono chave" on agencia_chaves;
create policy "dono chave" on agencia_chaves for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function anuncio_registrar(p_chave text, p_linhas jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_n int := 0; r jsonb;
begin
  select owner_id into v_owner from agencia_chaves where chave = p_chave;
  if v_owner is null then return json_build_object('ok', false, 'erro', 'chave'); end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 then
    return json_build_object('ok', false, 'erro', 'linhas');
  end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    insert into anuncios_dia (owner_id, data, campanha, impressoes, cliques, custo, conversoes, atualizado)
    values (v_owner, (r->>'d')::date, left(coalesce(r->>'c', '?'), 120),
            coalesce((r->>'i')::int, 0), coalesce((r->>'k')::int, 0),
            coalesce((r->>'g')::numeric, 0), coalesce((r->>'v')::numeric, 0), now())
    on conflict (owner_id, data, campanha) do update set
      impressoes = excluded.impressoes, cliques = excluded.cliques, custo = excluded.custo,
      conversoes = excluded.conversoes, atualizado = now();
    v_n := v_n + 1;
  end loop;
  return json_build_object('ok', true, 'linhas', v_n);
end;
$$;
grant execute on function anuncio_registrar(text, jsonb) to anon, authenticated;

-- === BLOCO 3: FUNIL DA CLIENTE PRA AGÊNCIA (só números) ===
create or replace function campanha_agencia(p_slug text, p_de date default null)
returns json
language plpgsql security definer set search_path = public stable
as $$
declare v_owner uuid; v_de date := coalesce(p_de, current_date - 90);
begin
  select user_id into v_owner from agenda_config where slug = p_slug and auth.uid() = any(agencia_ids);
  if v_owner is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true,
    'origens', coalesce((select json_agg(x) from (
      select lower(coalesce(nullif(f.respostas->'origem'->>'source', ''), 'direto')) as origem,
             count(*) as triagens,
             count(*) filter (where exists (select 1 from agendamentos a where a.owner_id = v_owner
               and right(regexp_replace(coalesce(a.cliente_contato, ''), '\D', '', 'g'), 8) = right(f.cliente_digitos, 8)
               and a.created_at >= f.created_at - interval '1 day')) as agendaram,
             count(*) filter (where exists (select 1 from agendamentos a where a.owner_id = v_owner
               and right(regexp_replace(coalesce(a.cliente_contato, ''), '\D', '', 'g'), 8) = right(f.cliente_digitos, 8)
               and a.status = 'finalizado' and a.data >= f.created_at::date)) as atendidas
      from fichas f
      where f.owner_id = v_owner and f.modelo = 'triagem' and f.created_at >= v_de
      group by 1) x), '[]'::json),
    'funil', coalesce((select json_agg(y order by y.ordem) from (
      select min(t.ordem) as ordem, t.passo, lower(coalesce(t.origem, 'direto')) as origem, count(distinct t.sessao) as pessoas
      from triagem_passos t
      where t.slug = p_slug and t.criado_em >= v_de
      group by t.passo, lower(coalesce(t.origem, 'direto'))) y), '[]'::json));
end;
$$;
grant execute on function campanha_agencia(text, date) to authenticated;
notify pgrst, 'reload schema';
