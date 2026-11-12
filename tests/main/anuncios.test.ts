import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntradaDoAnuncio } from '../../src/anuncios/tipos';
import { criarEMontar, resolverPlataforma, resolverRaizDosAnuncios, validarFontes } from '../../src/main/anuncios';
import type { CapaMontada } from '../../src/main/corel';

let base = '';
let raiz = '';
let pdf = '';
const E1 = '7898764983584';
const E2 = '7898764983591';
const existe = (p: string) => stat(p).then(() => true, () => false);

function entrada(extra: Partial<EntradaDoAnuncio> = {}): EntradaDoAnuncio {
  return {
    raiz, plataforma: 'Shopee', categoria: 'Agenda', arte: 'Arte 1', titulo: 'Agenda Linda',
    variacoes: [{ capa: 'A', sku: 'S1', ean: E1 }, { capa: 'B', sku: 'S2', ean: E2 }],
    fontes: [{ tipo: 'pdf', arquivo: pdf, paginaCapa: 1, paginaContra: 2 }, { tipo: 'pdf', arquivo: pdf, paginaCapa: 3, paginaContra: 4 }],
    ...extra,
  };
}
const resultado = (capas: CapaMontada[]) => async () => ({ capas });
// macro falso que "cria" o .cdr como o Corel faria
const macroQueCria = () => vi.fn(async (_m: string, texto: string) => {
  const destino = texto.split('\r\n')[0]!.replace(/^destino=/, '');
  await writeFile(destino, 'cdr');
  return { ok: true as const };
});

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'anuncios-'));
  raiz = join(base, 'Anúncio 2027');
  await mkdir(join(raiz, 'Shopee', 'Agenda'), { recursive: true });
  pdf = join(base, 'origem.pdf');
  await writeFile(pdf, 'pdf');
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('criarEMontar', () => {
  test('com montarNoCorel=false cria a pasta e pula o Corel', async () => {
    const rodarMacro = vi.fn();
    const r = await criarEMontar(entrada(), false, { rodarMacro });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'pulado' });
    expect(rodarMacro).not.toHaveBeenCalled();
    expect(await existe(join(raiz, 'Shopee', 'Agenda', 'Arte 1', 'Arte 1.txt'))).toBe(true);
  });

  test('ok:false do criarAnuncio nunca chama o Corel', async () => {
    const rodarMacro = vi.fn();
    const r = await criarEMontar(entrada({ titulo: '' }), true, { rodarMacro });
    expect(r.ok).toBe(false);
    expect(r.avisos).toEqual([]);
    expect(r.motivo).toBeTruthy();
    expect(rodarMacro).not.toHaveBeenCalled();
  });

  test('caminho que o Corel não lê cria a pasta e pula o Corel com aviso', async () => {
    const raizRuim = join(base, 'Anúncio\u0090 2027');
    await mkdir(join(raizRuim, 'Shopee', 'Agenda'), { recursive: true });
    const rodarMacro = vi.fn();
    const r = await criarEMontar(entrada({ raiz: raizRuim }), true, { rodarMacro });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'pulado' });
    expect(r.avisos.join(' ')).toMatch(/Corel/);
    expect(rodarMacro).not.toHaveBeenCalled();
    expect(await existe(join(raizRuim, 'Shopee', 'Agenda', 'Arte 1'))).toBe(true);
  });

  test('Corel fechado: pasta pronta e aguardando-clique', async () => {
    const rodarMacro = vi.fn(async () => ({ ok: false as const, motivo: 'Abri o CorelDRAW', aberto: true as const }));
    const r = await criarEMontar(entrada(), true, { rodarMacro, lerResultado: resultado([]) });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'aguardando-clique' });
    expect(r.avisos.join(' ')).toMatch(/Abri o CorelDRAW/);
    expect(await existe(join(raiz, 'Shopee', 'Agenda', 'Arte 1', 'Arte 1.txt'))).toBe(true);
  });

  test('outro erro do Corel: etapaCorel erro com o motivo, ok continua true', async () => {
    const rodarMacro = vi.fn(async () => ({ ok: false as const, motivo: 'Corel travado' }));
    const r = await criarEMontar(entrada(), true, { rodarMacro, lerResultado: resultado([]) });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'erro' });
    expect(r.avisos.join(' ')).toMatch(/Corel travado/);
  });

  test('a pasta e o .txt existem antes de o macro ser chamado', async () => {
    let viu = false;
    const rodarMacro = vi.fn(async (macro: string, texto: string) => {
      expect(macro).toBe('AnuncioNoMolde');
      const pasta = join(raiz, 'Shopee', 'Agenda', 'Arte 1');
      viu = (await existe(pasta)) && (await existe(join(pasta, 'Arte 1.txt'))) && (await existe(join(pasta, '_corel', 'montar.txt')));
      return macroQueCria()(macro, texto);
    });
    const r = await criarEMontar(entrada(), true, { rodarMacro, lerResultado: resultado([{ n: 1, estado: 'ok', ampliacao: 1 }, { n: 2, estado: 'ok', ampliacao: 1 }]) });
    expect(viu).toBe(true);
    expect(r).toMatchObject({ ok: true, etapaCorel: 'feito', avisos: [] });
  });

  test('ampliação fora de 0,8–2,0 e erro numa capa viram avisos', async () => {
    const r = await criarEMontar(entrada(), true, {
      rodarMacro: macroQueCria(),
      lerResultado: resultado([{ n: 1, estado: 'ok', ampliacao: 0.5 }, { n: 2, estado: 'erro', detalhe: 'pdf quebrado' }]),
    });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'feito' });
    expect(r.avisos.some((a) => /Variação 1/.test(a) && /80%/.test(a))).toBe(true);
    expect(r.avisos).toContain('Capa 2: pdf quebrado');
  });

  test('sem arquivo de resultado: etapaCorel erro com aviso', async () => {
    const r = await criarEMontar(entrada(), true, { rodarMacro: macroQueCria(), lerResultado: async () => undefined });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'erro' });
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  test('macro "rodou" mas o .cdr não apareceu: etapaCorel erro', async () => {
    const rodarMacro = vi.fn(async () => ({ ok: true as const }));
    const r = await criarEMontar(entrada(), true, { rodarMacro, lerResultado: resultado([{ n: 1, estado: 'ok' }, { n: 2, estado: 'ok' }]) });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'erro' });
    expect(r.avisos.join(' ')).toMatch(/\.cdr/);
  });
});

describe('validarFontes', () => {
  test('aceita pdf/png/jpg/jpeg existentes (maiúsculas também)', async () => {
    const png = join(base, 'A.PNG');
    await writeFile(png, 'x');
    expect(await validarFontes([{ tipo: 'pdf', arquivo: pdf, paginaCapa: 1 }, { tipo: 'imagem', capa: png }])).toBeUndefined();
  });
  test('rejeita arquivo inexistente, extensão errada, não-string e forma inválida', async () => {
    const exe = join(base, 'a.exe');
    await writeFile(exe, 'x');
    expect(await validarFontes([{ tipo: 'pdf', arquivo: join(base, 'nao.pdf'), paginaCapa: 1 }])).toMatch(/\S/);
    expect(await validarFontes([{ tipo: 'imagem', capa: exe }])).toMatch(/\S/);
    expect(await validarFontes([{ tipo: 'pdf', arquivo: 5, paginaCapa: 1 }])).toMatch(/\S/);
    expect(await validarFontes([{ tipo: 'imagem', capa: pdf, contra: 7 }])).toMatch(/\S/);
    expect(await validarFontes([{ tipo: 'imagem', capa: base }])).toMatch(/\S/);
    expect(await validarFontes('x')).toMatch(/\S/);
    expect(await validarFontes([null])).toMatch(/\S/);
    expect(await validarFontes([{ tipo: 'zip' }])).toMatch(/\S/);
  });
});

describe('resolverRaizDosAnuncios e resolverPlataforma', () => {
  test('usa a pasta configurada se ainda for pasta; senão procura', async () => {
    const achar = vi.fn(async () => ({ pasta: raiz, avisos: ['x'] }));
    expect(await resolverRaizDosAnuncios(raiz, [base], achar)).toEqual({ pasta: raiz, avisos: [] });
    expect(achar).not.toHaveBeenCalled();
    expect(await resolverRaizDosAnuncios(join(base, 'sumiu'), [base], achar)).toEqual({ pasta: raiz, avisos: ['x'] });
    expect(await resolverRaizDosAnuncios(undefined, [base], achar)).toEqual({ pasta: raiz, avisos: ['x'] });
  });
  test('plataforma só entre as que existem (sem path traversal)', async () => {
    expect(await resolverPlataforma(raiz, 'Shopee')).toBe(join(raiz, 'Shopee'));
    expect(await resolverPlataforma(raiz, '../..')).toBeUndefined();
    expect(await resolverPlataforma(raiz, 'Shopee/../Shopee')).toBeUndefined();
    expect(await resolverPlataforma(raiz, 5 as unknown as string)).toBeUndefined();
  });
});
