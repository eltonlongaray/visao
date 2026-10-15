-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — QUEM SOME 3 DIAS SAI SOZINHO (Élton, 15/10)
--
-- • Desafio em grupo: quem passa 3 dias seguidos sem mandar prova
--   nenhuma sai automaticamente, igual a quem desiste (perde o grupo até
--   o fim e só volta na próxima rodada).
-- • Vai pra sala: "🚪 Saiu automaticamente: 3 dias sem mandar prova."
-- • No relatório: "desistiu em dd/mm. Motivo: Sumiu 3 dias sem mandar prova".
-- • Quem sai com motivo NÃO paga a prenda. Quem some sem justificar PAGA:
--   depois do fim do desafio, grava a prenda e ela vai pro Mural.
-- • Roda quando alguém abre os Desafios (o app chama) e, se der, todo dia
--   00:10 pelo relógio do Supabase (pg_cron).
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-saidas.sql e desafios-prendas.sql.
-- Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- Essa pessoa sumiu desse desafio? (3 dias seguidos, até ontem, sem prova nenhuma,
-- todos depois de o desafio começar e de ela entrar; desafio ainda rolando)
-- Saída automática (sumiu) x saída com motivo
alter table public.desafio_saidas add column if not exists automatica boolean not null default false;

create or replace function public.desafio_sumiu(p_desafio uuid, p_user uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date as hoje)
  select exists (
    select 1
      from h, public.desafio_participantes p
      join public.desafios d on d.id = p.desafio_id
     where p.desafio_id = p_desafio and p.user_id = p_user
       and d.modalidade <> 'individual'
       and h.hoje <= coalesce(d.data_fim, case when d.data_inicio is not null and d.dias_total is not null
                                               then d.data_inicio + d.dias_total - 1 end, h.hoje)
       and h.hoje - 3 >= greatest(coalesce(d.data_inicio, (d.created_at at time zone 'America/Sao_Paulo')::date),
                                  (p.joined_at at time zone 'America/Sao_Paulo')::date)
       and not exists (
         select 1 from public.desafio_checkins c
          where c.desafio_id = p.desafio_id and c.user_id = p.user_id
            and c.dia between h.hoje - 3 and h.hoje - 1));
$$;

create or replace function public.desafio_tirar_sumidos()
returns int language plpgsql security definer
set search_path = public as $$
declare
  r     record;
  n     int := 0;
begin
  for r in
    select p.desafio_id, p.user_id, coalesce(nullif(btrim(p.nome), ''), 'Falcão') as nome
      from public.desafio_participantes p
      join public.desafios d on d.id = p.desafio_id
     where d.modalidade <> 'individual'
       and public.desafio_sumiu(p.desafio_id, p.user_id)
  loop
    insert into public.desafio_saidas (desafio_id, user_id, nome, motivo, automatica)
    values (r.desafio_id, r.user_id, r.nome, 'Sumiu 3 dias sem mandar prova', true)
    on conflict (desafio_id, user_id) do nothing;
    begin
      insert into public.chat_mensagens (escopo, desafio_id, autor_id, autor_nome, texto)
      values ('desafio', r.desafio_id, r.user_id, r.nome, '🚪 Saiu automaticamente: 3 dias sem mandar prova.');
    exception when others then null;
    end;
    delete from public.desafio_participantes where desafio_id = r.desafio_id and user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Prova de quem já sumiu não entra (a saída acontece na próxima faxina)
create or replace function public.desafio_checkin_sumido()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.desafio_sumiu(new.desafio_id, new.user_id) then
    raise exception 'Tu ficou 3 dias sem mandar prova e saiu desse desafio. Dá pra entrar de novo na próxima rodada.';
  end if;
  return new;
end $$;
drop trigger if exists desafio_checkin_sumido on public.desafio_checkins;
create trigger desafio_checkin_sumido
  before insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_sumido();

grant execute on function public.desafio_tirar_sumidos() to authenticated;

-- Quem sumiu paga a prenda mesmo fora do grupo
drop policy if exists prendas_criar on public.desafio_prendas;
create policy prendas_criar on public.desafio_prendas
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.sou_participante(desafio_id)
         or exists (select 1 from public.desafio_saidas s
                     where s.desafio_id = desafio_prendas.desafio_id
                       and s.user_id = auth.uid() and s.automatica))
    and video_path like auth.uid()::text || '/prenda-%'
  );

create or replace function public.desafio_prenda_nova()
returns trigger language plpgsql security definer
set search_path = public as $$
declare d public.desafios;
begin
  select * into d from public.desafios where id = new.desafio_id;
  if d.id is null then raise exception 'Desafio não encontrado'; end if;
  if coalesce(trim(d.prenda), '') = '' then raise exception 'Esse desafio não tem prenda'; end if;
  new.user_id    := auth.uid();
  new.titulo     := d.titulo;
  new.prenda     := d.prenda;
  new.nome       := coalesce((select p.nome from public.desafio_participantes p
                               where p.desafio_id = d.id and p.user_id = auth.uid() limit 1),
                             (select s.nome from public.desafio_saidas s
                               where s.desafio_id = d.id and s.user_id = auth.uid() limit 1), 'Falcão');
  new.created_at := now();
  new.expira_em  := now() + interval '7 days';
  return new;
end $$;

-- Todo dia 00:10 de Brasília (03:10 UTC), se o pg_cron estiver disponível.
-- Se não estiver, tudo bem: o app chama quando alguém abre os Desafios.
do $$
begin
  create extension if not exists pg_cron with schema extensions;
  perform cron.unschedule(jobid) from cron.job where jobname = 'desafio_tirar_sumidos';
  perform cron.schedule('desafio_tirar_sumidos', '10 3 * * *', 'select public.desafio_tirar_sumidos()');
exception when others then
  raise notice 'pg_cron indisponível (%), o app cuida disso', sqlerrm;
end $$;

notify pgrst, 'reload schema';
