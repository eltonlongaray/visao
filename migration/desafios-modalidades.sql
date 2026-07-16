-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — 3 MODALIDADES + prenda + visibilidade
--   individual → só o dono vê
--   oficial    → todos veem (só admin cria)
--   amigos     → só os convidados veem (entra por código)
-- Rodar no Supabase → SQL Editor. Depende de desafios.sql + desafios-v1.sql.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Colunas novas ─────────────────────────────────────────
alter table public.desafios add column if not exists modalidade  text not null default 'oficial'; -- individual|oficial|amigos
alter table public.desafios add column if not exists codigo      text;    -- convite (modalidade amigos)
alter table public.desafios add column if not exists prenda      text;    -- quem não conclui paga
alter table public.desafios add column if not exists data_inicio date;
alter table public.desafios add column if not exists data_fim    date;

create unique index if not exists desafios_codigo_uk
  on public.desafios (codigo) where codigo is not null;


-- ── 2) Funções auxiliares (SECURITY DEFINER = ignoram RLS) ───
-- Sem elas, a policy de desafios consultaria participantes e a de
-- participantes consultaria desafios → RECURSÃO INFINITA.

create or replace function public.sou_participante(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.desafio_participantes p
    where p.desafio_id = d_id and p.user_id = auth.uid()
  );
$$;

create or replace function public.pode_ver_desafio(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.desafios d
    where d.id = d_id and (
      d.modalidade = 'oficial'
      or d.author_id = auth.uid()
      or public.sou_participante(d.id)
    )
  );
$$;

create or replace function public.eh_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin);
$$;


-- ── 3) RLS: desafios ─────────────────────────────────────────
drop policy if exists "desafios_read"         on public.desafios;
drop policy if exists "desafios_admin_insert" on public.desafios;
drop policy if exists "desafios_admin_update" on public.desafios;
drop policy if exists "desafios_admin_delete" on public.desafios;

-- Vê: oficial (todos) · o que eu criei · o que eu participo
create policy "desafios_read" on public.desafios for select using (
  modalidade = 'oficial'
  or author_id = auth.uid()
  or public.sou_participante(id)
);

-- Cria: qualquer um cria individual/amigos; oficial só admin
create policy "desafios_insert" on public.desafios for insert with check (
  author_id = auth.uid()
  and (modalidade in ('individual', 'amigos') or public.eh_admin())
);

-- Edita/apaga: o dono ou o admin
create policy "desafios_update" on public.desafios for update using (
  author_id = auth.uid() or public.eh_admin()
);
create policy "desafios_delete" on public.desafios for delete using (
  author_id = auth.uid() or public.eh_admin()
);


-- ── 4) RLS: participantes ────────────────────────────────────
drop policy if exists "part_read"        on public.desafio_participantes;
drop policy if exists "part_insert_own"  on public.desafio_participantes;
drop policy if exists "part_delete_own"  on public.desafio_participantes;

create policy "part_read" on public.desafio_participantes for select using (
  public.pode_ver_desafio(desafio_id)
);

-- Entra sozinho só em oficial ou no que ele mesmo criou.
-- Em 'amigos', entra APENAS pela função entrar_por_codigo (abaixo).
create policy "part_insert_own" on public.desafio_participantes for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.desafios d
    where d.id = desafio_id and (d.modalidade = 'oficial' or d.author_id = auth.uid())
  )
);

create policy "part_delete_own" on public.desafio_participantes for delete using (
  user_id = auth.uid()
);


-- ── 5) RLS: check-ins ────────────────────────────────────────
drop policy if exists "checkin_read"        on public.desafio_checkins;
drop policy if exists "checkin_insert_own"  on public.desafio_checkins;
drop policy if exists "checkin_delete_own"  on public.desafio_checkins;

create policy "checkin_read" on public.desafio_checkins for select using (
  public.pode_ver_desafio(desafio_id)
);
create policy "checkin_insert_own" on public.desafio_checkins for insert with check (
  user_id = auth.uid() and public.sou_participante(desafio_id)
);
create policy "checkin_delete_own" on public.desafio_checkins for delete using (
  user_id = auth.uid()
);


-- ── 6) Entrar por código (resolve o ovo-galinha) ─────────────
-- O amigo não pode VER o desafio antes de entrar. Esta função roda
-- como dono (ignora RLS), acha pelo código e insere a participação.
create or replace function public.entrar_por_codigo(p_codigo text, p_nome text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.desafios
   where codigo = upper(trim(p_codigo)) and modalidade = 'amigos';
  if v_id is null then
    raise exception 'Código inválido';
  end if;
  insert into public.desafio_participantes (desafio_id, user_id, nome)
  values (v_id, auth.uid(), p_nome)
  on conflict (desafio_id, user_id) do nothing;
  return v_id;
end;
$$;

grant execute on function public.entrar_por_codigo(text, text) to authenticated;
