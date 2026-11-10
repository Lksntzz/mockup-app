import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Raster } from '../engine/types';

export type PdfErrorCode = 'not-pdf' | 'password' | 'corrupt';

export class PdfError extends Error {
  constructor(
    public readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfError';
  }
}

interface CanvasLike {
  width: number;
  height: number;
  getContext(tipo: '2d'): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface OpenPdfOptions {
  /** Cria o canvas onde a página é desenhada. Padrão: canvas do navegador (app); nos testes em Node, o @napi-rs/canvas. */
  createCanvas?: (width: number, height: number) => CanvasLike;
}
export interface PdfDocument {
  pageCount: number;
  renderPage(n: number, widthPx: number): Promise<Raster>;
  close(): Promise<void>;
}

function canvasDoNavegador(width: number, height: number): CanvasLike {
  if (typeof document === 'undefined') throw new Error('sem canvas: passe createCanvas em OpenPdfOptions');
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function pareceUmPdf(bytes: Uint8Array): boolean {
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return inicio.includes('%PDF-');
}

export async function openPdf(data: Uint8Array, opts: OpenPdfOptions = {}): Promise<PdfDocument> {
  if (!pareceUmPdf(data)) throw new PdfError('not-pdf', 'O arquivo não é um PDF.');
  const criar = opts.createCanvas ?? canvasDoNavegador;

  // o pdf.js toma posse do buffer: entrega uma cópia
  const tarefa = pdfjs.getDocument({ data: data.slice(), verbosity: 0 });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await tarefa.promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') {
      throw new PdfError('password', 'O PDF tem senha e não pode ser aberto.');
    }
    throw new PdfError('corrupt', 'O PDF está corrompido ou incompleto.');
  }

  return {
    pageCount: doc.numPages,
    async renderPage(n: number, widthPx: number): Promise<Raster> {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: widthPx / base.width });
      const largura = Math.round(viewport.width);
      const altura = Math.round(viewport.height);
      const canvas = criar(largura, altura);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, largura, altura);
      await pagina.render({ canvasContext: ctx, canvas, viewport } as never).promise;
      const img = ctx.getImageData(0, 0, largura, altura);
      return { width: largura, height: altura, data: new Uint8ClampedArray(img.data) };
    },
    close: () => tarefa.destroy(),
  };
}
