-- ═══════════════════════════════════════════════════════════════
-- CUPONS v2 (18/11/2026): LIMITE DE SESSÕES + RENOVAR + CUPOM DA CLIENTE
-- Rodar no Supabase → SQL Editor (depois do sql/cupons.sql). Idempotente.
--   • limite: quantas sessões o código vale no ciclo (padrão 5)
--   • ciclo_inicio: "renovar" começa um ciclo novo com o MESMO código
--     (usos = agendamentos com o cupom, não cancelados, desde o ciclo_inicio;
--      cancelou → a sessão volta pro saldo)
--   • cliente_digitos: cupom gerado PRA UMA cliente (só vale com o WhatsApp dela)
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: COLUNAS NOVAS ===
alter table cupons add column if not exists limite int not null default 5 check (limite between 1 and 999);
alter table cupons add column if not exists ciclo_inicio timestamptz not null default now();
alter table cupons add column if not exists cliente_nome text;
alter table cupons add column if not exists cliente_digitos text;

-- === BLOCO 2: QUANTAS SESSÕES JÁ USOU NESTE CICLO ===
create or replace function _cupom_usos(p_owner uuid, p_codigo text, p_desde timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from agendamentos
   where owner_id = p_owner and upper(cupom) = upper(p_codigo)
     and coalesce(status, '') <> 'cancelado' and created_at >= p_desde;
$$;
revoke all on function _cupom_usos(uuid, text, timestamptz) from public, anon, authenticated;

-- === BLOCO 3: CONFERIR (página pública) — devolve o saldo; NUNCA a descrição ===
drop function if exists validar_cupom(text, text);
create or replace function validar_cupom(p_slug text, p_cupom text, p_contato text default null)
returns json language plpgsql security definer stable set search_path = public as $$
declare v_owner uuid; c record; v_usos int; v_dig text;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null or coalesce(trim(p_cupom), '') = '' then return json_build_object('ok', false); end if;
  select codigo, desconto, limite, ciclo_inicio, cliente_digitos into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(p_cupom)) limit 1;
  if not found then return json_build_object('ok', false); end if;
  if coalesce(c.cliente_digitos, '') <> '' then
    v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
    if length(v_dig) < 10 or right(v_dig, 8) <> right(c.cliente_digitos, 8) then
      return json_build_object('ok', false, 'motivo', 'outra_pessoa');
    end if;
  end if;
  v_usos := _cupom_usos(v_owner, c.codigo, c.ciclo_inicio);
  if v_usos >= c.limite then
    return json_build_object('ok', false, 'motivo', 'esgotado', 'limite', c.limite);
  end if;
  return json_build_object('ok', true, 'codigo', c.codigo, 'desconto', c.desconto,
    'limite', c.limite, 'usados', v_usos, 'restantes', c.limite - v_usos);
end; $$;
grant execute on function validar_cupom(text, text, text) to anon, authenticated;

-- === BLOCO 4: APLICAR NO AGENDAMENTO RECÉM-CRIADO (respeita saldo e dona do cupom) ===
create or replace function aplicar_cupom(p_slug text, p_data date, p_hora text, p_contato text, p_cupom text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; c record; v_dig text; v_n int; v_usos int;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null then return json_build_object('ok', false); end if;
  select codigo, desconto, limite, ciclo_inicio, cliente_digitos into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(coalesce(p_cupom, ''))) limit 1
   for update;
  if not found then return json_build_object('ok', false); end if;
  v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  if length(v_dig) < 10 then return json_build_object('ok', false); end if;
  if coalesce(c.cliente_digitos, '') <> '' and right(v_dig, 8) <> right(c.cliente_digitos, 8) then
    return json_build_object('ok', false, 'motivo', 'outra_pessoa');
  end if;
  v_usos := _cupom_usos(v_owner, c.codigo, c.ciclo_inicio);
  if v_usos >= c.limite then return json_build_object('ok', false, 'motivo', 'esgotado'); end if;
  update agendamentos set cupom = c.codigo, cupom_desconto = c.desconto
   where id = (select id from agendamentos
                where owner_id = v_owner and data = p_data and hora = p_hora and cupom is null
                  and created_at > now() - interval '15 minutes'
                  and right(regexp_replace(coalesce(cliente_contato, ''), '\D', '', 'g'), 8) = right(v_dig, 8)
                order by created_at desc limit 1);
  get diagnostics v_n = row_count;
  return json_build_object('ok', v_n > 0, 'codigo', c.codigo, 'desconto', c.desconto,
    'limite', c.limite, 'restantes', c.limite - v_usos - v_n);
end; $$;
grant execute on function aplicar_cupom(text, date, text, text, text) to anon, authenticated;
