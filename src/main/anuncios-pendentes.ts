import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
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
      const ruim = erroDeArte(p.arte);
      if (ruim) throw new Error(ruim);
      return { ...base, arte: p.arte, capas: p.capas };
    } catch (e) {
      return { ...base, arte: c.pasta.split(/[\\/]/).pop() ?? '', capas: [], erro: e instanceof Error ? e.message : String(e) };
    }
  });
}

const temPendente = (pasta: string) => stat(join(pasta, ARQ)).then((s) => s.isFile(), () => false);


function erroDeArte(arte: string): string | undefined {
  if (arte === '' || /[\\/:]/.test(arte) || arte.includes('..') || basename(arte) !== arte || arte === '.') {
    return 'pendente.json está estragado (nome da arte inválido).';
  }
  return undefined;
}

async function gravarAtomico(arquivo: string, conteudo: string | Buffer, enc?: 'utf8'): Promise<void> {
  const tmp = `${arquivo}.tmp`;
  try {
    await (enc ? writeFile(tmp, conteudo, enc) : writeFile(tmp, conteudo));
    await rename(tmp, arquivo);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

const filas = new Map<string, Promise<unknown>>();

/** Uma conclusão por vez em cada pasta (a validação também roda dentro da fila). */
export function concluirPendente(raiz: string, pasta: unknown, eans: Record<number, string>): Promise<ResultadoConcluir> {
  let chave = '';
  if (typeof pasta === 'string' && pasta) {
    chave = resolve(pasta);
    while (chave.length > 1 && chave.endsWith(sep)) chave = chave.slice(0, -1);
    if (process.platform === 'win32') chave = chave.toLowerCase();
  }
  const anterior = filas.get(chave) ?? Promise.resolve();
  const atual = anterior.then(() => concluir(raiz, pasta, eans), () => concluir(raiz, pasta, eans));
  filas.set(chave, atual);
  const limpar = () => { if (filas.get(chave) === atual) filas.delete(chave); };
  atual.then(limpar, limpar);
  return atual;
}

async function concluir(raiz: string, pasta: unknown, eans: Record<number, string>): Promise<ResultadoConcluir> {
  const recusa = (motivo: string): ResultadoConcluir => ({ ok: false, motivo });
  if (typeof pasta !== 'string' || !pasta || !dentroDaRaiz(raiz, pasta) || !(await ehPasta(pasta))) {
    return recusa('Essa pasta não está dentro da pasta dos Anúncios 2027.');
  }
  try {
    if ((await lstat(pasta)).isSymbolicLink()) return recusa('Essa pasta é um atalho (link); abra a pasta real.');
    if (!dentroDaRaiz(await realpath(raiz), await realpath(pasta))) return recusa('Essa pasta não está dentro da pasta dos Anúncios 2027.');
  } catch {
    return recusa('Não consegui conferir a pasta.');
  }
  let pend;
  try {
    pend = lerPendencia(await readFile(join(pasta, ARQ), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return recusa('Essa arte não tem pendência (pendente.json não existe).');
    return recusa(e instanceof Error ? e.message : String(e));
  }
  const ruimArte = erroDeArte(pend.arte);
  if (ruimArte) return recusa(ruimArte);
  const arquivoTxt = join(pasta, `${pend.arte}.txt`);
  if (!dentroDaRaiz(pasta, arquivoTxt)) return recusa('pendente.json está estragado (nome da arte inválido).');
  if (eans === null || typeof eans !== 'object') return recusa('Informe os EANs a gravar.');
  const entradas = Object.entries(eans);
  if (entradas.length === 0) return recusa('Informe pelo menos um EAN.');

  const novos = new Map<number, string>();
  for (const [chave, bruto] of entradas) {
    if (!/^\d+$/.test(chave)) return recusa(`Capa "${chave}" desconhecida.`);
    const n = Number(chave);
    if (novos.has(n)) return recusa(`A capa ${n} aparece mais de uma vez.`);
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

  // EANs já gravados nesta arte, por capa: o mesmo EAN na mesma capa é retomada; em outra capa é conflito
  let txt: string | undefined;
  try { txt = await readFile(arquivoTxt, 'utf8'); } catch { txt = undefined; }
  const gravados: Array<{ n: number; ean: string }> = [];
  const doTxt = new Map<number, string>();
  if (txt !== undefined) {
    for (const m of txt.matchAll(/^(\d+) \|.*?EAN: (\d{13})\s*$/gm)) {
      gravados.push({ n: Number(m[1]), ean: m[2]! });
      doTxt.set(Number(m[1]), m[2]!);
    }
  }
  const pastaBarras = join(pasta, 'Codigo de barras');
  for (const nome of await readdir(pastaBarras).catch(() => [] as string[])) {
    const m = /^Capa (\d+) - (\d+)\.svg$/i.exec(nome);
    if (m) gravados.push({ n: Number(m[1]), ean: m[2]! });
  }
  const temCorel = await ehPasta(join(pasta, 'Corel'));
  const pastaCorel = join(pasta, !temCorel && (await ehPasta(join(pasta, '_corel'))) ? '_corel' : 'Corel');
  const arqEan = join(pastaCorel, 'ean.txt');
  let antes = '';
  try { antes = (await readFile(arqEan)).toString('latin1'); } catch { antes = ''; }
  const linhasAntes = antes.split(/\r?\n/).filter((l) => l !== '');
  for (const l of linhasAntes) {
    const m = /^(\d+)\|(\d+)\|/.exec(l);
    if (m) gravados.push({ n: Number(m[1]), ean: m[2]! });
  }
  for (const [n, ean] of novos) {
    const l = doTxt.get(n);
    if (l !== undefined && l !== ean) return recusa(`A linha ${n} do .txt já tem outro EAN; confira à mão.`);
    const outro = gravados.find((g) => g.n === n && g.ean !== ean);
    if (outro) return recusa(`A capa ${n} já tem outro EAN (${outro.ean}) gravado; confira à mão.`);
    if (gravados.some((g) => g.ean === ean && g.n !== n)) return recusa(`O EAN ${ean} (capa ${n}) já está em uso em outra capa desta arte.`);
  }

  // planeja o .txt antes de gravar qualquer coisa
  const avisos: string[] = [];
  let novoTxt = txt;
  for (const [n, ean] of novos) {
    if (doTxt.get(n) === ean) continue; // retomada: a linha já foi trocada
    const re = new RegExp(`^(${n} \\|.*?EAN: )\\(pendente\\)`, 'm');
    if (novoTxt !== undefined && re.test(novoTxt)) novoTxt = novoTxt.replace(re, (_, ini: string) => `${ini}${ean}`);
    else avisos.push(`Não achei a linha da variação ${n} no arquivo de texto; ele não foi alterado para essa capa.`);
  }
  const svgs = [...novos].map(([n, ean]) => ({ nome: `Capa ${n} - ${ean}.svg`, svg: gerarSvgEan13(ean) }));
  const linhasCorel = [...novos].map(([n, ean]) => `${n}|${ean}|${encodeEan13(ean)}`);

  try {
    await mkdir(pastaBarras, { recursive: true });
    for (const s of svgs) await writeFile(join(pastaBarras, s.nome), s.svg, 'utf8');
    if (txt !== undefined && novoTxt !== txt) await gravarAtomico(arquivoTxt, novoTxt!, 'utf8');
    await mkdir(pastaCorel, { recursive: true });
    const todas = [...linhasAntes, ...linhasCorel.filter((l) => !linhasAntes.includes(l))];
    await gravarAtomico(arqEan, Buffer.from(`${todas.join('\r\n')}\r\n`, 'latin1'));
    const resto = aposConcluir(pend, [...novos.keys()]);
    if (resto) await gravarAtomico(join(pasta, ARQ), serializarPendencia(resto), 'utf8');
    else await rm(join(pasta, ARQ), { force: true });
    return { ok: true, faltam: resto ? resto.capas.filter((c) => c.faltaEan).length : 0, avisos };
  } catch (e) {
    return recusa(`Não consegui gravar os EANs: ${e instanceof Error ? e.message : String(e)}`);
  }
}
