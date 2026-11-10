import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { criarConfigDesigner } from '../../src/main/config-designer';

let pasta = '';
let arquivo = '';
beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'cfg-'));
  arquivo = join(pasta, 'dados', 'designer.json');
});
afterEach(() => rm(pasta, { recursive: true, force: true }));

describe('criarConfigDesigner', () => {
  test('por padrão o modo designer vem DESLIGADO e sem pastas', async () => {
    expect(await criarConfigDesigner(arquivo).ler()).toEqual({ designer: false });
  });
  test('liga, escolhe as pastas e guarda no disco', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true });
    await c.salvar({ pasta1: 'G:\\1 AGUARDA ARTE' });
    await c.salvar({ pasta2: 'G:\\2 APROVAR' });
    expect(await criarConfigDesigner(arquivo).ler()).toEqual({ designer: true, pasta1: 'G:\\1 AGUARDA ARTE', pasta2: 'G:\\2 APROVAR' });
  });
  test('desligar mantém as pastas escolhidas', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true, pasta1: 'G:\\a' });
    await c.salvar({ designer: false });
    expect(await c.ler()).toEqual({ designer: false, pasta1: 'G:\\a' });
  });
  test('arquivo corrompido ou com tipos errados volta ao padrão desligado', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true });
    await writeFile(arquivo, '{ quebrado');
    expect(await c.ler()).toEqual({ designer: false });
    await writeFile(arquivo, JSON.stringify({ designer: 'sim', pasta1: 5 }));
    expect(await c.ler()).toEqual({ designer: false });
  });
  test('grava sem deixar arquivo temporário', async () => {
    await criarConfigDesigner(arquivo).salvar({ designer: true });
    expect(JSON.parse(await readFile(arquivo, 'utf-8'))).toEqual({ designer: true });
  });
});
