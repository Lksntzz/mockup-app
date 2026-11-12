import { describe, expect, test } from 'vitest';
import { cropToBox } from '../../src/pdf/crop';
import { caixaDoMolde, ehArteDoMoldeDoCorel, ehPaginaA4 } from '../../src/pdf/molde';

describe('molde do Corel (150 × 210 mm no centro de uma página A4)', () => {
  test('a caixa do molde, em frações da página A4, bate com as medidas do Corel', () => {
    const c = caixaDoMolde();
    expect(c.x).toBeCloseTo(29.951 / 210, 5);
    expect(c.y).toBeCloseTo((297 - 253.343) / 297, 5);
    expect(c.w).toBeCloseTo(150 / 210, 5);
    expect(c.h).toBeCloseTo(210 / 297, 5);
  });
  test('cortar uma página A4 nessa caixa dá exatamente a proporção 150:210 da capa', () => {
    const pagina = { width: 2100, height: 2970, data: new Uint8ClampedArray(2100 * 2970 * 4) };
    const r = cropToBox(pagina, caixaDoMolde());
    expect(r.width / r.height).toBeCloseTo(150 / 210, 3);
    expect(r.width).toBe(1500);
  });
  test('só trata como A4 a página com a proporção 210:297 (outras caem no modo automático)', () => {
    expect(ehPaginaA4(2100, 2970)).toBe(true);
    expect(ehPaginaA4(2100, 2800)).toBe(false);
    expect(ehPaginaA4(2970, 2100)).toBe(false);
  });
});

describe('arte do molde do Corel aberta direto (sem o botão "Abrir no molde")', () => {
  // a imagem de 195 × 255 mm, centrada no molde, em frações da página A4
  const arte = { x: (104.951 - 97.5) / 210, y: (297 - 148.343 - 127.5) / 297, w: 195 / 210, h: 255 / 297 };
  test('reconhece a arte de 195 × 255 mm no lugar do molde', () => {
    expect(ehArteDoMoldeDoCorel(arte)).toBe(true);
  });
  test('não confunde com a página inteira, com arte pequena ou sem imagem', () => {
    expect(ehArteDoMoldeDoCorel({ x: 0, y: 0, w: 1, h: 1 })).toBe(false);
    expect(ehArteDoMoldeDoCorel({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toBe(false);
    expect(ehArteDoMoldeDoCorel(null)).toBe(false);
  });
  test('arte do mesmo tamanho mas fora do centro do molde não conta', () => {
    expect(ehArteDoMoldeDoCorel({ ...arte, x: 0 })).toBe(false);
  });
});

describe('PDF de verdade com a arte do molde (lido pelo pdf.js)', () => {
  test('a imagem de 195 × 255 mm no lugar do molde é reconhecida pela caixa lida do PDF', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const { openPdf } = await import('../../src/pdf/reader');
    const { pdfComImagem } = await import('../support/pdfComImagem');
    const pt = (mm: number) => (mm * 72) / 25.4;
    const doc = await openPdf(
      pdfComImagem({ w: pt(210), h: pt(297) }, { w: 20, h: 26 }, { x: pt(104.951 - 97.5), y: pt(148.343 - 127.5), w: pt(195), h: pt(255) }),
      { createCanvas: (w: number, h: number) => createCanvas(w, h) as never },
    );
    expect(ehArteDoMoldeDoCorel(await doc.artBox(1))).toBe(true);
  });
});
