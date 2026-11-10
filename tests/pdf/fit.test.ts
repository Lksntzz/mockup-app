import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { coverCrop, reduzir } from '../../src/pdf/fit';
import type { Raster } from '../../src/engine/types';

function faixas(w: number, h: number): Raster {
  // coluna x tem valor x (módulo 256) no canal vermelho, para saber de onde veio cada pixel
  const r = newRaster(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r.data.set([x % 256, 0, 0, 255], (y * w + x) * 4);
  return r;
}

describe('coverCrop', () => {
  test('arte mais larga que a capa perde igual dos dois lados', () => {
    const out = coverCrop(faixas(200, 100), 1);
    expect([out.width, out.height]).toEqual([100, 100]);
    expect(out.data[0]).toBe(50); // primeira coluna mantida = coluna 50 da original
  });
  test('arte mais alta que a capa perde igual em cima e embaixo', () => {
    const out = coverCrop(faixas(100, 200), 1);
    expect([out.width, out.height]).toEqual([100, 100]);
  });
  test('mesma proporção devolve a mesma arte', () => {
    const a = faixas(143, 200);
    const out = coverCrop(a, 143 / 200);
    expect([out.width, out.height]).toEqual([143, 200]);
  });
  test('arte do PDF (0,765) para a capa do PSD (1772/2480) mantém a altura e corta ~6,6% da largura', () => {
    const out = coverCrop(faixas(1115, 1460), 1772 / 2480);
    expect(out.height).toBe(1460);
    expect(out.width).toBe(Math.round(1460 * (1772 / 2480)));
  });
});

describe('reduzir', () => {
  const quadro = (w: number, h: number, f: (x: number, y: number) => number[]): Raster => {
    const r = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r.data.set(f(x, y), (y * w + x) * 4);
    return r;
  };
  test('faz a média de cada bloco e mantém a proporção', () => {
    const r = reduzir(quadro(4, 4, (x) => (x < 2 ? [0, 0, 0, 255] : [200, 100, 50, 255])), 2);
    expect([r.width, r.height]).toEqual([2, 2]);
    expect([...r.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...r.data.slice(4, 8)]).toEqual([200, 100, 50, 255]);
  });
  test('mistura as cores de um bloco que mistura duas', () => {
    const r = reduzir(quadro(2, 2, (x) => (x < 1 ? [0, 0, 0, 255] : [100, 100, 100, 255])), 1);
    expect([...r.data]).toEqual([50, 50, 50, 255]);
  });
  test('imagem já pequena não é ampliada: devolve a própria', () => {
    const r = quadro(3, 3, () => [1, 2, 3, 255]);
    expect(reduzir(r, 10)).toBe(r);
  });
  test('proporção que não divide certinho: altura acompanha a largura', () => {
    const r = reduzir(quadro(100, 150, () => [9, 9, 9, 255]), 40);
    expect([r.width, r.height]).toEqual([40, 60]);
  });
});
