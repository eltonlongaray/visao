-- ═══════════════════════════════════════════════════════════════
-- FALCON RIFA — tabelas + funções públicas (rode uma vez no Supabase)
-- Link público: estilo-falcon.web.app/rifa/<slug>
-- ═══════════════════════════════════════════════════════════════

create table if not exists rifas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  slug text unique not null,
  titulo text not null default 'Falcon Rifa',
  total_numeros int not null default 342,
  ativo boolean not null default true,
  created_at timestamptz default now()
);
create table if not exists rifa_numeros (
  id uuid primary key default gen_random_uuid(),
  rifa_id uuid not null references rifas(id) on delete cascade,
  numero int not null,
  nome text not null,
  contato text,
  created_at timestamptz default now(),
  unique(rifa_id, numero)
);
alter table rifas enable row level security;
alter table rifa_numeros enable row level security;

-- Rifa inicial do Elton (link: /rifa/rifa1)
insert into rifas (slug, titulo, total_numeros)
  values ('rifa1', 'Falcon Rifa', 342)
  on conflict (slug) do nothing;

-- Dados públicos da rifa
create or replace function rifa_publica(p_slug text)
returns json language sql security definer stable as $$
  select json_build_object('slug', slug, 'titulo', titulo, 'total_numeros', total_numeros, 'ativo', ativo)
  from rifas where slug = p_slug and ativo = true;
$$;
grant execute on function rifa_publica(text) to anon, authenticated;

-- Números já escolhidos
create or replace function rifa_ocupados(p_slug text)
returns int[] language sql security definer stable as $$
  select coalesce(array_agg(n.numero order by n.numero), '{}')
  from rifa_numeros n join rifas r on r.id = n.rifa_id
  where r.slug = p_slug;
$$;
grant execute on function rifa_ocupados(text) to anon, authenticated;

-- Escolher um número (nome + WhatsApp)
create or replace function escolher_numero(p_slug text, p_numero int, p_nome text, p_contato text)
returns json language plpgsql security definer as $$
declare v_rifa uuid; v_total int;
begin
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'Informe seu nome'; end if;
  select id, total_numeros into v_rifa, v_total from rifas where slug = p_slug and ativo = true;
  if v_rifa is null then raise exception 'Rifa indisponível'; end if;
  if p_numero < 1 or p_numero > v_total then raise exception 'Número inválido'; end if;
  insert into rifa_numeros (rifa_id, numero, nome, contato)
    values (v_rifa, p_numero, trim(p_nome), nullif(trim(p_contato), ''));
  return json_build_object('ok', true);
exception when unique_violation then raise exception 'Esse número já foi escolhido. Escolha outro.';
end; $$;
grant execute on function escolher_numero(text, int, text, text) to anon, authenticated;
