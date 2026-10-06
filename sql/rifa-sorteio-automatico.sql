-- ═══════════════════════════════════════════════════════════════
-- Rifa: 1 PESSOA = 1 PRÊMIO + SORTEIO AUTOMÁTICO + VENDAS FECHADAS (05/10/2026)
-- • Mesma pessoa = mesmo nome (sem maiúscula/acento) OU mesmos 8 últimos dígitos
--   do WhatsApp (pega 9 faltando e +55). Caso real: "Maria da graça 51991044390"
--   e "Maria da Graça 5191044390" ganharam 2 prêmios — não pode.
-- • Sorteio (manual 🎲 e automático) pula quem já ganhou e prefere números PAGOS
--   (se ninguém foi marcado como pago, vale qualquer número reservado).
-- • Vendas fecham no horário do sorteio (trigger: vale pro Pix e pro Mercado Pago).
-- • Se o dono não sortear até 30 min depois, o sistema sorteia o que falta.
-- ═══════════════════════════════════════════════════════════════

-- ── 0) Mesma pessoa? ─────────────────────────────────────────────
create or replace function rifa_norm_nome(t text) returns text language sql immutable as $$
  select nullif(regexp_replace(
    translate(lower(trim(coalesce(t, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '\s+', ' ', 'g'), '')
$$;
create or replace function rifa_norm_fone(t text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8
    then right(regexp_replace(t, '\D', '', 'g'), 8) end
$$;
create or replace function rifa_mesma_pessoa(an text, ac text, bn text, bc text)
returns boolean language sql immutable as $$
  select coalesce((rifa_norm_nome(an) is not null and rifa_norm_nome(an) = rifa_norm_nome(bn))
      or (rifa_norm_fone(ac) is not null and rifa_norm_fone(ac) = rifa_norm_fone(bc)), false)
$$;

-- ── 1) Sorteio manual (dono) com a regra da pessoa ───────────────
create or replace function sortear_premio(p_slug text, p_ordem int, p_numero int default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_rifa uuid; v_owner uuid; v_total int; v_premios jsonb; v_sorteados jsonb; v_outros jsonb;
        v_qtd int; v_num int; v_nome text; v_contato text; v_premio text; v_usados int[];
        v_tem_pago boolean; v_conflito int;
begin
  select id, owner_id, total_numeros, coalesce(premios, '[]'::jsonb), coalesce(sorteados, '[]'::jsonb)
    into v_rifa, v_owner, v_total, v_premios, v_sorteados from rifas where slug = p_slug for update;
  if v_rifa is null then raise exception 'Rifa não encontrada'; end if;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'Sem permissão'; end if;

  v_qtd := greatest(jsonb_array_length(v_premios), 1);
  if p_ordem < 1 or p_ordem > v_qtd then raise exception 'Prêmio inválido'; end if;
  v_premio := coalesce(v_premios->>(p_ordem - 1), 'Prêmio ' || p_ordem);

  -- ganhadores dos OUTROS prêmios (este pode estar sendo refeito)
  v_outros := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_sorteados) e
               where (e->>'ordem')::int <> p_ordem);
  -- números que já saíram (inclui o resultado antigo deste prêmio: refazer tira outro número)
  select coalesce(array_agg((e->>'numero')::int), '{}') into v_usados from jsonb_array_elements(v_sorteados) e;
  select exists(select 1 from rifa_numeros where rifa_id = v_rifa and pago) into v_tem_pago;

  if p_numero is null then
    select n.numero into v_num from rifa_numeros n
      where n.rifa_id = v_rifa and not (n.numero = any(v_usados))
        and (not v_tem_pago or n.pago)
        and not exists (select 1 from jsonb_array_elements(v_outros) w
                        where rifa_mesma_pessoa(n.nome, n.contato, w->>'nome', w->>'contato'))
      order by random() limit 1;
    if v_num is null then raise exception 'Não sobrou número de outra pessoa pra sortear'; end if;
  else
    if p_numero < 1 or p_numero > v_total then raise exception 'Número fora do intervalo'; end if;
    if p_numero = any(v_usados) then raise exception 'Esse número já foi sorteado em outro prêmio'; end if;
    v_num := p_numero;
  end if;

  select nome, contato into v_nome, v_contato from rifa_numeros where rifa_id = v_rifa and numero = v_num limit 1;

  if v_nome is not null then
    select (w->>'ordem')::int into v_conflito from jsonb_array_elements(v_outros) w
      where rifa_mesma_pessoa(v_nome, v_contato, w->>'nome', w->>'contato') limit 1;
    if v_conflito is not null then
      raise exception 'Essa pessoa já ganhou o %º prêmio — uma pessoa não ganha dois.', v_conflito;
    end if;
  end if;

  v_sorteados := v_outros || jsonb_build_object(
    'ordem', p_ordem, 'premio', v_premio, 'numero', v_num, 'nome', v_nome, 'contato', v_contato);

  update rifas set sorteados = v_sorteados,
    sorteio_status = case when jsonb_array_length(v_sorteados) >= v_qtd then 'encerrado' else 'ao_vivo' end
    where id = v_rifa;

  return json_build_object('ok', true, 'ordem', p_ordem, 'premio', v_premio,
    'numero', v_num, 'ganhador', v_nome, 'contato', v_contato,
    'sorteados', v_sorteados, 'total_premios', v_qtd);
end; $$;
grant execute on function sortear_premio(text, int, int) to authenticated;

-- ── 2) Vendas fechadas depois do horário ─────────────────────────
create or replace function rifa_bloqueia_apos_sorteio()
returns trigger language plpgsql as $$
declare v_em timestamptz; v_status text; v_qtd int;
begin
  select sorteio_em, sorteio_status, coalesce(jsonb_array_length(sorteados), 0)
    into v_em, v_status, v_qtd from rifas where id = new.rifa_id;
  if v_status = 'encerrado' or v_qtd > 0 or (v_em is not null and now() >= v_em) then
    raise exception 'As vendas desta rifa encerraram: chegou a hora do sorteio.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_rifa_bloqueia_apos_sorteio on rifa_numeros;
create trigger trg_rifa_bloqueia_apos_sorteio
  before insert on rifa_numeros
  for each row execute function rifa_bloqueia_apos_sorteio();

-- ── 3) Sorteio automático de UMA rifa (a página pública pede) ────
create or replace function sortear_automatico(p_slug text)
returns json language plpgsql security definer set search_path = public as $$
declare r rifas%rowtype; v_qtd int; v_sorteados jsonb; v_usados int[];
        v_num int; v_nome text; v_contato text; v_premio text;
        v_tem_pago boolean; i int; v_feitos int := 0;
begin
  select * into r from rifas where slug = p_slug for update;   -- 2 visitas juntas não sorteiam 2x
  if r.id is null then return json_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  if r.sorteio_em is null or now() < r.sorteio_em + interval '30 minutes' then
    return json_build_object('ok', false, 'motivo', 'ainda_nao');
  end if;
  if r.sorteio_status = 'encerrado' then return json_build_object('ok', false, 'motivo', 'ja_encerrado'); end if;

  v_qtd := greatest(jsonb_array_length(coalesce(r.premios, '[]'::jsonb)), 1);
  v_sorteados := coalesce(r.sorteados, '[]'::jsonb);
  select exists(select 1 from rifa_numeros where rifa_id = r.id and pago) into v_tem_pago;

  for i in 1..v_qtd loop
    continue when exists(select 1 from jsonb_array_elements(v_sorteados) e where (e->>'ordem')::int = i);
    select coalesce(array_agg((e->>'numero')::int), '{}') into v_usados from jsonb_array_elements(v_sorteados) e;
    v_num := null;
    select n.numero, n.nome, n.contato into v_num, v_nome, v_contato from rifa_numeros n
      where n.rifa_id = r.id and not (n.numero = any(v_usados)) and (not v_tem_pago or n.pago)
        and not exists (select 1 from jsonb_array_elements(v_sorteados) w
                        where rifa_mesma_pessoa(n.nome, n.contato, w->>'nome', w->>'contato'))
      order by random() limit 1;
    exit when v_num is null;   -- acabaram as pessoas/números
    v_premio := coalesce(r.premios->>(i - 1), 'Prêmio ' || i);
    v_sorteados := v_sorteados || jsonb_build_object(
      'ordem', i, 'premio', v_premio, 'numero', v_num, 'nome', v_nome, 'contato', v_contato, 'auto', true);
    v_feitos := v_feitos + 1;
  end loop;

  update rifas set sorteados = v_sorteados, sorteio_status = 'encerrado' where id = r.id;
  return json_build_object('ok', true, 'sorteados_agora', v_feitos);
end; $$;
grant execute on function sortear_automatico(text) to anon, authenticated;

-- ── 4) Todas as rifas vencidas (pro agendador do banco, opcional) ─
create or replace function sortear_automatico_vencidas()
returns int language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select slug from rifas
    where sorteio_em is not null and now() >= sorteio_em + interval '30 minutes'
      and coalesce(sorteio_status, 'agendado') <> 'encerrado'
  loop
    perform sortear_automatico(s.slug); n := n + 1;
  end loop;
  return n;
end; $$;
