-- ═══════════════════════════════════════════════════════════════
-- FALCON · Revisão de "quem vê o quê" no banco (Élton, 16/10/2026)
-- Rodar no SQL Editor. Pode rodar de novo sem problema.
--
-- 1) Rifa: a página pública mostrava o WhatsApp dos ganhadores pra quem
--    soubesse pedir (o app só mostrava o nome, mas o dado ia junto).
-- 2) Ninguém vira administrador sozinho (is_admin só muda pelo SQL Editor).
-- 3) Chat: foto/arquivo da mensagem tem que ser da própria pessoa ou de uma
--    mensagem que ela já vê (encaminhar continua funcionando). Antes dava
--    pra "pendurar" a foto de uma conversa privada no mural.
-- 4) Prova do desafio: vídeo/print tem que estar na pasta de quem envia.
-- 5) Desafio de amigos não vira "oficial" pela edição (só o admin cria oficial).
-- 6) Ninguém troca o próprio nome numa mensagem já enviada (fingir ser outro).
-- 7) O sorteio automático de todas as rifas só roda pelo agendador do banco.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1) RIFA: ganhadores sem WhatsApp na página pública ─────────
create or replace function rifa_publica(p_slug text)
returns json language sql security definer stable as $$
  select json_build_object(
    'slug', slug, 'titulo', titulo, 'subtitulo', subtitulo, 'descricao', descricao,
    'total_numeros', total_numeros, 'valor_numero', valor_numero, 'valor_meta', valor_meta,
    'data_sorteio', data_sorteio, 'sorteio_em', sorteio_em, 'sorteio_status', sorteio_status,
    'sorteados', (select coalesce(jsonb_agg(e - 'contato'), '[]'::jsonb)
                    from jsonb_array_elements(coalesce(sorteados, '[]'::jsonb)) e),
    'whatsapp', whatsapp, 'premios', coalesce(premios, '[]'::jsonb),
    'pix_chave', pix_chave, 'pix_nome', pix_nome, 'pix_cidade', pix_cidade, 'pix_modo', pix_modo,
    'ativo', ativo
  )
  from rifas where slug = p_slug and ativo = true;
$$;
grant execute on function rifa_publica(text) to anon, authenticated;

-- ─── 2) ADMIN SÓ PELO SQL EDITOR ───────────────────────────────
-- Pelo app (anon/authenticated) o is_admin fica como estava; no SQL Editor muda.
create or replace function public.profiles_trava_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    else
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_trava_admin on public.profiles;
create trigger profiles_trava_admin
  before insert or update on public.profiles
  for each row execute function public.profiles_trava_admin();

-- ─── 3) CHAT: foto e arquivo da própria pessoa (ou que ela já vê) ─
drop policy if exists chat_escrever on public.chat_mensagens;
create policy chat_escrever on public.chat_mensagens
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and (escopo <> 'desafio' or public.sou_participante(desafio_id) or public.sou_dono_desafio(desafio_id))
    and (imagem_path is null
         or starts_with(imagem_path, auth.uid()::text || '/')
         or exists (select 1 from public.chat_mensagens x
                     where x.imagem_path = chat_mensagens.imagem_path and public.posso_ver_mensagem(x.id)))
    and (arquivo_path is null
         or starts_with(arquivo_path, auth.uid()::text || '/')
         or exists (select 1 from public.chat_mensagens x
                     where x.arquivo_path = chat_mensagens.arquivo_path and public.posso_ver_mensagem(x.id)))
  );

-- ─── 4) PROVA: vídeo e print da pasta de quem envia ─────────────
drop policy if exists "checkin_insert_own" on public.desafio_checkins;
create policy "checkin_insert_own" on public.desafio_checkins for insert with check (
  user_id = auth.uid() and public.sou_participante(desafio_id)
  and (video_path is null or starts_with(video_path, auth.uid()::text || '/'))
  and (print_path is null or starts_with(print_path, auth.uid()::text || '/'))
);

-- ─── 5) DESAFIO: editar não transforma em oficial ───────────────
drop policy if exists "desafios_update" on public.desafios;
create policy "desafios_update" on public.desafios for update
  using (author_id = auth.uid() or public.eh_admin())
  with check (public.eh_admin() or (author_id = auth.uid() and modalidade in ('individual', 'amigos')));

-- ─── 6) MENSAGEM: o nome de quem mandou não muda ────────────────
create or replace function public.chat_so_edita_texto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo       is distinct from old.escopo
  or new.autor_id     is distinct from old.autor_id
  or new.autor_nome   is distinct from old.autor_nome
  or new.para_id      is distinct from old.para_id
  or new.desafio_id   is distinct from old.desafio_id
  or new.checkin_id   is distinct from old.checkin_id
  or new.proposta_id  is distinct from old.proposta_id
  or new.prova_video  is distinct from old.prova_video
  or new.prova_print  is distinct from old.prova_print
  or new.created_at   is distinct from old.created_at
  or new.expira_em    is distinct from old.expira_em
  or new.imagem_path  is distinct from old.imagem_path
  or new.responde_a   is distinct from old.responde_a
  or new.arquivo_path is distinct from old.arquivo_path then
    raise exception 'Só o texto da mensagem pode ser editado';
  end if;
  if old.proposta_id is not null and new.texto is distinct from old.texto then
    raise exception 'A proposta de mudança não pode ser editada';
  end if;
  new.editada_em := now();
  return new;
end $$;

-- ─── 7) SORTEIO AUTOMÁTICO DE TODAS: só o agendador ─────────────
revoke execute on function sortear_automatico_vencidas() from public, anon, authenticated;

notify pgrst, 'reload schema';
