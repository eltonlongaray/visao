-- ═══════════════════════════════════════════════════════════════
-- COMPOSIÇÃO CORPORAL — registros de medidas + fotos de progresso
-- ═══════════════════════════════════════════════════════════════
-- Cada "registro" é um retrato datado: peso, as 7 medidas (pescoço só entra na
-- conta de % de gordura), o % de gordura calculado (US Navy) e 3 fotos (frente,
-- lado, costas). A pessoa adiciona um a cada ~3 meses; o histórico mostra a
-- evolução. Sexo e altura ficam no perfil (profiles.extra), não aqui.
--
-- Fotos são PERMANENTES (a pessoa acompanha a evolução ao longo do tempo).

-- ─── BLOCO 1: TABELA ───────────────────────────────────────────
create table if not exists public.corpo_registros (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         date not null default current_date,
  peso         numeric(5,1),        -- kg
  pescoco      numeric(5,1),        -- cm (só p/ % gordura)
  peitoral     numeric(5,1),
  cintura      numeric(5,1),
  quadril      numeric(5,1),
  braco        numeric(5,1),
  coxa         numeric(5,1),
  panturrilha  numeric(5,1),
  gordura_pct  numeric(4,1),        -- calculado no cliente e guardado
  foto_frente  text,                -- caminho no bucket corpo-fotos
  foto_lado    text,
  foto_costas  text,
  created_at   timestamptz not null default now()
);
alter table public.corpo_registros enable row level security;
create index if not exists idx_corpo_user_data on public.corpo_registros(user_id, data desc);

drop policy if exists corpo_ler on public.corpo_registros;
create policy corpo_ler on public.corpo_registros for select to authenticated using (user_id = auth.uid());
drop policy if exists corpo_criar on public.corpo_registros;
create policy corpo_criar on public.corpo_registros for insert to authenticated with check (user_id = auth.uid());
drop policy if exists corpo_editar on public.corpo_registros;
create policy corpo_editar on public.corpo_registros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists corpo_apagar on public.corpo_registros;
create policy corpo_apagar on public.corpo_registros for delete to authenticated using (user_id = auth.uid());

-- ─── BLOCO 2: BUCKET DE FOTOS (privado, permanente) ────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('corpo-fotos', 'corpo-fotos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada um só vê/gerencia as próprias fotos (path começa com o uid).
drop policy if exists corpofoto_ler on storage.objects;
create policy corpofoto_ler on storage.objects for select to authenticated
  using (bucket_id = 'corpo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists corpofoto_enviar on storage.objects;
create policy corpofoto_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'corpo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists corpofoto_apagar on storage.objects;
create policy corpofoto_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'corpo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';

-- Ombro (para o índice cintura/ombro V vs O)
alter table public.corpo_registros add column if not exists ombro numeric(5,1);
notify pgrst, 'reload schema';
