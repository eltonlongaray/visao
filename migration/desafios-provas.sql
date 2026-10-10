-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — PROVA EM VÍDEO AO VIVO, EXERCÍCIOS E REGRAS
--
--   • Prova: 'video' (gravado ao vivo no app) | 'strava' (print do app de
--     corrida + vídeo ao vivo) | 'depoimento' (vídeo ao vivo mais longo,
--     falando: leitura, largar um vício) | 'honra' (só marca). null = como era.
--   • Largar um vício: o dia em que a pessoa conta que não conseguiu entra
--     com quantidade 0 (o depoimento fica, o dia não conta).
--   • Exercícios: o dono monta uma lista (até 4 + corrida = 5), escolhe o
--     máximo por dia e se pode repetir o exercício de ontem.
--   • Hora limite (ex.: acordar às 5h): o check-in só entra até esse horário
--     (hora de Brasília), e só pro dia de hoje.
--   • Regras do dono: texto livre, aparece junto das regras fixas do app.
--   • As regras valem no BANCO (gatilho), não só na tela: nem o Pet nem um
--     app antigo conseguem registrar fora delas.
--   • Vídeos e prints ficam num bucket privado, só os participantes veem, e
--     somem em 7 dias (o check-in fica; só o arquivo vence).
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-visibilidade.sql.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: COLUNAS DO DESAFIO ───────────────────────────────
alter table public.desafios add column if not exists prova        text;
alter table public.desafios add column if not exists exercicios   text[];
alter table public.desafios add column if not exists max_por_dia  int;
alter table public.desafios add column if not exists nao_repetir  boolean not null default true;
alter table public.desafios add column if not exists regras_dono  text;
alter table public.desafios add column if not exists hora_limite  time;

alter table public.desafios drop constraint if exists desafios_prova_ok;
alter table public.desafios add constraint desafios_prova_ok
  check (prova is null or prova in ('video', 'strava', 'depoimento', 'honra'));
alter table public.desafios drop constraint if exists desafios_exercicios_ok;
alter table public.desafios add constraint desafios_exercicios_ok
  check (exercicios is null or array_length(exercicios, 1) <= 5);
alter table public.desafios drop constraint if exists desafios_regras_ok;
alter table public.desafios add constraint desafios_regras_ok
  check (regras_dono is null or char_length(regras_dono) <= 800);

-- ─── BLOCO 2: COLUNAS DO CHECK-IN ──────────────────────────────
-- video_url (texto) ficou da v1 sem uso: bucket privado guarda o CAMINHO,
-- a URL é assinada na hora de ver.
alter table public.desafio_checkins add column if not exists exercicio  text;
alter table public.desafio_checkins add column if not exists video_path text;
alter table public.desafio_checkins add column if not exists print_path text;
alter table public.desafio_checkins alter column video_expira_em set default (now() + interval '7 days');

-- ─── BLOCO 3: AS REGRAS NO BANCO ───────────────────────────────
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

-- ─── BLOCO 4: BUCKET PRIVADO DAS PROVAS ────────────────────────
-- 25 MB: depoimento de 2 min em 720p (~900 kbps) dá ~14 MB. Print entra como imagem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('desafio-provas', 'desafio-provas', false, 26214400,
        array['video/webm', 'video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Vê a prova quem vê o check-in: participante, dono do desafio ou admin
drop policy if exists provas_leitura on storage.objects;
create policy provas_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'desafio-provas'
    and exists (
      select 1 from public.desafio_checkins c
      where (c.video_path = storage.objects.name or c.print_path = storage.objects.name)
        and coalesce(c.video_expira_em, now() + interval '1 day') > now()
        and (public.sou_participante(c.desafio_id) or public.sou_dono_desafio(c.desafio_id) or public.eh_admin())
    )
  );

-- Cada um sobe e apaga só na própria pasta (uid/...)
drop policy if exists provas_envio on storage.objects;
create policy provas_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'desafio-provas'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists provas_remocao on storage.objects;
create policy provas_remocao on storage.objects
  for delete to authenticated
  using (bucket_id = 'desafio-provas'
         and (storage.foldername(name))[1] = auth.uid()::text);
