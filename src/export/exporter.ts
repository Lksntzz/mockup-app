import { compose } from '../engine/compose';
import type { Choices, Pack, Raster } from '../engine/types';

export interface ExportCapa {
  art: Raster;
  back?: Raster;
  choices: Choices;
}

/** Imagem extra por capa (mockup de especificação): outro pacote, outra variante e um sufixo no nome. */
export interface ExportExtra {
  suffix: string;
  pack: Pack;
  layers: Map<string, Raster>;
  variant?: string;
  /** Escolhe as artes e as cores desta imagem a partir da capa; devolve null para pular a capa (ex.: sem página par). */
  montar?: (capa: ExportCapa) => ExportCapa | null;
}

export interface ExportOptions {
  pdfName: string;
  pasta: string;
  pack: Pack;
  layers: Map<string, Raster>;
  capas: ExportCapa[];
  /** Imagens de especificação a gerar além da frente (ou no lugar dela, com `semFrente`). */
  extras?: ExportExtra[];
  /** Não gera o mockup da frente. */
  semFrente?: boolean;
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
export function exportName(pdfName: string, index: number, suffix?: string): string {
  let base = pdfName.replace(/\.pdf$/i, '');
  base = base.replace(/[:*?"<>|/\\]/g, '').replace(/\s+/g, '_');
  // Windows recusa nomes terminando em ponto ou espaço
  base = base.replace(/[. _]+$/g, '').replace(/^_+/, '');
  if (!base) base = 'mockup';
  return `${base}_capa-${String(index).padStart(2, '0')}${suffix ? `_${suffix}` : ''}.png`;
}

function join(pasta: string, nome: string): string {
  const sep = pasta.includes('\\') && !pasta.includes('/') ? '\\' : '/';
  return pasta.endsWith(sep) ? pasta + nome : pasta + sep + nome;
}

interface Tarefa {
  destino: string;
  capa: ExportCapa;
  pack: Pack;
  layers: Map<string, Raster>;
  variant?: string;
}

export async function exportAll(opts: ExportOptions): Promise<{ written: string[] }> {
  // por capa: frente (se pedida) e depois cada imagem de especificação
  const tarefas: Tarefa[] = [];
  opts.capas.forEach((capa, i) => {
    if (!opts.semFrente) tarefas.push({ destino: join(opts.pasta, exportName(opts.pdfName, i + 1)), capa, pack: opts.pack, layers: opts.layers });
    for (const e of opts.extras ?? []) {
      const montada = e.montar ? e.montar(capa) : capa;
      if (!montada) continue;
      tarefas.push({
        destino: join(opts.pasta, exportName(opts.pdfName, i + 1, e.suffix)),
        capa: montada,
        pack: e.pack,
        layers: e.layers,
        ...(e.variant ? { variant: e.variant } : {}),
      });
    }
  });
  const total = tarefas.length;
  if (total === 0) return { written: [] };

  const existentes: string[] = [];
  for (const t of tarefas) if (await opts.exists(t.destino)) existentes.push(t.destino);
  if (existentes.length > 0 && !(await opts.confirmOverwrite(existentes))) return { written: [] };

  const written: string[] = [];
  for (let i = 0; i < total; i++) {
    const { destino, capa, pack, layers, variant } = tarefas[i] as Tarefa;
    const tmp = destino.replace(/\.png$/i, '.parcial.png');
    try {
      const raster = compose(pack, layers, capa.art, capa.choices, capa.back, variant);
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
