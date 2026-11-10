import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { copyToAll, createState, select, setColor } from '../../src/app/state';
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
