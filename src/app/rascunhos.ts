import type { Choices } from '../engine/types';
import type { Saidas } from './historico';

/** Trabalho em andamento de um PDF, gravado em disco a cada mudança para sobreviver a fechar o app ou reiniciar o PC. */
export interface Rascunho {
  /** Caminho do PDF: é a identidade do rascunho (um por PDF). */
  caminho: string;
  nome: string;
  /** ISO 8601. */
  atualizadoEm: string;
  /** Índice da capa selecionada. */
  selecionada: number;
  saidas: Saidas;
  escolhas: Choices[];
}

export function rascunhoValido(x: unknown): x is Rascunho {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  const s = e.saidas as Record<string, unknown> | undefined;
  return (
    typeof e.caminho === 'string' &&
    typeof e.nome === 'string' &&
    typeof e.atualizadoEm === 'string' &&
    typeof e.selecionada === 'number' &&
    Array.isArray(e.escolhas) &&
    e.escolhas.every((c) => !!c && typeof c === 'object') &&
    !!s &&
    typeof s.frente === 'boolean' &&
    typeof s.vt === 'boolean' &&
    typeof s.semCanguru === 'boolean' &&
    typeof s.verso === 'boolean'
  );
}
