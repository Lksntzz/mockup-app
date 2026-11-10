import { describe, expect, test } from 'vitest';
import { blendOver, newRaster } from '../../src/engine/blend';
import type { Blend, Raster } from '../../src/engine/types';

function solido(w: number, h: number, r: number, g: number, b: number, a = 255): Raster {
  const x = newRaster(w, h);
  for (let i = 0; i < w * h; i++) x.data.set([r, g, b, a], i * 4);
  return x;
}
const px = (x: Raster, i = 0) => Array.from(x.data.slice(i * 4, i * 4 + 4));

describe('newRaster', () => {
  test('cria raster transparente com o tamanho pedido', () => {
    const x = newRaster(3, 2);
    expect([x.width, x.height, x.data.length]).toEqual([3, 2, 24]);
    expect(Array.from(x.data).every((v) => v === 0)).toBe(true);
  });
});

describe('blendOver', () => {
  test('normal com opacidade 1 cobre o destino', () => {
    const dst = solido(1, 1, 255, 255, 255);
    blendOver(dst, solido(1, 1, 255, 0, 0), [0, 0], 1, 'normal');
    expect(px(dst)).toEqual([255, 0, 0, 255]);
  });

  test('normal com opacidade 0.5 mistura', () => {
    const dst = solido(1, 1, 255, 255, 255);
    blendOver(dst, solido(1, 1, 255, 0, 0), [0, 0], 0.5, 'normal');
    const [r, g, b, a] = px(dst) as [number, number, number, number];
    expect(r).toBe(255);
    expect(Math.abs(g - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 128)).toBeLessThanOrEqual(1);
    expect(a).toBe(255);
  });

  test('multiply com cinza 128 escurece', () => {
    const dst = solido(1, 1, 255, 255, 255);
    blendOver(dst, solido(1, 1, 128, 128, 128), [0, 0], 1, 'multiply');
    const [r] = px(dst) as [number];
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
  });

  test('color-burn com branco não muda o destino', () => {
    const dst = solido(1, 1, 100, 150, 200);
    blendOver(dst, solido(1, 1, 255, 255, 255), [0, 0], 1, 'color-burn');
    expect(px(dst)).toEqual([100, 150, 200, 255]);
  });

  test('color-burn com cinza 128 sobre 200 dá 145 (fórmula padrão do W3C)', () => {
    const dst = solido(1, 1, 200, 200, 200);
    blendOver(dst, solido(1, 1, 128, 128, 128), [0, 0], 1, 'color-burn');
    expect(Math.abs((px(dst)[0] as number) - 145)).toBeLessThanOrEqual(1);
  });

  test('color-burn com preto zera o canal quando o fundo não é branco', () => {
    const dst = solido(1, 1, 200, 200, 200);
    blendOver(dst, solido(1, 1, 0, 0, 0), [0, 0], 1, 'color-burn');
    expect(px(dst)).toEqual([0, 0, 0, 255]);
  });

  test('alfa zero não altera o destino', () => {
    const dst = solido(1, 1, 10, 20, 30);
    blendOver(dst, solido(1, 1, 255, 0, 0, 0), [0, 0], 1, 'normal');
    expect(px(dst)).toEqual([10, 20, 30, 255]);
  });

  test('destino transparente recebe a cor e o alfa da origem', () => {
    const dst = newRaster(1, 1);
    blendOver(dst, solido(1, 1, 10, 20, 30, 200), [0, 0], 1, 'normal');
    expect(px(dst)).toEqual([10, 20, 30, 200]);
  });

  test('offset fora da tela é cortado sem erro', () => {
    const dst = solido(2, 2, 255, 255, 255);
    expect(() => blendOver(dst, solido(2, 2, 0, 0, 0), [1, 1], 1, 'normal')).not.toThrow();
    expect(px(dst, 3)).toEqual([0, 0, 0, 255]);
    expect(px(dst, 0)).toEqual([255, 255, 255, 255]);
    expect(() => blendOver(dst, solido(2, 2, 0, 0, 0), [-5, 40], 1, 'normal')).not.toThrow();
  });
});

describe('blendOver (caminho rápido contra a fórmula de referência)', () => {
  // fórmula original, pixel a pixel, em ponto flutuante
  function referencia(dst: Raster, src: Raster, [ox, oy]: [number, number], opacity: number, blend: Blend): Raster {
    const out: Raster = { width: dst.width, height: dst.height, data: new Uint8ClampedArray(dst.data) };
    const mix = (cb: number, cs: number) => {
      if (blend === 'multiply') return cb * cs;
      if (blend === 'color-burn') return cb >= 1 ? 1 : cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs);
      return cs;
    };
    for (let y = Math.max(0, oy); y < Math.min(dst.height, oy + src.height); y++) {
      for (let x = Math.max(0, ox); x < Math.min(dst.width, ox + src.width); x++) {
        const si = ((y - oy) * src.width + (x - ox)) * 4;
        const sa = (src.data[si + 3]! / 255) * opacity;
        if (sa <= 0) continue;
        const di = (y * dst.width + x) * 4;
        const ab = out.data[di + 3]! / 255;
        const ar = sa + ab * (1 - sa);
        const k = sa / ar;
        for (let c = 0; c < 3; c++) {
          const cb = out.data[di + c]! / 255;
          const cs = src.data[si + c]! / 255;
          const co = (1 - ab) * cs + ab * mix(cb, cs);
          out.data[di + c] = Math.round(((1 - k) * cb + k * co) * 255);
        }
        out.data[di + 3] = Math.round(ar * 255);
      }
    }
    return out;
  }
  let semente = 12345;
  const alea = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const aleatorio = (w: number, h: number, alfaVariado: boolean): Raster => {
    const r = newRaster(w, h);
    for (let i = 0; i < r.data.length; i += 4) {
      r.data[i] = Math.floor(alea() * 256);
      r.data[i + 1] = Math.floor(alea() * 256);
      r.data[i + 2] = Math.floor(alea() * 256);
      const sorte = alea();
      r.data[i + 3] = !alfaVariado || sorte < 0.4 ? 255 : sorte < 0.55 ? 0 : Math.floor(alea() * 256);
    }
    return r;
  };

  for (const blend of ['normal', 'multiply', 'color-burn'] as const) {
    for (const opacity of [1, 0.5, 0.12]) {
      for (const fundoOpaco of [true, false]) {
        test(`${blend}, opacidade ${opacity}, fundo ${fundoOpaco ? 'opaco' : 'com transparência'}`, () => {
          const dst = aleatorio(30, 20, !fundoOpaco);
          const src = aleatorio(24, 18, true);
          const esperado = referencia(dst, src, [3, 2], opacity, blend);
          blendOver(dst, src, [3, 2], opacity, blend);
          let maior = 0;
          for (let i = 0; i < dst.data.length; i++) maior = Math.max(maior, Math.abs((dst.data[i] as number) - (esperado.data[i] as number)));
          expect(maior).toBeLessThanOrEqual(1);
        });
      }
    }
  }
});
