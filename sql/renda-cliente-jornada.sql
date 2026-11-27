-- ═══════════════════════════════════════════════════════════════
-- FONTES DE RENDA — proposta, fases e relatório de cada cliente. Élton, 27/11/2026
-- Rodar no Supabase do FALCON → SQL Editor. Seguro rodar mais de uma vez.
-- jornada = { titulo, fases: [{ nome, st, itens, valor, pago, anuncio }], bonus: [{ nome, valor, nota, st }],
--             resultados: [{ rot, valor }], desafios: [], melhorias: [], instagram: [] }
-- ═══════════════════════════════════════════════════════════════
alter table renda_clientes add column if not exists jornada jsonb;
notify pgrst, 'reload schema';

select exists (select 1 from information_schema.columns where table_name = 'renda_clientes' and column_name = 'jornada') as "jornada_ok";
