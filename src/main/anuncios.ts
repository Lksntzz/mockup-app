import { stat } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import { avisoDeAmpliacao } from '../anuncios/ean';
import { lerManifesto } from '../anuncios/manifesto';
import type { EntradaDoAnuncio } from '../anuncios/tipos';
import { criarAnuncio } from './anuncios-criar';
import { acharPastaAnuncios, listarPlataformas } from './anuncios-pastas';
import { achouArquivoNovo, caminhoServeParaOCorel, lerResultadoDoAnuncio, rodarMacroDoCorel } from './corel';
import { ehPasta } from './pasta-fluxo';

export type EtapaCorel = 'feito' | 'aguardando-clique' | 'pulado' | 'erro';
export interface ResultadoAnuncio {
  ok: boolean; pasta?: string; etapaCorel?: EtapaCorel; avisos: string[]; motivo?: string; existente?: string;
}
export interface DepsAnuncio {
  rodarMacro?: typeof rodarMacroDoCorel;
  lerResultado?: typeof lerResultadoDoAnuncio;
}

const EXTENSOES = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function arquivoValido(valor: unknown): Promise<string | undefined> {
  if (typeof valor !== 'string' || !valor) return 'Um dos arquivos de capa é inválido.';
  if (!EXTENSOES.has(extname(valor).toLowerCase())) return `O arquivo "${basename(valor)}" não é PDF, PNG ou JPG.`;
  const info = await stat(valor).catch(() => null);
  if (!info || !info.isFile()) return `Não encontrei o arquivo "${basename(valor)}".`;
  return undefined;
}

/** Confere o que veio da tela: devolve o motivo da recusa, ou undefined se estiver tudo certo. */
export async function validarFontes(fontes: unknown): Promise<string | undefined> {
  if (!Array.isArray(fontes)) return 'As capas do anúncio estão em formato inválido.';
  for (const f of fontes as unknown[]) {
    if (!f || typeof f !== 'object') return 'As capas do anúncio estão em formato inválido.';
    const o = f as Record<string, unknown>;
    if (o.tipo === 'pdf') {
      const m = await arquivoValido(o.arquivo);
      if (m) return m;
    } else if (o.tipo === 'imagem') {
      const m = await arquivoValido(o.capa);
      if (m) return m;
      if (o.contra !== undefined) {
        const c = await arquivoValido(o.contra);
        if (c) return c;
      }
    } else return 'Tipo de capa desconhecido.';
  }
  return undefined;
}

/** Forma básica da entrada vinda da tela (a raiz é decidida pelo app, não pela tela). */
export function validarFormaDaEntrada(e: unknown): string | undefined {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'Dados do anúncio inválidos.';
  const o = e as Record<string, unknown>;
  for (const k of ['plataforma', 'categoria', 'arte', 'titulo']) {
    if (typeof o[k] !== 'string') return 'Dados do anúncio inválidos.';
  }
  if (!Array.isArray(o.variacoes) || !Array.isArray(o.fontes)) return 'Dados do anúncio inválidos.';
  for (const v of o.variacoes as unknown[]) {
    const x = v as Record<string, unknown> | null;
    if (!x || typeof x !== 'object' || typeof x.capa !== 'string' || typeof x.sku !== 'string' || typeof x.ean !== 'string') {
      return 'Dados das variações inválidos.';
    }
  }
  return undefined;
}

/** Pasta "Anúncio 2027": a configurada (se ainda existir), senão procura nas raízes. */
export async function resolverRaizDosAnuncios(
  configurada: string | undefined,
  raizes: string[],
  achar: typeof acharPastaAnuncios = acharPastaAnuncios,
): Promise<{ pasta?: string; avisos: string[] }> {
  if (configurada && (await ehPasta(configurada))) return { pasta: configurada, avisos: [] };
  return achar(raizes);
}

/** Acha a pasta da plataforma só entre as que existem na raiz (o nome nunca é juntado direto ao caminho). */
export async function resolverPlataforma(raiz: string, nome: unknown): Promise<string | undefined> {
  if (typeof nome !== 'string') return undefined;
  const plataformas = await listarPlataformas(raiz).catch(() => [] as string[]);
  const achada = plataformas.find((p) => p === nome);
  return achada === undefined ? undefined : `${raiz.replace(/[\\/]+$/, '')}${raiz.includes('\\') ? '\\' : '/'}${achada}`;
}

const falha = (motivo: string, existente?: string): ResultadoAnuncio =>
  existente === undefined ? { ok: false, motivo, avisos: [] } : { ok: false, motivo, existente, avisos: [] };

export async function criarEMontar(e: EntradaDoAnuncio, montarNoCorel: boolean, deps: DepsAnuncio = {}): Promise<ResultadoAnuncio> {
  const rodarMacro = deps.rodarMacro ?? rodarMacroDoCorel;
  const lerResultado = deps.lerResultado ?? lerResultadoDoAnuncio;
  const c = await criarAnuncio(e);
  if (!c.ok) return falha(c.motivo, c.existente);
  const avisos = [...c.avisos];
  const pronto = (etapaCorel: EtapaCorel): ResultadoAnuncio => ({ ok: true, pasta: c.pasta, etapaCorel, avisos });
  if (!montarNoCorel) return pronto('pulado');

  let caminhos: string[];
  try {
    const m = lerManifesto(c.manifestoTexto);
    caminhos = [m.destino, ...m.capas.flatMap((x) => [x.frente, x.verso].filter((p): p is string => !!p))];
  } catch {
    caminhos = [c.cdr];
  }
  if (!caminhos.every(caminhoServeParaOCorel)) {
    avisos.push('A pasta foi criada, mas o caminho tem letras que o Corel não consegue ler: monte as capas no Corel à mão.');
    return pronto('pulado');
  }

  await lerResultado(); // apaga resultado velho
  const inicio = Date.now();
  const r = await rodarMacro('AnuncioNoMolde', c.manifestoTexto);
  if (!r.ok) {
    avisos.push(r.motivo);
    return pronto('aberto' in r && r.aberto ? 'aguardando-clique' : 'erro');
  }
  if (!(await achouArquivoNovo(dirname(c.cdr), inicio, new RegExp(`^${escapar(basename(c.cdr))}$`, 'i')))) {
    avisos.push('O Corel rodou o macro, mas o arquivo .cdr não apareceu na pasta. Veja se ficou algum aviso na tela do Corel.');
    return pronto('erro');
  }
  const res = await lerResultado();
  if (!res) {
    avisos.push('O Corel terminou, mas não consegui ler o resultado da montagem. Confira as capas no .cdr.');
    return pronto('erro');
  }
  for (const capa of res.capas) {
    if (capa.estado === 'erro') avisos.push(`Capa ${capa.n}: ${capa.detalhe ?? 'o Corel não conseguiu montar.'}`);
    else if (capa.ampliacao !== undefined) {
      const a = avisoDeAmpliacao(capa.ampliacao);
      if (a) avisos.push(`Variação ${capa.n}: ${a}`);
    }
  }
  return pronto('feito');
}
