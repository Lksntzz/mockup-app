"""Gera o pacote do mockup (camadas PNG + mockup.json) a partir do PSD.

Uso: python tools/export_pack.py fixtures/MKP_2025.psd pack/

Só para desenvolvimento: não faz parte do app instalado.
"""
import io
import json
import sys
import warnings
from pathlib import Path

import numpy as np
from PIL import Image

from psd_tools import PSDImage

sys_path_tools = Path(__file__).resolve().parent
if str(sys_path_tools) not in sys.path:
    sys.path.insert(0, str(sys_path_tools))
from effects import aplicar_efeitos  # noqa: E402

warnings.filterwarnings("ignore")

BLEND = {"NORMAL": "normal", "MULTIPLY": "multiply", "COLOR_BURN": "color-burn"}

OPCOES = {
    "wireo": [
        ("rose-gold", "Rose Gold", "#b76e79"),
        ("branco", "Branco", "#f5f5f5"),
        ("preto", "Preto", "#1a1a1a"),
    ],
    "elastico": [
        ("branco", "Branco", "#f5f5f5"),
        ("rosa", "Rosa", "#f48fb1"),
        ("azul", "Azul", "#2196f3"),
        ("verde", "Verde", "#43a047"),
        ("laranja", "Laranja", "#fb8c00"),
        ("preto", "Preto", "#1a1a1a"),
        ("nenhum", "Nenhum", "#ffffff"),  # peça removida: nenhuma camada liga a esta escolha
    ],
    "tassel": [
        ("verde", "Verde", "#43a047"),
        ("azul", "Azul", "#2196f3"),
        ("rosa", "Rosa", "#f48fb1"),
        ("branco", "Branco", "#f5f5f5"),
        ("laranja", "Laranja", "#fb8c00"),
        ("nenhum", "Nenhum", "#ffffff"),
    ],
}
DEFAULTS = {"wireo": "preto", "elastico": "preto", "tassel": "branco"}
GRUPO_DE_ACESSORIO = {"WIRE-O": "wireo", "TASSEL": "tassel", "GRUPO ELASTICOS": "elastico"}
IGNORADOS = {"MARCA D AGUA", "MARCA D'ÁGUA"}


def _id_da_opcao(nome_grupo: str) -> str:
    nome = nome_grupo.strip().lower()
    if nome.startswith("elastico "):
        nome = nome[len("elastico "):]
    return nome.replace(" ", "-")


def _efeitos_ativos(camada) -> list:
    try:
        return [e for e in camada.effects if getattr(e, "enabled", False)]
    except Exception:
        return []


def _ancestrais(camada):
    pai = camada.parent
    while pai is not None and not isinstance(pai, PSDImage):
        yield pai
        pai = pai.parent


def _imagem_base(camada):
    """(imagem RGBA sem efeitos, (x, y)) da camada como ela é, sem sombras nem relevo."""
    if camada.kind == "smartobject":
        vp = (camada.left, camada.top, camada.right, camada.bottom)
        # o psd-tools não renderiza camadas dentro de grupos ocultos: liga os grupos só durante a leitura
        pais = list(_ancestrais(camada))
        antes = [p.visible for p in pais]
        for p in pais:
            p.visible = True
        try:
            img = camada.composite(viewport=vp)
        finally:
            for p, v in zip(pais, antes):
                p.visible = v
        return img, (vp[0], vp[1])
    return camada.topil(), (camada.left, camada.top)


def _renderizar(camada, largura: int, altura: int):
    """Devolve (imagem RGBA com os efeitos de camada, (x, y)) cortada ao canvas, ou None.

    A opacidade da camada NÃO é aplicada aqui: o motor aplica `opacity` sobre a camada inteira, efeitos inclusos
    (como o Photoshop faz).
    """
    img, (x, y) = _imagem_base(camada)
    if img is None:
        return None
    img = img.convert("RGBA")
    efeitos = _efeitos_ativos(camada)
    if efeitos:
        img, margem = aplicar_efeitos(img, efeitos)
        x, y = x - margem, y - margem

    # corta ao canvas
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + img.width, largura), min(y + img.height, altura)
    if x1 <= x0 or y1 <= y0:
        return None
    img = img.crop((x0 - x, y0 - y, x1 - x, y1 - y))
    x, y = x0, y0

    # tira a borda totalmente transparente
    caixa = img.getchannel("A").getbbox()
    if caixa is None:
        return None
    img = img.crop(caixa)
    return img, (x + caixa[0], y + caixa[1])


def _fio_laranja_sem_aneis(stack, camadas_dir: Path, largura: int, altura: int) -> None:
    """No PSD o tassel laranja só existe fundido com os anéis rose gold. Para os outros wire-o tira da camada
    o que pertence aos anéis rose (as camadas "rose-extra"), sobrando só o fio; o wire-o escolhido aparece no lugar."""
    laranja = next((c for c in stack if c["id"] == "tassel-laranja-01"), None)
    extras = [c for c in stack if c["id"].startswith("rose-extra")]
    if laranja is None or not extras:
        return

    def na_tela(entrada) -> np.ndarray:
        im = Image.open(camadas_dir / entrada["file"]).convert("RGBA")
        tela = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
        tela.paste(im, tuple(entrada["offset"]))
        return np.array(tela).astype(float)

    aneis = np.zeros((altura, largura))
    for e in extras:
        aneis = np.maximum(aneis, na_tela(e)[..., 3] / 255.0)
    fio = na_tela(laranja)
    fio[..., 3] *= 1.0 - aneis
    img = Image.fromarray(fio.round().astype("uint8"), "RGBA")
    caixa = img.getbbox()
    if caixa is None:
        return
    img.crop(caixa).save(camadas_dir / "tassel-laranja-02.png", optimize=True)
    posicao = stack.index(laranja)
    for k, wireo in enumerate(("preto", "branco")):
        stack.insert(
            posicao + k,
            {
                "id": f"tassel-laranja-sem-aneis-{wireo}",
                "role": "fixed",
                "file": "tassel-laranja-02.png",
                "opacity": 1.0,
                "blend": "normal",
                "offset": [caixa[0], caixa[1]],
                "when": {"tassel": "laranja", "wireo": wireo},
            },
        )


def export_pack(psd_path, out_dir) -> dict:
    psd = PSDImage.open(str(psd_path))
    out = Path(out_dir)
    camadas_dir = out / "layers"
    camadas_dir.mkdir(parents=True, exist_ok=True)
    largura, altura = psd.size

    stack = []
    contador = {}
    estado = {"arte": None, "verso": None}

    def adicionar(camada, prefixo: str, when=None, id_fixo=None, mesmo_desligada=False):
        if not camada.visible and not mesmo_desligada:
            return
        if camada.kind not in ("pixel", "smartobject"):
            raise ValueError(f"camada '{camada.name}' do tipo {camada.kind} não é suportada")
        if camada.blend_mode.name not in BLEND:
            raise ValueError(f"modo de mistura {camada.blend_mode.name} da camada '{camada.name}' não é suportado")
        r = _renderizar(camada, largura, altura)
        if r is None:
            return
        img, (x, y) = r
        contador[prefixo] = contador.get(prefixo, 0) + 1
        ident = id_fixo or f"{prefixo}-{contador[prefixo]:02d}"
        arquivo = f"{ident}.png"
        img.save(camadas_dir / arquivo, optimize=True)
        entrada = {
            "id": ident,
            "role": "fixed",
            "file": arquivo,
            "opacity": round(camada.opacity / 255, 4),
            "blend": BLEND[camada.blend_mode.name],
            "offset": [x, y],
        }
        if when:
            entrada["when"] = dict(when)
        stack.append(entrada)

    def tratar_fixo(grupo, prefixo, nomear=False):
        for c in grupo:
            adicionar(c, prefixo, id_fixo=_id_da_opcao(c.name) if nomear else None)

    def tratar_acessorio(grupo, acessorio):
        for sub in grupo:
            opcao = _id_da_opcao(sub.name)
            if sub.is_group():
                for c in sub:
                    adicionar(c, f"{acessorio}-{opcao}", when={acessorio: opcao})

    for grupo in psd:
        nome = grupo.name.strip().upper()
        if nome in IGNORADOS:
            continue
        if nome == "FUNDO":
            tratar_fixo(grupo, "fundo")
        elif nome in GRUPO_DE_ACESSORIO:
            tratar_acessorio(grupo, GRUPO_DE_ACESSORIO[nome])
        elif nome == "CAPA":
            so = next(c for c in grupo if c.kind == "smartobject")
            caixa = so.smart_object.transform_box
            cantos = [[caixa[i], caixa[i + 1]] for i in range(0, 8, 2)]
            interno = PSDImage.open(io.BytesIO(so.smart_object.data))
            mascara = so.mask
            nome_mascara = "mascara-arte.png"
            mascara.topil().save(camadas_dir / nome_mascara, optimize=True)
            estado["arte"] = {
                "corners": cantos,
                "size": {"width": interno.width, "height": interno.height},
                "mask": {"file": nome_mascara, "offset": [mascara.bbox[0], mascara.bbox[1]]},
            }
            stack.append({"id": "arte", "role": "art", "opacity": 1.0, "blend": "normal", "offset": [0, 0]})
        elif nome == "CONTRA CAPA":
            for c in grupo:
                adicionar(c, "contracapa")
            so = next(c for c in grupo if c.kind == "smartobject")
            caixa = so.smart_object.transform_box
            interno = PSDImage.open(io.BytesIO(so.smart_object.data))
            camada_contra = next(c for c in reversed(stack) if (c.get("file") or "").startswith("contracapa"))
            estado["verso"] = {
                "corners": [[caixa[i], caixa[i + 1]] for i in range(0, 8, 2)],
                "size": {"width": interno.width, "height": interno.height},
                "mask": {"file": camada_contra["file"], "offset": camada_contra["offset"]},
            }
            # a arte do verso (página par) vem logo depois da contra capa, multiplicando sobre a sombra dela
            stack.append({"id": "arte-verso", "role": "back-art", "opacity": 1.0, "blend": "multiply", "offset": [0, 0]})
        elif nome == "ATIVAR COM WIREO ROSE":
            for c in grupo:
                if c.name.strip() == "Camada 24":
                    # desligada no PSD: é o tassel laranja, já com os anéis rose gold; só existe com esse wire-o
                    adicionar(c, "tassel-laranja", when={"tassel": "laranja", "wireo": "rose-gold"}, mesmo_desligada=True)
                else:
                    adicionar(c, "rose-extra", when={"wireo": "rose-gold"})
        elif nome == "NÃO MEXER 01":
            tratar_fixo(grupo, "luz", nomear=True)
        else:
            raise ValueError(f"grupo de nível superior desconhecido: '{grupo.name}'")

    _fio_laranja_sem_aneis(stack, camadas_dir, largura, altura)

    if estado["arte"] is None:
        raise ValueError("camada da capa não encontrada")

    pack = {
        "canvas": {"width": largura, "height": altura},
        "artCorners": estado["arte"]["corners"],
        "artSize": estado["arte"]["size"],
        "artMask": estado["arte"]["mask"],
        **({"backArt": estado["verso"]} if estado["verso"] else {}),
        "stack": stack,
        "options": {
            acc: [{"id": i, "label": l, "swatch": s} for i, l, s in lista] for acc, lista in OPCOES.items()
        },
        "unavailable": [],
        "defaults": DEFAULTS,
    }
    (out / "mockup.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")
    return pack


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("uso: python tools/export_pack.py ARQUIVO.psd PASTA_DE_SAIDA")
    p = export_pack(sys.argv[1], sys.argv[2])
    print(f"ok: {len(p['stack'])} camadas no stack")
