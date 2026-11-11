import type { Caixa } from './reader';

/**
 * O molde da capa no arquivo de impressão do Corel: 150 × 210 mm, sempre no mesmo lugar de uma página A4
 * (centro em X = 104,951 mm e Y = 148,343 mm, contado de baixo para cima). O molde fica invisível no PDF;
 * a arte tem 195 × 255 mm porque inclui a dobra e a sobra, que não entram no mockup.
 */
const PAGINA_MM = { w: 210, h: 297 };
const MOLDE_MM = { w: 150, h: 210, centroX: 104.951, centroYDeBaixo: 148.343 };

/** A área do molde como fração da página (0..1, y contado de cima para baixo). */
export function caixaDoMolde(): Caixa {
  const topoDeBaixo = MOLDE_MM.centroYDeBaixo + MOLDE_MM.h / 2;
  return {
    x: (MOLDE_MM.centroX - MOLDE_MM.w / 2) / PAGINA_MM.w,
    y: (PAGINA_MM.h - topoDeBaixo) / PAGINA_MM.h,
    w: MOLDE_MM.w / PAGINA_MM.w,
    h: MOLDE_MM.h / PAGINA_MM.h,
  };
}

/** Só uma página A4 em pé (210:297, com 1% de folga) tem o molde onde esperamos. */
export function ehPaginaA4(largura: number, altura: number): boolean {
  return Math.abs(largura / altura / (PAGINA_MM.w / PAGINA_MM.h) - 1) < 0.01;
}
