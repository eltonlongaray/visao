-- ═══════════════════════════════════════════════════════════════
-- FALCON · CHAT DA COMUNIDADE
-- Duas modalidades numa tabela só:
--   escopo='comunidade' → mural, todo mundo lê e escreve
--   escopo='privado'    → só o autor e o destinatário leem
-- Mensagens são TEMPORÁRIAS: expiram em 7 dias.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: TABELA ───────────────────────────────────────────
create table if not exists public.chat_mensagens (
  id          uuid primary key default gen_random_uuid(),
  escopo      text not null check (escopo in ('comunidade','privado')),
  autor_id    uuid not null references auth.users(id) on delete cascade,
  autor_nome  text,
  para_id     uuid references auth.users(id) on delete cascade,
  texto       text not null check (char_length(btrim(texto)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  expira_em   timestamptz not null default (now() + interval '7 days'),

  -- mural não tem destinatário; privado exige um, e não pode ser você mesmo
  constraint chat_destino_coerente check (
    (escopo = 'comunidade' and para_id is null) or
    (escopo = 'privado'    and para_id is not null and para_id <> autor_id)
  )
);

create index if not exists chat_mural_idx   on public.chat_mensagens (escopo, created_at desc)
  where escopo = 'comunidade';
create index if not exists chat_privado_idx on public.chat_mensagens (autor_id, para_id, created_at desc)
  where escopo = 'privado';
create index if not exists chat_expira_idx  on public.chat_mensagens (expira_em);

-- ─── BLOCO 2: RLS ──────────────────────────────────────────────
-- Sem política de UPDATE de propósito: mensagem de chat não se edita.
alter table public.chat_mensagens enable row level security;

drop policy if exists chat_ler      on public.chat_mensagens;
drop policy if exists chat_escrever on public.chat_mensagens;
drop policy if exists chat_apagar   on public.chat_mensagens;

-- LER: mural é aberto; privado só para os dois lados da conversa.
-- O filtro de expiração entra AQUI: mensagem vencida some mesmo que a
-- faxina ainda não tenha rodado.
create policy chat_ler on public.chat_mensagens
  for select to authenticated
  using (
    expira_em > now()
    and (
      escopo = 'comunidade'
      or autor_id = auth.uid()
      or para_id  = auth.uid()
    )
  );

-- ESCREVER: só em nome próprio.
create policy chat_escrever on public.chat_mensagens
  for insert to authenticated
  with check (autor_id = auth.uid());

-- APAGAR: só as suas.
create policy chat_apagar on public.chat_mensagens
  for delete to authenticated
  using (autor_id = auth.uid());

-- ─── BLOCO 3: FAXINA ───────────────────────────────────────────
-- Remove o que já venceu. O cliente chama de vez em quando; se houver
-- pg_cron disponível, dá pra agendar (linha comentada no fim).
create or replace function public.limpar_chat_expirado()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.chat_mensagens where expira_em <= now();
$$;
grant execute on function public.limpar_chat_expirado() to authenticated;

-- ─── BLOCO 4: LISTA DE MEMBROS ─────────────────────────────────
-- TODOS os usuários da plataforma, não só quem preencheu o perfil.
-- Parte de auth.users e faz LEFT JOIN em profiles: quem nunca salvou nome
-- simplesmente não tem linha em profiles e sumiria da lista se a consulta
-- saísse de lá.
--
-- Devolve SOMENTE id e nome de exibição — nunca e-mail, telefone ou
-- aniversário. É SECURITY DEFINER porque o RLS de profiles (corretamente)
-- não deixa um usuário ler a linha de outro.
--
-- Sem nome salvo, o apelido vira "Falcão a1b2" com 4 dígitos do id: não
-- expõe nada e ainda assim dá pra distinguir duas pessoas na lista.
create or replace function public.membros_comunidade()
returns table (user_id uuid, nome text)
language sql
security definer
set search_path = public
as $$
  select u.id,
         coalesce(
           nullif(btrim(p.preferred_name), ''),
           nullif(btrim(p.full_name), ''),
           'Falcão ' || left(u.id::text, 4)
         ) as nome
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id <> auth.uid()
    and u.deleted_at is null
  order by 2;
$$;
grant execute on function public.membros_comunidade() to authenticated;

-- ─── BLOCO 5: CONVERSAS ABERTAS ────────────────────────────────
-- Com quem eu já troquei mensagem, com a última de cada um.
create or replace function public.minhas_conversas()
returns table (outro_id uuid, nome text, ultima text, quando timestamptz, minha boolean)
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
  select u.outro,
         coalesce(
           nullif(btrim(p.preferred_name), ''),
           nullif(btrim(p.full_name), ''),
           'Falcão ' || left(u.outro::text, 4)
         ),
         u.texto, u.created_at, u.minha
  from ultima u
  left join public.profiles p on p.user_id = u.outro
  order by u.created_at desc;
$$;
grant execute on function public.minhas_conversas() to authenticated;

-- ─── OPCIONAL: faxina automática (só se pg_cron estiver habilitado) ───
-- select cron.schedule('faxina-chat', '0 4 * * *', 'select public.limpar_chat_expirado()');

-- ─── AVISA O POSTGREST ─────────────────────────────────────────
-- Sem isto a API pode seguir respondendo
--   "Could not find the table 'public.chat_mensagens' in the schema cache"
-- por alguns minutos depois de criar a tabela, porque o cache de schema
-- ainda é o antigo. Esta linha força a releitura na hora.
notify pgrst, 'reload schema';
