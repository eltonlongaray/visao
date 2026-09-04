-- ═══════════════════════════════════════════════════════════════
-- FALCON RIFA — SELF-SERVICE (qualquer usuário cria a própria rifa)
-- Rode UMA VEZ no Supabase (SQL Editor). É idempotente (pode re-rodar).
--
-- O que entra:
--  • Colunas ricas em `rifas` (história, prêmios, Pix do criador, sorteio ao vivo)
--  • rifa_publica() devolvendo tudo que o link precisa (incl. Pix e sorteio)
--  • RLS pro DONO gerir SÓ as próprias rifas + ver quem pegou cada número
--  • sortear_rifa() / resetar_sorteio() pro sorteio ao vivo
-- ═══════════════════════════════════════════════════════════════

-- ── 1) COLUNAS ricas na rifa ────────────────────────────────────
alter table rifas add column if not exists subtitulo      text;
alter table rifas add column if not exists descricao       text;
alter table rifas add column if not exists valor_numero    numeric;      -- R$ por número
alter table rifas add column if not exists valor_meta      numeric;      -- meta (opcional)
alter table rifas add column if not exists data_sorteio    date;         -- (legado) só data
alter table rifas add column if not exists sorteio_em      timestamptz;  -- data+hora do sorteio AO VIVO
alter table rifas add column if not exists sorteio_status  text default 'agendado';  -- agendado | ao_vivo | encerrado
alter table rifas add column if not exists numero_sorteado int;          -- (legado, 1 ganhador)
alter table rifas add column if not exists ganhador_nome   text;          -- (legado)
alter table rifas add column if not exists ganhador_contato text;         -- (legado)
-- Resultados do sorteio: 1 por prêmio → [{ordem, premio, numero, nome, contato}]
alter table rifas add column if not exists sorteados       jsonb default '[]'::jsonb;
alter table rifas add column if not exists whatsapp        text;         -- WhatsApp do criador
alter table rifas add column if not exists premios         jsonb default '[]'::jsonb;
alter table rifas add column if not exists pix_chave       text;         -- chave Pix do CRIADOR
alter table rifas add column if not exists pix_nome        text;         -- nome no Pix
alter table rifas add column if not exists pix_cidade      text;         -- cidade no Pix
alter table rifas add column if not exists pix_modo        text default 'estatico';  -- estatico (chave do criador) | mp (Mercado Pago do Elton)

-- A rifa do Pitter é a especial (Pix automático pelo TEU Mercado Pago).
update rifas set pix_modo = 'mp' where slug = 'pitter';

-- Deixa a rifa do Pitter no comando do Elton (pra gerir/sortear pelo app).
update rifas set owner_id = u.id from auth.users u
  where rifas.slug = 'pitter' and u.email = 'elton.longaray483@gmail.com' and rifas.owner_id is null;

-- ── 2) DADOS PÚBLICOS (o link lê isto) ─────────────────────────
create or replace function rifa_publica(p_slug text)
returns json language sql security definer stable as $$
  select json_build_object(
    'slug', slug, 'titulo', titulo, 'subtitulo', subtitulo, 'descricao', descricao,
    'total_numeros', total_numeros, 'valor_numero', valor_numero, 'valor_meta', valor_meta,
    'data_sorteio', data_sorteio, 'sorteio_em', sorteio_em, 'sorteio_status', sorteio_status,
    'sorteados', coalesce(sorteados, '[]'::jsonb),
    'whatsapp', whatsapp, 'premios', coalesce(premios, '[]'::jsonb),
    'pix_chave', pix_chave, 'pix_nome', pix_nome, 'pix_cidade', pix_cidade, 'pix_modo', pix_modo,
    'ativo', ativo
  )
  from rifas where slug = p_slug and ativo = true;
$$;
grant execute on function rifa_publica(text) to anon, authenticated;

-- ── 3) RLS: o DONO gere só as PRÓPRIAS rifas ───────────────────
alter table rifas enable row level security;
alter table rifa_numeros enable row level security;

drop policy if exists rifas_dono_all on rifas;
create policy rifas_dono_all on rifas for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Dono vê/edita/apaga os números (participantes) das próprias rifas.
drop policy if exists rifa_numeros_dono on rifa_numeros;
create policy rifa_numeros_dono on rifa_numeros for all to authenticated
  using (exists (select 1 from rifas r where r.id = rifa_numeros.rifa_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from rifas r where r.id = rifa_numeros.rifa_id and r.owner_id = auth.uid()));

-- ── 4) SORTEIO AO VIVO — 1 sorteio POR PRÊMIO ──────────────────
-- Sorteia o prêmio de ordem p_ordem (1..N). p_numero null = aleatório entre os
-- VENDIDOS que ainda não ganharam; senão usa o número dado (ex.: Loteria Federal).
-- Nunca repete um número já sorteado. Encerra quando todos os prêmios saíram.
create or replace function sortear_premio(p_slug text, p_ordem int, p_numero int default null)
returns json language plpgsql security definer as $$
declare v_rifa uuid; v_owner uuid; v_total int; v_premios jsonb; v_sorteados jsonb;
        v_qtd int; v_num int; v_nome text; v_contato text; v_premio text; v_usados int[];
begin
  select id, owner_id, total_numeros, coalesce(premios, '[]'::jsonb), coalesce(sorteados, '[]'::jsonb)
    into v_rifa, v_owner, v_total, v_premios, v_sorteados from rifas where slug = p_slug;
  if v_rifa is null then raise exception 'Rifa não encontrada'; end if;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'Sem permissão'; end if;

  v_qtd := greatest(jsonb_array_length(v_premios), 1);   -- sem prêmios → 1 sorteio
  if p_ordem < 1 or p_ordem > v_qtd then raise exception 'Prêmio inválido'; end if;
  v_premio := coalesce(v_premios->>(p_ordem - 1), 'Prêmio ' || p_ordem);

  -- números que já ganharam (não repetir)
  select coalesce(array_agg((e->>'numero')::int), '{}') into v_usados
    from jsonb_array_elements(v_sorteados) e;

  if p_numero is null then
    select numero into v_num from rifa_numeros
      where rifa_id = v_rifa and not (numero = any(v_usados))
      order by random() limit 1;
    if v_num is null then raise exception 'Sem números disponíveis pra sortear'; end if;
  else
    if p_numero < 1 or p_numero > v_total then raise exception 'Número fora do intervalo'; end if;
    if p_numero = any(v_usados) then raise exception 'Esse número já foi sorteado em outro prêmio'; end if;
    v_num := p_numero;
  end if;

  select nome, contato into v_nome, v_contato
    from rifa_numeros where rifa_id = v_rifa and numero = v_num limit 1;

  -- substitui o resultado desta ordem (se refez) e adiciona o novo
  v_sorteados := (select coalesce(jsonb_agg(e), '[]'::jsonb)
    from jsonb_array_elements(v_sorteados) e where (e->>'ordem')::int <> p_ordem);
  v_sorteados := v_sorteados || jsonb_build_object(
    'ordem', p_ordem, 'premio', v_premio, 'numero', v_num, 'nome', v_nome, 'contato', v_contato);

  update rifas set sorteados = v_sorteados,
    sorteio_status = case when jsonb_array_length(v_sorteados) >= v_qtd then 'encerrado' else 'ao_vivo' end
    where id = v_rifa;

  return json_build_object('ok', true, 'ordem', p_ordem, 'premio', v_premio,
    'numero', v_num, 'ganhador', v_nome, 'contato', v_contato,
    'sorteados', v_sorteados, 'total_premios', v_qtd);
end; $$;
grant execute on function sortear_premio(text, int, int) to authenticated;

-- Muda o status do sorteio. 'agendado' também ZERA os resultados (refazer tudo).
create or replace function definir_status_sorteio(p_slug text, p_status text)
returns json language plpgsql security definer as $$
declare v_rifa uuid; v_owner uuid;
begin
  select id, owner_id into v_rifa, v_owner from rifas where slug = p_slug;
  if v_rifa is null then raise exception 'Rifa não encontrada'; end if;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'Sem permissão'; end if;
  if p_status not in ('agendado', 'ao_vivo', 'encerrado') then raise exception 'Status inválido'; end if;
  if p_status = 'agendado' then
    update rifas set sorteio_status = 'agendado', sorteados = '[]'::jsonb,
      numero_sorteado = null, ganhador_nome = null, ganhador_contato = null where id = v_rifa;
  else
    update rifas set sorteio_status = p_status where id = v_rifa;
  end if;
  return json_build_object('ok', true);
end; $$;
grant execute on function definir_status_sorteio(text, text) to authenticated;
