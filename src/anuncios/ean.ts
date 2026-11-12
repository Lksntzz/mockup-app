// Origem: portado de Lksntzz/nisti-identificacao, src/scanner/ean-barcode.js
// (só o codificador e as medidas do layout; PNG, ZIP e download não foram portados).
import { isValidGtin13 } from './gtin';

const LEFT_ODD = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const LEFT_EVEN = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const RIGHT = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const LARGURA = 543;
const ALTURA = 189;
const MODULO = 4.35;
const BARRA_Y = 18;
const ALTURA_NORMAL = 92;
const ALTURA_GUARDA = 104;
const Y_DIGITOS = 158;
const TAMANHO_DIGITOS = 24;
/** Largura do módulo, em mm, na impressão a 100% (0,33 mm). */
const MODULO_MM_100 = 0.33;

/** Devolve os 95 módulos ('0'/'1') do EAN-13. */
export function encodeEan13(gtin: string): string {
  const valor = String(gtin || '').trim();
  if (!isValidGtin13(valor)) throw new Error('EAN-13 inválido para geração do código de barras.');
  const d = valor.split('').map(Number) as number[];
  const paridade = PARITY[d[0]!]!;
  let m = '101';
  for (let i = 1; i <= 6; i += 1) m += paridade[i - 1] === 'L' ? LEFT_ODD[d[i]!]! : LEFT_EVEN[d[i]!]!;
  m += '01010';
  for (let i = 7; i <= 12; i += 1) m += RIGHT[d[i]!]!;
  return `${m}101`;
}

export interface LayoutEan {
  largura: 543;
  altura: 189;
  barras: { x: number; y: number; w: number; h: number }[];
  digitos: { texto: string; x: number }[];
  yDigitos: number;
  tamanhoDigitos: number;
}

export function layoutEan13(gtin: string): LayoutEan {
  const valor = String(gtin || '').trim();
  const modulos = encodeEan13(valor);
  const x0 = (LARGURA - modulos.length * MODULO) / 2;
  const barras: LayoutEan['barras'] = [];
  for (let i = 0; i < modulos.length; i += 1) {
    if (modulos[i] !== '1') continue;
    const guarda = i < 3 || (i >= 45 && i < 50) || i >= 92;
    barras.push({ x: Number((x0 + i * MODULO).toFixed(2)), y: BARRA_Y, w: MODULO, h: guarda ? ALTURA_GUARDA : ALTURA_NORMAL });
  }
  return {
    largura: LARGURA,
    altura: ALTURA,
    barras,
    digitos: [
      { texto: valor.charAt(0), x: 43 },
      { texto: valor.slice(1, 7), x: 169.28 },
      { texto: valor.slice(7), x: 373.73 },
    ],
    yDigitos: Y_DIGITOS,
    tamanhoDigitos: TAMANHO_DIGITOS,
  };
}

/** Fator de ampliação do EAN para uma largura (mm) da imagem de 543 px; 1 = 100%. */
export function ampliacaoDoEan(larguraMm: number): number {
  return ((larguraMm / LARGURA) * MODULO) / MODULO_MM_100;
}

export function avisoDeAmpliacao(fator: number): string | null {
  if (fator < 0.8) return 'Código de barras abaixo de 80% do tamanho padrão: pode não ser lido no scanner.';
  if (fator > 2.0) return 'Código de barras acima de 200% do tamanho padrão: fora do limite de ampliação do EAN-13.';
  return null;
}
