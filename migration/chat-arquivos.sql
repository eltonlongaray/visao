-- ═══════════════════════════════════════════════════════════════
-- ARQUIVOS E ÁUDIO NO CHAT — mural e privado
-- ═══════════════════════════════════════════════════════════════
-- Reaproveita a mesma estrutura da foto (bucket privado + URL assinada +
-- vida de 7 dias). Bucket SEPARADO do de foto porque este aceita 10 MB e
-- outros tipos; o de foto é 2 MB e só imagem.
--
-- Sem vídeo, a pedido — é o que mais pesa e some em 7 dias. Áudio entra
-- (gravado no navegador), PDF e documentos comuns entram.

-- ─── BLOCO 1: COLUNAS ──────────────────────────────────────────
-- path = caminho no bucket; nome = nome original (pra mostrar e baixar);
-- mime = tipo real, e é dele que o cliente decide player de áudio vs card de
-- arquivo. Guardar a URL não serve: URL de bucket privado é assinada e expira.
alter table public.chat_mensagens add column if not exists arquivo_path text;
alter table public.chat_mensagens add column if not exists arquivo_nome text;
alter table public.chat_mensagens add column if not exists arquivo_mime text;

-- ─── BLOCO 2: MENSAGEM PODE SER SÓ ARQUIVO ─────────────────────
alter table public.chat_mensagens drop constraint if exists chat_conteudo_existe;
alter table public.chat_mensagens add constraint chat_conteudo_existe check (
  (texto is not null and char_length(btrim(texto)) between 1 and 2000)
  or imagem_path is not null
  or arquivo_path is not null
);

-- ─── BLOCO 3: BUCKET PRIVADO + QUEM PODE VER ───────────────────
-- Mesma regra da foto: quem pode ler a mensagem vê o arquivo dela. Bucket
-- privado, acesso por URL assinada. 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-arquivos', 'chat-arquivos', false, 10485760,
        array[
          'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain', 'text/csv'
        ])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chatarq_leitura on storage.objects;
create policy chatarq_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-arquivos'
    and exists (
      select 1 from public.chat_mensagens m
      where m.arquivo_path = storage.objects.name
        and m.expira_em > now()
        and (m.escopo = 'comunidade' or m.autor_id = auth.uid() or m.para_id = auth.uid())
    )
  );

drop policy if exists chatarq_envio on storage.objects;
create policy chatarq_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-arquivos'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists chatarq_remocao on storage.objects;
create policy chatarq_remocao on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-arquivos'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── BLOCO 4: EDIÇÃO NÃO MEXE NO ARQUIVO ───────────────────────
-- O gatilho já congela escopo, destinatário, validade, imagem e resposta. O
-- arquivo entra na mesma lista: editar corrige o texto, não troca o anexo.
create or replace function public.chat_so_edita_texto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escopo       is distinct from old.escopo
  or new.autor_id     is distinct from old.autor_id
  or new.para_id      is distinct from old.para_id
  or new.created_at   is distinct from old.created_at
  or new.expira_em    is distinct from old.expira_em
  or new.imagem_path  is distinct from old.imagem_path
  or new.responde_a   is distinct from old.responde_a
  or new.arquivo_path is distinct from old.arquivo_path then
    raise exception 'Só o texto da mensagem pode ser editado';
  end if;
  new.editada_em := now();
  return new;
end $$;

notify pgrst, 'reload schema';
