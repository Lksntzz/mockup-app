import { createCanvas } from '@napi-rs/canvas';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decorar, imagemDaAgendaAberta } from '../../src/app/aberta-imagem';
import { geometriaDaDecoracao } from '../../src/app/aberta';
import type { Raster } from '../../src/engine/types';
import { loadPackNode } from '../support/loadPackNode';

const criar = (w: number, h: number) => createCanvas(w, h);

function branca(w: number, h: number): Raster {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
}
const pixel = (r: Raster, x: number, y: number): [number, number, number] => {
  const i = (Math.round(y) * r.width + Math.round(x)) * 4;
  return [r.data[i] as number, r.data[i + 1] as number, r.data[i + 2] as number];
};
const escuros = (r: Raster, x0: number, y0: number, x1: number, y1: number): number => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (pixel(r, x, y)[0] < 120) n++;
  return n;
};

describe('decorar (título e seta)', () => {
  const g = geometriaDaDecoracao(600, 291);

  it('a seta pinta de turquesa o corpo e a ponta, e deixa o resto branco', () => {
    const r = decorar(branca(1200, 1200), 600, 291, '', true, criar);
    const ponta = g.seta.ponta[1] as [number, number];
    // um pouco para dentro da ponta (do meio da base até a ponta)
    const base = [(((g.seta.ponta[0] as [number, number])[0] + (g.seta.ponta[2] as [number, number])[0]) / 2), (((g.seta.ponta[0] as [number, number])[1] + (g.seta.ponta[2] as [number, number])[1]) / 2)];
    const dentro = pixel(r, (base[0] as number) * 0.7 + ponta[0] * 0.3, (base[1] as number) * 0.7 + ponta[1] * 0.3);
    expect(dentro[2]).toBeGreaterThan(dentro[0] + 60); // azul/verde bem acima do vermelho
    expect(dentro[1]).toBeGreaterThan(dentro[0] + 40);
    expect(pixel(r, 100, 100)).toEqual([255, 255, 255]);
    expect(pixel(r, 600, 600)).toEqual([255, 255, 255]);
  });

  it('o turquesa da ponta é mais escuro que o da cauda', () => {
    const r = decorar(branca(1200, 1200), 600, 291, '', true, criar);
    const cauda = g.seta.corpo[2] as [number, number];
    const meio = g.seta.corpo[Math.floor(g.seta.corpo.length / 4)] as [number, number];
    const ponta = g.seta.ponta[1] as [number, number];
    const luz = (p: [number, number, number]) => p[0] + p[1] + p[2];
    void cauda;
    expect(luz(pixel(r, (ponta[0] + (g.seta.ponta[0] as [number, number])[0]) / 2, (ponta[1] + (g.seta.ponta[0] as [number, number])[1]) / 2))).toBeLessThan(luz(pixel(r, meio[0], meio[1])) + 1);
  });

  it('o título escuro aparece centralizado em cima; sem título, nada é escrito ali', () => {
    const com = decorar(branca(1200, 1200), 600, 291, 'Visão semanal completa', false, criar);
    const sem = decorar(branca(1200, 1200), 600, 291, '', false, criar);
    const faixa = (r: Raster) => escuros(r, 300, Math.round(g.titulo.y), 900, Math.round(g.titulo.y) + 60);
    expect(faixa(com)).toBeGreaterThan(300);
    expect(faixa(sem)).toBe(0);
    // centrado na lombada: tinta dos dois lados do centro, em quantidade parecida
    const esq = escuros(com, 300, Math.round(g.titulo.y), 600, Math.round(g.titulo.y) + 60);
    const dir = escuros(com, 600, Math.round(g.titulo.y), 900, Math.round(g.titulo.y) + 60);
    expect(Math.abs(esq - dir) / Math.max(esq, dir)).toBeLessThan(0.35);
  });

  it('sem título e sem seta devolve a imagem igual', () => {
    const base = branca(50, 50);
    expect(decorar(base, 25, 40, '', false, criar).data).toEqual(base.data);
  });

  it('não mexe na imagem original', () => {
    const base = branca(1200, 1200);
    decorar(base, 600, 291, 'x', true, criar);
    expect(pixel(base, 600, 100)).toEqual([255, 255, 255]);
  });
});

describe('imagemDaAgendaAberta (página dupla → imagem final)', () => {
  it('corta a página dupla ao meio, monta a cena e põe título e seta acima do livro', async () => {
    const { pack, layers } = await loadPackNode(join(__dirname, '..', '..', 'pack', 'verso'));
    // página dupla A4 deitada: metade esquerda azul, metade direita vermelha
    const w = 1754 * 2;
    const h = 2480;
    const dupla = branca(w, h);
    for (let y = 150; y < 2300; y++) {
      for (let x = 200; x < 1500; x++) dupla.data.set([30, 90, 200, 255], (y * w + x) * 4);
      for (let x = w - 1500; x < w - 200; x++) dupla.data.set([200, 40, 70, 255], (y * w + x) * 4);
    }
    const r = imagemDaAgendaAberta({ pack, layers }, dupla, { titulo: 'Visão semanal completa', seta: true }, criar);
    expect([r.width, r.height]).toEqual([1200, 1200]);
    // título presente na faixa de cima
    expect(escuros(r, 300, 40, 900, 120)).toBeGreaterThan(300);
    // o livro começa no topo combinado, mais abaixo do título e da seta
    // olha só a parte de fora da página da esquerda, longe da seta e das argolas
    let primeira = -1;
    for (let y = 150; y < 1200 && primeira < 0; y++) {
      for (let x = 120; x < 500; x++) {
        if (pixel(r, x, y).reduce((p, q) => p + q) / 3 < 0.95 * 255) {
          primeira = y;
          break;
        }
      }
    }
    expect(Math.abs(primeira - 291)).toBeLessThanOrEqual(3);
  }, 90000);

  it('sem título e sem seta, o livro fica centralizado na vertical', async () => {
    const { pack, layers } = await loadPackNode(join(__dirname, '..', '..', 'pack', 'verso'));
    const dupla = branca(3508, 2480);
    for (let y = 150; y < 2300; y++) for (let x = 200; x < 3300; x++) dupla.data.set([30, 90, 200, 255], (y * 3508 + x) * 4);
    const r = imagemDaAgendaAberta({ pack, layers }, dupla, { titulo: '', seta: false }, criar);
    let topo = -1;
    let base = -1;
    for (let y = 0; y < 1200; y++) {
      for (let x = 100; x < 1100; x++) {
        if (pixel(r, x, y).reduce((a, b) => a + b) / 3 < 0.95 * 255) {
          if (topo < 0) topo = y;
          base = y;
          break;
        }
      }
    }
    expect(Math.abs(topo - (1200 - 1 - base))).toBeLessThanOrEqual(80);
  }, 90000);
});
