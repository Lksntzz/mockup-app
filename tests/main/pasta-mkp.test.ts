import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { caminhoPermitido, pastaMkp } from '../../src/main/paths';

describe('pasta MKP ao lado do PDF', () => {
  it('fica na mesma pasta do PDF e se chama MKP', () => {
    expect(pastaMkp(join('/trabalho', 'agendas', 'Elegance.pdf'))).toBe(join('/trabalho', 'agendas', 'MKP'));
  });
  it('recusa o que não é PDF', () => {
    expect(() => pastaMkp(join('/trabalho', 'agendas', 'foto.png'))).toThrow(/PDF/);
  });
  it('a pasta MKP aceita gravar PNG dentro dela', () => {
    const pasta = pastaMkp(join('/trabalho', 'Elegance.pdf'));
    expect(caminhoPermitido(pasta, join(pasta, 'Elegance_capa-01.png'))).toBe(true);
    expect(caminhoPermitido(pasta, join('/trabalho', 'Elegance_capa-01.png'))).toBe(false);
  });
});
