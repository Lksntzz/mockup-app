"""Gera pack/verso (mockup da agenda de costas) a partir do PSD MKP_VERSO.

Uso: python tools/export_pack_verso.py MKP_VERSO.psd PASTA_DE_SAIDA

TROCA A CAPA  -> arte grande (página par do PDF); sai na ordem de leitura, sem o espelhamento do PSD.
CONTRA CAPA   -> faixa fina da esquerda (capa ímpar); mantém a ordem do PSD, que é o lado certo da capa.
O PSD só tem wire-o branco/preto, elástico branco/rosa/azul/verde/preto e nenhum tassel.
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_pack import BLEND, OPCOES, _id_da_opcao, _renderizar  # noqa: E402

OPCOES_VERSO = {
    "wireo": [o for o in OPCOES["wireo"] if o[0] in ("branco", "preto")],
    "elastico": [o for o in OPCOES["elastico"] if o[0] not in ("laranja",)],
    "tassel": [("nenhum", "Nenhum", "#ffffff")],
}


def _cantos(caixa):
    return [[caixa[i], caixa[i + 1]] for i in range(0, 8, 2)]


def export_verso(psd_path, out_dir):
    psd = PSDImage.open(str(psd_path))
    out = Path(out_dir)
    camadas = out / "layers"
    camadas.mkdir(parents=True, exist_ok=True)
    largura, altura = psd.size
    stack = []
    contador = {}

    def adicionar(camada, prefixo, when=None, em_branco=False):
        if not camada.visible:
            return None
        if camada.kind not in ("pixel", "smartobject"):
            raise ValueError(f"camada '{camada.name}' do tipo {camada.kind} não é suportada")
        if camada.blend_mode.name not in BLEND:
            raise ValueError(f"modo de mistura {camada.blend_mode.name} da camada '{camada.name}' não é suportado")
        if camada.width == 0 or camada.height == 0:
            return None
        r = _renderizar(camada, largura, altura, em_branco)
        if r is None:
            return None
        img, (x, y) = r
        contador[prefixo] = contador.get(prefixo, 0) + 1
        ident = f"{prefixo}-{contador[prefixo]:02d}"
        img.save(camadas / f"{ident}.png", optimize=True)
        entrada = {"id": ident, "role": "fixed", "file": f"{ident}.png", "opacity": round(camada.opacity / 255, 4),
                   "blend": BLEND[camada.blend_mode.name], "offset": [x, y]}
        if when:
            entrada["when"] = dict(when)
        stack.append(entrada)
        return entrada

    arte = verso = mascara_arte = None
    for grupo in psd:
        nome = grupo.name.strip().upper()
        if nome == "BG":
            for c in grupo:
                adicionar(c, "fundo")
        elif nome == "CONTRA CAPA":
            entrada = adicionar(grupo, "contracapa", em_branco=True)
            caixa = grupo.smart_object.transform_box
            interno = PSDImage.open(io.BytesIO(grupo.smart_object.data))
            verso = {"corners": _cantos(caixa), "size": {"width": interno.width, "height": interno.height},
                     "mask": {"file": entrada["file"], "offset": entrada["offset"]}}
            stack.append({"id": "arte-verso", "role": "back-art", "opacity": 1.0, "blend": "multiply", "offset": [0, 0]})
        elif nome in ("WIRE-O PRETO", "WIRE-O BRANCO"):
            cor = "preto" if nome.endswith("PRETO") else "branco"
            for c in grupo:
                adicionar(c, f"wireo-{cor}", when={"wireo": cor})
        elif nome == "TROCA A CAPA":
            p = _cantos(grupo.smart_object.transform_box)
            interno = PSDImage.open(io.BytesIO(grupo.smart_object.data))
            m = grupo.mask
            m.topil().save(camadas / "mascara-arte.png", optimize=True)
            # o PSD guarda os cantos espelhados (TR, TL, BL, BR); a arte entra na ordem de leitura (TL, TR, BR, BL)
            arte = {"corners": [p[1], p[0], p[3], p[2]], "size": {"width": interno.width, "height": interno.height}}
            mascara_arte = {"file": "mascara-arte.png", "offset": [m.bbox[0], m.bbox[1]]}
            stack.append({"id": "arte", "role": "art", "opacity": 1.0, "blend": "normal", "offset": [0, 0]})
        elif nome == "NÃO MEXER 01":
            for c in grupo:
                adicionar(c, "luz")
                if c.name.strip() in ("shadow", "light"):
                    stack[-1]["id"] = c.name.strip()
        elif nome == "GRUPO ELASTICOS":
            for sub in grupo:
                cor = _id_da_opcao(sub.name)
                for c in sub:
                    adicionar(c, f"elastico-{cor}", when={"elastico": cor})
        elif nome == "MARGEM":
            for c in grupo:
                adicionar(c, "marca")
        else:
            raise ValueError(f"grupo de nível superior desconhecido: '{grupo.name}'")

    if arte is None or verso is None:
        raise ValueError("TROCA A CAPA ou CONTRA CAPA não encontrada")
    pack = {
        "canvas": {"width": largura, "height": altura},
        "artCorners": arte["corners"], "artSize": arte["size"], "artMask": mascara_arte,
        "backArt": verso,
        "stack": stack,
        "options": {acc: [{"id": i, "label": l, "swatch": s} for i, l, s in lista] for acc, lista in OPCOES_VERSO.items()},
        "unavailable": [],
        "defaults": {"wireo": "branco", "elastico": "branco", "tassel": "nenhum"},
    }
    (out / "mockup.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")
    return pack


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("uso: python tools/export_pack_verso.py MKP_VERSO.psd PASTA_DE_SAIDA")
    p = export_verso(sys.argv[1], sys.argv[2])
    print(f"ok: {len(p['stack'])} camadas no stack")
