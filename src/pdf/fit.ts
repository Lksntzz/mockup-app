import type { Raster } from '../engine/types';

/**
 * Corta a arte (centralizado) para ter a proporção `ratio` (largura/altura) da capa, sem esticar nada.
 * Arte mais larga perde os lados; arte mais alta perde o topo e a base.
 */
export function coverCrop(art: Raster, ratio: number): Raster {
  const atual = art.width / art.height;
  if (Math.abs(atual - ratio) < 1e-9) return art;
  let w = art.width;
  let h = art.height;
  if (atual > ratio) w = Math.max(1, Math.round(art.height * ratio));
  else h = Math.max(1, Math.round(art.width / ratio));
  const x0 = Math.floor((art.width - w) / 2);
  const y0 = Math.floor((art.height - h) / 2);
  const out: Raster = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const de = ((y0 + y) * art.width + x0) * 4;
    out.data.set(art.data.subarray(de, de + w * 4), y * w * 4);
  }
  return out;
}
