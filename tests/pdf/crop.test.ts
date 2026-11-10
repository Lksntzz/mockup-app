import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { cropMargins } from '../../src/pdf/crop';
import type { Raster } from '../../src/engine/types';

function branco(w: number, h: number): Raster {
  const r = newRaster(w, h);
  r.data.fill(255);
  return r;
}
function retangulo(r: Raster, x0: number, y0: number, x1: number, y1: number, cor: [number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.data.set([...cor, 255], (y * r.width + x) * 4);
}
const px = (r: Raster, x: number, y: number) => Array.from(r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 3));

describe('cropMargins', () => {
  test('tira a margem branca e a moldura preta, devolvendo só a arte', () => {
    const p = branco(200, 280);
    retangulo(p, 20, 30, 180, 250, [0, 0, 0]); // moldura de 2 px
    retangulo(p, 22, 32, 178, 248, [200, 100, 50]);
    const out = cropMargins(p);
    expect([out.width, out.height]).toEqual([156, 216]);
    expect(px(out, 0, 0)).toEqual([200, 100, 50]);
    expect(px(out, 155, 215)).toEqual([200, 100, 50]);
  });

  test('sem moldura, só tira a margem branca', () => {
    const p = branco(200, 280);
    retangulo(p, 50, 60, 150, 200, [10, 200, 30]);
    const out = cropMargins(p);
    expect([out.width, out.height]).toEqual([100, 140]);
  });

  test('página toda branca devolve a página inteira, nunca uma imagem vazia', () => {
    const out = cropMargins(branco(200, 280));
    expect([out.width, out.height]).toEqual([200, 280]);
  });

  test('conteúdo minúsculo (menos de 10% da página) devolve a página inteira', () => {
    const p = branco(200, 280);
    retangulo(p, 90, 130, 100, 140, [0, 0, 0]);
    const out = cropMargins(p);
    expect([out.width, out.height]).toEqual([200, 280]);
  });

  test('arte com fundo escuro não perde mais que a moldura', () => {
    const p = branco(400, 560);
    retangulo(p, 40, 40, 360, 520, [10, 10, 10]); // arte escura, sem moldura separada
    const out = cropMargins(p);
    expect(out.width).toBeGreaterThanOrEqual(320 - 2 * 3);
    expect(out.height).toBeGreaterThanOrEqual(480 - 2 * 3);
  });
});
