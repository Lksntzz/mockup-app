import { encodeEan13 } from './ean';

export interface CapaDoManifesto {
  frente?: string; paginaFrente?: number; verso?: string; paginaVerso?: number; ean: string;
}

function campoSeguro(nome: string, valor: string): string {
  if (/[|\r\n]/.test(valor)) throw new Error(`Valor inválido no manifesto (${nome}): não pode conter "|" nem quebra de linha.`);
  return valor;
}

export function montarManifesto(m: { destino: string; capas: CapaDoManifesto[] }): string {
  const linhas = [`destino=${campoSeguro('destino', m.destino)}`, `capas=${m.capas.length}`];
  for (const c of m.capas) {
    linhas.push([
      `frente=${campoSeguro('frente', c.frente ?? '')}`,
      `pf=${c.paginaFrente ?? ''}`,
      `verso=${campoSeguro('verso', c.verso ?? '')}`,
      `pv=${c.paginaVerso ?? ''}`,
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
    if (pf) capa.paginaFrente = Number(pf);
    if (verso) capa.verso = verso;
    if (pv) capa.paginaVerso = Number(pv);
    return capa;
  });
  return { destino, capas };
}
