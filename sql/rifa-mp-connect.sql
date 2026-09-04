-- ═══════════════════════════════════════════════════════════════
-- FALCON RIFA — MERCADO PAGO CONNECT (cada criador recebe na conta dela)
-- Rode UMA VEZ no Supabase (SQL Editor). Idempotente.
--
-- O criador conecta o Mercado Pago DELE uma vez (OAuth). Guardamos o token
-- SÓ no servidor (a Edge Function usa a service role). O app NUNCA lê o token
-- — só sabe se está conectado (via minha_mp_conta).
-- ═══════════════════════════════════════════════════════════════

-- Tokens do Mercado Pago de cada criador (SEGREDO — só a service role acessa).
create table if not exists mp_contas (
  user_id       uuid primary key,
  mp_user_id    text,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table mp_contas enable row level security;
-- SEM policies de propósito: nenhum cliente lê/escreve. Só a Edge Function (service role).

-- Estado temporário do OAuth (anti-CSRF): liga o "state" ao usuário que iniciou.
create table if not exists mp_oauth_state (
  state      text primary key,
  user_id    uuid not null,
  created_at timestamptz default now()
);
alter table mp_oauth_state enable row level security;
-- SEM policies: só a Edge Function (service role).

-- O app pergunta só se está conectado (NUNCA devolve o token).
create or replace function minha_mp_conta()
returns json language sql security definer stable as $$
  select json_build_object(
    'connected', exists (select 1 from mp_contas where user_id = auth.uid()),
    'mp_user_id', (select mp_user_id from mp_contas where user_id = auth.uid())
  );
$$;
grant execute on function minha_mp_conta() to authenticated;

-- Desconectar o Mercado Pago (apaga o token do criador).
create or replace function desconectar_mp()
returns json language plpgsql security definer as $$
begin
  delete from mp_contas where user_id = auth.uid();
  return json_build_object('ok', true);
end; $$;
grant execute on function desconectar_mp() to authenticated;

-- Limpa states de OAuth velhos (higiene; opcional).
delete from mp_oauth_state where created_at < now() - interval '1 day';
