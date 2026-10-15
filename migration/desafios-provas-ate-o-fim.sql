-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — PROVAS E CONVERSA DA SALA FICAM ATÉ O FIM DO DESAFIO
-- (Élton, 15/10)
--
-- Antes: o vídeo da prova e as mensagens da sala sumiam em 7 dias.
-- Agora ficam até 3 dias depois do último dia do desafio. Desafio sem data
-- de fim (sem dias definidos) guarda por 1 ano. Se o fim mudar (editou os
-- dias, mudou o início), a validade acompanha.
--
-- Rodar no Supabase → SQL Editor. Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: ATÉ QUANDO VALE ──────────────────────────────────
-- Último dia = data_fim, ou início + dias - 1. Vale até 3 dias depois
-- (meia-noite de Brasília), nunca menos que 7 dias a partir de agora.
create or replace function public.desafio_validade(p_desafio uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce(
      ((coalesce(d.data_fim, coalesce(d.data_inicio, d.created_at::date) + d.dias_total - 1) + 4)::timestamp
        at time zone 'America/Sao_Paulo'),
      now() + interval '365 days'),
    now() + interval '7 days')
  from public.desafios d where d.id = p_desafio;
$$;

-- ─── BLOCO 2: CHECK-IN NOVO JÁ NASCE COM A VALIDADE CERTA ──────
create or replace function public.desafio_checkin_validade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.video_expira_em := coalesce(public.desafio_validade(new.desafio_id), now() + interval '7 days');
  return new;
end $$;

drop trigger if exists desafio_checkin_validade on public.desafio_checkins;
create trigger desafio_checkin_validade
  before insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_validade();

-- ─── BLOCO 3: MENSAGEM DA SALA TAMBÉM ──────────────────────────
create or replace function public.chat_sala_validade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo = 'desafio' and new.desafio_id is not null then
    new.expira_em := coalesce(public.desafio_validade(new.desafio_id), new.expira_em);
  end if;
  return new;
end $$;

drop trigger if exists chat_sala_validade on public.chat_mensagens;
create trigger chat_sala_validade
  before insert on public.chat_mensagens
  for each row execute function public.chat_sala_validade();

-- ─── BLOCO 4: ACERTA O QUE JÁ EXISTE E ACOMPANHA MUDANÇA DO FIM ─
-- A trava "só o texto pode ser editado" bloquearia mudar expira_em:
-- desliga só durante a atualização.
create or replace function public.desafio_reaplica_validade(p_desafio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v timestamptz := public.desafio_validade(p_desafio);
begin
  if v is null then return; end if;
  update public.desafio_checkins set video_expira_em = v
   where desafio_id = p_desafio and video_path is not null;
  alter table public.chat_mensagens disable trigger chat_edita_texto;
  update public.chat_mensagens set expira_em = v
   where escopo = 'desafio' and desafio_id = p_desafio;
  alter table public.chat_mensagens enable trigger chat_edita_texto;
end $$;

create or replace function public.desafio_fim_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data_fim is distinct from old.data_fim
  or new.data_inicio is distinct from old.data_inicio
  or new.dias_total is distinct from old.dias_total then
    perform public.desafio_reaplica_validade(new.id);
  end if;
  return new;
end $$;

drop trigger if exists desafio_fim_mudou on public.desafios;
create trigger desafio_fim_mudou
  after update on public.desafios
  for each row execute function public.desafio_fim_mudou();

-- Desafios que já existem (os vídeos que já foram apagados não voltam)
do $$
declare r record;
begin
  for r in select id from public.desafios loop
    perform public.desafio_reaplica_validade(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
