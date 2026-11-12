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

import { aplicarAjustes, ajustesDoEstado } from '../../src/app/historico';

describe('ajuste da arte no histórico', () => {
  const estado = () => createState(pack, [newRaster(1, 1), newRaster(1, 1), newRaster(1, 1)]);

  test('aplicarAjustes devolve frente e verso salvos em cada capa, na ordem', () => {
    const s = aplicarAjustes(estado(), [{ zoom: 1.2, x: 0.1, y: -0.05 }, null, { zoom: 0.8, x: 0, y: 0 }], [null, { zoom: 1.5, x: -0.2, y: 0.2 }]);
    expect(s.capas[0]?.ajuste).toEqual({ zoom: 1.2, x: 0.1, y: -0.05 });
    expect(s.capas[1]?.ajuste).toBeUndefined();
    expect(s.capas[2]?.ajuste).toEqual({ zoom: 0.8, x: 0, y: 0 });
    expect(s.capas[1]?.ajusteVerso).toEqual({ zoom: 1.5, x: -0.2, y: 0.2 });
    expect(s.capas[0]?.ajusteVerso).toBeUndefined();
  });
  test('valores estragados são presos nos limites ou ignorados, sem quebrar', () => {
    const s = aplicarAjustes(estado(), [{ zoom: 99, x: Number.NaN, y: 7 } as never], undefined);
    expect(s.capas[0]?.ajuste).toEqual({ zoom: 2, x: 0, y: 0.5 });
  });
  test('sem ajustes salvos (histórico antigo) o estado não muda', () => {
    const antes = estado();
    expect(aplicarAjustes(antes, undefined, undefined).capas).toEqual(antes.capas);
  });
  test('ajustesDoEstado guarda só o que foi mexido: ajuste neutro vira null', () => {
    let s = aplicarAjustes(estado(), [{ zoom: 1.3, x: 0, y: 0 }, { zoom: 1, x: 0, y: 0 }], undefined);
    const r = ajustesDoEstado(s);
    expect(r.ajustes).toEqual([{ zoom: 1.3, x: 0, y: 0 }, null, null]);
    expect(r.ajustesVerso).toBeUndefined();
    s = estado();
    expect(ajustesDoEstado(s)).toEqual({ ajustes: undefined, ajustesVerso: undefined });
  });
  test('entradaValida aceita entradas antigas (sem ajustes) e novas; recusa ajustes que não são lista', () => {
    const base: EntradaHistorico = { id: 'a', data: '2026-11-12T10:00:00Z', pdfNome: 'a.pdf', pdfCaminho: 'C:/a.pdf', saidas: { frente: true, vt: false, semCanguru: false, verso: false }, escolhas: [], geradas: 1 };
    expect(entradaValida(base)).toBe(true);
    expect(entradaValida({ ...base, ajustes: [{ zoom: 1.2, x: 0, y: 0 }, null] })).toBe(true);
    expect(entradaValida({ ...base, ajustes: 'oi' })).toBe(false);
  });
});
