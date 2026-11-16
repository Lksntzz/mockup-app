import type { EntradaHistorico } from '../app/historico';
import type { Rascunho } from '../app/rascunhos';
import type { ConfigDesigner } from '../main/config-designer';
import type { Cliente } from '../main/clientes';
import type { ResultadoDoMolde } from '../main/corel';
import type { ResultadoAnuncio } from '../main/anuncios';
import type { EntradaDoAnuncio } from '../anuncios/tipos';
import type { CardPendente, ResultadoColocarEan, ResultadoConcluir } from '../main/anuncios-pendentes';
import type { ResultadoCategoria } from '../main/anuncios-pastas';
import type { ResultadoMover } from '../main/pasta-fluxo';
export interface CamadaBruta {
  width: number;
  height: number;
  data: Uint8Array;
}
export type EstadoAtualizacao =
  | { tipo: 'ocioso' }
  | { tipo: 'verificando'; manual: boolean }
  | { tipo: 'baixando'; versao: string; percent: number }
  | { tipo: 'pronta'; versao: string }
  | { tipo: 'atualizado'; manual: boolean }
  | { tipo: 'erro'; mensagem: string; manual: boolean };
export interface ArquivoPdf {
  nome: string;
  caminho: string;
  bytes: Uint8Array;
}
/** As artes que o operador escolhe na aba Personalizar e se os arquivos de cada uma estão no programa. */
export interface EstadoDasArtes {
  artes: Array<{ id: string; titulo: string; ok: boolean; motivo: string }>;
}

export interface MockupApi {
  versao(): Promise<string>;
  operador(): Promise<string>;
  listarHistorico(): Promise<EntradaHistorico[]>;
  salvarNoHistorico(entrada: EntradaHistorico): Promise<void>;
  removerDoHistorico(id: string): Promise<void>;
  listarRascunhos(): Promise<Rascunho[]>;
  salvarRascunho(r: Rascunho): Promise<void>;
  removerRascunho(caminho: string): Promise<void>;
  designerEstado(): Promise<ConfigDesigner>;
  fluxoConferido(caminho: string): Promise<boolean>;
  ocupado(ocupado: boolean): Promise<void>;
  fluxoVoltouVisto(caminho: string): Promise<boolean>;
  salvarTemporario(nome: string, bytes: Uint8Array): Promise<string>;
  corelArteNoMolde(entrada: { frente?: string; verso?: string; destino: string; copiar?: string }): Promise<{ ok: true; detalhes?: ResultadoDoMolde } | { ok: false; motivo: string; aberto?: true }>;
  corelGerarPdf(caminho: string): Promise<ResultadoMover>;
  notificacaoTestar(): Promise<{ suportada: boolean }>;
  designerProcurarPastas(substituir: boolean, somenteAnuncios?: boolean): Promise<{ config: ConfigDesigner; achou: number; avisos: string[] }>;
  designerLigar(ligado: boolean, pin?: string): Promise<ConfigDesigner>;
  designerEscolherPasta(qual: 'pasta1' | 'pasta2' | 'pasta3' | 'pasta4' | 'pastaAnuncios'): Promise<ConfigDesigner>;
  anunciosPastas(): Promise<{ pastaAnuncios?: string; plataformas: string[]; avisos?: string[] }>;
  anunciosCategorias(plataforma: string): Promise<string[]>;
  anunciosCriarCategoria(plataforma: string, nome: string): Promise<ResultadoCategoria>;
  anunciosSubcategorias(plataforma: string, categoria: string): Promise<{ ok: boolean; lista: string[] }>;
  anunciosCriarSubcategoria(plataforma: string, categoria: string, nome: string): Promise<ResultadoCategoria>;
  anunciosPendentes(): Promise<{ ok: true; lista: CardPendente[] } | { ok: false; motivo: string }>;
  personalizarEstado(modelo?: string): Promise<EstadoDasArtes>;
  personalizarPrevia(modelo: string, nome: string, inicial: string): Promise<{ ok: true; png: Uint8Array; aviso?: string } | { ok: false; motivo: string }>;
  personalizarImpressoras(): Promise<{ ok: true; lista: Array<{ nome: string; padrao: boolean }> } | { ok: false; motivo: string }>;
  personalizarPreferencias(impressora: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  personalizarImprimir(modelo: string, nome: string, inicial: string, copias: number, impressora: string): Promise<{ ok: true; preparoMs?: number; envioMs?: number } | { ok: false; motivo: string }>;
  anunciosColocarEan(pasta: string): Promise<ResultadoColocarEan>;
  anunciosConcluirPendente(pasta: string, eans: Record<number, string>, skus: Record<number, string>): Promise<ResultadoConcluir>;
  anunciosAbrirPasta(caminho: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  anunciosCriar(entrada: EntradaDoAnuncio, montarNoCorel: boolean): Promise<ResultadoAnuncio>;
  aoProgredirAnuncio(cb: (p: { etapa: string; estado: string }) => void): () => void;
  anunciosMontarNoCorel(pasta: string): Promise<ResultadoAnuncio>;
  iniciarComWindowsEstado(): Promise<boolean>;
  iniciarComWindows(ligado: boolean): Promise<boolean>;
  abrirArquivoCliente(caminho: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  clientesListar(): Promise<{ clientes: Cliente[]; avisos: string[] }>;
  clientesBuscar(termo: string): Promise<Cliente[]>;
  aoArteParaFazer(cb: (nomes: string[]) => void): void;
  aoAbrirCliente(cb: () => void): void;
  fluxoAvancar(caminho: string): Promise<ResultadoMover>;
  fluxoMover(caminho: string): Promise<ResultadoMover>;
  estadoAtualizacao(): Promise<EstadoAtualizacao>;
  verificarAtualizacao(): Promise<void>;
  instalarAtualizacao(): Promise<void>;
  aoMudarAtualizacao(cb: (estado: EstadoAtualizacao) => void): void;
  carregarPacote(nome?: 'especificacao' | 'verso'): Promise<{ json: string; camadas: Record<string, CamadaBruta> }>;
  escolherPdf(pastaInicial?: string): Promise<ArquivoPdf | null>;
  lerPdf(caminho: string): Promise<ArquivoPdf>;
  caminhoDoArquivo(arquivo: File): string;
  prepararMkp(caminhoDoPdf: string): Promise<string>;
  existe(caminho: string): Promise<boolean>;
  gravarArquivo(caminho: string, bytes: Uint8Array): Promise<void>;
  renomearArquivo(de: string, para: string): Promise<void>;
  removerArquivo(caminho: string): Promise<void>;
  confirmarSobrescrever(arquivos: string[]): Promise<boolean>;
}
declare global {
  interface Window {
    mockupApi: MockupApi;
  }
}
