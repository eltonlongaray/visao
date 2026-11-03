-- ════════════════════════════════════════════════════════════════
-- MENTOR NO DESAFIO (Élton, 03/11/2026)
-- Quem cria o desafio pode escolher ser só o MENTOR: não faz os exercícios,
-- não manda prova, não entra no ranking nem na prenda. Ele fica no grupo
-- (vê a sala, as provas e o andamento de cada aluno) pra acompanhar se cada
-- um está cumprindo o desafio. Serve pra 1 aluno ou pra vários.
-- Pode rodar mais de uma vez.
-- ════════════════════════════════════════════════════════════════

-- ─── BLOCO 1: PAPEL DE QUEM ESTÁ NO DESAFIO ─────────────────────
alter table public.desafio_participantes
  add column if not exists papel text not null default 'participante';
alter table public.desafio_participantes drop constraint if exists desafio_participantes_papel_check;
alter table public.desafio_participantes
  add constraint desafio_participantes_papel_check check (papel in ('participante', 'mentor'));

-- ─── BLOCO 2: SÓ O CRIADOR PODE SER MENTOR ──────────────────────
create or replace function public.desafio_mentor_confere()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.papel = 'mentor' and not exists (
       select 1 from public.desafios d where d.id = new.desafio_id and d.author_id = new.user_id) then
    raise exception 'Só quem criou o desafio pode ser o mentor';
  end if;
  return new;
end $$;

drop trigger if exists desafio_mentor_confere on public.desafio_participantes;
create trigger desafio_mentor_confere
  before insert or update of papel on public.desafio_participantes
  for each row execute function public.desafio_mentor_confere();

-- ─── BLOCO 3: MENTOR NÃO MANDA PROVA ────────────────────────────
create or replace function public.desafio_checkin_mentor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.desafio_participantes p
              where p.desafio_id = new.desafio_id and p.user_id = new.user_id and p.papel = 'mentor') then
    raise exception 'Tu é o mentor desse desafio: só acompanha, não manda prova';
  end if;
  return new;
end $$;

drop trigger if exists desafio_checkin_mentor on public.desafio_checkins;
create trigger desafio_checkin_mentor
  before insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_mentor();

-- Confere: deve mostrar a coluna papel
select column_name, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'desafio_participantes' and column_name = 'papel';
