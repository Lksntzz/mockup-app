import { describe, expect, it } from 'vitest';
import { aplicarPar, aplicarPdf, formVazio } from '../../src/app/anuncios-form';
import { caminhoPrevisto, limparArte, removerPar, ehArteAceita, ehPdf, montarEntrada, textoDaEtapaCorel } from '../../src/app/anuncios-ui';

describe('anuncios-ui', () => {
  it('aceita só pdf/png/jpg/jpeg sem ligar para maiúsculas', () => {
    expect(ehArteAceita('C:\\a\\Arte.PDF')).toBe(true);
    expect(ehArteAceita('x.JPeG')).toBe(true);
    expect(ehArteAceita('x.gif')).toBe(false);
    expect(ehArteAceita('semextensao')).toBe(false);
    expect(ehPdf('a.pdf')).toBe(true);
  });
  it('monta a entrada com raiz vazia e textos aparados', () => {
    const f = { ...aplicarPdf(formVazio(), '/x/Arte.pdf', 4), plataforma: 'Shopee', categoria: 'Capa dura', titulo: '  T  ' };
    const e = montarEntrada(f);
    expect(e.raiz).toBe('');
    expect(e.titulo).toBe('T');
    expect(e.arte).toBe('Arte');
    expect(e.variacoes).toHaveLength(2);
    expect(e.fontes).toHaveLength(2);
  });
  it('mostra o caminho com o nome seguro', () => {
    expect(caminhoPrevisto({ ...formVazio(), plataforma: 'Shopee', categoria: 'C', arte: 'a/b' })).toMatch(/^Shopee \/ C \/ .+/);
    expect(caminhoPrevisto(formVazio())).toBe('');
  });
  it('explica cada etapa do Corel', () => {
    expect(textoDaEtapaCorel('feito')).toContain('montado');
    expect(textoDaEtapaCorel('aguardando-clique')).toContain('AnuncioDaPasta');
    expect(textoDaEtapaCorel(undefined)).toBe('');
  });
  it('limparArte mantém os textos e zera capas e linhas', () => {
    const f = { ...aplicarPdf(formVazio(), '/x/A.pdf', 4), plataforma: 'S', categoria: 'C', titulo: 'T' };
    const l = limparArte(f);
    expect(l).toMatchObject({ plataforma: 'S', categoria: 'C', titulo: 'T', arte: 'A', origem: 'nenhuma', fontes: [], variacoes: [] });
  });
  it('removerPar tira o par e a linha; sem pares volta a nenhuma', () => {
    let f = aplicarPar(formVazio(), 0, { capa: '/a.png', contra: '/b.png' });
    f = aplicarPar(f, 1, { capa: '/c.png' });
    const r = removerPar(f, 0);
    expect(r.fontes).toHaveLength(1);
    expect(r.variacoes).toHaveLength(1);
    expect(removerPar(r, 0).origem).toBe('nenhuma');
    expect(removerPar(f, 9)).toBe(f);
    expect(f.fontes).toHaveLength(2);
  });
});
