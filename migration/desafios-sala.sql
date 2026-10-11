-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — SALA DO GRUPO (conversa dentro do desafio)
--
--   • A conversa do desafio usa a mesma tabela do chat (chat_mensagens),
--     com escopo = 'desafio' e desafio_id. Mesmo visual, áudio, foto,
--     reações e resposta do chat da Comunidade.
--   • Só quem está no desafio lê e escreve (mais o dono e o admin).
--   • Toda prova/check-in vira uma mensagem na sala SOZINHA (gatilho), com
--     o vídeo e o horário. Vale pelo app, pela sala e pelo Pet.
--   • Some em 7 dias, igual ao resto do chat (os vídeos também).
--
-- Rodar no Supabase → SQL Editor. Depende de chat*.sql, desafios-provas.sql.
-- Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: COLUNAS ──────────────────────────────────────────
alter table public.chat_mensagens add column if not exists desafio_id  uuid references public.desafios(id) on delete cascade;
alter table public.chat_mensagens add column if not exists checkin_id  uuid references public.desafio_checkins(id) on delete cascade;
alter table public.chat_mensagens add column if not exists prova_video text;
alter table public.chat_mensagens add column if not exists prova_print text;

create index if not exists chat_desafio_idx on public.chat_mensagens (desafio_id, created_at desc)
  where escopo = 'desafio';

-- ─── BLOCO 2: ESCOPO 'desafio' ─────────────────────────────────
alter table public.chat_mensagens drop constraint if exists chat_mensagens_escopo_check;
alter table public.chat_mensagens add constraint chat_mensagens_escopo_check
  check (escopo in ('comunidade', 'privado', 'desafio'));

alter table public.chat_mensagens drop constraint if exists chat_destino_coerente;
alter table public.chat_mensagens add constraint chat_destino_coerente check (
  (escopo = 'comunidade' and para_id is null and desafio_id is null) or
  (escopo = 'privado'    and para_id is not null and para_id <> autor_id and desafio_id is null) or
  (escopo = 'desafio'    and para_id is null and desafio_id is not null)
);

-- Mensagem da prova pode vir sem texto: o vídeo é o conteúdo
alter table public.chat_mensagens drop constraint if exists chat_conteudo_existe;
alter table public.chat_mensagens add constraint chat_conteudo_existe check (
  (texto is not null and char_length(btrim(texto)) between 1 and 2000)
  or imagem_path is not null
  or arquivo_path is not null
  or prova_video is not null
);

-- ─── BLOCO 3: QUEM VÊ ──────────────────────────────────────────
-- Uma regra só pra mensagem, foto, arquivo e reação: quem pode ler a
-- mensagem vê tudo que vem nela, e mais ninguém.
create or replace function public.chat_pode_ver(p_escopo text, p_autor uuid, p_para uuid, p_desafio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_escopo = 'comunidade'
      or p_autor = auth.uid()
      or p_para  = auth.uid()
      or (p_escopo = 'desafio' and (public.sou_participante(p_desafio)
                                    or public.sou_dono_desafio(p_desafio)
                                    or public.eh_admin()));
$$;
grant execute on function public.chat_pode_ver(text, uuid, uuid, uuid) to authenticated;

drop policy if exists chat_ler on public.chat_mensagens;
create policy chat_ler on public.chat_mensagens
  for select to authenticated
  using (expira_em > now() and public.chat_pode_ver(escopo, autor_id, para_id, desafio_id));

-- Escrever: em nome próprio; na sala do desafio, só quem está nele
drop policy if exists chat_escrever on public.chat_mensagens;
create policy chat_escrever on public.chat_mensagens
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and (escopo <> 'desafio' or public.sou_participante(desafio_id) or public.sou_dono_desafio(desafio_id))
  );

create or replace function public.posso_ver_mensagem(msg_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_mensagens m
    where m.id = msg_id
      and m.expira_em > now()
      and public.chat_pode_ver(m.escopo, m.autor_id, m.para_id, m.desafio_id)
  );
$$;
grant execute on function public.posso_ver_mensagem(uuid) to authenticated;

drop policy if exists chatfotos_leitura on storage.objects;
create policy chatfotos_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-fotos'
    and exists (
      select 1 from public.chat_mensagens m
      where m.imagem_path = storage.objects.name
        and m.expira_em > now()
        and public.chat_pode_ver(m.escopo, m.autor_id, m.para_id, m.desafio_id)
    )
  );

drop policy if exists chatarq_leitura on storage.objects;
create policy chatarq_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-arquivos'
    and exists (
      select 1 from public.chat_mensagens m
      where m.arquivo_path = storage.objects.name
        and m.expira_em > now()
        and public.chat_pode_ver(m.escopo, m.autor_id, m.para_id, m.desafio_id)
    )
  );

-- ─── BLOCO 4: EDIÇÃO SÓ DO TEXTO ───────────────────────────────
create or replace function public.chat_so_edita_texto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo       is distinct from old.escopo
  or new.autor_id     is distinct from old.autor_id
  or new.para_id      is distinct from old.para_id
  or new.desafio_id   is distinct from old.desafio_id
  or new.checkin_id   is distinct from old.checkin_id
  or new.prova_video  is distinct from old.prova_video
  or new.prova_print  is distinct from old.prova_print
  or new.created_at   is distinct from old.created_at
  or new.expira_em    is distinct from old.expira_em
  or new.imagem_path  is distinct from old.imagem_path
  or new.responde_a   is distinct from old.responde_a
  or new.arquivo_path is distinct from old.arquivo_path then
    raise exception 'Só o texto da mensagem pode ser editado';
  end if;
  new.editada_em := now();
  return new;
end $$;

-- ─── BLOCO 5: A PROVA VIRA MENSAGEM NA SALA ────────────────────
-- Depois de cada check-in (pela tela, pela sala ou pelo Pet), posta na sala
-- quem fez, o quê, o vídeo e o horário. Apagar o check-in apaga a mensagem.
create or replace function public.desafio_checkin_na_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.desafios;
  nome text;
  txt text;
  un text;
begin
  select * into d from public.desafios where id = new.desafio_id;
  if not found then return new; end if;
  select coalesce(nullif(btrim(p.nome), ''), 'Falcão') into nome
    from public.desafio_participantes p
   where p.desafio_id = new.desafio_id and p.user_id = new.user_id
   limit 1;
  un := coalesce(nullif(btrim(d.unidade), ''), '');

  if d.tipo = 'largar' then
    txt := case when new.quantidade > 0 then '✅ Consegui hoje' else '😔 Hoje não consegui' end
           || case when new.video_path is not null then ' · depoimento' else '' end;
  elsif new.exercicio = 'Corrida' or d.prova = 'strava' then
    txt := '🏃 Corrida' || case when new.exercicio is null and new.quantidade > 0 then ' · ' || new.quantidade || coalesce(' ' || nullif(un, ''), '') else '' end;
  elsif new.exercicio is not null then
    txt := '🏋️ ' || new.exercicio;
  elsif d.prova = 'depoimento' then
    txt := '🎙️ Depoimento' || case when d.meta_diaria is not null then ' · ' || new.quantidade || coalesce(' ' || nullif(un, ''), '') else '' end;
  elsif d.meta_diaria is not null then
    txt := (case when new.video_path is not null then '🎥 ' else '✅ ' end) || '+' || new.quantidade || coalesce(' ' || nullif(un, ''), '');
  else
    txt := (case when new.video_path is not null then '🎥 ' else '✅ ' end) || 'Feito hoje';
  end if;

  insert into public.chat_mensagens (escopo, desafio_id, autor_id, autor_nome, texto, checkin_id, prova_video, prova_print, created_at)
  values ('desafio', new.desafio_id, new.user_id, coalesce(nome, 'Falcão'), txt, new.id, new.video_path, new.print_path, new.created_at);
  return new;
end $$;

drop trigger if exists desafio_checkin_na_sala on public.desafio_checkins;
create trigger desafio_checkin_na_sala
  after insert on public.desafio_checkins
  for each row execute function public.desafio_checkin_na_sala();

notify pgrst, 'reload schema';
