import { basename, extname } from 'node:path';
import { EXT_ARTE, ehGrupo, ehPasta, nomesEm, verificarProntidao } from './pasta-fluxo';

export type Etapa = 1 | 2 | 3 | 4;
export type Situacao = 'arte-a-fazer' | 'em-andamento' | 'pronta-para-aprovar' | 'em-etapa';

export interface Cliente {
  nome: string;
  /** Pasta de agrupamento (ex.: SHOPEE) quando o cliente está dentro de uma. */
  grupo?: string;
  caminho: string;
  etapa: Etapa;
  /** Só na etapa 1 diz o quanto falta; nas outras é sempre "em-etapa". */
  situacao: Situacao;
  /** Etapa 1: o que ainda falta para poder enviar para Aprovar. */
  faltando: string[];
  /** Caminhos completos de PDF/JPG/PNG na pasta do cliente. */
  artes: string[];
  /** Nomes de todos os arquivos soltos na pasta do cliente. */
  arquivos: string[];
  /** Mexida há pouco tempo: os arquivos podem ainda estar subindo. */
  chegando: boolean;
  /** O mesmo nome existe em mais de uma etapa. */
  duplicado?: boolean;
  /** Etapas 2 e 3: algum arquivo foi mexido depois de a pasta ser enviada pelo app. */
  alteradoDepoisDoEnvio?: boolean;
}

export interface Pastas {
  pasta1?: string;
  pasta2?: string;
  pasta3?: string;
  pasta4?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Nome único do cliente para alertas e duplicados: com o grupo na frente, se houver. */
/** Drive e antivírus mexem nos arquivos logo depois do envio; só conta alteração acima desta folga. */
export const TOLERANCIA_ENVIO_MS = 120_000;

/** Data (ms) do arquivo mais novo da pasta do cliente ou da subpasta MKP. Pasta sem arquivos dá 0. */
export async function ultimaAlteracao(pastaCliente: string): Promise<number> {
  const itens = await nomesEm(pastaCliente);
  const mkp = itens.find((i) => i.pasta && i.nome.toLowerCase() === 'mkp');
  const dentro = mkp ? await nomesEm(mkp.caminho) : [];
  return Math.max(0, ...[...itens, ...dentro].filter((i) => !i.pasta).map((i) => i.mtimeMs));
}

export const chaveDe = (c: { nome: string; grupo?: string }) => (c.grupo ? `${c.grupo} / ${c.nome}` : c.nome);

/** Clientes das etapas 1, 2 e 3 (a Pasta 4 tem anos de pastas e só é consultada por busca). */
export async function listarClientes(
  pastas: Pastas,
  agora = Date.now(),
  esperaMs = 30_000,
  enviados: Record<string, number> = {},
): Promise<{ clientes: Cliente[]; avisos: string[] }> {
  const clientes: Cliente[] = [];
  const avisos: string[] = [];
  const envios = new Map(Object.entries(enviados).map(([k, v]) => [norm(k), v]));
  const etapas: [Etapa, string | undefined][] = [[1, pastas.pasta1], [2, pastas.pasta2], [3, pastas.pasta3]];
  for (const [etapa, raiz] of etapas) {
    if (!raiz) {
      avisos.push(`A Pasta ${etapa} não foi escolhida.`);
      continue;
    }
    if (!(await ehPasta(raiz))) {
      avisos.push(`Não encontrei a Pasta ${etapa} ("${raiz}").`);
      continue;
    }
    const filhas = (await nomesEm(raiz)).filter((i) => i.pasta);
    const pastasDeCliente: ((typeof filhas)[number] & { grupo?: string })[] = [];
    for (const f of filhas) {
      if (!ehGrupo(f.nome)) pastasDeCliente.push(f);
      else for (const d of (await nomesEm(f.caminho)).filter((i) => i.pasta)) pastasDeCliente.push({ ...d, grupo: f.nome });
    }
    for (const c of pastasDeCliente) {
      const itens = await nomesEm(c.caminho);
      const arquivos = itens.filter((i) => !i.pasta);
      let situacao: Situacao = 'em-etapa';
      let faltando: string[] = [];
      if (etapa === 1) {
        const r = await verificarProntidao(c.caminho);
        faltando = r.faltando;
        situacao = r.faltando.includes('imagens do MKP') ? 'arte-a-fazer' : r.pronta ? 'pronta-para-aprovar' : 'em-andamento';
      }
      const maisRecente = Math.max(c.mtimeMs, ...itens.map((i) => i.mtimeMs));
      let alterado: boolean | undefined;
      const enviadoEm = envios.get(norm(chaveDe({ nome: c.nome, ...(c.grupo ? { grupo: c.grupo } : {}) })));
      if ((etapa === 2 || etapa === 3) && enviadoEm !== undefined) {
        alterado = (await ultimaAlteracao(c.caminho)) > enviadoEm + TOLERANCIA_ENVIO_MS;
      }
      clientes.push({
        nome: c.nome,
        ...(c.grupo ? { grupo: c.grupo } : {}),
        caminho: c.caminho,
        etapa,
        situacao,
        faltando,
        artes: arquivos.filter((i) => EXT_ARTE.has(extname(i.nome).toLowerCase())).map((i) => i.caminho),
        arquivos: arquivos.map((i) => i.nome),
        chegando: agora - maisRecente < esperaMs,
        ...(alterado === undefined ? {} : { alteradoDepoisDoEnvio: alterado }),
      });
    }
  }
  const contagem = new Map<string, number>();
  for (const c of clientes) contagem.set(norm(chaveDe(c)), (contagem.get(norm(chaveDe(c))) ?? 0) + 1);
  for (const c of clientes) if ((contagem.get(norm(chaveDe(c))) ?? 0) > 1) c.duplicado = true;
  clientes.sort((a, b) => a.etapa - b.etapa || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { clientes, avisos };
}

/** Busca por parte do nome na Pasta 4 (Finalizados). Termo vazio não lista nada. */
export async function buscarFinalizados(pasta4: string, termo: string, limite = 30): Promise<Cliente[]> {
  const t = norm(termo);
  if (!t) return [];
  if (!(await ehPasta(pasta4))) throw new Error(`Não encontrei a Pasta 4 ("${pasta4}"). Escolha a pasta de novo.`);
  return (await nomesEm(pasta4))
    .filter((i) => i.pasta && norm(i.nome).includes(t))
    .slice(0, limite)
    .map((i) => ({
      nome: basename(i.caminho),
      caminho: i.caminho,
      etapa: 4 as const,
      situacao: 'em-etapa' as const,
      faltando: [],
      artes: [],
      arquivos: [],
      chegando: false,
    }));
}

/** Clientes novos para alertar "arte para fazer": etapa 1, sem MKP, com a arte já na pasta e ainda não vistos. */
export function novasArtesParaFazer(clientes: Cliente[], vistos: string[]): string[] {
  const jaVistos = new Set(vistos.map(norm));
  return clientes
    .filter((c) => c.etapa === 1 && c.situacao === 'arte-a-fazer' && c.artes.length > 0 && !jaVistos.has(norm(chaveDe(c))))
    .map(chaveDe);
}

const MAX_VISTOS = 500;

/**
 * Decide o alerta "arte para fazer". Na primeira vez (sem lista de vistos) só registra o que já existe,
 * para não disparar um alerta por cliente antigo; depois alerta só dos novos com a arte já na pasta.
 */
export function atualizarVistos(clientes: Cliente[], vistos: string[] | undefined): { alertar: string[]; vistos: string[] } {
  if (vistos === undefined) {
    return { alertar: [], vistos: clientes.filter((c) => c.etapa === 1 && c.situacao === 'arte-a-fazer').map(chaveDe).slice(-MAX_VISTOS) };
  }
  const alertar = novasArtesParaFazer(clientes, vistos);
  return { alertar, vistos: [...vistos, ...alertar].slice(-MAX_VISTOS) };
}
