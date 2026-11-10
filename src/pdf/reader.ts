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
/** Retângulo em frações da página (0..1), com a origem no canto superior esquerdo. */
export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PdfDocument {
  pageCount: number;
  renderPage(n: number, widthPx: number): Promise<Raster>;
  /**
   * Onde está a imagem da arte na página: a ÚLTIMA imagem grande desenhada (a que fica por cima).
   * Em PDFs com um fundo esticado e a arte menor por cima (ex.: Elegance.pdf) devolve a arte, não o fundo.
   * Devolve null se a página não tem nenhuma imagem grande.
   */
  artBox(n: number): Promise<Caixa | null>;
  close(): Promise<void>;
}

function canvasDoNavegador(width: number, height: number): CanvasLike {
  if (typeof document === 'undefined') throw new Error('sem canvas: passe createCanvas em OpenPdfOptions');
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

type Matriz = [number, number, number, number, number, number];
/** A∘B: aplica B e depois A (mesma convenção do ctx.transform do canvas). */
function multiplicar(a: ArrayLike<number>, b: ArrayLike<number>): Matriz {
  const [a0, a1, a2, a3, a4, a5] = a as unknown as Matriz;
  const [b0, b1, b2, b3, b4, b5] = b as unknown as Matriz;
  return [a0 * b0 + a2 * b1, a1 * b0 + a3 * b1, a0 * b2 + a2 * b3, a1 * b2 + a3 * b3, a0 * b4 + a2 * b5 + a4, a1 * b4 + a3 * b5 + a5];
}
/** Uma imagem só conta como "a arte" se cobrir pelo menos esta fração da página. */
const AREA_MINIMA_DA_ARTE = 0.2;

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
    async artBox(n: number): Promise<Caixa | null> {
      const pagina = await doc.getPage(n);
      const viewport = pagina.getViewport({ scale: 1 });
      const ops = await pagina.getOperatorList();
      const OPS = pdfjs.OPS;
      let ctm: Matriz = [1, 0, 0, 1, 0, 0];
      const pilha: Matriz[] = [];
      let ultima: Caixa | null = null;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown;
        if (fn === OPS.save) {
          pilha.push(ctm);
        } else if (fn === OPS.restore) {
          ctm = pilha.pop() ?? ctm;
        } else if (fn === OPS.transform) {
          ctm = multiplicar(ctm, args as number[]);
        } else if (fn === OPS.paintFormXObjectBegin) {
          pilha.push(ctm);
          const m = (args as unknown[] | null)?.[0];
          if (Array.isArray(m) && m.length === 6) ctm = multiplicar(ctm, m as number[]);
        } else if (fn === OPS.paintFormXObjectEnd) {
          ctm = pilha.pop() ?? ctm;
        } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          // a imagem ocupa o quadrado unitário; leva ao espaço da tela (pixels da viewport)
          const total = multiplicar(viewport.transform, ctm);
          const xs: number[] = [];
          const ys: number[] = [];
          for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
            xs.push(total[0] * u + total[2] * v + total[4]);
            ys.push(total[1] * u + total[3] * v + total[5]);
          }
          const x0 = Math.max(0, Math.min(...xs));
          const y0 = Math.max(0, Math.min(...ys));
          const x1 = Math.min(viewport.width, Math.max(...xs));
          const y1 = Math.min(viewport.height, Math.max(...ys));
          if (x1 <= x0 || y1 <= y0) continue;
          const caixa = { x: x0 / viewport.width, y: y0 / viewport.height, w: (x1 - x0) / viewport.width, h: (y1 - y0) / viewport.height };
          if (caixa.w * caixa.h >= AREA_MINIMA_DA_ARTE) ultima = caixa;
        }
      }
      return ultima;
    },
    close: () => tarefa.destroy(),
  };
}
