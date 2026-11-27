-- ═══════════════════════════════════════════════════════════════
-- MENTORIA — permuta (aluna que paga em serviço, ex.: massagem). Élton, 27/11/2026
-- Rodar no Supabase do FALCON → SQL Editor. Seguro rodar mais de uma vez.
-- permuta = { total, unit, servico, anteriores, faltasAntes, itens: [{ d, t: 'feita'|'falta' }] }
-- ═══════════════════════════════════════════════════════════════
alter table mentoria_leads add column if not exists permuta jsonb;
notify pgrst, 'reload schema';

-- Confere: deve aparecer true
select exists (select 1 from information_schema.columns where table_name = 'mentoria_leads' and column_name = 'permuta') as "permuta_ok";
