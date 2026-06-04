# === BLOCO 1: GERADOR DE ÍCONES PWA ===
# Cria PNGs (192, 512, maskable-192, maskable-512) com gradiente roxo→azul e olho estilizado
import os
from PIL import Image, ImageDraw

OUT = os.path.dirname(os.path.abspath(__file__))
ACCENT = (124, 58, 237)
BLUE   = (79, 70, 229)
WHITE  = (255, 255, 255)
DARK   = (10, 14, 26)


# === BLOCO 2: HELPERS DE PINTURA ===
def make_gradient(size, c1, c2):
    img = Image.new('RGB', (size, size), c1)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)
            px[x, y] = (r, g, b)
    return img


def draw_eye(img, padding_ratio=0.18):
    size = img.size[0]
    d = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    eye_w = size - 2 * pad
    eye_h = int(eye_w * 0.55)
    cx, cy = size // 2, size // 2
    bbox = [cx - eye_w // 2, cy - eye_h // 2, cx + eye_w // 2, cy + eye_h // 2]
    # Camada branca (esclera)
    d.ellipse(bbox, fill=WHITE)
    # Iris
    iris_r = int(eye_h * 0.42)
    d.ellipse([cx - iris_r, cy - iris_r, cx + iris_r, cy + iris_r], fill=ACCENT)
    # Pupila
    pup_r = int(iris_r * 0.45)
    d.ellipse([cx - pup_r, cy - pup_r, cx + pup_r, cy + pup_r], fill=DARK)
    # Reflexo
    refl_r = max(2, int(pup_r * 0.4))
    rx = cx - pup_r + refl_r
    ry = cy - pup_r + refl_r
    d.ellipse([rx - refl_r, ry - refl_r, rx + refl_r, ry + refl_r], fill=WHITE)
    return img


# === BLOCO 3: GERADOR PRINCIPAL ===
def make_icon(size, maskable=False):
    img = make_gradient(size, ACCENT, BLUE).convert('RGBA')
    pad = 0.26 if maskable else 0.16
    draw_eye(img, padding_ratio=pad)
    return img


specs = [
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('icon-maskable-192.png', 192, True),
    ('icon-maskable-512.png', 512, True),
    ('apple-touch-icon.png', 180, False),
    ('favicon-32.png', 32, False),
]
for fname, size, mask in specs:
    img = make_icon(size, mask)
    img.save(os.path.join(OUT, fname), 'PNG')
    suffix = ' maskable' if mask else ''
    print(f'OK {fname} ({size}x{size}{suffix})')
print('Todos os ícones gerados!')
