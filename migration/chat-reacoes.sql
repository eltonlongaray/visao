-- ═══════════════════════════════════════════════════════════════
-- CURTIR E COMENTAR
-- ═══════════════════════════════════════════════════════════════
-- Regra que atravessa tudo aqui: quem pode LER a mensagem pode curtir e
-- comentar nela, e mais ninguém. Curtida e comentário não podem virar uma
-- porta lateral para ler ou escrever numa conversa privada alheia.
--
-- Os dois somem junto com a mensagem (on delete cascade): a mensagem dura
-- 7 dias, e comentário órfão de mensagem apagada não faz sentido nenhum.

-- ─── BLOCO 1: FUNÇÃO DE VISIBILIDADE ───────────────────────────
-- Uma só definição de "posso ver esta mensagem", usada por todas as policies
-- abaixo. Repetir a condição em cada uma seria convite a elas divergirem.
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
      and (
        m.escopo = 'comunidade'
        or m.autor_id = auth.uid()
        or m.para_id  = auth.uid()
      )
  );
$$;
grant execute on function public.posso_ver_mensagem(uuid) to authenticated;

-- ─── BLOCO 2: CURTIDAS ─────────────────────────────────────────
-- A chave primária composta é o que impede curtir duas vezes: não é regra
-- no aplicativo, é impossibilidade no banco.
create table if not exists public.chat_curtidas (
  mensagem_id uuid not null references public.chat_mensagens(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (mensagem_id, user_id)
);
alter table public.chat_curtidas enable row level security;

drop policy if exists curtidas_ler on public.chat_curtidas;
create policy curtidas_ler on public.chat_curtidas
  for select to authenticated
  using (public.posso_ver_mensagem(mensagem_id));

-- Só dá pra curtir em nome próprio.
drop policy if exists curtidas_criar on public.chat_curtidas;
create policy curtidas_criar on public.chat_curtidas
  for insert to authenticated
  with check (user_id = auth.uid() and public.posso_ver_mensagem(mensagem_id));

drop policy if exists curtidas_apagar on public.chat_curtidas;
create policy curtidas_apagar on public.chat_curtidas
  for delete to authenticated
  using (user_id = auth.uid());

-- ─── BLOCO 3: COMENTÁRIOS ──────────────────────────────────────
create table if not exists public.chat_comentarios (
  id          uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.chat_mensagens(id) on delete cascade,
  autor_id    uuid not null references auth.users(id) on delete cascade,
  autor_nome  text,
  texto       text not null check (char_length(btrim(texto)) between 1 and 600),
  created_at  timestamptz not null default now()
);
alter table public.chat_comentarios enable row level security;
create index if not exists idx_comentarios_msg on public.chat_comentarios(mensagem_id, created_at);

drop policy if exists comentarios_ler on public.chat_comentarios;
create policy comentarios_ler on public.chat_comentarios
  for select to authenticated
  using (public.posso_ver_mensagem(mensagem_id));

drop policy if exists comentarios_criar on public.chat_comentarios;
create policy comentarios_criar on public.chat_comentarios
  for insert to authenticated
  with check (autor_id = auth.uid() and public.posso_ver_mensagem(mensagem_id));

-- Apagar: o próprio autor, o dono da mensagem (é a "casa" dele) ou o admin.
-- Editar comentário não existe de propósito: comentário é curto e some em 7
-- dias junto da mensagem — editar depois de alguém responder confunde mais
-- do que resolve.
drop policy if exists comentarios_apagar on public.chat_comentarios;
create policy comentarios_apagar on public.chat_comentarios
  for delete to authenticated
  using (
    autor_id = auth.uid()
    or exists (select 1 from public.chat_mensagens m
               where m.id = mensagem_id and m.autor_id = auth.uid())
    or exists (select 1 from public.profiles p
               where p.user_id = auth.uid() and p.is_admin)
  );

-- ─── BLOCO 4: RESUMO PRA LISTA ─────────────────────────────────
-- Sem isto, desenhar 50 mensagens custaria 100 consultas (curtidas +
-- comentários de cada uma). Aqui sai tudo numa chamada só.
create or replace function public.resumo_reacoes(ids uuid[])
returns table (mensagem_id uuid, curtidas bigint, eu_curti boolean, comentarios bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         (select count(*) from public.chat_curtidas c where c.mensagem_id = m.id),
         exists (select 1 from public.chat_curtidas c
                 where c.mensagem_id = m.id and c.user_id = auth.uid()),
         (select count(*) from public.chat_comentarios k where k.mensagem_id = m.id)
  from public.chat_mensagens m
  where m.id = any(ids)
    and public.posso_ver_mensagem(m.id);
$$;
grant execute on function public.resumo_reacoes(uuid[]) to authenticated;

notify pgrst, 'reload schema';
