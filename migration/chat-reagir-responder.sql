-- ═══════════════════════════════════════════════════════════════
-- REAGIR COM EMOJI + RESPONDER MENSAGEM
-- ═══════════════════════════════════════════════════════════════
-- Substitui curtir/comentar. Num chat, responder já é o jeito de responder —
-- comentário criaria uma segunda via paralela para a mesma coisa, e a pessoa
-- teria que escolher qual usar toda vez.

-- ─── BLOCO 1: COMENTÁRIOS SAEM ─────────────────────────────────
-- Criada hoje, nunca usada. Tabela morta acumula e confunde quem ler o
-- schema depois.
drop table if exists public.chat_comentarios;

-- ─── BLOCO 2: CURTIDAS VIRAM REAÇÕES ───────────────────────────
-- A chave primária continua (mensagem_id, user_id): UMA reação por pessoa
-- por mensagem, como no WhatsApp. É isso que faz "👍3" significar "três
-- pessoas" — se cada um pudesse reagir com vários emojis, o número deixaria
-- de contar gente e passaria a contar toques.
alter table if exists public.chat_curtidas rename to chat_reacoes;
alter table public.chat_reacoes add column if not exists emoji text;
update public.chat_reacoes set emoji = '❤️' where emoji is null;
alter table public.chat_reacoes alter column emoji set not null;
alter table public.chat_reacoes drop constraint if exists chat_reacoes_emoji_tam;
alter table public.chat_reacoes add constraint chat_reacoes_emoji_tam
  check (char_length(emoji) between 1 and 12);

-- as policies seguem as antigas, só renomeadas junto da tabela
alter policy curtidas_ler    on public.chat_reacoes rename to reacoes_ler;
alter policy curtidas_criar  on public.chat_reacoes rename to reacoes_criar;
alter policy curtidas_apagar on public.chat_reacoes rename to reacoes_apagar;

-- Trocar de emoji é UPDATE, e faltava essa permissão: sem ela, mudar de 👍
-- para ❤️ exigiria apagar e recriar, e a reação piscaria pra todo mundo.
drop policy if exists reacoes_trocar on public.chat_reacoes;
create policy reacoes_trocar on public.chat_reacoes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── BLOCO 3: RESPONDER ────────────────────────────────────────
-- on delete set null: se a mensagem citada for apagada, a resposta continua
-- existindo — ela é fala de outra pessoa e não some por tabela.
alter table public.chat_mensagens
  add column if not exists responde_a uuid references public.chat_mensagens(id) on delete set null;

-- responde_a entra na lista de campos congelados na edição, junto de escopo,
-- destinatário, validade e imagem: editar é corrigir o texto, não mudar a
-- quem você estava respondendo.
create or replace function public.chat_so_edita_texto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo      is distinct from old.escopo
  or new.autor_id    is distinct from old.autor_id
  or new.para_id     is distinct from old.para_id
  or new.created_at  is distinct from old.created_at
  or new.expira_em   is distinct from old.expira_em
  or new.imagem_path is distinct from old.imagem_path
  or new.responde_a  is distinct from old.responde_a then
    raise exception 'Só o texto da mensagem pode ser editado';
  end if;
  new.editada_em := now();
  return new;
end $$;

-- ─── BLOCO 4: RESUMO PRA LISTA ─────────────────────────────────
-- Uma linha por emoji, com quantas pessoas e se eu sou uma delas.
drop function if exists public.resumo_reacoes(uuid[]);
create function public.resumo_reacoes(ids uuid[])
returns table (mensagem_id uuid, emoji text, total bigint, eu boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.mensagem_id, r.emoji, count(*),
         bool_or(r.user_id = auth.uid())
  from public.chat_reacoes r
  where r.mensagem_id = any(ids)
    and public.posso_ver_mensagem(r.mensagem_id)
  group by r.mensagem_id, r.emoji
  order by count(*) desc;
$$;
grant execute on function public.resumo_reacoes(uuid[]) to authenticated;

notify pgrst, 'reload schema';
