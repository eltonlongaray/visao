-- ═══════════════════════════════════════════════════════════════
-- AGENDA ONLINE — Fase 0 (modelo de dados)
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez (idempotente).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELAS ===
create table if not exists agenda_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text unique not null,
  titulo text default 'Agende comigo',
  duracao_min int default 60,
  disponibilidade jsonb default '{}',   -- { "1": ["09:00","10:15","11:30"], ... } lista de horários por dia (0=domingo)
  ativo boolean default false,
  updated_at timestamptz default now()
);

create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  hora text not null,
  cliente_nome text not null,
  cliente_contato text,
  status text default 'confirmado',
  created_at timestamptz default now(),
  unique (owner_id, data, hora)         -- trava anti dois no mesmo horário
);

-- === BLOCO 2: PERMISSÕES DE TABELA ===
grant select, insert, update, delete on agenda_config to authenticated;
grant select on agenda_config to anon;                -- público lê a agenda pelo slug
grant select, insert, update, delete on agendamentos to authenticated;
-- anon NÃO acessa a tabela agendamentos direto (privacidade); só via as funções abaixo.

-- === BLOCO 3: RLS (cada um só mexe no que é seu) ===
alter table agenda_config enable row level security;
alter table agendamentos enable row level security;

drop policy if exists agenda_config_owner on agenda_config;
create policy agenda_config_owner on agenda_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists agenda_config_public_read on agenda_config;
create policy agenda_config_public_read on agenda_config
  for select using (ativo = true);

drop policy if exists agendamentos_owner on agendamentos;
create policy agendamentos_owner on agendamentos
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 4: FUNÇÃO — horários já ocupados (sem expor nome/contato) ===
create or replace function slots_ocupados(p_slug text, p_from date, p_to date)
returns table (data date, hora text)
language sql security definer stable
as $$
  select a.data, a.hora
  from agendamentos a
  join agenda_config c on c.user_id = a.owner_id
  where c.slug = p_slug and a.status = 'confirmado'
    and a.data >= p_from and a.data <= p_to;
$$;
grant execute on function slots_ocupados(text, date, date) to anon, authenticated;

-- === BLOCO 5: FUNÇÃO — criar agendamento (valida disponibilidade + trava) ===
create or replace function criar_agendamento(
  p_slug text, p_data date, p_hora text, p_nome text, p_contato text
) returns json
language plpgsql security definer
as $$
declare
  v_owner uuid;
  v_disp jsonb;
  v_dia jsonb;
  v_dow text;
begin
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'Informe seu nome';
  end if;
  if p_data < current_date then
    raise exception 'Essa data já passou';
  end if;

  select user_id, disponibilidade into v_owner, v_disp
  from agenda_config where slug = p_slug and ativo = true;
  if v_owner is null then
    raise exception 'Agenda indisponível';
  end if;

  v_dow := extract(dow from p_data)::int::text;   -- 0=domingo .. 6=sábado
  v_dia := v_disp -> v_dow;                        -- lista de horários daquele dia
  if v_dia is null or jsonb_typeof(v_dia) <> 'array' then
    raise exception 'Esse dia não está disponível';
  end if;
  if not (v_dia ? p_hora) then                     -- o horário precisa estar na lista do dia
    raise exception 'Esse horário não está disponível';
  end if;

  insert into agendamentos (owner_id, data, hora, cliente_nome, cliente_contato)
  values (v_owner, p_data, p_hora, trim(p_nome), nullif(trim(p_contato), ''));

  return json_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'Esse horário já foi reservado. Escolha outro.';
end;
$$;
grant execute on function criar_agendamento(text, date, text, text, text) to anon, authenticated;
