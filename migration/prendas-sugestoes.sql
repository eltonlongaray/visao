-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — SUGESTÕES DE PRENDA DOS USUÁRIOS (Élton, 14/10)
--
--   • Qualquer pessoa sugere uma prenda. Quem aprova é o APP, não o Élton:
--     a IA confere contra as regras antes de mandar, e o banco confere de
--     novo (tamanho, palavras proibidas, no máx. 5 por dia).
--   • Aprovada = aparece pra todo mundo e entra na lista do formulário.
--   • 👍 curtir sobe a sugestão; 🚩 denunciar: com 3 denúncias some sozinha.
--   • Admin pode apagar qualquer uma; quem sugeriu pode apagar a sua.
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-modalidades.sql
-- (eh_admin). Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: TABELAS ──────────────────────────────────────────
create table if not exists public.prenda_sugestoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  nome        text,
  texto       text not null,
  curtidas    int  not null default 0,
  denuncias   int  not null default 0,
  oculta      boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists prenda_sugestoes_texto on public.prenda_sugestoes (lower(texto));

create table if not exists public.prenda_sugestao_votos (
  sugestao_id uuid not null references public.prenda_sugestoes(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  tipo        text not null check (tipo in ('curtir', 'denunciar')),
  primary key (sugestao_id, user_id, tipo)
);

alter table public.prenda_sugestoes enable row level security;
alter table public.prenda_sugestao_votos enable row level security;

-- ─── BLOCO 2: QUEM VÊ / QUEM MANDA ─────────────────────────────
drop policy if exists sug_ler on public.prenda_sugestoes;
create policy sug_ler on public.prenda_sugestoes for select to authenticated
  using (not oculta or user_id = auth.uid() or public.eh_admin());

drop policy if exists sug_criar on public.prenda_sugestoes;
create policy sug_criar on public.prenda_sugestoes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists sug_apagar on public.prenda_sugestoes;
create policy sug_apagar on public.prenda_sugestoes for delete to authenticated
  using (user_id = auth.uid() or public.eh_admin());

grant select, insert, delete on public.prenda_sugestoes to authenticated;

drop policy if exists sugv_ler on public.prenda_sugestao_votos;
create policy sugv_ler on public.prenda_sugestao_votos for select to authenticated
  using (user_id = auth.uid());
drop policy if exists sugv_criar on public.prenda_sugestao_votos;
create policy sugv_criar on public.prenda_sugestao_votos for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists sugv_apagar on public.prenda_sugestao_votos;
create policy sugv_apagar on public.prenda_sugestao_votos for delete to authenticated
  using (user_id = auth.uid());
grant select, insert, delete on public.prenda_sugestao_votos to authenticated;

-- ─── BLOCO 3: O BANCO CONFERE DE NOVO ──────────────────────────
-- Mesma lista do app (js/prendas-sugestoes.js PROIBIDAS). Sem acento.
create or replace function public.prenda_sugestao_nova()
returns trigger language plpgsql security definer
set search_path = public as $$
declare t text;
begin
  new.user_id    := auth.uid();
  new.texto      := regexp_replace(trim(new.texto), '\s+', ' ', 'g');
  new.nome       := left(coalesce(nullif(trim(new.nome), ''), 'Falcão'), 40);
  new.curtidas   := 0;
  new.denuncias  := 0;
  new.oculta     := false;
  new.created_at := now();
  if length(new.texto) < 8 then raise exception 'Escreve um pouco mais a prenda (mín. 8 letras)'; end if;
  if length(new.texto) > 120 then raise exception 'Prenda grande demais (máx. 120 letras)'; end if;
  t := lower(translate(new.texto, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'));
  if t ~ '\m(nud|pelad|sem roupa|cueca|calcinha|sutia|seios?\M|peito de fora|bunda de fora|sexo|sexual|transa|beij[ao] na boca|porno|strip|cachaca|vodka|tequila|droga|maconha|cocaina|cigarro|furt|roub|pich|vandal|armas?\M|facas?\M|fogo\M|queima|bater em|tapas?\M|socos?\M|agred|estranh|desconhecid|na rua|no shopping|no onibus|em publico|xing|ofend|humilh|racis|macaco|viad|bicha|gord[oa]s?\M)'
  then raise exception 'Essa prenda não passa nas regras do Falcon'; end if;
  if (select count(*) from public.prenda_sugestoes
       where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5
  then raise exception 'Tu já sugeriu 5 hoje. Amanhã tem mais 🦅'; end if;
  return new;
end $$;

drop trigger if exists prenda_sugestao_nova on public.prenda_sugestoes;
create trigger prenda_sugestao_nova before insert on public.prenda_sugestoes
  for each row execute function public.prenda_sugestao_nova();

-- ─── BLOCO 4: CURTIDAS E DENÚNCIAS ─────────────────────────────
-- Conta sozinho; 3 denúncias = some do app (admin ainda vê)
create or replace function public.prenda_sugestao_voto()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v record; d int;
begin
  v := coalesce(new, old);
  d := case when tg_op = 'INSERT' then 1 else -1 end;
  if v.tipo = 'curtir' then
    update public.prenda_sugestoes set curtidas = greatest(curtidas + d, 0) where id = v.sugestao_id;
  else
    update public.prenda_sugestoes set denuncias = greatest(denuncias + d, 0),
      oculta = greatest(denuncias + d, 0) >= 3 where id = v.sugestao_id;
  end if;
  return null;
end $$;

drop trigger if exists prenda_sugestao_voto on public.prenda_sugestao_votos;
create trigger prenda_sugestao_voto after insert or delete on public.prenda_sugestao_votos
  for each row execute function public.prenda_sugestao_voto();

notify pgrst, 'reload schema';
