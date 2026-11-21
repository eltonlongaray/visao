-- ═══════════════════════════════════════════════════════════════
-- AGENDA ONLINE — HORÁRIO PRÓPRIO POR SERVIÇO (21/11/2026)
-- Rode isto UMA VEZ no Supabase do Falcon (SQL Editor).
--   1) `criar_agendamento` passa a aceitar serviço com horário próprio:
--      servico.horarios = { "0".."6": ["HH:MM", ...] } (0 = domingo, 6 = sábado).
--      Se o serviço escolhido tem `horarios`, o dia/hora é validado contra ELE
--      (pode abrir sábado mesmo com a agenda fechada no sábado); semana de exceção
--      com o dia fechado continua fechada. Sem `horarios`, nada muda.
--   2) Cria a "Sessão Black Friday" (90 min, R$ 197) na agenda da Larissa (Y35):
--      seg a sex a partir das 17h e sábado o dia todo (a obra faz barulho de dia).
--      Em 01/12 a Larissa troca o preço pra R$ 247 no app (Agenda → Serviços).
-- É aditivo e pode rodar de novo sem duplicar o serviço.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: VALIDAÇÃO DO AGENDAMENTO COM HORÁRIO DO SERVIÇO ===
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

-- === BLOCO 2: SESSÃO BLACK FRIDAY NA AGENDA DA LARISSA (Y35) ===
-- Horários (confirmar com a Larissa): seg–sex 17:00 e 18:30; sábado 09:00, 10:30, 13:00, 14:30 e 16:00.
update agenda_config
set servicos = coalesce(servicos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
  'id', 'sblack90',
  'nome', 'Sessão Black Friday',
  'duracaoMin', 90,
  'preco', 197,
  'horarios', jsonb_build_object(
    '1', jsonb_build_array('17:00', '18:30'),
    '2', jsonb_build_array('17:00', '18:30'),
    '3', jsonb_build_array('17:00', '18:30'),
    '4', jsonb_build_array('17:00', '18:30'),
    '5', jsonb_build_array('17:00', '18:30'),
    '6', jsonb_build_array('09:00', '10:30', '13:00', '14:30', '16:00')
  )
))
where slug = 'Y35'
  and not exists (select 1 from jsonb_array_elements(coalesce(servicos, '[]'::jsonb)) s where s->>'id' = 'sblack90');

-- Conferência: deve aparecer a "Sessão Black Friday" com os horários
select s->>'nome' as servico, s->>'duracaoMin' as min, s->>'preco' as preco, s->'horarios' as horarios
from agenda_config, jsonb_array_elements(servicos) s
where slug = 'Y35';
