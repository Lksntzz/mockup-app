import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const falharPendente = vi.hoisted(() => ({ ligado: false }));
vi.mock('node:fs/promises', async (orig) => {
  const m = await orig<typeof import('node:fs/promises')>();
  return {
    ...m,
    writeFile: (async (...a: Parameters<typeof m.writeFile>) => {
      if (falharPendente.ligado && String(a[0]).endsWith('pendente.json')) throw new Error('disco cheio');
      return m.writeFile(...a);
    }) as typeof m.writeFile,
  };
});
import { lerManifesto } from '../../src/anuncios/manifesto';
import type { EntradaDoAnuncio } from '../../src/anuncios/tipos';
import { gerarSvgEan13 } from '../../src/anuncios/ean-svg';
import { criarAnuncio, type EstadoProgresso, type EtapaProgresso } from '../../src/main/anuncios-criar';

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

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'criar-'));
  raiz = join(base, 'Anúncio 2027');
  await mkdir(join(raiz, 'Shopee', 'Agenda'), { recursive: true });
  pdf = join(base, 'origem.pdf');
  await writeFile(pdf, 'pdf');
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('criarAnuncio', () => {
  test('cria pasta, txt com BOM, cópia da arte em Arte/ e Corel/montar.txt', async () => {
    const r = await criarAnuncio(entrada());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pasta = join(raiz, 'Shopee', 'Agenda', 'Arte 1');
    expect(r.pasta).toBe(pasta);
    expect(r.cdr).toBe(join(pasta, 'Corel', 'Arte 1.cdr'));
    const txt = await readFile(join(pasta, 'Arte 1.txt'));
    expect([...txt.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(txt.toString('utf8')).toContain('Título: Agenda Linda');
    expect(await existe(join(pasta, 'Arte', 'Arte 1.pdf'))).toBe(true);
    const man = (await readFile(join(pasta, 'Corel', 'montar.txt'))).toString('latin1');
    expect(man).toBe(r.manifestoTexto);
    const l = lerManifesto(man);
    expect(l.capas).toHaveLength(2);
    expect(l.capas[0]!.frente).toBe(join(pasta, 'Arte', 'Arte 1.pdf'));
    expect(l.capas[1]).toMatchObject({ paginaFrente: 3, paginaVerso: 4 });
  });
  test('raiz da pasta tem só o txt e as pastas Arte, Codigo de barras e Corel', async () => {
    const r = await criarAnuncio(entrada());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await readdir(r.pasta)).sort()).toEqual(['Arte', 'Arte 1.txt', 'Codigo de barras', 'Corel']);
    expect(await readdir(join(r.pasta, 'Corel'))).toEqual(['montar.txt']);
    expect(r.manifestoTexto).toContain(`destino=${join(r.pasta, 'Corel', 'Arte 1.cdr')}`);
    expect(r.manifestoTexto).toContain(`frente=${join(r.pasta, 'Arte')}`);
  });
  test('grava um SVG por capa com EAN e devolve imagensEan', async () => {
    const r = await criarAnuncio(entrada());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dir = join(r.pasta, 'Codigo de barras');
    expect((await readdir(dir)).sort()).toEqual([`Capa 1 - ${E1}.svg`, `Capa 2 - ${E2}.svg`]);
    expect(await readFile(join(dir, `Capa 1 - ${E1}.svg`), 'utf8')).toBe(gerarSvgEan13(E1));
    expect(await readFile(join(dir, `Capa 2 - ${E2}.svg`), 'utf8')).toBe(gerarSvgEan13(E2));
    expect(r.imagensEan).toEqual([
      { n: 1, nome: `Capa 1 - ${E1}.svg`, svg: gerarSvgEan13(E1) },
      { n: 2, nome: `Capa 2 - ${E2}.svg`, svg: gerarSvgEan13(E2) },
    ]);
  });
  test('variação sem EAN não gera imagem', async () => {
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: '' }, { capa: 'B', sku: '', ean: E2 }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await readdir(join(r.pasta, 'Codigo de barras'))).toEqual([`Capa 2 - ${E2}.svg`]);
    expect(r.imagensEan.map((i) => i.n)).toEqual([2]);
    expect(r.avisos.some((a) => a.includes('SEM código de barras'))).toBe(true);
  });
  test('aoProgredir segue a ordem em criação ok', async () => {
    const ev: string[] = [];
    const r = await criarAnuncio(entrada(), (e: EtapaProgresso, s: EstadoProgresso) => ev.push(`${e} ${s}`));
    expect(r.ok).toBe(true);
    expect(ev).toEqual(['pasta andamento', 'pasta feito', 'arte andamento', 'arte feito', 'barras andamento', 'barras feito']);
  });
  test('sem nenhum EAN a etapa barras é pulada', async () => {
    const ev: string[] = [];
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: '' }, { capa: 'B', sku: '', ean: '' }] }), (e, s) => ev.push(`${e} ${s}`));
    expect(r.ok).toBe(true);
    expect(ev).toContain('barras pulado');
    expect(ev).not.toContain('barras andamento');
  });
  test('falha na cópia marca erro na etapa arte e remove a pasta com subpastas', async () => {
    const ev: string[] = [];
    const r = await criarAnuncio(entrada({ fontes: [{ tipo: 'pdf', arquivo: join(base, 'nao-existe.pdf'), paginaCapa: 1 }, { tipo: 'pdf', arquivo: pdf, paginaCapa: 3 }] }), (e, s) => ev.push(`${e} ${s}`));
    expect(r.ok).toBe(false);
    expect(ev[ev.length - 1]).toBe('arte erro');
    expect(await readdir(join(raiz, 'Shopee', 'Agenda'))).toEqual([]);
  });
  test('imagens são copiadas como capa N e contra N', async () => {
    const a = join(base, 'a.png'); const b = join(base, 'b.jpg');
    await writeFile(a, 'x'); await writeFile(b, 'y');
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: E1 }], fontes: [{ tipo: 'imagem', capa: a, contra: b }] }));
    expect(r.ok).toBe(true);
    const nomes = await readdir(join(raiz, 'Shopee', 'Agenda', 'Arte 1', 'Arte'));
    expect(nomes).toEqual(expect.arrayContaining(['Arte 1 - capa 1.png', 'Arte 1 - contra 1.jpg']));
  });
  test('pasta que já existe: não escreve nada e devolve existente', async () => {
    await criarAnuncio(entrada());
    const de_novo = await criarAnuncio(entrada());
    expect(de_novo).toMatchObject({ ok: false, existente: join(raiz, 'Shopee', 'Agenda', 'Arte 1') });
  });
  test('variante de caixa/acento conta como existente', async () => {
    await mkdir(join(raiz, 'Shopee', 'Agenda', 'ARTÉ 1', 'Corel'), { recursive: true });
    const r = await criarAnuncio(entrada());
    expect(r).toMatchObject({ ok: false, existente: join(raiz, 'Shopee', 'Agenda', 'ARTÉ 1') });
    expect(await readdir(join(raiz, 'Shopee', 'Agenda'))).toEqual(['ARTÉ 1']);
  });
  test('EAN inválido ou repetido bloqueia sem criar pasta', async () => {
    const a = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: '7898764983585' }, { capa: 'B', sku: '', ean: E2 }] }));
    const b = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: E1 }, { capa: 'B', sku: '', ean: E1 }] }));
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(await readdir(join(raiz, 'Shopee', 'Agenda'))).toEqual([]);
  });
  test('EAN colado com espaços é aceito e gravado limpo no .txt', async () => {
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: ' 789 8764983584\n' }, { capa: 'B', sku: '', ean: E2 }] }));
    expect(r.ok).toBe(true);
    const txt = await readFile(join(raiz, 'Shopee', 'Agenda', 'Arte 1', 'Arte 1.txt'), 'utf8');
    expect(txt).toContain(`EAN: ${E1}`);
  });
  test('SKU repetido só gera aviso', async () => {
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: 'X', ean: E1 }, { capa: 'B', sku: 'X', ean: E2 }] }));
    expect(r.ok && r.avisos.length).toBe(1);
  });
  test('falha no meio apaga só a pasta que esta chamada criou', async () => {
    await mkdir(join(raiz, 'Shopee', 'Agenda', 'Outra'));
    await writeFile(join(raiz, 'Shopee', 'Agenda', 'Outra', 'f.txt'), 'k');
    const r = await criarAnuncio(entrada({ fontes: [{ tipo: 'pdf', arquivo: join(base, 'nao-existe.pdf'), paginaCapa: 1 }, { tipo: 'pdf', arquivo: pdf, paginaCapa: 3 }] }));
    expect(r.ok).toBe(false);
    expect(await readdir(join(raiz, 'Shopee', 'Agenda'))).toEqual(['Outra']);
    expect(await existe(join(raiz, 'Shopee', 'Agenda', 'Outra', 'f.txt'))).toBe(true);
  });
  test('plataforma ou categoria inexistente é recusada', async () => {
    expect((await criarAnuncio(entrada({ plataforma: 'Magalu' }))).ok).toBe(false);
    expect((await criarAnuncio(entrada({ categoria: 'Nada' }))).ok).toBe(false);
    expect((await criarAnuncio(entrada({ plataforma: '..' }))).ok).toBe(false);
  });
  test('nome de arte vazio depois de limpar e título vazio são recusados antes de tocar o disco', async () => {
    expect((await criarAnuncio(entrada({ arte: ' . ' }))).ok).toBe(false);
    expect((await criarAnuncio(entrada({ titulo: '   ' }))).ok).toBe(false);
    expect(await readdir(join(raiz, 'Shopee', 'Agenda'))).toEqual([]);
  });
  test('caminho fora do latin1 é recusado sem criar nada', async () => {
    const r = await criarAnuncio(entrada({ arte: 'Agenda 日本' }));
    expect(r).toMatchObject({ ok: false });
    expect(await readdir(join(raiz, 'Shopee', 'Agenda'))).toEqual([]);
  });
  // No Windows o "|" não pode ser nome de pasta (a pasta do teste nem seria criada), então só roda fora dele.
  test.skipIf(process.platform === 'win32')('"|" no caminho vira recusa limpa, sem exceção e sem criar nada', async () => {
    const raiz2 = join(base, 'a|b');
    await mkdir(join(raiz2, 'Shopee', 'Agenda'), { recursive: true });
    const r = await criarAnuncio(entrada({ raiz: raiz2 }));
    expect(r.ok).toBe(false);
    expect(await readdir(join(raiz2, 'Shopee', 'Agenda'))).toEqual([]);
  });
  test('variação sem EAN continua no manifesto, sem código de barras, com aviso', async () => {
    const r = await criarAnuncio(entrada({
      variacoes: [{ capa: 'A', sku: '', ean: E1 }, { capa: 'B', sku: '', ean: '  ' }, { capa: 'C', sku: '', ean: E2 }],
      fontes: [1, 3, 5].map((p) => ({ tipo: 'pdf' as const, arquivo: pdf, paginaCapa: p })),
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const linhas = r.manifestoTexto.split('\r\n').slice(2);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain(`ean=${E1}|mod=`);
    expect(linhas[1]).toMatch(/\|pf=3\|.*\|ean=\|mod=$/);
    expect(linhas[2]).toContain(`ean=${E2}|mod=`);
    expect(r.avisos.some((a) => a.includes('variação 2') && a.includes('SEM código de barras'))).toBe(true);
  });
  test('todas as variações sem EAN: não recusa, só avisos', async () => {
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: '', ean: '' }, { capa: 'B', sku: '', ean: '' }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifestoTexto.split('\r\n').slice(2)).toHaveLength(2);
    expect(r.avisos).toHaveLength(2);
  });
  describe('com subcategoria', () => {
    const cat = () => join(raiz, 'Shopee', 'Agenda');
    test('cria a arte dentro da subcategoria', async () => {
      await mkdir(join(cat(), 'MANICURE'));
      const r = await criarAnuncio(entrada({ subcategoria: 'MANICURE' }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const pasta = join(cat(), 'MANICURE', 'Arte 1');
      expect(r.pasta).toBe(pasta);
      expect(r.cdr).toBe(join(pasta, 'Corel', 'Arte 1.cdr'));
      expect((await readFile(join(pasta, 'Arte 1.txt'))).toString('utf8')).toContain('Subcategoria: MANICURE');
    });
    test('subcategoria inexistente recusa e não cria nada', async () => {
      const r = await criarAnuncio(entrada({ subcategoria: 'NADA' }));
      expect(r).toEqual({ ok: false, motivo: 'A subcategoria "NADA" não existe em Agenda.' });
      expect(await readdir(cat())).toEqual([]);
    });
    test('arte já existente na subcategoria recusa apontando para ela', async () => {
      await mkdir(join(cat(), 'MANICURE', 'Arte 1'), { recursive: true });
      const r = await criarAnuncio(entrada({ subcategoria: 'MANICURE' }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.existente).toBe(join(cat(), 'MANICURE', 'Arte 1'));
    });
    test('arte com o mesmo nome fora da subcategoria não bloqueia', async () => {
      await mkdir(join(cat(), 'MANICURE'));
      await mkdir(join(cat(), 'Arte 1'));
      expect((await criarAnuncio(entrada({ subcategoria: 'manicure' }))).ok).toBe(true);
      expect(await readdir(join(cat(), 'MANICURE'))).toEqual(['Arte 1']);
    });
    test('sem subcategoria (ausente ou vazia) mantém o comportamento', async () => {
      for (const sub of [undefined, '']) {
        const r = await criarAnuncio(entrada(sub === undefined ? {} : { subcategoria: sub }));
        expect(r.ok && r.pasta).toBe(join(cat(), 'Arte 1'));
        await rm(join(cat(), 'Arte 1'), { recursive: true });
      }
    });
    test('subcategoria ".." ou com barra é recusada e não cria nada', async () => {
      await mkdir(join(cat(), 'MANICURE'));
      for (const sub of ['..', 'MANICURE\\x', 'a/b']) {
        const r = await criarAnuncio(entrada({ subcategoria: sub }));
        expect(r.ok).toBe(false);
      }
      expect(await readdir(cat())).toEqual(['MANICURE']);
      expect(await readdir(raiz)).toEqual(['Shopee']);
    });
    test('categoria com subcategorias e subcategoria vazia recusa', async () => {
      await mkdir(join(cat(), 'MANICURE'));
      const r = await criarAnuncio(entrada());
      expect(r).toEqual({ ok: false, motivo: 'Escolha a subcategoria desta categoria.' });
      expect(await readdir(cat())).toEqual(['MANICURE']);
    });
    test('pasta que já é uma arte não conta como subcategoria', async () => {
      await mkdir(join(cat(), 'Velha', 'Corel'), { recursive: true });
      const r = await criarAnuncio(entrada());
      expect(r.ok && r.pasta).toBe(join(cat(), 'Arte 1'));
    });
    test('falha ao ler as subcategorias recusa com mensagem clara', async () => {
      await rm(cat(), { recursive: true });
      await writeFile(cat(), 'x');
      const r = await criarAnuncio(entrada());
      expect(r.ok).toBe(false);
    });
  });

  test('pendente.json: gravado com EAN vazio, ausente com todos os EAN', async () => {
    const r = await criarAnuncio(entrada({ variacoes: [{ capa: 'A', sku: 'S1', ean: E1 }, { capa: 'B', sku: 'S2', ean: '' }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const j = JSON.parse(await readFile(join(r.pasta, 'pendente.json'), 'utf8'));
    expect(j).toEqual({ versao: 1, arte: 'Arte 1', capas: [{ n: 2, capa: 'B', faltaEan: true, faltaSku: false }] });
    const completo = await criarAnuncio(entrada({ arte: 'Arte 2' }));
    expect(completo.ok).toBe(true);
    if (completo.ok) expect(await existe(join(completo.pasta, 'pendente.json'))).toBe(false);
  });
  test('pendente.json: só SKU vazio (com EAN) também fica pendente', async () => {
    const r = await criarAnuncio(entrada({ arte: 'Arte 3', variacoes: [{ capa: 'A', sku: '', ean: E1 }, { capa: 'B', sku: 'S2', ean: E2 }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const j = JSON.parse(await readFile(join(r.pasta, 'pendente.json'), 'utf8'));
    expect(j.capas).toEqual([{ n: 1, capa: 'A', faltaEan: false, faltaSku: true }]);
  });
  test('falha ao gravar pendente.json (montar.txt já gravado) remove a pasta toda', async () => {
    falharPendente.ligado = true;
    try {
      const e = entrada({ variacoes: [{ capa: 'A', sku: 'S1', ean: '' }, { capa: 'B', sku: 'S2', ean: E2 }] });
      const r = await criarAnuncio(e);
      expect(r.ok).toBe(false);
      expect(await existe(join(raiz, 'Shopee', 'Agenda', 'Arte 1'))).toBe(false);
    } finally { falharPendente.ligado = false; }
  });
});
