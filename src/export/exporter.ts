import { compose } from '../engine/compose';
import type { Choices, Pack, Raster } from '../engine/types';

export interface ExportCapa {
  art: Raster;
  choices: Choices;
}

export interface ExportOptions {
  pdfName: string;
  pasta: string;
  pack: Pack;
  layers: Map<string, Raster>;
  capas: ExportCapa[];
  encodePng: (r: Raster) => Promise<Uint8Array>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  /** Recebe os arquivos que já existem; devolve true para substituir. */
  confirmOverwrite: (existing: string[]) => Promise<boolean>;
  onProgress: (done: number, total: number) => void;
}

/** "CAPAS.pdf", 1 → "CAPAS_capa-01.png". Mantém acentos; remove o que o Windows recusa. */
export function exportName(pdfName: string, index: number): string {
  let base = pdfName.replace(/\.pdf$/i, '');
  base = base.replace(/[:*?"<>|/\\]/g, '').replace(/\s+/g, '_');
  // Windows recusa nomes terminando em ponto ou espaço
  base = base.replace(/[. _]+$/g, '').replace(/^_+/, '');
  if (!base) base = 'mockup';
  return `${base}_capa-${String(index).padStart(2, '0')}.png`;
}

function join(pasta: string, nome: string): string {
  const sep = pasta.includes('\\') && !pasta.includes('/') ? '\\' : '/';
  return pasta.endsWith(sep) ? pasta + nome : pasta + sep + nome;
}

export async function exportAll(opts: ExportOptions): Promise<{ written: string[] }> {
  const total = opts.capas.length;
  if (total === 0) return { written: [] };

  const destinos = opts.capas.map((_, i) => join(opts.pasta, exportName(opts.pdfName, i + 1)));

  const existentes: string[] = [];
  for (const d of destinos) if (await opts.exists(d)) existentes.push(d);
  if (existentes.length > 0 && !(await opts.confirmOverwrite(existentes))) return { written: [] };

  const written: string[] = [];
  for (let i = 0; i < total; i++) {
    const destino = destinos[i] as string;
    const capa = opts.capas[i] as ExportCapa;
    const tmp = destino.replace(/\.png$/i, '.parcial.png');
    try {
      const raster = compose(opts.pack, opts.layers, capa.art, capa.choices);
      const bytes = await opts.encodePng(raster);
      await opts.write(tmp, bytes);
      await opts.rename(tmp, destino);
    } catch (e) {
      await opts.remove(tmp).catch(() => {});
      const motivo = e instanceof Error ? e.message : String(e);
      throw new Error(`Não consegui gravar ${destino.split(/[/\\]/).pop()}: ${motivo}`);
    }
    written.push(destino);
    opts.onProgress(i + 1, total);
  }
  return { written };
}
