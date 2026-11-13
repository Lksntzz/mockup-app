import { describe, expect, it } from 'vitest';
import { aplicarProgresso, fecharPassosPendentes, passosIniciais, svgParaDataUri, tituloFinal } from '../../src/app/anuncios-passos';

describe('anuncios-passos', () => {
  it('passosIniciais: 4 passos em ordem, todos em espera', () => {
    const p = passosIniciais();
    expect(p.map((x) => x.etapa)).toEqual(['pasta', 'arte', 'barras', 'corel']);
    expect(p.every((x) => x.estado === 'espera')).toBe(true);
    expect(p[0]!.rotulo).toBe('Criando a pasta e o arquivo .txt');
    expect(p[3]!.rotulo).toBe('Abrindo o Corel e montando o arquivo');
  });
  it('aplicarProgresso troca só o passo pedido, sem mutar', () => {
    const p = passosIniciais();
    const n = aplicarProgresso(p, 'arte', 'andamento');
    expect(n.map((x) => x.estado)).toEqual(['espera', 'andamento', 'espera', 'espera']);
    expect(p[1]!.estado).toBe('espera');
  });
  it('aplicarProgresso ignora etapa ou estado desconhecido', () => {
    const p = passosIniciais();
    expect(aplicarProgresso(p, 'xyz', 'feito')).toBe(p);
    expect(aplicarProgresso(p, 'arte', 'xyz')).toBe(p);
  });
  it('fecharPassosPendentes transforma andamento em erro', () => {
    const p = aplicarProgresso(aplicarProgresso(passosIniciais(), 'pasta', 'feito'), 'arte', 'andamento');
    const n = fecharPassosPendentes(p);
    expect(n.map((x) => x.estado)).toEqual(['feito', 'erro', 'espera', 'espera']);
    expect(p[1]!.estado).toBe('andamento');
  });
  it('tituloFinal', () => {
    const p = passosIniciais();
    expect(tituloFinal(p, { ok: true, avisos: [] })).toBe('Concluído');
    expect(tituloFinal(p, { ok: true, avisos: ['a'] })).toBe('Concluído com avisos');
    expect(tituloFinal(p, { ok: false, avisos: [] })).toBe('Não concluído');
    expect(tituloFinal(p, { ok: true, avisos: [], etapaCorel: 'aguardando-clique' })).toBe('Concluído com avisos');
    expect(tituloFinal(p, { ok: true, avisos: [], etapaCorel: 'erro' })).toBe('Concluído com avisos');
    expect(tituloFinal(aplicarProgresso(p, 'barras', 'erro'), { ok: true, avisos: [] })).toBe('Concluído com avisos');
  });
  it('svgParaDataUri não deixa < nem "', () => {
    const u = svgParaDataUri('<svg a="1"/>');
    expect(u.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(u).not.toMatch(/[<"]/);
  });
});
