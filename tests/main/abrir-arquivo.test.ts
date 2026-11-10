import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { arquivoAbrivel } from '../../src/main/abrir-arquivo';

const raizes = [join('/drive', '1 AGUARDA ARTE'), join('/drive', '2 APROVAR'), join('/drive', '3 IMPRESSAO')];

describe('arquivoAbrivel (só abre arquivo de cliente, no programa padrão do Windows)', () => {
  test('aceita .cdr, .pdf e imagens dentro da pasta de um cliente nas Pastas 1, 2 ou 3', () => {
    for (const nome of ['capa.cdr', 'CAPA.PDF', 'arte.png', 'foto.jpg', 'foto.jpeg']) {
      expect(arquivoAbrivel(raizes, join(raizes[0]!, 'CLIENTE', nome))).toBe(true);
    }
    expect(arquivoAbrivel(raizes, join(raizes[1]!, 'CLIENTE', 'capa.cdr'))).toBe(true);
  });
  test('recusa programas e scripts, mesmo dentro da pasta do cliente', () => {
    for (const nome of ['setup.exe', 'macro.bat', 'x.lnk', 'a.ps1', 'b.js', 'semextensao']) {
      expect(arquivoAbrivel(raizes, join(raizes[0]!, 'CLIENTE', nome))).toBe(false);
    }
  });
  test('recusa arquivo fora das pastas do fluxo, inclusive com ../', () => {
    expect(arquivoAbrivel(raizes, join('/outro', 'capa.cdr'))).toBe(false);
    expect(arquivoAbrivel(raizes, join(raizes[0]!, '..', 'segredo.pdf'))).toBe(false);
    expect(arquivoAbrivel(raizes, raizes[0]! + '/../../etc/x.pdf')).toBe(false);
  });
  test('recusa a própria pasta raiz e caminho vazio', () => {
    expect(arquivoAbrivel(raizes, raizes[0]!)).toBe(false);
    expect(arquivoAbrivel(raizes, '')).toBe(false);
    expect(arquivoAbrivel([], join('/x', 'a.cdr'))).toBe(false);
  });
});
