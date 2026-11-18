/** Uma arte que pode ir para a frente ou o verso do molde: uma imagem, ou uma página de um PDF. */
export interface Fonte {
  caminho: string;
  /** Só em PDF (começa em 1). */
  pagina?: number;
}

const nomeDe = (caminho: string) => caminho.split(/[\\/]/).pop() ?? caminho;
const ehImagem = (c: string) => /\.(png|jpe?g)$/i.test(c);
const ehPdf = (c: string) => /\.pdf$/i.test(c);
const PISTA_DE_VERSO = /(verso|tras|trás|costas|back)/i;

/** Quantas páginas cada PDF tem (caminho → total). Sem a informação, o app supõe 2 (frente e verso). */
export type PaginasDosPdfs = ReadonlyMap<string, number>;
const paginasDe = (c: string, p?: PaginasDosPdfs): number => Math.max(1, p?.get(c) ?? 2);

/** Tudo que o designer pode escolher: cada imagem, e as páginas 1 e 2 de cada PDF (só as que existem). */
export function fontesDaArte(arquivos: string[], paginas?: PaginasDosPdfs): Fonte[] {
  const r: Fonte[] = [];
  for (const a of arquivos) {
    if (ehImagem(a)) r.push({ caminho: a });
    else if (ehPdf(a)) {
      r.push({ caminho: a, pagina: 1 });
      if (paginasDe(a, paginas) >= 2) r.push({ caminho: a, pagina: 2 });
    }
  }
  return r;
}

export function rotuloDaFonte(f: Fonte): string {
  return f.pagina ? `${nomeDe(f.caminho)} — página ${f.pagina}` : nomeDe(f.caminho);
}

/**
 * Chute inicial de qual arte é a frente e qual é o verso (o designer troca nos seletores).
 * Imagens: nome com verso/costas/trás/back é o verso. Um PDF: página 1 frente, página 2 verso.
 */
export function frenteEVersoPadrao(arquivos: string[], paginas?: PaginasDosPdfs): { frente?: Fonte; verso?: Fonte } {
  const imagens = arquivos.filter(ehImagem).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR', { numeric: true }));
  if (imagens.length > 0) {
    const versoPorNome = imagens.find((i) => PISTA_DE_VERSO.test(nomeDe(i)));
    const frentes = imagens.filter((i) => i !== versoPorNome);
    const frente = frentes[0];
    const verso = versoPorNome ?? frentes[1];
    return { ...(frente ? { frente: { caminho: frente } } : {}), ...(verso ? { verso: { caminho: verso } } : {}) };
  }
  const pdf = arquivos.filter(ehPdf).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR', { numeric: true }))[0];
  if (pdf) return paginasDe(pdf, paginas) >= 2 ? { frente: { caminho: pdf, pagina: 1 }, verso: { caminho: pdf, pagina: 2 } } : { frente: { caminho: pdf, pagina: 1 } };
  return {};
}
