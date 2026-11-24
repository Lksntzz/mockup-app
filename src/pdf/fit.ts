import type { Raster } from '../engine/types';
import { cropToBox } from './crop';

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

/**
 * Encaixa a arte INTEIRA na proporção `ratio` (largura/altura) da capa, centralizada, sem cortar nem esticar:
 * o que sobra em volta vira papel branco. É o que o macro do Corel faz (`ColocarArte`: cabe dentro de 150 × 210 mm
 * e centraliza), então o mockup mostra a arte do mesmo tamanho e no mesmo lugar do molde. Pixel transparente vira branco.
 */
export function containPad(art: Raster, ratio: number): Raster {
  const atual = art.width / art.height;
  if (Math.abs(atual - ratio) < 1e-9) return art;
  let w = art.width;
  let h = art.height;
  if (atual > ratio) h = Math.max(art.height, Math.round(art.width / ratio));
  else w = Math.max(art.width, Math.round(art.height * ratio));
  const x0 = Math.floor((w - art.width) / 2);
  const y0 = Math.floor((h - art.height) / 2);
  const out: Raster = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
  for (let y = 0; y < art.height; y++) {
    for (let x = 0; x < art.width; x++) {
      const de = (y * art.width + x) * 4;
      const a = (art.data[de + 3] as number) / 255;
      const para = ((y0 + y) * w + x0 + x) * 4;
      for (let c = 0; c < 3; c++) out.data[para + c] = Math.round((art.data[de + c] as number) * a + 255 * (1 - a));
    }
  }
  return out;
}

/** O quadro da arte (com dobra e sobra) e o miolo que vira a capa, em mm: os mesmos do molde do Corel. */
export const QUADRO_MM = { w: 195, h: 255 };
export const MIOLO_MM = { w: 150, h: 210 };

/**
 * Arte de proporção diferente da capa: ela é encaixada INTEIRA no quadro de 195 × 255 mm (centralizada, sobra branca)
 * e a capa é só o miolo de 150 × 210 mm no centro desse quadro, igual ao molde. Em arte quase quadrada os lados
 * saem da capa; o zoom e a posição ajustam depois no MKP. Arte que já tem a proporção da capa (dentro da
 * `tolerancia`) só é encaixada inteira na capa, sem passar pelo quadro.
 */
export function encaixarNoQuadro(art: Raster, razaoDaCapa: number, tolerancia: number): Raster {
  if (Math.abs(art.width / art.height / razaoDaCapa - 1) <= tolerancia) return containPad(art, razaoDaCapa);
  const quadro = containPad(art, QUADRO_MM.w / QUADRO_MM.h);
  const w = MIOLO_MM.w / QUADRO_MM.w;
  const h = MIOLO_MM.h / QUADRO_MM.h;
  const miolo = cropToBox(quadro, { x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  return containPad(miolo, razaoDaCapa); // acerto de décimos de milímetro até a proporção exata da capa
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
