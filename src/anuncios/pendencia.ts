import { normalizarEan } from './gtin';
import type { Variacao } from './tipos';

export interface CapaPendente { n: number; capa: string; faltaEan: boolean; faltaSku: boolean }
export interface Pendencia { versao: 1; arte: string; capas: CapaPendente[] }

/** Monta a pendência (n = posição da capa, a partir de 1); undefined se todas têm EAN e SKU. */
export function montarPendencia(arte: string, variacoes: Variacao[]): Pendencia | undefined {
  const capas: CapaPendente[] = [];
  variacoes.forEach((v, i) => {
    const faltaEan = normalizarEan(v.ean) === '';
    const faltaSku = v.sku.trim() === '';
    if (faltaEan || faltaSku) capas.push({ n: i + 1, capa: v.capa, faltaEan, faltaSku });
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
  const estragado = (motivo: string) => new Error(`pendente.json está estragado (${motivo}).`);
  if (o === null || typeof o !== 'object' || Array.isArray(o)) throw estragado('não é um objeto');
  const p = o as Record<string, unknown>;
  if (p.versao !== 1) throw new Error(`pendente.json: versão ${String(p.versao)} não suportada (esperada 1).`);
  if (typeof p.arte !== 'string' || p.arte === '') throw estragado('arte inválida');
  if (!Array.isArray(p.capas) || p.capas.length === 0) throw estragado('lista de capas inválida');
  const vistos = new Set<number>();
  const capas = p.capas.map((item: unknown, i: number): CapaPendente => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw estragado(`capa #${i + 1} inválida`);
    const c = item as Record<string, unknown>;
    if (typeof c.n !== 'number' || !Number.isInteger(c.n) || c.n < 1) throw estragado(`capa #${i + 1} inválida: n`);
    if (typeof c.capa !== 'string') throw estragado(`capa #${i + 1} inválida: capa`);
    if (typeof c.faltaEan !== 'boolean') throw estragado(`capa #${i + 1} inválida: faltaEan`);
    if (typeof c.faltaSku !== 'boolean') throw estragado(`capa #${i + 1} inválida: faltaSku`);
    if (vistos.has(c.n)) throw estragado(`capa #${i + 1} inválida: n repetido`);
    vistos.add(c.n);
    return { n: c.n, capa: c.capa, faltaEan: c.faltaEan, faltaSku: c.faltaSku };
  });
  return { versao: 1, arte: p.arte, capas };
}

/** Tira o que foi preenchido (EAN e/ou SKU) de cada capa; capas sem mais nada faltando saem. undefined quando nada mais falta. */
export function aposConcluir(p: Pendencia, preenchidos: { eans: number[]; skus: number[] }): Pendencia | undefined {
  const capas = p.capas
    .map((c) => ({
      ...c,
      faltaEan: c.faltaEan && !preenchidos.eans.includes(c.n),
      faltaSku: c.faltaSku && !preenchidos.skus.includes(c.n),
    }))
    .filter((c) => c.faltaEan || c.faltaSku);
  return capas.length ? { ...p, capas } : undefined;
}
