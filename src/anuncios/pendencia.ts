import { normalizarEan } from './gtin';
import type { Variacao } from './tipos';

export interface CapaPendente { n: number; capa: string; faltaEan: boolean; faltaSku: boolean }
export interface Pendencia { versao: 1; arte: string; capas: CapaPendente[] }

/** Monta a pendência (n = posição da capa, a partir de 1); undefined se todas têm EAN. */
export function montarPendencia(arte: string, variacoes: Variacao[]): Pendencia | undefined {
  const capas: CapaPendente[] = [];
  variacoes.forEach((v, i) => {
    if (normalizarEan(v.ean) !== '') return;
    capas.push({ n: i + 1, capa: v.capa, faltaEan: true, faltaSku: v.sku.trim() === '' });
  });
  return capas.length ? { versao: 1, arte, capas } : undefined;
}

export function serializarPendencia(p: Pendencia): string {
  return `${JSON.stringify(p, null, 2)}\n`;
}

export function lerPendencia(texto: string): Pendencia {
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    throw new Error('pendente.json está estragado (JSON inválido).');
  }
  const p = o as Partial<Pendencia> | null;
  if (!p || typeof p !== 'object') throw new Error('pendente.json está estragado.');
  if (p.versao !== 1) throw new Error(`pendente.json: versão ${String(p.versao)} não suportada (esperada 1).`);
  if (typeof p.arte !== 'string' || !Array.isArray(p.capas)) throw new Error('pendente.json está estragado.');
  return p as Pendencia;
}

/** Remove faltaEan das capas preenchidas; undefined quando nenhuma capa falta EAN. */
export function aposConcluir(p: Pendencia, preenchidos: number[]): Pendencia | undefined {
  const capas = p.capas.filter((c) => !(c.faltaEan && preenchidos.includes(c.n)));
  return capas.some((c) => c.faltaEan) ? { ...p, capas } : undefined;
}
