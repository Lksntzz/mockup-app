import { describe, expect, test } from 'vitest';
import { avaliarQualidade, pedidoDeNovaArte, type AreaMm } from '../../src/app/qualidade';

const area: AreaMm = { largura: 100, altura: 200 };
const limites = { boa: 250, limite: 150 };

describe('avaliarQualidade', () => {
  test('arte que cobre a área com folga é boa (dpi pelo lado que mais aperta)', () => {
    // 1200px em 100mm = 304 dpi; 2400px em 200mm = 304 dpi
    const r = avaliarQualidade({ largura: 1200, altura: 2400 }, area, limites);
    expect(r.nivel).toBe('boa');
    expect(Math.round(r.dpi)).toBe(305);
  });
  test('o lado mais fraco decide: arte larga que, ao cobrir a altura, fica baixa', () => {
    // largura sobra (3000px = 762dpi), altura é o gargalo (1000px em 200mm = 127dpi)
    const r = avaliarQualidade({ largura: 3000, altura: 1000 }, area, limites);
    expect(Math.round(r.dpi)).toBe(127);
    expect(r.nivel).toBe('baixa');
  });
  test('entre os dois limites é "limite"', () => {
    // 20% abaixo de 250 => ~200 dpi
    const r = avaliarQualidade({ largura: 800, altura: 1600 }, area, limites);
    expect(Math.round(r.dpi)).toBe(203);
    expect(r.nivel).toBe('limite');
  });
  test('exatamente nos limites: 250 é boa, 150 é limite', () => {
    const pxPara = (dpi: number) => ({ largura: (dpi * 100) / 25.4, altura: (dpi * 200) / 25.4 });
    expect(avaliarQualidade(pxPara(250), area, limites).nivel).toBe('boa');
    expect(avaliarQualidade(pxPara(150), area, limites).nivel).toBe('limite');
    expect(avaliarQualidade(pxPara(149), area, limites).nivel).toBe('baixa');
  });
  test('tamanho inválido não explode: vira baixa com dpi 0', () => {
    expect(avaliarQualidade({ largura: 0, altura: 100 }, area, limites)).toEqual({ dpi: 0, nivel: 'baixa' });
  });
});

describe('pedidoDeNovaArte', () => {
  test('diz a resolução medida e o tamanho mínimo em pixels para ficar boa', () => {
    const t = pedidoDeNovaArte({ largura: 800, altura: 1600 }, area, limites);
    expect(t).toContain('800 × 1600');
    expect(t).toContain('203 DPI');
    expect(t).toContain('985 × 1969'); // 250 dpi em 100x200 mm
  });
});
