import type { Raster } from './types';

/** Ajuste manual da arte da frente: zoom (1 = 100%) e deslocamento em fração da largura/altura (positivo = para a direita / para baixo). */
export interface Ajuste {
  zoom: number;
  x: number;
  y: number;
}

export const AJUSTE_NULO: Ajuste = { zoom: 1, x: 0, y: 0 };
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const DESLOCAMENTO_MAX = 0.5;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Aceita só números finitos e prende nos limites: um arquivo de rascunho estragado não pode quebrar a prévia. */
export function ajusteValido(a: Partial<Ajuste> | null | undefined): Ajuste {
  const n = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  return {
    zoom: limitar(n(a?.zoom, 1), ZOOM_MIN, ZOOM_MAX),
    x: limitar(n(a?.x, 0), -DESLOCAMENTO_MAX, DESLOCAMENTO_MAX),
    y: limitar(n(a?.y, 0), -DESLOCAMENTO_MAX, DESLOCAMENTO_MAX),
  };
}

export function ajusteEhNulo(a: Ajuste | undefined): boolean {
  return !a || (a.zoom === 1 && a.x === 0 && a.y === 0);
}

export function chaveDoAjuste(a: Ajuste | undefined): string {
  return ajusteEhNulo(a) ? '' : `${a!.zoom.toFixed(4)}|${a!.x.toFixed(4)}|${a!.y.toFixed(4)}`;
}

/**
 * Devolve a arte com o mesmo tamanho, redimensionada em volta do centro e deslocada.
 * O que ficar sem arte (zoom menor que 100% ou deslocamento) fica transparente: o mockup mostra o que há por baixo.
 */
export function ajustarArte(art: Raster, ajuste: Ajuste | undefined): Raster {
  if (ajusteEhNulo(ajuste)) return art;
  const { zoom, x, y } = ajusteValido(ajuste);
  const { width: w, height: h, data } = art;
  const saida = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2 + x * w;
  const cy = h / 2 + y * h;
  for (let py = 0; py < h; py++) {
    const sy = (py + 0.5 - cy) / zoom + h / 2 - 0.5;
    for (let px = 0; px < w; px++) {
      const sx = (px + 0.5 - cx) / zoom + w / 2 - 0.5;
      if (sx < -0.5 || sy < -0.5 || sx > w - 0.5 || sy > h - 0.5) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (py * w + px) * 4;
      // interpolação bilinear; fora da borda repete o pixel da borda
      const amostra = (ix: number, iy: number, c: number) => data[(Math.min(h - 1, Math.max(0, iy)) * w + Math.min(w - 1, Math.max(0, ix))) * 4 + c]!;
      for (let c = 0; c < 4; c++) {
        const topo = amostra(x0, y0, c) * (1 - fx) + amostra(x0 + 1, y0, c) * fx;
        const base = amostra(x0, y0 + 1, c) * (1 - fx) + amostra(x0 + 1, y0 + 1, c) * fx;
        saida[o + c] = topo * (1 - fy) + base * fy;
      }
    }
  }
  return { width: w, height: h, data: saida };
}
