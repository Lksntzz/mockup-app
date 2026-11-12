import { describe, expect, it } from 'vitest';
import { aplicarPdf, formVazio } from './anuncios-form';
import { caminhoPrevisto, ehArteAceita, ehPdf, montarEntrada, textoDaEtapaCorel } from './anuncios-ui';

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
});
