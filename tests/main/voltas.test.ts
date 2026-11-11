import { describe, expect, test } from 'vitest';
import type { Cliente } from '../../src/main/clientes';
import { atualizarEtapas, descartarVolta, textoDaVolta } from '../../src/main/voltas';

const cli = (nome: string, etapa: 1 | 2 | 3, extra: Partial<Cliente> = {}): Cliente => ({
  nome,
  caminho: `/x/${nome}`,
  etapa,
  situacao: etapa === 1 ? 'arte-a-fazer' : 'em-etapa',
  faltando: [],
  artes: [],
  arquivos: [],
  chegando: false,
  ...extra,
});
const vazio = { etapas: {}, voltas: {} };

describe('atualizarEtapas (aviso de pasta que voltou)', () => {
  test('na primeira vez só anota onde cada cliente está, sem avisar nada', () => {
    const r = atualizarEtapas(vazio, [cli('ANA', 2), cli('BIA', 1)], 1000);
    expect(r.etapas).toEqual({ ana: 2, bia: 1 });
    expect(r.voltas).toEqual({});
  });
  test('avançar de etapa não é aviso', () => {
    const r = atualizarEtapas({ etapas: { ana: 2 }, voltas: {} }, [cli('ANA', 3)], 1000);
    expect(r.voltas).toEqual({});
    expect(r.etapas.ana).toBe(3);
  });
  test('2 -> 1, 3 -> 2 e 3 -> 1 viram aviso com de, para e quando', () => {
    const r = atualizarEtapas({ etapas: { ana: 2, bia: 3, cris: 3 }, voltas: {} }, [cli('ANA', 1), cli('BIA', 2), cli('CRIS', 1)], 5000);
    expect(r.voltas.ana).toEqual({ de: 2, para: 1, em: 5000 });
    expect(r.voltas.bia).toEqual({ de: 3, para: 2, em: 5000 });
    expect(r.voltas.cris).toEqual({ de: 3, para: 1, em: 5000 });
  });
  test('o aviso fica até alguém dispensar, mesmo nas listagens seguintes', () => {
    const a = atualizarEtapas({ etapas: { ana: 2 }, voltas: {} }, [cli('ANA', 1)], 1000);
    const b = atualizarEtapas(a, [cli('ANA', 1)], 9000);
    expect(b.voltas.ana).toEqual({ de: 2, para: 1, em: 1000 });
  });
  test('cliente com o mesmo nome em duas etapas (duplicado) não gera aviso e não muda o que se sabe', () => {
    const r = atualizarEtapas({ etapas: { ana: 2 }, voltas: {} }, [cli('ANA', 1, { duplicado: true })], 1000);
    expect(r.voltas).toEqual({});
    expect(r.etapas.ana).toBe(2);
  });
  test('cliente dentro de pasta de grupo (SHOPEE) usa "GRUPO / nome" como chave', () => {
    const r = atualizarEtapas({ etapas: { 'shopee / loja': 3 }, voltas: {} }, [cli('LOJA', 2, { grupo: 'SHOPEE' })], 1000);
    expect(r.voltas['shopee / loja']).toEqual({ de: 3, para: 2, em: 1000 });
  });
  test('descartarVolta tira só o aviso daquele cliente', () => {
    const r = descartarVolta({ etapas: { ana: 1 }, voltas: { ana: { de: 2, para: 1, em: 1 }, bia: { de: 3, para: 2, em: 1 } } }, 'ANA');
    expect(Object.keys(r.voltas)).toEqual(['bia']);
  });
  test('texto do aviso diz de onde e para onde', () => {
    expect(textoDaVolta({ de: 2, para: 1, em: 0 })).toBe('Voltou da Pasta 2 para a Pasta 1');
    expect(textoDaVolta({ de: 3, para: 1, em: 0 })).toBe('Voltou da Pasta 3 para a Pasta 1');
  });
});
