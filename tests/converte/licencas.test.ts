import { describe, expect, test } from 'vitest';
import { LINKS_DE_LICENCA, linkDeLicencaPermitido } from '../../src/converte/licencas';

describe('links das licenças', () => {
  test('são os três endereços combinados, todos https', () => {
    expect(LINKS_DE_LICENCA.map((l) => l.url)).toEqual(['https://ffmpeg.org/', 'https://ffmpeg.org/download.html', 'https://github.com/eugeneware/ffmpeg-static']);
  });
  test('só esses endereços podem ser abertos no navegador', () => {
    for (const l of LINKS_DE_LICENCA) expect(linkDeLicencaPermitido(l.url)).toBe(true);
    for (const x of ['https://ffmpeg.org', 'https://ffmpeg.org/download.html?x=1', 'http://ffmpeg.org/', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', '', null, 42, undefined]) {
      expect(linkDeLicencaPermitido(x)).toBe(false);
    }
  });
});
