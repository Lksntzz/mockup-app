import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import type { Choices, Pack } from '../../src/engine/types';
import { createState } from '../../src/app/state';
import { aplicarEscolhas, descreverSaidas, entradaValida, formatarData, type EntradaHistorico } from '../../src/app/historico';

const pack = {
  options: {
    wireo: [{ id: 'preto' }, { id: 'branco' }],
    elastico: [{ id: 'preto' }, { id: 'azul' }],
    tassel: [{ id: 'branco' }, { id: 'rosa' }],
  },
  unavailable: [{ wireo: 'branco', elastico: 'azul' }],
  defaults: { wireo: 'preto', elastico: 'preto', tassel: 'branco' },
} as unknown as Pack;
const c = (wireo: string, elastico: string, tassel: string): Choices => ({ wireo, elastico, tassel });

describe('aplicarEscolhas', () => {
  const estado = () => createState(pack, [newRaster(1, 1), newRaster(1, 1), newRaster(1, 1)]);

  test('cada capa recebe as cores salvas, na mesma ordem', () => {
    const s = aplicarEscolhas(estado(), [c('branco', 'preto', 'rosa'), c('preto', 'azul', 'branco')]);
    expect(s.capas[0]?.choices).toEqual(c('branco', 'preto', 'rosa'));
    expect(s.capas[1]?.choices).toEqual(c('preto', 'azul', 'branco'));
  });
  test('capa que não tinha cores salvas (PDF ficou maior) mantém as padrão', () => {
    const s = aplicarEscolhas(estado(), [c('branco', 'preto', 'rosa')]);
    expect(s.capas[2]?.choices).toEqual(pack.defaults);
  });
  test('cores que não existem mais ou combinação indisponível são ignoradas, sem quebrar', () => {
    const s = aplicarEscolhas(estado(), [c('roxo', 'preto', 'branco'), c('branco', 'azul', 'branco')]);
    expect(s.capas[0]?.choices).toEqual(pack.defaults);
    expect(s.capas[1]?.choices).toEqual(pack.defaults);
  });
  test('PDF com menos capas que o salvo: sobra é descartada', () => {
    const s = aplicarEscolhas(createState(pack, [newRaster(1, 1)]), [c('branco', 'preto', 'rosa'), c('preto', 'azul', 'rosa')]);
    expect(s.capas).toHaveLength(1);
    expect(s.capas[0]?.choices).toEqual(c('branco', 'preto', 'rosa'));
  });
});

describe('descreverSaidas', () => {
  test('lista só o que foi gerado', () => {
    expect(descreverSaidas({ frente: true, vt: false, semCanguru: false, verso: true })).toBe('Frente + Verso');
    expect(descreverSaidas({ frente: false, vt: true, semCanguru: true, verso: false })).toBe('Especificação VT + Sem canguru');
  });
});

describe('formatarData', () => {
  test('dia/mês/ano hora:minuto no horário local', () => {
    const d = new Date(2026, 10, 10, 17, 40);
    expect(formatarData(d.toISOString())).toBe('10/11/2026 17:40');
  });
  test('data inválida não quebra', () => {
    expect(formatarData('lixo')).toBe('—');
  });
});

describe('entradaValida', () => {
  const ok: EntradaHistorico = {
    id: 'a', data: new Date().toISOString(), pdfNome: 'CAPAS.pdf', pdfCaminho: 'C:\\x\\CAPAS.pdf',
    saidas: { frente: true, vt: false, semCanguru: false, verso: false }, escolhas: [c('preto', 'preto', 'branco')], geradas: 5,
  };
  test('aceita uma entrada completa', () => expect(entradaValida(ok)).toBe(true));
  test('recusa o que está incompleto ou com tipo errado', () => {
    expect(entradaValida(null)).toBe(false);
    expect(entradaValida({ ...ok, id: 3 })).toBe(false);
    expect(entradaValida({ ...ok, escolhas: 'x' })).toBe(false);
    expect(entradaValida({ ...ok, saidas: undefined })).toBe(false);
  });
});
