import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { coverCrop } from '../../src/pdf/fit';
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
