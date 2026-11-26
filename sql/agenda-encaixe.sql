-- ═══════════════════════════════════════════════════════════════
-- AGENDA: HORÁRIO QUE SE AJUSTA + INTERVALO ENTRE ATENDIMENTOS (25/11/2026)
-- Rodar no Supabase → SQL Editor. Idempotente. (Substitui o agenda-sobreposicao.sql.)
-- • agenda_config.intervalo_min: folga entre um atendimento e outro (0/10/15/20)
-- • Encaixe: depois de um atendimento que termina fora da hora cheia, a agenda oferece
--   fim + intervalo (ex.: limpeza 13:30–14:45 + 15 min → 15:00). O servidor aceita.
-- • O último horário do dia pode ser empurrado até 30 min (Elton: 'pode ficar um pouquinho depois').
-- • Nada encavala (nem combo), contando o intervalo.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: COLUNA DO INTERVALO (Alê começa com 15 min) ===
alter table agenda_config add column if not exists intervalo_min int not null default 0;
update agenda_config set intervalo_min = 15 where slug = 'V83' and intervalo_min = 0;

-- === BLOCO 2: CRIAR AGENDAMENTO ===
create or replace function criar_agendamento(
  p_slug text, p_data date, p_hora text, p_nome text, p_contato text, p_servico_id text
) returns json
language plpgsql security definer
as $$
declare
  v_owner    uuid;
  v_disp     jsonb;
  v_semanas  jsonb;
  v_servicos jsonb;
  v_dur_pad  int;
  v_dow      text;
  v_wk       text;
  v_semana   jsonb;
  v_dia      jsonb;
  v_serv     jsonb;
  v_dur      int;
  v_int      int;
  v_min      text;
  v_max      text;
begin
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'Informe seu nome';
  end if;
  if p_data < current_date then
    raise exception 'Essa data já passou';
  end if;

  select user_id, disponibilidade, coalesce(semanas, '{}'::jsonb),
         coalesce(servicos, '[]'::jsonb), coalesce(duracao_min, 60), coalesce(intervalo_min, 0)
    into v_owner, v_disp, v_semanas, v_servicos, v_dur_pad, v_int
  from agenda_config where slug = p_slug and ativo = true;
  if v_owner is null then
    raise exception 'Agenda indisponível';
  end if;

  -- Serviço escolhido (opcional): pega nome/preço/duração/horário próprio da lista de serviços.
  if p_servico_id is not null and length(trim(p_servico_id)) > 0 then
    select s into v_serv
    from jsonb_array_elements(v_servicos) s
    where s->>'id' = p_servico_id
    limit 1;
  end if;

  v_dow := extract(dow from p_data)::int::text;                      -- 0=domingo .. 6=sábado
  v_wk  := to_char(date_trunc('week', p_data)::date, 'YYYY-MM-DD');  -- segunda-feira da semana
  v_semana := v_semanas -> v_wk;
  if v_semana is not null then
    v_dia := v_semana -> v_dow;   -- semana com exceção (mesmo vazia = fechada)
  else
    v_dia := v_disp -> v_dow;     -- padrão
  end if;

  if v_serv is not null and jsonb_typeof(v_serv -> 'horarios') = 'object' then
    -- semana de exceção com o dia fechado continua fechada
    if v_semana is not null and (v_dia is null or jsonb_typeof(v_dia) <> 'array' or jsonb_array_length(v_dia) = 0) then
      raise exception 'Esse dia não está disponível';
    end if;
    v_dia := v_serv -> 'horarios' -> v_dow;
  end if;

  if v_dia is null or jsonb_typeof(v_dia) <> 'array' then
    raise exception 'Esse dia não está disponível';
  end if;
  -- (25/11) horário da lista OU encaixe depois de um atendimento: qualquer hora de 5 em 5 min
  -- entre o primeiro e o último horário do dia (a página só oferece o encaixe certo; a
  -- sobreposição é barrada logo abaixo).
  if not (v_dia ? p_hora) then
    select min(x), max(x) into v_min, v_max from jsonb_array_elements_text(v_dia) x;
    if p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' or v_min is null
       or p_hora::time < v_min::time or p_hora::time > (v_max::time + interval '30 minutes')   -- último pode empurrar até 30 min
       or (extract(minute from p_hora::time)::int % 5) <> 0 then
      raise exception 'Esse horário não está disponível';
    end if;
  end if;

  v_dur := coalesce(nullif(v_serv->>'duracaoMin', '')::int, v_dur_pad);

  -- (25/11) não deixa um atendimento ENCAVALAR em outro (antes só barrava o mesmo horário de início).
  -- Ex.: limpeza 13:30 de 75 min (até 14:45) x Deusa Grega às 14:30 no mesmo dia → bloqueia.
  if exists (
    select 1 from agendamentos a
    where a.owner_id = v_owner and a.data = p_data and coalesce(a.status, 'confirmado') = 'confirmado'
      and p_hora::time < (a.hora::time + make_interval(mins => coalesce(a.duracao_min, v_dur_pad) + v_int))
      and a.hora::time < (p_hora::time + make_interval(mins => v_dur + v_int))
  ) then
    raise exception 'Esse horário já foi reservado. Escolha outro.';
  end if;

  insert into agendamentos (owner_id, data, hora, cliente_nome, cliente_contato, servico, preco, duracao_min)
  values (
    v_owner, p_data, p_hora, trim(p_nome), nullif(trim(p_contato), ''),
    v_serv->>'nome',
    nullif(v_serv->>'preco', '')::numeric,
    v_dur
  );

  -- devolve o dono pra página pública avisar ele por push (novo agendamento)
  return json_build_object('ok', true, 'owner_id', v_owner);
exception
  when unique_violation then
    raise exception 'Esse horário já foi reservado. Escolha outro.';
end;
$$;
grant execute on function criar_agendamento(text, date, text, text, text, text) to anon, authenticated;

-- === BLOCO 3: COMBO (2+ serviços) também não encavala, com a duração SOMADA ===
create or replace function criar_agendamento_combo(
  p_slug text, p_data date, p_hora text, p_nome text, p_contato text, p_servico_ids text[]
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_res json; v_owner uuid; v_servicos jsonb; v_dur_pad int; v_int int;
  v_nomes text; v_preco numeric; v_dur int; v_qtd int;
begin
  if p_servico_ids is null or array_length(p_servico_ids, 1) is null then
    raise exception 'Escolha um serviço';
  end if;
  if array_length(p_servico_ids, 1) > 6 then raise exception 'Serviços demais'; end if;

  v_res := criar_agendamento(p_slug, p_data, p_hora, p_nome, p_contato, p_servico_ids[1]);
  if array_length(p_servico_ids, 1) = 1 then return v_res; end if;

  select user_id, coalesce(servicos, '[]'::jsonb), coalesce(duracao_min, 60), coalesce(intervalo_min, 0)
    into v_owner, v_servicos, v_dur_pad, v_int
  from agenda_config where slug = p_slug;

  select string_agg(s->>'nome', ' + ' order by array_position(p_servico_ids, s->>'id')),
         sum(nullif(s->>'preco', '')::numeric),
         sum(coalesce(nullif(s->>'duracaoMin', '')::int, v_dur_pad)),
         count(*)
    into v_nomes, v_preco, v_dur, v_qtd
  from jsonb_array_elements(v_servicos) s
  where s->>'id' = any(p_servico_ids);

  if v_qtd > 1 then
    -- com a soma, ainda cabe? (desfaz tudo se encavalar em outro atendimento)
    if exists (
      select 1 from agendamentos a
      where a.owner_id = v_owner and a.data = p_data and a.hora <> p_hora and coalesce(a.status, 'confirmado') = 'confirmado'
        and p_hora::time < (a.hora::time + make_interval(mins => coalesce(a.duracao_min, v_dur_pad) + v_int))
        and a.hora::time < (p_hora::time + make_interval(mins => v_dur + v_int))
    ) then
      raise exception 'Esse horário já foi reservado. Escolha outro.';
    end if;
    update agendamentos set servico = v_nomes, preco = v_preco, duracao_min = v_dur
    where owner_id = v_owner and data = p_data and hora = p_hora and status = 'confirmado';
  end if;
  return v_res;
end;
$$;
grant execute on function criar_agendamento_combo(text, date, text, text, text, text[]) to anon, authenticated;
