import { isAvailable } from '../engine/compose';
import type { Accessory, Choices, Pack, Raster } from '../engine/types';

export interface CapaState {
  art: Raster;
  /** Arte da página par (verso) desta capa; ausente quando o PDF não tem essa página. */
  back?: Raster;
  choices: Choices;
}

export interface AppState {
  pack: Pack;
  capas: CapaState[];
  selecionada: number;
  /** Mensagem da última ação recusada; some na próxima ação que dá certo. */
  lastError?: string;
}

export function createState(pack: Pack, artes: Raster[], versos: (Raster | null)[] = []): AppState {
  return {
    pack,
    capas: artes.map((art, i) => {
      const back = versos[i];
      return { art, ...(back ? { back } : {}), choices: { ...pack.defaults } };
    }),
    selecionada: 0,
  };
}

function recusar(s: AppState, motivo: string): AppState {
  return { ...s, lastError: motivo };
}

export function setColor(s: AppState, capa: number, acessorio: Accessory, id: string): AppState {
  const atual = s.capas[capa];
  if (!atual) return recusar(s, 'Essa capa não existe.');
  if (!s.pack.options[acessorio].some((o) => o.id === id)) return recusar(s, 'Essa cor não existe.');
  const novas: Choices = { ...atual.choices, [acessorio]: id };
  if (!isAvailable(s.pack, novas)) return recusar(s, 'Combinação indisponível: escolha outra cor.');
  const capas = s.capas.map((c, i) => (i === capa ? { ...c, choices: novas } : c));
  const { lastError: _descartado, ...resto } = s;
  return { ...resto, capas };
}

export function copyToAll(s: AppState, capa: number): AppState {
  const origem = s.capas[capa];
  if (!origem) return recusar(s, 'Essa capa não existe.');
  const { lastError: _descartado, ...resto } = s;
  return { ...resto, capas: s.capas.map((c) => ({ ...c, choices: { ...origem.choices } })) };
}

export function select(s: AppState, capa: number): AppState {
  if (capa < 0 || capa >= s.capas.length) return s;
  return { ...s, selecionada: capa };
}
