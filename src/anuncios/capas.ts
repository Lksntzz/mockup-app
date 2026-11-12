import { capaPageNumbers } from '../pdf/pages';
import type { FonteDaCapa } from './tipos';

export function capasDoPdf(arquivo: string, totalPaginas: number): FonteDaCapa[] {
  return capaPageNumbers(totalPaginas).map((p) =>
    p + 1 <= totalPaginas
      ? { tipo: 'pdf', arquivo, paginaCapa: p, paginaContra: p + 1 }
      : { tipo: 'pdf', arquivo, paginaCapa: p });
}
