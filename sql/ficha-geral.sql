-- ═══════════════════════════════════════════════════════════════
-- FICHA ÚNICA POR QUEIXA (20/11/2026)
-- Rodar no Supabase → SQL Editor. Idempotente.
-- O link geral da ficha passa a gravar o modelo 'geral' (ficha única: dados
-- básicos + blocos por queixa). Sem isso, a ficha única cairia como 'estetica'.
-- Única mudança em relação ao sql/ficha-modelos.sql: 'geral' na lista aceita.
-- ═══════════════════════════════════════════════════════════════

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
  v_mod := case when p_modelo in ('massoterapia', 'estetica', 'pele', 'geral') then p_modelo else v_cfg->>'profissao' end;

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
