export interface Variacao { capa: string; sku: string; ean: string }

export type FonteDaCapa =
  | { tipo: 'pdf'; arquivo: string; paginaCapa: number; paginaContra?: number }
  | { tipo: 'imagem'; capa: string; contra?: string };

export interface EntradaDoAnuncio {
  raiz: string; plataforma: string; categoria: string; arte: string; titulo: string;
  variacoes: Variacao[]; fontes: FonteDaCapa[]; // mesmo tamanho; índice i = capa i
}
