-- ═══════════════════════════════════════════════════════════════
-- CARTÃO PRESENTE (18/11/2026) — mora na mesma tabela dos cupons
-- Rodar no Supabase → SQL Editor (depois do sql/cupons-limite.sql). Idempotente.
-- tipo 'presente': 1 sessão de um serviço, sem custo, com validade; quem dá e
-- quem recebe ficam só com a profissional (a página pública recebe só o serviço).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: COLUNAS NOVAS ===
alter table cupons add column if not exists tipo text not null default 'cupom';   -- cupom | presente
alter table cupons add column if not exists servico_nome text;                    -- presente: qual serviço
alter table cupons add column if not exists validade date;                        -- depois disso não vale
alter table cupons add column if not exists de_nome text;                         -- quem deu (só a dona vê)

-- === BLOCO 2: CONFERIR (página pública) — agora com validade e serviço do presente ===
create or replace function validar_cupom(p_slug text, p_cupom text, p_contato text default null)
returns json language plpgsql security definer stable set search_path = public as $$
declare v_owner uuid; c record; v_usos int; v_dig text;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null or coalesce(trim(p_cupom), '') = '' then return json_build_object('ok', false); end if;
  select codigo, desconto, limite, ciclo_inicio, cliente_digitos, tipo, servico_nome, validade into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(p_cupom)) limit 1;
  if not found then return json_build_object('ok', false); end if;
  if c.validade is not null and c.validade < current_date then
    return json_build_object('ok', false, 'motivo', 'vencido');
  end if;
  if coalesce(c.cliente_digitos, '') <> '' then
    v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
    if length(v_dig) < 10 or right(v_dig, 8) <> right(c.cliente_digitos, 8) then
      return json_build_object('ok', false, 'motivo', 'outra_pessoa');
    end if;
  end if;
  v_usos := _cupom_usos(v_owner, c.codigo, c.ciclo_inicio);
  if v_usos >= c.limite then
    return json_build_object('ok', false, 'motivo', case when c.tipo = 'presente' then 'usado' else 'esgotado' end, 'limite', c.limite);
  end if;
  return json_build_object('ok', true, 'codigo', c.codigo, 'desconto', c.desconto, 'tipo', c.tipo,
    'servico', c.servico_nome, 'validade', c.validade,
    'limite', c.limite, 'usados', v_usos, 'restantes', c.limite - v_usos);
end; $$;
grant execute on function validar_cupom(text, text, text) to anon, authenticated;

-- === BLOCO 3: APLICAR — recusa presente vencido ===
create or replace function aplicar_cupom(p_slug text, p_data date, p_hora text, p_contato text, p_cupom text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; c record; v_dig text; v_n int; v_usos int;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null then return json_build_object('ok', false); end if;
  select codigo, desconto, limite, ciclo_inicio, cliente_digitos, validade into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(coalesce(p_cupom, ''))) limit 1
   for update;
  if not found then return json_build_object('ok', false); end if;
  if c.validade is not null and c.validade < current_date then return json_build_object('ok', false, 'motivo', 'vencido'); end if;
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
