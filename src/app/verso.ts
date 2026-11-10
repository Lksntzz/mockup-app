import type { Choices, Pack, Raster } from '../engine/types';
import { coverCrop } from '../pdf/fit';

/** Cores da capa → cores que o PSD do verso tem: rose gold e laranja não existem lá e viram branco; tassel não aparece. */
export function escolhasDoVerso(pack: Pack, c: Choices): Choices {
  const tem = (acc: keyof Choices, id: string) => pack.options[acc].some((o) => o.id === id);
  return {
    wireo: tem('wireo', c.wireo) ? c.wireo : 'branco',
    elastico: tem('elastico', c.elastico) ? c.elastico : 'branco',
    tassel: tem('tassel', 'nenhum') ? 'nenhum' : (pack.options.tassel[0]?.id ?? 'nenhum'),
  };
}

const recortes = new WeakMap<Raster, Map<number, Raster>>();

/** A mesma imagem na proporção pedida; guarda o resultado para a prévia não refazer o recorte a cada troca de cor. */
export function paraRazao(r: Raster, razao: number): Raster {
  if (Math.abs(r.width / r.height / razao - 1) < 0.005) return r;
  let porRazao = recortes.get(r);
  if (!porRazao) recortes.set(r, (porRazao = new Map()));
  let pronto = porRazao.get(razao);
  if (!pronto) porRazao.set(razao, (pronto = coverCrop(r, razao)));
  return pronto;
}
