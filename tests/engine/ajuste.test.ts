import { describe, expect, test } from 'vitest';
import { AJUSTE_NULO, ajusteEhNulo, ajusteValido, ajustarArte, chaveDoAjuste } from '../../src/engine/ajuste';
import type { Raster } from '../../src/engine/types';

function arte(w: number, h: number, cor: (x: number, y: number) => [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(cor(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
const px = (r: Raster, x: number, y: number) => Array.from(r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4));

describe('ajustarArte', () => {
  const vermelha = arte(10, 10, () => [255, 0, 0, 255]);
  test('sem ajuste devolve a própria arte (sem gastar tempo nem memória)', () => {
    expect(ajustarArte(vermelha, undefined)).toBe(vermelha);
    expect(ajustarArte(vermelha, AJUSTE_NULO)).toBe(vermelha);
  });
  test('zoom menor deixa a borda transparente e o centro com arte', () => {
    const r = ajustarArte(vermelha, { zoom: 0.5, x: 0, y: 0 });
    expect(px(r, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(px(r, 0, 0)[3]).toBe(0);
    expect(r.width).toBe(10);
  });
  test('zoom maior ocupa tudo', () => {
    const r = ajustarArte(vermelha, { zoom: 2, x: 0, y: 0 });
    expect(px(r, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(r, 9, 9)).toEqual([255, 0, 0, 255]);
  });
  test('deslocar para a direita abre vazio à esquerda e leva a arte para a direita', () => {
    const lado = arte(10, 10, (x) => (x < 5 ? [0, 0, 255, 255] : [0, 255, 0, 255]));
    const r = ajustarArte(lado, { zoom: 1, x: 0.2, y: 0 });
    expect(px(r, 0, 5)[3]).toBe(0);
    expect(px(r, 3, 5)).toEqual([0, 0, 255, 255]);
    expect(px(r, 9, 5)).toEqual([0, 255, 0, 255]);
  });
  test('deslocar para baixo abre vazio em cima', () => {
    const r = ajustarArte(vermelha, { zoom: 1, x: 0, y: 0.3 });
    expect(px(r, 5, 0)[3]).toBe(0);
    expect(px(r, 5, 9)).toEqual([255, 0, 0, 255]);
  });
});

describe('ajusteValido / chave', () => {
  test('prende nos limites e ignora lixo', () => {
    expect(ajusteValido({ zoom: 99, x: -9, y: 9 })).toEqual({ zoom: 2, x: -0.5, y: 0.5 });
    expect(ajusteValido({ zoom: NaN, x: 'a' as unknown as number })).toEqual(AJUSTE_NULO);
    expect(ajusteValido(null)).toEqual(AJUSTE_NULO);
  });
  test('ajuste nulo tem chave vazia', () => {
    expect(ajusteEhNulo(AJUSTE_NULO)).toBe(true);
    expect(chaveDoAjuste(AJUSTE_NULO)).toBe('');
    expect(chaveDoAjuste({ zoom: 1.2, x: 0, y: 0 })).not.toBe('');
  });
});
