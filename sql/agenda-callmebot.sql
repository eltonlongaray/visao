-- ═══════════════════════════════════════════════════════════════
-- Notificação de agendamento no WhatsApp do profissional (CallMeBot)
-- A apikey vive numa tabela À PARTE com RLS FECHADA — nunca no agenda_config
-- (que é lido pelo cliente). Só o dono grava; só o service role (Edge Function)
-- lê a chave pra enviar.
-- ═══════════════════════════════════════════════════════════════

create table if not exists agenda_notify (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  callmebot_apikey text,
  updated_at       timestamptz default now()
);

alter table agenda_notify enable row level security;

-- O dono lê/escreve só a própria linha. (O service role da Edge Function
-- ignora RLS e lê a chave pra enviar.)
drop policy if exists agenda_notify_own on agenda_notify;
create policy agenda_notify_own on agenda_notify
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Dono grava a apikey (vazio = limpa).
create or replace function set_callmebot_apikey(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into agenda_notify (user_id, callmebot_apikey, updated_at)
  values (auth.uid(), nullif(btrim(p_key), ''), now())
  on conflict (user_id)
  do update set callmebot_apikey = excluded.callmebot_apikey, updated_at = now();
end;
$$;

-- Dono consulta SE já configurou (não devolve a chave).
create or replace function tenho_callmebot()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from agenda_notify
    where user_id = auth.uid()
      and coalesce(btrim(callmebot_apikey), '') <> ''
  );
$$;

grant execute on function set_callmebot_apikey(text) to authenticated;
grant execute on function tenho_callmebot() to authenticated;
