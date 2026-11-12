import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntradaDoAnuncio } from '../../src/anuncios/tipos';
import { criarEMontar, dentroDaRaiz, montarPastaExistente, resolverPlataforma, resolverRaizDosAnuncios, validarFontes } from '../../src/main/anuncios';
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
// texto que o rodarMacroDoCorel devolve quando abre o Corel (é o texto do MKP)
const MOTIVO_MKP = 'Abri o CorelDRAW com o molde. Espere ele carregar por inteiro (uns 30 segundos, sem mexer) e clique de novo em "Abrir no molde (Corel)".';
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

  test('Corel fechado: pasta pronta e aguardando-clique, mandando clicar em "Montar no Corel agora"', async () => {
    const rodarMacro = vi.fn(async () => ({ ok: false as const, motivo: MOTIVO_MKP, aberto: true as const }));
    const r = await criarEMontar(entrada(), true, { rodarMacro, lerResultado: resultado([]) });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'aguardando-clique' });
    expect(r.avisos.join(' ')).toMatch(/Abri o CorelDRAW/);
    expect(r.avisos.join(' ')).toContain('Montar no Corel agora');
    expect(r.avisos.join(' ')).not.toMatch(/Abrir no molde/);
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
    expect(r).toMatchObject({ ok: true, etapaCorel: 'feito' });
    expect(r.avisos).toEqual([
      'Capa 1: montada, código de barras em 100% do tamanho padrão.',
      'Capa 2: montada, código de barras em 100% do tamanho padrão.',
    ]);
  });

  test('capa OK sem ampliação (EAN pendente) diz que ficou sem código de barras', async () => {
    const r = await criarEMontar(entrada(), true, {
      rodarMacro: macroQueCria(),
      lerResultado: resultado([{ n: 1, estado: 'ok', ampliacao: 0.97 }, { n: 2, estado: 'ok' }]),
    });
    expect(r.avisos).toContain('Capa 1: montada, código de barras em 97% do tamanho padrão.');
    expect(r.avisos).toContain('Capa 2: montada, sem código de barras (EAN pendente).');
  });

  test('ampliação fora de 0,8–2,0 e erro numa capa viram avisos', async () => {
    const r = await criarEMontar(entrada(), true, {
      rodarMacro: macroQueCria(),
      lerResultado: resultado([{ n: 1, estado: 'ok', ampliacao: 0.5 }, { n: 2, estado: 'erro', detalhe: 'pdf quebrado' }]),
    });
    expect(r).toMatchObject({ ok: true, etapaCorel: 'feito' });
    expect(r.avisos.some((a) => /^Capa 1: /.test(a) && /80%/.test(a))).toBe(true);
    expect(r.avisos.some((a) => /Variação/.test(a))).toBe(false);
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

describe('dentroDaRaiz', () => {
  test('só aceita caminhos abaixo da raiz', () => {
    expect(dentroDaRaiz(raiz, join(raiz, 'Shopee', 'Agenda'))).toBe(true);
    expect(dentroDaRaiz(raiz, raiz)).toBe(false);
    expect(dentroDaRaiz(raiz, base)).toBe(false);
    expect(dentroDaRaiz(raiz, join(raiz, '..', 'fora'))).toBe(false);
    expect(dentroDaRaiz(raiz, join(base, 'Anúncio 2027 outro'))).toBe(false);
  });
});

describe('montarPastaExistente', () => {
  const pastaArte = () => join(raiz, 'Shopee', 'Agenda', 'Arte 1');
  const criarPasta = async () => {
    const r = await criarEMontar(entrada(), false, { rodarMacro: vi.fn() });
    expect(r.ok).toBe(true);
    return pastaArte();
  };

  test('pasta fora da raiz (ou que não é texto) é recusada e o Corel nem é chamado', async () => {
    await criarPasta();
    const rodarMacro = vi.fn();
    const fora = join(base, 'fora');
    await mkdir(join(fora, '_corel'), { recursive: true });
    await writeFile(join(fora, '_corel', 'montar.txt'), `destino=${join(fora, 'x.cdr')}\r\ncapas=0`);
    for (const p of [fora, base, raiz, 5 as unknown as string, '']) {
      const r = await montarPastaExistente(raiz, p, { rodarMacro });
      expect(r.ok).toBe(false);
      expect(r.motivo).toBeTruthy();
    }
    expect(rodarMacro).not.toHaveBeenCalled();
  });

  test('sem _corel/montar.txt é recusada', async () => {
    const vazia = join(raiz, 'Shopee', 'Agenda', 'Sem lista');
    await mkdir(vazia);
    const rodarMacro = vi.fn();
    const r = await montarPastaExistente(raiz, vazia, { rodarMacro });
    expect(r).toMatchObject({ ok: false });
    expect(r.motivo).toContain('montar.txt');
    expect(rodarMacro).not.toHaveBeenCalled();
  });

  test('lista que aponta para outra pasta é recusada', async () => {
    const pasta = await criarPasta();
    const outra = join(raiz, 'Shopee', 'Agenda', 'Outra');
    await mkdir(outra);
    await writeFile(join(pasta, '_corel', 'montar.txt'), `destino=${join(outra, 'Outra.cdr')}\r\ncapas=0`);
    const rodarMacro = vi.fn();
    const r = await montarPastaExistente(raiz, pasta, { rodarMacro });
    expect(r).toMatchObject({ ok: false, motivo: 'A lista do Corel aponta para outra pasta.' });
    expect(rodarMacro).not.toHaveBeenCalled();
  });

  test('.cdr já existe: recusa, não chama o Corel e não apaga nada', async () => {
    const pasta = await criarPasta();
    const cdr = join(pasta, 'Arte 1.cdr');
    await writeFile(cdr, 'trabalho do designer');
    const rodarMacro = vi.fn();
    const r = await montarPastaExistente(raiz, pasta, { rodarMacro });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/\.cdr já existe/);
    expect(rodarMacro).not.toHaveBeenCalled();
    expect(await readFile(cdr, 'utf8')).toBe('trabalho do designer');
    expect(await existe(join(pasta, 'Arte 1.txt'))).toBe(true);
    expect(await existe(join(pasta, '_corel', 'montar.txt'))).toBe(true);
  });

  test('caminho feliz: manda ao macro exatamente o texto do montar.txt e fica "feito"', async () => {
    const pasta = await criarPasta();
    const texto = (await readFile(join(pasta, '_corel', 'montar.txt'))).toString('latin1');
    const rodarMacro = macroQueCria();
    const r = await montarPastaExistente(raiz, pasta, {
      rodarMacro, lerResultado: resultado([{ n: 1, estado: 'ok', ampliacao: 1 }, { n: 2, estado: 'ok', ampliacao: 1 }]),
    });
    expect(rodarMacro).toHaveBeenCalledWith('AnuncioNoMolde', texto);
    expect(r).toMatchObject({ ok: true, pasta, etapaCorel: 'feito' });
    expect(await existe(join(pasta, 'Arte 1.cdr'))).toBe(true);
  });

  test('Corel fechado de novo: aguardando-clique, sem o texto do MKP', async () => {
    const pasta = await criarPasta();
    const rodarMacro = vi.fn(async () => ({ ok: false as const, motivo: MOTIVO_MKP, aberto: true as const }));
    const r = await montarPastaExistente(raiz, pasta, { rodarMacro, lerResultado: resultado([]) });
    expect(r).toMatchObject({ ok: true, pasta, etapaCorel: 'aguardando-clique' });
    expect(r.avisos.some((a) => /Abrir no molde/.test(a))).toBe(false);
    expect(r.avisos.join(' ')).toContain('Montar no Corel agora');
  });
});
