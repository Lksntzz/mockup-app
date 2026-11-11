import { chaveDe, norm, type Cliente } from './clientes';

/** Alguém mexeu na pasta sem usar o app e ela voltou para uma etapa anterior. */
export interface Volta {
  de: number;
  para: number;
  em: number;
}

/** O que o app lembra: em que etapa viu cada cliente pela última vez e quais "voltou" estão sem dispensar. */
export interface EstadoDeEtapas {
  etapas: Record<string, number>;
  voltas: Record<string, Volta>;
}

const MAXIMO = 600;

const limitar = <T>(o: Record<string, T>): Record<string, T> => {
  const e = Object.entries(o);
  return e.length <= MAXIMO ? o : Object.fromEntries(e.slice(e.length - MAXIMO));
};

/**
 * Compara onde cada cliente está agora com onde foi visto da última vez.
 * Etapa menor que a anterior = a pasta voltou: o aviso fica até alguém dispensar.
 * Nome repetido em duas etapas (`duplicado`) é ignorado: não dá para saber qual é qual.
 */
export function atualizarEtapas(anterior: EstadoDeEtapas, clientes: Cliente[], agora: number): EstadoDeEtapas {
  const etapas = { ...anterior.etapas };
  const voltas = { ...anterior.voltas };
  for (const c of clientes) {
    if (c.duplicado) continue;
    const chave = norm(chaveDe(c));
    const antes = etapas[chave];
    if (antes !== undefined && c.etapa < antes && !voltas[chave]) voltas[chave] = { de: antes, para: c.etapa, em: agora };
    delete etapas[chave]; // reinsere no fim, para o corte dos mais antigos ser justo
    etapas[chave] = c.etapa;
  }
  return { etapas: limitar(etapas), voltas: limitar(voltas) };
}

export function descartarVolta(estado: EstadoDeEtapas, chaveDoCliente: string): EstadoDeEtapas {
  const voltas = { ...estado.voltas };
  delete voltas[norm(chaveDoCliente)];
  return { etapas: estado.etapas, voltas };
}

export const textoDaVolta = (v: Volta): string => `Voltou da Pasta ${v.de} para a Pasta ${v.para}`;
