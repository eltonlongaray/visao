-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — VISIBILIDADE (as duas camadas acordadas)
--
--   FORA (todos)          → título, meta, duração, "18 participando",
--                           placar COLETIVO ("82% em dia"). Sem nomes.
--   DENTRO (participantes)→ ranking com nomes, chat, provas.
--
-- Corrige: antes, qualquer um lia participantes/check-ins de desafio
-- oficial — vazava o ranking com nomes pra quem nem entrou.
-- Rodar no Supabase → SQL Editor. Depende de desafios-modalidades.sql.
-- ═══════════════════════════════════════════════════════════════

-- Sou o dono do desafio? (SECURITY DEFINER = sem recursão de policy)
create or replace function public.sou_dono_desafio(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.desafios d where d.id = d_id and d.author_id = auth.uid());
$$;

-- ── Participantes: só quem está dentro (ou o dono/admin) ─────
drop policy if exists "part_read" on public.desafio_participantes;
create policy "part_read" on public.desafio_participantes for select using (
  public.sou_participante(desafio_id)
  or public.sou_dono_desafio(desafio_id)
  or public.eh_admin()
);

-- ── Check-ins: idem ──────────────────────────────────────────
drop policy if exists "checkin_read" on public.desafio_checkins;
create policy "checkin_read" on public.desafio_checkins for select using (
  public.sou_participante(desafio_id)
  or public.sou_dono_desafio(desafio_id)
  or public.eh_admin()
);

-- ── Placar público da vitrine: agregado, SEM nomes ───────────
-- Só de desafios OFICIAIS. Devolve quantos participam e quantos
-- bateram a meta HOJE → "18 participando · 82% em dia".
-- É a prova social que desperta curiosidade sem expor ninguém.
create or replace function public.placar_oficiais()
returns table (desafio_id uuid, participantes bigint, em_dia bigint)
language sql security definer stable
set search_path = public as $$
  select
    p.desafio_id,
    count(*)::bigint,
    count(*) filter (where t.total >= coalesce(d.meta_diaria, 1))::bigint
  from public.desafio_participantes p
  join public.desafios d on d.id = p.desafio_id
  left join lateral (
    select coalesce(sum(c.quantidade), 0) as total
    from public.desafio_checkins c
    where c.desafio_id = p.desafio_id
      and c.user_id   = p.user_id
      and c.dia       = (now() at time zone 'America/Sao_Paulo')::date
  ) t on true
  where d.modalidade = 'oficial'
  group by p.desafio_id;
$$;

grant execute on function public.placar_oficiais() to authenticated;
