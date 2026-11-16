import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXTENSOES_DA_ARTE, type RecursosDaPagina } from '../personalizar/modelo';

const MAX_ARTE = 60 * 1024 * 1024;

export type ResultadoRecursos = { ok: true; recursos: RecursosDaPagina } | { ok: false; motivo: string };

/** Confere a arte escolhida pelo operador (existe, é PNG/JPG, não é vazia nem enorme). As fontes vêm do Windows. Nunca lança. */
export async function acharRecursos(arte: string | undefined): Promise<ResultadoRecursos> {
  if (!arte) return { ok: false, motivo: 'Escolha a arte (PNG ou JPG) para personalizar.' };
  if (!(EXTENSOES_DA_ARTE as readonly string[]).includes(extname(arte).toLowerCase())) {
    return { ok: false, motivo: 'A arte precisa ser um arquivo PNG ou JPG. Escolha de novo.' };
  }
  const st = await stat(arte).catch(() => undefined);
  if (!st?.isFile()) return { ok: false, motivo: 'Não achei o arquivo da arte. Confira se ele ainda existe e escolha de novo.' };
  if (st.size === 0) return { ok: false, motivo: 'O arquivo da arte está vazio. Escolha outro.' };
  if (st.size > MAX_ARTE) return { ok: false, motivo: 'O arquivo da arte é grande demais (mais de 60 MB). Escolha outro.' };
  return { ok: true, recursos: { arteUrl: pathToFileURL(arte).href } };
}
