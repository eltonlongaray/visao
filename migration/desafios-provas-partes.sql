-- Provas dos desafios em PARTES (16/10/2026): vídeo grande sobe em pedaços
-- de até 45 MB (o plano grátis aceita 50 MB por arquivo), sem perder qualidade.
-- A 1ª parte fica no caminho de sempre (video_path); as outras em
-- <video_path>.p2, .p3... Quem pode ver o vídeo pode ver todas as partes.
-- Pode rodar de novo sem problema.

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
