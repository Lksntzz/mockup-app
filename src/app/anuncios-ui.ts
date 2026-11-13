import type { EntradaDoAnuncio } from '../anuncios/tipos';
import { nomeDePastaSeguro } from '../anuncios/nomes';
import type { FormAnuncio } from './anuncios-form';

export type EtapaCorelUi = 'feito' | 'aguardando-clique' | 'pulado' | 'erro' | undefined;

const EXTENSOES = ['.pdf', '.png', '.jpg', '.jpeg'];

/** Extensão em minúsculas (com o ponto) ou ''. */
export function extensaoDe(arquivo: string): string {
  const base = arquivo.split(/[\\/]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i < 0 ? '' : base.slice(i).toLowerCase();
}
export const ehPdf = (a: string): boolean => extensaoDe(a) === '.pdf';
export const ehArteAceita = (a: string): boolean => EXTENSOES.includes(extensaoDe(a));

/** Entrada para o main; a raiz é decidida lá (vai vazia). */
export function montarEntrada(f: FormAnuncio): EntradaDoAnuncio {
  return {
    raiz: '',
    plataforma: f.plataforma,
    categoria: f.categoria,
    subcategoria: f.subcategoria,
    arte: f.arte.trim(),
    titulo: f.titulo.trim(),
    variacoes: f.variacoes.map((v) => ({ capa: v.capa.trim(), sku: v.sku.trim(), ean: v.ean })),
    fontes: f.fontes,
  };
}

/** Caminho do quadro "Será criado": completo, a partir da pasta Anúncio 2027 (quando ela é conhecida). */
export function caminhoPrevisto(f: FormAnuncio, pastaAnuncios?: string): string {
  const arte = nomeDePastaSeguro(f.arte.trim()).nome;
  const partes = [f.plataforma, f.categoria, f.subcategoria, arte].filter(Boolean);
  if (!partes.length) return '';
  if (!pastaAnuncios) return partes.join(' / ');
  const barra = pastaAnuncios.includes('\\') ? '\\' : '/';
  return [pastaAnuncios.replace(/[\\/]+$/, ''), ...partes].join(barra);
}

export function textoDaEtapaCorel(etapa: EtapaCorelUi): string {
  switch (etapa) {
    case 'feito': return 'O arquivo do Corel foi montado.';
    case 'aguardando-clique':
      return 'A pasta e o .txt já estão prontos. O Corel estava fechado: eu abri o molde. Espere ele carregar por inteiro (uns 30 segundos, sem mexer) e clique em "Montar no Corel agora".';
    case 'pulado': return 'Você escolheu só criar a pasta e o .txt: o Corel não foi usado.';
    case 'erro':
      return 'A pasta e o .txt estão prontos, mas o Corel não montou o arquivo. Veja os avisos abaixo. Depois de resolver, clique em "Montar no Corel agora" (ou rode o macro AnuncioDaPasta no Corel).';
    default: return '';
  }
}

/** Tira a arte escolhida (capas e linhas), mantendo plataforma, categoria, nome da arte e título. */
export function limparArte(f: FormAnuncio): FormAnuncio {
  return { ...f, origem: 'nenhuma', fontes: [], variacoes: [] };
}

/** Remove o par de imagens i (e a linha dele). Sem imagens sobrando, volta a "nenhuma". */
export function removerPar(f: FormAnuncio, i: number): FormAnuncio {
  if (f.origem !== 'imagens' || !Number.isInteger(i) || i < 0 || i >= f.fontes.length) return f;
  const fontes = f.fontes.filter((_, k) => k !== i);
  const variacoes = f.variacoes.filter((_, k) => k !== i);
  return { ...f, origem: fontes.length ? 'imagens' : 'nenhuma', fontes, variacoes };
}
