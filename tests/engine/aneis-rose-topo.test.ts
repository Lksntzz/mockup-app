import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { compose } from '../../src/engine/compose';
import type { Choices, Raster } from '../../src/engine/types';
import { loadPackNode } from '../support/loadPackNode';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PACK = RAIZ + 'pack/especificacao';
const temPack = existsSync(PACK + '/mockup.json') && existsSync(PACK + '/layers/wireo-rose-topo-01.png');
const ID = 'wireo-rose-topo-01';

const TASSEIS = ['verde', 'azul', 'rosa', 'branco', 'laranja', 'nenhum'];
const ativa = (when: Record<string, string> | undefined, escolha: Choices) =>
  !when || Object.entries(when).every(([k, v]) => escolha[k as keyof Choices] === v);

function arteLisa(w: number, h: number): Raster {
  const r = newRaster(w, h);
  for (let i = 0; i < w * h; i++) r.data.set([60, 90, 200, 255], i * 4);
  return r;
}

describe.skipIf(!temPack)('anéis rose gold do topo (especificação)', () => {
  test('a camada vale para wire-o rose gold com qualquer tassel e nunca para preto/branco', async () => {
    const { pack } = await loadPackNode(PACK);
    const camada = pack.stack.find((c) => c.id === ID);
    expect(camada).toBeDefined();
    expect(camada?.when).toEqual({ wireo: 'rose-gold' });
    for (const tassel of TASSEIS) {
      expect(ativa(camada?.when, { wireo: 'rose-gold', elastico: 'preto', tassel })).toBe(true);
      for (const wireo of ['preto', 'branco']) {
        expect(ativa(camada?.when, { wireo, elastico: 'preto', tassel })).toBe(false);
      }
    }
    // fica antes das camadas de tassel (o tassel cobre os anéis, como no arquivo original)
    const i = pack.stack.findIndex((c) => c.id === ID);
    expect(i).toBeLessThan(pack.stack.findIndex((c) => c.id === 'tassel-verde-01'));
    expect(i).toBeGreaterThan(pack.stack.findIndex((c) => c.id === 'arte'));
  });

  test('os anéis do topo aparecem cobre com qualquer tassel e parecidos com o caso laranja', async () => {
    const { pack, layers } = await loadPackNode(PACK);
    const camada = pack.stack.find((c) => c.id === ID)!;
    const aneis = layers.get(camada.file as string)!;
    const arte = arteLisa(pack.artSize.width, pack.artSize.height);
    const base = { wireo: 'rose-gold', elastico: 'preto' };
    const laranja = compose(pack, layers, arte, { ...base, tassel: 'laranja' } as Choices, null, 'vt');
    const [ox, oy] = camada.offset;
    for (const tassel of TASSEIS.filter((t) => t !== 'laranja')) {
      const out = compose(pack, layers, arte, { ...base, tassel } as Choices, null, 'vt');
      let n = 0;
      let soma = 0;
      let diferentes = 0;
      // só os anéis de fato visíveis: opacos, longe do fio/tassel (x >= 65 do canvas) e dentro do topo
      for (let y = 0; y < aneis.height; y++) {
        for (let x = 0; x < aneis.width; x++) {
          if (aneis.data[(y * aneis.width + x) * 4 + 3]! < 250 || ox + x < 65) continue;
          const k = ((oy + y) * out.width + (ox + x)) * 4;
          soma += out.data[k]! - out.data[k + 2]!;
          n++;
          // o corpo de cada tassel tem forma própria e cobre a ponta de alguns anéis: tolera uma pequena fração
          if ([0, 1, 2].some((c) => Math.abs(out.data[k + c]! - laranja.data[k + c]!) > 8)) diferentes++;
        }
      }
      expect(n).toBeGreaterThan(500);
      expect(soma / n, `R-B médio com tassel ${tassel}`).toBeGreaterThan(40); // cobre: vermelho bem acima do azul
      expect(diferentes / n, `pixels diferentes do caso laranja com tassel ${tassel}`).toBeLessThan(0.06);
    }
  });

  test('com wire-o preto o tassel laranja não traz mais anéis cobre do topo', async () => {
    const { pack, layers } = await loadPackNode(PACK);
    const arte = arteLisa(pack.artSize.width, pack.artSize.height);
    const camada = pack.stack.find((c) => c.id === ID)!;
    const aneis = layers.get(camada.file as string)!;
    const out = compose(pack, layers, arte, { wireo: 'preto', elastico: 'preto', tassel: 'laranja' }, null, 'vt');
    const [ox, oy] = camada.offset;
    let cobre = 0;
    for (let y = 0; y < aneis.height; y++) {
      for (let x = 0; x < aneis.width; x++) {
        if (aneis.data[(y * aneis.width + x) * 4 + 3]! < 250 || ox + x < 65) continue;
        const k = ((oy + y) * out.width + (ox + x)) * 4;
        if (out.data[k]! - out.data[k + 2]! > 40) cobre++;
      }
    }
    expect(cobre).toBe(0);
  });
});
