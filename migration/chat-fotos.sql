-- ═══════════════════════════════════════════════════════════════
-- FOTO NO CHAT — mural e privado
-- ═══════════════════════════════════════════════════════════════
-- A imagem segue a MESMA vida da mensagem: 7 dias e some. Quem quiser
-- guardar, baixa antes.
--
-- O bucket é PRIVADO, ao contrário do de avatar. Avatar é o que a pessoa
-- escolheu mostrar; foto de conversa privada não é. Com bucket público,
-- qualquer um com o endereço veria a imagem mesmo sem poder ler a mensagem —
-- o RLS protegeria o texto e deixaria a foto exposta. Aqui a leitura passa
-- pela mesma regra da mensagem (ver BLOCO 3).

-- ─── BLOCO 1: COLUNA ───────────────────────────────────────────
-- Guarda o CAMINHO no bucket, não uma URL. URL de bucket privado é assinada
-- e expira; gravar uma URL no banco seria gravar algo que morre sozinho.
alter table public.chat_mensagens add column if not exists imagem_path text;

-- ─── BLOCO 2: TEXTO DEIXA DE SER OBRIGATÓRIO ───────────────────
-- Mensagem só com foto é legítima. O texto continua limitado quando existe,
-- mas agora a exigência é "ter conteúdo", e não "ter texto".
alter table public.chat_mensagens alter column texto drop not null;
alter table public.chat_mensagens drop constraint if exists chat_mensagens_texto_check;
alter table public.chat_mensagens drop constraint if exists chat_conteudo_existe;
alter table public.chat_mensagens add constraint chat_conteudo_existe check (
  (texto is not null and char_length(btrim(texto)) between 1 and 2000)
  or imagem_path is not null
);

-- ─── BLOCO 3: BUCKET PRIVADO + QUEM PODE VER ───────────────────
-- 2 MB: o cliente reduz para no máximo 1600px antes de enviar, então isto é
-- teto de segurança, não o tamanho esperado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-fotos', 'chat-fotos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A regra de leitura da FOTO é a mesma regra de leitura da MENSAGEM: quem
-- pode ler a mensagem pode ver a imagem dela, e mais ninguém. Sem isto, a
-- privacidade do privado terminaria no texto.
drop policy if exists chatfotos_leitura on storage.objects;
create policy chatfotos_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-fotos'
    and exists (
      select 1 from public.chat_mensagens m
      where m.imagem_path = storage.objects.name
        and m.expira_em > now()
        and (
          m.escopo = 'comunidade'
          or m.autor_id = auth.uid()
          or m.para_id  = auth.uid()
        )
    )
  );

-- Enviar só na própria pasta: o caminho é '{uid}/{arquivo}' e a primeira
-- pasta tem que ser quem está autenticado.
drop policy if exists chatfotos_envio on storage.objects;
create policy chatfotos_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-fotos'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Apagar: só o próprio dono. É o que permite a faxina das imagens vencidas.
drop policy if exists chatfotos_remocao on storage.objects;
create policy chatfotos_remocao on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-fotos'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── BLOCO 4: EDIÇÃO NÃO MEXE NA IMAGEM ────────────────────────
-- O gatilho já impedia trocar escopo, destinatário e validade. A imagem
-- entra na mesma lista: editar é corrigir o que se escreveu, não trocar a
-- foto que os outros já viram por outra.
create or replace function public.chat_so_edita_texto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo      is distinct from old.escopo
  or new.autor_id    is distinct from old.autor_id
  or new.para_id     is distinct from old.para_id
  or new.created_at  is distinct from old.created_at
  or new.expira_em   is distinct from old.expira_em
  or new.imagem_path is distinct from old.imagem_path then
    raise exception 'Só o texto da mensagem pode ser editado';
  end if;
  new.editada_em := now();
  return new;
end $$;

notify pgrst, 'reload schema';
