import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { encodeEan13 } from '../../src/anuncios/ean';
import { serializarPendencia } from '../../src/anuncios/pendencia';
import { concluirPendente, listarPendentes } from '../../src/main/anuncios-pendentes';

const E1 = '7898764983584';
const E2 = '7898764983591';
const E3 = '7898764983607';
const BOM = '﻿';
let base = '';
let raiz = '';
const existe = (p: string) => stat(p).then(() => true, () => false);

const TXT = (l1: string, l2: string) =>
  `${BOM}Plataforma: Shopee\r\nCategoria: Agenda\r\nArte: A1\r\nTítulo: T\r\n\r\nVariações:\r\n1 | Capa: X | SKU: S1 | EAN: ${l1}\r\n2 | Capa: Y | SKU: S2 | EAN: ${l2}`;

async function arte(caminho: string, nome: string, capas = [1, 2], txt = TXT('(pendente)', '(pendente)')) {
  const pasta = join(caminho, nome);
  await mkdir(join(pasta, 'Corel'), { recursive: true });
  await writeFile(join(pasta, `${nome}.txt`), txt, 'utf8');
  await writeFile(
    join(pasta, 'pendente.json'),
    serializarPendencia({ versao: 1, arte: nome, capas: capas.map((n) => ({ n, capa: `C${n}`, faltaEan: true, faltaSku: false })) }),
    'utf8',
  );
  return pasta;
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'pend-'));
  raiz = join(base, 'Anúncio 2027');
  await mkdir(join(raiz, 'Shopee', 'Agenda'), { recursive: true });
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('listarPendentes', () => {
  test('acha em 2 e 3 níveis e ignora pastas sem pendente.json', async () => {
    const cat = join(raiz, 'Shopee', 'Agenda');
    await arte(cat, 'A1');
    await mkdir(join(cat, 'Sub'), { recursive: true });
    await arte(join(cat, 'Sub'), 'A2');
    await mkdir(join(cat, 'SemPendencia', 'Corel'), { recursive: true });
    const r = await listarPendentes(raiz);
    expect(r.map((c) => c.arte).sort()).toEqual(['A1', 'A2']);
    expect(r.find((c) => c.arte === 'A2')?.subcategoria).toBe('Sub');
    expect(r.find((c) => c.arte === 'A1')?.subcategoria).toBeUndefined();
    expect(r[0]!.plataforma).toBe('Shopee');
    expect(r[0]!.capas).toHaveLength(2);
  });
  test('pendente.json estragado vira card com erro', async () => {
    const p = await arte(join(raiz, 'Shopee', 'Agenda'), 'A1');
    await writeFile(join(p, 'pendente.json'), '{nao json', 'utf8');
    const [c] = await listarPendentes(raiz);
    expect(c!.erro).toMatch(/estragado/);
    expect(c!.capas).toEqual([]);
  });
  test('raiz ilegível devolve lista vazia', async () => {
    expect(await listarPendentes(join(base, 'nao-existe'))).toEqual([]);
  });
  test('mais recente primeiro', async () => {
    const cat = join(raiz, 'Shopee', 'Agenda');
    const velha = await arte(cat, 'Velha');
    await arte(cat, 'Nova');
    const { utimes } = await import('node:fs/promises');
    await utimes(velha, new Date(2020, 1, 1), new Date(2020, 1, 1));
    expect((await listarPendentes(raiz)).map((c) => c.arte)).toEqual(['Nova', 'Velha']);
  });
});

describe('concluirPendente', () => {
  const cat = () => join(raiz, 'Shopee', 'Agenda');

  test('concluir total apaga pendente.json e troca só a linha do .txt, preservando BOM e CRLF', async () => {
    const p = await arte(cat(), 'A1');
    const r = await concluirPendente(raiz, p, { 1: E1, 2: E2 });
    expect(r).toEqual({ ok: true, faltam: 0, avisos: [] });
    expect(await existe(join(p, 'pendente.json'))).toBe(false);
    const txt = await readFile(join(p, 'A1.txt'), 'utf8');
    expect(txt).toBe(TXT(E1, E2));
    expect(txt.startsWith(BOM)).toBe(true);
    expect(txt).toContain('SKU: S1 | EAN: ' + E1 + '\r\n');
    expect(await existe(join(p, 'Codigo de barras', `Capa 1 - ${E1}.svg`))).toBe(true);
    expect(await existe(join(p, 'Codigo de barras', `Capa 2 - ${E2}.svg`))).toBe(true);
    const ean = (await readFile(join(p, 'Corel', 'ean.txt'))).toString('latin1');
    expect(ean).toBe(`1|${E1}|${encodeEan13(E1)}\r\n2|${E2}|${encodeEan13(E2)}\r\n`);
  });

  test('parcial mantém as outras pendentes e as linhas antigas do ean.txt', async () => {
    const p = await arte(cat(), 'A1');
    await writeFile(join(p, 'Corel', 'ean.txt'), Buffer.from('9|1234|0101\r\n', 'latin1'));
    expect(await concluirPendente(raiz, p, { 1: E1 })).toEqual({ ok: true, faltam: 1, avisos: [] });
    const [c] = await listarPendentes(raiz);
    expect(c!.capas.map((x) => x.n)).toEqual([2]);
    expect((await readFile(join(p, 'Corel', 'ean.txt'))).toString('latin1')).toBe(`9|1234|0101\r\n1|${E1}|${encodeEan13(E1)}\r\n`);
    expect(await readFile(join(p, 'A1.txt'), 'utf8')).toBe(TXT(E1, '(pendente)'));
    expect(await concluirPendente(raiz, p, { 2: E2 })).toMatchObject({ ok: true, faltam: 0 });
  });

  test('segunda vez na mesma capa é recusada', async () => {
    const p = await arte(cat(), 'A1');
    await concluirPendente(raiz, p, { 1: E1 });
    const r = await concluirPendente(raiz, p, { 1: E3 });
    expect(r.ok).toBe(false);
  });

  test.each([
    ['inválido', { 1: '123' }],
    ['repetido', { 1: E1, 2: E1 }],
    ['vazio', { 1: '  ' }],
    ['capa desconhecida', { 7: E1 }],
    ['chave ruim', { x: E1 } as unknown as Record<number, string>],
  ])('recusa %s sem gravar nada', async (_nome, eans) => {
    const p = await arte(cat(), 'A1');
    const r = await concluirPendente(raiz, p, eans);
    expect(r.ok).toBe(false);
    expect(await existe(join(p, 'Codigo de barras'))).toBe(false);
    expect(await existe(join(p, 'Corel', 'ean.txt'))).toBe(false);
    expect(await readFile(join(p, 'A1.txt'), 'utf8')).toBe(TXT('(pendente)', '(pendente)'));
    expect(await existe(join(p, 'pendente.json'))).toBe(true);
  });

  test('EAN já usado no .txt ou num SVG é recusado', async () => {
    const p = await arte(cat(), 'A1', [2], TXT(E1, '(pendente)'));
    const r = await concluirPendente(raiz, p, { 2: E1 });
    expect(r.ok).toBe(false);
    const q = await arte(cat(), 'A2');
    await mkdir(join(q, 'Codigo de barras'));
    await writeFile(join(q, 'Codigo de barras', `Capa 5 - ${E2}.svg`), '<svg/>');
    expect((await concluirPendente(raiz, q, { 1: E2 })).ok).toBe(false);
    expect(await readFile(join(p, 'A1.txt'), 'utf8')).toBe(TXT(E1, '(pendente)'));
  });

  test('pasta fora da raiz ou que não é pasta é recusada', async () => {
    const fora = await arte(base, 'Fora');
    expect((await concluirPendente(raiz, fora, { 1: E1 })).ok).toBe(false);
    expect((await concluirPendente(raiz, join(cat(), 'nao-existe'), { 1: E1 })).ok).toBe(false);
    expect((await concluirPendente(raiz, 42, { 1: E1 })).ok).toBe(false);
  });

  test('.txt sem a linha da capa gera aviso e não é alterado', async () => {
    const p = await arte(cat(), 'A1', [1, 2], TXT('(pendente)', '(pendente)').replace('2 | Capa', '9 | Capa'));
    const antes = await readFile(join(p, 'A1.txt'), 'utf8');
    const r = await concluirPendente(raiz, p, { 2: E2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos).toHaveLength(1);
    expect(await readFile(join(p, 'A1.txt'), 'utf8')).toBe(antes);
    expect(await existe(join(p, 'Codigo de barras', `Capa 2 - ${E2}.svg`))).toBe(true);
  });
});
