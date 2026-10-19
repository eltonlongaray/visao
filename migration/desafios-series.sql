-- ════════════════════════════════════════════════════════════════
-- SÉRIES POR EXERCÍCIO (Élton, 19/10/2026)
-- Desafio de exercício pode pedir N séries de cada exercício por dia:
-- cada série é um vídeo; o exercício só conta no dia depois da última.
-- "Máximo por dia" passa a contar exercícios DIFERENTES.
-- Pode rodar mais de uma vez.
-- ════════════════════════════════════════════════════════════════

-- ─── BLOCO 1: COLUNA ───────────────────────────────────────────
alter table public.desafios add column if not exists series int;
alter table public.desafios drop constraint if exists desafios_series_ck;
alter table public.desafios add constraint desafios_series_ck check (series is null or series between 1 and 5);

-- ─── BLOCO 2: REGRAS DO CHECK-IN (igual a desafios-doente.sql + séries) ──
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
  k int;
begin
  select * into d from public.desafios where id = new.desafio_id;
  if not found then raise exception 'Desafio não encontrado'; end if;

  -- Antes da data de início não vale
  if d.data_inicio is not null and new.dia < d.data_inicio then
    raise exception 'O desafio começa em %', to_char(d.data_inicio, 'DD/MM');
  end if;

  -- Fiquei doente (Élton, 18/10): vídeo contando o que tem, dia justificado.
  -- Vale a qualquer hora do dia, um por dia, e só se ainda não mandou prova hoje.
  if new.doente then
    if new.video_path is null then
      raise exception 'Pra justificar o dia, grave o vídeo contando o que está acontecendo';
    end if;
    if exists (select 1 from public.desafio_checkins c
               where c.desafio_id = new.desafio_id and c.user_id = new.user_id and c.dia = new.dia) then
      raise exception 'Hoje tu já mandou prova nesse desafio';
    end if;
    new.quantidade := 0;
    new.exercicio := null;
    new.print_path := null;
    return new;
  end if;
  -- Prova
  if d.prova in ('video', 'strava', 'depoimento') and new.video_path is null then
    raise exception 'Esse desafio pede o vídeo gravado ao vivo';
  end if;
  if (d.prova = 'strava' or new.exercicio = 'Corrida') and new.print_path is null then
    raise exception 'A corrida pede o print do app de corrida';
  end if;

  -- Dia justificado não aceita outra prova (melhorou? amanhã volta a gravar)
  if exists (select 1 from public.desafio_checkins c
             where c.desafio_id = new.desafio_id and c.user_id = new.user_id and c.dia = new.dia and c.doente) then
    raise exception 'Hoje tu já justificou que está doente. Amanhã, se estiver melhor, volta a gravar 🦅';
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
      -- Semana com dia justificado (doente) não cobra a corrida
      if n < d.corridas_semana and not exists (select 1 from public.desafio_checkins c
             where c.desafio_id = new.desafio_id and c.user_id = new.user_id
               and c.doente and c.dia between seg and seg + 6) then
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
    -- Séries: o mesmo exercício pode ter até N vídeos no dia (um por série)
    select count(*) into k from public.desafio_checkins c
     where c.desafio_id = new.desafio_id and c.user_id = new.user_id
       and c.dia = new.dia and c.exercicio = new.exercicio;
    if new.exercicio <> 'Corrida' and k >= coalesce(d.series, 1) then
      raise exception 'Esse exercício já foi feito hoje';
    end if;
    if new.exercicio = 'Corrida' and k > 0 then
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
    -- Limite do dia conta exercícios DIFERENTES (a próxima série do mesmo passa)
    select count(distinct c.exercicio) into n from public.desafio_checkins c
     where c.desafio_id = new.desafio_id and c.user_id = new.user_id and c.dia = new.dia;
    if d.max_por_dia is not null and k = 0 and n >= d.max_por_dia then
      raise exception 'O limite desse desafio é % por dia', d.max_por_dia;
    end if;
    if d.nao_repetir and exists (select 1 from public.desafio_checkins c
               where c.desafio_id = new.desafio_id and c.user_id = new.user_id
                 and c.dia = new.dia - 1 and c.exercicio = new.exercicio) then
      raise exception 'Não pode repetir o exercício de ontem';
    end if;
    -- Só a última série fecha o exercício (conta 1 no dia); as outras contam 0
    new.quantidade := case when k + 1 >= coalesce(d.series, 1) then 1 else 0 end;
  end if;
  return new;
end;
$$;

drop trigger if exists desafio_checkin_regras on public.desafio_checkins;
create trigger desafio_checkin_regras
  before insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_regras();



-- ─── BLOCO 3: A MENSAGEM NA SALA (igual a desafios-doente.sql + "série 2 de 3") ──
create or replace function public.desafio_checkin_na_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.desafios;
  nome text;
  txt text;
  un text;
  n int;
begin
  select * into d from public.desafios where id = new.desafio_id;
  if not found then return new; end if;
  select coalesce(nullif(btrim(p.nome), ''), 'Falcão') into nome
    from public.desafio_participantes p
   where p.desafio_id = new.desafio_id and p.user_id = new.user_id
   limit 1;
  un := coalesce(nullif(btrim(d.unidade), ''), '');

  if new.doente then
    txt := '🤒 Fiquei doente · dia justificado';
  elsif d.tipo = 'largar' then
    txt := case when new.quantidade > 0 then '✅ Consegui hoje' else '😔 Hoje não consegui' end
           || case when new.video_path is not null then ' · depoimento' else '' end;
  elsif new.exercicio = 'Corrida' or d.prova = 'strava' then
    txt := '🏃 Corrida' || case when new.exercicio is null and new.quantidade > 0 then ' · ' || new.quantidade || coalesce(' ' || nullif(un, ''), '') else '' end;
  elsif new.exercicio is not null then
    txt := '🏋️ ' || new.exercicio;
    if coalesce(d.series, 1) > 1 then
      select count(*) into n from public.desafio_checkins c
       where c.desafio_id = new.desafio_id and c.user_id = new.user_id
         and c.dia = new.dia and c.exercicio = new.exercicio;
      txt := txt || ' · série ' || n || ' de ' || d.series;
    end if;
  elsif d.prova = 'depoimento' then
    txt := '🎙️ Depoimento' || case when d.meta_diaria is not null then ' · ' || new.quantidade || coalesce(' ' || nullif(un, ''), '') else '' end;
  elsif d.meta_diaria is not null then
    txt := (case when new.video_path is not null then '🎥 ' else '✅ ' end) || '+' || new.quantidade || coalesce(' ' || nullif(un, ''), '');
  else
    txt := (case when new.video_path is not null then '🎥 ' else '✅ ' end) || 'Feito hoje';
  end if;

  insert into public.chat_mensagens (escopo, desafio_id, autor_id, autor_nome, texto, checkin_id, prova_video, prova_print, created_at)
  values ('desafio', new.desafio_id, new.user_id, coalesce(nome, 'Falcão'), txt, new.id, new.video_path, new.print_path, new.created_at);
  return new;
end $$;

drop trigger if exists desafio_checkin_na_sala on public.desafio_checkins;
create trigger desafio_checkin_na_sala
  after insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_na_sala();



-- ─── BLOCO 4: SÉRIES PODE MUDAR POR PROPOSTA (igual a desafios-propostas.sql + series) ──
create or replace function public.desafio_colunas_regra()
returns text[] language sql immutable as $$
  select array['titulo', 'descricao', 'dias_total', 'meta_diaria', 'unidade', 'prova_opcoes',
               'prenda', 'data_inicio', 'data_fim', 'prova', 'exercicios', 'max_por_dia',
               'nao_repetir', 'regras_dono', 'hora_limite', 'corridas_semana', 'km_corrida',
               'corrida_modo', 'tipo', 'series'];
$$;

create or replace function public.desafio_aplicar_proposta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.desafio_propostas;
  d public.desafios;
  n public.desafios;
begin
  select * into pr from public.desafio_propostas where id = p_id;
  select * into d from public.desafios where id = pr.desafio_id;
  -- Os valores novos por cima dos atuais (só as colunas da regra, já checadas)
  n := jsonb_populate_record(d, pr.mudancas);
  perform set_config('falcon.proposta', 'on', true);
  update public.desafios set
    titulo = n.titulo, descricao = n.descricao, dias_total = n.dias_total,
    meta_diaria = n.meta_diaria, unidade = n.unidade, prova_opcoes = n.prova_opcoes,
    prenda = n.prenda, data_inicio = n.data_inicio, data_fim = n.data_fim,
    prova = n.prova, exercicios = n.exercicios, max_por_dia = n.max_por_dia,
    nao_repetir = n.nao_repetir, regras_dono = n.regras_dono, hora_limite = n.hora_limite,
    corridas_semana = n.corridas_semana, km_corrida = n.km_corrida,
    corrida_modo = n.corrida_modo, tipo = n.tipo, series = n.series
  where id = d.id;
  perform set_config('falcon.proposta', 'off', true);
end $$;
revoke all on function public.desafio_aplicar_proposta(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
