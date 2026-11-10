import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { describe, expect, test } from 'vitest';
import { compose } from '../../src/engine/compose';
import { loadPackNode, lerPng } from '../support/loadPackNode';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const COMBOS: Record<string, { wireo: string; elastico: string; tassel: string }> = {
  'preto-preto-branco': { wireo: 'preto', elastico: 'preto', tassel: 'branco' },
  'rose-gold-rosa-rosa': { wireo: 'rose-gold', elastico: 'rosa', tassel: 'rosa' },
  'branco-azul-verde': { wireo: 'branco', elastico: 'azul', tassel: 'verde' },
};
const MAX_PIXELS_DIFERENTES = 7200; // 0,5% de 1200×1200
const temArquivos = existsSync(RAIZ + 'pack/mockup.json') && existsSync(RAIZ + 'fixtures/capa01.png');

describe.skipIf(!temArquivos)('fidelidade ao Photoshop', () => {
  for (const [nome, escolha] of Object.entries(COMBOS)) {
    test(`combinação ${nome} fica dentro da tolerância`, async () => {
      const gabarito = `${RAIZ}fixtures/gabaritos/${nome}.png`;
      const referencia = existsSync(gabarito) ? gabarito : `${RAIZ}fixtures/ref/${nome}.png`;
      if (referencia !== gabarito) {
        console.warn('AVISO: usando referência de desenvolvimento, não o gabarito do Photoshop');
      }
      const { pack, layers } = await loadPackNode(RAIZ + 'pack');
      const out = compose(pack, layers, await lerPng(RAIZ + 'fixtures/capa01.png'), escolha);
      const ref = await lerPng(referencia);
      expect([ref.width, ref.height]).toEqual([out.width, out.height]);
      const diferentes = pixelmatch(out.data, ref.data, undefined, out.width, out.height, { threshold: 0.1 });
      console.log(`${nome}: ${diferentes} pixels diferentes (limite ${MAX_PIXELS_DIFERENTES}) — ref: ${referencia.split('/').slice(-2).join('/')}`);
      expect(diferentes).toBeLessThanOrEqual(MAX_PIXELS_DIFERENTES);
    });
  }

  test('o teste detecta combinação errada: preto-preto-branco contra a referência de branco-azul-verde passa do limite', async () => {
    const { pack, layers } = await loadPackNode(RAIZ + 'pack');
    const out = compose(pack, layers, await lerPng(RAIZ + 'fixtures/capa01.png'), COMBOS['preto-preto-branco']!);
    const ref = await lerPng(`${RAIZ}fixtures/ref/branco-azul-verde.png`);
    const diferentes = pixelmatch(out.data, ref.data, undefined, out.width, out.height, { threshold: 0.1 });
    expect(diferentes).toBeGreaterThan(MAX_PIXELS_DIFERENTES);
  });
});
