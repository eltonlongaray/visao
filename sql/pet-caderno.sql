-- ════════════════════════════════════════════════════════════════
-- Caderno de estudo do Pet (FIAP Fase 6, cap. 6 — dados pra IA)
-- Rodar no SQL Editor do Supabase. Depende de sql/pet-diario.sql.
-- Pode rodar de novo sem problema.
--
-- O que é: as frases que o Pet não entendeu (vindas do Diário) viram um
-- conjunto organizado: cada frase com a resposta CERTA que o Pet devia dar,
-- a data em que entrou e a versão do caderno. A cada revisão semanal o
-- caderno fecha uma VERSÃO nova e o Pet faz a "prova" com ele: dá pra ver,
-- versão a versão, se ele melhorou ou piorou.
--
-- Privacidade:
--   • Sem user_id, nome ou e-mail de quem falou (igual ao Diário).
--   • Número comprido, e-mail, @perfil e link viram [numero]/[email]/[perfil]/[link]
--     aqui no banco, antes de gravar.
--   • Transcrição de vídeo só entra com o aceite da pessoa (consentimento).
--   • Ninguém lê a tabela direto (RLS sem policy): só a revisão semanal, com a
--     chave de leitura do Diário. A frase NUNCA vai pro GitHub (repo público):
--     o teste no GitHub só mostra os totais.
--   • Teto: 5000 frases (as mais antigas saem).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.pet_caderno (
  id            bigserial primary key,
  texto         text not null,
  chave         text not null unique,            -- frase normalizada (sem repetida)
  esperado      jsonb not null,                  -- {"acao":"agendar","titulo":"academia",...}
  origem        text not null default 'diario' check (origem in ('diario', 'transcricao')),
  consentimento boolean not null default false,
  entrou_em     timestamptz not null default now(),
  versao        int,                             -- versão em que entrou no caderno
  ultimo_ok     boolean,                         -- última prova: acertou?
  ultima_resp   jsonb,                           -- última prova: o que o Pet respondeu
  constraint pet_caderno_transcricao_aceite check (origem <> 'transcricao' or consentimento)
);
alter table public.pet_caderno enable row level security;

create table if not exists public.pet_caderno_versoes (
  versao     serial primary key,
  criada_em  timestamptz not null default now(),
  frases     int not null default 0,            -- quantas o caderno tinha
  provadas   int not null default 0,            -- quantas entraram na prova
  certas     int not null default 0,
  por_acao   jsonb not null default '{}'::jsonb, -- {"agendar":{"ok":3,"total":4}}
  nota       text
);
alter table public.pet_caderno_versoes enable row level security;

-- Tira dado pessoal óbvio do texto
create or replace function public.pet_caderno_limpar(p text)
returns text language sql immutable as $$
  select left(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(p, ''), 'https?://\S+', '[link]', 'gi'),
             '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[email]', 'g'),
           '(^|\s)@[[:alnum:]_.]+', '\1[perfil]', 'g'),
         '\d[\d .()/-]{6,}\d', '[numero]', 'g')), 300);
$$;

create or replace function public._pet_caderno_chave_ok(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from pet_diario_config where chave_leitura = p_chave);
$$;
revoke all on function public._pet_caderno_chave_ok(text) from public, anon, authenticated;

-- Revisão semanal: põe frases no caderno
-- p_itens = [{"texto": "...", "esperado": {...}, "origem": "diario", "consentimento": false}]
create or replace function public.pet_caderno_adicionar(p_chave text, p_itens jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare it jsonb; t text; n int := 0;
begin
  if not _pet_caderno_chave_ok(p_chave) then raise exception 'chave inválida'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    t := pet_caderno_limpar(it->>'texto');
    if length(t) < 3 or jsonb_typeof(it->'esperado') <> 'object' then continue; end if;
    -- transcrição só com o aceite da pessoa
    if coalesce(it->>'origem', 'diario') = 'transcricao' and not coalesce((it->>'consentimento')::boolean, false) then continue; end if;
    insert into pet_caderno (texto, chave, esperado, origem, consentimento)
    values (t, lower(t), it->'esperado', coalesce(it->>'origem', 'diario'), coalesce((it->>'consentimento')::boolean, false))
    on conflict (chave) do update set esperado = excluded.esperado;
    n := n + 1;
  end loop;
  delete from pet_caderno where id in (select id from pet_caderno order by entrou_em desc offset 5000);
  return n;
end $$;

-- Revisão semanal e prova: lê o caderno
create or replace function public.pet_caderno_ler(p_chave text)
returns setof public.pet_caderno language plpgsql security definer set search_path = public as $$
begin
  if not _pet_caderno_chave_ok(p_chave) then raise exception 'chave inválida'; end if;
  return query select * from pet_caderno order by entrou_em desc;
end $$;

-- Prova: guarda o resultado de cada frase
-- p_res = [{"id": 1, "ok": true, "resp": {...}}]
create or replace function public.pet_caderno_resultado(p_chave text, p_res jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not _pet_caderno_chave_ok(p_chave) then raise exception 'chave inválida'; end if;
  update pet_caderno c set ultimo_ok = (r->>'ok')::boolean, ultima_resp = r->'resp'
    from jsonb_array_elements(coalesce(p_res, '[]'::jsonb)) r
   where c.id = (r->>'id')::bigint;
  get diagnostics n = row_count;
  return n;
end $$;

-- Prova: fecha uma versão nova (as frases sem versão passam a ser dela)
create or replace function public.pet_caderno_fechar_versao(p_chave text, p_provadas int, p_certas int, p_por_acao jsonb, p_nota text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not _pet_caderno_chave_ok(p_chave) then raise exception 'chave inválida'; end if;
  insert into pet_caderno_versoes (frases, provadas, certas, por_acao, nota)
  values ((select count(*) from pet_caderno), coalesce(p_provadas, 0), coalesce(p_certas, 0),
          coalesce(p_por_acao, '{}'::jsonb), left(p_nota, 300))
  returning versao into v;
  update pet_caderno set versao = v where versao is null;
  return v;
end $$;

-- Admin (no app, pelo Pet): a evolução das versões, SEM as frases
create or replace function public.pet_caderno_evolucao()
returns setof public.pet_caderno_versoes language plpgsql security definer stable set search_path = public as $$
begin
  if not coalesce(public.eh_admin(), false) then return; end if;
  return query select * from pet_caderno_versoes order by versao desc limit 20;
end $$;

revoke all on function public.pet_caderno_adicionar(text, jsonb) from public;
revoke all on function public.pet_caderno_ler(text) from public;
revoke all on function public.pet_caderno_resultado(text, jsonb) from public;
revoke all on function public.pet_caderno_fechar_versao(text, int, int, jsonb, text) from public;
revoke all on function public.pet_caderno_evolucao() from public, anon;
grant execute on function public.pet_caderno_adicionar(text, jsonb) to anon, authenticated;
grant execute on function public.pet_caderno_ler(text) to anon, authenticated;
grant execute on function public.pet_caderno_resultado(text, jsonb) to anon, authenticated;
grant execute on function public.pet_caderno_fechar_versao(text, int, int, jsonb, text) to anon, authenticated;
grant execute on function public.pet_caderno_evolucao() to authenticated;

notify pgrst, 'reload schema';
