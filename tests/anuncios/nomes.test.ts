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
  test('nomes reservados do Windows, com ou sem extensão, ganham " -"', () => {
    expect(nomeDePastaSeguro('CON').nome).toBe('CON -');
    expect(nomeDePastaSeguro('COM1.txt').nome).toBe('COM1 -.txt');
    expect(nomeDePastaSeguro('CON.pdf').nome).toBe('CON -.pdf');
    expect(nomeDePastaSeguro('con.').nome).toBe('con -');
    expect(nomeDePastaSeguro('Aux.x').nome).toBe('Aux -.x');
    expect(nomeDePastaSeguro('lpt9').nome).toBe('lpt9 -');
  });
  test('nomes que apenas começam como reservados não mudam', () => {
    expect(nomeDePastaSeguro('Console')).toEqual({ nome: 'Console', alterado: false });
    expect(nomeDePastaSeguro('Comunicação')).toEqual({ nome: 'Comunicação', alterado: false });
  });
  test('limita a 80 caracteres', () => {
    expect(nomeDePastaSeguro('a'.repeat(100)).nome).toHaveLength(80);
  });
  test('mesmoNome ignora caixa e acento', () => {
    expect(mesmoNome('agenda', ' Ágenda ')).toBe(true);
    expect(mesmoNome('agenda', 'agendas')).toBe(false);
  });
});
