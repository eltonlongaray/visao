-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — a regra trava na PRIMEIRA PROVA (não na data de início)
--   Com gente no desafio, dá pra mudar a regra (com o aceite de todos) até
--   alguém mandar a primeira prova. Depois disso, trava de vez.
-- Rodar no Supabase → SQL Editor, depois de desafios-propostas.sql.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.desafio_tem_prova(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.desafio_checkins c where c.desafio_id = d_id);
$$;

create or replace function public.desafio_proposta_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if public.desafio_tem_prova(new.desafio_id) then
    raise exception 'Já mandaram prova no desafio: as regras não mudam mais';
  end if;
  -- Só colunas da regra
  for k in select jsonb_object_keys(new.mudancas) loop
    if not (k = any(public.desafio_colunas_regra())) then
      raise exception 'Isso não pode mudar por proposta: %', k;
    end if;
  end loop;
  if new.mudancas = '{}'::jsonb then raise exception 'Nada mudou'; end if;

  new.status := 'aberta';
  new.expira_em := now() + interval '48 hours';
  new.decidida_em := null;
  new.created_at := now();

  -- Proposta vencida não segura a fila
  update public.desafio_propostas set status = 'expirada', decidida_em = now()
   where desafio_id = new.desafio_id and status = 'aberta' and expira_em <= now();
  return new;
end $$;

create or replace function public.desafio_proposta_voto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.desafio_propostas;
  faltam int;
  nome text;
begin
  select * into pr from public.desafio_propostas where id = new.proposta_id for update;
  if pr.status <> 'aberta' or pr.expira_em <= now() then
    raise exception 'Essa proposta já foi encerrada';
  end if;
  if public.desafio_tem_prova(pr.desafio_id) then
    raise exception 'Já mandaram prova no desafio: as regras não mudam mais';
  end if;
  select coalesce(nullif(btrim(p.nome), ''), 'Falcão') into nome
    from public.desafio_participantes p where p.desafio_id = pr.desafio_id and p.user_id = new.user_id limit 1;

  if not new.aceito then
    update public.desafio_propostas set status = 'recusada', decidida_em = now() where id = pr.id;
    perform public.desafio_aviso_no_grupo(pr.desafio_id,
      '❌ A proposta de mudança não passou: ' || coalesce(nome, 'alguém') || ' não aceitou. As regras continuam as mesmas.');
    return new;
  end if;

  select count(*) into faltam
    from public.desafio_participantes p
   where p.desafio_id = pr.desafio_id and p.user_id <> pr.autor_id
     and not exists (select 1 from public.desafio_proposta_votos v
                      where v.proposta_id = pr.id and v.user_id = p.user_id and v.aceito)
     and p.user_id <> new.user_id;
  if faltam = 0 then
    perform public.desafio_aplicar_proposta(pr.id);
    update public.desafio_propostas set status = 'aprovada', decidida_em = now() where id = pr.id;
    perform public.desafio_aviso_no_grupo(pr.desafio_id,
      '✅ Todo mundo aceitou! As regras novas já valem. Confere em 📜 Regras.');
  end if;
  return new;
end $$;

create or replace function public.desafio_regra_trancada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  mudou boolean := false;
begin
  if old.modalidade <> 'amigos' or not public.desafio_tem_gente(old.id) then
    return new;
  end if;
  foreach k in array public.desafio_colunas_regra() loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then mudou := true; end if;
  end loop;
  if not mudou then return new; end if;
  if public.desafio_tem_prova(old.id) then
    raise exception 'Já mandaram prova no desafio: as regras não mudam mais';
  end if;
  if coalesce(current_setting('falcon.proposta', true), 'off') <> 'on' then
    raise exception 'Já tem gente no desafio: a mudança vai pro grupo aprovar';
  end if;
  return new;
end $$;

drop function if exists public.desafio_comecou(public.desafios);
drop function if exists public.desafio_primeiro_dia(public.desafios);

notify pgrst, 'reload schema';
