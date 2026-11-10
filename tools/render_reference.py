"""Renderiza combinações do PSD com o psd-tools (referência de DESENVOLVIMENTO).

O gabarito de aceitação é o feito no Photoshop (docs/gabaritos.md); este script
só dá uma referência para trabalhar enquanto o gabarito não chega.

Uso: python tools/render_reference.py fixtures/MKP_2025.psd fixtures/ref/
     python tools/render_reference.py --extrair-arte fixtures/MKP_2025.psd fixtures/capa01.png
"""
import io
import sys
import warnings
from pathlib import Path

from psd_tools import PSDImage

warnings.filterwarnings("ignore")

COMBOS = {
    "preto-preto-branco": {"wireo": "preto", "elastico": "preto", "tassel": "branco"},
    "rose-gold-rosa-rosa": {"wireo": "rose-gold", "elastico": "rosa", "tassel": "rosa"},
    "branco-azul-verde": {"wireo": "branco", "elastico": "azul", "tassel": "verde"},
}
GRUPOS = {"WIRE-O": "wireo", "TASSEL": "tassel", "GRUPO ELASTICOS": "elastico"}


def _id_da_opcao(nome: str) -> str:
    n = nome.strip().lower()
    if n.startswith("elastico "):
        n = n[len("elastico "):]
    return n.replace(" ", "-")


def _aplicar(psd, escolha: dict, ativar_rose: bool) -> None:
    for grupo in psd:
        nome = grupo.name.strip().upper()
        if nome in GRUPOS:
            quer = escolha[GRUPOS[nome]]
            for sub in grupo:
                sub.visible = _id_da_opcao(sub.name) == quer
        elif nome == "ATIVAR COM WIREO ROSE":
            grupo.visible = ativar_rose


def render_reference(psd_path, out_dir, ativar_rose=None) -> list:
    """Gera um PNG por combinação de COMBOS. `ativar_rose`: None = só com wire-o rose gold."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    arquivos = []
    for nome, escolha in COMBOS.items():
        psd = PSDImage.open(str(psd_path))
        ligar = escolha["wireo"] == "rose-gold" if ativar_rose is None else ativar_rose
        _aplicar(psd, escolha, ligar)
        destino = out / f"{nome}.png"
        psd.composite(force=True).convert("RGB").save(destino)
        arquivos.append(destino)
    return arquivos


def extrair_arte(psd_path, destino) -> None:
    """Salva a arte original (o conteúdo do objeto inteligente da capa) como PNG."""
    psd = PSDImage.open(str(psd_path))
    so = next(c for c in psd.descendants() if c.kind == "smartobject" and c.name == "TROCA A CAPA")
    PSDImage.open(io.BytesIO(so.smart_object.data)).composite().convert("RGB").save(destino)


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 3 and a[0] == "--extrair-arte":
        extrair_arte(a[1], a[2])
    elif len(a) == 2:
        for p in render_reference(a[0], a[1]):
            print(p)
    else:
        sys.exit("uso: render_reference.py PSD PASTA | --extrair-arte PSD ARQUIVO.png")
