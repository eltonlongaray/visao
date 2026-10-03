# Classificador de intenção do Pet (NLP do zero)

Primeiro passo pra tirar o Pet do regex: um modelo **nosso**, treinado com scikit-learn, que lê a frase e diz qual comando a pessoa quer. Ele roda **no navegador**, sem servidor, sem API e sem custo.

## Como funciona
1. `gerar_dataset.py` cria ~2.400 frases a partir de modelos com lacunas (`marcar {ativ} {dia} {hora}`), com variação de escrita de chat (sem acento, "vc", "pfv"...).
2. `texto.py` normaliza a frase e extrai as features: palavras, pares de palavras e trigramas de letras (pega erro de digitação).
3. `treinar.py` treina TF-IDF + Regressão Logística, faz validação cruzada, testa em frases escritas à mão (`dados/teste_real.csv`), escolhe o limiar de confiança e exporta `modelo/pet-intencoes.json`.
4. `pet-intencao.js` carrega o JSON e classifica no navegador. `testar_paridade.mjs` confere que o JS dá o mesmo resultado que o Python.

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

## Intenções
agendar, editar_nome, editar_horario, editar_descricao, reagendar, lembrete_ligar, lembrete_desligar, repetir, consultar_sono, consultar_sequencia, consultar_agua, consultar_tarefas, ajuda_notificacoes, ajuda, saudacao.

Data, hora e nome da atividade continuam saindo dos extratores que já existem em `js/assistente-ia.js` (`extractDate`, `extractTime`, `extractTaskName`). O classificador só decide **o que** fazer.

## Próximos passos
- Melhorar negação e frases compostas (mais exemplos, bigramas com "não").
- Ligar no Pet: quando o regex não entender, pergunta pro classificador; se a confiança for baixa, mostra opções ("você quis dizer...?").
- 👍/👎 nas respostas pra coletar frases reais (com consentimento) e re-treinar.
- Depois: comparar com um BERT em português (BERTimbau) ajustado pra mesma tarefa.

Esta pasta não vai pro ar (está no `ignore` do `firebase.json`). Quando o modelo for ligado no app, o JSON e o JS vão pra `js/`.
