import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { caminhoPermitido, pastaMkp } from '../../src/main/paths';

describe('pasta MKP ao lado do PDF', () => {
  it('fica na mesma pasta do PDF e se chama MKP', () => {
    expect(pastaMkp(join('/trabalho', 'agendas', 'Elegance.pdf'))).toBe(join('/trabalho', 'agendas', 'MKP'));
  });
  it('recusa o que não é PDF', () => {
    expect(() => pastaMkp(join('/trabalho', 'agendas', 'notas.txt'))).toThrow(/PDF/);
  });
  it('imagens PNG/JPG também geram a pasta MKP ao lado delas', () => {
    for (const nome of ['arte.png', 'ARTE.JPG', 'foto.jpeg']) expect(pastaMkp(join('/c', 'CLIENTE', nome))).toBe(join('/c', 'CLIENTE', 'MKP'));
  });
  it('a pasta MKP aceita gravar PNG dentro dela', () => {
    const pasta = pastaMkp(join('/trabalho', 'Elegance.pdf'));
    expect(caminhoPermitido(pasta, join(pasta, 'Elegance_capa-01.png'))).toBe(true);
    expect(caminhoPermitido(pasta, join('/trabalho', 'Elegance_capa-01.png'))).toBe(false);
  });
});
