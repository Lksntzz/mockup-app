import { describe, expect, test } from 'vitest';
import { gtin13CheckDigit, isValidGtin13, normalizarEan } from '../../src/anuncios/gtin';

describe('gtin', () => {
  test('valida GTIN-13 conhecidos do NISTI', () => {
    for (const g of ['7898764983362', '7898764983386', '7898764983393', '7898764983072', '7898764983089', '7898764983096', '7898764983102']) {
      expect(isValidGtin13(g), g).toBe(true);
    }
  });
  test('recusa malformados e com dígito verificador errado', () => {
    expect(isValidGtin13('7898765983362')).toBe(false);
    expect(isValidGtin13('789876498336')).toBe(false);
    expect(isValidGtin13('789876498336A')).toBe(false);
  });
  test('calcula o dígito verificador', () => {
    expect(gtin13CheckDigit('789876498336')).toBe(2);
    expect(gtin13CheckDigit('789876498307')).toBe(2);
    expect(gtin13CheckDigit('789876498310')).toBe(2);
    expect(gtin13CheckDigit('123')).toBeNull();
  });
  test('normalizarEan limpa o que o usuário cola', () => {
    expect(normalizarEan(' 789 1234-567895\n')).toBe('7891234567895');
    expect(normalizarEan('7898 764983584')).toBe('7898764983584');
  });
  test('EAN com dígito verificador errado é recusado', () => {
    expect(isValidGtin13('7898764983585')).toBe(false);
    expect(isValidGtin13('7898764983584')).toBe(true);
  });
});
