import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Rascunho } from '../../src/app/rascunhos';
import { criarRascunhos } from '../../src/main/rascunhos';

const r = (caminho: string, quando = '2026-11-10T20:00:00.000Z', selecionada = 0): Rascunho => ({
  caminho, nome: caminho.split('\\').pop() as string, atualizadoEm: quando, selecionada,
  saidas: { frente: true, vt: false, semCanguru: false, verso: false },
  escolhas: [{ wireo: 'preto', elastico: 'preto', tassel: 'branco' }],
});

describe('criarRascunhos', () => {
  let pasta = '';
  let arquivo = '';
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'rasc-'));
    arquivo = join(pasta, 'usuarios', 'ana', 'rascunhos.json');
  });
  afterEach(() => rm(pasta, { recursive: true, force: true }));

  test('começa vazio', async () => {
    expect(await criarRascunhos(arquivo).listar()).toEqual([]);
  });
  test('salvar o mesmo PDF de novo atualiza em vez de duplicar', async () => {
    const h = criarRascunhos(arquivo);
    await h.salvar(r('C:\\a\\X.pdf', undefined, 1));
    await h.salvar(r('C:\\a\\X.pdf', '2026-11-10T21:00:00.000Z', 4));
    const lista = await h.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0]?.selecionada).toBe(4);
  });
  test('lista do mais recente para o mais antigo e remove por caminho', async () => {
    const h = criarRascunhos(arquivo);
    await h.salvar(r('C:\\a\\velho.pdf', '2026-11-09T10:00:00.000Z'));
    await h.salvar(r('C:\\a\\novo.pdf', '2026-11-10T10:00:00.000Z'));
    expect((await h.listar()).map((x) => x.nome)).toEqual(['novo.pdf', 'velho.pdf']);
    await h.remover('C:\\a\\novo.pdf');
    expect((await h.listar()).map((x) => x.nome)).toEqual(['velho.pdf']);
  });
  test('cada operador tem o seu arquivo', async () => {
    await criarRascunhos(arquivo).salvar(r('C:\\a\\X.pdf'));
    expect(await criarRascunhos(join(pasta, 'usuarios', 'bia', 'rascunhos.json')).listar()).toEqual([]);
  });
  test('arquivo corrompido: lista vazia e o próximo salvamento conserta', async () => {
    const h = criarRascunhos(arquivo);
    await h.salvar(r('C:\\a\\X.pdf'));
    await writeFile(arquivo, '{ não é json');
    expect(await h.listar()).toEqual([]);
    await h.salvar(r('C:\\a\\Y.pdf'));
    expect((await h.listar()).map((x) => x.nome)).toEqual(['Y.pdf']);
  });
  test('guarda no máximo 50 rascunhos, descartando os mais antigos', async () => {
    const h = criarRascunhos(arquivo);
    for (let i = 0; i < 53; i++) await h.salvar(r(`C:\\a\\${i}.pdf`, new Date(2026, 0, 1, 0, i).toISOString()));
    const lista = await h.listar();
    expect(lista).toHaveLength(50);
    expect(lista[0]?.nome).toBe('52.pdf');
  });
});
