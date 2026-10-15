-- ═══════════════════════════════════════════════════════════════
-- FICHA DE ATENDIMENTO (Responde.ai) — ficha do cliente por profissão
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez (idempotente).
-- Modelo fixo por profissão (1º: massoterapia). Fica dentro de cada cliente
-- da Agenda Online. Dado de saúde: anon NUNCA lê a tabela, só envia via RPC.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELA + CONFIG ===
create table if not exists fichas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  codigo text unique not null,           -- link único do cliente: /ficha/<slug>/<codigo>
  modelo text not null default 'massoterapia',
  cliente_nome text,
  cliente_contato text,                  -- WhatsApp como foi digitado
  cliente_digitos text,                  -- só números (liga a ficha ao cliente da Agenda)
  respostas jsonb,
  mapa jsonb,                            -- { "lombar_d": { "dor": 3, "inchaco": 0, "quando": [...] } }
  consentiu_em timestamptz,
  respondida_em timestamptz,
  created_at timestamptz default now()
);
create index if not exists fichas_owner_idx on fichas (owner_id);

-- profissão + tipos de massagem desligados/acrescentados + nome de exibição
alter table agenda_config add column if not exists ficha_cfg jsonb default '{}'::jsonb;

-- === BLOCO 2: PERMISSÕES + RLS (só a dona lê/mexe nas fichas dela) ===
grant select, insert, update, delete on fichas to authenticated;
alter table fichas enable row level security;
drop policy if exists fichas_owner on fichas;
create policy fichas_owner on fichas
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 3: FUNÇÃO — o que a página pública precisa (sem expor respostas) ===
create or replace function ficha_info(p_slug text, p_codigo text default null)
returns json
language plpgsql security definer stable set search_path = public
as $$
declare
  v_owner uuid; v_cfg jsonb; v_nome text; v_cli text;
begin
  select c.user_id, coalesce(c.ficha_cfg, '{}'::jsonb) into v_owner, v_cfg
  from agenda_config c where c.slug = p_slug;
  if v_owner is null or coalesce(v_cfg->>'profissao', '') = '' then
    raise exception 'Ficha indisponível';
  end if;
  select coalesce(nullif(trim(v_cfg->>'nome'), ''), nullif(trim(p.full_name), ''), nullif(trim(p.preferred_name), ''))
    into v_nome from profiles p where p.user_id = v_owner;
  v_nome := coalesce(v_nome, nullif(trim(v_cfg->>'nome'), ''), 'sua profissional');
  if coalesce(p_codigo, '') <> '' then
    select f.cliente_nome into v_cli from fichas f where f.codigo = p_codigo and f.owner_id = v_owner;
    if not found then raise exception 'Link de ficha inválido'; end if;
  end if;
  return json_build_object(
    'nome', v_nome,
    'profissao', v_cfg->>'profissao',
    'desligados', coalesce(v_cfg->'desligados', '[]'::jsonb),
    'extras', coalesce(v_cfg->'extras', '[]'::jsonb),
    'cliente_nome', v_cli
  );
end;
$$;
grant execute on function ficha_info(text, text) to anon, authenticated;

-- === BLOCO 4: FUNÇÃO — cliente envia a ficha ===
-- Com código: 1ª vez preenche a ficha daquele cliente; depois cria registro novo (histórico). Sem código (link geral):
-- cria uma ficha nova com nome + WhatsApp (o app liga ao cliente pelo número).
create or replace function ficha_enviar(
  p_slug text, p_codigo text, p_nome text, p_contato text, p_respostas jsonb, p_mapa jsonb
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid; v_cfg jsonb; v_id uuid; v_dig text;
begin
  select user_id, coalesce(ficha_cfg, '{}'::jsonb) into v_owner, v_cfg
  from agenda_config where slug = p_slug;
  if v_owner is null or coalesce(v_cfg->>'profissao', '') = '' then
    raise exception 'Ficha indisponível';
  end if;
  if octet_length(coalesce(p_respostas, '{}'::jsonb)::text) > 30000
     or octet_length(coalesce(p_mapa, '{}'::jsonb)::text) > 30000 then
    raise exception 'Ficha grande demais';
  end if;

  if coalesce(p_codigo, '') <> '' then
    -- 1ª resposta preenche o convite; as próximas viram um REGISTRO NOVO (histórico
    -- por fase: nunca sobrescreve o que o cliente respondeu antes).
    update fichas set respostas = p_respostas, mapa = p_mapa, respondida_em = now(), consentiu_em = now()
    where codigo = p_codigo and owner_id = v_owner and respondida_em is null
    returning id into v_id;
    if v_id is null then
      insert into fichas (owner_id, codigo, modelo, cliente_nome, cliente_contato, cliente_digitos,
                          respostas, mapa, respondida_em, consentiu_em)
      select owner_id, substr(md5(random()::text || clock_timestamp()::text), 1, 12), modelo,
             cliente_nome, cliente_contato, cliente_digitos, p_respostas, p_mapa, now(), now()
      from fichas where codigo = p_codigo and owner_id = v_owner
      returning id into v_id;
    end if;
    if v_id is null then raise exception 'Link de ficha inválido'; end if;
  else
    v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
    if length(trim(coalesce(p_nome, ''))) < 2 or length(v_dig) < 10 then
      raise exception 'Informe nome e WhatsApp';
    end if;
    insert into fichas (owner_id, codigo, modelo, cliente_nome, cliente_contato, cliente_digitos,
                        respostas, mapa, respondida_em, consentiu_em)
    values (v_owner, substr(md5(random()::text || clock_timestamp()::text), 1, 12), v_cfg->>'profissao',
            left(trim(p_nome), 120), left(trim(p_contato), 40), v_dig, p_respostas, p_mapa, now(), now())
    returning id into v_id;
  end if;
  return json_build_object('ok', true, 'owner_id', v_owner);
end;
$$;
grant execute on function ficha_enviar(text, text, text, text, jsonb, jsonb) to anon, authenticated;
