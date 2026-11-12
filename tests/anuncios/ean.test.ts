import { describe, expect, test } from 'vitest';
import { ampliacaoDoEan, avisoDeAmpliacao, encodeEan13, layoutEan13 } from '../../src/anuncios/ean';

describe('ean', () => {
  test('encodeEan13 tem 95 módulos com guardas 101, 01010, 101', () => {
    const m = encodeEan13('7898764983584');
    expect([m.length, m.slice(0, 3), m.slice(45, 50), m.slice(92)]).toEqual([95, '101', '01010', '101']);
  });
  test('encodeEan13 recusa valor inválido', () => {
    expect(() => encodeEan13('7898764983585')).toThrow('EAN-13 inválido para geração do código de barras.');
    expect(() => encodeEan13('123')).toThrow(/EAN-13 inválido/);
  });
  test('layoutEan13 usa as medidas do padrão oficial do NISTI', () => {
    const l = layoutEan13('7898764983584');
    expect([l.largura, l.altura]).toEqual([543, 189]);
    expect(l.barras.some((b) => b.h === 104)).toBe(true);
    expect(l.barras.some((b) => b.h === 92)).toBe(true);
    expect(l.barras.every((b) => b.y === 18 && b.w === 4.35)).toBe(true);
    expect(l.digitos.map((d) => d.texto)).toEqual(['7', '898764', '983584']);
    expect(l.digitos.map((d) => d.x)).toEqual([43, 169.28, 373.73]);
    expect([l.yDigitos, l.tamanhoDigitos]).toEqual([158, 24]);
  });
  test('layoutEan13 recusa valor inválido', () => {
    expect(() => layoutEan13('7898764983585')).toThrow(/EAN-13 inválido/);
  });
  test('ampliação: 41,19 mm de largura é 100%; 30 mm é abaixo de 80%', () => {
    expect(ampliacaoDoEan(41.19)).toBeCloseTo(1, 2);
    expect(avisoDeAmpliacao(ampliacaoDoEan(30))).not.toBeNull();
    expect(avisoDeAmpliacao(1)).toBeNull();
    expect(avisoDeAmpliacao(2.5)).not.toBeNull();
  });
});
