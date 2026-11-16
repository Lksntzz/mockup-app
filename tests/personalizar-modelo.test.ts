import { describe, expect, test } from 'vitest';
import { escaparHtml, htmlDaPagina, formatoDaArte, inicialDoNome, letraHtml, semAcento, validarEntrada } from '../src/personalizar/modelo';

describe('inicialDoNome', () => {
  test.each([
    ['Cecília', 'C'],
    ['  ágata', 'A'],
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

describe('acentos desenhados por cima (letraHtml)', () => {
  test('letra sem acento sai como texto puro', () => {
    expect(letraHtml('a')).toBe('a');
    expect(letraHtml('<')).toBe('&lt;');
  });

  test('letra acentuada vira a letra sem acento + desenho do acento', () => {
    const h = letraHtml('é');
    expect(h).toMatch(/^<svg class="ac" [^>]*><path d="M[^"]+"\/><\/svg>e$/);
    expect(h).not.toContain('é');
  });

  test.each(['Á', 'À', 'Â', 'Ã', 'Ä', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú', 'Ü', 'Ç', 'Ñ', 'á', 'à', 'â', 'ã', 'é', 'ê', 'ó', 'ô', 'õ', 'ú', 'ü', 'ç', 'ñ'])(
    'o português tem acento desenhado para %s',
    (c) => {
      expect(letraHtml(c)).toContain('<path d="M');
    },
  );

  test('i minúsculo acentuado usa a letra pronta da fonte (o acento substitui o pingo)', () => {
    expect(letraHtml('í')).toBe('í');
    expect(letraHtml('ì')).toBe('ì');
  });

  test('na letra de início (maiúscula) o deslocamento do corpo da letra é medido na página, não copiado de uma versão da fonte', () => {
    expect(letraHtml('Á', true)).toContain('data-b="A"');
    expect(letraHtml('Á', false)).not.toContain('data-b');
    expect(letraHtml('á', true)).not.toContain('data-b'); // minúscula não tem variação de início
    expect(letraHtml('Á', true)).not.toMatch(/--dx:\d/);
  });

  test('a página usa onda no início e no fim do nome inteiro e acentos nas letras do meio', () => {
    const r = { arteUrl: 'file:///a.jpg' };
    const h = htmlDaPagina(r, 'Ágata Zoé', 'Á');
    expect(h).toMatch(/<span class="a"><svg[^>]*><path[^>]*\/><\/svg>A<\/span>/);
    expect(h).toMatch(/<span class="z"><svg[^>]*><path[^>]*\/><\/svg>e<\/span>/);
    expect(h).not.toMatch(/<span class="a">[^<]*<\/span>.*class="a"/s);
  });

  test('nome digitado com acento "solto" (a + marca, como vem de alguns teclados) também funciona', () => {
    const r = { arteUrl: 'file:///a.jpg' };
    const solto = 'Jose\u0301'; // José com o acento como caractere separado
    expect(htmlDaPagina(r, solto, 'J')).toContain('<path d="M');
  });
});

describe('fontes do Windows (sem arquivo de fonte no app)', () => {
  const r = { arteUrl: 'file:///a.jpg' };
  test('a página pede as fontes instaladas pelo nome e não carrega arquivo de fonte', () => {
    const h = htmlDaPagina(r, 'Ana', 'A');
    expect(h).toContain('local("Cream Candy")');
    expect(h).toContain('local("Century751 BT")');
    expect(h).not.toMatch(/url\("[^"]*\.(otf|ttf)"\)/i);
  });
  test('a página avisa quando uma fonte não está instalada', () => {
    expect(htmlDaPagina(r, 'Ana', 'A')).toContain('window.__fonteFaltando');
  });
});

describe('formato da arte (A4 inteira ou só o quadro de 195 x 255 mm)', () => {
  test.each([
    [2481, 3509, 'a4'],
    [2480, 3508, 'a4'],
    [1000, 1414, 'a4'],
    [2303, 3011, 'quadro'], // 195 x 255 mm a 300 dpi ≈ 2303 x 3011
    [1950, 2550, 'quadro'],
    [1000, 1000, 'a4'], // proporção desconhecida: não deforma por conta própria
    [0, 0, 'a4'],
  ])('imagem %i x %i → %s', (l, a, esperado) => {
    expect(formatoDaArte(l, a)).toBe(esperado);
  });

  test('a página coloca o quadro centralizado e em tamanho real, e a A4 esticada na folha toda', () => {
    const base = { arteUrl: 'file:///a.png' };
    expect(htmlDaPagina({ ...base, formato: 'quadro' }, 'Ana', 'A')).toContain('7.5mm 21mm/195mm 255mm no-repeat');
    expect(htmlDaPagina(base, 'Ana', 'A')).toContain('0mm 0mm/210mm 297mm no-repeat');
  });
});

describe('letra grande sem acento', () => {
  test.each([['Ísis', 'I'], ['Ágata', 'A'], ['çarina', 'C'], ['ângela', 'A'], ['Zoé', 'Z']])('%s -> %s', (n, i) => expect(inicialDoNome(n)).toBe(i));
  test('mesmo se o operador digitar com acento, vale a letra sem acento', () => {
    const v = validarEntrada({ nome: 'Ísis', inicial: 'Í' });
    expect(v.ok && v.inicial).toBe('I');
    expect(semAcento('Ç')).toBe('C');
  });
});
