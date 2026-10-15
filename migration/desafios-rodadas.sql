-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — DESAFIO ENCERRADO E NOVA RODADA COM O MESMO GRUPO
-- (Élton, 15/10)
--
-- • turma_id: a primeira rodada do grupo (as outras apontam pra ela)
-- • rodada: 1, 2, 3...
-- • Depois do último dia, o desafio não aceita mais prova (o relatório
--   fecha com o que foi entregue até o fim).
--
-- Rodar no Supabase → SQL Editor. Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

alter table public.desafios add column if not exists turma_id uuid references public.desafios(id) on delete set null;
alter table public.desafios add column if not exists rodada int;
create index if not exists desafios_turma_idx on public.desafios (turma_id);

-- Prova depois do fim não entra
create or replace function public.desafio_checkin_fim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fim date;
begin
  select coalesce(d.data_fim, case when d.data_inicio is not null and d.dias_total is not null
                                   then d.data_inicio + d.dias_total - 1 end)
    into v_fim
    from public.desafios d where d.id = new.desafio_id;
  if v_fim is not null and coalesce(new.dia, (now() at time zone 'America/Sao_Paulo')::date) > v_fim then
    raise exception 'Esse desafio já acabou em %', to_char(v_fim, 'DD/MM');
  end if;
  return new;
end $$;

drop trigger if exists desafio_checkin_fim on public.desafio_checkins;
create trigger desafio_checkin_fim
  before insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_fim();

notify pgrst, 'reload schema';
