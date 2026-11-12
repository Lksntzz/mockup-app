import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { acharPastaAnuncios, criarCategoria, listarCategorias, listarPlataformas } from '../../src/main/anuncios-pastas';
import { ehPasta } from '../../src/main/pasta-fluxo';

let base = '';
let raiz = '';
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'anun-'));
  raiz = join(base, 'Anúncio 2027');
  for (const p of ['Shopee/Agenda', 'Shopee/Planner', 'Shopee/_modelos', 'Shopee/.oculta', 'Amazon', '_modelos']) {
    await mkdir(join(raiz, p), { recursive: true });
  }
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('pastas de anúncios', () => {
  test('lista plataformas e categorias reais, sem nomes fixos no código', async () => {
    expect(await listarPlataformas(raiz)).toEqual(['Amazon', 'Shopee']);
    expect(await listarCategorias(join(raiz, 'Shopee'))).toEqual(['Agenda', 'Planner']);
  });
  test('criarCategoria recusa nome repetido com outra caixa ou acento e cria a nova', async () => {
    expect((await criarCategoria(join(raiz, 'Shopee'), 'agenda')).ok).toBe(false);
    const r = await criarCategoria(join(raiz, 'Shopee'), 'Agendamento');
    expect(r.ok && (await ehPasta(r.pasta))).toBe(true);
    expect((await criarCategoria(join(raiz, 'Shopee'), '  . ')).ok).toBe(false);
  });
  test('acharPastaAnuncios acha uma e não escolhe quando há duas', async () => {
    const um = await acharPastaAnuncios([base]);
    expect(um.pasta).toBe(raiz);
    await mkdir(join(base, 'outro', 'Anuncios 2027'), { recursive: true });
    const dois = await acharPastaAnuncios([base]);
    expect(dois.pasta).toBeUndefined();
    expect(dois.avisos.length).toBeGreaterThan(0);
  });
});
