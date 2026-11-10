import sys
from pathlib import Path

import pytest
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from render_reference import COMBOS, extrair_arte, render_reference  # noqa: E402

PSD = RAIZ / "fixtures" / "MKP_2025.psd"


def test_gera_as_tres_combinacoes_da_spec(tmp_path):
    arquivos = render_reference(PSD, tmp_path)
    assert sorted(p.name for p in arquivos) == [
        "branco-azul-verde.png",
        "preto-preto-branco.png",
        "rose-gold-rosa-rosa.png",
    ]
    for p in arquivos:
        assert Image.open(p).size == (1200, 1200)
    assert COMBOS["preto-preto-branco"] == {"wireo": "preto", "elastico": "preto", "tassel": "branco"}


def test_combinacoes_diferentes_geram_imagens_diferentes(tmp_path):
    a, b, c = render_reference(PSD, tmp_path)
    assert Image.open(a).tobytes() != Image.open(b).tobytes()
    assert Image.open(b).tobytes() != Image.open(c).tobytes()


def test_extrai_a_arte_original_da_capa(tmp_path):
    destino = tmp_path / "capa01.png"
    extrair_arte(PSD, destino)
    assert Image.open(destino).size == (1772, 2480)
