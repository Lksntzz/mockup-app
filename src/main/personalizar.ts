import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXTENSOES_DA_ARTE, type RecursosDaPagina } from '../personalizar/modelo';

const MAX_ARTE = 60 * 1024 * 1024;

export type ResultadoRecursos = { ok: true; recursos: RecursosDaPagina } | { ok: false; motivo: string };

/** Confere a arte escolhida pelo operador (existe, é PNG/JPG, não é vazia nem enorme). As fontes vêm do Windows. Nunca lança. */
export async function acharRecursos(arte: string | undefined): Promise<ResultadoRecursos> {
  if (!arte) return { ok: false, motivo: 'Escolha a arte (PNG ou JPG) para personalizar.' };
  const st = await stat(arte).catch(() => undefined);
  if (!st?.isFile()) return { ok: false, motivo: 'Não achei o arquivo da arte. Confira se ele ainda existe e escolha de novo.' };
  if (!(EXTENSOES_DA_ARTE as readonly string[]).includes(extname(arte).toLowerCase())) {
    return { ok: false, motivo: 'A arte precisa ser um arquivo PNG ou JPG (ou um PDF, que o app transforma em imagem). Escolha de novo.' };
  }
  if (st.size === 0) return { ok: false, motivo: 'O arquivo da arte está vazio. Escolha outro.' };
  if (st.size > MAX_ARTE) return { ok: false, motivo: 'O arquivo da arte é grande demais (mais de 60 MB). Escolha outro.' };
  return { ok: true, recursos: { arteUrl: pathToFileURL(arte).href } };
}

/** O que a aba Personalizar mostra e o que falta fazer (converter o PDF em imagem). */
export interface EstadoDaArte {
  arte?: string;
  ok: boolean;
  motivo: string;
  /** Caminho de um PDF que a tela precisa transformar em imagem (página 1, 300 dpi) antes de usar. */
  converter?: string;
}

export const ehPdf = (caminho: string): boolean => extname(caminho).toLowerCase() === '.pdf';

/** A imagem que vai para a página: a própria arte (PNG/JPG) ou, se for PDF, a imagem feita dele — refeita se o PDF mudou depois. */
export async function imagemDaArte(c: { artePersonalizada?: string; arteImagem?: string }): Promise<{ imagem?: string; converter?: string }> {
  const arte = c.artePersonalizada;
  if (!arte) return {};
  if (!ehPdf(arte)) return { imagem: arte };
  const pdf = await stat(arte).catch(() => undefined);
  if (!pdf?.isFile()) return { imagem: arte }; // acharRecursos explica que o arquivo sumiu
  const img = c.arteImagem ? await stat(c.arteImagem).catch(() => undefined) : undefined;
  if (img?.isFile() && img.size > 0 && img.mtimeMs >= pdf.mtimeMs) return { imagem: c.arteImagem };
  return { converter: arte };
}

export async function estadoDaArte(c: { artePersonalizada?: string; arteImagem?: string }): Promise<EstadoDaArte> {
  const { imagem, converter } = await imagemDaArte(c);
  if (converter) return { arte: c.artePersonalizada, ok: false, motivo: 'Preparando a arte do PDF…', converter };
  const r = await acharRecursos(imagem);
  return { arte: c.artePersonalizada, ok: r.ok, motivo: r.ok ? '' : r.motivo };
}
