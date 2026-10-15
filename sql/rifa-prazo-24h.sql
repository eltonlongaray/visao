-- ═══════════════════════════════════════════════════════════════
-- FALCON RIFA — PRAZO DE 24H PRA PAGAR
-- Rode UMA VEZ no Supabase (SQL Editor). Idempotente (pode re-rodar).
--
-- Regra: quem escolhe um número e não paga em 24h perde o número. Ele volta a
-- ficar livre no link e vai pra lista "Perderam o número" do dono (que avisa a
-- pessoa pra escolher outro quando ela aparecer pra pagar).
--  • rifa_numeros.reservado_em = quando o prazo começou a contar
--  • Reservas que já existiam começam a contar AGORA (ninguém perde na hora)
--  • rifa_expirados = quem perdeu o número (nome, WhatsApp, número)
--  • Ninguém precisa rodar nada de hora em hora: o banco libera os vencidos
--    quando alguém escolhe número, quando o dono abre a rifa e no link público.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Quando o prazo começou ───────────────────────────────────
alter table rifa_numeros add column if not exists reservado_em timestamptz;
update rifa_numeros set reservado_em = now() where reservado_em is null;
alter table rifa_numeros alter column reservado_em set default now();

-- ── 2) Quem perdeu o número ─────────────────────────────────────
create table if not exists rifa_expirados (
  id uuid primary key default gen_random_uuid(),
  rifa_id uuid not null references rifas(id) on delete cascade,
  numero int not null,
  nome text,
  contato text,
  reservado_em timestamptz,
  expirou_em timestamptz default now()
);
alter table rifa_expirados enable row level security;
drop policy if exists rifa_expirados_dono on rifa_expirados;
create policy rifa_expirados_dono on rifa_expirados for all to authenticated
  using (exists (select 1 from rifas r where r.id = rifa_expirados.rifa_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from rifas r where r.id = rifa_expirados.rifa_id and r.owner_id = auth.uid()));

-- ── 3) Libera os vencidos de UMA rifa ───────────────────────────
-- Só mexe em número NÃO pago com mais de 24h. Devolve quantos liberou.
create or replace function rifa_liberar_vencidos(p_rifa uuid)
returns int language plpgsql security definer as $$
declare v_qtd int;
begin
  with v as (
    delete from rifa_numeros
     where rifa_id = p_rifa and not pago
       and coalesce(reservado_em, created_at) < now() - interval '24 hours'
     returning rifa_id, numero, nome, contato, coalesce(reservado_em, created_at) as reservado_em
  )
  insert into rifa_expirados (rifa_id, numero, nome, contato, reservado_em)
    select rifa_id, numero, nome, contato, reservado_em from v;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end; $$;
grant execute on function rifa_liberar_vencidos(uuid) to authenticated;

-- ── 4) Antes de reservar, libera os vencidos (link, Pix automático, tudo) ──
create or replace function rifa_libera_antes_de_reservar()
returns trigger language plpgsql security definer as $$
begin
  perform rifa_liberar_vencidos(new.rifa_id);
  new.reservado_em := coalesce(new.reservado_em, now());
  return new;
end; $$;
drop trigger if exists trg_rifa_libera_vencidos on rifa_numeros;
create trigger trg_rifa_libera_vencidos
  before insert on rifa_numeros
  for each row execute function rifa_libera_antes_de_reservar();

-- ── 5) O link público mostra como LIVRE o número vencido ────────
create or replace function rifa_ocupados(p_slug text)
returns int[] language sql security definer stable as $$
  select coalesce(array_agg(n.numero order by n.numero), '{}')
  from rifa_numeros n join rifas r on r.id = n.rifa_id
  where r.slug = p_slug
    and (n.pago or coalesce(n.reservado_em, n.created_at) >= now() - interval '24 hours');
$$;
grant execute on function rifa_ocupados(text) to anon, authenticated;
