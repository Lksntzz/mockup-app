import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { EntradaHistorico } from '../../src/app/historico';
import { criarHistorico, nomeSeguro } from '../../src/main/historico';

const entrada = (id: string, data = '2026-11-10T20:00:00.000Z', geradas = 5): EntradaHistorico => ({
  id, data, pdfNome: 'CAPAS.pdf', pdfCaminho: 'C:\\x\\CAPAS.pdf',
  saidas: { frente: true, vt: false, semCanguru: false, verso: false },
  escolhas: [{ wireo: 'preto', elastico: 'preto', tassel: 'branco' }], geradas,
});

describe('nomeSeguro', () => {
  test('mantém letras, números, ponto, traço e sublinhado', () => {
    expect(nomeSeguro('Lucas.Silva-2_x')).toBe('Lucas.Silva-2_x');
  });
  test('troca o que o Windows não aceita em nome de pasta e não deixa subir de pasta', () => {
    expect(nomeSeguro('DOMINIO\\joão/..')).toBe('DOMINIO_joão__');
    expect(nomeSeguro('..')).not.toContain('..');
  });
  test('nome vazio vira "usuario"', () => {
    expect(nomeSeguro('')).toBe('usuario');
  });
});

describe('criarHistorico', () => {
  let pasta = '';
  let arquivo = '';
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'hist-'));
    arquivo = join(pasta, 'usuarios', 'ana', 'historico.json');
  });
  afterEach(() => rm(pasta, { recursive: true, force: true }));

  test('arquivo que ainda não existe: lista vazia', async () => {
    expect(await criarHistorico(arquivo).listar()).toEqual([]);
  });
  test('salva e lista, da mais nova para a mais antiga', async () => {
    const h = criarHistorico(arquivo);
    await h.salvar(entrada('velha', '2026-11-09T10:00:00.000Z'));
    await h.salvar(entrada('nova', '2026-11-10T10:00:00.000Z'));
    expect((await h.listar()).map((e) => e.id)).toEqual(['nova', 'velha']);
  });
  test('salvar com o mesmo id atualiza em vez de duplicar', async () => {
    const h = criarHistorico(arquivo);
    await h.salvar(entrada('a', undefined, 5));
    await h.salvar(entrada('a', undefined, 10));
    const lista = await h.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0]?.geradas).toBe(10);
  });
  test('remover tira só aquela entrada', async () => {
    const h = criarHistorico(arquivo);
    await h.salvar(entrada('a'));
    await h.salvar(entrada('b', '2026-11-11T10:00:00.000Z'));
    await h.remover('a');
    expect((await h.listar()).map((e) => e.id)).toEqual(['b']);
  });
  test('cada operador tem o seu arquivo: o de um não aparece no outro', async () => {
    await criarHistorico(join(pasta, 'usuarios', 'ana', 'historico.json')).salvar(entrada('a'));
    expect(await criarHistorico(join(pasta, 'usuarios', 'bia', 'historico.json')).listar()).toEqual([]);
  });
  test('arquivo corrompido: lista vazia, sem quebrar, e o próximo salvamento conserta', async () => {
    const h = criarHistorico(arquivo);
    await h.salvar(entrada('a'));
    await writeFile(arquivo, '{ isto não é json');
    expect(await h.listar()).toEqual([]);
    await h.salvar(entrada('b'));
    expect((await h.listar()).map((e) => e.id)).toEqual(['b']);
  });
  test('entradas malformadas dentro do arquivo são ignoradas', async () => {
    const h = criarHistorico(arquivo);
    await h.salvar(entrada('ok'));
    const bruto = JSON.parse(await readFile(arquivo, 'utf-8')) as unknown[];
    await writeFile(arquivo, JSON.stringify([...bruto, { id: 5 }, null]));
    expect((await h.listar()).map((e) => e.id)).toEqual(['ok']);
  });
  test('guarda no máximo 300 entradas, descartando as mais antigas', async () => {
    const h = criarHistorico(arquivo);
    for (let i = 0; i < 305; i++) await h.salvar(entrada(`e${i}`, new Date(2026, 0, 1, 0, i).toISOString()));
    const lista = await h.listar();
    expect(lista).toHaveLength(300);
    expect(lista[0]?.id).toBe('e304');
    expect(lista.at(-1)?.id).toBe('e5');
  });
});
