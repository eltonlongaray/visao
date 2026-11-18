-- ═══════════════════════════════════════════════════════════════
-- CORREÇÃO (18/11/2026): validar_cupom NÃO devolve mais a descrição do cupom
-- (anotação interna da profissional, pode ter nome de cliente).
-- Rodar no Supabase → SQL Editor. Idempotente.
-- ═══════════════════════════════════════════════════════════════
create or replace function validar_cupom(p_slug text, p_cupom text)
returns json language plpgsql security definer stable set search_path = public as $$
declare v_owner uuid; c record;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null or coalesce(trim(p_cupom), '') = '' then return json_build_object('ok', false); end if;
  select codigo, desconto into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(p_cupom)) limit 1;
  if not found then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'codigo', c.codigo, 'desconto', c.desconto);
end; $$;
grant execute on function validar_cupom(text, text) to anon, authenticated;
