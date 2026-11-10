import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from export_pack_verso import export_verso  # noqa: E402

PSD = RAIZ / "fixtures" / "mkp_verso.psd"


@pytest.fixture(scope="session")
def verso(tmp_path_factory):
    saida = tmp_path_factory.mktemp("verso")
    export_verso(PSD, saida)
    return saida, json.loads((saida / "mockup.json").read_text(encoding="utf-8"))


def test_opcoes_do_verso(verso):
    _, d = verso
    ids = {acc: sorted(o["id"] for o in ops) for acc, ops in d["options"].items()}
    assert ids["wireo"] == ["branco", "preto"]
    assert ids["elastico"] == ["azul", "branco", "nenhum", "preto", "rosa", "verde"]
    assert ids["tassel"] == ["nenhum"]


def test_arte_grande_sai_na_ordem_de_leitura_e_a_faixa_espelhada_como_no_psd(verso):
    _, d = verso
    tl, tr, br, bl = d["artCorners"]
    assert tl == pytest.approx([285.6, 136.3], abs=0.2)
    assert tr[0] > tl[0] and br[0] > bl[0]
    assert d["artSize"] == {"width": 1772, "height": 2480}
    faixa = d["backArt"]
    assert faixa["size"] == {"width": 1246, "height": 1849}
    assert faixa["corners"][0][0] > faixa["corners"][1][0]  # o canto de cima à esquerda da arte cai à direita, como no PSD


def test_ordem_do_stack(verso):
    _, d = verso
    ids = [c["id"] for c in d["stack"]]
    assert ids.index("arte-verso") > ids.index("contracapa-01")
    assert ids.index("arte") > ids.index("arte-verso")
    assert d["stack"][ids.index("arte")]["role"] == "art"
    assert d["stack"][ids.index("arte-verso")]["role"] == "back-art"
    assert d["stack"][ids.index("arte-verso")]["blend"] == "multiply"
    primeiro_wireo = next(i for i, c in enumerate(d["stack"]) if c["id"].startswith("wireo"))
    assert primeiro_wireo < ids.index("arte")
    assert ids.index("shadow") > ids.index("arte")


def test_cores_so_aparecem_com_a_escolha_certa(verso):
    _, d = verso
    for c in d["stack"]:
        if c["id"].startswith("wireo-"):
            assert c["when"] == {"wireo": c["id"].split("-")[1]}
        if c["id"].startswith("elastico-"):
            assert c["when"]["elastico"] == c["id"].split("-")[1]
    assert {c["when"]["elastico"] for c in d["stack"] if c["id"].startswith("elastico-")} == {"branco", "rosa", "azul", "verde", "preto"}
    assert {c["when"]["wireo"] for c in d["stack"] if c["id"].startswith("wireo-")} == {"branco", "preto"}


def test_arquivos_existem_e_cabem_no_canvas(verso):
    saida, d = verso
    assert d["canvas"] == {"width": 1200, "height": 1200}
    for c in d["stack"]:
        if "file" not in c:
            continue
        img = Image.open(saida / "layers" / c["file"])
        x, y = c["offset"]
        assert x >= 0 and y >= 0 and x + img.width <= 1200 and y + img.height <= 1200, c["id"]
    assert (saida / "layers" / d["artMask"]["file"]).exists()


def test_contra_capa_sai_sem_cor(verso):
    saida, d = verso
    c = next(c for c in d["stack"] if c["id"] == "contracapa-01")
    a = np.array(Image.open(saida / "layers" / c["file"]))
    vis = a[..., 3] > 0
    rgb = a[..., :3][vis].astype(int)
    assert (rgb.max(axis=1) - rgb.min(axis=1) <= 2).all()
    assert d["backArt"]["mask"]["file"] == c["file"]
