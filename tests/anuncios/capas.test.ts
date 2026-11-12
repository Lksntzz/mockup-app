import { describe, expect, test } from 'vitest';
import { capasDoPdf } from '../../src/anuncios/capas';

describe('capasDoPdf', () => {
  test('6 páginas = 3 capas com contra capa', () => {
    expect(capasDoPdf('a.pdf', 6).map((f) => f.tipo === 'pdf' && [f.paginaCapa, f.paginaContra])).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
  test('3 páginas deixa a última sem contra capa; 0 páginas = nenhuma', () => {
    const r = capasDoPdf('a.pdf', 3);
    expect(r[1]).toEqual({ tipo: 'pdf', arquivo: 'a.pdf', paginaCapa: 3 });
    expect(capasDoPdf('a.pdf', 0)).toEqual([]);
  });
});
