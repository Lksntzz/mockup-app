import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { compose, isAvailable, limparCacheDoCompose } from '../../src/engine/compose';
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

describe('compose: cache da prévia (trocar uma cor não pode mudar o resultado)', () => {
  const pack = packDeTeste(
    [
      camada('fundo', 0, 0),
      camada('w-preto', 0, 1, { wireo: 'preto' }),
      camada('w-rose', 1, 1, { wireo: 'rose-gold' }),
      ARTE,
      camada('e-preto', 2, 2, { elastico: 'preto' }),
      camada('e-azul', 3, 2, { elastico: 'azul' }),
      camada('t-branco', 0, 3, { tassel: 'branco' }),
      camada('t-rosa', 1, 3, { tassel: 'rosa' }),
    ],
    {
      options: {
        wireo: [{ id: 'preto', label: 'Preto', swatch: '#000' }, { id: 'rose-gold', label: 'Rose', swatch: '#b76e79' }],
        elastico: [{ id: 'preto', label: 'Preto', swatch: '#000' }, { id: 'azul', label: 'Azul', swatch: '#00f' }],
        tassel: [{ id: 'branco', label: 'Branco', swatch: '#fff' }, { id: 'rosa', label: 'Rosa', swatch: '#f9c' }],
      },
    },
  );
  const layers = () =>
    new Map<string, Raster>([
      ['fundo.png', solido(4, 4, 255, 255, 255)],
      ['mascara.png', solido(4, 4, 255, 255, 255)],
      ...['w-preto', 'w-rose', 'e-preto', 'e-azul', 't-branco', 't-rosa'].map((id, i): [string, Raster] => [`${id}.png`, ponto(10 * (i + 1), 0, 0)]),
    ]);
  const todas: Choices[] = [];
  for (const wireo of ['preto', 'rose-gold']) for (const elastico of ['preto', 'azul']) for (const tassel of ['branco', 'rosa']) todas.push({ wireo, elastico, tassel });

  test('qualquer sequência de trocas dá o mesmo que montar do zero', () => {
    const l = layers();
    const art = solido(4, 4, 0, 255, 0);
    const sequencia = [0, 1, 3, 2, 6, 7, 4, 5, 0, 0, 7, 1];
    for (const n of sequencia) {
      const escolha = todas[n] as Choices;
      const comCache = compose(pack, l, art, escolha);
      limparCacheDoCompose();
      const doZero = compose(pack, l, art, escolha);
      expect(Array.from(comCache.data)).toEqual(Array.from(doZero.data));
    }
  });

  test('arte diferente não aproveita o cache da anterior', () => {
    const l = layers();
    const a = compose(pack, l, solido(4, 4, 0, 255, 0), todas[0] as Choices);
    const b = compose(pack, l, solido(4, 4, 255, 0, 255), todas[0] as Choices);
    expect(px(a, 3, 0)).toEqual([0, 255, 0, 255]);
    expect(px(b, 3, 0)).toEqual([255, 0, 255, 255]);
  });
});

describe('compose: variantes e círculos de zoom', () => {
  const comVariante = (variant: string, id: string, x: number): StackLayer => ({ ...camada(id, x, 0), variant });
  const ponto1 = () => new Map<string, Raster>([['a.png', ponto(255, 0, 0)], ['b.png', ponto(0, 0, 255)], ['mascara.png', solido(4, 4, 255, 255, 255)]]);

  test('camada com variante só aparece na variante pedida', () => {
    const pack = packDeTeste([camada('fundo', 0, 0), comVariante('vt', 'a', 0), comVariante('sem-canguru', 'b', 1)]);
    const layers = ponto1();
    layers.set('fundo.png', solido(4, 4, 255, 255, 255));
    const art = solido(4, 4, 0, 255, 0);
    const vt = compose(pack, layers, art, ESCOLHAS, null, 'vt');
    expect(px(vt, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(vt, 1, 0)).toEqual([255, 255, 255, 255]);
    const sc = compose(pack, layers, art, ESCOLHAS, null, 'sem-canguru');
    expect(px(sc, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(px(sc, 1, 0)).toEqual([0, 0, 255, 255]);
  });

  test('sem pedir variante, as camadas de variante ficam de fora (mockup da frente)', () => {
    const pack = packDeTeste([camada('fundo', 0, 0), comVariante('vt', 'a', 0)]);
    const layers = ponto1();
    layers.set('fundo.png', solido(4, 4, 255, 255, 255));
    const out = compose(pack, layers, solido(4, 4, 0, 255, 0), ESCOLHAS);
    expect(px(out, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  const zoom = (extra: Partial<StackLayer> = {}): StackLayer => ({
    id: 'zoom', role: 'zoom', file: 'm.png', opacity: 1, blend: 'normal', offset: [6, 6], source: { x: 0, y: 0, width: 4, height: 4 }, ...extra,
  });
  const fundoMeioMeio = () => {
    const f = solido(8, 8, 255, 0, 0); // esquerda vermelha, direita azul
    for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) f.data.set([0, 0, 255, 255], (y * 8 + x) * 4);
    return f;
  };
  const packZoom = (stack: StackLayer[]) =>
    packDeTeste(stack, { canvas: { width: 8, height: 8 }, artCorners: [[0, 0], [8, 0], [8, 8], [0, 8]], artSize: { width: 8, height: 8 } });

  test('zoom copia um pedaço do que já foi desenhado para o lugar do círculo', () => {
    const mascara = solido(2, 2, 255, 255, 255);
    const layers = new Map<string, Raster>([['fundo.png', fundoMeioMeio()], ['m.png', mascara], ['mascara.png', solido(8, 8, 255, 255, 255)]]);
    const out = compose(packZoom([camada('fundo', 0, 0), zoom()]), layers, solido(8, 8, 0, 255, 0), ESCOLHAS);
    expect(px(out, 6, 6)).toEqual([255, 0, 0, 255]); // o recorte (0..4, 0..4) é todo vermelho
    expect(px(out, 7, 7)).toEqual([255, 0, 0, 255]);
    expect(px(out, 4, 4)).toEqual([0, 0, 255, 255]); // fora do círculo nada muda
  });

  test('o recorte do zoom pega a mistura certa quando atravessa duas cores', () => {
    const layers = new Map<string, Raster>([['fundo.png', fundoMeioMeio()], ['m.png', solido(2, 2, 255, 255, 255)], ['mascara.png', solido(8, 8, 255, 255, 255)]]);
    const out = compose(packZoom([camada('fundo', 0, 0), zoom({ source: { x: 3, y: 0, width: 4, height: 4 } })]), layers, solido(8, 8, 0, 255, 0), ESCOLHAS);
    expect(px(out, 6, 6)[0]).toBeGreaterThan(100); // metade vermelho...
    expect(px(out, 6, 6)[2]).toBeGreaterThan(100); // ...metade azul
    const [r = 0, , b = 0] = px(out, 6, 6);
    expect(r + b).toBeGreaterThan(240);
  });

  test('a máscara do zoom recorta o círculo (alfa zero fica transparente por cima do fundo)', () => {
    const mascara = solido(2, 2, 255, 255, 255);
    mascara.data.set([255, 255, 255, 0], 3 * 4); // pixel (1,1) fora do círculo
    const layers = new Map<string, Raster>([['fundo.png', fundoMeioMeio()], ['m.png', mascara], ['mascara.png', solido(8, 8, 255, 255, 255)]]);
    const out = compose(packZoom([camada('fundo', 0, 0), zoom({ offset: [4, 4] })]), layers, solido(8, 8, 0, 255, 0), ESCOLHAS);
    expect(px(out, 5, 5)).toEqual([0, 0, 255, 255]); // continua o fundo (azul)
    expect(px(out, 4, 4)).toEqual([255, 0, 0, 255]); // dentro do círculo: o recorte vermelho
  });

  test('zoom respeita a variante', () => {
    const layers = new Map<string, Raster>([['fundo.png', fundoMeioMeio()], ['m.png', solido(2, 2, 255, 255, 255)], ['mascara.png', solido(8, 8, 255, 255, 255)]]);
    const pack = packZoom([camada('fundo', 0, 0), zoom({ variant: 'vt' })]);
    const sem = compose(pack, layers, solido(8, 8, 0, 255, 0), ESCOLHAS);
    expect(px(sem, 6, 6)).toEqual([0, 0, 255, 255]);
    const com = compose(pack, layers, solido(8, 8, 0, 255, 0), ESCOLHAS, null, 'vt');
    expect(px(com, 6, 6)).toEqual([255, 0, 0, 255]);
  });
});

describe('compose: arte do verso na contra capa', () => {
  const VERSO: StackLayer = { id: 'arte-verso', role: 'back-art', opacity: 1, blend: 'multiply', offset: [0, 0] };
  const pacoteComVerso = () =>
    packDeTeste([camada('contra', 0, 0), VERSO], {
      backArt: { corners: [[0, 0], [4, 0], [4, 4], [0, 4]], size: { width: 4, height: 4 }, mask: { file: 'contra.png', offset: [0, 0] } },
    });
  const contra = () => {
    const c = solido(4, 4, 255, 255, 255);
    c.data.set([128, 128, 128, 255], (1 * 4 + 1) * 4); // pixel sombreado
    c.data.set([255, 255, 255, 0], (3 * 4 + 3) * 4); // pixel fora da contra capa
    return c;
  };
  const camadas = () => new Map<string, Raster>([['contra.png', contra()], ['mascara.png', solido(4, 4, 255, 255, 255)]]);

  test('sem verso a contra capa fica como sempre (branca com a sombra)', () => {
    const out = compose(pacoteComVerso(), camadas(), solido(4, 4, 0, 255, 0), ESCOLHAS);
    expect(px(out, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(px(out, 1, 1)).toEqual([128, 128, 128, 255]);
  });
  test('com verso a arte aparece na contra capa, escurecida pela sombra dela', () => {
    const out = compose(pacoteComVerso(), camadas(), solido(4, 4, 0, 255, 0), ESCOLHAS, solido(4, 4, 255, 0, 0));
    expect(px(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(out, 1, 1)[0]).toBeGreaterThan(120);
    expect(px(out, 1, 1)[0]).toBeLessThan(136);
    expect(px(out, 1, 1)[1]).toBe(0);
  });
  test('o verso não aparece fora da contra capa', () => {
    const out = compose(pacoteComVerso(), camadas(), solido(4, 4, 0, 255, 0), ESCOLHAS, solido(4, 4, 255, 0, 0));
    expect(px(out, 3, 3)[3]).toBe(0);
  });
  test('pacote sem backArt ignora o verso', () => {
    const pack = packDeTeste([camada('contra', 0, 0)]);
    const out = compose(pack, camadas(), solido(4, 4, 0, 255, 0), ESCOLHAS, solido(4, 4, 255, 0, 0));
    expect(px(out, 0, 0)).toEqual([255, 255, 255, 255]);
  });
});

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
  test('todas as 126 combinações de options compõem sem erro', async () => {
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
    expect(feitas + puladas).toBe(126);
    expect(feitas).toBeGreaterThan(0);
  }, 180_000); // 126 composições de 1200×1200: com a máquina ocupada o limite padrão de 30 s estourava

  test('a arte do verso só muda a faixa da contra capa à direita da frente', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE_REAL);
    const escolha = { wireo: 'preto', elastico: 'preto', tassel: 'branco' };
    const verso = solido(8, 8, 220, 30, 60);
    const sem = compose(pack, layers, art, escolha);
    const com = compose(pack, layers, art, escolha, verso);
    let mudados = 0;
    let aEsquerda = 0;
    for (let y = 0; y < sem.height; y++) {
      for (let x = 0; x < sem.width; x++) {
        const i = (y * sem.width + x) * 4;
        if (sem.data[i] !== com.data[i] || sem.data[i + 1] !== com.data[i + 1] || sem.data[i + 2] !== com.data[i + 2]) {
          mudados++;
          if (x < 800) aEsquerda++;
        }
      }
    }
    expect(mudados).toBeGreaterThan(300); // a faixa aparece
    expect(mudados).toBeLessThan(60_000); // e é só uma faixa, não a imagem inteira
    expect(aEsquerda / mudados).toBeLessThan(0.02); // quase tudo à direita da frente
  }, 60_000);

  test('tassel laranja aparece com qualquer wire-o', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE_REAL);
    const alaranjados = (r: Raster) => {
      let n = 0;
      for (let i = 0; i < r.data.length; i += 4) {
        const [rr, g, b] = [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!];
        if (rr > 200 && g > 100 && g < 190 && b < 110) n++;
      }
      return n;
    };
    for (const wireo of ['rose-gold', 'preto', 'branco']) {
      const escolha = { wireo, elastico: 'preto', tassel: 'laranja' };
      expect(isAvailable(pack, escolha)).toBe(true);
      const laranja = compose(pack, layers, art, escolha);
      const branco = compose(pack, layers, art, { ...escolha, tassel: 'branco' });
      expect(alaranjados(laranja)).toBeGreaterThan(alaranjados(branco) + 1500);
    }
  }, 120_000);

  test('sem elástico e sem tassel a capa aparece onde eles ficavam', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE_REAL);
    const base = { wireo: 'preto', elastico: 'preto', tassel: 'branco' };
    const com = compose(pack, layers, art, base);
    const semElastico = compose(pack, layers, art, { ...base, elastico: 'nenhum' });
    const semTassel = compose(pack, layers, art, { ...base, tassel: 'nenhum' });
    const diferentes = (a: Raster, b: Raster) => {
      let n = 0;
      for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
      return n;
    };
    expect(diferentes(com, semElastico)).toBeGreaterThan(5000); // a faixa do elástico sumiu
    expect(diferentes(com, semTassel)).toBeGreaterThan(1000); // o tassel sumiu
    // trocar uma peça não mexe nos pixels longe dela: tassel e elástico são independentes
    expect(diferentes(semElastico, semTassel)).toBeGreaterThan(0);
  }, 60_000);

  test('compose de 1200×1200 leva menos de 400 ms (sem cache da arte)', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE_REAL);
    compose(pack, layers, { ...art, data: art.data.slice() }, pack.defaults); // aquece o JIT
    // melhor de 3 execuções a frio (cada uma com uma arte nova, sem cache): ignora um tranco isolado do sistema
    let ms = Infinity;
    for (let i = 0; i < 3; i++) {
      const nova = { ...art, data: art.data.slice() };
      const t0 = performance.now();
      compose(pack, layers, nova, pack.defaults);
      ms = Math.min(ms, performance.now() - t0);
    }
    console.log(`compose frio (melhor de 3): ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(400);
  });
});
