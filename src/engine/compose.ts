import { blendOver, newRaster } from './blend';
import type { Accessory, Choices, Pack, Raster } from './types';
import { warpToQuad } from './warp';

const ACESSORIOS: Accessory[] = ['wireo', 'elastico', 'tassel'];

/** Falso se algum id não existe nas opções do pacote ou se a combinação está na lista `unavailable`. */
export function isAvailable(pack: Pack, choices: Choices): boolean {
  for (const acc of ACESSORIOS) {
    if (!pack.options[acc].some((o) => o.id === choices[acc])) return false;
  }
  return !pack.unavailable.some((u) => {
    const pares = Object.entries(u);
    return pares.length > 0 && pares.every(([k, v]) => choices[k as Accessory] === v);
  });
}

function camadaOuErro(layers: Map<string, Raster>, arquivo: string): Raster {
  const r = layers.get(arquivo);
  if (!r) throw new Error(`camada ausente no pacote: ${arquivo}`);
  return r;
}

/** Arte deformada para a capa e recortada pela máscara. */
function prepararArte(pack: Pack, layers: Map<string, Raster>, art: Raster): Raster {
  const warped = warpToQuad(art, pack.artCorners, pack.canvas);
  const mascara = camadaOuErro(layers, pack.artMask.file);
  const [ox, oy] = pack.artMask.offset;
  for (let y = 0; y < warped.height; y++) {
    for (let x = 0; x < warped.width; x++) {
      const mx = x - ox;
      const my = y - oy;
      const dentro = mx >= 0 && my >= 0 && mx < mascara.width && my < mascara.height;
      const valor = dentro ? (mascara.data[(my * mascara.width + mx) * 4] as number) : 0;
      const i = (y * warped.width + x) * 4 + 3;
      warped.data[i] = Math.round(((warped.data[i] as number) * valor) / 255);
    }
  }
  return warped;
}

// A prévia refaz a composição a cada troca de cor com a mesma arte: guarda a arte já preparada.
const cacheDaArte = new WeakMap<Raster, { pack: Pack; pronta: Raster }>();

function arteProntaDe(pack: Pack, layers: Map<string, Raster>, art: Raster): Raster {
  const guardada = cacheDaArte.get(art);
  if (guardada && guardada.pack === pack) return guardada.pronta;
  const pronta = prepararArte(pack, layers, art);
  cacheDaArte.set(art, { pack, pronta });
  return pronta;
}

/** Monta o mockup: percorre o stack de baixo para cima e pula as camadas cujo `when` não bate. */
export function compose(pack: Pack, layers: Map<string, Raster>, art: Raster, choices: Choices): Raster {
  if (!isAvailable(pack, choices)) throw new Error('combinação indisponível');
  const out = newRaster(pack.canvas.width, pack.canvas.height);
  const arteDeformada = arteProntaDe(pack, layers, art);

  for (const camada of pack.stack) {
    if (camada.when && !Object.entries(camada.when).every(([k, v]) => choices[k as Accessory] === v)) continue;
    if (camada.role === 'art') {
      blendOver(out, arteDeformada, [0, 0], camada.opacity, camada.blend);
    } else {
      blendOver(out, camadaOuErro(layers, camada.file as string), camada.offset, camada.opacity, camada.blend);
    }
  }
  return out;
}
