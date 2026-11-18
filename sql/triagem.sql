-- ═══════════════════════════════════════════════════════════════
-- TRIAGEM — formulário de entrada antes de agendar (/triagem/<slug>)
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez.
-- Precisa já ter rodado: agenda.sql, agenda-semanas.sql e ficha.sql.
--
-- A triagem fica na MESMA tabela da ficha (`fichas`), com modelo = 'triagem',
-- ligada ao cliente pelos dígitos do WhatsApp. Quem só fez a triagem e não
-- agendou aparece em 👥 Clientes como "Só triagem".
-- Dado de saúde: anon NUNCA lê a tabela, só envia pela função.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: FUNÇÃO — cliente envia a triagem ===
create or replace function triagem_enviar(
  p_slug text, p_nome text, p_contato text, p_respostas jsonb
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid; v_dig text; v_cod text;
begin
  select user_id into v_owner from agenda_config where slug = p_slug and ativo = true;
  if v_owner is null then raise exception 'Triagem indisponível'; end if;

  v_dig := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  if length(trim(coalesce(p_nome, ''))) < 2 or length(v_dig) < 10 then
    raise exception 'Informe nome e WhatsApp';
  end if;
  if octet_length(coalesce(p_respostas, '{}'::jsonb)::text) > 30000 then
    raise exception 'Triagem grande demais';
  end if;

  v_cod := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  insert into fichas (owner_id, codigo, modelo, cliente_nome, cliente_contato, cliente_digitos,
                      respostas, respondida_em, consentiu_em)
  values (v_owner, v_cod, 'triagem', left(trim(p_nome), 120), left(trim(p_contato), 40), v_dig,
          p_respostas, now(), now());

  return json_build_object('ok', true, 'codigo', v_cod, 'owner_id', v_owner);
end;
$$;
grant execute on function triagem_enviar(text, text, text, jsonb) to anon, authenticated;

-- Atualiza a MESMA triagem (pelo código devolvido no envio) quando a cliente escolhe
-- o que vai agendar e o que também interessa, na tela de resultado. Só triagem, só grava.
create or replace function triagem_atualizar(p_slug text, p_codigo text, p_respostas jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid;
begin
  if coalesce(p_codigo, '') = '' then return; end if;
  if octet_length(coalesce(p_respostas, '{}'::jsonb)::text) > 30000 then
    raise exception 'Triagem grande demais';
  end if;
  select user_id into v_owner from agenda_config where slug = p_slug;
  if v_owner is null then return; end if;
  update fichas set respostas = p_respostas
  where codigo = p_codigo and owner_id = v_owner and modelo = 'triagem'
    and created_at > now() - interval '2 days';
end;
$$;
grant execute on function triagem_atualizar(text, text, jsonb) to anon, authenticated;

-- === BLOCO 2: FUNÇÃO — agendar VÁRIOS serviços num horário só (durações e preços somados) ===
-- Usa o criar_agendamento normal (todas as validações de dia/horário) com o 1º serviço
-- e depois ajusta o registro pra soma: "Sessão para celulite + Drenagem linfática".
create or replace function criar_agendamento_combo(
  p_slug text, p_data date, p_hora text, p_nome text, p_contato text, p_servico_ids text[]
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_res json; v_owner uuid; v_servicos jsonb; v_dur_pad int;
  v_nomes text; v_preco numeric; v_dur int; v_qtd int;
begin
  if p_servico_ids is null or array_length(p_servico_ids, 1) is null then
    raise exception 'Escolha um serviço';
  end if;
  if array_length(p_servico_ids, 1) > 6 then raise exception 'Serviços demais'; end if;

  v_res := criar_agendamento(p_slug, p_data, p_hora, p_nome, p_contato, p_servico_ids[1]);
  if array_length(p_servico_ids, 1) = 1 then return v_res; end if;

  select user_id, coalesce(servicos, '[]'::jsonb), coalesce(duracao_min, 60)
    into v_owner, v_servicos, v_dur_pad
  from agenda_config where slug = p_slug;

  select string_agg(s->>'nome', ' + ' order by array_position(p_servico_ids, s->>'id')),
         sum(nullif(s->>'preco', '')::numeric),
         sum(coalesce(nullif(s->>'duracaoMin', '')::int, v_dur_pad)),
         count(*)
    into v_nomes, v_preco, v_dur, v_qtd
  from jsonb_array_elements(v_servicos) s
  where s->>'id' = any(p_servico_ids);

  if v_qtd > 1 then
    update agendamentos set servico = v_nomes, preco = v_preco, duracao_min = v_dur
    where owner_id = v_owner and data = p_data and hora = p_hora and status = 'confirmado';
  end if;
  return v_res;
end;
$$;
grant execute on function criar_agendamento_combo(text, date, text, text, text, text[]) to anon, authenticated;
