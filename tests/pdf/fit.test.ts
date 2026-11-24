import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { containPad, coverCrop, encaixarNoQuadro, reduzir } from '../../src/pdf/fit';
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

describe('containPad (igual ao macro do Corel: arte inteira, centralizada, sobra branca)', () => {
  test('arte quase quadrada numa capa alta ganha faixas brancas em cima e embaixo, sem perder pixel', () => {
    const out = containPad(faixas(711, 736), 148 / 210);
    expect(out.width).toBe(711);
    expect(out.height).toBe(Math.round(711 / (148 / 210)));
    const topo = Math.floor((out.height - 736) / 2);
    expect([...out.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]); // faixa de cima é branca
    const i = (topo * out.width + 10) * 4; // primeira linha da arte, coluna 10
    expect(out.data[i]).toBe(10);
    expect(out.data[i + 1]).toBe(0);
  });
  test('arte mais alta que a capa ganha faixas brancas dos lados', () => {
    const out = containPad(faixas(100, 200), 1);
    expect([out.width, out.height]).toEqual([200, 200]);
    expect(out.data[0]).toBe(255);
    expect(out.data[(50 * 4)]).toBe(0); // coluna 50 = primeira coluna da arte (valor 0)
  });
  test('mesma proporção devolve a mesma arte', () => {
    const a = faixas(143, 200);
    expect(containPad(a, 143 / 200)).toBe(a);
  });
  test('pixel transparente vira branco', () => {
    const a = newRaster(2, 2); // tudo transparente
    const out = containPad(a, 0.5); // 2 × 4: a arte fica nas linhas 1 e 2
    expect([out.width, out.height]).toEqual([2, 4]);
    expect([...out.data.subarray(2 * 4, 2 * 4 + 4)]).toEqual([255, 255, 255, 255]); // linha 1 (da arte)
  });
});

describe('encaixarNoQuadro (quadro 195 × 255, capa = miolo 150 × 210)', () => {
  const RAZAO = 148 / 210;
  test('arte quase quadrada: cabe inteira no quadro e a capa é o miolo (perde ~23% da largura, mantém a altura)', () => {
    const out = encaixarNoQuadro(faixas(711, 736), RAZAO, 0.1);
    expect(Math.abs(out.width / out.height - RAZAO)).toBeLessThan(0.005);
    // quadro = 711 × 929; miolo = 547 × 765; a arte (736 de altura) cabe quase toda nele
    expect(out.height).toBeGreaterThanOrEqual(760);
    expect(out.height).toBeLessThanOrEqual(780);
    // coluna do meio da capa = coluna do meio da arte (valor ~355)
    const meio = Math.floor(out.width / 2);
    const linhaArte = Math.floor(out.height / 2);
    expect(Math.abs((out.data[(linhaArte * out.width + meio) * 4] as number) - (355 % 256))).toBeLessThan(3);
  });
  test('arte na proporção da capa não passa pelo quadro (não é ampliada nem cortada)', () => {
    const a = faixas(148, 210);
    expect(encaixarNoQuadro(a, RAZAO, 0.1)).toBe(a);
  });
  test('arte dentro da tolerância só ganha faixas pequenas, sem cortar', () => {
    const out = encaixarNoQuadro(faixas(195, 255), RAZAO, 0.1); // 0,765 vs 0,705: 8,5% de diferença
    expect(out.width).toBe(195);
    expect(out.height).toBeGreaterThan(255);
  });
});
