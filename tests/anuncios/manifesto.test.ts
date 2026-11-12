import { describe, expect, test } from 'vitest';
import { lerManifesto, montarManifesto } from '../../src/anuncios/manifesto';

describe('manifesto', () => {
  const capas = [{ frente: 'a.pdf', paginaFrente: 1, verso: 'a.pdf', paginaVerso: 2, ean: '7898764983584' }, { ean: '7898764983362' }];
  test('vai e volta sem perder nada e traz os 95 módulos', () => {
    const texto = montarManifesto({ destino: 'C:\\A\\x.cdr', capas });
    expect(texto.split('\r\n')[2]).toMatch(/mod=[01]{95}$/);
    expect(lerManifesto(texto)).toEqual({ destino: 'C:\\A\\x.cdr', capas });
  });
  test('lerManifesto aceita LF e linha final vazia', () => {
    const texto = montarManifesto({ destino: 'd.cdr', capas }).replace(/\r\n/g, '\n') + '\n';
    expect(lerManifesto(texto)).toEqual({ destino: 'd.cdr', capas });
  });
  test('recusa "|" e quebras de linha nos campos', () => {
    expect(() => montarManifesto({ destino: 'd.cdr', capas: [{ frente: 'a|b.pdf', ean: '7898764983584' }] })).toThrow(/inválid/);
    expect(() => montarManifesto({ destino: 'd\n.cdr', capas })).toThrow(/inválid/);
    expect(() => montarManifesto({ destino: 'd.cdr', capas: [{ verso: 'a\r.pdf', ean: '7898764983584' }] })).toThrow(/inválid/);
  });
  test('recusa EAN inválido', () => {
    expect(() => montarManifesto({ destino: 'd.cdr', capas: [{ ean: '123' }] })).toThrow(/EAN-13 inválido/);
  });
  test('escrita recusa página que não seja inteiro >= 1', () => {
    for (const n of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => montarManifesto({ destino: 'd.cdr', capas: [{ paginaFrente: n, ean: '7898764983584' }] })).toThrow(/pf/);
      expect(() => montarManifesto({ destino: 'd.cdr', capas: [{ paginaVerso: n, ean: '7898764983584' }] })).toThrow(/pv/);
    }
  });
  test('leitura recusa página malformada e aceita 1 e 12', () => {
    const base = montarManifesto({ destino: 'd.cdr', capas: [{ frente: 'a.pdf', paginaFrente: 1, verso: 'a.pdf', paginaVerso: 12, ean: '7898764983584' }] });
    expect(lerManifesto(base).capas).toEqual([{ frente: 'a.pdf', paginaFrente: 1, verso: 'a.pdf', paginaVerso: 12, ean: '7898764983584' }]);
    expect(() => lerManifesto(base.replace('pf=1', 'pf=abc'))).toThrow(/pf/);
    expect(() => lerManifesto(base.replace('pf=1', 'pf=0'))).toThrow(/pf/);
    expect(() => lerManifesto(base.replace('pv=12', 'pv=1.5'))).toThrow(/pv/);
  });
});
