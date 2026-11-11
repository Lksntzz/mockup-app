import { describe, expect, test } from 'vitest';
import { fontesDaArte, frenteEVersoPadrao, rotuloDaFonte } from '../../src/app/frente-verso';

const f = (caminho: string, pagina?: number) => (pagina ? { caminho, pagina } : { caminho });

describe('frenteEVersoPadrao', () => {
  test('uma imagem só: é a frente e o verso fica sem arte (o designer cria depois)', () => {
    expect(frenteEVersoPadrao(['/c/arte.png'])).toEqual({ frente: f('/c/arte.png') });
  });
  test('duas imagens: a de nome verso/costas/trás/back é o verso, a outra é a frente', () => {
    expect(frenteEVersoPadrao(['/c/VERSO.png', '/c/frente.png'])).toEqual({ frente: f('/c/frente.png'), verso: f('/c/VERSO.png') });
    expect(frenteEVersoPadrao(['/c/capa.jpg', '/c/capa costas.jpg'])).toEqual({ frente: f('/c/capa.jpg'), verso: f('/c/capa costas.jpg') });
  });
  test('duas imagens sem pista no nome: a primeira em ordem alfabética é a frente', () => {
    expect(frenteEVersoPadrao(['/c/2.png', '/c/1.png'])).toEqual({ frente: f('/c/1.png'), verso: f('/c/2.png') });
  });
  test('só uma imagem com nome de verso: não inventa frente', () => {
    expect(frenteEVersoPadrao(['/c/verso.png'])).toEqual({ verso: f('/c/verso.png') });
  });
  test('um PDF: página 1 é a frente e página 2 é o verso', () => {
    expect(frenteEVersoPadrao(['/c/arte.pdf'])).toEqual({ frente: f('/c/arte.pdf', 1), verso: f('/c/arte.pdf', 2) });
  });
  test('imagens têm prioridade sobre PDF; sem arquivo nenhum não escolhe nada', () => {
    expect(frenteEVersoPadrao(['/c/a.pdf', '/c/b.png'])).toEqual({ frente: f('/c/b.png') });
    expect(frenteEVersoPadrao([])).toEqual({});
  });
});

describe('fontesDaArte e rotulo', () => {
  test('imagem vira uma fonte; PDF vira duas (página 1 e 2)', () => {
    expect(fontesDaArte(['/c/a.png', '/c/b.pdf'])).toEqual([f('/c/a.png'), f('/c/b.pdf', 1), f('/c/b.pdf', 2)]);
  });
  test('rótulo mostra o nome e a página', () => {
    expect(rotuloDaFonte(f('I:\\x\\arte.pdf', 2))).toBe('arte.pdf — página 2');
    expect(rotuloDaFonte(f('/x/foto.png'))).toBe('foto.png');
  });
});
