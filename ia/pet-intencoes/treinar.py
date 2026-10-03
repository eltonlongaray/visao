"""Treina o classificador de intenção do Pet e exporta pro navegador.

Modelo: TF-IDF (features de texto.py) + Regressão Logística multinomial.
- Validação cruzada (5 folds) nas frases geradas.
- Teste nas frases escritas à mão (dados/teste_real.csv), que não saem dos modelos.
  Os erros desse teste guiaram a v2 dos modelos, então ele virou conjunto de ajuste.
- Teste cego (dados/teste_real_v2.csv): escrito antes de mexer nos modelos da v2,
  nunca usado pra ajustar nada. É o número honesto.
- Limiar de confiança: abaixo dele o Pet diz que não entendeu (ou cai no regex).

Saídas: modelo/pet-intencoes.json (pesos) e modelo/relatorio.txt.
Uso: python3 treinar.py
"""
import csv
import json
import math
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline

from texto import features

AQUI = Path(__file__).parent
MIN_DF = 2       # feature precisa aparecer em 2+ frases (corta ruído e tamanho)
C = 10.0         # regularização L2 (maior = menos regularização)
CASAS = 4        # casas decimais no JSON exportado


def ler(nome):
    with (AQUI / 'dados' / nome).open(encoding='utf-8') as f:
        linhas = list(csv.DictReader(f))
    return [l['frase'] for l in linhas], [l['intencao'] for l in linhas]


def novo_modelo():
    return make_pipeline(
        TfidfVectorizer(analyzer=features, min_df=MIN_DF),
        LogisticRegression(C=C, max_iter=3000),
    )


def main():
    X, y = ler('frases.csv')
    Xt, yt = ler('teste_real.csv')
    rel = []

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    notas = cross_val_score(novo_modelo(), X, y, cv=cv, scoring='accuracy')
    rel.append(f'Validação cruzada (5 folds, frases geradas): {notas.mean():.3f} ± {notas.std():.3f}')

    modelo = novo_modelo().fit(X, y)
    vet, clf = modelo.named_steps['tfidfvectorizer'], modelo.named_steps['logisticregression']

    # Teste real: separa as frases fora do escopo pra calibrar o limiar
    dentro = [(f, i) for f, i in zip(Xt, yt) if i != 'fora']
    fora = [f for f, i in zip(Xt, yt) if i == 'fora']
    prob_dentro = modelo.predict_proba([f for f, _ in dentro])
    prob_fora = modelo.predict_proba(fora)
    pred = clf.classes_[prob_dentro.argmax(1)]
    acerto = np.mean(pred == np.array([i for _, i in dentro]))
    rel.append(f'Teste com frases escritas à mão ({len(dentro)} frases): {acerto:.3f}')

    # Limiar: o menor que deixa no máximo 1 frase "fora" passar como comando
    melhor = None
    ok_fora = lambda prob: clf.classes_[prob.argmax(1)] != 'fora'
    for lim in np.arange(0.20, 0.80, 0.01):
        aceitas = (prob_dentro.max(1) >= lim) & ok_fora(prob_dentro)
        cobertura = aceitas.mean()
        acerto_aceitas = np.mean(pred[aceitas] == np.array([i for _, i in dentro])[aceitas]) if aceitas.any() else 0
        fora_passou = int(((prob_fora.max(1) >= lim) & ok_fora(prob_fora)).sum())
        if fora_passou <= 1:
            melhor = (round(float(lim), 2), cobertura, acerto_aceitas, fora_passou)
            break
    limiar = melhor[0] if melhor else 0.5
    if melhor:
        rel.append(f'Limiar de confiança: {limiar} → responde {melhor[1]:.0%} das frases, '
                   f'acerta {melhor[2]:.0%} delas; frases fora do escopo que passaram: {melhor[3]}/{len(fora)}')

    rel.append('\nPor intenção (teste à mão, sem limiar):')
    rel.append(classification_report([i for _, i in dentro], pred, zero_division=0))
    rel.append('Erros no teste à mão:')
    for (f, i), p, pr in zip(dentro, pred, prob_dentro.max(1)):
        if p != i:
            rel.append(f'  "{f}" → previu {p} ({pr:.2f}), era {i}')
    rel.append('\nConfiança nas frases fora do escopo:')
    for f, pr, c in zip(fora, prob_fora.max(1), clf.classes_[prob_fora.argmax(1)]):
        rel.append(f'  "{f}" → {c} ({pr:.2f})')

    # Exporta: vocabulário na ordem das colunas, idf e pesos
    vocab = sorted(vet.vocabulary_, key=vet.vocabulary_.get)
    exp = {
        'versao': 2,
        'classes': clf.classes_.tolist(),
        'limiar': limiar,
        'vocab': vocab,
        'idf': [round(float(v), CASAS) for v in vet.idf_],
        'coef': [[round(float(v), CASAS) for v in linha] for linha in clf.coef_],
        'intercept': [round(float(v), CASAS) for v in clf.intercept_],
    }
    saida = AQUI / 'modelo' / 'pet-intencoes.json'
    saida.write_text(json.dumps(exp, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    rel.append(f'\nModelo exportado: {len(vocab)} features × {len(exp["classes"])} intenções, '
               f'{saida.stat().st_size / 1024:.0f} KB → {saida.name}')

    # Gabarito pro teste de paridade com o JS
    gabarito = [{'frase': f, 'intencao': clf.classes_[p.argmax()], 'conf': round(float(p.max()), 4)}
                for f, p in zip(Xt + ler('teste_real_v2.csv')[0],
                                modelo.predict_proba(Xt + ler('teste_real_v2.csv')[0]))]
    (AQUI / 'modelo' / 'gabarito-paridade.json').write_text(
        json.dumps(gabarito, ensure_ascii=False, indent=0), encoding='utf-8')

    # Teste cego v2 (com o limiar escolhido acima)
    Xc, yc = ler('teste_real_v2.csv')
    dc = [(f, i) for f, i in zip(Xc, yc) if i != 'fora']
    fc = [f for f, i in zip(Xc, yc) if i == 'fora']
    pc = modelo.predict_proba([f for f, _ in dc])
    predc = clf.classes_[pc.argmax(1)]
    acc = np.mean(predc == np.array([i for _, i in dc]))
    aceitas = (pc.max(1) >= limiar) & ok_fora(pc)
    acc_lim = np.mean(predc[aceitas] == np.array([i for _, i in dc])[aceitas]) if aceitas.any() else 0
    pfc = modelo.predict_proba(fc)
    fora_c = int(((pfc.max(1) >= limiar) & ok_fora(pfc)).sum())
    rel.append(f'\nTESTE CEGO v2 ({len(dc)} frases): acerto {acc:.3f}; com limiar responde '
               f'{aceitas.mean():.0%} e acerta {acc_lim:.0%}; fora do escopo que passaram: {fora_c}/{len(fc)}')
    for (f, i), p, pr in zip(dc, predc, pc.max(1)):
        if p != i:
            rel.append(f'  "{f}" → previu {p} ({pr:.2f}), era {i}')
    for f, p in zip(fc, modelo.predict_proba(fc)):
        rel.append(f'  fora: "{f}" → {clf.classes_[p.argmax()]} ({p.max():.2f})')

    texto = '\n'.join(rel)
    (AQUI / 'modelo' / 'relatorio.txt').write_text(texto + '\n', encoding='utf-8')
    print(texto)


if __name__ == '__main__':
    main()
