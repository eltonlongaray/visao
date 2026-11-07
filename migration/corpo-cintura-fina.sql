-- ════════════════════════════════════════════════════════════════
-- MEDIDAS DO CORPO: CINTURA NA PARTE MAIS FINA (homem) (Élton, 05/11/2026)
-- O homem passa a medir duas: abdômen na altura do umbigo (coluna cintura,
-- entra no % de gordura) e a cintura na parte mais fina (cintura_fina, entra
-- no ombro ÷ cintura, a proporção áurea). Pode rodar mais de uma vez.
-- ════════════════════════════════════════════════════════════════
alter table public.corpo_registros add column if not exists cintura_fina numeric(5,1);

notify pgrst, 'reload schema';
