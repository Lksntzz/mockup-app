import { describe, expect, test } from 'vitest';
import { arrastarCanto, arrastarCorpo, cantoPerto, cantosDoAjuste, criarMapa, pontoDentro, zoomDaRoda } from '../../src/app/guia';
import { AJUSTE_NULO } from '../../src/engine/ajuste';

describe('guia de arrastar a arte', () => {
  test('o mapa leva a folha da arte para os cantos da prévia e de volta', () => {
    const m = criarMapa([[100, 50], [300, 60], [290, 400], [95, 380]]);
    expect(m.paraTela([0, 0])[0]).toBeCloseTo(100);
    expect(m.paraTela([1, 1])[1]).toBeCloseTo(400);
    const p = m.paraTela([0.3, 0.7]);
    const volta = m.paraArte(p);
    expect(volta[0]).toBeCloseTo(0.3);
    expect(volta[1]).toBeCloseTo(0.7);
  });
  test('sem ajuste os cantos são os da folha toda', () => {
    expect(cantosDoAjuste(AJUSTE_NULO)).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });
  test('arrastar o corpo move a arte pelo tanto que o mouse andou', () => {
    const a = arrastarCorpo(AJUSTE_NULO, [0.5, 0.5], [0.6, 0.45]);
    expect(a.x).toBeCloseTo(0.1);
    expect(a.y).toBeCloseTo(-0.05);
    expect(a.zoom).toBe(1);
  });
  test('arrastar um canto para dentro diminui, para fora aumenta, e o centro não sai do lugar', () => {
    const menor = arrastarCanto(AJUSTE_NULO, [1, 1], [0.75, 0.75]);
    expect(menor.zoom).toBeCloseTo(0.5);
    expect(menor.x).toBe(0);
    const maior = arrastarCanto(AJUSTE_NULO, [1, 1], [1.25, 1.25]);
    expect(maior.zoom).toBeCloseTo(1.5);
  });
  test('o tamanho nunca passa dos limites', () => {
    expect(arrastarCanto(AJUSTE_NULO, [1, 1], [9, 9]).zoom).toBe(2);
    expect(arrastarCanto(AJUSTE_NULO, [1, 1], [0.5001, 0.5001]).zoom).toBe(0.5);
    expect(arrastarCorpo(AJUSTE_NULO, [0, 0], [5, -5])).toMatchObject({ x: 0.5, y: -0.5 });
  });
  test('acha o canto perto do mouse e sabe se o ponto está dentro', () => {
    expect(cantoPerto(AJUSTE_NULO, [0.98, 0.02], 0.05)).toBe(1);
    expect(cantoPerto(AJUSTE_NULO, [0.5, 0.5], 0.05)).toBe(-1);
    expect(pontoDentro(AJUSTE_NULO, [0.5, 0.5])).toBe(true);
    expect(pontoDentro({ zoom: 0.5, x: 0, y: 0 }, [0.1, 0.1])).toBe(false);
  });
  test('a roda para cima aumenta e para baixo diminui', () => {
    expect(zoomDaRoda(AJUSTE_NULO, -100).zoom).toBeGreaterThan(1);
    expect(zoomDaRoda(AJUSTE_NULO, 100).zoom).toBeLessThan(1);
  });
});
