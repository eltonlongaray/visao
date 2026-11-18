-- ═══════════════════════════════════════════════════════════════
-- FICHA CERTA PRA CADA TRATAMENTO (18/11/2026)
-- Rodar no Supabase → SQL Editor (depois do sql/ficha.sql). Idempotente.
-- A profissional pode usar mais de um modelo de ficha (ex: Alê: estética pros
-- pacotes de corpo e massoterapia pra terapêutica). O modelo vai no convite
-- (link com código) ou no link geral (?m=estetica); sem isso, vale a profissão.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: ficha_info devolve o modelo do convite ===
create or replace function ficha_info(p_slug text, p_codigo text default null)
returns json
language plpgsql security definer stable set search_path = public
as $$
declare
  v_owner uuid; v_cfg jsonb; v_nome text; v_cli text; v_mod text;
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
    select f.cliente_nome, f.modelo into v_cli, v_mod from fichas f where f.codigo = p_codigo and f.owner_id = v_owner;
    if not found then raise exception 'Link de ficha inválido'; end if;
  end if;
  return json_build_object(
    'nome', v_nome,
    'profissao', v_cfg->>'profissao',
    'modelo', coalesce(v_mod, v_cfg->>'profissao'),
    'desligados', coalesce(v_cfg->'desligados', '[]'::jsonb),
    'extras', coalesce(v_cfg->'extras', '[]'::jsonb),
    'cliente_nome', v_cli
  );
end;
$$;
grant execute on function ficha_info(text, text) to anon, authenticated;

-- === BLOCO 2: ficha_enviar aceita o modelo (link geral ?m=…) ===
drop function if exists ficha_enviar(text, text, text, text, jsonb, jsonb);
create or replace function ficha_enviar(
  p_slug text, p_codigo text, p_nome text, p_contato text, p_respostas jsonb, p_mapa jsonb, p_modelo text default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid; v_cfg jsonb; v_id uuid; v_dig text; v_mod text;
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
  v_mod := case when p_modelo in ('massoterapia', 'estetica', 'pele') then p_modelo else v_cfg->>'profissao' end;

  if coalesce(p_codigo, '') <> '' then
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
    update fichas set rascunho = null, rascunho_em = null where codigo = p_codigo and owner_id = v_owner;
  else
    v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
    if length(trim(coalesce(p_nome, ''))) < 2 or length(v_dig) < 10 then
      raise exception 'Informe nome e WhatsApp';
    end if;
    insert into fichas (owner_id, codigo, modelo, cliente_nome, cliente_contato, cliente_digitos,
                        respostas, mapa, respondida_em, consentiu_em)
    values (v_owner, substr(md5(random()::text || clock_timestamp()::text), 1, 12), v_mod,
            left(trim(p_nome), 120), left(trim(p_contato), 40), v_dig, p_respostas, p_mapa, now(), now())
    returning id into v_id;
  end if;
  return json_build_object('ok', true, 'owner_id', v_owner);
end;
$$;
grant execute on function ficha_enviar(text, text, text, text, jsonb, jsonb, text) to anon, authenticated;
