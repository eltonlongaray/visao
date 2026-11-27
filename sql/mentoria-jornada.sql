-- ═══════════════════════════════════════════════════════════════
-- MENTORIA — relatório da aluna (fase atual e presentes com valor). Élton, 27/11/2026
-- Rodar no Supabase do FALCON → SQL Editor. Seguro rodar mais de uma vez.
-- jornada = { atual, presentes: [{ nome, valor, nota, grupo }] }
-- Sem rodar, o relatório abre igual (pela data e com os presentes padrão); só o ✏️ Ajustar não salva.
-- ═══════════════════════════════════════════════════════════════
alter table mentoria_leads add column if not exists jornada jsonb;
notify pgrst, 'reload schema';

-- Confere: deve aparecer true
select exists (select 1 from information_schema.columns where table_name = 'mentoria_leads' and column_name = 'jornada') as "jornada_ok";
