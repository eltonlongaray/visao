# Migração Firebase → Supabase (Fase 2)

Script único que lê **Firestore + Firebase Auth** e grava tudo no **Postgres do Supabase**.
Não faz parte do app. Idempotente (usa `upsert`) — pode rodar de novo sem duplicar.

## 1. Pegar as 2 credenciais (sensíveis — NÃO commitar)

### a) Service account do Firebase
Firebase Console → ⚙️ **Configurações do projeto** → aba **Contas de serviço** →
**Gerar nova chave privada** → baixa o JSON → salva como:
```
migration/firebase-service-account.json
```
(já está no `.gitignore`)

### b) Service role key do Supabase
Supabase → **Settings → API** → seção **Project API keys** → a chave **`service_role`** (SECRETA).
Não é a `publishable`/`anon`. Ela bypassa o RLS — por isso o script consegue gravar dados de qualquer usuário.

## 2. Instalar e configurar

```bash
cd migration
npm install
```

Define as env vars (PowerShell):
```powershell
$env:SUPABASE_URL = "https://snbxaudykjpqqgocgaoz.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "COLE_A_SERVICE_ROLE_AQUI"
```

## 3. Rodar — SEMPRE dry-run primeiro

```bash
npm run dry-run     # só lê e mostra o que migraria (NÃO escreve nada)
```
Confere no resumo: nº de usuários, tasks, dias, categorias por usuário. Se bater com o esperado:

```bash
npm run migrate     # migra de verdade (cria usuários no Supabase + upsert dos dados)
```

## O que o script faz
1. Lista os usuários do Firebase Auth.
2. Pra cada um: cria o usuário no Supabase (por email, `email_confirm: true`) e mapeia `firebase_uid → supabase_uid`.
3. Lê os dados do Firestore (profile, shifts, categories, activities, days+tasks, weeks, consents).
4. Transforma pro formato Postgres e faz `upsert` (IDs do Firestore preservados).

## ⚠️ Dois pontos que exigem atenção

### Usuários do Google
Ao criar o usuário no Supabase com `email_confirm: true`, quando ele logar com Google (mesmo email),
o Supabase **vincula** ao usuário já criado (mesmo `uuid`) — então os dados migrados aparecem.
**Validar antes da virada:** migre 1 usuário Google de teste e confirme que, ao logar com Google,
cai na conta certa com os dados. (Se o Supabase criar um usuário DUPLICADO em vez de vincular,
habilitar linking automático em Auth settings.)

### Usuários de email/senha
O hash de senha do Firebase (scrypt) **não** migra direto. Plano seguro:
```bash
npm run migrate:reset-pw    # migra + manda email de "redefinir senha" pros usuários de email/senha
```
Eles definem senha nova no 1º acesso. (Usuários do Google não têm senha, não precisam disso.)

## Depois da migração
- Conferir no Supabase (Table Editor) se os dados chegaram.
- Só então fazer a virada (merge `supabase-migration` → `main` = deploy).
