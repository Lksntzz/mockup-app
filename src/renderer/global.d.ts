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
export interface MockupApi {
  versao(): Promise<string>;
  estadoAtualizacao(): Promise<EstadoAtualizacao>;
  verificarAtualizacao(): Promise<void>;
  instalarAtualizacao(): Promise<void>;
  aoMudarAtualizacao(cb: (estado: EstadoAtualizacao) => void): void;
  carregarPacote(): Promise<{ json: string; camadas: Record<string, CamadaBruta> }>;
  escolherPdf(): Promise<{ nome: string; bytes: Uint8Array } | null>;
  escolherPasta(): Promise<string | null>;
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
