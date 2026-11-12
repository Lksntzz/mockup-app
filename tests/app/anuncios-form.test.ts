import { describe, expect, test } from 'vitest';
import {
  adicionarPar, aplicarPar, aplicarPdf, definirVariacao, formVazio, validar, type FormAnuncio,
} from '../../src/app/anuncios-form';

const base = (): FormAnuncio => ({ ...formVazio(), plataforma: 'shopee', categoria: 'Agendas', arte: 'Tulipa', titulo: 'Agenda Tulipa' });
function comLinhas(campos: { ean?: string[]; sku?: string[] }): FormAnuncio {
  let f = aplicarPdf(base(), 'x.pdf', 4);
  const eans = campos.ean ?? ['7898764983584', '7891000100103'];
  eans.forEach((e, i) => { f = definirVariacao(f, i, 'ean', e); });
  (campos.sku ?? ['A', 'B']).forEach((s, i) => { f = definirVariacao(f, i, 'sku', s); });
  return f;
}

describe('anuncios-form', () => {
  test('PDF de 6 páginas cria 3 linhas e a de 3 páginas cria 2', () => {
    expect(aplicarPdf(formVazio(), 'C:\\x\\Tulipa.pdf', 6).variacoes).toHaveLength(3);
    expect(aplicarPdf(formVazio(), 'C:\\x\\Tulipa.pdf', 3).variacoes).toHaveLength(2);
  });
  test('arte sugerida pelo nome do arquivo só se vazia', () => {
    expect(aplicarPdf(formVazio(), 'C:\\x\\Tulipa.pdf', 2).arte).toBe('Tulipa');
    expect(aplicarPdf(formVazio(), '/a/b/Rosa.v2.pdf', 2).arte).toBe('Rosa.v2');
    expect(aplicarPdf({ ...formVazio(), arte: 'Minha' }, 'Outra.pdf', 2).arte).toBe('Minha');
  });
  test('PDF sem páginas deixa o formulário sem capas e diz por quê', () => {
    const f = aplicarPdf(formVazio(), 'a.pdf', 0);
    expect(f.variacoes).toHaveLength(0);
    expect(validar(f).erros.geral).toMatch(/páginas/);
  });
  test('adicionarPar só funciona com imagens', () => {
    const p = aplicarPdf(formVazio(), 'a.pdf', 2);
    expect(adicionarPar(p)).toBe(p);
    const i = aplicarPar(formVazio(), 0, { capa: 'c.png' });
    const j = adicionarPar(i);
    expect(j.fontes).toHaveLength(2);
    expect(j.variacoes).toHaveLength(2);
    expect(j.fontes[1]).toEqual({ tipo: 'imagem', capa: '' });
    expect(adicionarPar(formVazio())).toEqual(formVazio());
  });
  test('aplicarPar no índice final acrescenta; no existente atualiza; após PDF recomeça', () => {
    const a = aplicarPar(formVazio(), 0, { capa: 'c.png', contra: 'v.png' });
    expect(a.origem).toBe('imagens');
    expect(a.fontes).toEqual([{ tipo: 'imagem', capa: 'c.png', contra: 'v.png' }]);
    expect(a.variacoes).toHaveLength(1);
    const b = aplicarPar(a, 0, { contra: 'v2.png' });
    expect(b.fontes[0]).toEqual({ tipo: 'imagem', capa: 'c.png', contra: 'v2.png' });
    const c = aplicarPar(aplicarPdf(formVazio(), 'a.pdf', 6), 0, { capa: 'n.png' });
    expect(c.origem).toBe('imagens');
    expect(c.fontes).toHaveLength(1);
    expect(c.variacoes).toHaveLength(1);
  });
  test('par de imagem sem capa bloqueia', () => {
    const f = adicionarPar(aplicarPar(base(), 0, { capa: 'c.png' }));
    const v = validar(f);
    expect(v.erros.geral).toBe('Escolha a imagem da capa');
    expect(v.podeCriar).toBe(false);
  });
  test('definirVariacao não muta e ignora índice fora', () => {
    const f = aplicarPdf(base(), 'a.pdf', 2);
    const g = definirVariacao(f, 0, 'sku', 'Z');
    expect(f.variacoes[0]?.sku).toBe('');
    expect(g.variacoes[0]?.sku).toBe('Z');
    expect(definirVariacao(f, 5, 'sku', 'Z')).toBe(f);
    expect(definirVariacao(f, -1, 'sku', 'Z')).toBe(f);
  });
  test('EAN inválido marca a linha e impede criar; EAN colado com espaços vale', () => {
    const ruim = validar(comLinhas({ ean: ['123', '7891000100103'] }));
    expect(ruim.erros.ean[0]).toBeTruthy();
    expect(ruim.podeCriar).toBe(false);
    const vazio = validar(comLinhas({ ean: ['', '7891000100103'] }));
    expect(vazio.erros.ean[0]).not.toBe(ruim.erros.ean[0]);
    expect(vazio.podeCriar).toBe(false);
    const ok = validar(comLinhas({ ean: [' 789 8764983584\n', '7891000100103'] }));
    expect(ok.erros.ean).toEqual({});
    expect(ok.podeCriar).toBe(true);
  });
  test('EAN repetido bloqueia; SKU repetido só avisa', () => {
    const v = validar(comLinhas({ ean: ['7898764983584', '7898764983584'] }));
    expect(v.podeCriar).toBe(false);
    expect(v.erros.ean[1]).toMatch(/repet/i);
    const w = validar(comLinhas({ sku: ['A', 'A'] }));
    expect(w.podeCriar).toBe(true);
    expect(w.avisos.join(' ')).toMatch(/SKU/);
  });
  test('nome da arte com caractere proibido: pode criar e o aviso mostra o nome final', () => {
    const f = { ...comLinhas({}), arte: 'Tulipa: 2027' };
    const v = validar(f);
    expect(v.podeCriar).toBe(true);
    expect(v.avisos.join(' ')).toContain('A pasta se chamará "Tulipa- 2027"');
  });
  test('nome de arte que vira vazio bloqueia', () => {
    const v = validar({ ...comLinhas({}), arte: '. ' });
    expect(v.erros.arte).toBeTruthy();
    expect(v.podeCriar).toBe(false);
  });
  test('formulário completo é válido; faltas bloqueiam', () => {
    expect(validar(comLinhas({})).podeCriar).toBe(true);
    expect(validar({ ...comLinhas({}), titulo: ' \n ' }).erros.titulo).toBeTruthy();
    expect(validar({ ...comLinhas({}), plataforma: '' }).podeCriar).toBe(false);
    expect(validar({ ...comLinhas({}), categoria: '' }).podeCriar).toBe(false);
    expect(validar(formVazio()).podeCriar).toBe(false);
  });
});
