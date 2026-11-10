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

/** Versão menor da imagem (média de cada bloco de pixels), com a mesma proporção. Imagem já pequena volta como está. */
export function reduzir(r: Raster, largura: number): Raster {
  if (r.width <= largura) return r;
  const w = Math.max(1, Math.round(largura));
  const h = Math.max(1, Math.round((r.height * w) / r.width));
  const out: Raster = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * r.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * r.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * r.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * r.width) / w));
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * r.width + xx) * 4;
          sr += r.data[i] as number;
          sg += r.data[i + 1] as number;
          sb += r.data[i + 2] as number;
          sa += r.data[i + 3] as number;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      out.data.set([Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), Math.round(sa / n)], (y * w + x) * 4);
    }
  }
  return out;
}
