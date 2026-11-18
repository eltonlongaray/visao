# Financeiro do Falcon — plano

Aba 💰 **Financeiro** no menu de rolagem (entre Preparo Físico e Ajustes).
Tela: `js/screens/tela-financeiro.js`. Hoje é só a casca, com as abas
👤 Pessoal e 💼 Profissional no topo (padrão da Comunidade), marcadas como
"em desenvolvimento". Decisões do Élton em 18/11/2026.

## Base da lógica
A lógica vem da **planilha financeira pessoal do Élton** (ele vai mandar).
Nada de banco (tabelas/SQL) antes de ver a planilha, pra não refazer depois.

## 💼 Profissional
- Botão **"➕ Adicionar fonte de renda"**. Cada pessoa pode ter 1, 2, 3, 4, 5+ fontes.
  - Ex.: terapeuta = fonte "Clientes" (atendimentos) + fonte "Cursos" (alunas
    que fazem a especialidade no método dela).
- Cada fonte tem: **receitas**, **despesas** e o **pró-labore** dela.
- A fonte de clientes pode puxar sozinha o que já entra pela Agenda Online
  (`js/financeiro.js`: vendas/pacotes/produtos), pra ninguém lançar duas vezes.

## 👤 Pessoal
- **Pró-labore total = soma dos pró-labores de todas as fontes de renda.**
- **Despesas pessoais**, separadas das do trabalho (não misturar pessoal com profissional).

## Planejamentos (dentro do Financeiro)
- ✈️ **Planejamento financeiro para viagem**
- 🛟 **Organização da reserva financeira** (reserva de emergência)
- 📈 **Planejamento de investimentos no mercado financeiro**

Onde cada um fica (Pessoal, Profissional ou abas/seções próprias) decidir
junto com a planilha.

## Regras do projeto que valem aqui
- Toda função nova entra também no **Pet** (roteador `js/assistente-ia.js`,
  módulo `js/pet-*.js` e ação no Worker `cloudflare/pet-ia/`). Hoje o Pet só
  abre a aba ("abre o financeiro").
- Um PR por etapa; o Élton testa e dá OK antes da próxima.
- Repo é público: nunca dados reais de usuário aqui.
