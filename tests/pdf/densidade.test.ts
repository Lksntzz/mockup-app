import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, test } from 'vitest';
import { openPdf } from '../../src/pdf/reader';
import { pdfComImagem } from '../support/pdfComImagem';

const opts = { createCanvas: (w: number, h: number) => createCanvas(w, h) as never };

describe('artDensidade: pixels reais da imagem da arte dentro do PDF', () => {
  test('imagem que cobre a página inteira: pixels nativos por largura/altura da página', async () => {
    const doc = await openPdf(pdfComImagem({ w: 200, h: 300 }, { w: 40, h: 60 }, { x: 0, y: 0, w: 200, h: 300 }), opts);
    const d = await doc.artDensidade(1);
    expect(d).not.toBeNull();
    expect(d!.pxPorLarguraDaPagina).toBeCloseTo(40, 3);
    expect(d!.pxPorAlturaDaPagina).toBeCloseTo(60, 3);
  });
  test('imagem que ocupa metade da largura da página: a página inteira equivale ao dobro dos pixels', async () => {
    const doc = await openPdf(pdfComImagem({ w: 200, h: 300 }, { w: 40, h: 60 }, { x: 50, y: 75, w: 100, h: 150 }), opts);
    const d = await doc.artDensidade(1);
    expect(d!.pxPorLarguraDaPagina).toBeCloseTo(80, 3);
    expect(d!.pxPorAlturaDaPagina).toBeCloseTo(120, 3);
  });
  test('imagem pequena demais para ser "a arte" (menos de 20% da página) não conta', async () => {
    const doc = await openPdf(pdfComImagem({ w: 200, h: 300 }, { w: 40, h: 60 }, { x: 0, y: 0, w: 20, h: 30 }), opts);
    expect(await doc.artDensidade(1)).toBeNull();
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pixelsNativosDaArte } from '../../src/app/qualidade';
import { cropMargins, cropToBox, widthForArt } from '../../src/pdf/crop';

const CAPAS = fileURLToPath(new URL('../../fixtures/CAPAS.pdf', import.meta.url));
describe.skipIf(!existsSync(CAPAS))('com CAPAS.pdf (o PDF de exemplo da empresa)', () => {
  test('a página 1 tem uma imagem de 1055 × 1491 px (ocupa parte da página) e a arte recortada não passa disso', async () => {
    const doc = await openPdf(new Uint8Array(readFileSync(CAPAS)), opts);
    const d = await doc.artDensidade(1);
    expect(d!.pxPorLarguraDaPagina).toBeGreaterThan(1055); // a imagem ocupa só parte da largura da página
    const caixa = await doc.artBox(1);
    const pagina = await doc.renderPage(1, widthForArt(1200, caixa));
    const arte = cropMargins(caixa ? cropToBox(pagina, caixa) : pagina);
    const px = pixelsNativosDaArte({ largura: arte.width, altura: arte.height }, { largura: pagina.width, altura: pagina.height }, d!)!;
    console.log('CAPAS.pdf p1: arte real', px);
    expect(px.largura).toBeLessThanOrEqual(1055);
    expect(px.largura).toBeGreaterThan(600);
  });
});
