export interface CamadaBruta {
  width: number;
  height: number;
  data: Uint8Array;
}
export interface MockupApi {
  carregarPacote(): Promise<{ json: string; camadas: Record<string, CamadaBruta> }>;
  escolherPdf(): Promise<{ nome: string; bytes: Uint8Array } | null>;
  escolherPasta(): Promise<string | null>;
}
declare global {
  interface Window {
    mockupApi: MockupApi;
  }
}
