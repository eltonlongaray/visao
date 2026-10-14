-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — MURAL DAS PRENDAS
--
--   • Quem não concluiu um desafio com prenda grava a prenda em vídeo ao
--     vivo (câmera do Falcon) e ela vai pro MURAL DAS PRENDAS.
--   • O mural aparece pra TODO MUNDO do app (não só pro grupo) por 7 dias.
--     Depois some sozinho. (Élton, 13/10.)
--   • Sem download: o app não mostra o botão de baixar (não dá pra impedir
--     print de tela, isso nenhum app consegue).
--   • Quem entra no desafio é avisado disso antes (convite, regras, entrar).
--   • Uma prenda por pessoa por desafio. Admin pode tirar do ar.
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-provas.sql e
-- desafios-modalidades.sql. Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: TABELA ───────────────────────────────────────────
create table if not exists public.desafio_prendas (
  id          uuid primary key default gen_random_uuid(),
  desafio_id  uuid not null references public.desafios(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  nome        text,                 -- como a pessoa aparece no desafio
  titulo      text,                 -- nome do desafio (cópia, pro mural)
  prenda      text,                 -- a prenda combinada (cópia)
  video_path  text not null,        -- bucket desafio-provas: uid/prenda-...
  created_at  timestamptz not null default now(),
  expira_em   timestamptz not null default now() + interval '7 days',
  unique (desafio_id, user_id)
);
create index if not exists desafio_prendas_expira on public.desafio_prendas (expira_em desc);

alter table public.desafio_prendas enable row level security;

-- ─── BLOCO 2: QUEM VÊ / QUEM MANDA ─────────────────────────────
-- Todo mundo logado vê o mural enquanto não venceu (a pessoa vê a própria
-- sempre, pro app saber que ela já pagou)
drop policy if exists prendas_ler on public.desafio_prendas;
create policy prendas_ler on public.desafio_prendas
  for select to authenticated
  using (expira_em > now() or user_id = auth.uid());

-- Só a própria prenda, de um desafio em que está, com vídeo na própria pasta
drop policy if exists prendas_criar on public.desafio_prendas;
create policy prendas_criar on public.desafio_prendas
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.sou_participante(desafio_id)
    and video_path like auth.uid()::text || '/prenda-%'
  );

-- Tirar do ar: só admin
drop policy if exists prendas_apagar on public.desafio_prendas;
create policy prendas_apagar on public.desafio_prendas
  for delete to authenticated
  using (public.eh_admin());

grant select, insert, delete on public.desafio_prendas to authenticated;

-- ─── BLOCO 3: PREENCHE O RESTO SOZINHO ─────────────────────────
-- Nome, título e prenda vêm do banco (ninguém escreve a prenda dos outros),
-- e os 7 dias contam do envio.
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
                               where p.desafio_id = d.id and p.user_id = auth.uid() limit 1), 'Falcão');
  new.created_at := now();
  new.expira_em  := now() + interval '7 days';
  return new;
end $$;

drop trigger if exists desafio_prenda_nova on public.desafio_prendas;
create trigger desafio_prenda_nova before insert on public.desafio_prendas
  for each row execute function public.desafio_prenda_nova();

-- ─── BLOCO 4: VÍDEO DA PRENDA NO BUCKET ────────────────────────
-- O vídeo da prenda fica no mesmo bucket privado das provas; quem lê é
-- qualquer pessoa logada, enquanto a prenda está no mural.
drop policy if exists prendas_video_leitura on storage.objects;
create policy prendas_video_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'desafio-provas'
    and exists (
      select 1 from public.desafio_prendas p
      where p.video_path = storage.objects.name and p.expira_em > now()
    )
  );

-- ─── BLOCO 5: VER A PRENDA ANTES DE ENTRAR PELO CÓDIGO ─────────
-- Quem tem o código ainda não vê o desafio (RLS). Esta função mostra só o
-- nome e a prenda, pra pessoa topar (ou não) antes de entrar.
create or replace function public.desafio_previa_codigo(p_codigo text)
returns table (titulo text, prenda text)
language sql security definer stable
set search_path = public as $$
  select d.titulo, d.prenda from public.desafios d
   where d.codigo = upper(trim(p_codigo)) and d.modalidade = 'amigos'
   limit 1;
$$;
grant execute on function public.desafio_previa_codigo(text) to authenticated;

notify pgrst, 'reload schema';
