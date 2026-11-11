import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { acharPastasDoFluxo } from '../../src/main/achar-pastas';

let base = '';
const f = (...p: string[]) => mkdir(join(base, ...p), { recursive: true });
const quatro = async (...pai: string[]) => {
  for (const n of ['1 AGUARDA ARTE', '2 APROVAR', '3 AGUARDA IMPRESSÃO', '4 FINALIZADOS']) await f(...pai, n);
};
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'achar-'));
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('acharPastasDoFluxo', () => {
  test('acha as 4 pastas irmãs e ignora cópias soltas e as de dentro da Pasta 4', async () => {
    await quatro('G', 'Drives compartilhados', 'Empresa', 'FLUXO');
    await f('G', 'Drives compartilhados', 'Empresa', 'FLUXO', '4 FINALIZADOS', '2 APROVAR');
    await f('G', 'Outro', '1 AGUARDA ARTE');
    const r = await acharPastasDoFluxo([join(base, 'G')]);
    const fluxo = join(base, 'G', 'Drives compartilhados', 'Empresa', 'FLUXO');
    expect(r.pastas).toEqual({ pasta1: join(fluxo, '1 AGUARDA ARTE'), pasta2: join(fluxo, '2 APROVAR'), pasta3: join(fluxo, '3 AGUARDA IMPRESSÃO'), pasta4: join(fluxo, '4 FINALIZADOS') });
    expect(r.avisos).toEqual([]);
  });
  test('aceita variações de nome e de acento', async () => {
    await f('D', 'x', '1 aguarda a arte'); await f('D', 'x', '2 aprovar'); await f('D', 'x', '3 AGUARDANDO IMPRESSAO'); await f('D', 'x', '4 Finalizado');
    const r = await acharPastasDoFluxo([join(base, 'D')]);
    expect(Object.keys(r.pastas).sort()).toEqual(['pasta1', 'pasta2', 'pasta3', 'pasta4']);
  });
  test('entra na pasta oculta .shortcut-targets-by-id do Google Drive (atalhos compartilhados)', async () => {
    await quatro('I', '.shortcut-targets-by-id', '1DcksskM', 'OPERAÇÃO');
    await f('I', '.outra-oculta', '1 AGUARDA ARTE');
    const r = await acharPastasDoFluxo([join(base, 'I')]);
    const fluxo = join(base, 'I', '.shortcut-targets-by-id', '1DcksskM', 'OPERAÇÃO');
    expect(r.pastas.pasta1).toBe(join(fluxo, '1 AGUARDA ARTE'));
    expect(r.pastas.pasta4).toBe(join(fluxo, '4 FINALIZADOS'));
  });
  test('dois conjuntos completos em lugares diferentes: não escolhe nenhum e avisa', async () => {
    await quatro('G', 'A'); await quatro('G', 'B');
    const r = await acharPastasDoFluxo([join(base, 'G')]);
    expect(r.pastas).toEqual({});
    expect(r.avisos.join(' ')).toContain('mais de um lugar');
  });
  test('conjunto incompleto: preenche só o que achou e diz o que faltou', async () => {
    await f('G', 'A', '1 AGUARDA ARTE'); await f('G', 'A', '2 APROVAR');
    const r = await acharPastasDoFluxo([join(base, 'G')]);
    expect(Object.keys(r.pastas).sort()).toEqual(['pasta1', 'pasta2']);
    expect(r.avisos.join(' ')).toContain('Pasta 3');
  });
  test('nada achado e raiz que não existe: lista vazia com aviso, sem erro', async () => {
    const r = await acharPastasDoFluxo([join(base, 'Z')]);
    expect(r.pastas).toEqual({});
    expect(r.avisos.length).toBeGreaterThan(0);
  });
  test('respeita a profundidade máxima', async () => {
    await quatro('G', 'a', 'b', 'c', 'd', 'e', 'f');
    expect((await acharPastasDoFluxo([join(base, 'G')], { profundidade: 3 })).pastas).toEqual({});
  });
});
