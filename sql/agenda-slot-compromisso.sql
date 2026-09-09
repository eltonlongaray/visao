-- ═══════════════════════════════════════════════════════════════
-- AGENDA ONLINE — ocupação por INTERVALO (compromisso + duração)
-- Bug 1: compromisso do Ritual (kind='commitment') não ocupava o slot.
-- Bug 2 (Larissa): atendimentos em horário "quebrado" (15:20) com duração NÃO
--   bloqueavam os slots ofertados sobrepostos (15:00/16:00), pois o bloqueio era
--   por horário EXATO. Agora a RPC devolve o INTERVALO [inicio, fim] de cada
--   ocupação e o app bloqueia qualquer slot que se sobreponha.
-- Rodar no Supabase → SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════════

-- A função ganhou a coluna `fim` no retorno → precisa DROPAR antes (o Postgres não
-- deixa CREATE OR REPLACE mudar o tipo de retorno).
drop function if exists slots_ocupados(text, date, date);

create or replace function slots_ocupados(p_slug text, p_from date, p_to date)
returns table (data date, hora text, fim text)
language sql security definer stable
as $$
  -- 1) Agendamentos confirmados → intervalo [hora, hora + duração]
  select a.data, a.hora,
    to_char((a.hora::time + make_interval(mins => coalesce(a.duracao_min, c.duracao_min, 60))), 'HH24:MI') as fim
  from agendamentos a
  join agenda_config c on c.user_id = a.owner_id
  where c.slug = p_slug and a.status = 'confirmado'
    and a.hora ~ '^[0-9]{1,2}:[0-9]{2}$'
    and a.data >= p_from and a.data <= p_to

  union all

  -- 2) Compromissos do Ritual COM horário → intervalo [inicio, horaFim | inicio + padrão].
  -- Compara `day` como texto ISO + guarda regex, pra um valor estranho jamais
  -- quebrar o cast e derrubar o booking do cliente.
  select t.day::date as data, t.start_time as hora,
    coalesce(
      nullif(t.extra->>'horaFim', ''),
      to_char((t.start_time::time + make_interval(mins => coalesce(c.duracao_min, 60))), 'HH24:MI')
    ) as fim
  from tasks t
  join agenda_config c on c.user_id = t.user_id
  where c.slug = p_slug
    and t.kind = 'commitment'
    and coalesce(t.cancelled, false) = false
    and t.start_time ~ '^[0-9]{1,2}:[0-9]{2}$'
    and t.day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and t.day >= to_char(p_from, 'YYYY-MM-DD')
    and t.day <= to_char(p_to, 'YYYY-MM-DD');
$$;
grant execute on function slots_ocupados(text, date, date) to anon, authenticated;
