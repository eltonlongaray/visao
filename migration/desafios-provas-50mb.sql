-- Provas dos desafios: limite do arquivo de 25 MB para 50 MB (16/10/2026).
-- Depoimento de 5 min no Android passava de 25 MB mesmo gravando leve.
-- 50 MB é o máximo por arquivo no plano grátis do Supabase.
update storage.buckets set file_size_limit = 52428800 where id = 'desafio-provas';
select id, file_size_limit from storage.buckets where id = 'desafio-provas';
