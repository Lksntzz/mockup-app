"""Efeitos de camada do Photoshop (sombra projetada, sombra interna, relevo) para o exportador do pacote.

O psd-tools só desenha contorno e sobreposições de cor; estes três efeitos precisam ser reproduzidos aqui,
com os parâmetros que o próprio PSD guarda (opacidade, ângulo, distância, tamanho, contração, contorno).

Só para desenvolvimento: não faz parte do app instalado.
"""
import math

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, shift as _deslocar

# "Tamanho" do Photoshop -> desvio-padrão do desfoque gaussiano (sombra projetada e relevo)
SIGMA_POR_TAMANHO = 0.5
# Sombra interna: no Photoshop ela é máxima na própria borda e cai em linha reta com a distância até a borda;
# a queda chega a zero em TAMANHO * ALCANCE_INTERNA pixels. Calibrado contra os gabaritos do Photoshop
# (faixa lateral das páginas: erro médio 2,3 níveis, contra 8,1 sem o efeito). Aplicar a curva de contorno
# do PSD piorou o ajuste (3,7), então ela não é usada.
ALCANCE_INTERNA = 0.35


def _valor(efeito, chave: bytes, padrao=None):
    try:
        # psd-tools novo: .descriptor (".value" está obsoleto); os efeitos de teste só têm .value
        d = getattr(efeito, "descriptor", None)
        v = (d if d is not None else efeito.value)[chave]
    except Exception:
        return padrao
    return padrao if v is None else v


def _cor(efeito, chave: bytes = b"Clr ", padrao=(0.0, 0.0, 0.0)):
    c = _valor(efeito, chave)
    if c is None:
        return np.array(padrao, dtype=np.float32)
    return np.array([float(c[b"Rd  "]), float(c[b"Grn "]), float(c[b"Bl  "])], dtype=np.float32)


def _deslocamento(angulo: float, distancia: float) -> tuple[float, float]:
    """(dy, dx) em pixels. Ângulo do Photoshop: 90° = luz vinda de cima, a sombra cai para baixo."""
    rad = math.radians(angulo)
    return math.sin(rad) * distancia, -math.cos(rad) * distancia


def _sombra(alfa: np.ndarray, efeito, interna: bool) -> np.ndarray:
    """Mapa de intensidade da sombra (0..1, já multiplicado pela opacidade do efeito)."""
    angulo = float(_valor(efeito, b"lagl", 90.0))
    distancia = float(_valor(efeito, b"Dstn", 0.0))
    contracao = float(_valor(efeito, b"Ckmt", 0.0)) / 100.0
    tamanho = float(_valor(efeito, b"blur", 0.0))
    opacidade = float(_valor(efeito, b"Opct", 100.0)) / 100.0
    dy, dx = _deslocamento(angulo, distancia)

    if interna:
        # região "fora da camada" deslocada; fora do recorte conta como fora
        fora = _deslocar(1.0 - alfa, (dy, dx), order=1, mode="nearest") >= 0.5
        alcance = max(1e-6, tamanho * ALCANCE_INTERNA)
        v = np.clip(1.0 - distance_transform_edt(~fora) / alcance, 0.0, 1.0) if fora.any() else np.zeros_like(alfa)
        v = v * alfa
    else:
        base = _deslocar(alfa, (dy, dx), order=1, mode="constant", cval=0.0)
        sigma = tamanho * SIGMA_POR_TAMANHO
        v = gaussian_filter(base, sigma, mode="constant", cval=0.0) if sigma > 0 else base
        if contracao > 0:
            v = np.clip(v / max(1e-6, 1.0 - contracao), 0.0, 1.0)
    return (v * opacidade).astype(np.float32)


def _relevo(alfa: np.ndarray, efeito) -> tuple[np.ndarray, np.ndarray]:
    """(realce, sombra) do relevo interno, cada um já multiplicado pela opacidade do efeito."""
    angulo = float(_valor(efeito, b"lagl", 90.0))
    altitude = float(_valor(efeito, b"Lald", 30.0))
    tamanho = float(_valor(efeito, b"blur", 3.0))
    profundidade = float(_valor(efeito, b"srgR", 100.0)) / 100.0
    op_realce = float(_valor(efeito, b"hglO", 75.0)) / 100.0
    op_sombra = float(_valor(efeito, b"sdwO", 75.0)) / 100.0

    altura = gaussian_filter(alfa, max(0.5, tamanho * SIGMA_POR_TAMANHO), mode="constant", cval=0.0)
    gy, gx = np.gradient(altura)
    inclinacao = profundidade * max(1.0, tamanho)  # profundidade maior = encosta mais íngreme
    nx, ny, nz = -gx * inclinacao, -gy * inclinacao, np.ones_like(altura)
    norma = np.sqrt(nx * nx + ny * ny + nz * nz)
    az, alt = math.radians(angulo), math.radians(altitude)
    lx, ly, lz = -math.cos(az) * math.cos(alt), -math.sin(az) * math.cos(alt), math.sin(alt)
    claridade = (nx * lx + ny * ly + nz * lz) / norma
    plano = lz  # claridade de uma superfície plana
    delta = claridade - plano
    realce = np.clip(delta / max(1e-6, 1.0 - plano), 0.0, 1.0) * alfa * op_realce
    sombra = np.clip(-delta / max(1e-6, plano), 0.0, 1.0) * alfa * op_sombra
    return realce.astype(np.float32), sombra.astype(np.float32)


def _sobre(base_rgb, base_a, cor, alfa):
    """Composição 'normal' de uma cor com alfa sobre (rgb, a) com alfa reto. Devolve (rgb, a)."""
    a_out = alfa + base_a * (1.0 - alfa)
    seguro = np.maximum(a_out, 1e-6)[..., None]
    rgb = (cor * alfa[..., None] + base_rgb * (base_a * (1.0 - alfa))[..., None]) / seguro
    return rgb, a_out


def margem_para(efeitos) -> int:
    m = 4
    for e in efeitos:
        m = max(m, int(float(_valor(e, b"Dstn", 0.0)) + 3 * float(_valor(e, b"blur", 0.0)) * SIGMA_POR_TAMANHO + 6))
    return m


def aplicar_efeitos(img: Image.Image, efeitos) -> tuple[Image.Image, int]:
    """Devolve (imagem com os efeitos, margem em pixels). A imagem cresce `margem` em cada lado."""
    efeitos = [e for e in efeitos if getattr(e, "enabled", False)]
    margem = margem_para(efeitos)
    rgba = np.asarray(img.convert("RGBA"), dtype=np.float32) / 255.0
    rgba = np.pad(rgba, ((margem, margem), (margem, margem), (0, 0)))
    alfa = rgba[..., 3]
    rgb = rgba[..., :3] * 255.0
    a = alfa.copy()

    tipo = lambda e: type(e).__name__  # noqa: E731

    # 1) sombras projetadas, por baixo da camada
    for e in (e for e in efeitos if tipo(e) == "DropShadow"):
        v = _sombra(alfa, e, interna=False)
        if bool(_valor(e, b"layerConceals", True)):
            v = v * (1.0 - alfa)
        # a camada vai por cima: compõe a sombra por baixo do que já existe
        rgb, a = _por_baixo(rgb, a, _cor(e), v)

    # 2) sombras internas, por cima, só dentro da camada
    for e in (e for e in efeitos if tipo(e) == "InnerShadow"):
        v = _sombra(alfa, e, interna=True)
        rgb, a = _sobre(rgb, a, _cor(e), v)

    # 3) relevo
    for e in (e for e in efeitos if tipo(e) == "BevelEmboss"):
        realce, sombra = _relevo(alfa, e)
        rgb, a = _sobre(rgb, a, _cor(e, b"hglC", (255, 255, 255)), realce)
        rgb, a = _sobre(rgb, a, _cor(e, b"sdwC", (0, 0, 0)), sombra)

    saida = np.concatenate([np.clip(rgb, 0, 255), (np.clip(a, 0, 1) * 255.0)[..., None]], axis=-1)
    return Image.fromarray(np.rint(saida).astype(np.uint8), "RGBA"), margem


def _por_baixo(rgb, a, cor, v):
    """Põe uma cor com alfa v por baixo do que já existe em (rgb, a)."""
    base_rgb = np.broadcast_to(cor, rgb.shape).astype(np.float32)
    return _sobre(base_rgb, v, rgb, a)
