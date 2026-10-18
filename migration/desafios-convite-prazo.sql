-- ════════════════════════════════════════════════════════════════
-- CONVITE SÓ ATÉ O 1º DIA DO DESAFIO (Élton, 18/10/2026)
-- Depois que o desafio começou ninguém novo entra pelo código/link.
-- Pode rodar mais de uma vez. Quem já está dentro continua abrindo
-- o link normalmente (não dá erro).
-- 1º dia = data de início; sem data, o dia em que foi criado.
-- ════════════════════════════════════════════════════════════════

-- ─── BLOCO 1: O CONVITE AINDA VALE? ─────────────────────────────
-- true = ainda dá pra entrar; false = já começou; null = código não existe
create or replace function public.desafio_convite_aberto(p_codigo text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date
         <= coalesce(d.data_inicio, (d.created_at at time zone 'America/Sao_Paulo')::date)
    from public.desafios d
   where d.codigo = upper(trim(p_codigo)) and d.modalidade = 'amigos'
   limit 1;
$$;
grant execute on function public.desafio_convite_aberto(text) to authenticated;

-- ─── BLOCO 2: ENTRAR PELO CÓDIGO RESPEITA O PRAZO ───────────────
create or replace function public.entrar_por_codigo(p_codigo text, p_nome text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare v_id uuid; v_ini date;
begin
  select id, coalesce(data_inicio, (created_at at time zone 'America/Sao_Paulo')::date)
    into v_id, v_ini
    from public.desafios
   where codigo = upper(trim(p_codigo)) and modalidade = 'amigos';
  if v_id is null then
    raise exception 'Código inválido';
  end if;
  -- Já está dentro: só devolve o desafio (link aberto de novo)
  if exists (select 1 from public.desafio_participantes
              where desafio_id = v_id and user_id = auth.uid()) then
    return v_id;
  end if;
  if (now() at time zone 'America/Sao_Paulo')::date > v_ini then
    raise exception 'Esse desafio já começou: não dá mais pra entrar. Fica pra próxima rodada 🦅';
  end if;
  insert into public.desafio_participantes (desafio_id, user_id, nome)
  values (v_id, auth.uid(), p_nome)
  on conflict (desafio_id, user_id) do nothing;
  return v_id;
end;
$$;
grant execute on function public.entrar_por_codigo(text, text) to authenticated;

notify pgrst, 'reload schema';
