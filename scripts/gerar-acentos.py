"""Gera src/personalizar/acentos.ts: o desenho de cada acento da Cream Candy (extraído das letras acentuadas prontas da própria fonte).
A fonte não tem o glifo do acento solto e as letras com "onda" (ss02/ss03) não existem acentuadas; por isso o app desenha o acento por cima.
Uso: python3 scripts/gerar-acentos.py CREAM_CANDY.OTF   (precisa do fontTools; só o desenvolvedor roda, o app não)
"""
import sys, unicodedata
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

MARCAS = {'́', '̀', '̂', '̃', '̈', '̧'}
f = TTFont(sys.argv[1]); gs = f.getGlyphSet(); cm = f.getBestCmap()

def contornos(nome):
    p = RecordingPen(); gs[nome].draw(p)
    out, cur = [], []
    for op, args in p.value:
        cur.append((op, tuple((round(x), round(y)) for x, y in args)))
        if op in ('closePath', 'endPath'):
            out.append(cur); cur = []
    return out

def caixa(c):
    pts = [p for _, a in c for p in a]
    xs = [x for x, _ in pts]; ys = [y for _, y in pts]
    return (min(xs), min(ys), max(xs), max(ys))

def parecida(a, b):  # a fonte desloca o corpo da letra em ~1 unidade nas versões acentuadas
    return all(abs(u - v) <= 4 for u, v in zip(a, b))

def path(c):
    d = []
    for op, pts in c:
        s = ' '.join(f'{x} {y}' for x, y in pts)
        d.append({'moveTo': 'M', 'lineTo': 'L', 'curveTo': 'C', 'qCurveTo': 'Q', 'closePath': 'Z', 'endPath': ''}[op] + s)
    return ''.join(d)

res = {}
for cp, g in sorted(cm.items()):
    ch = chr(cp); dec = unicodedata.normalize('NFD', ch)
    if len(dec) != 2 or dec[1] not in MARCAS: continue
    b = cm.get(ord(dec[0]))
    if not b: continue
    # i minúsculo: o acento substitui o pingo, então a letra pronta da fonte é a certa (não há "i sem pingo")
    if dec[0] == 'i': continue
    base = [caixa(c) for c in contornos(b)]
    acento = [c for c in contornos(g) if not any(parecida(caixa(c), x) for x in base)]
    if not acento: print('sem acento achado:', ch); continue
    res[ch] = ''.join(path(c) for c in acento)

linhas = [
    '// GERADO por scripts/gerar-acentos.py — não editar à mão.',
    '// Desenho (em unidades da fonte, 1000 = 1em, y para cima) de cada acento: sobrepõe-se à letra sem acento, com a mesma origem.',
    'export const ACENTOS: Readonly<Record<string, string>> = {',
]
for ch, d in res.items():
    linhas.append(f"  '{ch}': '{d}',")
linhas.append('};')
open('src/personalizar/acentos.ts', 'w').write('\n'.join(linhas) + '\n')
print(len(res), 'letras:', ''.join(res))
