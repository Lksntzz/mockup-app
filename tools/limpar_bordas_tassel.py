"""Tira o "branco" das bordas do tassel.

As camadas tassel-*.png do pacote têm, nas bordas semitransparentes, uma cor quase branca (sobra do fundo branco do
recorte): sobre a arte colorida aparece como uma névoa clara em volta das fibras. Aqui cada pixel não totalmente opaco
recebe a cor do pixel opaco mais próximo, e a névoa (alfa abaixo de NEVOA) é apagada. É seguro rodar de novo (não muda o que já está limpo).

Uso:  python3 tools/limpar_bordas_tassel.py   (na pasta do projeto)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

PASTAS = [Path("pack/layers"), Path("pack/especificacao/layers"), Path("pack/verso/layers")]
OPACO = 250  # a partir daqui o pixel já é "miolo": a cor dele é a verdadeira
NEVOA = 40  # abaixo disso o pixel é só névoa clara espalhada em volta (halo): vira totalmente transparente


def limpar(caminho: Path) -> int:
    im = np.array(Image.open(caminho).convert("RGBA"))
    solido = im[..., 3] >= OPACO
    if not solido.any():
        return 0
    idx = ndi.distance_transform_edt(~solido, return_distances=False, return_indices=True)
    novo = im.copy()
    novo[..., :3] = im[idx[0], idx[1], :3]
    novo[solido] = im[solido]
    novo[..., 3] = np.where(im[..., 3] < NEVOA, 0, im[..., 3])  # corta a névoa; o resto do alfa não muda
    mudou = int((novo != im).any(axis=2).sum())
    if mudou:
        Image.fromarray(novo, "RGBA").save(caminho, optimize=True)
    return mudou


if __name__ == "__main__":
    for pasta in PASTAS:
        for arq in sorted(pasta.glob("tassel-*.png")):
            print(f"{arq}: {limpar(arq)} pixels de borda corrigidos")
