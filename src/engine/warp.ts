import { newRaster } from './blend';
import type { Pt, Raster } from './types';

type Quad = [Pt, Pt, Pt, Pt];

/** Resolve A·x = b por eliminação de Gauss com pivô parcial (A é n×n). */
function resolverSistema(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((linha, i) => [...linha, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivo = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs((M[r] as number[])[col] as number) > Math.abs((M[pivo] as number[])[col] as number)) pivo = r;
    }
    [M[col], M[pivo]] = [M[pivo] as number[], M[col] as number[]];
    const linhaPivo = M[col] as number[];
    const p = linhaPivo[col] as number;
    if (Math.abs(p) < 1e-12) throw new Error('quadrilátero inválido: os cantos não formam uma perspectiva');
    for (let r = col + 1; r < n; r++) {
      const linha = M[r] as number[];
      const f = (linha[col] as number) / p;
      for (let c = col; c <= n; c++) linha[c] = (linha[c] as number) - f * (linhaPivo[c] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const linha = M[r] as number[];
    let soma = linha[n] as number;
    for (let c = r + 1; c < n; c++) soma -= (linha[c] as number) * (x[c] as number);
    x[r] = soma / (linha[r] as number);
  }
  return x;
}

/** Matriz 3×3 (9 números, linha a linha, h[8] = 1) que leva cada ponto de `src` ao ponto de `dst`. */
export function solveHomography(src: Quad, dst: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i] as Pt;
    const [u, v] = dst[i] as Pt;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  return [...resolverSistema(A, b), 1];
}

export function applyHomography(h: number[], p: Pt): Pt {
  const [x, y] = p;
  const w = (h[6] as number) * x + (h[7] as number) * y + (h[8] as number);
  return [
    ((h[0] as number) * x + (h[1] as number) * y + (h[2] as number)) / w,
    ((h[3] as number) * x + (h[4] as number) * y + (h[5] as number)) / w,
  ];
}

function areaDoQuadrilatero(q: Quad): number {
  let soma = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i] as Pt;
    const [x2, y2] = q[(i + 1) % 4] as Pt;
    soma += x1 * y2 - x2 * y1;
  }
  return Math.abs(soma) / 2;
}

/**
 * Deforma `art` para o quadrilátero `corners` (TL, TR, BR, BL) dentro de um raster do tamanho `size`.
 * Fora do quadrilátero o alfa é 0; a borda é suavizada em cerca de 1 px.
 */
export function warpToQuad(art: Raster, corners: Quad, size: { width: number; height: number }): Raster {
  const out = newRaster(size.width, size.height);
  const W = art.width;
  const H = art.height;
  const retangulo: Quad = [[0, 0], [W, 0], [W, H], [0, H]];
  const inversa = solveHomography(corners, retangulo); // tela → arte
  const fonteSobreTela = Math.sqrt((W * H) / areaDoQuadrilatero(corners));

  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2);
  const x1 = Math.min(size.width - 1, Math.ceil(Math.max(...xs)) + 2);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
  const y1 = Math.min(size.height - 1, Math.ceil(Math.max(...ys)) + 2);

  const s = art.data;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [u, v] = applyHomography(inversa, [x + 0.5, y + 0.5]);
      const distancia = Math.min(u, W - u, v, H - v) / fonteSobreTela;
      if (!(distancia > -0.5)) continue;
      const cobertura = Math.min(1, distancia + 0.5);

      // interpolação bilinear com alfa pré-multiplicado
      const fx = Math.min(Math.max(u - 0.5, 0), W - 1);
      const fy = Math.min(Math.max(v - 0.5, 0), H - 1);
      const ix = Math.min(Math.floor(fx), W - 2 >= 0 ? W - 2 : 0);
      const iy = Math.min(Math.floor(fy), H - 2 >= 0 ? H - 2 : 0);
      const tx = fx - ix;
      const ty = fy - iy;
      const jx = Math.min(ix + 1, W - 1);
      const jy = Math.min(iy + 1, H - 1);
      const pesos: [number, number, number][] = [
        [ix, iy, (1 - tx) * (1 - ty)],
        [jx, iy, tx * (1 - ty)],
        [ix, jy, (1 - tx) * ty],
        [jx, jy, tx * ty],
      ];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [px, py, peso] of pesos) {
        const i = (py * W + px) * 4;
        const alfa = ((s[i + 3] as number) / 255) * peso;
        r += (s[i] as number) * alfa;
        g += (s[i + 1] as number) * alfa;
        b += (s[i + 2] as number) * alfa;
        a += alfa;
      }
      if (a <= 0) continue;
      const o = (y * size.width + x) * 4;
      out.data[o] = Math.round(r / a);
      out.data[o + 1] = Math.round(g / a);
      out.data[o + 2] = Math.round(b / a);
      out.data[o + 3] = Math.round(a * cobertura * 255);
    }
  }
  return out;
}
