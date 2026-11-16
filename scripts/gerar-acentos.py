"""Gera src/personalizar/acentos.ts: o desenho de cada acento de cada fonte de nome (extraído das letras acentuadas prontas da própria fonte).
As fontes não têm o glifo do acento solto e as letras com "onda" (variação de início/fim) não existem acentuadas; por isso o app desenha o acento por cima.
Uso:  python3 scripts/gerar-acentos.py ID=ARQUIVO:SS_DO_INICIO[:marcas] [...]
  ex.: python3 scripts/gerar-acentos.py creamCandy=CREAM_CANDY.OTF:ss03 angelinaMalika=ANGELINA_MALIKA.TTF:ss02:LiberationSans-Regular.ttf
  Sem "marcas": o acento é extraído da letra acentuada pronta da própria fonte (Cream Candy).
  Com "marcas" (um arquivo de fonte com ´ ` ˆ ˜ ¨ ¸): o acento é a marca dessa fonte, no tamanho/posição que o designer usou no Corel
  (Angelina Malika: os acentos da própria fonte são minúsculos e o designer usou o ´ da Arial; Liberation Sans é a fonte livre equivalente).
(precisa do fontTools; só o desenvolvedor roda, o app não)
"""
import sys, unicodedata
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen

# medidas tiradas do Corel do designer (acento ´ em Arial 33,378 pt sobre o nome em 34,62 pt, sobre o É)
ESCALA_MARCA = 33.378 / 34.62      # tamanho da marca em relação ao nome
FOLGA_EM = 0.098                    # folga entre o topo da letra e a base da marca, em em
DESLOCA_INICIO_EM = 0.15            # a marca da letra de início fica à direita do ponto mais alto da letra
MARCAS_COMBINANTES = {'\u0301': '\u00b4', '\u0300': '`', '\u0302': '\u02c6', '\u0303': '\u02dc', '\u0308': '\u00a8', '\u0327': '\u00b8'}

MARCAS = {'́', '̀', '̂', '̃', '̈', '̧'}

def feature(f, tag):
    gsub = f['GSUB'].table; out = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != tag: continue
        for li in fr.Feature.LookupListIndex:
            for st in gsub.LookupList.Lookup[li].SubTable:
                st = getattr(st, 'ExtSubTable', st)
                m = getattr(st, 'mapping', None)
                if m: out.update(m)
    return out

def processa(f, ss_inicio, arq_marcas=None):
    gs = f.getGlyphSet(); cm = f.getBestCmap(); hm = f['hmtx']
    upm_f = int(f['head'].unitsPerEm)
    if arq_marcas:
        M = TTFont(arq_marcas); mgs = M.getGlyphSet(); mcm = M.getBestCmap(); mupm = int(M['head'].unitsPerEm)

    def contornos(nome):
        p = DecomposingRecordingPen(gs); gs[nome].draw(p)
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

    def parecida(a, b):  # as fontes deslocam o corpo da letra em ~1 unidade nas versões acentuadas
        return all(abs(u - v) <= 4 for u, v in zip(a, b))

    def path(c):
        d = []
        for op, pts in c:
            s = ' '.join(f'{x} {y}' for x, y in pts)
            d.append({'moveTo': 'M', 'lineTo': 'L', 'curveTo': 'C', 'qCurveTo': 'Q', 'closePath': 'Z', 'endPath': ''}[op] + s)
        return ''.join(d)

    def pontos(nome, conjunto=None):
        p = DecomposingRecordingPen(conjunto or gs); (conjunto or gs)[nome].draw(p)
        return [a for _, args in p.value for a in args if a is not None]

    alt = feature(f, ss_inicio)

    def marca_externa(ch, dec):
        base = dec[0]; b = cm.get(ord(base))
        P = pontos(b); xs = [x for x, _ in P]; ys = [y for _, y in P]
        k = ESCALA_MARCA * upm_f / mupm            # unidades da fonte por unidade da fonte das marcas
        mg = mcm[ord(MARCAS_COMBINANTES[dec[1]])]
        MP = pontos(mg, mgs); mx = [x for x, _ in MP]; my = [y for _, y in MP]
        centro_marca = (min(mx) + max(mx)) / 2 * k
        if dec[1] == '\u0327':                      # cedilha: pendura da linha de base
            ty = -min(my) * k * 0 + 0
            ty = 0
            tx = (min(xs) + max(xs)) / 2 - centro_marca
        else:
            ty = max(ys) + FOLGA_EM * upm_f - min(my) * k
            tx = (min(xs) + max(xs)) / 2 - centro_marca
        # a marca, desenhada na fonte das marcas, escalada e posta sobre a letra comum (mesma origem da letra)
        rp = RecordingPen(); mgs[mg].draw(rp)
        return rp.value, k, tx, ty

    res = {}
    for cp, g in sorted(cm.items()):
        ch = chr(cp); dec = unicodedata.normalize('NFD', ch)
        if len(dec) != 2 or dec[1] not in MARCAS: continue
        b = cm.get(ord(dec[0]))
        if not b: continue
        # i minúsculo: o acento substitui o pingo, então a letra pronta da fonte é a certa (não há "i sem pingo")
        if dec[0] == 'i': continue
        if arq_marcas:
            if dec[1] not in MARCAS_COMBINANTES: continue
            valor, k, tx, ty = marca_externa(ch, dec)
            contornos_marca, cur = [], []
            for op, args in valor:
                cur.append((op, tuple((round(x * k + tx), round(y * k + ty)) for x, y in args if x is not None)))
                if op in ('closePath', 'endPath'): contornos_marca.append(cur); cur = []
            res[ch] = ''.join(path(c) for c in contornos_marca)
            continue
        base = [caixa(c) for c in contornos(b)]
        acento = [c for c in contornos(g) if not any(parecida(caixa(c), x) for x in base)]
        if not acento: print('  sem acento achado:', ch); continue
        res[ch] = ''.join(path(c) for c in acento)

    # Letras de início: a onda fica à esquerda e o corpo da letra é empurrado para a direita (a diferença de largura entre a letra com onda e a comum);
    # o acento precisa acompanhar. Conferido contra os contornos (±2 unidades). Letras de fim: o corpo fica na mesma origem (sem deslocamento).
    inicio = {c: hm[alt[c]][0] - hm[cm[ord(c)]][0] for c in sorted(alt) if len(c) == 1 and c.isalpha() and ord(c) in cm}
    if arq_marcas:
        # a letra de início é redesenhada (a onda vem junto): a marca acompanha o ponto mais alto do corpo (à direita da onda), mais um respiro
        novo = {}
        for c in inicio:
            n = alt[c]; P = pontos(n); d = inicio[c]
            corpo = [p for p in P if p[0] >= d * 0.9] or P
            topo = max(corpo, key=lambda p: p[1])
            Pb = pontos(cm[ord(c)]); xs = [x for x, _ in Pb]
            novo[c] = round(topo[0] + DESLOCA_INICIO_EM * upm_f - (min(xs) + max(xs)) / 2 + (min(xs) + max(xs)) / 2 - (min(xs) + max(xs)) / 2)
        inicio = novo
    return int(f['head'].unitsPerEm), res, inicio

linhas = ['// GERADO por scripts/gerar-acentos.py — não editar à mão.',
          '// Por fonte: desenho (em unidades da fonte, y para cima) de cada acento, que se sobrepõe à letra sem acento com a mesma origem,',
          '// e quanto o corpo da letra anda para a direita na variação de início.',
          'export interface AcentosDaFonte {',
          '  /** Unidades por em da fonte. */',
          '  upm: number;',
          '  acentos: Readonly<Record<string, string>>;',
          '  inicio: Readonly<Record<string, number>>;',
          '}',
          'export const FONTES_ACENTOS: Readonly<Record<string, AcentosDaFonte>> = {']
for arg in sys.argv[1:]:
    ident, resto = arg.split('=', 1); partes = resto.split(':')
    arquivo, ss = partes[0], partes[1]; marcas = partes[2] if len(partes) > 2 else None
    print(ident, arquivo, ss, marcas or '')
    upm, res, inicio = processa(TTFont(arquivo), ss, marcas)
    print(' ', len(res), 'letras acentuadas;', len(inicio), 'letras de início')
    linhas.append(f'  {ident}: {{')
    linhas.append(f'    upm: {upm},')
    linhas.append('    acentos: {')
    for ch, d in res.items(): linhas.append(f"      '{ch}': '{d}',")
    linhas.append('    },')
    linhas.append('    inicio: {')
    for c, v in inicio.items(): linhas.append(f"      {c}: {v},")
    linhas.append('    },')
    linhas.append('  },')
linhas.append('};')
open('src/personalizar/acentos.ts', 'w').write('\n'.join(linhas) + '\n')
