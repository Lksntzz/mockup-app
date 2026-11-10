"""Gera pack/especificacao (mockup de especificação) a partir dos dois PSDs: VT (com envelope/canguru) e SEM CANGURU.

Uso: python tools/export_pack_especificacao.py ESPEC_VT.psd ESPEC_SEM_CANGURU.psd PASTA_DE_SAIDA

A agenda em si (fundo, wire-o, capa, elástico, tassel) vem do PSD VT e é igual nos dois; o que muda é por variante:
  vt           -> DETALHES (setas, textos e a foto do envelope) + dois círculos de zoom
  sem-canguru  -> dois anéis com texto + dois círculos de zoom dentro deles
Os círculos de zoom não usam as fotos do PSD: o motor recorta um trecho da própria capa montada.
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_pack import export_pack  # noqa: E402

# Trechos do mockup (1200x1200) que viram zoom, achados comparando com os círculos do PSD de referência.
FONTE_ANEL = (10, 909, 276, 274)        # wire-o + faixa amarela + borda de baixo
FONTE_CAPA_DURA = (699, 1017, 182, 183)  # elástico + borda de baixo/direita

ZOOM_VT = {"CAMADA 42": FONTE_ANEL, "CAMADA 44": FONTE_CAPA_DURA}
ZOOM_SC = {"CAMADA 37": FONTE_ANEL, "CAMADA 38": FONTE_CAPA_DURA}


def _fonte(base, largura, altura):
    """Mesmo centro e largura da fonte base, com a altura ajustada à proporção do círculo."""
    x, y, w, h = base
    novo_h = round(w * altura / largura)
    cy = y + h / 2
    return {"x": x, "y": max(0, round(cy - novo_h / 2)), "width": w, "height": novo_h}


def _entrada_de_zoom(ident, arquivo, offset, fonte, variante):
    return {"id": ident, "role": "zoom", "file": arquivo, "opacity": 1.0, "blend": "normal",
            "offset": list(offset), "source": fonte, "variant": variante}


def _disco_branco(img: Image.Image) -> Image.Image:
    """Máscara (alfa) do maior miolo branco do anel; é onde o zoom entra."""
    a = np.array(img.convert("RGBA"))
    branco = (a[..., :3].min(axis=2) >= 250) & (a[..., 3] == 255)
    rotulos, n = ndimage.label(branco)
    if n == 0:
        raise ValueError("não achei o miolo branco do anel")
    tamanhos = ndimage.sum(branco, rotulos, range(1, n + 1))
    miolo = ndimage.binary_fill_holes(rotulos == (int(np.argmax(tamanhos)) + 1))
    alfa = Image.fromarray((miolo * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    caixa = alfa.point(lambda v: 255 if v > 0 else 0).getbbox()
    alfa = alfa.crop(caixa)
    mascara = Image.new("RGBA", alfa.size, (255, 255, 255, 0))
    mascara.putalpha(alfa)
    return mascara, (caixa[0], caixa[1])


def export_especificacao(psd_vt, psd_sc, out_dir):
    out = Path(out_dir)
    camadas = out / "layers"
    zooms_vt = []

    def hook_vt(grupo, nome, ctx):
        if nome == "DETALHES":
            ctx.adicionar(grupo, "detalhes", variante="vt")
        elif nome in ("CAMADA 39", "CAMADA 40"):
            pass  # desligadas no PSD
        elif nome == "MARCA D AGUA":
            for c in grupo:
                ctx.adicionar(c, "marca")
        elif nome in ZOOM_VT:
            r = ctx.renderizar(grupo)
            if r is not None:
                img, (x, y) = r
                mascara = Image.new("RGBA", img.size, (255, 255, 255, 0))
                mascara.putalpha(img.getchannel("A"))
                ident = f"zoom-vt-{len(zooms_vt) + 1:02d}"
                mascara.save(ctx.camadas_dir / f"{ident}.png", optimize=True)
                zooms_vt.append(_entrada_de_zoom(ident, f"{ident}.png", (x, y), _fonte(ZOOM_VT[nome], *img.size), "vt"))
        else:
            return False
        return True

    pack = export_pack(psd_vt, out, ignorados=set(), extras=hook_vt, contra_capa_em_branco=True)

    # anéis da variante sem canguru, lidos do outro PSD
    with tempfile.TemporaryDirectory() as tmp:
        aneis = []

        def hook_sc(grupo, nome, ctx):
            if nome in ZOOM_SC:
                ctx.adicionar(grupo, "anel", variante="sem-canguru")
                aneis.append(nome)
            # DETALHES (desligada), marca d'água e o resto já vêm do PSD VT
            return True

        # o resto do PSD é ignorado: só interessam os anéis
        sc = export_pack(psd_sc, tmp, ignorados=set(), extras=hook_sc, contra_capa_em_branco=True)
        entradas = [e for e in sc["stack"] if e.get("variant") == "sem-canguru"]
        zooms_sc = []
        for e, nome in zip(entradas, aneis):
            shutil.copy(Path(tmp) / "layers" / e["file"], camadas / e["file"])
            img = Image.open(camadas / e["file"])
            mascara, (mx, my) = _disco_branco(img)
            ident = f"zoom-sc-{len(zooms_sc) + 1:02d}"
            mascara.save(camadas / f"{ident}.png", optimize=True)
            zooms_sc.append(_entrada_de_zoom(ident, f"{ident}.png", (e["offset"][0] + mx, e["offset"][1] + my),
                                             _fonte(ZOOM_SC[nome], *mascara.size), "sem-canguru"))

    stack = pack["stack"]
    pos_marca = next(i for i, c in enumerate(stack) if c["id"].startswith("marca"))
    stack[pos_marca:pos_marca] = entradas
    stack.extend(zooms_vt)
    stack.extend(zooms_sc)
    (out / "mockup.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")
    return pack


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("uso: python tools/export_pack_especificacao.py ESPEC_VT.psd ESPEC_SEM_CANGURU.psd PASTA_DE_SAIDA")
    p = export_especificacao(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"ok: {len(p['stack'])} camadas no stack")
