import { describe, expect, it } from 'vitest';
import { capasPendentes, linhasDoCard, textoFaltam, validarEansConcluir, validarSkusConcluir } from '../../src/app/anuncios-pendentes-ui';

const card = {
  pasta: 'C:\\x', arte: 'Arte 1', plataforma: 'Shopee', categoria: 'TESTE', subcategoria: 'SUB',
  capas: [{ n: 1, capa: 'Capa 1', faltaEan: true, faltaSku: false }, { n: 3, capa: '', faltaEan: true, faltaSku: true }],
};

describe('linhasDoCard', () => {
  it('monta título, caminho e o que falta', () => {
    const l = linhasDoCard(card);
    expect(l.titulo).toBe('Arte 1');
    expect(l.caminho).toBe('Shopee › TESTE › SUB');
    expect(l.falta[0]).toBe('Falta: EAN da capa 1 (Capa 1), EAN da capa 3 (Capa 3), SKU da capa 3 (Capa 3)');
  });
  it('sem subcategoria e com erro', () => {
    const l = linhasDoCard({ ...card, subcategoria: undefined, erro: 'ruim' });
    expect(l.caminho).toBe('Shopee › TESTE');
    expect(l.erro).toBe('ruim');
  });
});

describe('validarEansConcluir', () => {
  it('aceita válido, ignora vazio', () => {
    const v = validarEansConcluir({ 1: '7891234567895', 3: '' });
    expect(v.podeSalvar).toBe(true);
    expect(v.eans).toEqual({ 1: '7891234567895' });
  });
  it('rejeita inválido e repetido', () => {
    const v = validarEansConcluir({ 1: '7891234567896', 2: '7891234567895', 3: '7891234567895' });
    expect(v.erros[1]).toMatch(/inválido/);
    expect(v.erros[3]).toMatch(/repetido/);
    expect(v.podeSalvar).toBe(false);
  });
  it('nada preenchido não salva', () => {
    expect(validarEansConcluir({ 1: '' }).podeSalvar).toBe(false);
  });
});

describe('textos', () => {
  it('capasPendentes e faltam', () => {
    expect(capasPendentes(card)).toHaveLength(2);
    expect(textoFaltam(1)).toBe('Ainda falta 1 capa');
    expect(textoFaltam(2)).toBe('Ainda faltam 2 capas');
  });
});

import { textoOrientacaoCorel } from '../../src/app/anuncios-pendentes-ui';
describe('textoOrientacaoCorel', () => {
  it('caminho do menu e alternativa Alt + F11', () => {
    const t = textoOrientacaoCorel(false);
    expect(t).toContain('Ferramentas › Scripts › Executar script… › GlobalMacros › MKP › AdicionarEanNoCdr');
    expect(t).toContain('ou Alt + F11, escolha o módulo MKP e aperte F5 com o cursor dentro de AdicionarEanNoCdr');
    expect(t).not.toMatch(/MKP\.AdicionarEanNoCdr/);
  });
  it('sem .cdr montado manda montar primeiro', () => {
    expect(textoOrientacaoCorel(true)).toContain('Monte o .cdr primeiro (Montar no Corel) e depois rode a macro AdicionarEanNoCdr');
    expect(textoOrientacaoCorel(true)).not.toContain('abra o arquivo .cdr');
  });
});

describe('validarSkusConcluir', () => {
  it('ignora vazio, recusa | e só avisa repetido', () => {
    const v = validarSkusConcluir({ 1: ' ABC ', 2: 'A|B', 3: 'ABC', 4: '' });
    expect(v.skus).toEqual({ 1: 'ABC', 3: 'ABC' });
    expect(v.erros[2]).toMatch(/\|/);
    expect(v.avisos[3]).toMatch(/capa 1/);
  });
});
