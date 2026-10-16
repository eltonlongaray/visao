-- ═══════════════════════════════════════════════════════════════
-- FICHA × AGENDA — depois de agendar pelo link, oferecer a ficha a quem ainda não tem
-- Rodar no Supabase → SQL Editor (depois do sql/ficha.sql). Idempotente.
-- Só devolve sim/não (ficha ligada? esse WhatsApp já respondeu?), nada das respostas.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: FUNÇÃO — status da ficha pra um WhatsApp ===
create or replace function ficha_status_publico(p_slug text, p_contato text)
returns json
language plpgsql security definer stable set search_path = public
as $$
declare
  v_owner uuid; v_cfg jsonb; v_dig text; v_tem boolean := false;
begin
  select user_id, coalesce(ficha_cfg, '{}'::jsonb) into v_owner, v_cfg
  from agenda_config where slug = p_slug;
  if v_owner is null or coalesce(v_cfg->>'profissao', '') = '' then
    return json_build_object('ativa', false, 'tem', false);
  end if;
  -- normaliza: tira o 55 e compara DDD + 8 últimos dígitos (ignora o 9º dígito)
  v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  if length(v_dig) in (12, 13) and left(v_dig, 2) = '55' then v_dig := substr(v_dig, 3); end if;
  if length(v_dig) >= 10 then
    select exists (
      select 1 from fichas f
      where f.owner_id = v_owner and f.respondida_em is not null
        and length(f.cliente_digitos) >= 10
        and left(case when length(f.cliente_digitos) in (12, 13) and left(f.cliente_digitos, 2) = '55'
                      then substr(f.cliente_digitos, 3) else f.cliente_digitos end, 2) = left(v_dig, 2)
        and right(f.cliente_digitos, 8) = right(v_dig, 8)
    ) into v_tem;
  end if;
  return json_build_object('ativa', true, 'tem', v_tem);
end;
$$;
grant execute on function ficha_status_publico(text, text) to anon, authenticated;
