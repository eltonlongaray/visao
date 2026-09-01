-- ═══════════════════════════════════════════════════════════════
-- AGENDA — vaga CANCELADA não pode mais bloquear reserva no mesmo horário
-- Problema: unique(owner_id, data, hora) não olha o status, então uma linha
-- cancelada segurava a chave e o novo agendamento no mesmo horário dava erro.
-- Solução: troca por um índice único PARCIAL que ignora os cancelados.
-- ═══════════════════════════════════════════════════════════════

-- 1) Remove a restrição antiga (nome padrão do Postgres pra unique inline).
alter table agendamentos drop constraint if exists agendamentos_owner_id_data_hora_key;

-- 2) Índice único só entre os NÃO cancelados (confirmado/finalizado/faltou).
drop index if exists agendamentos_slot_ativo;
create unique index agendamentos_slot_ativo
  on agendamentos (owner_id, data, hora)
  where status <> 'cancelado';
