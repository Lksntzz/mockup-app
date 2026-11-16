import { describe, expect, test } from 'vitest';
import { escaparHtml, htmlDaPagina, inicialDoNome, DESCE_CIRCUNFLEXO, letraHtml, MODELOS, modeloPorId, nomeHtml, semAcento, validarEntrada } from '../src/personalizar/modelo';
import { FONTES_ACENTOS } from '../src/personalizar/acentos';

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
    expect(h).toMatch(/^<svg class="ac" [^>]*><path [^>]*d="M[^"]+"\/><\/svg>e$/);
    expect(h).not.toContain('é');
  });

  test.each(['Á', 'À', 'Â', 'Ã', 'Ä', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú', 'Ü', 'Ç', 'Ñ', 'á', 'à', 'â', 'ã', 'é', 'ê', 'ó', 'ô', 'õ', 'ú', 'ü', 'ç', 'ñ'])(
    'o português tem acento desenhado para %s',
    (c) => {
      expect(letraHtml(c)).toContain(' d="M');
    },
  );

  test('i minúsculo acentuado usa a letra pronta da fonte (o acento substitui o pingo)', () => {
    expect(letraHtml('í')).toBe('í');
    expect(letraHtml('ì')).toBe('ì');
  });

  test('na letra de início (maiúscula) o acento acompanha o corpo da letra pela tabela da fonte do designer', () => {
    expect(letraHtml('Á', true)).toMatch(/translate\(9\d\d,2000\)/); // o corpo do A anda ~903 unidades
    expect(letraHtml('Á', false)).toContain('translate(0,2000)');
    expect(letraHtml('á', true)).toContain('translate(0,2000)'); // minúscula não tem variação de início
  });

  test('a página só mede a fonte para avisar se é de outra versão; não muda a posição dos acentos por conta própria', () => {
    const h = htmlDaPagina({ arteUrl: 'file:///a.jpg' }, 'Ísis', 'I');
    expect(h).toContain('window.__fonteDiferente');
    expect(h).toContain('window.__largurasFonte');
    expect(h).not.toContain('setProperty(\'--dx\'');
    expect(h).not.toContain('__escalaFonte');
    expect(h).not.toContain('--k'); // o tamanho do acento vem só do layout (em), sem script
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
    expect(htmlDaPagina(r, solto, 'J')).toContain(' d="M');
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

describe('catálogo de artes', () => {
  test('a lista tem a Caderneta de Saúde primeiro e a Delicate; ids únicos', () => {
    expect(MODELOS.map((m) => m.id)).toEqual(['caderneta-saude', 'delicate']);
    expect(new Set(MODELOS.map((m) => m.id)).size).toBe(MODELOS.length);
  });
  test('modeloPorId: vazio é o padrão; id desconhecido não vira outra arte', () => {
    expect(modeloPorId(undefined)?.id).toBe('caderneta-saude');
    expect(modeloPorId('')?.id).toBe('caderneta-saude');
    expect(modeloPorId('delicate')?.titulo).toBe('Delicate');
    expect(modeloPorId('nao-existe')).toBeUndefined();
    expect(modeloPorId(42)).toBeUndefined();
  });
  test('toda fonte de nome do catálogo tem tabela de acentos gerada', () => {
    for (const m of MODELOS) expect(FONTES_ACENTOS[m.fonteNome.acentos], m.id).toBeDefined();
  });
});

describe('a página usa o modelo escolhido', () => {
  const caderneta = MODELOS[0]!;
  const delicate = MODELOS[1]!;
  test('a arte cobre a folha A4 inteira', () => {
    expect(htmlDaPagina({ arteUrl: 'file:///a.png' }, 'Ana', 'A')).toContain('0 0/100% 100% no-repeat');
  });
  test('Delicate: fontes, cor, variações da Angelina Malika e a camada da frente por cima da letra e abaixo do nome', () => {
    const h = htmlDaPagina({ arteUrl: 'file:///a.jpg', frenteUrl: 'file:///f.png', modelo: delicate }, 'Eloa', 'E');
    expect(h).toContain('local("Angelina Malika")');
    expect(h).toContain('local("Lucida Bright")');
    expect(h).toContain('.a{font-feature-settings:"ss02"}.z{font-feature-settings:"ss06"}');
    expect(h).toContain('#CC93AD');
    const i = h.indexOf('id="ini"');
    const f = h.indexOf('class="fr"');
    const n = h.indexOf('id="nome"');
    expect(i).toBeGreaterThan(-1);
    expect(f).toBeGreaterThan(i); // a camada fica depois da letra grande...
    expect(n).toBeGreaterThan(f); // ...e antes do nome
    expect(h).toContain('url("file:///f.png")');
  });
  test('Caderneta: Cream Candy com ss03/ss02 e sem camada da frente', () => {
    const h = htmlDaPagina({ arteUrl: 'file:///a.jpg', modelo: caderneta }, 'Ana', 'A');
    expect(h).toContain('.a{font-feature-settings:"ss03"}.z{font-feature-settings:"ss02"}');
    expect(h).not.toContain('class="fr"');
  });
  test('os acentos usam a tabela e a escala (em) da fonte do modelo', () => {
    const cc = nomeHtml('aéa', caderneta);
    const am = nomeHtml('aéa', delicate);
    expect(cc).toContain('viewBox="0 0 1000 2000"');
    expect(am).toContain('viewBox="0 0 1300 2600"');
    expect(cc).not.toBe(am);
  });
  test('o circunflexo desce proporcionalmente ao tamanho (upm) da fonte', () => {
    const am = letraHtml('Â', false, FONTES_ACENTOS.angelinaMalika);
    expect(am).toContain(`translate(0,${2600 + Math.round((DESCE_CIRCUNFLEXO * 1300) / 1000)})`);
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

describe('circunflexo desce um pouco', () => {
  test('só o ^ é descido; agudo e til ficam onde a fonte põe', () => {
    expect(letraHtml('Â')).toContain(`translate(0,${2000 + DESCE_CIRCUNFLEXO})`);
    expect(letraHtml('ê')).toContain(`translate(0,${2000 + DESCE_CIRCUNFLEXO})`);
    expect(letraHtml('Á')).toContain('translate(0,2000)');
    expect(letraHtml('ã')).toContain('translate(0,2000)');
  });
});

describe('troca só do nome (prévia reaproveita a janela)', () => {
  test('nomeHtml é exatamente o miolo do nome que a página usa', () => {
    const h = htmlDaPagina({ arteUrl: 'file:///a.jpg' }, 'Ísis', 'I');
    expect(h).toContain(`<div class="nome" id="nome">${nomeHtml('Ísis')}</div>`);
  });
  test('a página oferece __atualizar e __ajustar para trocar nome e letra sem recarregar', () => {
    const h = htmlDaPagina({ arteUrl: 'file:///a.jpg' }, 'Ana', 'A');
    expect(h).toContain('window.__atualizar=');
    expect(h).toContain('window.__ajustar=');
  });
});

describe('letra grande com acento (por arte)', () => {
  test('por padrão sem acento; com a permissão da arte, mantém o acento em maiúscula', () => {
    expect(inicialDoNome('ágata')).toBe('A');
    expect(inicialDoNome('ágata', true)).toBe('Á');
    expect(inicialDoNome('Ísis', true)).toBe('Í');
    expect(inicialDoNome('  çarina', true)).toBe('Ç');
    expect(inicialDoNome('123', true)).toBe('');
  });
  test('validarEntrada tira o acento da letra grande, a menos que a arte deixe', () => {
    const e = { nome: 'Ágata', inicial: 'Á' };
    const sem = validarEntrada(e);
    expect(sem.ok && sem.inicial).toBe('A');
    const com = validarEntrada(e, false, true);
    expect(com.ok && com.inicial).toBe('Á');
  });
  test('as duas artes deixam acento na letra grande', () => {
    expect(modeloPorId('delicate')?.inicialComAcento).toBe(true);
    expect(modeloPorId('caderneta-saude')?.inicialComAcento).toBe(true);
  });
});
