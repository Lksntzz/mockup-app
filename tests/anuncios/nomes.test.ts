import { describe, expect, test } from 'vitest';
import { mesmoNome, nomeDePastaSeguro } from '../../src/anuncios/nomes';

describe('nomes', () => {
  test('nomeDePastaSeguro troca caracteres proibidos e corta pontas', () => {
    expect(nomeDePastaSeguro('Tulipa/gel: <rosa>. ')).toEqual({ nome: 'Tulipa-gel- -rosa-', alterado: true });
    expect(nomeDePastaSeguro('Tulipa gel')).toEqual({ nome: 'Tulipa gel', alterado: false });
  });
  test('nunca sai da pasta da categoria', () => {
    expect(nomeDePastaSeguro('..\\..\\Windows').nome).not.toMatch(/[\\/]|^\.\./);
    expect(nomeDePastaSeguro('CON').nome).not.toBe('CON');
    expect(nomeDePastaSeguro('   ').nome).toBe('');
  });
  test('limita a 80 caracteres', () => {
    expect(nomeDePastaSeguro('a'.repeat(100)).nome).toHaveLength(80);
  });
  test('mesmoNome ignora caixa e acento', () => {
    expect(mesmoNome('agenda', ' Ágenda ')).toBe(true);
    expect(mesmoNome('agenda', 'agendas')).toBe(false);
  });
});
