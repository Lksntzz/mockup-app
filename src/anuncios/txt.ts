import type { Variacao } from './tipos';

export interface DadosDoTxt {
  plataforma: string; categoria: string; arte: string; titulo: string; variacoes: Variacao[];
}

/** Monta o texto do .txt do anúncio (CRLF, sem BOM; o BOM entra na gravação). */
export function montarTxt(a: DadosDoTxt): string {
  const linhas = [
    `Plataforma: ${a.plataforma}`,
    `Categoria: ${a.categoria}`,
    `Arte: ${a.arte}`,
    `Título: ${a.titulo}`,
    '',
    'Variações:',
    ...a.variacoes.map((v, i) =>
      `${i + 1} | Capa: ${v.capa} | SKU: ${v.sku || '(pendente)'} | EAN: ${v.ean || '(pendente)'}`),
  ];
  return linhas.join('\r\n');
}
