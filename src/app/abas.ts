export type Modo = 'frente' | 'verso' | 'vt' | 'sem-canguru';

export const ROTULOS: Record<Modo, string> = {
  frente: 'Frente',
  vt: 'Especificação VT',
  'sem-canguru': 'Sem canguru',
  verso: 'Verso',
};

/** Quais mockups dá para ver na prévia: a frente sempre; os demais conforme o que está marcado e se há página par. */
export function abasVisiveis(o: { temVerso: boolean; vt: boolean; semCanguru: boolean }): Modo[] {
  return [
    'frente',
    ...(o.vt ? (['vt'] as const) : []),
    ...(o.semCanguru ? (['sem-canguru'] as const) : []),
    ...(o.temVerso ? (['verso'] as const) : []),
  ];
}

/** A aba vizinha (passo 1 ou -1), dando a volta nas pontas; se a atual não está na lista, volta para a frente. */
export function vizinha(abas: Modo[], atual: Modo, passo: 1 | -1): Modo {
  const i = abas.indexOf(atual);
  if (i < 0) return 'frente';
  return abas[(i + passo + abas.length) % abas.length] as Modo;
}
