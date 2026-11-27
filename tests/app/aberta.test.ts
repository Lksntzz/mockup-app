import { describe, expect, it } from 'vitest';
import { geometriaDaDecoracao, paginaDuplaValida, paginaPadraoDoMiolo, TITULO_PADRAO, tituloLimpo } from '../../src/app/aberta';

describe('paginaPadraoDoMiolo', () => {
  it('PDF com mais de uma página: usa a segunda (a primeira costuma ser o título do miolo)', () => {
    expect(paginaPadraoDoMiolo(2)).toBe(2);
    expect(paginaPadraoDoMiolo(8)).toBe(2);
  });
  it('PDF de uma página só: usa ela', () => {
    expect(paginaPadraoDoMiolo(1)).toBe(1);
  });
});

describe('paginaDuplaValida', () => {
  it('A4 deitada (duas páginas lado a lado) serve', () => {
    expect(paginaDuplaValida(842, 595)).toBe(true);
  });
  it('página em pé ou quadrada não serve', () => {
    expect(paginaDuplaValida(595, 842)).toBe(false);
    expect(paginaDuplaValida(500, 500)).toBe(false);
  });
  it('medida inválida não serve', () => {
    expect(paginaDuplaValida(0, 0)).toBe(false);
  });
});

describe('tituloLimpo', () => {
  it('tira espaços das pontas e repetidos', () => {
    expect(tituloLimpo('  Visão   semanal \n completa ')).toBe('Visão semanal completa');
  });
  it('vazio vira vazio (sem título)', () => {
    expect(tituloLimpo('   ')).toBe('');
  });
  it('limita o tamanho para o título caber na imagem', () => {
    expect(tituloLimpo('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
  it('o título padrão é o combinado', () => {
    expect(TITULO_PADRAO).toBe('Visão semanal completa');
  });
});

describe('geometriaDaDecoracao', () => {
  const g = geometriaDaDecoracao(600, 291);

  it('a seta fica inteira acima do livro, com a ponta virada para a esquerda e para baixo', () => {
    const todos = [...g.seta.corpo, ...g.seta.ponta];
    expect(Math.max(...todos.map((p) => p[1]))).toBeLessThan(291);
    const ponta = g.seta.ponta.reduce((a, p) => (p[1] > a[1] ? p : a));
    expect(ponta[0]).toBeLessThan(600);
    expect(ponta[1]).toBeGreaterThan(Math.max(...g.seta.corpo.map((p) => p[1])) - 1);
  });

  it('o corpo é um contorno fechado e fino na cauda, grosso perto da ponta', () => {
    expect(g.seta.corpo.length).toBeGreaterThan(100);
    expect(g.seta.ponta).toHaveLength(3);
  });

  it('o título fica centralizado na lombada e acima da seta', () => {
    expect(g.titulo.x).toBe(600);
    const topoDaSeta = Math.min(...g.seta.corpo.map((p) => p[1]));
    expect(g.titulo.y).toBeLessThan(topoDaSeta);
    expect(g.titulo.y).toBeGreaterThan(0);
  });

  it('o degradê da cor anda da cauda para a ponta', () => {
    const { de, para } = g.seta.gradiente;
    const ponta = g.seta.ponta[1] as [number, number];
    expect(Math.hypot(para[0] - de[0], para[1] - de[1])).toBeCloseTo(180 / Math.hypot(-0.6, 0.9), 0);
    expect(para[1]).toBeGreaterThan(de[1]);
    expect(para[0]).toBeLessThan(de[0]);
    expect(ponta[1]).toBeGreaterThan(de[1]);
  });

  it('acompanha o livro: mudando o topo e a lombada, tudo anda junto', () => {
    const h = geometriaDaDecoracao(650, 341);
    expect(h.titulo.x).toBe(650);
    expect(h.titulo.y - g.titulo.y).toBe(50);
    expect((h.seta.ponta[1] as [number, number])[0] - (g.seta.ponta[1] as [number, number])[0]).toBe(50);
  });
});
