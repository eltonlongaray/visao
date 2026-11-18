-- ═══════════════════════════════════════════════════════════════
-- FICHA — SESSÕES DE ESTÉTICA CORPORAL (18/11/2026, caso Alê)
-- Rodar no Supabase → SQL Editor (depois do sql/ficha-sessoes.sql). Idempotente.
-- Acrescenta `extra` na sessão: fotos (caminhos no R2/bucket privado),
-- áreas tratadas, técnica/blend e o que a cliente levou pra casa.
-- O RLS da tabela já vale (só a dona lê e mexe).
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: COLUNA NOVA ===
alter table ficha_sessoes add column if not exists extra jsonb default '{}'::jsonb;
-- { "fotos": {"frente": "uid/corpo-....r2.jpg", "costas": ...},
--   "areas": ["Culotes","Flancos"], "tecnica": "...", "levou": "..." }
