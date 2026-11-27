/** Agenda aberta: o que é só conta (sem tela, sem PDF), para dar para testar. */

export type Ponto = [number, number];

export const TITULO_PADRAO = 'Visão semanal completa';
export const TAMANHO_DO_TITULO = 44;
const MAXIMO_DO_TITULO = 60;

/** A primeira página de um miolo costuma ser só o título; as duas páginas internas vêm na segunda. */
export function paginaPadraoDoMiolo(totalDePaginas: number): number {
  return totalDePaginas >= 2 ? 2 : 1;
}

/** A página escolhida tem que ser larga (duas páginas lado a lado); uma página em pé não serve. */
export function paginaDuplaValida(largura: number, altura: number): boolean {
  return largura > 0 && altura > 0 && largura / altura >= 1.1;
}

export function tituloLimpo(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAXIMO_DO_TITULO).trim();
}

export interface DecoracaoDaAgenda {
  /** Contorno do corpo da seta (curva que engrossa até a ponta), o triângulo da ponta e a reta onde a cor vai do claro ao escuro. */
  seta: { corpo: Ponto[]; ponta: Ponto[]; gradiente: { de: Ponto; para: Ponto } };
  /** Onde o título é desenhado: centro horizontal e topo do texto. */
  titulo: { x: number; y: number };
}

// medidas tiradas da imagem aprovada, em px do mockup de 1200, em relação à lombada (x) e ao topo do livro (y)
const CAUDA: Ponto = [115, -111];
const CONTROLE: Ponto = [40, -137];
const CABECA: Ponto = [12, -79];
const LARGURA_DA_CAUDA = 1.5;
const LARGURA_MAXIMA = 19;
const LARGURA_DA_PONTA = 56;
const COMPRIMENTO_DA_PONTA = 46;
const TITULO_ACIMA_DO_LIVRO = 235;
const AMOSTRAS = 80;
/** A cor sai do turquesa claro na cauda e chega ao escuro na ponta, andando nesta direção por este tanto de pixels. */
const DIRECAO_DA_COR: Ponto = [-0.6, 0.9];
const COMPRIMENTO_DA_COR = 180;
export const COR_DA_CAUDA = '#96ece2';
export const COR_DA_PONTA = '#16b0c4';
export const COR_DO_TITULO = '#3a3a3a';

/** Posições do título e da seta para um livro cuja lombada está em `lombadaX` e cujo topo está em `topoDoLivro`. */
export function geometriaDaDecoracao(lombadaX: number, topoDoLivro: number): DecoracaoDaAgenda {
  const A: Ponto = [lombadaX + CAUDA[0], topoDoLivro + CAUDA[1]];
  const C: Ponto = [lombadaX + CONTROLE[0], topoDoLivro + CONTROLE[1]];
  const B: Ponto = [lombadaX + CABECA[0], topoDoLivro + CABECA[1]];
  const centro: Ponto[] = [];
  for (let i = 0; i < AMOSTRAS; i++) {
    const t = i / (AMOSTRAS - 1);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    centro.push([a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]]);
  }
  const fora: Ponto[] = [];
  const dentro: Ponto[] = [];
  let ultimaNormal: Ponto = [0, 0];
  let ultimaTangente: Ponto = [0, 1];
  for (let i = 0; i < centro.length; i++) {
    const antes = centro[Math.max(0, i - 1)] as Ponto;
    const depois = centro[Math.min(centro.length - 1, i + 1)] as Ponto;
    let dx = depois[0] - antes[0];
    let dy = depois[1] - antes[1];
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    const normal: Ponto = [-dy, dx];
    const t = i / (AMOSTRAS - 1);
    const meia = (LARGURA_DA_CAUDA + LARGURA_MAXIMA * Math.pow(Math.sin(Math.PI * 0.5 * t), 1.3)) / 2;
    const p = centro[i] as Ponto;
    fora.push([p[0] + normal[0] * meia, p[1] + normal[1] * meia]);
    dentro.push([p[0] - normal[0] * meia, p[1] - normal[1] * meia]);
    ultimaNormal = normal;
    ultimaTangente = [dx, dy];
  }
  const corpo = [...fora, ...dentro.reverse()];
  const base: Ponto = [B[0] - ultimaTangente[0] * 2, B[1] - ultimaTangente[1] * 2];
  const metade = LARGURA_DA_PONTA / 2;
  const ponta: Ponto[] = [
    [base[0] + ultimaNormal[0] * metade, base[1] + ultimaNormal[1] * metade],
    [B[0] + ultimaTangente[0] * COMPRIMENTO_DA_PONTA, B[1] + ultimaTangente[1] * COMPRIMENTO_DA_PONTA],
    [base[0] - ultimaNormal[0] * metade, base[1] - ultimaNormal[1] * metade],
  ];
  const de: Ponto = [A[0], topoDoLivro - 134];
  const k = COMPRIMENTO_DA_COR / (DIRECAO_DA_COR[0] ** 2 + DIRECAO_DA_COR[1] ** 2);
  const para: Ponto = [de[0] + DIRECAO_DA_COR[0] * k, de[1] + DIRECAO_DA_COR[1] * k];
  return { seta: { corpo, ponta, gradiente: { de, para } }, titulo: { x: lombadaX, y: topoDoLivro - TITULO_ACIMA_DO_LIVRO } };
}
