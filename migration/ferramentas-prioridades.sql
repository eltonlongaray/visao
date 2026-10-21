-- Prioridades nos Objetivos (Élton, 21/10/2026): a ⭐ marca o item como
-- prioridade e o card "⭐ Prioridades" mostra todos, na ordem que a pessoa
-- arrastar. null = não é prioridade; número menor = mais no topo.
-- As regras de acesso (RLS) da tabela já valem pra coluna nova.
alter table public.ferramentas_itens add column if not exists prioridade double precision;
create index if not exists idx_ferramentas_prioridade
  on public.ferramentas_itens(user_id, prioridade) where prioridade is not null;
