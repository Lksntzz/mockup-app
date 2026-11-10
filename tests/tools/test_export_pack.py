import json
import sys
from pathlib import Path

import pytest
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from export_pack import export_pack  # noqa: E402

PSD = RAIZ / "fixtures" / "MKP_2025.psd"


@pytest.fixture(scope="session")
def pack(tmp_path_factory):
    saida = tmp_path_factory.mktemp("pack")
    export_pack(PSD, saida)
    dados = json.loads((saida / "mockup.json").read_text(encoding="utf-8"))
    return saida, dados


def test_opcoes_por_acessorio(pack):
    _, d = pack
    ids = {acc: [o["id"] for o in ops] for acc, ops in d["options"].items()}
    assert sorted(ids["wireo"]) == ["branco", "preto", "rose-gold"]
    assert sorted(ids["elastico"]) == ["azul", "branco", "laranja", "nenhum", "preto", "rosa", "verde"]
    assert sorted(ids["tassel"]) == ["azul", "branco", "nenhum", "rosa", "verde"]
    assert d["defaults"] == {"wireo": "preto", "elastico": "preto", "tassel": "branco"}


def test_cantos_da_capa(pack):
    _, d = pack
    esperado = [[214.8, 75.7], [934.7, 16.1], [952.2, 1180.0], [221.8, 1131.8]]
    for obtido, certo in zip(d["artCorners"], esperado):
        assert obtido[0] == pytest.approx(certo[0], abs=0.1)
        assert obtido[1] == pytest.approx(certo[1], abs=0.1)
    assert d["artSize"] == {"width": 1772, "height": 2480}


def test_mascara_da_capa(pack):
    saida, d = pack
    m = d["artMask"]
    assert m["offset"] == [231, 21]
    img = Image.open(saida / "layers" / m["file"])
    assert img.size == (704, 1159)


def test_todo_arquivo_do_stack_existe(pack):
    saida, d = pack
    arquivos = [c for c in d["stack"] if c["role"] == "fixed"]
    assert arquivos, "stack vazio"
    for camada in arquivos:
        img = Image.open(saida / "layers" / camada["file"])
        assert img.mode == "RGBA"
        x, y = camada["offset"]
        assert x >= 0 and y >= 0
        assert x + img.width <= d["canvas"]["width"]
        assert y + img.height <= d["canvas"]["height"]
    assert [c["id"] for c in d["stack"] if c["role"] == "art"] == ["arte"]


def test_sombra_e_brilho(pack):
    _, d = pack
    por_id = {c["id"]: c for c in d["stack"]}
    assert por_id["shadow"]["blend"] == "multiply"
    assert por_id["shadow"]["opacity"] == pytest.approx(128 / 255, abs=0.005)
    assert por_id["light"]["blend"] == "normal"
    assert por_id["light"]["opacity"] == pytest.approx(31 / 255, abs=0.005)


def test_color_burn_do_elastico_preto(pack):
    _, d = pack
    burn = [c for c in d["stack"] if c["blend"] == "color-burn"]
    assert len(burn) == 1
    assert burn[0]["when"] == {"elastico": "preto"}
    assert burn[0]["opacity"] == pytest.approx(97 / 255, abs=0.005)


def test_camadas_de_cor_so_aparecem_com_a_escolha_certa(pack):
    _, d = pack
    for acc in ("wireo", "elastico", "tassel"):
        for opcao in d["options"][acc]:
            if opcao["id"] == "nenhum":
                # "Nenhum" = peça removida: nenhuma camada pode depender dessa escolha
                assert not [c for c in d["stack"] if c.get("when", {}).get(acc) == "nenhum"]
                continue
            camadas = [c for c in d["stack"] if c.get("when", {}).get(acc) == opcao["id"]]
            assert camadas, f"{acc}/{opcao['id']} sem camada"


def test_inclui_contra_capa_com_sombra_interna_e_nao_inclui_marca_dagua(pack):
    """A contra capa é onde mora a sombra interna que escurece a lateral das páginas (visível ao lado da capa)."""
    pasta, d = pack
    ids = [c["id"].lower() for c in d["stack"]]
    assert "contracapa-01" in ids
    assert not any("marca" in i for i in ids)
    from PIL import Image
    c = next(c for c in d["stack"] if c["id"] == "contracapa-01")
    img = Image.open(pasta / "layers" / c["file"]).convert("RGBA")
    # perto da borda direita a camada é escurecida pela sombra interna (não é branco puro)
    ox, oy = c["offset"]
    y = 600 - oy
    borda = next(x for x in range(img.width - 1, 0, -1) if img.getpixel((x, y))[3] > 200)
    assert img.getpixel((borda - 1, y))[0] < 245
