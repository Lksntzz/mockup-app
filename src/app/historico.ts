import { isAvailable } from '../engine/compose';
import type { Choices } from '../engine/types';
import type { AppState } from './state';

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
