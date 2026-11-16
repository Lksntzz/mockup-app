import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { acharRecursos } from '../../src/main/personalizar';

let pasta: string;
beforeEach(async () => { pasta = await mkdtemp(join(tmpdir(), 'pers-')); });
afterEach(async () => { await rm(pasta, { recursive: true, force: true }); });

describe('acharRecursos (a arte escolhida pelo operador)', () => {
  test('sem arte ou arquivo inexistente: motivo em português', async () => {
    const a = await acharRecursos(undefined);
    expect(a.ok).toBe(false);
    const r = await acharRecursos(join(pasta, 'nao-existe.png'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('Não achei');
  });
  test('só aceita PNG ou JPG (maiúsculas não importam) e devolve URL file://', async () => {
    await writeFile(join(pasta, 'ARTE.PNG'), 'x');
    await writeFile(join(pasta, 'b.JPG'), 'x');
    await writeFile(join(pasta, 'c.pdf'), 'x');
    const r = await acharRecursos(join(pasta, 'ARTE.PNG'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recursos.arteUrl.startsWith('file://')).toBe(true);
    expect((await acharRecursos(join(pasta, 'b.JPG'))).ok).toBe(true);
    const pdf = await acharRecursos(join(pasta, 'c.pdf'));
    expect(pdf.ok).toBe(false);
    if (!pdf.ok) expect(pdf.motivo).toContain('PNG ou JPG');
  });
  test('arquivo vazio e pasta com nome de imagem não contam', async () => {
    await writeFile(join(pasta, 'vazia.png'), '');
    expect((await acharRecursos(join(pasta, 'vazia.png'))).ok).toBe(false);
    await mkdir(join(pasta, 'pasta.png'));
    expect((await acharRecursos(join(pasta, 'pasta.png'))).ok).toBe(false);
  });
});
