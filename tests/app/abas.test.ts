import { describe, expect, test } from 'vitest';
import { abasVisiveis, vizinha } from '../../src/app/abas';

describe('abasVisiveis', () => {
  test('só a frente quando nada extra está marcado e não há página par', () => {
    expect(abasVisiveis({ temVerso: false, vt: false, semCanguru: false })).toEqual(['frente']);
  });
  test('verso aparece quando a capa tem página par', () => {
    expect(abasVisiveis({ temVerso: true, vt: false, semCanguru: false })).toEqual(['frente', 'verso']);
  });
  test('as especificações marcadas entram na ordem frente, especificação VT, sem canguru, verso', () => {
    expect(abasVisiveis({ temVerso: true, vt: true, semCanguru: true })).toEqual(['frente', 'vt', 'sem-canguru', 'verso']);
    expect(abasVisiveis({ temVerso: false, vt: false, semCanguru: true })).toEqual(['frente', 'sem-canguru']);
  });
});

describe('vizinha (setas)', () => {
  const abas = ['frente', 'vt', 'verso'] as const;
  test('avança e volta, dando a volta nas pontas', () => {
    expect(vizinha([...abas], 'frente', 1)).toBe('vt');
    expect(vizinha([...abas], 'verso', 1)).toBe('frente');
    expect(vizinha([...abas], 'frente', -1)).toBe('verso');
  });
  test('se a aba atual sumiu, começa pela frente', () => {
    expect(vizinha(['frente', 'verso'], 'vt', 1)).toBe('frente');
  });
});
