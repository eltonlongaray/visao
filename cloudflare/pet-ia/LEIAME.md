# pet-ia — IA de linguagem do Pet (Cloudflare Workers AI)

O Pet usa este Worker só quando ele mesmo não entendeu a frase. O Worker devolve um JSON
com a ação (agendar, lista, treino…) e o app executa com o card de confirmação de sempre.

- **Modelo:** Llama 3.1 8B (aberto), rodando na Cloudflare.
- **Custo:** grátis até 10.000 "neurons" por dia, o que dá uns mil pedidos.
  - No plano Free, passando disso a Cloudflare recusa o pedido e o Pet volta pro modo de sempre, então não gera cobrança.
- **Chaves:** nenhuma no código. O modelo entra pelo binding `AI`. O login é conferido no Supabase com a chave publicável, que já é pública no app.

## Publicar pelo painel (sem instalar nada)

1. Criar conta grátis em https://dash.cloudflare.com.
2. **Workers & Pages → Create → Create Worker.** Nome: `pet-ia` → **Deploy**.
3. **Edit code:** apagar tudo, colar o conteúdo de `worker.js` → **Deploy**.
4. **Settings → Bindings → Add → Workers AI.** Variable name: `AI` → Save.
5. **Settings → Variables and Secrets → Add**, as duas do tipo *Text*:
   - `SUPABASE_URL` = `https://snbxaudykjpqqgocgaoz.supabase.co`
   - `SUPABASE_KEY` = a chave publicável que está em `js/config-supabase.js`
6. Copiar o endereço do Worker (ex.: `https://pet-ia.SEU-USUARIO.workers.dev`) e colar em `PET_IA_URL`, no arquivo `js/pet-nuvem.js`.

## Ou pelo terminal

```
cd cloudflare/pet-ia
npx wrangler login
npx wrangler deploy
```

## Testar

Logado no app, abre o Pet e manda uma frase "falada":
- "acabou o leite e o café, anota aí pro mercado"
- "quem ganhou o jogo ontem?"

Se a nuvem estiver fora, o Pet responde como antes.
