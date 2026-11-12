import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConfigDesigner } from './config-designer';
import { mesmoNome, nomeDePastaSeguro } from '../anuncios/nomes';
import { ehPasta, nomesEm } from './pasta-fluxo';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const NOME_RAIZ = /^anuncios?\s*2027$/;
// '.shortcut-targets-by-id' é onde o Google Drive para Desktop guarda as pastas compartilhadas
const IGNORAR = /^(\$|\.(?!shortcut-targets-by-id$))|^(node_modules|appdata|windows|program files|program files \(x86\)|programdata|system volume information)$/i;

export interface OpcoesBuscaAnuncios {
  profundidade?: number;
  limitePastas?: number;
  limiteMs?: number;
}

/** Procura a pasta "Anúncio 2027" dentro das raízes. Se achar mais de uma, não escolhe e avisa. */
export async function acharPastaAnuncios(raizes: string[], opcoes: OpcoesBuscaAnuncios = {}): Promise<{ pasta?: string; avisos: string[] }> {
  const profundidade = opcoes.profundidade ?? 5;
  const limitePastas = opcoes.limitePastas ?? 5000;
  const fim = Date.now() + (opcoes.limiteMs ?? 15_000);
  const achadas = new Set<string>();
  let lidas = 0;
  let cortou = false;

  async function varrer(pasta: string, nivel: number): Promise<void> {
    if (nivel > profundidade) return;
    if (lidas >= limitePastas || Date.now() > fim) {
      cortou = true;
      return;
    }
    lidas += 1;
    let itens;
    try {
      itens = await readdir(pasta, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of itens) {
      if (!d.isDirectory() || IGNORAR.test(d.name)) continue;
      const caminho = join(pasta, d.name);
      if (NOME_RAIZ.test(semAcento(d.name))) achadas.add(caminho);
      else await varrer(caminho, nivel + 1);
    }
  }

  for (const r of raizes) await varrer(r, 0);

  const avisos: string[] = [];
  if (achadas.size > 1) {
    avisos.push('Achei a pasta de anúncios em mais de um lugar do computador, então não escolhi nenhuma. Escolha na mão.');
    return { avisos };
  }
  if (cortou) avisos.push('A busca parou antes de olhar tudo (muitas pastas ou demorou). Se não achar a pasta, escolha na mão.');
  const [pasta] = [...achadas];
  if (!pasta) {
    avisos.push('Não achei a pasta de anúncios. Escolha na mão.');
    return { avisos };
  }
  return { pasta, avisos };
}

async function subpastas(pasta: string): Promise<string[]> {
  const itens = await nomesEm(pasta);
  return itens
    .filter((i) => i.pasta && !/^[._$]/.test(i.nome))
    .map((i) => i.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export const listarPlataformas = (pastaAnuncios: string): Promise<string[]> => subpastas(pastaAnuncios);
export const listarCategorias = (pastaPlataforma: string): Promise<string[]> => subpastas(pastaPlataforma);

export type ResultadoCategoria = { ok: true; pasta: string; nome: string } | { ok: false; motivo: string };

export async function criarCategoria(pastaPlataforma: string, nome: string): Promise<ResultadoCategoria> {
  const { nome: seguro } = nomeDePastaSeguro(nome);
  if (!seguro) return { ok: false, motivo: 'Digite um nome para a categoria.' };
  if (!(await ehPasta(pastaPlataforma))) return { ok: false, motivo: 'Não encontrei a pasta da plataforma. Escolha de novo.' };
  const existentes = await listarCategorias(pastaPlataforma).catch(() => [] as string[]);
  if (existentes.some((e) => mesmoNome(e, seguro))) return { ok: false, motivo: `Já existe a categoria "${seguro}" nesta plataforma.` };
  const pasta = join(pastaPlataforma, seguro);
  try {
    await mkdir(pasta);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return { ok: false, motivo: `Já existe uma pasta "${seguro}" nesta plataforma.` };
    return { ok: false, motivo: `Não consegui criar a pasta: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, pasta, nome: seguro };
}

/** Decide o que gravar depois da busca automática: só devolve os campos a escrever. */
export function mesclarPastasAchadas(config: ConfigDesigner, achadas: Partial<ConfigDesigner>, substituir: boolean): Partial<ConfigDesigner> {
  const novas: Partial<ConfigDesigner> = {};
  const achada = achadas.pastaAnuncios;
  if (typeof achada === 'string' && achada && (substituir || !config.pastaAnuncios)) novas.pastaAnuncios = achada;
  return novas;
}
