import { encodeEan13 } from './ean';

export interface CapaDoManifesto {
  frente?: string; paginaFrente?: number; verso?: string; paginaVerso?: number; ean: string;
}

function campoSeguro(nome: string, valor: string): string {
  if (/[|\r\n]/.test(valor)) throw new Error(`Valor inválido no manifesto (${nome}): não pode conter "|" nem quebra de linha.`);
  return valor;
}

function paginaSegura(nome: string, n: number | undefined): string {
  if (n === undefined) return '';
  if (!Number.isInteger(n) || n < 1) throw new Error(`Valor inválido no manifesto (${nome}): a página deve ser um inteiro maior ou igual a 1.`);
  return String(n);
}

function lerPagina(nome: string, texto: string): number {
  if (!/^[0-9]+$/.test(texto) || Number(texto) < 1) throw new Error(`Valor inválido no manifesto (${nome}): "${texto}" não é um inteiro maior ou igual a 1.`);
  return Number(texto);
}

export function montarManifesto(m: { destino: string; capas: CapaDoManifesto[] }): string {
  const linhas = [`destino=${campoSeguro('destino', m.destino)}`, `capas=${m.capas.length}`];
  for (const c of m.capas) {
    linhas.push([
      `frente=${campoSeguro('frente', c.frente ?? '')}`,
      `pf=${paginaSegura('pf', c.paginaFrente)}`,
      `verso=${campoSeguro('verso', c.verso ?? '')}`,
      `pv=${paginaSegura('pv', c.paginaVerso)}`,
      `ean=${campoSeguro('ean', c.ean)}`,
      `mod=${encodeEan13(c.ean)}`,
    ].join('|'));
  }
  return linhas.join('\r\n');
}

export function lerManifesto(texto: string): { destino: string; capas: CapaDoManifesto[] } {
  const linhas = texto.split(/\r?\n/);
  while (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();
  const destino = (linhas[0] ?? '').replace(/^destino=/, '');
  const capas: CapaDoManifesto[] = linhas.slice(2).map((linha) => {
    const campos = new Map<string, string>();
    for (const parte of linha.split('|')) {
      const i = parte.indexOf('=');
      if (i >= 0) campos.set(parte.slice(0, i), parte.slice(i + 1));
    }
    const capa: CapaDoManifesto = { ean: campos.get('ean') ?? '' };
    const frente = campos.get('frente');
    const verso = campos.get('verso');
    const pf = campos.get('pf');
    const pv = campos.get('pv');
    if (frente) capa.frente = frente;
    if (pf) capa.paginaFrente = lerPagina('pf', pf);
    if (verso) capa.verso = verso;
    if (pv) capa.paginaVerso = lerPagina('pv', pv);
    return capa;
  });
  return { destino, capas };
}
