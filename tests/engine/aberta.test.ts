import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ajustarMargemDaLombada, dividirAoMeio, espelhar, medirTinta, montarAgendaAberta, pacotesDaAgendaAberta } from '../../src/engine/aberta';
import type { Raster } from '../../src/engine/types';
import { loadPackNode } from '../support/loadPackNode';

function lisa(w: number, h: number, rgb: [number, number, number]): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { width: w, height: h, data };
}

function retangulo(r: Raster, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.data.set([rgb[0], rgb[1], rgb[2], 255], (y * r.width + x) * 4);
}

const pixel = (r: Raster, x: number, y: number): [number, number, number] => {
  const i = (y * r.width + x) * 4;
  return [r.data[i] as number, r.data[i + 1] as number, r.data[i + 2] as number];
};

describe('dividirAoMeio', () => {
  it('corta a página dupla na metade: esquerda e direita com a mesma largura', () => {
    const pagina = lisa(10, 4, [255, 255, 255]);
    retangulo(pagina, 0, 0, 5, 4, [255, 0, 0]);
    retangulo(pagina, 5, 0, 10, 4, [0, 0, 255]);
    const { esq, dir } = dividirAoMeio(pagina);
    expect(esq.width).toBe(5);
    expect(dir.width).toBe(5);
    expect(pixel(esq, 2, 1)).toEqual([255, 0, 0]);
    expect(pixel(dir, 2, 1)).toEqual([0, 0, 255]);
  });

  it('largura ímpar: a coluna do meio fica de fora, sem sobrar nem faltar pixel nas duas metades', () => {
    const { esq, dir } = dividirAoMeio(lisa(11, 2, [0, 0, 0]));
    expect(esq.width).toBe(5);
    expect(dir.width).toBe(5);
  });
});

describe('espelhar', () => {
  it('inverte direita e esquerda', () => {
    const r = lisa(4, 1, [255, 255, 255]);
    retangulo(r, 0, 0, 1, 1, [10, 20, 30]);
    const e = espelhar(r);
    expect(pixel(e, 3, 0)).toEqual([10, 20, 30]);
    expect(pixel(e, 0, 0)).toEqual([255, 255, 255]);
  });
});

describe('medirTinta', () => {
  it('devolve a caixa do que não é papel branco', () => {
    const r = lisa(50, 40, [255, 255, 255]);
    retangulo(r, 10, 5, 31, 20, [0, 0, 0]);
    expect(medirTinta(r)).toEqual({ x0: 10, y0: 5, x1: 30, y1: 19 });
  });

  it('página em branco não tem tinta', () => {
    expect(medirTinta(lisa(20, 20, [255, 255, 255]))).toBeNull();
  });

  it('pixel transparente conta como papel', () => {
    const r = lisa(10, 10, [0, 0, 0]);
    for (let i = 0; i < 100; i++) r.data[i * 4 + 3] = 0;
    expect(medirTinta(r)).toBeNull();
  });
});

describe('ajustarMargemDaLombada', () => {
  const L = 1772;
  const A = 2480;
  const limite = Math.round((1527 / 1772) * L);

  it('conteúdo que passa do limite recua nas duas páginas com a MESMA escala e termina antes dos furos', () => {
    const esq = lisa(L, A, [255, 255, 255]);
    retangulo(esq, 173, 60, 1709, 2405, [0, 0, 0]); // como o miolo real: só 64 px de margem na lombada
    const dir = lisa(L, A, [255, 255, 255]);
    retangulo(dir, 74, 65, 1610, 2404, [0, 0, 0]); // já espelhada: 163 px de margem
    const r = ajustarMargemDaLombada(esq, dir);
    expect(r.escala).toBeLessThan(1);
    expect(r.escala).toBeCloseTo(limite / 1708, 2);
    const te = medirTinta(r.esq);
    const td = medirTinta(r.dir);
    expect(te?.x1).toBeLessThanOrEqual(limite + 1);
    expect(td?.x1).toBeLessThanOrEqual(limite + 1);
    // as duas páginas ficam com a mesma folga na lombada
    expect(Math.abs((te?.x1 ?? 0) - (td?.x1 ?? 0))).toBeLessThanOrEqual(2);
    // a largura do conteúdo encolhe pela mesma escala nas duas
    expect(((te?.x1 ?? 0) - (te?.x0 ?? 0)) / (1708 - 173)).toBeCloseTo(r.escala, 1);
    expect(((td?.x1 ?? 0) - (td?.x0 ?? 0)) / (1609 - 74)).toBeCloseTo(r.escala, 1);
    // tamanho final igual ao da arte
    expect(r.esq.width).toBe(L);
    expect(r.esq.height).toBe(A);
  });

  it('arte que já respeita a folga não é mexida', () => {
    const esq = lisa(L, A, [255, 255, 255]);
    retangulo(esq, 200, 100, 1300, 2300, [0, 0, 0]);
    const dir = lisa(L, A, [255, 255, 255]);
    retangulo(dir, 150, 100, 1250, 2300, [0, 0, 0]);
    const r = ajustarMargemDaLombada(esq, dir);
    expect(r.escala).toBe(1);
    expect(r.esq.data).toEqual(esq.data);
    expect(r.dir.data).toEqual(dir.data);
  });

  it('página em branco não quebra', () => {
    const branca = lisa(L, A, [255, 255, 255]);
    const r = ajustarMargemDaLombada(branca, branca);
    expect(r.escala).toBe(1);
  });
});

describe('agenda aberta com o pacote verso real', () => {
  it('monta as duas páginas, uma arte em cada lado, com argolas nos dois lados da lombada', async () => {
    const { pack, layers } = await loadPackNode(join(__dirname, '..', '..', 'pack', 'verso'));
    const pacotes = pacotesDaAgendaAberta(pack);
    expect(pacotes.comAneis.stack.some((c) => c.id.startsWith('wireo-'))).toBe(true);
    expect(pacotes.semAneis.stack.some((c) => c.id.startsWith('wireo-'))).toBe(false);
    expect(pacotes.semAneis.artMask.file).toBe('aberta-mascara.png');
    expect([...pacotes.comAneis.stack, ...pacotes.semAneis.stack].some((c) => c.id.startsWith('marca-'))).toBe(false);

    const esq = lisa(1772, 2480, [255, 255, 255]);
    retangulo(esq, 150, 100, 1300, 2300, [30, 90, 200]); // azul
    const dir = lisa(1772, 2480, [255, 255, 255]);
    retangulo(dir, 150, 100, 1300, 2300, [200, 40, 70]); // vermelho (página da direita como o leitor vê; o motor espelha sozinho)
    const { imagem, lombadaX } = montarAgendaAberta(pack, layers, esq, dir, { topo: 300 });

    expect(imagem.width).toBe(1200);
    expect(imagem.height).toBe(1200);
    expect(lombadaX).toBeGreaterThan(560);
    expect(lombadaX).toBeLessThan(640);

    // acha azul só à esquerda da lombada e vermelho só à direita
    let azulEsq = 0;
    let azulDir = 0;
    let vermEsq = 0;
    let vermDir = 0;
    for (let y = 0; y < 1200; y += 3) {
      for (let x = 0; x < 1200; x += 3) {
        const [r, g, b] = pixel(imagem, x, y);
        const azul = b > r + 40 && b > g + 20;
        const verm = r > g + 60 && r > b + 60;
        if (azul) x < lombadaX ? azulEsq++ : azulDir++;
        if (verm) x < lombadaX ? vermEsq++ : vermDir++;
      }
    }
    expect(azulEsq).toBeGreaterThan(2000);
    expect(vermDir).toBeGreaterThan(2000);
    expect(azulDir).toBe(0);
    expect(vermEsq).toBe(0);

    // argolas: pixels bem escuros dos dois lados do eixo, em quantidades parecidas
    let escuroEsq = 0;
    let escuroDir = 0;
    const eixo = Math.round(lombadaX);
    for (let y = 250; y < 1100; y++) {
      for (let dx = 1; dx <= 45; dx++) {
        if (pixel(imagem, eixo - dx, y)[0] < 70) escuroEsq++;
        if (pixel(imagem, eixo + dx, y)[0] < 70) escuroDir++;
      }
    }
    expect(escuroEsq).toBeGreaterThan(500);
    expect(escuroDir).toBeGreaterThan(500);
    expect(Math.abs(escuroEsq - escuroDir) / Math.max(escuroEsq, escuroDir)).toBeLessThan(0.2);

    // a marca d'água fica uma vez só, no canto (opacidade baixa): o canto inferior direito deixa de ser branco puro
    let marca = 0;
    for (let y = 1090; y < 1190; y++) for (let x = 1103; x < 1190; x++) if (pixel(imagem, x, y)[0] < 252) marca++;
    expect(marca).toBeGreaterThan(50);
  }, 60000);

  it('com o topo escolhido, o livro começa nessa linha', async () => {
    const { pack, layers } = await loadPackNode(join(__dirname, '..', '..', 'pack', 'verso'));
    const arte = lisa(1772, 2480, [255, 255, 255]);
    retangulo(arte, 150, 100, 1300, 2300, [30, 90, 200]);
    const { imagem } = montarAgendaAberta(pack, layers, arte, arte, { topo: 300 });
    let primeira = -1;
    for (let y = 0; y < 1200 && primeira < 0; y++) {
      // as marcas de canto ficam nas pontas da imagem: olha só o miolo dela
      for (let x = 100; x < 1100; x++) {
        const [r, g, b] = pixel(imagem, x, y);
        if ((r + g + b) / 3 < 0.95 * 255) {
          primeira = y;
          break;
        }
      }
    }
    expect(Math.abs(primeira - 300)).toBeLessThanOrEqual(2);
  }, 60000);
});
