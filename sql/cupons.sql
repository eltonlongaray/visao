-- ═══════════════════════════════════════════════════════════════
-- CUPONS DE PARCERIA NA AGENDA ONLINE (18/11/2026)
-- Rodar no Supabase → SQL Editor. Idempotente.
-- A profissional cria cupons (ex: MODELO = 100% cortesia). Quem agenda pelo
-- link digita o cupom; ele fica gravado no agendamento e, ao finalizar o
-- atendimento, o pagamento já vem como cortesia (ou com o desconto).
-- NÃO muda as funções de agendar: o cupom é aplicado logo depois, à parte.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELA DE CUPONS (privada, só a dona) ===
create table if not exists cupons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  codigo text not null,
  descricao text,
  desconto int not null default 100 check (desconto between 1 and 100),   -- % (100 = não cobra)
  ativo boolean not null default true,
  created_at timestamptz default now()
);
create unique index if not exists cupons_owner_codigo on cupons (owner_id, upper(codigo));
grant select, insert, update, delete on cupons to authenticated;
alter table cupons enable row level security;
drop policy if exists cupons_owner on cupons;
create policy cupons_owner on cupons for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 2: CUPOM NO AGENDAMENTO ===
alter table agendamentos add column if not exists cupom text;
alter table agendamentos add column if not exists cupom_desconto int;

-- === BLOCO 3: CONFERIR O CUPOM (página pública, antes de confirmar) ===
create or replace function validar_cupom(p_slug text, p_cupom text)
returns json language plpgsql security definer stable set search_path = public as $$
declare v_owner uuid; c record;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null or coalesce(trim(p_cupom), '') = '' then return json_build_object('ok', false); end if;
  select codigo, desconto into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(p_cupom)) limit 1;
  if not found then return json_build_object('ok', false); end if;
  -- a descrição é anotação interna da profissional (pode ter nome de cliente): NUNCA volta pro público
  return json_build_object('ok', true, 'codigo', c.codigo, 'desconto', c.desconto);
end; $$;
grant execute on function validar_cupom(text, text) to anon, authenticated;

-- === BLOCO 4: APLICAR NO AGENDAMENTO RECÉM-CRIADO ===
-- Acha o agendamento pelo dia + hora + WhatsApp (DDD + 8 finais), criado nos últimos 15 min e ainda sem cupom.
create or replace function aplicar_cupom(p_slug text, p_data date, p_hora text, p_contato text, p_cupom text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; c record; v_dig text; v_n int;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null then return json_build_object('ok', false); end if;
  select codigo, desconto into c from cupons
   where owner_id = v_owner and ativo and upper(codigo) = upper(trim(coalesce(p_cupom, ''))) limit 1;
  if not found then return json_build_object('ok', false); end if;
  v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  if length(v_dig) < 10 then return json_build_object('ok', false); end if;
  update agendamentos set cupom = c.codigo, cupom_desconto = c.desconto
   where owner_id = v_owner and data = p_data and hora = p_hora and cupom is null
     and created_at > now() - interval '15 minutes'
     and right(regexp_replace(coalesce(cliente_contato, ''), '\D', '', 'g'), 8) = right(v_dig, 8);
  get diagnostics v_n = row_count;
  return json_build_object('ok', v_n > 0, 'codigo', c.codigo, 'desconto', c.desconto);
end; $$;
grant execute on function aplicar_cupom(text, date, text, text, text) to anon, authenticated;
