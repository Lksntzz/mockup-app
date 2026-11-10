import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { cropToBox, widthForArt } from '../../src/pdf/crop';

function pagina(w: number, h: number): ReturnType<typeof newRaster> {
  const r = newRaster(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r.data[i] = x % 256;
      r.data[i + 1] = y % 256;
      r.data[i + 2] = 7;
      r.data[i + 3] = 255;
    }
  return r;
}

describe('cropToBox', () => {
  test('corta exatamente a caixa pedida (frações da página)', () => {
    const r = cropToBox(pagina(200, 100), { x: 0.25, y: 0.1, w: 0.5, h: 0.6 });
    expect([r.width, r.height]).toEqual([100, 60]);
    expect([r.data[0], r.data[1]]).toEqual([50, 10]); // primeiro pixel = (50, 10) da página original
  });
  test('caixa que passa da borda é limitada à página', () => {
    const r = cropToBox(pagina(100, 100), { x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
    expect([r.width, r.height]).toEqual([10, 10]);
  });
  test('caixa vazia ou invertida devolve a página inteira', () => {
    const r = cropToBox(pagina(40, 30), { x: 0.5, y: 0.5, w: 0, h: 0 });
    expect([r.width, r.height]).toEqual([40, 30]);
  });
});

describe('widthForArt', () => {
  test('renderiza a página maior para a arte sair com a largura pedida', () => {
    expect(widthForArt(1200, { x: 0.125, y: 0.125, w: 0.75, h: 0.75 })).toBe(1600);
  });
  test('sem caixa, a largura pedida', () => {
    expect(widthForArt(1200, null)).toBe(1200);
  });
  test('limita a página renderizada para não estourar a memória', () => {
    expect(widthForArt(1200, { x: 0, y: 0, w: 0.05, h: 0.05 })).toBeLessThanOrEqual(4800);
  });
});
