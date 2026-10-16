-- ═══════════════════════════════════════════════════════════════
-- FALCON · Provas dos desafios: qualidade cheia, 7 dias e "Conteúdo"
-- (Élton, 16/10/2026). Rodar no SQL Editor. Pode rodar de novo sem problema.
--
-- 1) Vídeo grande sobe em PARTES de até 45 MB (o plano grátis aceita 50 MB
--    por arquivo), sem perder qualidade: a 1ª parte no caminho de sempre
--    (video_path), as outras em <video_path>.p2, .p3... Quem pode ver o
--    vídeo pode ver todas as partes.
-- 2) O VÍDEO da prova fica 7 dias a partir de quando foi enviado (antes: até
--    7 dias depois do fim do desafio). A conversa da sala continua até o fim.
-- 3) Depois disso, a sala mostra "📄 Conteúdo": o que a pessoa disse no
--    vídeo, organizado (coluna conteudo, gravada pelo app de quem enviou).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1) PARTES DO VÍDEO ────────────────────────────────────────

drop policy if exists provas_leitura on storage.objects;
create policy provas_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'desafio-provas'
    and exists (
      select 1 from public.desafio_checkins c
      where (c.video_path = storage.objects.name
             or c.print_path = storage.objects.name
             or (c.video_path is not null and starts_with(storage.objects.name, c.video_path || '.p')))
        and coalesce(c.video_expira_em, now() + interval '1 day') > now()
        and (public.sou_participante(c.desafio_id) or public.sou_dono_desafio(c.desafio_id) or public.eh_admin())
    )
  );

drop policy if exists prendas_video_leitura on storage.objects;
create policy prendas_video_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'desafio-provas'
    and exists (
      select 1 from public.desafio_prendas p
      where (p.video_path = storage.objects.name
             or starts_with(storage.objects.name, p.video_path || '.p'))
        and p.expira_em > now()
    )
  );

-- ─── 2) VÍDEO FICA 7 DIAS ──────────────────────────────────────
create or replace function public.desafio_checkin_validade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.video_expira_em := now() + interval '7 days';
  return new;
end $$;

-- Mudar o fim do desafio só mexe na conversa, não no vídeo
create or replace function public.desafio_reaplica_validade(p_desafio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v timestamptz := public.desafio_validade(p_desafio);
begin
  if v is null then return; end if;
  alter table public.chat_mensagens disable trigger chat_edita_texto;
  update public.chat_mensagens set expira_em = v
   where escopo = 'desafio' and desafio_id = p_desafio;
  alter table public.chat_mensagens enable trigger chat_edita_texto;
end $$;

-- ─── 3) CONTEÚDO (o que foi dito, organizado) ──────────────────
-- { "resumo": "...", "pontos": [{ "titulo": "...", "texto": "..." }], "texto": "transcrição" }
alter table public.desafio_checkins add column if not exists conteudo jsonb;

-- Só quem enviou a prova grava o conteúdo dela
create or replace function public.desafio_checkin_conteudo(p_checkin uuid, p_conteudo jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_conteudo) <> 'object' or length(p_conteudo::text) > 20000 then
    raise exception 'Conteúdo inválido';
  end if;
  update public.desafio_checkins set conteudo = p_conteudo
   where id = p_checkin and user_id = auth.uid() and video_path is not null;
  return found;
end $$;
revoke all on function public.desafio_checkin_conteudo(uuid, jsonb) from public, anon;
grant execute on function public.desafio_checkin_conteudo(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
