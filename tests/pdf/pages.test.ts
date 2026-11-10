import { describe, expect, test } from 'vitest';
import { capaPageNumbers } from '../../src/pdf/pages';

describe('capaPageNumbers', () => {
  test('PDF de 10 páginas tem as capas nas páginas ímpares', () => {
    expect(capaPageNumbers(10)).toEqual([1, 3, 5, 7, 9]);
  });
  test('PDF de 9 páginas: a última página ímpar ainda é capa', () => {
    expect(capaPageNumbers(9)).toEqual([1, 3, 5, 7, 9]);
  });
  test('PDF de 1 página tem 1 capa', () => {
    expect(capaPageNumbers(1)).toEqual([1]);
  });
  test('PDF vazio não tem capas', () => {
    expect(capaPageNumbers(0)).toEqual([]);
  });
});
