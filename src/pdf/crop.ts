import type { Raster } from '../engine/types';

const BRANCO_ACIMA_DE = 240; // canal acima disso conta como branco
const DIFERENCA_DA_MOLDURA = 40; // linha que difere tanto da arte logo abaixo dela conta como moldura
const AREA_MINIMA = 0.1; // conteúdo menor que 10% da página não é uma arte

function ehConteudo(r: Raster, x: number, y: number): boolean {
  const i = (y * r.width + x) * 4;
  if ((r.data[i + 3] as number) === 0) return false;
  return (
    (r.data[i] as number) < BRANCO_ACIMA_DE ||
    (r.data[i + 1] as number) < BRANCO_ACIMA_DE ||
    (r.data[i + 2] as number) < BRANCO_ACIMA_DE
  );
}

function luzMedia(r: Raster, pontos: Iterable<[number, number]>): number {
  let soma = 0;
  let n = 0;
  for (const [x, y] of pontos) {
    const i = (y * r.width + x) * 4;
    soma += ((r.data[i] as number) + (r.data[i + 1] as number) + (r.data[i + 2] as number)) / 3;
    n++;
  }
  return n === 0 ? 255 : soma / n;
}

/** Quantas linhas aparar: até a última, entre as `maximo` primeiras, que difere da linha de referência (a de índice `maximo`). */
function quantoAparar(luzDaLinha: (k: number) => number, maximo: number): number {
  const referencia = luzDaLinha(maximo);
  let ultima = -1;
  for (let k = 0; k < maximo; k++) {
    if (Math.abs(luzDaLinha(k) - referencia) > DIFERENCA_DA_MOLDURA) ultima = k;
  }
  return ultima + 1;
}

function* coluna(x: number, y0: number, y1: number): Generator<[number, number]> {
  for (let y = y0; y <= y1; y++) yield [x, y];
}
function* linha(y: number, x0: number, x1: number): Generator<[number, number]> {
  for (let x = x0; x <= x1; x++) yield [x, y];
}

function copiar(r: Raster, x0: number, y0: number, x1: number, y1: number): Raster {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const de = ((y0 + y) * r.width + x0) * 4;
    out.data.set(r.data.subarray(de, de + w * 4), y * w * 4);
  }
  return out;
}

/**
 * Tira a margem branca da página e a moldura preta fina em volta da arte.
 * Se não achar conteúdo (página branca) ou achar só um pontinho, devolve a página inteira.
 */
export function cropMargins(page: Raster): Raster {
  let x0 = page.width;
  let y0 = page.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < page.height; y++) {
    for (let x = 0; x < page.width; x++) {
      if (!ehConteudo(page, x, y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return page;

  // A moldura é fina (1 a 3 px): olha as primeiras linhas de cada lado e aparou até a última que
  // difere da arte logo abaixo. Arte lisa sem moldura (mesma luz em todas as linhas) não perde nada.
  const maximo = Math.max(2, Math.round(page.width * 0.006));
  const cabe = x1 - x0 > 2 * maximo + 2 && y1 - y0 > 2 * maximo + 2;
  const esq = cabe ? quantoAparar((k) => luzMedia(page, coluna(x0 + k, y0, y1)), maximo) : 0;
  const dir = cabe ? quantoAparar((k) => luzMedia(page, coluna(x1 - k, y0, y1)), maximo) : 0;
  const topo = cabe ? quantoAparar((k) => luzMedia(page, linha(y0 + k, x0, x1)), maximo) : 0;
  const base = cabe ? quantoAparar((k) => luzMedia(page, linha(y1 - k, x0, x1)), maximo) : 0;
  x0 += esq;
  x1 -= dir;
  y0 += topo;
  y1 -= base;

  if (x1 <= x0 || y1 <= y0) return page;
  const area = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (page.width * page.height);
  if (area < AREA_MINIMA) return page;
  return copiar(page, x0, y0, x1, y1);
}

/** Corta a página na caixa (frações 0..1 da página). Caixa vazia ou fora da página devolve a página inteira. */
export function cropToBox(page: Raster, caixa: { x: number; y: number; w: number; h: number }): Raster {
  const x0 = Math.max(0, Math.round(caixa.x * page.width));
  const y0 = Math.max(0, Math.round(caixa.y * page.height));
  const x1 = Math.min(page.width, Math.round((caixa.x + caixa.w) * page.width));
  const y1 = Math.min(page.height, Math.round((caixa.y + caixa.h) * page.height));
  if (x1 <= x0 || y1 <= y0) return page;
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const de = ((y0 + y) * page.width + x0) * 4;
    data.set(page.data.subarray(de, de + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

const LARGURA_MAXIMA_DA_PAGINA = 4800;

/** Largura em que renderizar a página inteira para que a arte (a caixa) saia com `artWidthPx` de largura. */
export function widthForArt(artWidthPx: number, caixa: { x: number; y: number; w: number; h: number } | null): number {
  if (!caixa || caixa.w <= 0) return artWidthPx;
  return Math.min(LARGURA_MAXIMA_DA_PAGINA, Math.ceil(artWidthPx / caixa.w));
}
