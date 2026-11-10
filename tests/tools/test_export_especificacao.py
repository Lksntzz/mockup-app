import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from export_pack_especificacao import export_especificacao  # noqa: E402

VT = RAIZ / "fixtures" / "espec_vt.psd"
SC = RAIZ / "fixtures" / "espec_sem_canguru.psd"


@pytest.fixture(scope="session")
def espec(tmp_path_factory):
    saida = tmp_path_factory.mktemp("espec")
    export_especificacao(VT, SC, saida)
    return saida, json.loads((saida / "mockup.json").read_text(encoding="utf-8"))


def _da_variante(d, v):
    return [c for c in d["stack"] if c.get("variant") == v]


def test_todo_arquivo_existe_e_cabe_no_canvas(espec):
    saida, d = espec
    for c in d["stack"]:
        if "file" not in c:
            continue
        img = Image.open(saida / "layers" / c["file"])
        x, y = c["offset"]
        assert x >= 0 and y >= 0
        assert x + img.width <= d["canvas"]["width"] and y + img.height <= d["canvas"]["height"], c["id"]


def test_vt_tem_detalhes_e_dois_zooms(espec):
    _, d = espec
    vt = _da_variante(d, "vt")
    assert [c["role"] for c in vt].count("zoom") == 2
    assert any(c["id"].startswith("detalhes") and c["role"] == "fixed" for c in vt)


def test_sem_canguru_tem_dois_aneis_e_dois_zooms(espec):
    _, d = espec
    sc = _da_variante(d, "sem-canguru")
    assert [c["role"] for c in sc].count("zoom") == 2
    assert len([c for c in sc if c["role"] == "fixed"]) == 2


def test_camadas_escondidas_do_psd_ficam_de_fora(espec):
    _, d = espec
    # a VT esconde 'Camada 39/40' e a sem canguru esconde 'DETALHES': nada disso entra
    assert not [c for c in d["stack"] if c["id"].startswith(("camada-39", "camada-40"))]
    assert len(_da_variante(d, "vt")) == 3
    assert len(_da_variante(d, "sem-canguru")) == 4


def test_marca_dagua_entra_em_ambas(espec):
    _, d = espec
    marcas = [c for c in d["stack"] if c["id"].startswith("marca")]
    assert len(marcas) == 4 and all("variant" not in c for c in marcas)


def test_zooms_ficam_depois_de_tudo_e_da_marca(espec):
    _, d = espec
    ids = [c["id"] for c in d["stack"]]
    ultima_marca = max(i for i, c in enumerate(ids) if c.startswith("marca"))
    primeiro_zoom = min(i for i, c in enumerate(d["stack"]) if c["role"] == "zoom")
    assert primeiro_zoom > ultima_marca


def test_zoom_tem_mascara_redonda_e_origem_com_a_mesma_proporcao(espec):
    saida, d = espec
    for c in [c for c in d["stack"] if c["role"] == "zoom"]:
        img = Image.open(saida / "layers" / c["file"])
        assert img.mode == "RGBA"
        a = np.array(img)[..., 3]
        assert a[a.shape[0] // 2, a.shape[1] // 2] == 255
        assert a[0, 0] == 0  # canto fora do círculo
        assert 0.7 < (a > 127).mean() < 0.85  # área de um círculo dentro do retângulo é ~78%
        s = c["source"]
        assert s["width"] / s["height"] == pytest.approx(img.width / img.height, rel=0.03)
        assert s["x"] >= 0 and s["y"] >= 0 and s["x"] + s["width"] <= 1200 and s["y"] + s["height"] <= 1200


def test_zoom_da_sem_canguru_cai_dentro_do_anel(espec):
    saida, d = espec
    aneis = [c for c in _da_variante(d, "sem-canguru") if c["role"] == "fixed"]
    for z in [c for c in _da_variante(d, "sem-canguru") if c["role"] == "zoom"]:
        img = Image.open(saida / "layers" / z["file"])
        zx, zy = z["offset"]
        dentro = [
            a for a in aneis
            if a["offset"][0] <= zx and a["offset"][1] <= zy
            and zx + img.width <= a["offset"][0] + Image.open(saida / "layers" / a["file"]).width
            and zy + img.height <= a["offset"][1] + Image.open(saida / "layers" / a["file"]).height
        ]
        assert dentro, z["id"]


def test_contra_capa_sai_em_branco(espec):
    saida, d = espec
    c = next(c for c in d["stack"] if c["id"] == "contracapa-01")
    a = np.array(Image.open(saida / "layers" / c["file"]))
    visivel = a[..., 3] > 0
    assert visivel.any()
    rgb = a[..., :3][visivel].astype(int)
    # sem arte: só cinza claro (sombra interna do PSD sobre papel branco), nunca cor
    assert (rgb.max(axis=1) - rgb.min(axis=1) <= 2).all()
    assert np.median(rgb) >= 225
