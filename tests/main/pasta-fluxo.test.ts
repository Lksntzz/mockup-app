import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { listarPendentes, moverParaAprovar, verificarProntidao } from '../../src/main/pasta-fluxo';

let raiz = '';
let aprovar = '';
const arq = (...p: string[]) => writeFile(join(raiz, ...p), 'x');
const pasta = (...p: string[]) => mkdir(join(raiz, ...p), { recursive: true });

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'fluxo-'));
  raiz = join(base, '1 AGUARDA ARTE');
  aprovar = join(base, '2 APROVAR');
  await mkdir(raiz);
  await mkdir(aprovar);
});
afterEach(() => rm(join(raiz, '..'), { recursive: true, force: true }));

async function clienteCompleto(nome: string) {
  await pasta(nome, 'MKP');
  await arq(nome, 'MKP', 'capa-01.png');
  await arq(nome, 'capa.cdr');
  await arq(nome, 'capa.pdf');
}

describe('listarPendentes', () => {
  test('lista só pastas de cliente sem MKP pronto, com as artes encontradas', async () => {
    await pasta('FULANO');
    await arq('FULANO', 'arte.JPG');
    await arq('FULANO', 'outra.png');
    await arq('FULANO', 'capa.cdr');
    await clienteCompleto('PRONTO');
    await arq('solto.txt'); // arquivo solto na raiz não é cliente
    const r = await listarPendentes(raiz, Date.now() + 60_000, 0);
    expect(r.map((c) => c.nome)).toEqual(['FULANO']);
    expect(r[0]?.artes.map((a) => a.split(/[\\/]/).pop()).sort()).toEqual(['arte.JPG', 'outra.png']);
  });
  test('MKP vazio ou sem imagens não conta como feito', async () => {
    await pasta('X', 'MKP');
    await arq('X', 'arte.png');
    expect((await listarPendentes(raiz, Date.now() + 60_000, 0)).map((c) => c.nome)).toEqual(['X']);
  });
  test('pasta mexida há pouco tempo fica marcada como "chegando" (ainda pode estar subindo)', async () => {
    await pasta('NOVO');
    await arq('NOVO', 'arte.png');
    const agora = Date.now();
    const [c] = await listarPendentes(raiz, agora, 30_000);
    expect(c?.chegando).toBe(true);
    const velho = new Date(agora - 120_000);
    await utimes(join(raiz, 'NOVO', 'arte.png'), velho, velho);
    await utimes(join(raiz, 'NOVO'), velho, velho);
    expect((await listarPendentes(raiz, agora, 30_000))[0]?.chegando).toBe(false);
  });
  test('raiz que não existe devolve erro claro', async () => {
    await expect(listarPendentes(join(raiz, 'nao-existe'), Date.now(), 0)).rejects.toThrow(/pasta/i);
  });
});

describe('verificarProntidao', () => {
  test('pronta quando tem MKP com imagem, um .cdr e um .pdf (qualquer nome)', async () => {
    await clienteCompleto('A');
    expect(await verificarProntidao(join(raiz, 'A'))).toEqual({ pronta: true, faltando: [] });
  });
  test('diz exatamente o que falta', async () => {
    await pasta('B', 'MKP');
    await arq('B', 'x.png');
    const r = await verificarProntidao(join(raiz, 'B'));
    expect(r.pronta).toBe(false);
    expect(r.faltando).toEqual(['imagens do MKP', 'arquivo .cdr', 'arquivo .pdf']);
  });
});

describe('moverParaAprovar', () => {
  test('move a pasta inteira para a Pasta 2', async () => {
    await clienteCompleto('A');
    const r = await moverParaAprovar(join(raiz, 'A'), aprovar);
    expect(r).toEqual({ ok: true, destino: join(aprovar, 'A') });
    expect(await readdir(raiz)).toEqual([]);
    expect((await readdir(join(aprovar, 'A'))).sort()).toEqual(['MKP', 'capa.cdr', 'capa.pdf']);
  });
  test('não move se faltar algo, e diz o que falta', async () => {
    await pasta('B', 'MKP');
    const r = await moverParaAprovar(join(raiz, 'B'), aprovar);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/faltam|falta/i);
    expect(await readdir(raiz)).toEqual(['B']);
  });
  test('nunca sobrescreve: se já existe pasta com o mesmo nome na Pasta 2, para e avisa', async () => {
    await clienteCompleto('A');
    await mkdir(join(aprovar, 'A'));
    await writeFile(join(aprovar, 'A', 'antigo.txt'), 'x');
    const r = await moverParaAprovar(join(raiz, 'A'), aprovar);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/já existe/i);
    expect(await readdir(join(aprovar, 'A'))).toEqual(['antigo.txt']);
    expect(await readdir(raiz)).toEqual(['A']);
  });
  test('destino que não existe devolve erro claro e não cria pasta', async () => {
    await clienteCompleto('A');
    const r = await moverParaAprovar(join(raiz, 'A'), join(raiz, '..', 'nao-existe'));
    expect(r.ok).toBe(false);
    expect(await readdir(raiz)).toEqual(['A']);
  });
});
