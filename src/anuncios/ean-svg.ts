import { layoutEan13 } from './ean';
import { isValidGtin13, normalizarEan } from './gtin';

/** Gera o SVG completo do código de barras EAN-13. */
export function gerarSvgEan13(ean: string): string {
  const valor = normalizarEan(ean);
  if (!isValidGtin13(valor)) throw new Error('EAN inválido');
  const l = layoutEan13(valor);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${l.largura}" height="${l.altura}" viewBox="0 0 ${l.largura} ${l.altura}">`;
  svg += `<rect x="0" y="0" width="${l.largura}" height="${l.altura}" fill="#fff"/>`;
  for (const b of l.barras) svg += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#000"/>`;
  for (const d of l.digitos) {
    svg += `<text x="${d.x}" y="${l.yDigitos}" font-family="Arial" font-size="${l.tamanhoDigitos}" text-anchor="middle" fill="#000">${d.texto}</text>`;
  }
  return `${svg}</svg>`;
}
