import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { copyToAll, createState, select, setAjuste, setColor } from '../../src/app/state';
import type { Pack } from '../../src/engine/types';

const pack: Pack = {
  canvas: { width: 4, height: 4 },
  artCorners: [[0, 0], [4, 0], [4, 4], [0, 4]],
  artSize: { width: 4, height: 4 },
  artMask: { file: 'm.png', offset: [0, 0] },
  stack: [],
  options: {
    wireo: [{ id: 'preto', label: 'Preto', swatch: '#000' }, { id: 'rose-gold', label: 'Rose Gold', swatch: '#b76e79' }],
    elastico: [{ id: 'preto', label: 'Preto', swatch: '#000' }, { id: 'rosa', label: 'Rosa', swatch: '#f4a' }],
    tassel: [{ id: 'branco', label: 'Branco', swatch: '#fff' }, { id: 'rosa', label: 'Rosa', swatch: '#f4a' }],
  },
  unavailable: [{ wireo: 'rose-gold', tassel: 'branco' }],
  defaults: { wireo: 'preto', elastico: 'preto', tassel: 'branco' },
};
const capas = () => [newRaster(2, 2), newRaster(2, 2), newRaster(2, 2)];

describe('estado das capas', () => {
  test('cada capa começa com wire-o preto, elástico preto e tassel branco', () => {
    const s = createState(pack, capas());
    expect(s.capas).toHaveLength(3);
    for (const c of s.capas) expect(c.choices).toEqual({ wireo: 'preto', elastico: 'preto', tassel: 'branco' });
    expect(s.selecionada).toBe(0);
  });

  test('guarda a arte do verso de cada capa; capa sem verso fica sem', () => {
    const verso = newRaster(2, 2);
    const s = createState(pack, capas(), [verso, null, verso]);
    expect(s.capas[0]!.back).toBe(verso);
    expect(s.capas[1]!.back).toBeUndefined();
    expect(s.capas[2]!.back).toBe(verso);
  });

  test('copiar as cores para todas não troca o verso de ninguém', () => {
    const verso = newRaster(2, 2);
    const s = copyToAll(createState(pack, capas(), [verso, null, verso]), 0);
    expect(s.capas[0]!.back).toBe(verso);
    expect(s.capas[1]!.back).toBeUndefined();
  });

  test('setColor muda só a capa pedida e não altera o estado anterior', () => {
    const s0 = createState(pack, capas());
    const s1 = setColor(s0, 1, 'elastico', 'rosa');
    expect(s1.capas[1]!.choices.elastico).toBe('rosa');
    expect(s1.capas[0]!.choices.elastico).toBe('preto');
    expect(s1.capas[2]!.choices.elastico).toBe('preto');
    expect(s0.capas[1]!.choices.elastico).toBe('preto');
  });

  test('setColor recusa combinação indisponível e registra o motivo', () => {
    const s0 = createState(pack, capas());
    const s1 = setColor(s0, 0, 'wireo', 'rose-gold'); // com tassel branco: indisponível no pack de teste
    expect(s1.capas[0]!.choices.wireo).toBe('preto');
    expect(s1.lastError).toMatch(/indispon/i);
  });

  test('setColor recusa id que não existe e capa que não existe', () => {
    const s0 = createState(pack, capas());
    expect(setColor(s0, 0, 'tassel', 'azul-inexistente').capas[0]!.choices.tassel).toBe('branco');
    expect(() => setColor(s0, 9, 'tassel', 'rosa')).not.toThrow();
    expect(setColor(s0, 9, 'tassel', 'rosa').capas).toHaveLength(3);
  });

  test('copyToAll copia as 3 cores da capa escolhida para todas as capas', () => {
    let s = createState(pack, capas());
    s = setColor(s, 2, 'elastico', 'rosa');
    s = setColor(s, 2, 'tassel', 'rosa');
    s = copyToAll(s, 2);
    for (const c of s.capas) expect(c.choices).toEqual({ wireo: 'preto', elastico: 'rosa', tassel: 'rosa' });
  });

  test('select muda a capa selecionada e ignora índice inválido', () => {
    const s = createState(pack, capas());
    expect(select(s, 2).selecionada).toBe(2);
    expect(select(s, 7).selecionada).toBe(0);
  });
});

describe('ajuste da arte', () => {
  test('muda só a capa pedida; copiar as cores não leva o ajuste junto', () => {
    const s0 = createState(pack, capas());
    const s1 = setAjuste(s0, 1, { zoom: 1.2, x: 0.1, y: -0.1 });
    expect(s1.capas[1]!.ajuste).toEqual({ zoom: 1.2, x: 0.1, y: -0.1 });
    expect(s1.capas[0]!.ajuste).toBeUndefined();
    expect(s0.capas[1]!.ajuste).toBeUndefined();
    expect(copyToAll(s1, 0).capas[1]!.ajuste).toEqual({ zoom: 1.2, x: 0.1, y: -0.1 });
  });
  test('voltar ao normal remove o ajuste; valores absurdos são presos nos limites', () => {
    const s1 = setAjuste(createState(pack, capas()), 0, { zoom: 50, x: 0, y: 0 });
    expect(s1.capas[0]!.ajuste!.zoom).toBe(2);
    const s2 = setAjuste(s1, 0, { zoom: 1, x: 0, y: 0 });
    expect(s2.capas[0]!.ajuste).toBeUndefined();
  });
  test('capa que não existe é recusada', () => {
    expect(setAjuste(createState(pack, capas()), 9, { zoom: 1.1, x: 0, y: 0 }).lastError).toBeDefined();
  });
});

describe('ajuste da arte do verso', () => {
  test('é separado do ajuste da frente', () => {
    const s1 = setAjuste(setAjuste(createState(pack, capas()), 0, { zoom: 1.2, x: 0, y: 0 }), 0, { zoom: 0.8, x: 0.1, y: 0 }, 'verso');
    expect(s1.capas[0]!.ajuste).toEqual({ zoom: 1.2, x: 0, y: 0 });
    expect(s1.capas[0]!.ajusteVerso).toEqual({ zoom: 0.8, x: 0.1, y: 0 });
    const s2 = setAjuste(s1, 0, { zoom: 1, x: 0, y: 0 }, 'verso');
    expect(s2.capas[0]!.ajusteVerso).toBeUndefined();
    expect(s2.capas[0]!.ajuste).toEqual({ zoom: 1.2, x: 0, y: 0 });
  });
});
