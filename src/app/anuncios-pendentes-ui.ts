import { isValidGtin13, normalizarEan } from '../anuncios/gtin';
import type { CapaPendente } from '../anuncios/pendencia';

export interface CardPendenteEntrada {
  pasta: string; arte: string; plataforma: string; categoria: string; subcategoria?: string; capas: CapaPendente[]; erro?: string;
}
export interface LinhasDoCard { titulo: string; caminho: string; falta: string[]; erro?: string }

const COMO_RODAR_MACRO =
  'Ferramentas › Scripts › Executar script… › GlobalMacros › MKP › AdicionarEanNoCdr (ou Alt + F11, escolha o módulo MKP e aperte F5 com o cursor dentro de AdicionarEanNoCdr).';

/** Texto de orientação depois de gravar os EANs. montarPrimeiro: o .cdr ainda não foi montado (montar.txt continua na pasta). */
export function textoOrientacaoCorel(montarPrimeiro: boolean): string {
  return montarPrimeiro
    ? `Monte o .cdr primeiro (Montar no Corel) e depois rode a macro AdicionarEanNoCdr: ${COMO_RODAR_MACRO}`
    : `Agora abra o arquivo .cdr desta arte no CorelDRAW e rode a macro AdicionarEanNoCdr: ${COMO_RODAR_MACRO}`;
}

function nomeDaCapa(c: CapaPendente): string {
  return c.capa.trim() || `Capa ${c.n}`;
}

/** Transforma o card vindo do main nas linhas de texto mostradas na tela. */
export function linhasDoCard(c: CardPendenteEntrada): LinhasDoCard {
  const caminho = [c.plataforma, c.categoria, c.subcategoria ?? ''].filter((p) => p.trim() !== '').join(' › ');
  const falta: string[] = [];
  for (const capa of c.capas) {
    if (capa.faltaEan) falta.push(`EAN da capa ${capa.n} (${nomeDaCapa(capa)})`);
    if (capa.faltaSku) falta.push(`SKU da capa ${capa.n} (${nomeDaCapa(capa)})`);
  }
  return { titulo: c.arte, caminho, falta: falta.length ? [`Falta: ${falta.join(', ')}`] : [], ...(c.erro ? { erro: c.erro } : {}) };
}

/** As capas que ainda precisam de EAN e/ou SKU (as do formulário de concluir). */
export function capasPendentes(c: CardPendenteEntrada): CapaPendente[] {
  return c.capas.filter((x) => x.faltaEan || x.faltaSku);
}

export interface ValidacaoConcluir {
  /** Mensagem de erro por número da capa (n). */
  erros: Record<number, string>;
  /** EANs normalizados, só das capas preenchidas e válidas. */
  eans: Record<number, string>;
  /** Pelo menos um EAN preenchido e nenhum erro. */
  podeSalvar: boolean;
}

/** Valida os campos do concluir como o formulário principal: 13 dígitos, GTIN válido e sem repetir. Vazio é permitido (fica pendente). */
export function validarEansConcluir(valores: Record<number, string>, jaUsados: string[] = []): ValidacaoConcluir {
  const erros: Record<number, string> = {};
  const eans: Record<number, string> = {};
  const vistos = new Map<string, number>();
  const usados = new Set(jaUsados.map(normalizarEan).filter(Boolean));
  for (const chave of Object.keys(valores).map(Number).sort((a, b) => a - b)) {
    const ean = normalizarEan(valores[chave] ?? '');
    if (!ean) continue;
    if (!isValidGtin13(ean)) erros[chave] = 'EAN inválido: confira os 13 dígitos';
    else if (vistos.has(ean)) erros[chave] = `EAN repetido (igual ao da capa ${vistos.get(ean)})`;
    else if (usados.has(ean)) erros[chave] = 'Este EAN já está em outra capa desta arte';
    else { vistos.set(ean, chave); eans[chave] = ean; }
  }
  return { erros, eans, podeSalvar: Object.keys(eans).length > 0 && Object.keys(erros).length === 0 };
}

export interface ValidacaoSkus {
  erros: Record<number, string>;
  /** SKUs (sem espaços nas pontas) das capas preenchidas e válidas. */
  skus: Record<number, string>;
  /** Avisos que não impedem salvar (SKU igual ao de outra capa). */
  avisos: Record<number, string>;
}

/** SKU: sem "|" (quebraria a linha do .txt); repetido só avisa, como no formulário principal. */
export function validarSkusConcluir(valores: Record<number, string>, jaUsados: string[] = []): ValidacaoSkus {
  const erros: Record<number, string> = {};
  const avisos: Record<number, string> = {};
  const skus: Record<number, string> = {};
  const vistos = new Map<string, number>();
  const usados = new Set(jaUsados.map((x) => x.trim()).filter(Boolean));
  for (const chave of Object.keys(valores).map(Number).sort((a, b) => a - b)) {
    const sku = (valores[chave] ?? '').trim();
    if (!sku) continue;
    if (/[|\r\n]/.test(sku)) { erros[chave] = 'O SKU não pode ter o caractere "|"'; continue; }
    if (sku.length > 100) { erros[chave] = 'SKU longo demais'; continue; }
    skus[chave] = sku;
    if (vistos.has(sku)) avisos[chave] = `SKU igual ao da capa ${vistos.get(sku)}`;
    else if (usados.has(sku)) avisos[chave] = 'Este SKU já está em outra capa desta arte';
    else vistos.set(sku, chave);
  }
  return { erros, skus, avisos };
}

export function textoFaltam(n: number): string {
  return n === 1 ? 'Ainda falta 1 capa' : `Ainda faltam ${n} capas`;
}
