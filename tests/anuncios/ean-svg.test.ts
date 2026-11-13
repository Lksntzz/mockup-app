import { describe, expect, test } from 'vitest';
import { layoutEan13 } from '../../src/anuncios/ean';
import { gerarSvgEan13 } from '../../src/anuncios/ean-svg';

const EAN = '7898764983584';

describe('gerarSvgEan13', () => {
  test('começa com <svg, tem viewBox e fundo branco', () => {
    const svg = gerarSvgEan13(EAN);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 543 189"');
    expect(svg).toContain('fill="#fff"');
  });
  test('uma barra preta por barra do layout, com x/y/width/height', () => {
    const svg = gerarSvgEan13(EAN);
    const barras = layoutEan13(EAN).barras;
    expect(svg.match(/<rect [^>]*fill="#000"/g)?.length).toBe(barras.length);
    for (const b of barras) {
      expect(svg).toContain(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"`);
    }
  });
  test('três textos com os dígitos, fonte Arial 24', () => {
    const svg = gerarSvgEan13(EAN);
    expect(svg.match(/<text/g)?.length).toBe(3);
    for (const t of ['>7<', '>898764<', '>983584<']) expect(svg).toContain(t);
    expect(svg).toContain('font-family="Arial"');
    expect(svg).toContain('font-size="24"');
  });
  test('normaliza espaços e quebra de linha', () => {
    expect(gerarSvgEan13(' 789 8764983584\n')).toBe(gerarSvgEan13(EAN));
  });
  test('recusa EAN inválido', () => {
    expect(() => gerarSvgEan13('7898764983585')).toThrow('EAN inválido');
    expect(() => gerarSvgEan13('')).toThrow('EAN inválido');
  });
});
