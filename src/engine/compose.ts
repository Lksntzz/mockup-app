import { blendOver, newRaster } from './blend';
import type { Accessory, Choices, Pack, Raster, StackLayer } from './types';
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

/** Arte deformada para o quadrilátero e recortada por um canal da máscara (vermelho na capa, alfa na contra capa). */
function prepararArte(
  pack: Pack,
  layers: Map<string, Raster>,
  art: Raster,
  corners: Pack['artCorners'],
  mask: { file: string; offset: [number, number] },
  canal: 0 | 3,
): Raster {
  const warped = warpToQuad(art, corners, pack.canvas);
  const mascara = camadaOuErro(layers, mask.file);
  const [ox, oy] = mask.offset;
  for (let y = 0; y < warped.height; y++) {
    for (let x = 0; x < warped.width; x++) {
      const mx = x - ox;
      const my = y - oy;
      const dentro = mx >= 0 && my >= 0 && mx < mascara.width && my < mascara.height;
      const valor = dentro ? (mascara.data[(my * mascara.width + mx) * 4 + canal] as number) : 0;
      const i = (y * warped.width + x) * 4 + 3;
      warped.data[i] = Math.round(((warped.data[i] as number) * valor) / 255);
    }
  }
  return warped;
}

// A prévia refaz a composição a cada troca de cor com a mesma arte: guarda a arte já preparada.
const cacheDaFrente = new WeakMap<Raster, { pack: Pack; pronta: Raster }>();
const cacheDoVerso = new WeakMap<Raster, { pack: Pack; pronta: Raster }>();

function arteProntaDe(pack: Pack, layers: Map<string, Raster>, art: Raster): Raster {
  const guardada = cacheDaFrente.get(art);
  if (guardada && guardada.pack === pack) return guardada.pronta;
  const pronta = prepararArte(pack, layers, art, pack.artCorners, pack.artMask, 0);
  cacheDaFrente.set(art, { pack, pronta });
  return pronta;
}

function versoProntoDe(pack: Pack, layers: Map<string, Raster>, verso: Raster): Raster | null {
  if (!pack.backArt) return null;
  const guardada = cacheDoVerso.get(verso);
  if (guardada && guardada.pack === pack) return guardada.pronta;
  const pronta = prepararArte(pack, layers, verso, pack.backArt.corners, pack.backArt.mask, 3);
  cacheDoVerso.set(verso, { pack, pronta });
  return pronta;
}

/** Recorta `fonte` de `out`, ajusta ao tamanho da máscara (bilinear) e usa o alfa da máscara como formato do círculo. */
function recorteDoZoom(out: Raster, fonte: NonNullable<StackLayer['source']>, mascara: Raster): Raster {
  const dst = newRaster(mascara.width, mascara.height);
  const sx = fonte.width / mascara.width;
  const sy = fonte.height / mascara.height;
  for (let y = 0; y < dst.height; y++) {
    const fy = Math.min(Math.max(fonte.y + (y + 0.5) * sy - 0.5, 0), out.height - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, out.height - 1);
    const ty = fy - y0;
    for (let x = 0; x < dst.width; x++) {
      const fx = Math.min(Math.max(fonte.x + (x + 0.5) * sx - 0.5, 0), out.width - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, out.width - 1);
      const tx = fx - x0;
      const o = (y * dst.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = out.data[(y0 * out.width + x0) * 4 + c] as number;
        const b = out.data[(y0 * out.width + x1) * 4 + c] as number;
        const d = out.data[(y1 * out.width + x0) * 4 + c] as number;
        const e = out.data[(y1 * out.width + x1) * 4 + c] as number;
        dst.data[o + c] = Math.round((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty);
      }
      dst.data[o + 3] = mascara.data[o + 3] as number;
    }
  }
  return dst;
}

// Trocar só uma cor não precisa refazer o fundo, a contra capa e a arte: guarda o desenho parcial nos pontos
// onde cada acessório começa e retoma dali. Um cache por pacote, com poucos desenhos guardados (cada um tem 5,5 MB).
const MAX_DESENHOS_GUARDADOS = 3;
interface CacheDoPacote {
  art: Raster;
  verso: Raster | null;
  layers: Map<string, Raster>;
  variante: string | undefined;
  pontos: Map<string, Raster>;
}
let caches = new WeakMap<Pack, CacheDoPacote>();
const paradas = new WeakMap<Pack, { idx: number; acessorios: Accessory[] }[]>();

/** Para testes: esquece tudo o que a prévia guardou. */
export function limparCacheDoCompose(): void {
  caches = new WeakMap();
}

/** Índices do stack onde cada acessório aparece pela primeira vez, com os acessórios que já apareceram antes. */
function pontosDeParada(pack: Pack): { idx: number; acessorios: Accessory[] }[] {
  const guardado = paradas.get(pack);
  if (guardado) return guardado;
  const primeiro = new Map<Accessory, number>();
  pack.stack.forEach((c, i) => {
    for (const k of Object.keys(c.when ?? {}) as Accessory[]) if (!primeiro.has(k)) primeiro.set(k, i);
  });
  const indices = [...new Set(primeiro.values())].filter((i) => i > 0).sort((a, b) => a - b);
  const pontos = indices.map((idx) => ({ idx, acessorios: ACESSORIOS.filter((a) => (primeiro.get(a) ?? Infinity) < idx) }));
  paradas.set(pack, pontos);
  return pontos;
}

const chaveDoPonto = (idx: number, acessorios: Accessory[], choices: Choices): string =>
  `${idx}|${acessorios.map((a) => choices[a]).join(',')}`;

function copia(r: Raster): Raster {
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) };
}

/** Monta o mockup: percorre o stack de baixo para cima e pula as camadas cujo `when` não bate. */
export function compose(pack: Pack, layers: Map<string, Raster>, art: Raster, choices: Choices, verso?: Raster | null, variante?: string): Raster {
  if (!isAvailable(pack, choices)) throw new Error('combinação indisponível');
  const arteDeformada = arteProntaDe(pack, layers, art);
  const versoDeformado = verso ? versoProntoDe(pack, layers, verso) : null;

  let cache = caches.get(pack);
  if (!cache || cache.art !== art || cache.verso !== (verso ?? null) || cache.layers !== layers || cache.variante !== variante) {
    cache = { art, verso: verso ?? null, layers, variante, pontos: new Map() };
    caches.set(pack, cache);
  }
  const paradasDoPack = pontosDeParada(pack);
  const paradaPorIndice = new Map(paradasDoPack.map((p) => [p.idx, p]));

  // retoma do ponto guardado mais adiantado que ainda vale para estas escolhas
  let out: Raster | null = null;
  let inicio = 0;
  for (let k = paradasDoPack.length - 1; k >= 0; k--) {
    const p = paradasDoPack[k] as { idx: number; acessorios: Accessory[] };
    const guardado = cache.pontos.get(chaveDoPonto(p.idx, p.acessorios, choices));
    if (guardado) {
      out = copia(guardado);
      inicio = p.idx;
      break;
    }
  }
  if (!out) out = newRaster(pack.canvas.width, pack.canvas.height);

  for (let i = inicio; i < pack.stack.length; i++) {
    const parada = paradaPorIndice.get(i);
    if (parada) {
      const chave = chaveDoPonto(parada.idx, parada.acessorios, choices);
      if (!cache.pontos.has(chave)) {
        cache.pontos.set(chave, copia(out));
        if (cache.pontos.size > MAX_DESENHOS_GUARDADOS) cache.pontos.delete(cache.pontos.keys().next().value as string);
      }
    }
    const camada = pack.stack[i] as StackLayer;
    if (camada.when && !Object.entries(camada.when).every(([k, v]) => choices[k as Accessory] === v)) continue;
    if (camada.variant !== undefined && camada.variant !== variante) continue;
    if (camada.role === 'zoom') {
      if (!camada.source) throw new Error(`zoom sem origem: ${camada.id}`);
      const circulo = recorteDoZoom(out, camada.source, camadaOuErro(layers, camada.file as string));
      blendOver(out, circulo, camada.offset, camada.opacity, camada.blend);
    } else if (camada.role === 'back-art') {
      // sem verso (PDF só com páginas ímpares) a contra capa fica como o PSD deixa
      if (versoDeformado) blendOver(out, versoDeformado, [0, 0], camada.opacity, camada.blend);
    } else if (camada.role === 'art') {
      blendOver(out, arteDeformada, [0, 0], camada.opacity, camada.blend);
    } else {
      blendOver(out, camadaOuErro(layers, camada.file as string), camada.offset, camada.opacity, camada.blend);
    }
  }
  return out;
}
