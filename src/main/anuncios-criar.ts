import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { gerarSvgEan13 } from '../anuncios/ean-svg';
import { isValidGtin13, normalizarEan } from '../anuncios/gtin';
import { montarManifesto, type CapaDoManifesto } from '../anuncios/manifesto';
import { mesmoNome, nomeDePastaSeguro } from '../anuncios/nomes';
import type { EntradaDoAnuncio } from '../anuncios/tipos';
import { montarTxt } from '../anuncios/txt';
import { listarCategorias, listarPlataformas, listarSubcategorias } from './anuncios-pastas';

export type EtapaProgresso = 'pasta' | 'arte' | 'barras' | 'corel';
export type EstadoProgresso = 'andamento' | 'feito' | 'pulado' | 'erro';
export type AoProgredir = (etapa: EtapaProgresso, estado: EstadoProgresso) => void;
export interface ImagemEan { n: number; nome: string; svg: string }

export type ResultadoCriar =
  | { ok: true; pasta: string; cdr: string; manifestoTexto: string; avisos: string[]; imagensEan: ImagemEan[] }
  | { ok: false; motivo: string; existente?: string };

const falha = (motivo: string, existente?: string): ResultadoCriar =>
  existente === undefined ? { ok: false, motivo } : { ok: false, motivo, existente };

const BOM = '﻿';
const cabeEmLatin1 = (t: string) => Buffer.from(t, 'latin1').toString('latin1') === t;

export async function criarAnuncio(e: EntradaDoAnuncio, aoProgredir?: AoProgredir): Promise<ResultadoCriar> {
  const titulo = (e.titulo ?? '').trim();
  if (!titulo) return falha('Digite o título do anúncio.');
  const arte = nomeDePastaSeguro(e.arte).nome;
  if (!arte) return falha('Digite um nome de arte válido para a pasta.');
  if (e.variacoes.length === 0) return falha('Inclua pelo menos uma variação.');
  if (e.variacoes.length !== e.fontes.length) return falha('O número de variações é diferente do número de capas.');

  const eans = e.variacoes.map((v) => normalizarEan(v.ean));
  for (let i = 0; i < eans.length; i += 1) {
    const ean = eans[i]!;
    if (ean && !isValidGtin13(ean)) return falha(`O EAN da variação ${i + 1} é inválido.`);
  }
  const vistos = new Set<string>();
  for (const ean of eans) {
    if (!ean) continue;
    if (vistos.has(ean)) return falha(`O EAN ${ean} aparece mais de uma vez.`);
    vistos.add(ean);
  }
  const avisos: string[] = [];
  const skus = e.variacoes.map((v) => v.sku.trim()).filter(Boolean);
  if (new Set(skus).size !== skus.length) avisos.push('Há SKUs repetidos nas variações.');

  // plataforma e categoria precisam existir de verdade (comparadas pelo nome real em disco)
  let plataformas: string[];
  try { plataformas = await listarPlataformas(e.raiz); } catch { return falha('Não consegui ler a pasta de anúncios.'); }
  const plataforma = plataformas.find((p) => p === e.plataforma) ?? plataformas.find((p) => mesmoNome(p, e.plataforma));
  if (!plataforma) return falha(`A plataforma "${e.plataforma}" não existe na pasta de anúncios.`);
  const pastaPlataforma = join(e.raiz, plataforma);
  let categorias: string[];
  try { categorias = await listarCategorias(pastaPlataforma); } catch { return falha('Não consegui ler a pasta da plataforma.'); }
  const categoria = categorias.find((c) => c === e.categoria) ?? categorias.find((c) => mesmoNome(c, e.categoria));
  if (!categoria) return falha(`A categoria "${e.categoria}" não existe em ${plataforma}.`);
  const pastaCategoria = join(pastaPlataforma, categoria);

  // subcategoria (opcional): precisa existir; nunca é criada aqui
  let subcategoria = '';
  let pastaPai = pastaCategoria;
  const pedida = (e.subcategoria ?? '').trim();
  let subs: string[];
  try { subs = await listarSubcategorias(pastaCategoria); } catch { return falha('Não consegui ler as subcategorias da pasta da categoria. Escolha a categoria de novo.'); }
  if (pedida) {
    const achada = subs.find((c) => c === pedida) ?? subs.find((c) => mesmoNome(c, pedida));
    if (!achada) return falha(`A subcategoria "${pedida}" não existe em ${categoria}.`);
    subcategoria = achada;
    pastaPai = join(pastaCategoria, achada);
  } else if (subs.length > 0) {
    return falha('Escolha a subcategoria desta categoria.');
  }

  let irmaos: string[];
  try { irmaos = await readdir(pastaPai); } catch { return falha(`Não consegui ler a pasta ${subcategoria ? 'da subcategoria' : 'da categoria'}.`); }
  const igual = irmaos.find((n) => mesmoNome(n, arte));
  if (igual) return falha(`Já existe uma pasta "${igual}" nesta ${subcategoria ? 'subcategoria' : 'categoria'}.`, join(pastaPai, igual));

  const pasta = join(pastaPai, arte);
  const cdr = join(pasta, 'Corel', `${arte}.cdr`);

  // planeja as cópias da arte
  const copias: Array<{ de: string; para: string }> = [];
  const destinoPdf = new Map<string, string>();
  const capas: CapaDoManifesto[] = [];
  e.fontes.forEach((f, i) => {
    const ean = eans[i]!;
    let capa: CapaDoManifesto = { ean };
    if (f.tipo === 'pdf') {
      let para = destinoPdf.get(f.arquivo);
      if (!para) {
        para = join(pasta, 'Arte', destinoPdf.size === 0 ? `${arte}.pdf` : `${arte} (${destinoPdf.size + 1}).pdf`);
        destinoPdf.set(f.arquivo, para);
        copias.push({ de: f.arquivo, para });
      }
      capa = { ean, frente: para, paginaFrente: f.paginaCapa };
      if (f.paginaContra !== undefined) { capa.verso = para; capa.paginaVerso = f.paginaContra; }
    } else {
      const frente = join(pasta, 'Arte', `${arte} - capa ${i + 1}${extname(f.capa)}`);
      copias.push({ de: f.capa, para: frente });
      capa = { ean, frente };
      if (f.contra) {
        const verso = join(pasta, 'Arte', `${arte} - contra ${i + 1}${extname(f.contra)}`);
        copias.push({ de: f.contra, para: verso });
        capa.verso = verso;
      }
    }
    if (!ean) avisos.push(`A variação ${i + 1} está sem EAN: as páginas dela serão montadas SEM código de barras.`);
    capas.push(capa);
  });

  let manifestoTexto: string;
  try {
    manifestoTexto = montarManifesto({ destino: cdr, capas });
  } catch (err) {
    return falha(err instanceof Error ? err.message : 'Não consegui montar o manifesto do Corel.');
  }
  if (!cabeEmLatin1(manifestoTexto)) {
    return falha('O caminho ou os nomes têm letras que o Corel não consegue ler (fora do alfabeto latino). Use nomes mais simples.');
  }
  let txt: string;
  try {
    txt = montarTxt({ plataforma, categoria, ...(subcategoria ? { subcategoria } : {}), arte, titulo, variacoes: e.variacoes.map((v, i) => ({ ...v, ean: eans[i]! })) });
  } catch (err) {
    return falha(err instanceof Error ? err.message : 'Não consegui montar o arquivo de texto do anúncio.');
  }

  let criei = false;
  let etapa: EtapaProgresso = 'pasta';
  const prog = (et: EtapaProgresso, st: EstadoProgresso) => { etapa = et; aoProgredir?.(et, st); };
  try {
    prog('pasta', 'andamento');
    try {
      await mkdir(pasta);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return falha('Já existe uma pasta com esse nome nesta categoria.', pasta);
      throw err;
    }
    criei = true;
    const comEan = eans.some(Boolean);
    await mkdir(join(pasta, 'Arte'));
    if (comEan) await mkdir(join(pasta, 'Codigo de barras'));
    await mkdir(join(pasta, 'Corel'));
    await writeFile(join(pasta, `${arte}.txt`), BOM + txt, 'utf8');
    prog('pasta', 'feito');
    prog('arte', 'andamento');
    for (const c of copias) await copyFile(c.de, c.para);
    prog('arte', 'feito');
    const imagensEan: ImagemEan[] = [];
    if (comEan) {
      prog('barras', 'andamento');
      for (let i = 0; i < eans.length; i += 1) {
        const ean = eans[i]!;
        if (!ean) continue;
        const nome = `Capa ${i + 1} - ${ean}.svg`;
        const svg = gerarSvgEan13(ean);
        await writeFile(join(pasta, 'Codigo de barras', nome), svg, 'utf8');
        imagensEan.push({ n: i + 1, nome, svg });
      }
      prog('barras', 'feito');
    } else {
      prog('barras', 'pulado');
    }
    await writeFile(join(pasta, 'Corel', 'montar.txt'), Buffer.from(manifestoTexto, 'latin1'));
    return { ok: true, pasta, cdr, manifestoTexto, avisos, imagensEan };
  } catch (err) {
    aoProgredir?.(etapa, 'erro');
    if (criei) await rm(pasta, { recursive: true, force: true }).catch(() => undefined);
    return falha(`Não consegui criar o anúncio: ${err instanceof Error ? err.message : String(err)}`);
  }
}
