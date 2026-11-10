import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { applyHomography, solveHomography, warpToQuad } from '../../src/engine/warp';
import type { Pt, Raster } from '../../src/engine/types';

// Cantos da capa lidos do PSD (spec, seção 2): superior esquerdo, superior direito, inferior direito, inferior esquerdo.
const CANTOS: [Pt, Pt, Pt, Pt] = [
  [214.8, 75.7],
  [934.7, 16.1],
  [952.2, 1180.0],
  [221.8, 1131.8],
];
const TELA = { width: 1200, height: 1200 };

function arte(w: number, h: number, cor: (x: number, y: number) => [number, number, number]): Raster {
  const r = newRaster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) r.data.set([...cor(x, y), 255], (y * w + x) * 4);
  }
  return r;
}
const px = (r: Raster, x: number, y: number) => Array.from(r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4));

describe('solveHomography', () => {
  test('leva cada canto da arte ao canto de destino', () => {
    const W = 1772;
    const H = 2480;
    const origem: [Pt, Pt, Pt, Pt] = [[0, 0], [W, 0], [W, H], [0, H]];
    const h = solveHomography(origem, CANTOS);
    origem.forEach((p, i) => {
      const [x, y] = applyHomography(h, p);
      expect(Math.abs(x - (CANTOS[i] as Pt)[0])).toBeLessThan(0.01);
      expect(Math.abs(y - (CANTOS[i] as Pt)[1])).toBeLessThan(0.01);
    });
  });

  test('quadrilátero igual ao retângulo dá a identidade', () => {
    const q: [Pt, Pt, Pt, Pt] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const h = solveHomography(q, q);
    const [x, y] = applyHomography(h, [3, 7]);
    expect(x).toBeCloseTo(3, 6);
    expect(y).toBeCloseTo(7, 6);
  });
});

describe('warpToQuad', () => {
  test('retângulo idêntico à tela devolve a mesma imagem', () => {
    const a = arte(4, 4, (x, y) => [x * 60, y * 60, 100]);
    const out = warpToQuad(a, [[0, 0], [4, 0], [4, 4], [0, 4]], { width: 4, height: 4 });
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const o = px(out, x, y);
        const e = px(a, x, y);
        for (let c = 0; c < 4; c++) expect(Math.abs((o[c] as number) - (e[c] as number))).toBeLessThanOrEqual(1);
      }
    }
  });

  test('com os cantos da spec: dentro do quadrilátero tem a cor da arte, fora tem alfa 0', () => {
    const a = arte(1772, 2480, () => [10, 200, 30]);
    const out = warpToQuad(a, CANTOS, TELA);
    expect(out.width).toBe(1200);
    expect(out.height).toBe(1200);
    expect(px(out, 580, 600)).toEqual([10, 200, 30, 255]);
    expect(px(out, 50, 50)[3]).toBe(0);
    expect(px(out, 1100, 1100)[3]).toBe(0);
  });

  test('a direção está certa: metade esquerda vermelha, metade direita azul', () => {
    const a = arte(200, 300, (x) => (x < 100 ? [255, 0, 0] : [0, 0, 255]));
    const out = warpToQuad(a, CANTOS, TELA);
    expect(px(out, 300, 600).slice(0, 3)).toEqual([255, 0, 0]);
    expect(px(out, 860, 600).slice(0, 3)).toEqual([0, 0, 255]);
  });

  test('a perspectiva respeita a ordem dos cantos: o topo sobe da esquerda para a direita', () => {
    const a = arte(200, 300, () => [1, 2, 3]);
    const out = warpToQuad(a, CANTOS, TELA);
    expect(px(out, 900, 40)[3]).toBe(255); // dentro: perto do canto superior direito
    expect(px(out, 300, 40)[3]).toBe(0); // fora: o topo ainda está mais baixo à esquerda
  });
});
