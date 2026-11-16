import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODELOS, modeloPorId, type ModeloDeArte, type RecursosDaPagina } from '../personalizar/modelo';

/** Uma arte pronta para montar a página: o modelo, os arquivos (caminho, para ler o tamanho/reduzir) e as URLs. */
export interface ArteResolvida {
  modelo: ModeloDeArte;
  arteArquivo: string;
  frenteArquivo?: string;
  recursos: RecursosDaPagina;
}
export type ResultadoRecursos = { ok: true; arte: ArteResolvida } | { ok: false; motivo: string };

async function confere(caminho: string): Promise<boolean> {
  const st = await stat(caminho).catch(() => undefined);
  return !!st?.isFile() && st.size > 0;
}

/** Acha os arquivos de uma arte do catálogo na pasta das artes do programa. As fontes vêm do Windows. Nunca lança. */
export async function acharRecursos(modeloId: unknown, pastaArtes: string): Promise<ResultadoRecursos> {
  const modelo = modeloPorId(modeloId);
  if (!modelo) return { ok: false, motivo: 'Escolha a arte na lista.' };
  const arteArquivo = join(pastaArtes, modelo.arte);
  if (!(await confere(arteArquivo))) return { ok: false, motivo: `Não achei os arquivos da arte "${modelo.titulo}" dentro do programa. Reinstale o programa.` };
  let frenteArquivo: string | undefined;
  if (modelo.frente) {
    frenteArquivo = join(pastaArtes, modelo.frente);
    if (!(await confere(frenteArquivo))) return { ok: false, motivo: `Não achei os arquivos da arte "${modelo.titulo}" dentro do programa. Reinstale o programa.` };
  }
  const recursos: RecursosDaPagina = { arteUrl: pathToFileURL(arteArquivo).href, modelo };
  if (frenteArquivo) recursos.frenteUrl = pathToFileURL(frenteArquivo).href;
  return { ok: true, arte: { modelo, arteArquivo, ...(frenteArquivo ? { frenteArquivo } : {}), recursos } };
}

/** O que a aba Personalizar mostra: a lista de artes e se os arquivos de cada uma estão no programa. */
export interface EstadoDasArtes {
  artes: { id: string; titulo: string; ok: boolean; motivo: string }[];
}

export async function estadoDasArtes(pastaArtes: string): Promise<EstadoDasArtes> {
  const artes = await Promise.all(
    MODELOS.map(async (m) => {
      const r = await acharRecursos(m.id, pastaArtes);
      return { id: m.id, titulo: m.titulo, ok: r.ok, motivo: r.ok ? '' : r.motivo };
    }),
  );
  return { artes };
}
