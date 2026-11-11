import { ajusteValido, type Ajuste } from '../engine/ajuste';
import type { Pt } from '../engine/types';
import { applyHomography, solveHomography } from '../engine/warp';

type Quad = [Pt, Pt, Pt, Pt];
const QUADRADO: Quad = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Converte entre a "folha" da arte (0 a 1 em cada eixo) e os pontos da prévia, pelo quadrilátero onde a arte é encaixada no mockup. */
export function criarMapa(cantos: Quad): { paraTela: (p: Pt) => Pt; paraArte: (p: Pt) => Pt } {
  const ida = solveHomography(QUADRADO, cantos);
  const volta = solveHomography(cantos, QUADRADO);
  return { paraTela: (p) => applyHomography(ida, p), paraArte: (p) => applyHomography(volta, p) };
}

/** Os 4 cantos da arte já ajustada, na folha da arte (mesma ordem dos cantos: sup. esq., sup. dir., inf. dir., inf. esq.). */
export function cantosDoAjuste(a: Ajuste): Quad {
  const { zoom, x, y } = ajusteValido(a);
  const l = 0.5 + x - zoom / 2;
  const r = 0.5 + x + zoom / 2;
  const t = 0.5 + y - zoom / 2;
  const b = 0.5 + y + zoom / 2;
  return [[l, t], [r, t], [r, b], [l, b]];
}

export function pontoDentro(a: Ajuste, p: Pt): boolean {
  const [[l, t], [r, b]] = [cantosDoAjuste(a)[0], cantosDoAjuste(a)[2]];
  return p[0] >= l && p[0] <= r && p[1] >= t && p[1] <= b;
}

/** Índice (0 a 3) do canto da arte mais perto de `p` dentro de `raio` (em unidades da folha), ou -1. */
export function cantoPerto(a: Ajuste, p: Pt, raio: number): number {
  let melhor = -1;
  let menor = raio;
  cantosDoAjuste(a).forEach((c, i) => {
    const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
    if (d <= menor) {
      menor = d;
      melhor = i;
    }
  });
  return melhor;
}

/** Arrastar a arte: move pelo mesmo tanto que o mouse andou na folha. */
export function arrastarCorpo(a: Ajuste, de: Pt, ate: Pt): Ajuste {
  const v = ajusteValido(a);
  return ajusteValido({ ...v, x: v.x + (ate[0] - de[0]), y: v.y + (ate[1] - de[1]) });
}

/** Arrastar um canto: muda o tamanho em volta do centro da arte, na proporção da distância do mouse ao centro. */
export function arrastarCanto(a: Ajuste, de: Pt, ate: Pt): Ajuste {
  const v = ajusteValido(a);
  const cx = 0.5 + v.x;
  const cy = 0.5 + v.y;
  const antes = Math.hypot(de[0] - cx, de[1] - cy);
  if (antes < 1e-6) return v;
  const depois = Math.hypot(ate[0] - cx, ate[1] - cy);
  return ajusteValido({ ...v, zoom: v.zoom * (depois / antes) });
}

/** Roda do mouse: cada "clique" (100) muda cerca de 8% do tamanho; para cima aumenta. */
export function zoomDaRoda(a: Ajuste, deltaY: number): Ajuste {
  const v = ajusteValido(a);
  return ajusteValido({ ...v, zoom: v.zoom * Math.exp(-deltaY * 0.0008) });
}
