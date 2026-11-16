import { describe, expect, test } from 'vitest';
import { escaparHtml, htmlDaPagina, inicialDoNome, validarEntrada } from '../src/personalizar/modelo';

describe('inicialDoNome', () => {
  test.each([
    ['Cecília', 'C'],
    ['  ágata', 'Á'],
    ['maria eduarda', 'M'],
    ['  ', ''],
    ['123', ''],
  ])('%s -> %s', (n, i) => expect(inicialDoNome(n)).toBe(i));
});

describe('validarEntrada', () => {
  test('aceita nome e limpa espaços', () => {
    expect(validarEntrada({ nome: '  Maria   Eduarda ', inicial: 'M', copias: 2 })).toEqual({ ok: true, nome: 'Maria Eduarda', inicial: 'M', copias: 2 });
  });
  test.each([
    [{ nome: '', inicial: 'M' }],
    [{ nome: 'a'.repeat(51), inicial: 'M' }],
    [{ nome: 'Ana<b>', inicial: 'A' }],
    [{ nome: 'Ana', inicial: '' }],
    [{ nome: 'Ana', inicial: 'ABC' }],
    [{ nome: 42, inicial: 'A' }],
  ])('recusa %j', (e) => expect(validarEntrada(e).ok).toBe(false));
  test('quantidade: 1 a 99, inteira, obrigatória ao imprimir', () => {
    expect(validarEntrada({ nome: 'Ana', inicial: 'A', copias: 0 }).ok).toBe(false);
    expect(validarEntrada({ nome: 'Ana', inicial: 'A', copias: 100 }).ok).toBe(false);
    expect(validarEntrada({ nome: 'Ana', inicial: 'A', copias: 1.5 }).ok).toBe(false);
    expect(validarEntrada({ nome: 'Ana', inicial: 'A' }, true).ok).toBe(false);
    expect(validarEntrada({ nome: 'Ana', inicial: 'A' }).ok).toBe(true);
  });
});

describe('htmlDaPagina', () => {
  const r = { arteUrl: 'file:///a/arte.png', fonteNomeUrl: 'file:///a/c.otf', fonteInicialUrl: 'file:///a/s.ttf' };
  test('nome com aspas e tag vira texto, nunca HTML', () => {
    const h = htmlDaPagina(r, `Ana"><img src=x>`, 'A');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img');
  });
  test('primeira letra com ss03 e última com ss02', () => {
    const h = htmlDaPagina(r, 'Cecília', 'C');
    expect(h).toContain('<span class="a">C</span>ecíli<span class="z">a</span>');
  });
  test('nome de uma letra só não repete a letra', () => {
    expect(htmlDaPagina(r, 'A', 'A')).toContain('<span class="a">A</span><span class="z"></span>');
  });
  test('URL com aspas é neutralizada', () => {
    expect(htmlDaPagina({ ...r, arteUrl: 'file:///a/"x".png' }, 'Ana', 'A')).not.toContain('"x"');
  });
  test('escaparHtml', () => expect(escaparHtml(`<&"'>`)).toBe('&lt;&amp;&quot;&#39;&gt;'));
});
