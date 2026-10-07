-- ════════════════════════════════════════════════════════════════
-- Diário do Pet: frases que o Pet não soube atender (pra virar função nova)
-- Rodar UMA vez no SQL Editor do Supabase.
--
-- Privacidade: guarda SÓ o texto da frase. Sem user_id, nome ou e-mail.
-- Espaço: frase repetida só soma "vezes" (não cria linha nova) e o banco
--         mantém no máximo as 2000 frases mais recentes (~600 KB no pior caso).
--         Quando a função é criada, a frase é apagada (pet_diario_apagar).
-- Acesso: ninguém lê nem escreve a tabela direto (RLS sem policy).
--   • app (usuário logado) → só ANOTA, pela função pet_diario_anotar
--   • revisão semanal      → lê e apaga com a chave de leitura
-- ════════════════════════════════════════════════════════════════

create table if not exists public.pet_diario (
  id          bigserial primary key,
  texto       text not null,
  chave       text not null unique,          -- frase normalizada (evita repetida)
  motivo      text not null,                 -- nao_sei_fazer | nao_entendi | nenhuma
  vezes       int  not null default 1,
  primeiro_em timestamptz not null default now(),
  ultimo_em   timestamptz not null default now()
);
alter table public.pet_diario enable row level security;

create table if not exists public.pet_diario_config (chave_leitura text not null);
alter table public.pet_diario_config enable row level security;
insert into public.pet_diario_config (chave_leitura)
select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.pet_diario_config);

-- App: anota uma frase (só usuário logado)
create or replace function public.pet_diario_anotar(p_texto text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t text := left(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), 300);
begin
  if auth.uid() is null or length(t) < 3 then return; end if;
  if p_motivo not in ('nao_sei_fazer', 'nao_entendi', 'nenhuma') then return; end if;
  insert into pet_diario (texto, chave, motivo) values (t, lower(t), p_motivo)
  on conflict (chave) do update set vezes = pet_diario.vezes + 1, ultimo_em = now(), motivo = excluded.motivo;
  delete from pet_diario where id in (select id from pet_diario order by ultimo_em desc offset 2000);
end $$;
revoke all on function public.pet_diario_anotar(text, text) from public, anon;
grant execute on function public.pet_diario_anotar(text, text) to authenticated;

-- Revisão semanal: lê tudo (precisa da chave de leitura)
create or replace function public.pet_diario_ler(p_chave text)
returns setof public.pet_diario language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pet_diario_config where chave_leitura = p_chave) then
    raise exception 'chave inválida';
  end if;
  return query select * from pet_diario order by vezes desc, ultimo_em desc;
end $$;

-- Revisão semanal: apaga as frases já resolvidas (precisa da chave de leitura)
create or replace function public.pet_diario_apagar(p_chave text, p_ids bigint[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from pet_diario_config where chave_leitura = p_chave) then
    raise exception 'chave inválida';
  end if;
  delete from pet_diario where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.pet_diario_ler(text) from public;
revoke all on function public.pet_diario_apagar(text, bigint[]) from public;
grant execute on function public.pet_diario_ler(text) to anon, authenticated;
grant execute on function public.pet_diario_apagar(text, bigint[]) to anon, authenticated;

-- Pra ver a chave de leitura (vai nos segredos do ambiente do Claude, não no código):
-- select chave_leitura from public.pet_diario_config;
