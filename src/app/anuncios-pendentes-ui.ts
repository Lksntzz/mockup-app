import { isValidGtin13, normalizarEan } from '../anuncios/gtin';
import type { CapaPendente } from '../anuncios/pendencia';

export interface CardPendenteEntrada {
  pasta: string; arte: string; plataforma: string; categoria: string; subcategoria?: string; capas: CapaPendente[]; erro?: string;
}
export interface LinhasDoCard { titulo: string; caminho: string; falta: string[]; erro?: string }

export const TEXTO_ORIENTACAO_COREL =
  'Agora abra o arquivo .cdr desta arte no CorelDRAW e rode a macro AdicionarEanNoCdr (Alt + F11, ou Ferramentas › Scripts › Executar script… › GlobalMacros › MKP.AdicionarEanNoCdr).';

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

/** Só as capas que ainda precisam de EAN (as do formulário de concluir). */
export function capasSemEan(c: CardPendenteEntrada): CapaPendente[] {
  return c.capas.filter((x) => x.faltaEan);
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

export function textoFaltam(n: number): string {
  return n === 1 ? 'Ainda falta 1 capa' : `Ainda faltam ${n} capas`;
}
