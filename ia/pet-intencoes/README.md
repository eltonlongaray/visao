# Classificador de intenção do Pet (NLP do zero)

Primeiro passo pra tirar o Pet do regex: um modelo **nosso**, treinado com scikit-learn, que lê a frase e diz qual comando a pessoa quer. Ele roda **no navegador**, sem servidor, sem API e sem custo.

## Como funciona
1. `gerar_dataset.py` cria ~2.400 frases a partir de modelos com lacunas (`marcar {ativ} {dia} {hora}`), com variação de escrita de chat (sem acento, "vc", "pfv"...).
2. `texto.py` normaliza a frase e extrai as features: palavras, pares de palavras e trigramas de letras (pega erro de digitação).
3. `treinar.py` treina TF-IDF + Regressão Logística, faz validação cruzada, testa em frases escritas à mão (`dados/teste_real.csv`), escolhe o limiar de confiança e exporta os pesos pra `js/pet-ia/pet-intencoes-modelo.js`.
4. `js/pet-ia/pet-intencao.js` carrega os pesos e classifica no navegador. `testar_paridade.mjs` confere que o JS dá o mesmo resultado que o Python.

## Rodar
```bash
pip install -r requirements.txt
python3 gerar_dataset.py
python3 treinar.py          # imprime métricas e grava modelo/relatorio.txt
node testar_paridade.mjs    # JS == Python
```

## Resultado da versão 1
Veja `modelo/relatorio.txt`. Resumo:
- Validação cruzada nas frases geradas: ~100%. Esse número **engana**: o modelo está sendo testado em frases que saem dos mesmos modelos do treino.
- Frases escritas à mão (o número que importa): **~91%** de acerto.
- Maior confusão: ligar × desligar lembrete ("chega de lembrete", "não quero mais aviso"). Negação é o ponto fraco de TF-IDF.

## Resultado da versão 2 (negação + "fora do escopo")
- Novos modelos de frase pra negação ("chega de lembrete", "não me avisa mais"), troca de horário ("às 9 em vez das 8"), "próximo compromisso" e pedido de ajuda solto ("socorro", "não entendi nada").
- Nova classe **fora**: pedidos que não são do app (clima, conta, piada, futebol). O JS trata como "não entendi".
- Como os erros do `teste_real.csv` guiaram a v2, ele virou conjunto de ajuste. O número honesto agora vem do **teste cego** `dados/teste_real_v2.csv` (52 frases escritas antes de mexer nos modelos).
- Teste cego: **94%** de acerto; com o limiar, responde 98% e acerta 96%; **0 de 4** pedidos fora do escopo passaram como comando (na v1 passavam 3 de 4).
- Ainda erra: "o celular não avisa os lembretes" (acha que é desligar lembrete), "academia agora se chama treino funcional", "eae".

## Intenções
agendar, editar_nome, editar_horario, editar_descricao, reagendar, lembrete_ligar, lembrete_desligar, repetir, consultar_sono, consultar_sequencia, consultar_agua, consultar_tarefas, ajuda_notificacoes, ajuda, saudacao, fora.

Data, hora e nome da atividade continuam saindo dos extratores que já existem em `js/assistente-ia.js` (`extractDate`, `extractTime`, `extractTaskName`). O classificador só decide **o que** fazer.

## Próximos passos
- 👍/👎 nas respostas pra coletar frases reais (com consentimento) e re-treinar.
- Depois: comparar com um BERT em português (BERTimbau) ajustado pra mesma tarefa.

## No app
O Pet usa o classificador quando o regex de `js/assistente-ia.js` não entende a frase (só em português). Confiança alta executa; baixa mostra "você quis dizer...?"; "fora" responde que isso não é com ele. Agendar e lembrete executam com card de confirmação; edições ainda pedem a frase no formato exato (o classificador sabe **o que** a pessoa quer, mas ainda não extrai o nome da atividade com segurança).

Esta pasta (dados e treino) não vai pro ar: está no `ignore` do `firebase.json`. Só `js/pet-ia/` vai.
