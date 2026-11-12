import { ajusteEhNulo, ajusteValido, type Ajuste } from '../engine/ajuste';
import { isAvailable } from '../engine/compose';
import type { Choices } from '../engine/types';
import { setAjuste, type AppState } from './state';

export interface Saidas {
  frente: boolean;
  vt: boolean;
  semCanguru: boolean;
  verso: boolean;
}

/** Um trabalho salvo: o suficiente para reabrir o PDF e continuar de onde parou (cores por capa e o que foi gerado). */
export interface EntradaHistorico {
  id: string;
  /** ISO 8601. */
  data: string;
  pdfNome: string;
  pdfCaminho: string;
  saidas: Saidas;
  escolhas: Choices[];
  /** Quantas imagens foram gravadas no total. */
  geradas: number;
  /** Zoom e posição da arte de cada capa (frente e verso); null = sem ajuste. Trabalhos antigos não têm. */
  ajustes?: (Partial<Ajuste> | null)[];
  ajustesVerso?: (Partial<Ajuste> | null)[];
  /** true quando o designer apertou "Finalizar" (imagens geradas e serviço dado como terminado). */
  finalizado?: boolean;
}

export function entradaValida(x: unknown): x is EntradaHistorico {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  const s = e.saidas as Record<string, unknown> | undefined;
  return (
    typeof e.id === 'string' &&
    typeof e.data === 'string' &&
    typeof e.pdfNome === 'string' &&
    typeof e.pdfCaminho === 'string' &&
    typeof e.geradas === 'number' &&
    (e.finalizado === undefined || typeof e.finalizado === 'boolean') &&
    (e.ajustes === undefined || Array.isArray(e.ajustes)) &&
    (e.ajustesVerso === undefined || Array.isArray(e.ajustesVerso)) &&
    Array.isArray(e.escolhas) &&
    e.escolhas.every((c) => !!c && typeof c === 'object') &&
    !!s &&
    typeof s.frente === 'boolean' &&
    typeof s.vt === 'boolean' &&
    typeof s.semCanguru === 'boolean' &&
    typeof s.verso === 'boolean'
  );
}

/** Devolve o estado com as cores salvas aplicadas capa a capa; o que não vale mais (cor removida, combinação indisponível) fica como estava. */
export function aplicarEscolhas(s: AppState, escolhas: Choices[]): AppState {
  return {
    ...s,
    capas: s.capas.map((capa, i) => {
      const salva = escolhas[i];
      if (!salva || !isAvailable(s.pack, salva)) return capa;
      return { ...capa, choices: { ...salva } };
    }),
  };
}

export function descreverSaidas(s: Saidas): string {
  const nomes = [s.frente && 'Frente', s.vt && 'Especificação VT', s.semCanguru && 'Sem canguru', s.verso && 'Verso'].filter(Boolean);
  return nomes.join(' + ');
}

export function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Quantas capas têm cores salvas que o modelo atual do PSD não oferece mais (para avisar o operador). */
export function contarIgnoradas(pack: AppState['pack'], escolhas: Choices[]): number {
  return escolhas.filter((c) => !isAvailable(pack, c)).length;
}

/** Devolve o estado com o zoom/posição salvos de cada capa (frente e verso). Valores estragados são presos nos limites. */
export function aplicarAjustes(
  s: AppState,
  ajustes: (Partial<Ajuste> | null)[] | undefined,
  ajustesVerso: (Partial<Ajuste> | null)[] | undefined,
): AppState {
  let novo = s;
  const aplicar = (lista: (Partial<Ajuste> | null)[] | undefined, lado: 'frente' | 'verso') =>
    lista?.forEach((a, i) => {
      if (a && typeof a === 'object' && i < novo.capas.length) novo = setAjuste(novo, i, ajusteValido(a), lado);
    });
  aplicar(ajustes, 'frente');
  aplicar(ajustesVerso, 'verso');
  return novo;
}

/** O que guardar no histórico: o ajuste de cada capa (null quando neutro) ou undefined se nenhuma capa foi mexida. */
export function ajustesDoEstado(s: AppState): { ajustes: (Ajuste | null)[] | undefined; ajustesVerso: (Ajuste | null)[] | undefined } {
  const lista = (campo: 'ajuste' | 'ajusteVerso') => {
    const l = s.capas.map((c) => (ajusteEhNulo(c[campo]) ? null : { ...c[campo]! }));
    return l.some((a) => a) ? l : undefined;
  };
  return { ajustes: lista('ajuste'), ajustesVerso: lista('ajusteVerso') };
}

/** Em que pé está o trabalho, em palavras: salvo só no app, em andamento (já gerou imagens) ou finalizado. */
export function situacaoDoTrabalho(e: EntradaHistorico): string {
  if (e.finalizado) return 'Finalizado';
  return e.geradas === 0 ? 'Salvo no app (sem imagens)' : 'Em andamento';
}
