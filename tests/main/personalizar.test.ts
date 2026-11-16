import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { acharRecursos } from '../../src/main/personalizar';

let pasta: string;
beforeEach(async () => { pasta = await mkdtemp(join(tmpdir(), 'pers-')); });
afterEach(async () => { await rm(pasta, { recursive: true, force: true }); });

describe('acharRecursos', () => {
  test('sem pasta ou pasta inexistente: motivo em português', async () => {
    expect((await acharRecursos(undefined)).ok).toBe(false);
    const r = await acharRecursos(join(pasta, 'nao-existe'));
    expect(r.ok).toBe(false);
  });
  test('lista o que falta', async () => {
    await writeFile(join(pasta, 'arte base.png'), 'x');
    const r = await acharRecursos(pasta);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain('Cream Candy');
      expect(r.motivo).toContain('Century751');
      expect(r.motivo).not.toContain('arte base');
    }
  });
  test('acha os três pelo trecho do nome (maiúsculas não importam) e devolve URLs file://', async () => {
    await writeFile(join(pasta, 'ARTE.PNG'), 'x');
    await writeFile(join(pasta, 'CREAM_CANDY.OTF'), 'x');
    await writeFile(join(pasta, 'CENTURY751_BT_ROMAN.TTF'), 'x');
    await mkdir(join(pasta, 'arte-pasta.png'));
    const r = await acharRecursos(pasta);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recursos.arteUrl.startsWith('file://')).toBe(true);
      expect(r.recursos.fonteNomeUrl.toLowerCase()).toContain('cream_candy.otf');
    }
  });
  test('arquivo vazio não conta', async () => {
    await writeFile(join(pasta, 'arte.png'), '');
    await writeFile(join(pasta, 'cream.otf'), 'x');
    await writeFile(join(pasta, 'century.ttf'), 'x');
    expect((await acharRecursos(pasta)).ok).toBe(false);
  });
});
