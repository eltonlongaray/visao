-- ═══════════════════════════════════════════════════════════════
-- MENTORIA — inscritas e alunas (Ferramentas → 💸 Fontes de renda extra → 🎓 Mentoria)
-- Rodar no Supabase do Falcon → SQL Editor. Seguro rodar mais de uma vez.
-- Precisa já ter rodado: agenda.sql (usa agenda_config.slug pra achar a dona).
--
-- Uma linha por PESSOA (ligada pelos dígitos do WhatsApp). Os formulários públicos
-- (/pesquisa/<slug> e /selecao/<slug>) e a reserva de vaga gravam pelas funções abaixo;
-- quem não deixou WhatsApp na pesquisa vira uma linha sem contato (só conta nas respostas).
-- anon NUNCA lê a tabela, só envia pelas funções.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: TABELA ===
create table if not exists mentoria_leads (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  nome          text,
  contato       text,
  digitos       text,
  instagram     text,
  formularios   jsonb not null default '{}'::jsonb,   -- { pesquisa:{...,_em}, selecao:{...,_em} }
  selecionada   boolean not null default false,
  compareceu    boolean,                               -- foi à aula/workshop (null = não marcado)
  reservou_em   timestamptz,
  reserva_forma text,                                  -- pix | cartao
  pago_em       timestamptz,                           -- pagou = virou ALUNA
  nao_agora     boolean not null default false,
  turma         int,
  presenca      jsonb not null default '{}'::jsonb,    -- { "1": true, "2": false, ... } por aula
  followup      jsonb not null default '{}'::jsonb,    -- { chave_da_mensagem: data_do_envio }
  notas         text,
  origem        text                                   -- pesquisa | selecao | reserva | castelo | manual
);
create index if not exists mentoria_leads_owner on mentoria_leads (owner_id, created_at desc);
create index if not exists mentoria_leads_dig on mentoria_leads (owner_id, digitos);

alter table mentoria_leads enable row level security;
drop policy if exists "dona le" on mentoria_leads;
create policy "dona le" on mentoria_leads for select to authenticated using (owner_id = auth.uid());
drop policy if exists "dona muda" on mentoria_leads;
create policy "dona muda" on mentoria_leads for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "dona cria" on mentoria_leads;
create policy "dona cria" on mentoria_leads for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "dona apaga" on mentoria_leads;
create policy "dona apaga" on mentoria_leads for delete to authenticated using (owner_id = auth.uid());

-- === BLOCO 2: FUNÇÃO — formulário público envia (pesquisa ou seleção) ===
-- Mesma pessoa (mesmo WhatsApp) respondendo os dois formulários = MESMA linha.
create or replace function mentoria_enviar(
  p_slug text, p_form text, p_nome text, p_contato text, p_instagram text, p_respostas jsonb
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid; v_dig text; v_id uuid; v_resp jsonb;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null then raise exception 'Formulário indisponível'; end if;
  if p_form not in ('pesquisa', 'selecao') then raise exception 'Formulário inválido'; end if;
  if octet_length(coalesce(p_respostas, '{}'::jsonb)::text) > 30000 then
    raise exception 'Respostas grandes demais';
  end if;

  v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  if length(v_dig) > 11 and left(v_dig, 2) = '55' then v_dig := substr(v_dig, 3); end if;
  if length(trim(coalesce(p_nome, ''))) < 2 or length(v_dig) < 10 then
    raise exception 'Informe nome e WhatsApp';
  end if;
  v_resp := coalesce(p_respostas, '{}'::jsonb) || jsonb_build_object('_em', now());

  if length(v_dig) >= 10 then
    select id into v_id from mentoria_leads where owner_id = v_owner
      and left(digitos, 2) = left(v_dig, 2) and right(digitos, 8) = right(v_dig, 8)   -- mesmo DDD + 8 finais (com ou sem o 9)
    order by created_at limit 1;
  end if;

  if v_id is not null then
    update mentoria_leads set
      nome = coalesce(nullif(left(trim(p_nome), 120), ''), nome),
      contato = coalesce(nullif(left(trim(p_contato), 40), ''), contato),
      instagram = coalesce(nullif(left(trim(p_instagram), 60), ''), instagram),
      formularios = formularios || jsonb_build_object(p_form, v_resp),
      updated_at = now()
    where id = v_id;
  else
    insert into mentoria_leads (owner_id, nome, contato, digitos, instagram, formularios, origem)
    values (v_owner, nullif(left(trim(coalesce(p_nome, '')), 120), ''), nullif(left(trim(coalesce(p_contato, '')), 40), ''),
            nullif(v_dig, ''), nullif(left(trim(coalesce(p_instagram, '')), 60), ''),
            jsonb_build_object(p_form, v_resp), p_form)
    returning id into v_id;
  end if;
  return json_build_object('ok', true);
end;
$$;
grant execute on function mentoria_enviar(text, text, text, text, text, jsonb) to anon, authenticated;

-- === BLOCO 3: FUNÇÃO — reserva de vaga (página de vendas da mentoria) ===
create or replace function mentoria_reservar(p_slug text, p_nome text, p_contato text, p_forma text)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_dig text; v_id uuid;
begin
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null then raise exception 'Página indisponível'; end if;
  v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  if length(v_dig) > 11 and left(v_dig, 2) = '55' then v_dig := substr(v_dig, 3); end if;
  if length(trim(coalesce(p_nome, ''))) < 2 or length(v_dig) < 10 then raise exception 'Informe nome e WhatsApp'; end if;

  select id into v_id from mentoria_leads where owner_id = v_owner
      and left(digitos, 2) = left(v_dig, 2) and right(digitos, 8) = right(v_dig, 8)   -- mesmo DDD + 8 finais (com ou sem o 9)
    order by created_at limit 1;
  if v_id is not null then
    update mentoria_leads set reservou_em = coalesce(reservou_em, now()),
      reserva_forma = left(coalesce(p_forma, ''), 20), nao_agora = false, updated_at = now()
    where id = v_id;
  else
    insert into mentoria_leads (owner_id, nome, contato, digitos, reservou_em, reserva_forma, origem)
    values (v_owner, left(trim(p_nome), 120), left(trim(p_contato), 40), v_dig, now(), left(coalesce(p_forma, ''), 20), 'reserva');
  end if;
  return json_build_object('ok', true);
end;
$$;
grant execute on function mentoria_reservar(text, text, text, text) to anon, authenticated;

-- === BLOCO 4: FUNÇÃO — quantas já pagaram (a página só vê o número, nunca os nomes) ===
create or replace function mentoria_pagas(p_slug text) returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from mentoria_leads l join agenda_config c on c.user_id = l.owner_id
  where c.slug = p_slug and l.pago_em is not null
$$;
grant execute on function mentoria_pagas(text) to anon, authenticated;
