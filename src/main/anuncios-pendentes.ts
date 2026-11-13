import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeEan13 } from '../anuncios/ean';
import { gerarSvgEan13 } from '../anuncios/ean-svg';
import { isValidGtin13, normalizarEan } from '../anuncios/gtin';
import { aposConcluir, lerPendencia, serializarPendencia, type CapaPendente } from '../anuncios/pendencia';
import { dentroDaRaiz } from './anuncios';
import { listarCategorias, listarPlataformas } from './anuncios-pastas';
import { ehPasta, nomesEm } from './pasta-fluxo';

export interface CardPendente {
  pasta: string; arte: string; plataforma: string; categoria: string; subcategoria?: string; capas: CapaPendente[]; erro?: string;
}
export type ResultadoConcluir = { ok: true; faltam: number; avisos: string[] } | { ok: false; motivo: string };

const ARQ = 'pendente.json';
const LIMITE = 8;

async function emParalelo<T, R>(itens: T[], fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let prox = 0;
  const worker = async () => {
    for (;;) {
      const i = prox++;
      if (i >= itens.length) return;
      out[i] = await fn(itens[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LIMITE, itens.length) }, worker));
  return out;
}

const subpastas = async (pasta: string) =>
  (await nomesEm(pasta).catch(() => [])).filter((i) => i.pasta && !/^[._$]/.test(i.nome));

interface Candidata { pasta: string; plataforma: string; categoria: string; subcategoria?: string }

/** Varre Plataforma > Categoria > [Subcategoria] > Arte atrás de pendente.json. Nunca lança. */
export async function listarPendentes(raiz: string): Promise<CardPendente[]> {
  const plataformas = await listarPlataformas(raiz).catch(() => [] as string[]);
  const pares: Array<{ plataforma: string; categoria: string }> = [];
  for (const plataforma of plataformas) {
    const cats = await listarCategorias(join(raiz, plataforma)).catch(() => [] as string[]);
    for (const categoria of cats) pares.push({ plataforma, categoria });
  }
  const achadas = (
    await emParalelo(pares, async ({ plataforma, categoria }): Promise<Array<Candidata & { mtimeMs: number }>> => {
      const res: Array<Candidata & { mtimeMs: number }> = [];
      const pastaCat = join(raiz, plataforma, categoria);
      for (const filho of await subpastas(pastaCat)) {
        if (await temPendente(filho.caminho)) {
          res.push({ pasta: filho.caminho, plataforma, categoria, mtimeMs: filho.mtimeMs });
          continue;
        }
        for (const neto of await subpastas(filho.caminho)) {
          if (await temPendente(neto.caminho)) {
            res.push({ pasta: neto.caminho, plataforma, categoria, subcategoria: filho.nome, mtimeMs: neto.mtimeMs });
          }
        }
      }
      return res;
    })
  ).flat();
  achadas.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return emParalelo(achadas, async (c): Promise<CardPendente> => {
    const base = {
      pasta: c.pasta, plataforma: c.plataforma, categoria: c.categoria, ...(c.subcategoria ? { subcategoria: c.subcategoria } : {}),
    };
    try {
      const p = lerPendencia(await readFile(join(c.pasta, ARQ), 'utf8'));
      return { ...base, arte: p.arte, capas: p.capas };
    } catch (e) {
      return { ...base, arte: c.pasta.split(/[\\/]/).pop() ?? '', capas: [], erro: e instanceof Error ? e.message : String(e) };
    }
  });
}

const temPendente = (pasta: string) => stat(join(pasta, ARQ)).then((s) => s.isFile(), () => false);


export async function concluirPendente(raiz: string, pasta: unknown, eans: Record<number, string>): Promise<ResultadoConcluir> {
  const recusa = (motivo: string): ResultadoConcluir => ({ ok: false, motivo });
  if (typeof pasta !== 'string' || !pasta || !dentroDaRaiz(raiz, pasta) || !(await ehPasta(pasta))) {
    return recusa('Essa pasta não está dentro da pasta dos Anúncios 2027.');
  }
  let pend;
  try {
    pend = lerPendencia(await readFile(join(pasta, ARQ), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return recusa('Essa arte não tem pendência (pendente.json não existe).');
    return recusa(e instanceof Error ? e.message : String(e));
  }
  if (eans === null || typeof eans !== 'object') return recusa('Informe os EANs a gravar.');
  const entradas = Object.entries(eans);
  if (entradas.length === 0) return recusa('Informe pelo menos um EAN.');

  const novos = new Map<number, string>();
  for (const [chave, bruto] of entradas) {
    if (!/^\d+$/.test(chave)) return recusa(`Capa "${chave}" desconhecida.`);
    const n = Number(chave);
    const capa = pend.capas.find((c) => c.n === n);
    if (!capa) return recusa(`A capa ${n} não está na lista de pendências.`);
    if (!capa.faltaEan) return recusa(`A capa ${n} já tem EAN.`);
    if (typeof bruto !== 'string') return recusa(`O EAN da capa ${n} é inválido.`);
    const ean = normalizarEan(bruto);
    if (ean === '') return recusa(`O EAN da capa ${n} está vazio.`);
    if (!isValidGtin13(ean)) return recusa(`O EAN da capa ${n} é inválido.`);
    novos.set(n, ean);
  }
  const vistos = new Set<string>();
  for (const [n, ean] of novos) {
    if (vistos.has(ean)) return recusa(`O EAN ${ean} aparece mais de uma vez (capa ${n}).`);
    vistos.add(ean);
  }

  // EANs já gravados nesta arte (linhas do .txt e nomes dos SVGs)
  const arquivoTxt = join(pasta, `${pend.arte}.txt`);
  let txt: string | undefined;
  try { txt = await readFile(arquivoTxt, 'utf8'); } catch { txt = undefined; }
  const jaUsados = new Set<string>();
  if (txt !== undefined) {
    for (const m of txt.matchAll(/^\d+ \|.*?EAN: (\d{13})\s*$/gm)) jaUsados.add(m[1]!);
  }
  const pastaBarras = join(pasta, 'Codigo de barras');
  for (const nome of await readdir(pastaBarras).catch(() => [] as string[])) {
    const m = /^Capa \d+ - (\d+)\.svg$/i.exec(nome);
    if (m) jaUsados.add(m[1]!);
  }
  for (const [n, ean] of novos) {
    if (jaUsados.has(ean)) return recusa(`O EAN ${ean} (capa ${n}) já está em uso nesta arte.`);
  }

  // planeja o .txt antes de gravar qualquer coisa
  const avisos: string[] = [];
  let novoTxt = txt;
  for (const [n, ean] of novos) {
    const re = new RegExp(`^(${n} \\|.*?EAN: )\\(pendente\\)`, 'm');
    if (novoTxt !== undefined && re.test(novoTxt)) novoTxt = novoTxt.replace(re, (_, ini: string) => `${ini}${ean}`);
    else avisos.push(`Não achei a linha da variação ${n} no arquivo de texto; ele não foi alterado para essa capa.`);
  }
  const svgs = [...novos].map(([n, ean]) => ({ nome: `Capa ${n} - ${ean}.svg`, svg: gerarSvgEan13(ean) }));
  const linhasCorel = [...novos].map(([n, ean]) => `${n}|${ean}|${encodeEan13(ean)}`);

  try {
    await mkdir(pastaBarras, { recursive: true });
    for (const s of svgs) await writeFile(join(pastaBarras, s.nome), s.svg, 'utf8');
    if (txt !== undefined && novoTxt !== txt) await writeFile(arquivoTxt, novoTxt!, 'utf8');
    const pastaCorel = join(pasta, 'Corel');
    await mkdir(pastaCorel, { recursive: true });
    const arqEan = join(pastaCorel, 'ean.txt');
    let antes = '';
    try { antes = (await readFile(arqEan)).toString('latin1'); } catch { antes = ''; }
    const linhasAntes = antes.split(/\r?\n/).filter((l) => l !== '');
    await writeFile(arqEan, Buffer.from(`${[...linhasAntes, ...linhasCorel].join('\r\n')}\r\n`, 'latin1'));
    const resto = aposConcluir(pend, [...novos.keys()]);
    if (resto) await writeFile(join(pasta, ARQ), serializarPendencia(resto), 'utf8');
    else await rm(join(pasta, ARQ), { force: true });
    return { ok: true, faltam: resto ? resto.capas.filter((c) => c.faltaEan).length : 0, avisos };
  } catch (e) {
    return recusa(`Não consegui gravar os EANs: ${e instanceof Error ? e.message : String(e)}`);
  }
}

