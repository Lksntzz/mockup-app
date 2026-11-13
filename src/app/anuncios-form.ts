import { capasDoPdf } from '../anuncios/capas';
import type { FonteDaCapa, Variacao } from '../anuncios/tipos';
import { isValidGtin13, normalizarEan } from '../anuncios/gtin';
import { nomeDePastaSeguro } from '../anuncios/nomes';

export interface FormAnuncio {
  plataforma: string; categoria: string; subcategoria: string; temSubcategorias: boolean;
  arte: string; titulo: string;
  origem: 'nenhuma' | 'pdf' | 'imagens';
  fontes: FonteDaCapa[]; variacoes: Variacao[];
}
export interface Validacao {
  erros: { arte?: string; titulo?: string; geral?: string; ean: Record<number, string> };
  /** Linhas sem EAN: não é erro, só uma dica neutra (valem para "Só criar a pasta e o .txt"). */
  pendentes: Record<number, string>;
  avisos: string[];
  /** "Criar pasta e arquivos" (monta no Corel): exige todos os EANs. */
  podeCriar: boolean;
  /** "Só criar a pasta e o .txt": aceita EAN vazio (fica pendente no .txt), mas não inválido nem repetido. */
  podeCriarSoPasta: boolean;
}

export const DICA_EAN_PENDENTE = "EAN pendente — só vale para 'Só criar a pasta'";

export const formVazio = (): FormAnuncio => ({
  plataforma: '', categoria: '', subcategoria: '', temSubcategorias: false, arte: '', titulo: '', origem: 'nenhuma', fontes: [], variacoes: [],
});

const variacaoVazia = (): Variacao => ({ capa: '', sku: '', ean: '' });

function nomeSemExtensao(arquivo: string): string {
  const base = arquivo.split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[^.]*$/, '').trim();
}

export function aplicarPdf(f: FormAnuncio, arquivo: string, totalPaginas: number): FormAnuncio {
  const fontes = capasDoPdf(arquivo, totalPaginas);
  return {
    ...f,
    arte: f.arte.trim() ? f.arte : nomeSemExtensao(arquivo),
    origem: 'pdf',
    fontes,
    variacoes: fontes.map(variacaoVazia),
  };
}

export function aplicarPar(f: FormAnuncio, indice: number, par: { capa?: string; contra?: string }): FormAnuncio {
  const partida: FormAnuncio = f.origem === 'imagens' ? f : { ...f, origem: 'imagens', fontes: [], variacoes: [] };
  const fontes = [...partida.fontes];
  const variacoes = [...partida.variacoes];
  if (indice === fontes.length) {
    fontes.push({ tipo: 'imagem', capa: par.capa ?? '', ...(par.contra !== undefined ? { contra: par.contra } : {}) });
    variacoes.push(variacaoVazia());
  } else {
    const atual = fontes[indice];
    if (!atual || atual.tipo !== 'imagem') return f;
    fontes[indice] = { ...atual, ...(par.capa !== undefined ? { capa: par.capa } : {}), ...(par.contra !== undefined ? { contra: par.contra } : {}) };
  }
  return { ...partida, origem: 'imagens', fontes, variacoes };
}

export function adicionarPar(f: FormAnuncio): FormAnuncio {
  if (f.origem !== 'imagens') return f;
  return { ...f, fontes: [...f.fontes, { tipo: 'imagem', capa: '' }], variacoes: [...f.variacoes, variacaoVazia()] };
}

export function definirVariacao(f: FormAnuncio, i: number, campo: keyof Variacao, valor: string): FormAnuncio {
  const atual = f.variacoes[i];
  if (!Number.isInteger(i) || !atual) return f;
  const variacoes = [...f.variacoes];
  variacoes[i] = { ...atual, [campo]: valor };
  return { ...f, variacoes };
}

export function validar(f: FormAnuncio): Validacao {
  const erros: Validacao['erros'] = { ean: {} };
  const avisos: string[] = [];
  let ok = Boolean(f.plataforma) && Boolean(f.categoria) && !(f.temSubcategorias && !f.subcategoria);

  const arte = f.arte.trim();
  const seguro = nomeDePastaSeguro(arte);
  if (!seguro.nome) { erros.arte = 'Digite um nome de arte válido'; ok = false; }
  else if (seguro.alterado) avisos.push(`A pasta se chamará "${seguro.nome}"`);

  if (!f.titulo.trim()) { erros.titulo = 'Digite o título do anúncio'; ok = false; }

  if (f.variacoes.length === 0) {
    erros.geral = f.origem === 'pdf' ? 'O PDF não tem páginas' : 'Escolha o PDF ou as imagens das capas';
    ok = false;
  } else if (f.fontes.some((x) => x.tipo === 'imagem' && !x.capa)) {
    erros.geral = 'Escolha a imagem da capa';
    ok = false;
  }

  const pendentes: Record<number, string> = {};
  const vistos = new Map<string, number>();
  f.variacoes.forEach((v, i) => {
    const ean = normalizarEan(v.ean);
    if (!ean) pendentes[i] = DICA_EAN_PENDENTE;
    else if (!isValidGtin13(ean)) erros.ean[i] = 'EAN inválido: confira os 13 dígitos';
    else if (vistos.has(ean)) erros.ean[i] = `EAN repetido (igual ao da linha ${(vistos.get(ean) ?? 0) + 1})`;
    else vistos.set(ean, i);
    if (erros.ean[i]) ok = false;
  });

  const skus = f.variacoes.map((v) => v.sku.trim()).filter(Boolean);
  if (new Set(skus).size !== skus.length) avisos.push('Há SKU repetido entre as variações');

  const temPendente = Object.keys(pendentes).length > 0;
  return { erros, pendentes, avisos, podeCriar: ok && !temPendente, podeCriarSoPasta: ok };
}
