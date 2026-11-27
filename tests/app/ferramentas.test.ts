import { describe, expect, test } from 'vitest';
import { ferramentaValida, visibilidade } from '../../src/app/ferramentas';

describe('ferramentaValida', () => {
  test('aceita as duas ferramentas', () => {
    expect(ferramentaValida('converte')).toBe('converte');
    expect(ferramentaValida('mkp')).toBe('mkp');
  });
  test('qualquer outra coisa vira MKP', () => {
    for (const v of ['xyz', undefined, null, 42, {}, '']) expect(ferramentaValida(v)).toBe('mkp');
  });
});

describe('visibilidade', () => {
  test('MKP mostra as abas e o conteúdo do MKP, não o Converte', () => {
    expect(visibilidade('mkp')).toEqual({ abasDoMkp: true, conteudoDoMkp: true, converte: false });
  });
  test('Converte esconde tudo do MKP', () => {
    expect(visibilidade('converte')).toEqual({ abasDoMkp: false, conteudoDoMkp: false, converte: true });
  });
});
