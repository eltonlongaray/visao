-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — CORRIDA POR SEMANA (desafio de exercício)
--
--   • desafios.corridas_semana: quantas corridas por semana (seg a dom) o
--     desafio de exercício pede, quando a Corrida está na lista.
--   • No dia em que a pessoa corre, a corrida fecha o dia sozinha: conta
--     como o máximo do dia, fica fora do limite e do "não repetir o de
--     ontem", e depois dela os outros exercícios do dia não entram mais.
--   • De quebra: prova antes da data de início do desafio não entra.
--   • 1 ou 2 corridas por semana, de até 5 km (desafios.km_corrida).
--   • Quem fecha uma semana cheia sem a corrida perde: não entra mais prova.
--   • Modo 'troca' (desafios.corrida_modo): a corrida entra no lugar dos
--     exercícios do dia, até X vezes na semana, e ninguém perde por não correr.
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-provas.sql.
-- ═══════════════════════════════════════════════════════════════

alter table public.desafios add column if not exists corridas_semana int;
update public.desafios set corridas_semana = 2 where corridas_semana > 2;
alter table public.desafios drop constraint if exists desafios_corridas_semana_ok;
alter table public.desafios add constraint desafios_corridas_semana_ok
  check (corridas_semana is null or corridas_semana between 1 and 2);

-- Como a corrida entra: 'obrigatoria' (quem não corre perde) ou 'troca'
-- (1x por semana a corrida substitui os exercícios do dia; sem ela, segue com os exercícios)
alter table public.desafios add column if not exists corrida_modo text;
alter table public.desafios drop constraint if exists desafios_corrida_modo_ok;
alter table public.desafios add constraint desafios_corrida_modo_ok
  check (corrida_modo is null or corrida_modo in ('obrigatoria', 'troca'));

-- Distância de cada corrida: até 5 km (cabe em 30 min)
alter table public.desafios add column if not exists km_corrida int;
alter table public.desafios drop constraint if exists desafios_km_corrida_ok;
alter table public.desafios add constraint desafios_km_corrida_ok
  check (km_corrida is null or km_corrida between 1 and 5);

create or replace function public.desafio_checkin_regras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.desafios;
  n int;
  entrou date;
  ini date;
  seg date;
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

  -- Corrida por semana: quem fechou uma semana cheia (seg a dom, dentro do
  -- desafio e depois de entrar) sem as corridas pedidas perdeu o desafio
  if d.corridas_semana is not null and d.exercicios is not null and 'Corrida' = any(d.exercicios)
     and coalesce(d.corrida_modo, 'obrigatoria') = 'obrigatoria' then
    select (p.joined_at at time zone 'America/Sao_Paulo')::date into entrou
      from public.desafio_participantes p
     where p.desafio_id = new.desafio_id and p.user_id = new.user_id;
    ini := greatest(coalesce(d.data_inicio, (d.created_at at time zone 'America/Sao_Paulo')::date), entrou);
    seg := ini + ((8 - extract(isodow from ini)::int) % 7);   -- primeira segunda a partir do início
    while seg + 6 < new.dia and (d.data_fim is null or seg + 6 <= d.data_fim) loop
      select count(distinct c.dia) into n from public.desafio_checkins c
       where c.desafio_id = new.desafio_id and c.user_id = new.user_id
         and c.exercicio = 'Corrida' and c.dia between seg and seg + 6;
      if n < d.corridas_semana then
        raise exception 'Esse desafio acabou pra você: a semana de % a % fechou sem a corrida',
          to_char(seg, 'DD/MM'), to_char(seg + 6, 'DD/MM');
      end if;
      seg := seg + 7;
    end loop;
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
      -- Modo troca: no máximo X corridas na semana (seg a dom)
      if d.corrida_modo = 'troca' then
        seg := new.dia - (extract(isodow from new.dia)::int - 1);
        select count(distinct c.dia) into n from public.desafio_checkins c
         where c.desafio_id = new.desafio_id and c.user_id = new.user_id
           and c.exercicio = 'Corrida' and c.dia between seg and seg + 6;
        if n >= coalesce(d.corridas_semana, 1) then
          raise exception 'A corrida dessa semana já foi usada. Hoje vale com os exercícios 💪';
        end if;
      end if;
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

notify pgrst, 'reload schema';
