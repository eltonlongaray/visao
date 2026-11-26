-- ═══════════════════════════════════════════════════════════════
-- MENTORIA — pagamento da aluna (valor, forma, parcelas)
-- Rodar no Supabase do FALCON → SQL Editor. Seguro rodar mais de uma vez.
-- Precisa já ter rodado: mentoria.sql
--
-- Ao marcar "✅ Pagou" na 🎓 Mentoria, o app grava:
--   pago_em        timestamptz  data do pagamento (já existia)
--   pago_valor     numeric      valor recebido (sugestão = preço da oferta, editável)
--   pago_forma     text         pix | cartao | parcelado | dinheiro | outro
--   pago_parcelas  int          nº de parcelas (só quando pago_forma = 'parcelado')
-- Financeiro (renda da mentoria, separada dos clientes): somar pago_valor onde
-- pago_em está no período — a própria dona lê pela RLS ("dona le").
-- ═══════════════════════════════════════════════════════════════

alter table mentoria_leads add column if not exists pago_valor numeric(10,2);
alter table mentoria_leads add column if not exists pago_forma text;
alter table mentoria_leads add column if not exists pago_parcelas int;
