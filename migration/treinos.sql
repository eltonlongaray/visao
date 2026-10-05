-- ═══════════════════════════════════════════════════════════════
-- MONTADOR DE TREINO — histórico de cargas (o que foi feito em cada treino)
-- ═══════════════════════════════════════════════════════════════
-- As FICHAS (Treino A/B/C, exercícios, séries, reps, carga atual) ficam em
-- profiles.extra.fichas, igual os objetivos: são poucas por pessoa e sempre
-- lidas junto do perfil, então não pedem tabela.
--
-- Esta tabela guarda o que foi FEITO: cada exercício de cada treino, com as
-- séries (reps + kg). É dela que saem a evolução de carga, o 1RM estimado
-- (+ Força) e as perguntas do Pet ("a carga do supino não sobe há 3 semanas").

-- ─── BLOCO 1: TABELA ───────────────────────────────────────────
create table if not exists public.treino_registros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       date not null default current_date,
  ficha      text,                   -- nome da ficha no dia (ex.: "Treino A"), só pra exibir
  exercicio  text not null check (char_length(btrim(exercicio)) between 1 and 80),
  musculo    text,                   -- chave do músculo (peito, costas, ...) do perfil de treino
  series     jsonb not null default '[]'::jsonb,   -- [{ "reps": 10, "kg": 40 }, ...]
  carga_max  numeric(6,1),           -- maior kg do dia (pra gráfico/consulta rápida)
  rm_est     numeric(6,1),           -- 1RM estimado (Epley) da melhor série, calculado no cliente
  created_at timestamptz not null default now()
);
alter table public.treino_registros enable row level security;
create index if not exists idx_treino_reg_user_data on public.treino_registros(user_id, data desc);
create index if not exists idx_treino_reg_user_exerc on public.treino_registros(user_id, exercicio, data desc);

-- ─── BLOCO 2: RLS (cada um só vê e mexe nos próprios) ─────────
drop policy if exists treino_reg_ler on public.treino_registros;
create policy treino_reg_ler on public.treino_registros for select to authenticated using (user_id = auth.uid());
drop policy if exists treino_reg_criar on public.treino_registros;
create policy treino_reg_criar on public.treino_registros for insert to authenticated with check (user_id = auth.uid());
drop policy if exists treino_reg_editar on public.treino_registros;
create policy treino_reg_editar on public.treino_registros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists treino_reg_apagar on public.treino_registros;
create policy treino_reg_apagar on public.treino_registros for delete to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';
