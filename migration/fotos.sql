-- ═══════════════════════════════════════════════════════════════
-- FOTO DE PERFIL — foto do Google + troca manual nos Ajustes
-- ═══════════════════════════════════════════════════════════════
-- Quem entra com Google já traz a foto em raw_user_meta_data. Ela é só
-- LIDA daqui: quem quiser outra sobe a própria, que é guardada no bucket
-- 'avatares' e apontada por profiles.foto_url — o override tem prioridade.

-- ─── BLOCO 1: COLUNA DO OVERRIDE ───────────────────────────────
alter table public.profiles add column if not exists foto_url text;

-- ─── BLOCO 2: FONTE ÚNICA DE NOME + FOTO ───────────────────────
-- Nome e foto de TODO MUNDO (inclusive de quem está chamando). O mural
-- precisa da minha também: minhas mensagens aparecem lá junto das outras.
-- security definer porque auth.users não é legível pelo cliente.
create or replace function public.perfis_do_chat()
returns table (user_id uuid, nome text, foto text)
language sql
security definer
set search_path = public
as $$
  select u.id,
         coalesce(
           nullif(btrim(p.preferred_name), ''),
           nullif(btrim(p.full_name), ''),
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
           'Falcão ' || left(u.id::text, 4)
         ) as nome,
         -- ordem importa: a escolha da pessoa vence a do Google.
         -- avatar_url é o campo do Google; picture é o do padrão OIDC.
         coalesce(
           nullif(btrim(p.foto_url), ''),
           nullif(btrim(u.raw_user_meta_data->>'avatar_url'), ''),
           nullif(btrim(u.raw_user_meta_data->>'picture'), '')
         ) as foto
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.deleted_at is null
  order by 2;
$$;
grant execute on function public.perfis_do_chat() to authenticated;

-- ─── BLOCO 3: MEMBROS E CONVERSAS AGORA DEVOLVEM FOTO ──────────
-- drop antes do create: 'create or replace' não muda a assinatura de
-- retorno de uma função, e aqui entra uma coluna nova.
drop function if exists public.membros_comunidade();
create function public.membros_comunidade()
returns table (user_id uuid, nome text, foto text)
language sql
security definer
set search_path = public
as $$
  select c.user_id, c.nome, c.foto
  from public.perfis_do_chat() c
  where c.user_id <> auth.uid()
  order by c.nome;
$$;
grant execute on function public.membros_comunidade() to authenticated;

drop function if exists public.minhas_conversas();
create function public.minhas_conversas()
returns table (outro_id uuid, nome text, foto text, ultima text, quando timestamptz, minha boolean)
language sql
security definer
set search_path = public
as $$
  with trocas as (
    select
      case when m.autor_id = auth.uid() then m.para_id else m.autor_id end as outro,
      m.texto, m.created_at, (m.autor_id = auth.uid()) as minha
    from public.chat_mensagens m
    where m.escopo = 'privado'
      and m.expira_em > now()
      and (m.autor_id = auth.uid() or m.para_id = auth.uid())
  ),
  ultima as (
    select distinct on (outro) outro, texto, created_at, minha
    from trocas
    order by outro, created_at desc
  )
  select u.outro, c.nome, c.foto, u.texto, u.created_at, u.minha
  from ultima u
  join public.perfis_do_chat() c on c.user_id = u.outro
  order by u.created_at desc;
$$;
grant execute on function public.minhas_conversas() to authenticated;

-- ─── BLOCO 4: BUCKET DAS FOTOS ─────────────────────────────────
-- public = true: a foto é lida por todo mundo no chat sem passar por
-- URL assinada. Não é dado sensível — é o que a pessoa escolheu mostrar.
-- 300 KB é folgado: o cliente redimensiona pra 256px antes de subir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 307200,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escrita só na PRÓPRIA pasta: o caminho é '{uid}/foto.jpg' e a primeira
-- pasta tem que bater com quem está autenticado. Sem isso qualquer um
-- sobrescreveria a foto de qualquer outro.
drop policy if exists avatares_leitura on storage.objects;
create policy avatares_leitura on storage.objects
  for select to public
  using (bucket_id = 'avatares');

drop policy if exists avatares_envio on storage.objects;
create policy avatares_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatares_troca on storage.objects;
create policy avatares_troca on storage.objects
  for update to authenticated
  using  (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatares_remocao on storage.objects;
create policy avatares_remocao on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
