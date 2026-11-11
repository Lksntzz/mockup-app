import { describe, expect, test } from 'vitest';
import { ajustarArte } from '../../src/engine/ajuste';
import { warpToQuad } from '../../src/engine/warp';
import type { Raster } from '../../src/engine/types';

function arte(w: number, h: number): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([(x * 255) / w, (y * 255) / h, ((x + y) * 127) / (w + h), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}
const cantos: [[number, number], [number, number], [number, number], [number, number]] = [[20, 10], [180, 16], [176, 190], [14, 184]];

describe('ajuste feito dentro da deformação', () => {
  test('dá o mesmo resultado (quase) que ajustar a arte antes e deformar depois', () => {
    const a = arte(120, 160);
    for (const ajuste of [{ zoom: 0.7, x: 0, y: 0 }, { zoom: 1.3, x: 0.1, y: -0.05 }, { zoom: 1, x: 0.2, y: 0.15 }]) {
      const novo = warpToQuad(a, cantos, { width: 200, height: 200 }, ajuste);
      const velho = warpToQuad(ajustarArte(a, ajuste), cantos, { width: 200, height: 200 });
      let diferentes = 0;
      let total = 0;
      for (let i = 0; i < novo.data.length; i += 4) {
        const alfaN = novo.data[i + 3]!;
        const alfaV = velho.data[i + 3]!;
        if (alfaN === 0 && alfaV === 0) continue;
        total++;
        // bordas (antisserrilhado) podem variar um pouco; o miolo precisa bater
        if (Math.abs(alfaN - alfaV) > 60 || (alfaN > 200 && alfaV > 200 && Math.abs(novo.data[i]! - velho.data[i]!) > 12)) diferentes++;
      }
      expect(total).toBeGreaterThan(1000);
      expect(diferentes / total).toBeLessThan(0.02);
    }
  });
  test('a arte ajustada nunca passa para fora do quadrilátero original', () => {
    const a = arte(120, 160);
    const sem = warpToQuad(a, cantos, { width: 200, height: 200 });
    const com = warpToQuad(a, cantos, { width: 200, height: 200 }, { zoom: 1.5, x: 0.3, y: 0 });
    for (let i = 3; i < com.data.length; i += 4) if (sem.data[i] === 0) expect(com.data[i]).toBe(0);
  });
});
