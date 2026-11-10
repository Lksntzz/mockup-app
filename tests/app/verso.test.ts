import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import type { Choices, Pack } from '../../src/engine/types';
import { escolhasDoVerso, paraRazao } from '../../src/app/verso';

const packVerso = {
  options: {
    wireo: [{ id: 'branco' }, { id: 'preto' }],
    elastico: [{ id: 'branco' }, { id: 'rosa' }, { id: 'azul' }, { id: 'verde' }, { id: 'preto' }, { id: 'nenhum' }],
    tassel: [{ id: 'nenhum' }],
  },
} as unknown as Pack;
const c = (wireo: string, elastico: string, tassel = 'branco'): Choices => ({ wireo, elastico, tassel });

describe('escolhasDoVerso', () => {
  test('cores que existem no verso são mantidas; tassel nunca aparece', () => {
    expect(escolhasDoVerso(packVerso, c('preto', 'azul', 'verde'))).toEqual({ wireo: 'preto', elastico: 'azul', tassel: 'nenhum' });
  });
  test('rose gold vira branco e elástico laranja vira branco', () => {
    expect(escolhasDoVerso(packVerso, c('rose-gold', 'laranja'))).toEqual({ wireo: 'branco', elastico: 'branco', tassel: 'nenhum' });
  });
  test('sem elástico na capa, o verso também fica sem elástico', () => {
    expect(escolhasDoVerso(packVerso, c('branco', 'nenhum')).elastico).toBe('nenhum');
  });
});

describe('paraRazao', () => {
  const pagina = newRaster(200, 100); // proporção 2

  test('mesma proporção: devolve a própria imagem', () => {
    expect(paraRazao(pagina, 2)).toBe(pagina);
  });
  test('proporção mais estreita: corta a largura mantendo a altura', () => {
    const r = paraRazao(pagina, 1);
    expect([r.width, r.height]).toEqual([100, 100]);
  });
  test('proporção mais larga: corta a altura mantendo a largura', () => {
    const r = paraRazao(pagina, 4);
    expect([r.width, r.height]).toEqual([200, 50]);
  });
  test('repetir o pedido devolve a mesma imagem (a prévia depende disso para não refazer o trabalho)', () => {
    expect(paraRazao(pagina, 1)).toBe(paraRazao(pagina, 1));
  });
});
