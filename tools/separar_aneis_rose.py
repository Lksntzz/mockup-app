"""Separa os 5 anéis rose gold do TOPO da espiral esquerda (e os clipes escuros) do tassel laranja.

No PSD da especificação os anéis do topo só existem dentro de tassel-laranja-01.png, colados ao fio/tassel
laranja. Sem isso, wire-o rose gold + qualquer tassel que não seja o laranja mostrava os anéis brancos/prata.

O que o script faz na pasta do pacote (pack/especificacao):
  1. cria layers/wireo-rose-topo-01.png (só anéis + clipes) e a entrada `wireo-rose-topo-01` no mockup.json
     (when wireo=rose-gold, sem condição de tassel), logo antes da primeira camada tassel-*;
  2. reescreve tassel-laranja-01.png e tassel-laranja-02.png só com o fio/tassel (sem os anéis do topo).
É idempotente: se a entrada wireo-rose-topo-01 já existe, não faz nada.

Como separa: a forma do tassel (fio, nó, corpo) fica à esquerda de uma linha-guia XB(y); à direita só há anéis.
Perto da linha (faixa de BANDA px) e no nó do topo, onde fio e anéis se cruzam, decide a cor: cobre/rose tem matiz
baixo (< ~22 graus) ou é mais escuro; fio e tassel são creme/laranja claros. Abaixo de Y_TASSEL é tudo tassel.

Uso:  python3 tools/separar_aneis_rose.py [pack/especificacao]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ID_NOVO = "wireo-rose-topo-01"
ARQUIVO_NOVO = "wireo-rose-topo-01.png"
# (y, x) da borda direita do fio/tassel, em pixels da camada tassel-laranja-01.png
XB = [(56, 46), (195, 46), (200, 50), (215, 56), (230, 57), (246, 61), (260, 61), (272, 58), (284, 60), (292, 66)]
BANDA = 3  # meia-largura da faixa em que a cor decide
Y_NO = 56  # acima disso (nó do topo cruzando o anel 1) a cor decide entre X_FIO e X_ANEL
X_FIO, X_NO, X_ANEL = 46, 48, 56  # no nó: x < X_NO o tassel fica inteiro (o anel passa por dentro dele) e não entra nos anéis; x >= X_ANEL só anel
Y_TASSEL = 292  # daqui para baixo é tudo tassel


def _matiz_valor(rgb):
    rgb = rgb / 255.0
    mx, mn = rgb.max(2), rgb.min(2)
    d = mx - mn + 1e-9
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, mx


def pesos(rgba: np.ndarray):
    """(wt, wr) em 0..1 por pixel: quanto do alfa vai para o tassel e quanto para os anéis.
    Fora do nó do topo wt + wr = 1; no nó os dois se sobrepõem (o anel passa por dentro do nó, que o cobre)."""
    altura, largura = rgba.shape[:2]
    ys = np.arange(altura)
    xb = np.interp(ys, [p[0] for p in XB], [p[1] for p in XB])[:, None]
    x = np.arange(largura)[None, :]
    geo = np.clip((xb - x) / (2 * BANDA) + 0.5, 0, 1)  # 1 à esquerda da guia, 0 à direita, rampa na faixa
    h, v = _matiz_valor(rgba[..., :3].astype(float))
    h = np.where(h > 300, 0, h)
    cor = np.clip((h - 21) / 4, 0, 1) * np.clip((v - 0.78) / 0.07, 0, 1)  # fio/tassel: matiz alto e claro
    faixa = np.clip(1 - np.abs(xb - x) / BANDA, 0, 1)  # onde a cor manda: faixa em volta da guia
    wt = geo * (1 - faixa) + cor * faixa
    wt = np.where((ys >= Y_TASSEL)[:, None], 1.0, wt)
    wr = 1 - wt
    no = (ys < Y_NO)[:, None]
    wt = np.where(no, np.clip((X_ANEL - x) / (X_ANEL - X_NO), 0, 1), wt)
    wr = np.where(no, np.where(x < X_FIO, 0.0, np.where(x >= X_ANEL, 1.0, 1 - cor)), wr)
    return np.clip(wt, 0, 1), np.clip(wr, 0, 1)


def separar(rgba: np.ndarray):
    """(tassel, aneis): dois RGBA do mesmo tamanho."""
    wt, wr = pesos(rgba)
    tassel = rgba.copy()
    aneis = rgba.copy()
    tassel[..., 3] = np.rint(rgba[..., 3] * wt)
    aneis[..., 3] = np.rint(rgba[..., 3] * wr)
    return tassel, aneis


def _crop(arr: np.ndarray):
    img = Image.fromarray(arr.astype("uint8"), "RGBA")
    caixa = img.getchannel("A").getbbox()
    return (img.crop(caixa), caixa) if caixa else (None, None)


def separar_pacote(pasta) -> bool:
    pasta = Path(pasta)
    caminho = pasta / "mockup.json"
    pack = json.loads(caminho.read_text(encoding="utf-8"))
    stack = pack["stack"]
    if any(c["id"] == ID_NOVO for c in stack):
        return False
    camadas = pasta / "layers"
    entrada = next((c for c in stack if c["id"] == "tassel-laranja-01"), None)
    if entrada is None:
        return False
    ox, oy = entrada["offset"]
    f01 = np.array(Image.open(camadas / "tassel-laranja-01.png").convert("RGBA"))
    tassel1, aneis = separar(f01)
    img_aneis, caixa = _crop(aneis)
    img_aneis.save(camadas / ARQUIVO_NOVO, optimize=True)
    # -02 (preto/branco) também perde os anéis do topo
    f02 = np.array(Image.open(camadas / "tassel-laranja-02.png").convert("RGBA"))
    tassel2, _ = separar(f02)
    for arq, arr in (("tassel-laranja-01.png", tassel1), ("tassel-laranja-02.png", tassel2)):
        Image.fromarray(arr.astype("uint8"), "RGBA").save(camadas / arq, optimize=True)  # mesmo tamanho: offsets intactos
    novo = {
        "id": ID_NOVO,
        "role": "fixed",
        "file": ARQUIVO_NOVO,
        "opacity": 1.0,
        "blend": "normal",
        "offset": [ox + caixa[0], oy + caixa[1]],
        "when": {"wireo": "rose-gold"},
    }
    pos = next(i for i, c in enumerate(stack) if c["id"].startswith("tassel-"))
    stack.insert(pos, novo)
    caminho.write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")
    return True


if __name__ == "__main__":
    alvo = sys.argv[1] if len(sys.argv) > 1 else "pack/especificacao"
    print("separado" if separar_pacote(alvo) else "nada a fazer (já separado ou sem tassel laranja)")
