import { describe, expect, test } from 'vitest';
import { cropToBox } from '../../src/pdf/crop';
import { caixaDoMolde, ehPaginaA4 } from '../../src/pdf/molde';

describe('molde do Corel (150 × 210 mm no centro de uma página A4)', () => {
  test('a caixa do molde, em frações da página A4, bate com as medidas do Corel', () => {
    const c = caixaDoMolde();
    expect(c.x).toBeCloseTo(29.951 / 210, 5);
    expect(c.y).toBeCloseTo((297 - 253.343) / 297, 5);
    expect(c.w).toBeCloseTo(150 / 210, 5);
    expect(c.h).toBeCloseTo(210 / 297, 5);
  });
  test('cortar uma página A4 nessa caixa dá exatamente a proporção 150:210 da capa', () => {
    const pagina = { width: 2100, height: 2970, data: new Uint8ClampedArray(2100 * 2970 * 4) };
    const r = cropToBox(pagina, caixaDoMolde());
    expect(r.width / r.height).toBeCloseTo(150 / 210, 3);
    expect(r.width).toBe(1500);
  });
  test('só trata como A4 a página com a proporção 210:297 (outras caem no modo automático)', () => {
    expect(ehPaginaA4(2100, 2970)).toBe(true);
    expect(ehPaginaA4(2100, 2800)).toBe(false);
    expect(ehPaginaA4(2970, 2100)).toBe(false);
  });
});
