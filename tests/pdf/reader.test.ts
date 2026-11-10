import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, test } from 'vitest';
import { cropMargins } from '../../src/pdf/crop';
import { openPdf, PdfError } from '../../src/pdf/reader';

const CAPAS = fileURLToPath(new URL('../../fixtures/CAPAS.pdf', import.meta.url));
const SENHA = fileURLToPath(new URL('../data/senha.pdf', import.meta.url));
const opts = { createCanvas: (w: number, h: number) => createCanvas(w, h) as never };

async function codigoDoErro(bytes: Uint8Array): Promise<string | undefined> {
  try {
    await openPdf(bytes, opts);
  } catch (e) {
    return e instanceof PdfError ? e.code : `outro:${String(e)}`;
  }
  return undefined;
}

describe('openPdf: erros', () => {
  test('arquivo que não é PDF dá PdfError not-pdf', async () => {
    expect(await codigoDoErro(new TextEncoder().encode('isto é um texto, não um PDF'))).toBe('not-pdf');
  });
  test('arquivo vazio dá PdfError not-pdf', async () => {
    expect(await codigoDoErro(new Uint8Array(0))).toBe('not-pdf');
  });
  test('PDF com senha dá PdfError password', async () => {
    expect(await codigoDoErro(new Uint8Array(readFileSync(SENHA)))).toBe('password');
  });
});

describe.skipIf(!existsSync(CAPAS))('openPdf com CAPAS.pdf', () => {
  const bytes = () => new Uint8Array(readFileSync(CAPAS));

  test('PDF truncado dá PdfError corrupt', async () => {
    expect(await codigoDoErro(bytes().slice(0, 4000))).toBe('corrupt');
  });

  test('lê 10 páginas e renderiza a primeira com a largura pedida', async () => {
    const doc = await openPdf(bytes(), opts);
    expect(doc.pageCount).toBe(10);
    const p = await doc.renderPage(1, 1055);
    expect(p.width).toBe(1055);
    expect(p.height).toBeGreaterThan(1055);
    expect(p.data.length).toBe(p.width * p.height * 4);
  });

  test('página 1 recortada fica com a caixa da arte (proporção cerca de 0,765) e sem a moldura nas bordas', async () => {
    const doc = await openPdf(bytes(), opts);
    const arte = cropMargins(await doc.renderPage(1, 1200));
    const proporcao = arte.width / arte.height;
    expect(proporcao).toBeGreaterThan(0.74);
    expect(proporcao).toBeLessThan(0.79);
    const luz = (x: number, y: number) => {
      const i = (y * arte.width + x) * 4;
      return ((arte.data[i] as number) + (arte.data[i + 1] as number) + (arte.data[i + 2] as number)) / 3;
    };
    const meio = Math.floor(arte.height / 2);
    // o fundo da arte é lilás claro (luz ~210): a moldura cinza/escura não pode sobrar nas 2 primeiras colunas e linhas
    for (const d of [0, 1]) {
      expect(luz(d, meio)).toBeGreaterThan(190);
      expect(luz(arte.width - 1 - d, meio)).toBeGreaterThan(190);
      expect(luz(Math.floor(arte.width / 2), d)).toBeGreaterThan(190);
      expect(luz(Math.floor(arte.width / 2), arte.height - 1 - d)).toBeGreaterThan(190);
    }
  });

  test('abrir e renderizar a página 1 leva menos de 5 s', async () => {
    const t0 = performance.now();
    const doc = await openPdf(bytes(), opts);
    await doc.renderPage(1, 1055);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
