import type { Pack, Pt, Raster } from './types';

/** Reduz a imagem pela metade (média de blocos). */
function metade(r: Raster): Raster {
  const w = Math.max(1, Math.round(r.width / 2));
  const h = Math.max(1, Math.round(r.height / 2));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ya = Math.min(r.height - 1, y * 2);
    const yb = Math.min(r.height - 1, y * 2 + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.min(r.width - 1, x * 2);
      const xb = Math.min(r.width - 1, x * 2 + 1);
      const o = (y * w + x) * 4;
      const i1 = (ya * r.width + xa) * 4;
      const i2 = (ya * r.width + xb) * 4;
      const i3 = (yb * r.width + xa) * 4;
      const i4 = (yb * r.width + xb) * 4;
      for (let c = 0; c < 4; c++) data[o + c] = ((r.data[i1 + c] as number) + (r.data[i2 + c] as number) + (r.data[i3 + c] as number) + (r.data[i4 + c] as number)) / 4;
    }
  }
  return { width: w, height: h, data };
}

const metadePonto = (p: Pt): Pt => [p[0] / 2, p[1] / 2];
const metadeInteira = (p: Pt): Pt => [Math.round(p[0] / 2), Math.round(p[1] / 2)];

const guardados = new WeakMap<Pack, { layers: Map<string, Raster>; resultado: { pack: Pack; layers: Map<string, Raster> } }>();

/**
 * Versão do pacote com metade do tamanho (camadas, posições e cantos), só para a prévia enquanto a arte é arrastada:
 * custa cerca de um quarto do cálculo. Quando o mouse para, a prévia completa substitui esta.
 */
export function pacoteDeRascunho(pack: Pack, layers: Map<string, Raster>): { pack: Pack; layers: Map<string, Raster> } {
  const g = guardados.get(pack);
  if (g && g.layers === layers) return g.resultado;
  const camadas = new Map<string, Raster>();
  for (const [nome, r] of layers) camadas.set(nome, metade(r));
  const reduzido: Pack = {
    ...pack,
    canvas: { width: Math.round(pack.canvas.width / 2), height: Math.round(pack.canvas.height / 2) },
    artCorners: pack.artCorners.map(metadePonto) as Pack['artCorners'],
    artMask: { ...pack.artMask, offset: metadeInteira(pack.artMask.offset) },
    ...(pack.backArt
      ? { backArt: { ...pack.backArt, corners: pack.backArt.corners.map(metadePonto) as Pack['artCorners'], mask: { ...pack.backArt.mask, offset: metadeInteira(pack.backArt.mask.offset) } } }
      : {}),
    stack: pack.stack.map((c) => ({
      ...c,
      offset: metadeInteira(c.offset),
      ...(c.source ? { source: { x: c.source.x / 2, y: c.source.y / 2, width: c.source.width / 2, height: c.source.height / 2 } } : {}),
    })),
  };
  const resultado = { pack: reduzido, layers: camadas };
  guardados.set(pack, { layers, resultado });
  return resultado;
}
