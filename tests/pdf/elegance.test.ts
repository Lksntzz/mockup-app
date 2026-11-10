import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, test } from 'vitest';
import { cropMargins, cropToBox, widthForArt } from '../../src/pdf/crop';
import { openPdf } from '../../src/pdf/reader';

const ELEGANCE = fileURLToPath(new URL('../../fixtures/Elegance.pdf', import.meta.url));

// Regressão: o app mostrava a página inteira (fundo esticado + arte menor deslocada). Só a arte menor deve ir ao mockup.
describe.skipIf(!existsSync(ELEGANCE))('Elegance.pdf: só a arte menor vai para o mockup', () => {
  test('a arte recortada tem 1200 px de largura e a proporção da capa (não a da página A4)', async () => {
    const doc = await openPdf(new Uint8Array(readFileSync(ELEGANCE)), { createCanvas: (w, h) => createCanvas(w, h) as never });
    const caixa = await doc.artBox(1);
    const pagina = await doc.renderPage(1, widthForArt(1200, caixa));
    await doc.close();
    const arte = cropMargins(cropToBox(pagina, caixa!));
    expect(arte.width).toBeGreaterThanOrEqual(1195);
    expect(arte.width).toBeLessThanOrEqual(1205);
    expect(arte.width / arte.height).toBeGreaterThan(0.7);
    expect(arte.width / arte.height).toBeLessThan(0.715); // a página A4 inteira daria 0,707 também: confere o tamanho abaixo
    expect(pagina.width).toBeGreaterThan(1500); // a página foi renderizada maior para a arte sair com 1200 px
    expect(arte.width / pagina.width).toBeCloseTo(0.75, 1); // a arte é ~75% da página, não a página toda
  });
});
