import type { Blend, Pt, Raster } from './types';

export function newRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Função de mistura por canal, valores de 0 a 1 (cb = fundo, cs = camada). */
function misturar(modo: Blend, cb: number, cs: number): number {
  if (modo === 'multiply') return cb * cs;
  if (modo === 'color-burn') {
    if (cb >= 1) return 1;
    if (cs <= 0) return 0;
    return 1 - Math.min(1, (1 - cb) / cs);
  }
  return cs;
}

/**
 * Compõe `src` sobre `dst`, no lugar, com a posição do canto superior esquerdo em `offset`.
 * Segue a fórmula de composição do W3C com alfa não pré-multiplicado.
 */
export function blendOver(dst: Raster, src: Raster, offset: Pt, opacity: number, blend: Blend): void {
  const [ox, oy] = offset;
  const x0 = Math.max(0, ox);
  const y0 = Math.max(0, oy);
  const x1 = Math.min(dst.width, ox + src.width);
  const y1 = Math.min(dst.height, oy + src.height);
  const d = dst.data;
  const s = src.data;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const si = ((y - oy) * src.width + (x - ox)) * 4;
      const sa = ((s[si + 3] as number) / 255) * opacity;
      if (sa <= 0) continue;
      const di = (y * dst.width + x) * 4;
      const ab = (d[di + 3] as number) / 255;
      const ar = sa + ab * (1 - sa);
      const k = sa / ar;
      for (let c = 0; c < 3; c++) {
        const cb = (d[di + c] as number) / 255;
        const cs = (s[si + c] as number) / 255;
        const co = (1 - ab) * cs + ab * misturar(blend, cb, cs);
        d[di + c] = Math.round(((1 - k) * cb + k * co) * 255);
      }
      d[di + 3] = Math.round(ar * 255);
    }
  }
}
