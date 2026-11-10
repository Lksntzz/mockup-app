"""Efeitos de camada: o que cada um deve fazer com uma forma simples (quadrado opaco de 40×40 num canvas de 100×100)."""
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from effects import aplicar_efeitos  # noqa: E402


def efeito(nome, **valores):
    """Efeito falso com a mesma forma que o psd-tools entrega (value[b'chave'])."""
    base = {
        b"Clr ": {b"Rd  ": 0.0, b"Grn ": 0.0, b"Bl  ": 0.0},
        b"Opct": 50.0, b"lagl": 90.0, b"Dstn": 10.0, b"Ckmt": 0.0, b"blur": 8.0,
        b"TrnS": {b"Crv ": [{b"Hrzn": 0.0, b"Vrtc": 0.0}, {b"Hrzn": 255.0, b"Vrtc": 255.0}]},
    }
    base.update({k.encode() if isinstance(k, str) else k: v for k, v in valores.items()})
    return type(nome, (), {"enabled": True, "value": base})()


def quadrado(cor=(255, 255, 255, 255)):
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (40, 40), cor), (30, 30))
    return img


def px(img, m, x, y):
    return np.asarray(img)[y + m, x + m].astype(int)


def test_sombra_projetada_cai_para_baixo_e_fica_fora_da_camada():
    img, m = aplicar_efeitos(quadrado(), [efeito("DropShadow")])
    abaixo = px(img, m, 50, 78)   # logo abaixo do quadrado (que acaba em y=69)
    acima = px(img, m, 50, 22)    # acima dele
    assert abaixo[3] > 20          # tem sombra
    assert acima[3] < 5            # não tem sombra do lado oposto
    assert tuple(px(img, m, 50, 50)) == (255, 255, 255, 255)  # a camada continua intacta por cima


def test_sombra_projetada_sem_efeito_ligado_nao_muda_nada():
    off = efeito("DropShadow")
    off.enabled = False
    img, m = aplicar_efeitos(quadrado(), [off])
    assert np.array_equal(np.asarray(img)[m:-m, m:-m], np.asarray(quadrado()))


def test_sombra_interna_escurece_a_borda_de_cima_mais_que_o_centro_e_nao_vaza_para_fora():
    img, m = aplicar_efeitos(quadrado(), [efeito("InnerShadow", blur=6.0, Dstn=10.0)])
    topo = px(img, m, 50, 31)     # logo dentro da borda de cima
    centro = px(img, m, 50, 50)
    fora = px(img, m, 50, 20)
    assert topo[0] < centro[0] < 256 and topo[0] < 255
    assert fora[3] == 0           # a sombra interna nunca aparece fora da forma


def test_opacidade_do_efeito_limita_o_escurecimento():
    img, m = aplicar_efeitos(quadrado(), [efeito("InnerShadow", Opct=10.0, blur=2.0, Dstn=20.0)])
    minimo = np.asarray(img)[m + 30:m + 70, m + 30:m + 70, 0].min()
    assert minimo >= 255 * 0.9 - 2   # 10% de preto sobre branco: nunca abaixo de ~229


def test_sombra_interna_e_maxima_na_borda_e_cai_para_zero_dentro_do_alcance():
    # sem deslocamento: a sombra se espalha igual por todas as bordas; alcance = tamanho * 0.35
    img, m = aplicar_efeitos(quadrado(), [efeito("InnerShadow", Dstn=0.0, blur=20.0, Opct=100.0)])
    borda = px(img, m, 30, 50)[0]      # coluna da borda esquerda, dentro da forma
    meio = px(img, m, 33, 50)[0]
    longe = px(img, m, 50, 50)[0]
    assert borda < 45                  # quase 100% de preto no primeiro pixel (a 1 px da borda: 86%)
    assert borda < meio < longe
    assert longe == 255                # passou do alcance (7 px): sem sombra


def test_relevo_escurece_as_laterais_com_luz_de_cima():
    bevel = efeito("BevelEmboss", hglO=0.0, sdwO=100.0, srgR=100.0, Lald=30.0, blur=3.0)
    bevel.value[b"hglC"] = {b"Rd  ": 255.0, b"Grn ": 255.0, b"Bl  ": 255.0}
    bevel.value[b"sdwC"] = {b"Rd  ": 0.0, b"Grn ": 0.0, b"Bl  ": 0.0}
    img, m = aplicar_efeitos(quadrado(), [bevel])
    lateral = px(img, m, 31, 50)
    centro = px(img, m, 50, 50)
    assert lateral[0] < centro[0]
    assert centro[0] == 255
