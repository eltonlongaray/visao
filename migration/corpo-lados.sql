-- ════════════════════════════════════════════════════════════════
-- MEDIDAS DO CORPO: ESQUERDO E DIREITO (Élton, 19/10/2026)
-- Braço, coxa e panturrilha agora têm lado esquerdo e direito. A coluna
-- sem lado (braco, coxa, panturrilha) continua guardando o MAIOR dos dois,
-- que é o que a análise usa. Pode rodar mais de uma vez.
-- ════════════════════════════════════════════════════════════════
alter table public.corpo_registros add column if not exists braco_esq       numeric(5,1);
alter table public.corpo_registros add column if not exists braco_dir       numeric(5,1);
alter table public.corpo_registros add column if not exists coxa_esq        numeric(5,1);
alter table public.corpo_registros add column if not exists coxa_dir        numeric(5,1);
alter table public.corpo_registros add column if not exists panturrilha_esq numeric(5,1);
alter table public.corpo_registros add column if not exists panturrilha_dir numeric(5,1);

notify pgrst, 'reload schema';
