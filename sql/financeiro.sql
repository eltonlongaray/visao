-- ═══════════════════════════════════════════════════════════════
-- FINANCEIRO DO CLIENTE + CAMPANHAS (lado da profissional, logada)
-- Rodar no Supabase → SQL Editor. Seguro rodar mais de uma vez.
--   vendas          → o que cada cliente comprou e pagou (atendimento, pacote, produto)
--   financeiro_cfg  → custo de cada serviço e catálogo de produtos (NÃO é público)
--   campanhas       → quanto foi investido em cada anúncio (pro painel da campanha)
-- Tudo com RLS: só a dona lê e mexe.
-- ═══════════════════════════════════════════════════════════════

-- === BLOCO 1: VENDAS ===
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cliente_nome text,
  cliente_contato text,
  cliente_digitos text,                 -- liga ao cliente da Agenda (só números)
  tipo text not null default 'servico', -- servico | pacote | produto
  item text not null,                   -- "Sessão para celulite", "Deusa Grega…", "Blend Celulite"
  servico_id text,                      -- id do serviço da agenda (quando for serviço/pacote)
  agendamento_id uuid,                  -- atendimento que gerou a venda (se houver)
  sessoes int not null default 1,       -- pacote: quantas sessões ele cobre
  valor numeric not null default 0,     -- valor PAGO (editável)
  custo numeric not null default 0,     -- custo (material, óleos, blend…) — editável
  forma text,                           -- pix | cartao | dinheiro
  data date not null default current_date,
  obs text,
  created_at timestamptz default now()
);
create index if not exists vendas_owner_data_idx on vendas (owner_id, data);
create index if not exists vendas_owner_cli_idx on vendas (owner_id, cliente_digitos);
create unique index if not exists vendas_agendamento_uq on vendas (agendamento_id) where agendamento_id is not null;

grant select, insert, update, delete on vendas to authenticated;
alter table vendas enable row level security;
drop policy if exists vendas_owner on vendas;
create policy vendas_owner on vendas
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 2: CUSTOS E PRODUTOS (separado da agenda porque a agenda é pública) ===
create table if not exists financeiro_cfg (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  custos jsonb not null default '{}'::jsonb,    -- { "<servico_id>": 15 }
  produtos jsonb not null default '[]'::jsonb,  -- [{ id, nome, preco, custo }]
  updated_at timestamptz default now()
);
grant select, insert, update, delete on financeiro_cfg to authenticated;
alter table financeiro_cfg enable row level security;
drop policy if exists financeiro_cfg_owner on financeiro_cfg;
create policy financeiro_cfg_owner on financeiro_cfg
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 3: CAMPANHAS (investimento por anúncio; o resto o app calcula) ===
create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  codigo text not null,                 -- utm_campaign do link (ex: blackfriday)
  nome text,                            -- ex: "Black Friday · Google"
  origem text,                          -- utm_source (google, instagram…)
  investido numeric not null default 0,
  inicio date,
  fim date,
  created_at timestamptz default now(),
  unique (owner_id, codigo)
);
grant select, insert, update, delete on campanhas to authenticated;
alter table campanhas enable row level security;
drop policy if exists campanhas_owner on campanhas;
create policy campanhas_owner on campanhas
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- === BLOCO 4: LIMPEZA DO TESTE DA TRIAGEM (14/11) ===
delete from fichas where modelo = 'triagem' and cliente_nome = 'Teste JARVIS';
