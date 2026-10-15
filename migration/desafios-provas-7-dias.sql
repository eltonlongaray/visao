-- ═══════════════════════════════════════════════════════════════
-- FALCON · Desafios — VÍDEOS E CONVERSA FICAM 7 DIAS DEPOIS DO FIM
-- (Élton, 15/10: tempo pra pessoa baixar tudo pro Google Drive)
--
-- Antes: 3 dias depois do último dia. Agora: 7 dias.
-- Rodar no Supabase → SQL Editor. Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.desafio_validade(p_desafio uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce(
      ((coalesce(d.data_fim, coalesce(d.data_inicio, d.created_at::date) + d.dias_total - 1) + 8)::timestamp
        at time zone 'America/Sao_Paulo'),
      now() + interval '365 days'),
    now() + interval '7 days')
  from public.desafios d where d.id = p_desafio;
$$;

-- Atualiza os desafios que já existem
do $$
declare r record;
begin
  for r in select id from public.desafios loop
    perform public.desafio_reaplica_validade(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
