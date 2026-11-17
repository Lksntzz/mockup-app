import { describe, expect, test } from 'vitest';
import { motivoDoSkuInvalido } from '../../src/anuncios/sku';

describe('motivoDoSkuInvalido (regra do NISTI)', () => {
  test('aceita MIOLO_CAPA_ACABAMENTO, com X para sem tassel/elástico e minúsculas', () => {
    for (const s of ['AG27_ROSA_PXA', 'ag27_rosa_bpx', 'M1_C2_RXX', ' AG_B_BVL ']) expect(motivoDoSkuInvalido(s)).toBeUndefined();
  });
  test('recusa número de partes errado e partes vazias', () => {
    for (const s of ['', 'AG27', 'AG27_ROSA', 'A_B_PXA_Z', '_ROSA_PXA', 'AG27__PXA']) expect(motivoDoSkuInvalido(s)).toBeTruthy();
  });
  test('recusa acabamento com tamanho ou letra errada', () => {
    expect(motivoDoSkuInvalido('A_B_PX')).toMatch(/3 letras/);
    expect(motivoDoSkuInvalido('A_B_ZXA')).toMatch(/wire-o/);
    expect(motivoDoSkuInvalido('A_B_PZA')).toMatch(/tassel/);
    expect(motivoDoSkuInvalido('A_B_PXZ')).toMatch(/elástico/);
    expect(motivoDoSkuInvalido('A_B_XPA')).toMatch(/wire-o/); // X não vale para wire-o
  });
});
