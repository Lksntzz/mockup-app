import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { compose, isAvailable } from '../../src/engine/compose';
import type { Choices, Pack, Raster, StackLayer } from '../../src/engine/types';
import { loadPackNode, lerPng } from '../support/loadPackNode';

function solido(w: number, h: number, r: number, g: number, b: number, a = 255): Raster {
  const x = newRaster(w, h);
  for (let i = 0; i < w * h; i++) x.data.set([r, g, b, a], i * 4);
  return x;
}
const px = (x: Raster, cx: number, cy: number) =>
  Array.from(x.data.slice((cy * x.width + cx) * 4, (cy * x.width + cx) * 4 + 4));

const ESCOLHAS: Choices = { wireo: 'preto', elastico: 'preto', tassel: 'branco' };

function packDeTeste(stack: StackLayer[], extra: Partial<Pack> = {}): Pack {
  return {
    canvas: { width: 4, height: 4 },
    artCorners: [[0, 0], [4, 0], [4, 4], [0, 4]],
    artSize: { width: 4, height: 4 },
    artMask: { file: 'mascara.png', offset: [0, 0] },
    stack,
    options: {
      wireo: [{ id: 'preto', label: 'Preto', swatch: '#000' }, { id: 'rose-gold', label: 'Rose Gold', swatch: '#b76e79' }],
      elastico: [{ id: 'preto', label: 'Preto', swatch: '#000' }],
      tassel: [{ id: 'branco', label: 'Branco', swatch: '#fff' }],
    },
    unavailable: [],
    defaults: ESCOLHAS,
    ...extra,
  };
}
const ponto = (r: number, g: number, b: number) => solido(1, 1, r, g, b);
const camada = (id: string, x: number, y: number, when?: Partial<Choices>): StackLayer => ({
  id, role: 'fixed', file: `${id}.png`, opacity: 1, blend: 'normal', offset: [x, y], ...(when ? { when } : {}),
});
const ARTE: StackLayer = { id: 'arte', role: 'art', opacity: 1, blend: 'normal', offset: [0, 0] };

describe('compose (pack sintético)', () => {
  test('usa só as camadas do stack cujo when bate com as escolhas', () => {
    const pack = packDeTeste([
      camada('fundo', 0, 0),
      camada('w-preto', 0, 0, { wireo: 'preto' }),
      camada('w-rose', 1, 0, { wireo: 'rose-gold' }),
    ]);
    const layers = new Map<string, Raster>([
      ['fundo.png', solido(4, 4, 255, 255, 255)],
      ['w-preto.png', ponto(0, 0, 0)],
      ['w-rose.png', ponto(255, 0, 0)],
      ['mascara.png', solido(4, 4, 255, 255, 255)],
    ]);
    const art = solido(4, 4, 0, 255, 0);
    const a = compose(pack, layers, art, ESCOLHAS);
    expect(px(a, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(a, 1, 0)).toEqual([255, 255, 255, 255]);
    const b = compose(pack, layers, art, { ...ESCOLHAS, wireo: 'rose-gold' });
    expect(px(b, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(px(b, 1, 0)).toEqual([255, 0, 0, 255]);
  });

  test('a ordem do stack decide quem fica por cima da arte', () => {
    const layers = new Map<string, Raster>([
      ['v.png', ponto(255, 0, 0)],
      ['mascara.png', solido(4, 4, 255, 255, 255)],
    ]);
    const art = solido(4, 4, 0, 255, 0);
    const acima = compose(packDeTeste([ARTE, camada('v', 0, 0)]), layers, art, ESCOLHAS);
    const abaixo = compose(packDeTeste([camada('v', 0, 0), ARTE]), layers, art, ESCOLHAS);
    expect(px(acima, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(abaixo, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  test('a máscara da capa zera o alfa da arte fora da máscara e mantém dentro', () => {
    const layers = new Map<string, Raster>([['mascara.png', solido(2, 2, 255, 255, 255)]]);
    const pack = packDeTeste([ARTE], { artMask: { file: 'mascara.png', offset: [1, 1] } });
    const out = compose(pack, layers, solido(4, 4, 0, 255, 0), ESCOLHAS);
    expect(px(out, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(px(out, 2, 2)).toEqual([0, 255, 0, 255]);
    expect(px(out, 0, 0)[3]).toBe(0);
    expect(px(out, 3, 3)[3]).toBe(0);
  });

  test('isAvailable respeita a lista unavailable e recusa ids desconhecidos', () => {
    const pack = packDeTeste([], { unavailable: [{ wireo: 'rose-gold', tassel: 'branco' }] });
    expect(isAvailable(pack, ESCOLHAS)).toBe(true);
    expect(isAvailable(pack, { ...ESCOLHAS, wireo: 'rose-gold' })).toBe(false);
    expect(isAvailable(pack, { ...ESCOLHAS, elastico: 'inexistente' })).toBe(false);
  });

  test('compose recusa combinação indisponível', () => {
    const pack = packDeTeste([], { unavailable: [{ wireo: 'rose-gold' }] });
    expect(() => compose(pack, new Map(), solido(4, 4, 0, 0, 0), { ...ESCOLHAS, wireo: 'rose-gold' })).toThrow(
      'combinação indisponível',
    );
  });
});

const PACK_DIR = fileURLToPath(new URL('../../pack', import.meta.url));
const ARTE_REAL = fileURLToPath(new URL('../../fixtures/capa01.png', import.meta.url));
const temArquivos = existsSync(PACK_DIR + '/mockup.json') && existsSync(ARTE_REAL);

describe.skipIf(!temArquivos)('compose (pack real)', () => {
  test('todas as 72 combinações de options compõem sem erro', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE_REAL);
    let feitas = 0;
    let puladas = 0;
    for (const w of pack.options.wireo) {
      for (const e of pack.options.elastico) {
        for (const t of pack.options.tassel) {
          const escolha = { wireo: w.id, elastico: e.id, tassel: t.id };
          if (!isAvailable(pack, escolha)) {
            puladas++;
            continue;
          }
          const out = compose(pack, layers, art, escolha);
          expect([out.width, out.height]).toEqual([1200, 1200]);
          feitas++;
        }
      }
    }
    expect(feitas + puladas).toBe(72);
    expect(feitas).toBeGreaterThan(0);
  });

  test('compose de 1200×1200 leva menos de 400 ms (sem cache da arte)', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE_REAL);
    compose(pack, layers, { ...art, data: art.data.slice() }, pack.defaults); // aquece o JIT
    const nova = { ...art, data: art.data.slice() };
    const t0 = performance.now();
    compose(pack, layers, nova, pack.defaults);
    const ms = performance.now() - t0;
    console.log(`compose frio: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(400);
  });
});
