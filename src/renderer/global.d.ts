export interface CamadaBruta {
  width: number;
  height: number;
  data: Uint8Array;
}
export interface MockupApi {
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
