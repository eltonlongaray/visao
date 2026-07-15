-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — coluna `tipo` (qual molde originou o desafio)
-- Guarda o id do molde (agua, exercicio, corrida…) p/ emoji + prova.
-- Rodar no Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════
alter table public.desafios add column if not exists tipo text;
