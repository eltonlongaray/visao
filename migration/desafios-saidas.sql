-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — QUEM DESISTE (Élton, 15/10)
--
-- • Não tem dia justificado: doença, imprevisto ou qualquer motivo,
--   quem não vai mais cumprir sai do desafio.
-- • Pra sair, a pessoa escreve o motivo. O motivo vai pra sala do grupo
--   e pro relatório ("desistiu em dd/mm: motivo").
-- • Quem saiu perde o acesso ao grupo enquanto o desafio estiver rolando
--   e não volta nessa rodada (pode entrar na próxima).
-- • Depois do fim, quem saiu vê o relatório (só leitura).
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-visibilidade.sql,
-- desafios-sala.sql e desafios-rodadas.sql. Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: TABELA ───────────────────────────────────────────
create table if not exists public.desafio_saidas (
  desafio_id  uuid not null references public.desafios(id) on delete cascade,
  user_id     uuid not null,
  nome        text,
  motivo      text not null,
  saiu_em     date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_at  timestamptz not null default now(),
  primary key (desafio_id, user_id)
);
alter table public.desafio_saidas enable row level security;

-- O desafio já acabou? (fim = data_fim ou início + dias - 1)
create or replace function public.desafio_acabou(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((
    select (now() at time zone 'America/Sao_Paulo')::date >
           coalesce(d.data_fim, case when d.data_inicio is not null and d.dias_total is not null
                                     then d.data_inicio + d.dias_total - 1 end)
      from public.desafios d where d.id = d_id), false);
$$;

-- Eu saí desse desafio e ele já acabou? (aí vejo o relatório)
create or replace function public.saiu_e_acabou(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.desafio_saidas s where s.desafio_id = d_id and s.user_id = auth.uid())
     and public.desafio_acabou(d_id);
$$;

-- ─── BLOCO 2: QUEM VÊ ──────────────────────────────────────────
drop policy if exists saidas_ler on public.desafio_saidas;
create policy saidas_ler on public.desafio_saidas for select to authenticated using (
  user_id = auth.uid()
  or public.sou_participante(desafio_id)
  or public.sou_dono_desafio(desafio_id)
  or public.eh_admin()
);
grant select on public.desafio_saidas to authenticated;

-- Quem saiu volta a ver o desafio, os participantes e as provas
-- (pro relatório) só depois do fim. A sala continua fechada.
drop policy if exists "desafios_read" on public.desafios;
create policy "desafios_read" on public.desafios for select using (
  modalidade = 'oficial'
  or author_id = auth.uid()
  or public.sou_participante(id)
  or public.saiu_e_acabou(id)
);
drop policy if exists "part_read" on public.desafio_participantes;
create policy "part_read" on public.desafio_participantes for select using (
  public.sou_participante(desafio_id)
  or public.sou_dono_desafio(desafio_id)
  or public.eh_admin()
  or public.saiu_e_acabou(desafio_id)
);
drop policy if exists "checkin_read" on public.desafio_checkins;
create policy "checkin_read" on public.desafio_checkins for select using (
  public.sou_participante(desafio_id)
  or public.sou_dono_desafio(desafio_id)
  or public.eh_admin()
  or public.saiu_e_acabou(desafio_id)
);

-- ─── BLOCO 3: SAIR COM MOTIVO ──────────────────────────────────
create or replace function public.sair_do_desafio(p_desafio uuid, p_motivo text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_nome text;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
begin
  if length(v_motivo) < 3 then
    raise exception 'Escreve o motivo pra sair do desafio';
  end if;
  select coalesce(nullif(btrim(p.nome), ''), 'Falcão') into v_nome
    from public.desafio_participantes p
   where p.desafio_id = p_desafio and p.user_id = auth.uid();
  if not found then
    raise exception 'Tu não está nesse desafio';
  end if;
  insert into public.desafio_saidas (desafio_id, user_id, nome, motivo)
  values (p_desafio, auth.uid(), v_nome, v_motivo)
  on conflict (desafio_id, user_id) do update set motivo = excluded.motivo;
  -- Avisa o grupo na sala (antes de sair, enquanto ainda é participante)
  begin
    insert into public.chat_mensagens (escopo, desafio_id, autor_id, autor_nome, texto)
    values ('desafio', p_desafio, auth.uid(), v_nome, '🚪 Saiu do desafio. Motivo: ' || v_motivo);
  exception when others then null;   -- sem sala: só não avisa
  end;
  delete from public.desafio_participantes where desafio_id = p_desafio and user_id = auth.uid();
end $$;
grant execute on function public.sair_do_desafio(uuid, text) to authenticated;

-- Sair direto (sem motivo) não vale mais: só pela função acima
drop policy if exists "part_delete_own" on public.desafio_participantes;

-- ─── BLOCO 4: QUEM SAIU NÃO VOLTA NESSA RODADA ─────────────────
create or replace function public.desafio_sem_volta()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_dia date;
begin
  select s.saiu_em into v_dia from public.desafio_saidas s
   where s.desafio_id = new.desafio_id and s.user_id = new.user_id;
  if found then
    raise exception 'Tu saiu desse desafio em %. Dá pra entrar de novo na próxima rodada.', to_char(v_dia, 'DD/MM');
  end if;
  return new;
end $$;

drop trigger if exists desafio_sem_volta on public.desafio_participantes;
create trigger desafio_sem_volta
  before insert on public.desafio_participantes
  for each row execute function public.desafio_sem_volta();

notify pgrst, 'reload schema';
