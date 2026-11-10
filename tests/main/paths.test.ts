import { describe, expect, test } from 'vitest';
import { caminhoPermitido } from '../../src/main/paths';

describe('caminhoPermitido (gravação só dentro da pasta escolhida, só PNG)', () => {
  const pasta = '/home/usuario/saida';
  test('aceita um PNG dentro da pasta', () => {
    expect(caminhoPermitido(pasta, '/home/usuario/saida/agenda_capa-01.png')).toBe(true);
  });
  test('recusa subir de pasta com ..', () => {
    expect(caminhoPermitido(pasta, '/home/usuario/saida/../fora.png')).toBe(false);
    expect(caminhoPermitido(pasta, '/home/usuario/saida/sub/../../fora.png')).toBe(false);
  });
  test('recusa caminho fora da pasta', () => {
    expect(caminhoPermitido(pasta, '/etc/passwd.png')).toBe(false);
    expect(caminhoPermitido(pasta, '/home/usuario/saida-outra/a.png')).toBe(false);
  });
  test('recusa extensão que não é .png', () => {
    expect(caminhoPermitido(pasta, '/home/usuario/saida/programa.exe')).toBe(false);
    expect(caminhoPermitido(pasta, '/home/usuario/saida/a.png.exe')).toBe(false);
  });
  test('recusa quando nenhuma pasta foi escolhida', () => {
    expect(caminhoPermitido('', '/home/usuario/saida/a.png')).toBe(false);
  });
});
