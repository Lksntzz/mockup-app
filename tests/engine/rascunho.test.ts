import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { compose } from '../../src/engine/compose';
import { pacoteDeRascunho } from '../../src/engine/rascunho';
import { loadPackNode, lerPng } from '../support/loadPackNode';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const tem = existsSync(RAIZ + 'pack/mockup.json') && existsSync(RAIZ + 'fixtures/capa01.png');

describe.skipIf(!tem)('prévia de rascunho (metade do tamanho)', () => {
  const ch = { wireo: 'preto', elastico: 'preto', tassel: 'branco' };
  test('tem metade do tamanho e parece com a prévia completa', async () => {
    const { pack, layers } = await loadPackNode(RAIZ + 'pack');
    const art = await lerPng(RAIZ + 'fixtures/capa01.png');
    const ajuste = { zoom: 1.2, x: 0.05, y: -0.03 };
    const cheia = compose(pack, layers, art, ch, undefined, undefined, ajuste);
    const r = pacoteDeRascunho(pack, layers);
    const meia = compose(r.pack, r.layers, art, ch, undefined, undefined, ajuste);
    expect(meia.width).toBe(Math.round(cheia.width / 2));
    expect(meia.height).toBe(Math.round(cheia.height / 2));
    // compara com a cheia reduzida: diferença média baixa
    let soma = 0;
    for (let y = 0; y < meia.height; y++) {
      for (let x = 0; x < meia.width; x++) {
        const a = (y * meia.width + x) * 4;
        const b = ((y * 2) * cheia.width + x * 2) * 4;
        for (let c = 0; c < 3; c++) soma += Math.abs((meia.data[a + c] as number) - (cheia.data[b + c] as number));
      }
    }
    expect(soma / (meia.width * meia.height * 3)).toBeLessThan(12);
  });
  test('a segunda chamada reaproveita o que já foi reduzido', async () => {
    const { pack, layers } = await loadPackNode(RAIZ + 'pack');
    expect(pacoteDeRascunho(pack, layers)).toBe(pacoteDeRascunho(pack, layers));
  });
  test('é bem mais rápido que a prévia completa', async () => {
    const { pack, layers } = await loadPackNode(RAIZ + 'pack');
    const art = await lerPng(RAIZ + 'fixtures/capa01.png');
    const r = pacoteDeRascunho(pack, layers);
    const tempo = (f: () => unknown) => { const a = performance.now(); f(); return performance.now() - a; };
    compose(r.pack, r.layers, art, ch, undefined, undefined, { zoom: 1.1, x: 0, y: 0 });
    compose(pack, layers, art, ch, undefined, undefined, { zoom: 1.1, x: 0, y: 0 });
    const rapido = tempo(() => compose(r.pack, r.layers, art, ch, undefined, undefined, { zoom: 1.1, x: 0.01, y: 0 }));
    const lento = tempo(() => compose(pack, layers, art, ch, undefined, undefined, { zoom: 1.1, x: 0.01, y: 0 }));
    require('node:fs').appendFileSync('/tmp/perf-rascunho.txt', `rascunho ${Math.round(rapido)} ms, cheia ${Math.round(lento)} ms\n`);
    expect(rapido).toBeLessThan(lento * 0.6);
  });
});
