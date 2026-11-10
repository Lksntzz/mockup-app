import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { exportAll, exportName, type ExportOptions } from '../../src/export/exporter';
import type { Choices, Pack, Raster } from '../../src/engine/types';
import { loadPackNode, lerPng } from '../support/loadPackNode';

const encodePng = async (r: Raster): Promise<Uint8Array> => {
  const png = new PNG({ width: r.width, height: r.height });
  png.data = Buffer.from(r.data);
  return new Uint8Array(PNG.sync.write(png));
};

describe('exportName', () => {
  test('imagem PNG/JPG não deixa a extensão no nome', () => {
    expect(exportName('arte.png', 1)).toBe('arte_capa-01.png');
    expect(exportName('Foto Cliente.JPEG', 2)).toBe('Foto_Cliente_capa-02.png');
  });
  test('tira .pdf, numera com dois dígitos e começa em 1', () => {
    expect(exportName('CAPAS.pdf', 1)).toBe('CAPAS_capa-01.png');
    expect(exportName('CAPAS.PDF', 12)).toBe('CAPAS_capa-12.png');
  });
  test('mantém acentos e troca espaços por _', () => {
    expect(exportName('Agenda Coleção Verão 2026.pdf', 3)).toBe('Agenda_Coleção_Verão_2026_capa-03.png');
  });
  test('remove os caracteres que o Windows não aceita em nome de arquivo', () => {
    expect(exportName('a:b*c?d"e<f>g|h/i\\j.pdf', 1)).toBe('abcdefghij_capa-01.png');
  });
  test('nome vazio depois da limpeza vira "mockup"', () => {
    expect(exportName('???.pdf', 2)).toBe('mockup_capa-02.png');
    expect(exportName('', 2)).toBe('mockup_capa-02.png');
  });
  test('com sufixo, ele vai depois do número da capa', () => {
    expect(exportName('CAPAS.pdf', 1, 'especificacao-vt')).toBe('CAPAS_capa-01_especificacao-vt.png');
  });
  test('tira pontos e espaços do fim do nome, que o Windows também recusa', () => {
    expect(exportName('colecao. .pdf', 1)).toBe('colecao_capa-01.png');
  });
});

// pack sintético 4×4: fundo branco + a arte
const ESCOLHA: Choices = { wireo: 'preto', elastico: 'preto', tassel: 'branco' };
const packPequeno: Pack = {
  canvas: { width: 4, height: 4 },
  artCorners: [[0, 0], [4, 0], [4, 4], [0, 4]],
  artSize: { width: 4, height: 4 },
  artMask: { file: 'm.png', offset: [0, 0] },
  stack: [
    { id: 'fundo', role: 'fixed', file: 'f.png', opacity: 1, blend: 'normal', offset: [0, 0] },
    { id: 'arte', role: 'art', opacity: 1, blend: 'normal', offset: [0, 0] },
  ],
  options: {
    wireo: [{ id: 'preto', label: 'Preto', swatch: '#000' }],
    elastico: [{ id: 'preto', label: 'Preto', swatch: '#000' }],
    tassel: [{ id: 'branco', label: 'Branco', swatch: '#fff' }],
  },
  unavailable: [],
  defaults: ESCOLHA,
};
function solido(w: number, h: number, v: number): Raster {
  const r = newRaster(w, h);
  r.data.fill(v);
  return r;
}
const camadasPequenas = () => new Map<string, Raster>([['f.png', solido(4, 4, 255)], ['m.png', solido(4, 4, 255)]]);

/** "Disco" em memória: grava, renomeia, remove e diz se existe. `falharEm` simula erro de gravação. */
function discoFalso(inicial: string[] = [], falharEm?: string) {
  const arquivos = new Map<string, Uint8Array>(inicial.map((p) => [p, new Uint8Array([1])]));
  return {
    arquivos,
    ops: {
      write: async (p: string, b: Uint8Array) => {
        if (falharEm && p.includes(falharEm)) throw new Error('disco cheio');
        arquivos.set(p, b);
      },
      rename: async (de: string, para: string) => {
        arquivos.set(para, arquivos.get(de) as Uint8Array);
        arquivos.delete(de);
      },
      remove: async (p: string) => void arquivos.delete(p),
      exists: async (p: string) => arquivos.has(p),
    },
  };
}
function opcoes(disco: ReturnType<typeof discoFalso>, extra: Partial<ExportOptions> = {}): ExportOptions {
  return {
    pdfName: 'colecao.pdf',
    pasta: '/saida',
    pack: packPequeno,
    layers: camadasPequenas(),
    capas: [0, 1, 2].map((i) => ({ art: solido(4, 4, 40 + i), choices: ESCOLHA })),
    encodePng,
    ...disco.ops,
    confirmOverwrite: async () => true,
    onProgress: () => {},
    ...extra,
  };
}

describe('exportAll', () => {
  test('grava um PNG por capa e avisa o progresso 1/3, 2/3, 3/3', async () => {
    const disco = discoFalso();
    const progresso: Array<[number, number]> = [];
    const r = await exportAll(opcoes(disco, { onProgress: (a, b) => progresso.push([a, b]) }));
    expect(r.written).toEqual(['/saida/colecao_capa-01.png', '/saida/colecao_capa-02.png', '/saida/colecao_capa-03.png']);
    expect([...disco.arquivos.keys()].sort()).toEqual(r.written);
    expect(progresso).toEqual([[1, 3], [2, 3], [3, 3]]);
    const png = PNG.sync.read(Buffer.from(disco.arquivos.get(r.written[0] as string) as Uint8Array));
    expect([png.width, png.height]).toEqual([4, 4]);
  });

  test('usa a barra do Windows quando a pasta vem com barra invertida', async () => {
    const disco = discoFalso();
    const r = await exportAll(opcoes(disco, { pasta: 'C:\\Users\\Lucas\\Saida' }));
    expect(r.written[0]).toBe('C:\\Users\\Lucas\\Saida\\colecao_capa-01.png');
  });

  test('arquivo existente: pergunta antes e, se o usuário recusa, não grava nada', async () => {
    const disco = discoFalso(['/saida/colecao_capa-01.png']);
    let perguntou: string[] = [];
    const r = await exportAll(opcoes(disco, { confirmOverwrite: async (f) => ((perguntou = f), false) }));
    expect(perguntou).toEqual(['/saida/colecao_capa-01.png']);
    expect(r.written).toEqual([]);
    expect([...disco.arquivos.keys()]).toEqual(['/saida/colecao_capa-01.png']);
    expect(disco.arquivos.get('/saida/colecao_capa-01.png')).toEqual(new Uint8Array([1])); // intacto
  });

  test('arquivo existente e o usuário aceita: substitui', async () => {
    const disco = discoFalso(['/saida/colecao_capa-02.png']);
    const r = await exportAll(opcoes(disco));
    expect(r.written).toHaveLength(3);
    expect((disco.arquivos.get('/saida/colecao_capa-02.png') as Uint8Array).length).toBeGreaterThan(1);
  });

  test('sem arquivos existentes, não pergunta nada', async () => {
    let perguntou = false;
    await exportAll(opcoes(discoFalso(), { confirmOverwrite: async () => ((perguntou = true), true) }));
    expect(perguntou).toBe(false);
  });

  test('erro de gravação no meio: sem arquivo pela metade, erro claro com o nome e o motivo', async () => {
    const disco = discoFalso([], 'capa-03');
    const erro = await exportAll(opcoes(disco)).catch((e: unknown) => e as Error);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('colecao_capa-03.png');
    expect((erro as Error).message).toContain('disco cheio');
    const nomes = [...disco.arquivos.keys()];
    expect(nomes.filter((n) => n.includes('parcial'))).toEqual([]); // nenhum temporário sobrando
    expect(nomes).toEqual(['/saida/colecao_capa-01.png', '/saida/colecao_capa-02.png']);
  });

  test('sem capas não grava nada e não dá erro', async () => {
    const disco = discoFalso();
    const r = await exportAll(opcoes(disco, { capas: [] }));
    expect(r.written).toEqual([]);
  });
});

describe('exportAll com imagens de especificação', () => {
  // pack da especificação sintético: mesmo da frente + uma camada que só existe na variante 'vt'
  const packEspec: Pack = {
    ...packPequeno,
    stack: [...packPequeno.stack, { id: 'sel', role: 'fixed', file: 'v.png', opacity: 1, blend: 'normal', offset: [0, 0], variant: 'vt' }],
  };
  const opaco = (v: number) => {
    const r = solido(4, 4, v);
    for (let i = 3; i < r.data.length; i += 4) r.data[i] = 255;
    return r;
  };
  const camadasEspec = () => new Map<string, Raster>([...camadasPequenas(), ['v.png', opaco(7)]]);
  const extraVt = () => ({ suffix: 'especificacao-vt', pack: packEspec, layers: camadasEspec(), variant: 'vt' });
  const extraSc = () => ({ suffix: 'especificacao-sem-canguru', pack: packEspec, layers: camadasEspec(), variant: 'sem-canguru' });

  test('frente + VT + sem canguru: três arquivos por capa e progresso sobre o total', async () => {
    const disco = discoFalso();
    const progresso: Array<[number, number]> = [];
    const r = await exportAll(opcoes(disco, { capas: opcoes(disco).capas.slice(0, 2), extras: [extraVt(), extraSc()], onProgress: (a, b) => progresso.push([a, b]) }));
    expect(r.written).toEqual([
      '/saida/colecao_capa-01.png', '/saida/colecao_capa-01_especificacao-vt.png', '/saida/colecao_capa-01_especificacao-sem-canguru.png',
      '/saida/colecao_capa-02.png', '/saida/colecao_capa-02_especificacao-vt.png', '/saida/colecao_capa-02_especificacao-sem-canguru.png',
    ]);
    expect(progresso.at(-1)).toEqual([6, 6]);
  });

  test('sem a frente: só os marcados', async () => {
    const disco = discoFalso();
    const r = await exportAll(opcoes(disco, { semFrente: true, extras: [extraVt()] }));
    expect(r.written).toEqual([
      '/saida/colecao_capa-01_especificacao-vt.png', '/saida/colecao_capa-02_especificacao-vt.png', '/saida/colecao_capa-03_especificacao-vt.png',
    ]);
  });

  test('a variante muda a imagem: VT pinta a camada da variante, sem canguru não', async () => {
    const disco = discoFalso();
    await exportAll(opcoes(disco, { capas: opcoes(disco).capas.slice(0, 1), extras: [extraVt(), extraSc()] }));
    const px = (n: string) => PNG.sync.read(Buffer.from(disco.arquivos.get(n) as Uint8Array)).data[0];
    expect(px('/saida/colecao_capa-01_especificacao-vt.png')).toBe(7);
    expect(px('/saida/colecao_capa-01_especificacao-sem-canguru.png')).not.toBe(7);
  });

  test('a contra capa da especificação usa a arte da página par, como na frente', async () => {
    const comVerso: Pack = {
      ...packEspec,
      backArt: { corners: [[0, 0], [4, 0], [4, 4], [0, 4]], size: { width: 4, height: 4 }, mask: { file: 'm.png', offset: [0, 0] } },
      stack: [packEspec.stack[0] as Pack['stack'][number], { id: 'verso', role: 'back-art', opacity: 1, blend: 'normal', offset: [0, 0] }],
    };
    const disco = discoFalso();
    const verso = opaco(33);
    await exportAll(opcoes(disco, {
      semFrente: true,
      capas: [{ art: solido(4, 4, 40), back: verso, choices: ESCOLHA }],
      extras: [{ suffix: 'especificacao-vt', pack: comVerso, layers: camadasEspec(), variant: 'vt' }],
    }));
    const png = PNG.sync.read(Buffer.from(disco.arquivos.get('/saida/colecao_capa-01_especificacao-vt.png') as Uint8Array));
    expect(png.data[0]).toBe(33);
  });

  test('extra com "montar": usa as artes e cores devolvidas e pula a capa quando devolve null', async () => {
    const disco = discoFalso();
    const capas = [0, 1].map((i) => ({ art: solido(4, 4, 40 + i), choices: ESCOLHA }));
    const r = await exportAll(opcoes(disco, {
      semFrente: true,
      capas,
      extras: [{
        suffix: 'verso', pack: packEspec, layers: camadasEspec(), variant: 'vt',
        montar: (capa) => (capa === capas[1] ? null : { art: capa.art, choices: ESCOLHA }),
      }],
    }));
    expect(r.written).toEqual(['/saida/colecao_capa-01_verso.png']);
  });

  test('pergunta sobre sobrescrever considera os arquivos de especificação também', async () => {
    const disco = discoFalso(['/saida/colecao_capa-01_especificacao-vt.png']);
    let perguntou: string[] = [];
    await exportAll(opcoes(disco, { semFrente: true, extras: [extraVt()], confirmOverwrite: async (f) => ((perguntou = f), false) }));
    expect(perguntou).toEqual(['/saida/colecao_capa-01_especificacao-vt.png']);
  });
});

const PACK_DIR = fileURLToPath(new URL('../../pack', import.meta.url));
const ARTE = fileURLToPath(new URL('../../fixtures/capa01.png', import.meta.url));
describe.skipIf(!(existsSync(PACK_DIR + '/mockup.json') && existsSync(ARTE)))('exportAll com o pacote real', () => {
  test('cada PNG exportado tem 1200×1200 e é idêntico ao mockup composto', async () => {
    const { pack, layers } = await loadPackNode(PACK_DIR);
    const art = await lerPng(ARTE);
    const disco = discoFalso();
    const r = await exportAll({
      ...opcoes(disco),
      pack,
      layers,
      capas: [{ art, choices: { wireo: 'rose-gold', elastico: 'rosa', tassel: 'rosa' } }],
    });
    const png = PNG.sync.read(Buffer.from(disco.arquivos.get(r.written[0] as string) as Uint8Array));
    expect([png.width, png.height]).toEqual([1200, 1200]);
    const { compose } = await import('../../src/engine/compose');
    const esperado = compose(pack, layers, art, { wireo: 'rose-gold', elastico: 'rosa', tassel: 'rosa' });
    expect(Buffer.compare(Buffer.from(esperado.data), png.data)).toBe(0);
  });
});
