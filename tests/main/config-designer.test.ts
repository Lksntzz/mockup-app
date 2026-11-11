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
  test('guarda também as Pastas 3 e 4 e a lista de clientes já alertados', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true, pasta3: 'G:\\3', pasta4: 'G:\\4', vistos: ['A', 'B'] });
    expect(await criarConfigDesigner(arquivo).ler()).toEqual({ designer: true, pasta3: 'G:\\3', pasta4: 'G:\\4', vistos: ['A', 'B'] });
  });
  test('"vistos" com tipos errados é ignorado', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true });
    await writeFile(arquivo, JSON.stringify({ designer: true, vistos: [1, 'ok'] }));
    expect(await c.ler()).toEqual({ designer: true });
  });
  test('grava sem deixar arquivo temporário', async () => {
    await criarConfigDesigner(arquivo).salvar({ designer: true });
    expect(JSON.parse(await readFile(arquivo, 'utf-8'))).toEqual({ designer: true });
  });
});

describe('enviados', () => {
  test('guarda quando cada cliente foi enviado e descarta valores que não são número', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true, enviados: { 'SHOPEE / A': 1000, B: 2000 } });
    expect((await c.ler()).enviados).toEqual({ 'SHOPEE / A': 1000, B: 2000 });
    await writeFile(arquivo, JSON.stringify({ designer: true, enviados: { A: 5, B: 'x', C: null } }), 'utf-8');
    expect((await c.ler()).enviados).toEqual({ A: 5 });
  });
});

describe('trocar a Pasta 1', () => {
  test('ao trocar a Pasta 1 a lista de clientes já vistos é zerada (senão todos os clientes alertariam de uma vez)', async () => {
    const c = criarConfigDesigner(arquivo);
    await c.salvar({ designer: true, pasta1: 'G:\\a', vistos: ['X'] });
    await c.salvar({ pasta2: 'G:\\b' });
    expect((await c.ler()).vistos).toEqual(['X']);
    await c.salvar({ pasta1: 'G:\\a' });
    expect((await c.ler()).vistos).toEqual(['X']);
    await c.salvar({ pasta1: 'G:\\outra' });
    expect((await c.ler()).vistos).toBeUndefined();
  });
});
