-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — CORRIDA POR SEMANA (desafio de exercício)
--
--   • desafios.corridas_semana: quantas corridas por semana (seg a dom) o
--     desafio de exercício pede, quando a Corrida está na lista.
--   • No dia em que a pessoa corre, a corrida fecha o dia sozinha: conta
--     como o máximo do dia, fica fora do limite e do "não repetir o de
--     ontem", e depois dela os outros exercícios do dia não entram mais.
--   • De quebra: prova antes da data de início do desafio não entra.
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-provas.sql.
-- ═══════════════════════════════════════════════════════════════

alter table public.desafios add column if not exists corridas_semana int;
alter table public.desafios drop constraint if exists desafios_corridas_semana_ok;
alter table public.desafios add constraint desafios_corridas_semana_ok
  check (corridas_semana is null or corridas_semana between 1 and 7);

create or replace function public.desafio_checkin_regras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.desafios;
  n int;
begin
  select * into d from public.desafios where id = new.desafio_id;
  if not found then raise exception 'Desafio não encontrado'; end if;

  -- Prova
  if d.prova in ('video', 'strava', 'depoimento') and new.video_path is null then
    raise exception 'Esse desafio pede o vídeo gravado ao vivo';
  end if;
  if (d.prova = 'strava' or new.exercicio = 'Corrida') and new.print_path is null then
    raise exception 'A corrida pede o print do app de corrida';
  end if;

  -- Antes da data de início não vale
  if d.data_inicio is not null and new.dia < d.data_inicio then
    raise exception 'O desafio começa em %', to_char(d.data_inicio, 'DD/MM');
  end if;

  -- Largar um vício: um depoimento por dia
  if d.tipo = 'largar' and exists (select 1 from public.desafio_checkins c
             where c.desafio_id = new.desafio_id and c.user_id = new.user_id and c.dia = new.dia) then
    raise exception 'O depoimento de hoje já foi enviado';
  end if;

  -- Hora limite: só hoje e até o horário (Brasília)
  if d.hora_limite is not null then
    if new.dia <> (now() at time zone 'America/Sao_Paulo')::date
       or (now() at time zone 'America/Sao_Paulo')::time > d.hora_limite then
      raise exception 'Esse desafio só aceita check-in até as %', to_char(d.hora_limite, 'HH24:MI');
    end if;
  end if;

  -- Exercícios: um da lista, um de cada por dia, limite do dia, sem repetir o de ontem
  if d.exercicios is not null and array_length(d.exercicios, 1) > 0 then
    if new.exercicio is null or not (new.exercicio = any(d.exercicios)) then
      raise exception 'Escolha um dos exercícios do desafio';
    end if;
    if exists (select 1 from public.desafio_checkins c
               where c.desafio_id = new.desafio_id and c.user_id = new.user_id
                 and c.dia = new.dia and c.exercicio = new.exercicio) then
      raise exception 'Esse exercício já foi feito hoje';
    end if;
    -- Corrida: vale o dia inteiro (não precisa dos outros exercícios), fica
    -- fora do limite do dia e do "não repetir"; a meta é X corridas na semana.
    if new.exercicio = 'Corrida' then
      new.quantidade := coalesce(d.max_por_dia, 1);
      return new;
    end if;
    if exists (select 1 from public.desafio_checkins c
               where c.desafio_id = new.desafio_id and c.user_id = new.user_id
                 and c.dia = new.dia and c.exercicio = 'Corrida') then
      raise exception 'Hoje o dia já fechou com a corrida 🏃';
    end if;
    select count(*) into n from public.desafio_checkins c
     where c.desafio_id = new.desafio_id and c.user_id = new.user_id and c.dia = new.dia;
    if d.max_por_dia is not null and n >= d.max_por_dia then
      raise exception 'O limite desse desafio é % por dia', d.max_por_dia;
    end if;
    if d.nao_repetir and exists (select 1 from public.desafio_checkins c
               where c.desafio_id = new.desafio_id and c.user_id = new.user_id
                 and c.dia = new.dia - 1 and c.exercicio = new.exercicio) then
      raise exception 'Não pode repetir o exercício de ontem';
    end if;
    new.quantidade := 1;
  end if;
  return new;
end;
$$;

drop trigger if exists desafio_checkin_regras on public.desafio_checkins;
create trigger desafio_checkin_regras
  before insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_regras();
