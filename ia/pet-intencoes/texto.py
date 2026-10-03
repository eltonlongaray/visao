"""Normalização e extração de features do texto.

Tudo aqui tem um gêmeo em pet-intencao.js. Se mudar uma regra aqui, mude lá
também: o modelo só funciona no navegador se as features forem idênticas.
"""
import re
import unicodedata

# Abreviações de chat que mudam o token mas não a intenção
ABREV = {
    'vc': 'voce', 'vcs': 'voces', 'pq': 'porque', 'q': 'que', 'tb': 'tambem',
    'tbm': 'tambem', 'hj': 'hoje', 'amnh': 'amanha', 'qdo': 'quando',
    'qto': 'quanto', 'qnto': 'quanto', 'msg': 'mensagem', 'td': 'tudo',
    'blz': 'beleza', 'obg': 'obrigado', 'vlw': 'valeu', 'p': 'pra', 'pro': 'pra',
}


def normalizar(texto: str) -> str:
    t = unicodedata.normalize('NFD', str(texto).lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')  # tira acento
    t = re.sub(r'\d+', '0', t)            # 8h, 15:30, 12/10 → 0h, 0:0, 0/0
    t = re.sub(r'[^a-z0 ]+', ' ', t)      # pontuação vira espaço
    palavras = [ABREV.get(p, p) for p in t.split()]
    return ' '.join(palavras)


def features(texto: str) -> list[str]:
    """Palavras, pares de palavras e trigramas de letras (pega erro de digitação)."""
    palavras = normalizar(texto).split()
    feats = ['w:' + p for p in palavras]
    feats += ['b:' + a + '_' + b for a, b in zip(palavras, palavras[1:])]
    for p in palavras:
        s = ' ' + p + ' '
        feats += ['c:' + s[i:i + 3] for i in range(len(s) - 2)]
    return feats
