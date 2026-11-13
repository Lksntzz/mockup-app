import { describe, expect, test } from 'vitest';
import { aposConcluir, lerPendencia, montarPendencia, serializarPendencia } from '../../src/anuncios/pendencia';

const v = (capa: string, sku: string, ean: string) => ({ capa, sku, ean });

describe('pendencia', () => {
  test('tudo com EAN não gera pendência', () => {
    expect(montarPendencia('arte', [v('a', 's1', '7898764983584'), v('b', 's2', '7898764983584')])).toBeUndefined();
  });
  test('EAN parcial marca só as vazias', () => {
    const p = montarPendencia('arte', [v('a', 's1', '7898764983584'), v('b', 's2', ' '), v('c', 's3', '')])!;
    expect(p.capas.map((c) => c.n)).toEqual([2, 3]);
    expect(p.capas.every((c) => c.faltaEan && !c.faltaSku)).toBe(true);
  });
  test('SKU vazio marca faltaSku', () => {
    const p = montarPendencia('arte', [v('a', '', '')])!;
    expect(p.capas[0]).toEqual({ n: 1, capa: 'a', faltaEan: true, faltaSku: true });
  });
  test('ida e volta', () => {
    const p = montarPendencia('arte', [v('a', 's', '')])!;
    expect(lerPendencia(serializarPendencia(p))).toEqual(p);
  });
  test('texto inválido e versão 2 lançam', () => {
    expect(() => lerPendencia('{nao json')).toThrow(/pendente\.json/);
    expect(() => lerPendencia('{"versao":2,"arte":"a","capas":[]}')).toThrow(/vers/);
  });
  test('aposConcluir parcial e total', () => {
    const p = montarPendencia('arte', [v('a', 's', ''), v('b', 's', '')])!;
    const parcial = aposConcluir(p, [1])!;
    expect(parcial.capas.map((c) => c.n)).toEqual([2]);
    expect(aposConcluir(parcial, [2])).toBeUndefined();
  });
});
