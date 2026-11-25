-- ═══════════════════════════════════════════════════════════════
-- AGENDA: BLOQUEAR HORÁRIO QUE SE SOBREPÕE A OUTRO (25/11/2026)
-- Rodar no Supabase → SQL Editor. Idempotente.
-- Caso: limpeza de pele 13:30 (75 min, até 14:45) foi aceita com a Larissa às 14:30.
-- O criar_agendamento só barrava o MESMO horário de início. Agora barra qualquer
-- sobreposição, usando a duração real de cada atendimento.
-- Única mudança em relação ao sql/agenda-horario-servico.sql: o bloco "não encavalar".
-- ═══════════════════════════════════════════════════════════════

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
begin
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'Informe seu nome';
  end if;
  if p_data < current_date then
    raise exception 'Essa data já passou';
  end if;

  select user_id, disponibilidade, coalesce(semanas, '{}'::jsonb),
         coalesce(servicos, '[]'::jsonb), coalesce(duracao_min, 60)
    into v_owner, v_disp, v_semanas, v_servicos, v_dur_pad
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
  if not (v_dia ? p_hora) then
    raise exception 'Esse horário não está disponível';
  end if;

  v_dur := coalesce(nullif(v_serv->>'duracaoMin', '')::int, v_dur_pad);

  -- (25/11) não deixa um atendimento ENCAVALAR em outro (antes só barrava o mesmo horário de início).
  -- Ex.: limpeza 13:30 de 75 min (até 14:45) x Deusa Grega às 14:30 no mesmo dia → bloqueia.
  if exists (
    select 1 from agendamentos a
    where a.owner_id = v_owner and a.data = p_data and coalesce(a.status, 'confirmado') = 'confirmado'
      and p_hora::time < (a.hora::time + make_interval(mins => coalesce(a.duracao_min, v_dur_pad)))
      and a.hora::time < (p_hora::time + make_interval(mins => v_dur))
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
