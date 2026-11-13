import { describe, expect, test } from 'vitest';
import { montarTxt } from '../../src/anuncios/txt';

describe('txt', () => {
  test('montarTxt segue o formato do spec', () => {
    const t = montarTxt({ plataforma: 'Shopee', categoria: 'Agenda', arte: 'Tulipa gel', titulo: 'Agenda 2027',
      variacoes: [{ capa: 'Tulipa rosa', sku: 'AG27-TUL-01', ean: '7898764983584' }, { capa: 'Azul', sku: '', ean: '' }] });
    expect(t).toBe(['Plataforma: Shopee', 'Categoria: Agenda', 'Arte: Tulipa gel', 'Título: Agenda 2027', '', 'Variações:',
      '1 | Capa: Tulipa rosa | SKU: AG27-TUL-01 | EAN: 7898764983584',
      '2 | Capa: Azul | SKU: (pendente) | EAN: (pendente)'].join('\r\n'));
  });
  test('subcategoria vem logo após Categoria só quando preenchida', () => {
    const base = { plataforma: 'ML', categoria: 'AGENDAMENTO', arte: 'A', titulo: 'T', variacoes: [] };
    const linhas = montarTxt({ ...base, subcategoria: 'MANICURE' }).split('\r\n');
    expect(linhas[1]).toBe('Categoria: AGENDAMENTO');
    expect(linhas[2]).toBe('Subcategoria: MANICURE');
    expect(montarTxt(base)).not.toContain('Subcategoria:');
    expect(montarTxt({ ...base, subcategoria: '' })).not.toContain('Subcategoria:');
  });
});
