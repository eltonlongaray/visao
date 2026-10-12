-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — MUDAR A REGRA SÓ COM O ACEITE DO GRUPO
--
--   • Desafio de amigos com gente dentro: o dono não muda mais a regra
--     direto. Ele manda uma PROPOSTA DE MUDANÇA, que aparece no grupo.
--   • Cada participante responde ✅ Aceito ou ❌ Não aceito.
--   • Só vale se TODO MUNDO aceitar. Um "não" derruba a proposta.
--     Sem resposta de todos em 48h, ela cai sozinha.
--   • Aprovada, a mudança entra no desafio na hora e o grupo é avisado.
--   • Uma proposta aberta por vez em cada desafio.
--   • Mudar só ANTES DE COMEÇAR. Depois que o desafio começou (data de
--     início, ou a criação quando não tem data), com gente dentro, a regra
--     trava de vez: nem proposta.
--
-- Rodar no Supabase → SQL Editor. Depende de desafios-sala.sql e
-- desafios-corrida-semana.sql. Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

-- ─── BLOCO 1: TABELAS ──────────────────────────────────────────
create table if not exists public.desafio_propostas (
  id          uuid primary key default gen_random_uuid(),
  desafio_id  uuid not null references public.desafios(id) on delete cascade,
  autor_id    uuid not null default auth.uid(),
  mudancas    jsonb not null,                 -- { coluna: valor novo }
  resumo      text[] not null default '{}',   -- linhas "Prenda: X → Y" (pra mostrar)
  status      text not null default 'aberta'
              check (status in ('aberta', 'aprovada', 'recusada', 'expirada', 'cancelada')),
  expira_em   timestamptz not null default now() + interval '48 hours',
  decidida_em timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists desafio_propostas_uma_aberta
  on public.desafio_propostas (desafio_id) where status = 'aberta';

create table if not exists public.desafio_proposta_votos (
  proposta_id uuid not null references public.desafio_propostas(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  aceito      boolean not null,
  created_at  timestamptz not null default now(),
  primary key (proposta_id, user_id)
);

alter table public.desafio_propostas enable row level security;
alter table public.desafio_proposta_votos enable row level security;

-- A mensagem do grupo aponta pra proposta (o app desenha os botões)
alter table public.chat_mensagens add column if not exists proposta_id uuid
  references public.desafio_propostas(id) on delete cascade;

-- ─── BLOCO 2: QUEM VÊ E QUEM ESCREVE ───────────────────────────
drop policy if exists prop_ler on public.desafio_propostas;
create policy prop_ler on public.desafio_propostas for select to authenticated
  using (public.sou_participante(desafio_id) or public.sou_dono_desafio(desafio_id));

-- Só o dono propõe (os campos de status/datas são do banco: ver gatilho)
drop policy if exists prop_criar on public.desafio_propostas;
create policy prop_criar on public.desafio_propostas for insert to authenticated
  with check (autor_id = auth.uid() and public.sou_dono_desafio(desafio_id));

drop policy if exists voto_ler on public.desafio_proposta_votos;
create policy voto_ler on public.desafio_proposta_votos for select to authenticated
  using (exists (select 1 from public.desafio_propostas p
                  where p.id = proposta_id
                    and (public.sou_participante(p.desafio_id) or public.sou_dono_desafio(p.desafio_id))));

-- Vota quem está no desafio, em nome próprio, enquanto a proposta está aberta
drop policy if exists voto_criar on public.desafio_proposta_votos;
create policy voto_criar on public.desafio_proposta_votos for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.desafio_propostas p
                 where p.id = proposta_id and p.status = 'aberta' and p.expira_em > now()
                   and p.autor_id <> auth.uid()
                   and public.sou_participante(p.desafio_id))
  );

-- ─── BLOCO 3: O QUE PODE MUDAR ─────────────────────────────────
-- Só as colunas da regra. O resto (dono, código, modalidade…) não entra.
create or replace function public.desafio_colunas_regra()
returns text[] language sql immutable as $$
  select array['titulo', 'descricao', 'dias_total', 'meta_diaria', 'unidade', 'prova_opcoes',
               'prenda', 'data_inicio', 'data_fim', 'prova', 'exercicios', 'max_por_dia',
               'nao_repetir', 'regras_dono', 'hora_limite', 'corridas_semana', 'km_corrida',
               'corrida_modo', 'tipo'];
$$;

-- Tem mais alguém no desafio além do dono?
create or replace function public.desafio_tem_gente(d_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.desafio_participantes p
                  join public.desafios d on d.id = p.desafio_id
                 where p.desafio_id = d_id and p.user_id <> d.author_id);
$$;

-- Primeiro dia do desafio (data de início, ou o dia em que foi criado)
create or replace function public.desafio_primeiro_dia(d public.desafios)
returns date language sql stable as $$
  select coalesce(d.data_inicio, (d.created_at at time zone 'America/Sao_Paulo')::date);
$$;
create or replace function public.desafio_comecou(d public.desafios)
returns boolean language sql stable as $$
  select public.desafio_primeiro_dia(d) <= (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ─── BLOCO 4: NOVA PROPOSTA ────────────────────────────────────
-- Arruma os campos do banco, fecha a vencida e posta no grupo.
create or replace function public.desafio_proposta_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  d public.desafios;
begin
  select * into d from public.desafios where id = new.desafio_id;
  if public.desafio_comecou(d) then
    raise exception 'O desafio já começou: as regras não mudam mais';
  end if;
  -- Só colunas da regra
  for k in select jsonb_object_keys(new.mudancas) loop
    if not (k = any(public.desafio_colunas_regra())) then
      raise exception 'Isso não pode mudar por proposta: %', k;
    end if;
  end loop;
  if new.mudancas = '{}'::jsonb then raise exception 'Nada mudou'; end if;

  new.status := 'aberta';
  -- 48h, ou até o desafio começar (o que vier antes)
  new.expira_em := least(now() + interval '48 hours',
                         public.desafio_primeiro_dia(d)::timestamp at time zone 'America/Sao_Paulo');
  new.decidida_em := null;
  new.created_at := now();

  -- Proposta vencida não segura a fila
  update public.desafio_propostas set status = 'expirada', decidida_em = now()
   where desafio_id = new.desafio_id and status = 'aberta' and expira_em <= now();
  return new;
end $$;

drop trigger if exists desafio_proposta_nova on public.desafio_propostas;
create trigger desafio_proposta_nova
  before insert on public.desafio_propostas
  for each row execute function public.desafio_proposta_nova();

create or replace function public.desafio_proposta_no_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nome text;
begin
  select coalesce(nullif(btrim(p.nome), ''), 'Falcão') into nome
    from public.desafio_participantes p
   where p.desafio_id = new.desafio_id and p.user_id = new.autor_id limit 1;
  insert into public.chat_mensagens (escopo, desafio_id, autor_id, autor_nome, texto, proposta_id)
  values ('desafio', new.desafio_id, new.autor_id, coalesce(nome, 'Falcão'),
          left('📝 Proposta de mudança nas regras' || E'\n' || array_to_string(new.resumo, E'\n'), 2000),
          new.id);
  return new;
end $$;

drop trigger if exists desafio_proposta_no_grupo on public.desafio_propostas;
create trigger desafio_proposta_no_grupo
  after insert on public.desafio_propostas
  for each row execute function public.desafio_proposta_no_grupo();

-- ─── BLOCO 5: APLICAR (só pelo banco) ──────────────────────────
create or replace function public.desafio_aplicar_proposta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.desafio_propostas;
  d public.desafios;
  n public.desafios;
begin
  select * into pr from public.desafio_propostas where id = p_id;
  select * into d from public.desafios where id = pr.desafio_id;
  -- Os valores novos por cima dos atuais (só as colunas da regra, já checadas)
  n := jsonb_populate_record(d, pr.mudancas);
  perform set_config('falcon.proposta', 'on', true);
  update public.desafios set
    titulo = n.titulo, descricao = n.descricao, dias_total = n.dias_total,
    meta_diaria = n.meta_diaria, unidade = n.unidade, prova_opcoes = n.prova_opcoes,
    prenda = n.prenda, data_inicio = n.data_inicio, data_fim = n.data_fim,
    prova = n.prova, exercicios = n.exercicios, max_por_dia = n.max_por_dia,
    nao_repetir = n.nao_repetir, regras_dono = n.regras_dono, hora_limite = n.hora_limite,
    corridas_semana = n.corridas_semana, km_corrida = n.km_corrida,
    corrida_modo = n.corrida_modo, tipo = n.tipo
  where id = d.id;
  perform set_config('falcon.proposta', 'off', true);
end $$;
revoke all on function public.desafio_aplicar_proposta(uuid) from public, anon, authenticated;

-- Aviso do banco no grupo (autor = dono, sem botões)
create or replace function public.desafio_aviso_no_grupo(p_desafio uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dono uuid;
  nome text;
begin
  select author_id into dono from public.desafios where id = p_desafio;
  select coalesce(nullif(btrim(p.nome), ''), 'Falcão') into nome
    from public.desafio_participantes p where p.desafio_id = p_desafio and p.user_id = dono limit 1;
  insert into public.chat_mensagens (escopo, desafio_id, autor_id, autor_nome, texto)
  values ('desafio', p_desafio, dono, coalesce(nome, 'Falcão'), p_texto);
end $$;
revoke all on function public.desafio_aviso_no_grupo(uuid, text) from public, anon, authenticated;

-- ─── BLOCO 6: VOTO ─────────────────────────────────────────────
-- Um "não" derruba. Todos (menos o dono, que propôs) aceitaram: aplica.
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
  if public.desafio_comecou((select d from public.desafios d where d.id = pr.desafio_id)) then
    raise exception 'O desafio já começou: as regras não mudam mais';
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

drop trigger if exists desafio_proposta_voto on public.desafio_proposta_votos;
create trigger desafio_proposta_voto
  after insert on public.desafio_proposta_votos
  for each row execute function public.desafio_proposta_voto();

-- O dono desiste da proposta aberta
create or replace function public.desafio_proposta_cancelar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.desafio_propostas;
begin
  select * into pr from public.desafio_propostas where id = p_id;
  if not found or pr.autor_id <> auth.uid() then raise exception 'Só quem propôs pode cancelar'; end if;
  if pr.status <> 'aberta' then return; end if;
  update public.desafio_propostas set status = 'cancelada', decidida_em = now() where id = p_id;
  perform public.desafio_aviso_no_grupo(pr.desafio_id, '↩️ O dono cancelou a proposta de mudança. As regras continuam as mesmas.');
end $$;
grant execute on function public.desafio_proposta_cancelar(uuid) to authenticated;

-- ─── BLOCO 7: NINGUÉM MUDA A REGRA POR FORA ────────────────────
-- Desafio de amigos com gente dentro: mudar coluna da regra só pela proposta,
-- e só antes de começar.
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
  if public.desafio_comecou(old) then
    raise exception 'O desafio já começou: as regras não mudam mais';
  end if;
  if coalesce(current_setting('falcon.proposta', true), 'off') <> 'on' then
    raise exception 'Já tem gente no desafio: a mudança vai pro grupo aprovar';
  end if;
  return new;
end $$;

drop trigger if exists desafio_regra_trancada on public.desafios;
create trigger desafio_regra_trancada
  before update on public.desafios
  for each row execute function public.desafio_regra_trancada();

-- ─── BLOCO 8: MENSAGEM DA PROPOSTA NÃO SE EDITA ────────────────
create or replace function public.chat_so_edita_texto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo       is distinct from old.escopo
  or new.autor_id     is distinct from old.autor_id
  or new.para_id      is distinct from old.para_id
  or new.desafio_id   is distinct from old.desafio_id
  or new.checkin_id   is distinct from old.checkin_id
  or new.proposta_id  is distinct from old.proposta_id
  or new.prova_video  is distinct from old.prova_video
  or new.prova_print  is distinct from old.prova_print
  or new.created_at   is distinct from old.created_at
  or new.expira_em    is distinct from old.expira_em
  or new.imagem_path  is distinct from old.imagem_path
  or new.responde_a   is distinct from old.responde_a
  or new.arquivo_path is distinct from old.arquivo_path then
    raise exception 'Só o texto da mensagem pode ser editado';
  end if;
  if old.proposta_id is not null and new.texto is distinct from old.texto then
    raise exception 'A proposta de mudança não pode ser editada';
  end if;
  new.editada_em := now();
  return new;
end $$;

notify pgrst, 'reload schema';
