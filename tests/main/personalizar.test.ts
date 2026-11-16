import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { utimes } from 'node:fs/promises';
import { acharRecursos, estadoDaArte, imagemDaArte } from '../../src/main/personalizar';

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

describe('arte em PDF (a tela transforma a página 1 em imagem)', () => {
  test('imagem (PNG/JPG) vai direto, sem converter', async () => {
    await writeFile(join(pasta, 'a.png'), 'x');
    expect(await imagemDaArte({ artePersonalizada: join(pasta, 'a.png') })).toEqual({ imagem: join(pasta, 'a.png') });
    expect((await estadoDaArte({ artePersonalizada: join(pasta, 'a.png') })).ok).toBe(true);
  });
  test('PDF sem imagem pronta pede a conversão', async () => {
    await writeFile(join(pasta, 'a.pdf'), '%PDF-1.4');
    const e = await estadoDaArte({ artePersonalizada: join(pasta, 'a.pdf') });
    expect(e.ok).toBe(false);
    expect(e.converter).toBe(join(pasta, 'a.pdf'));
  });
  test('PDF com imagem pronta e mais nova que o PDF usa a imagem', async () => {
    await writeFile(join(pasta, 'a.pdf'), '%PDF-1.4');
    await writeFile(join(pasta, 'feita.png'), 'png');
    const c = { artePersonalizada: join(pasta, 'a.pdf'), arteImagem: join(pasta, 'feita.png') };
    await utimes(join(pasta, 'a.pdf'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    expect(await imagemDaArte(c)).toEqual({ imagem: join(pasta, 'feita.png') });
    expect((await estadoDaArte(c)).ok).toBe(true);
  });
  test('PDF alterado depois da imagem feita pede a conversão de novo', async () => {
    await writeFile(join(pasta, 'feita.png'), 'png');
    await writeFile(join(pasta, 'a.pdf'), '%PDF-1.4');
    await utimes(join(pasta, 'feita.png'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    const e = await estadoDaArte({ artePersonalizada: join(pasta, 'a.pdf'), arteImagem: join(pasta, 'feita.png') });
    expect(e.converter).toBe(join(pasta, 'a.pdf'));
  });
  test('PDF que sumiu: avisa que não achou o arquivo (não pede conversão)', async () => {
    const e = await estadoDaArte({ artePersonalizada: join(pasta, 'sumiu.pdf') });
    expect(e.ok).toBe(false);
    expect(e.converter).toBeUndefined();
    expect(e.motivo).toContain('Não achei');
  });
});
