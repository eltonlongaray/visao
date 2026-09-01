-- ═══════════════════════════════════════════════════════════════
-- AGENDA ONLINE — disponibilidade por SEMANA (exceções)
-- Rode isto UMA VEZ no Supabase (SQL Editor).
--   - Adiciona a coluna `semanas` (exceções de disponibilidade por semana).
--   - Atualiza `criar_agendamento` pra validar contra a exceção da semana
--     quando existir, senão contra o padrão (`disponibilidade`).
-- É aditivo: não apaga nada. O padrão continua se repetindo pra frente.
-- ═══════════════════════════════════════════════════════════════

-- 1) Coluna de exceções por semana.
--    Formato: { "<segunda-feira YYYY-MM-DD>": { "0".."6": ["HH:MM", ...] } }
--    Semana presente aqui SUBSTITUI o padrão naquela semana (mesmo vazia = fechada).
alter table agenda_config
  add column if not exists semanas jsonb not null default '{}'::jsonb;

-- 2) criar_agendamento passa a considerar a exceção da semana.
drop function if exists criar_agendamento(text, date, text, text, text);
drop function if exists criar_agendamento(text, date, text, text, text, text);
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

  v_dow := extract(dow from p_data)::int::text;                      -- 0=domingo .. 6=sábado
  v_wk  := to_char(date_trunc('week', p_data)::date, 'YYYY-MM-DD');  -- segunda-feira da semana
  v_semana := v_semanas -> v_wk;
  if v_semana is not null then
    v_dia := v_semana -> v_dow;   -- semana com exceção (mesmo vazia = fechada)
  else
    v_dia := v_disp -> v_dow;     -- padrão
  end if;
  if v_dia is null or jsonb_typeof(v_dia) <> 'array' then
    raise exception 'Esse dia não está disponível';
  end if;
  if not (v_dia ? p_hora) then
    raise exception 'Esse horário não está disponível';
  end if;

  -- Serviço escolhido (opcional): pega nome/preço/duração da lista de serviços.
  if p_servico_id is not null and length(trim(p_servico_id)) > 0 then
    select s into v_serv
    from jsonb_array_elements(v_servicos) s
    where s->>'id' = p_servico_id
    limit 1;
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
