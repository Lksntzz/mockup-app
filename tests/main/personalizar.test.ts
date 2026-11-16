import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { acharRecursos, estadoDasArtes } from '../../src/main/personalizar';
import { MODELOS } from '../../src/personalizar/modelo';

let pasta: string;
beforeEach(async () => { pasta = await mkdtemp(join(tmpdir(), 'pers-')); });
afterEach(async () => { await rm(pasta, { recursive: true, force: true }); });

async function criarArquivosDe(id: string): Promise<void> {
  const m = MODELOS.find((x) => x.id === id)!;
  await writeFile(join(pasta, m.arte), 'x');
  if (m.frente) await writeFile(join(pasta, m.frente), 'x');
}

describe('acharRecursos (a arte escolhida pelo nome na lista)', () => {
  test('arte do catálogo com os arquivos presentes: devolve as URLs file://', async () => {
    await criarArquivosDe('delicate');
    const r = await acharRecursos('delicate', pasta);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.arte.recursos.arteUrl.startsWith('file://')).toBe(true);
      expect(r.arte.recursos.frenteUrl?.startsWith('file://')).toBe(true);
      expect(r.arte.modelo.id).toBe('delicate');
    }
  });
  test('arte sem camada da frente não leva frenteUrl', async () => {
    await criarArquivosDe('caderneta-saude');
    const r = await acharRecursos('caderneta-saude', pasta);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.arte.recursos.frenteUrl).toBeUndefined();
  });
  test('id vazio usa a primeira da lista; id desconhecido é recusado (não imprime a arte errada)', async () => {
    await criarArquivosDe(MODELOS[0]!.id);
    expect((await acharRecursos(undefined, pasta)).ok).toBe(true);
    const r = await acharRecursos('nao-existe', pasta);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('Escolha a arte');
  });
  test('arquivo faltando ou vazio: pede para reinstalar', async () => {
    const falta = await acharRecursos('delicate', pasta);
    expect(falta.ok).toBe(false);
    if (!falta.ok) expect(falta.motivo).toContain('Reinstale');
    await writeFile(join(pasta, 'delicate.jpg'), '');
    await writeFile(join(pasta, 'delicate-frente.png'), 'x');
    expect((await acharRecursos('delicate', pasta)).ok).toBe(false);
  });
  test('a camada da frente também é obrigatória quando a arte tem uma', async () => {
    await writeFile(join(pasta, 'delicate.jpg'), 'x');
    expect((await acharRecursos('delicate', pasta)).ok).toBe(false);
  });
});

describe('estadoDasArtes', () => {
  test('lista todas as artes do catálogo, cada uma com seu estado', async () => {
    await criarArquivosDe('caderneta-saude');
    const e = await estadoDasArtes(pasta);
    expect(e.artes.map((a) => a.id)).toEqual(MODELOS.map((m) => m.id));
    expect(e.artes.find((a) => a.id === 'caderneta-saude')?.ok).toBe(true);
    expect(e.artes.find((a) => a.id === 'delicate')?.ok).toBe(false);
  });
});

describe('os arquivos das artes existem de verdade em assets/artes', () => {
  test('cada arte do catálogo tem seus arquivos no repositório', async () => {
    const e = await estadoDasArtes(join(__dirname, '..', '..', 'assets', 'artes'));
    for (const a of e.artes) expect(a.ok, a.motivo).toBe(true);
  });
});
