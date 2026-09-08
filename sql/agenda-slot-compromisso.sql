-- ═══════════════════════════════════════════════════════════════
-- AGENDA ONLINE — compromisso do Ritual TAMBÉM ocupa o slot
-- Bug: a profissional marcava um compromisso (kind='commitment') no Ritual e o
-- horário continuava livre pros clientes, porque slots_ocupados só olhava a
-- tabela `agendamentos`. Agora considera também os compromissos com horário.
-- Rodar no Supabase → SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: slots_ocupados = agendamentos confirmados + compromissos ===
create or replace function slots_ocupados(p_slug text, p_from date, p_to date)
returns table (data date, hora text)
language sql security definer stable
as $$
  -- 1) Agendamentos confirmados (cliente marcou pelo link ou a profissional lançou)
  select a.data, a.hora
  from agendamentos a
  join agenda_config c on c.user_id = a.owner_id
  where c.slug = p_slug and a.status = 'confirmado'
    and a.data >= p_from and a.data <= p_to

  union

  -- 2) Compromissos do Ritual COM horário (a profissional está ocupada nesse slot).
  -- Compara `day` como texto ISO (YYYY-MM-DD) + guarda de regex, pra um valor
  -- estranho jamais quebrar o cast e derrubar o booking do cliente.
  select t.day::date as data, t.start_time as hora
  from tasks t
  join agenda_config c on c.user_id = t.user_id
  where c.slug = p_slug
    and t.kind = 'commitment'
    and coalesce(t.cancelled, false) = false
    and t.start_time is not null and t.start_time <> ''
    and t.day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and t.day >= to_char(p_from, 'YYYY-MM-DD')
    and t.day <= to_char(p_to, 'YYYY-MM-DD');
$$;
grant execute on function slots_ocupados(text, date, date) to anon, authenticated;
