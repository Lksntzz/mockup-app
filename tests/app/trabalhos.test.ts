import { describe, expect, it } from 'vitest';
import { criarTrabalhos, type Trabalho } from '../../src/app/trabalhos';

const t = (caminho: string, extra: Partial<Trabalho> = {}): Trabalho => ({
  caminho,
  nome: caminho.split('/').pop()!,
  estado: { n: 1 },
  info: [],
  ...extra,
});

describe('trabalhos em andamento', () => {
  it('guarda e devolve o trabalho pelo caminho do PDF', () => {
    const l = criarTrabalhos<{ n: number }, string>();
    l.guardar(t('/a/Elegance.pdf'));
    expect(l.buscar('/a/Elegance.pdf')?.nome).toBe('Elegance.pdf');
  });
  it('guardar de novo o mesmo PDF substitui, sem duplicar', () => {
    const l = criarTrabalhos<{ n: number }, string>();
    l.guardar(t('/a/x.pdf', { estado: { n: 1 } }));
    l.guardar(t('/a/x.pdf', { estado: { n: 2 } }));
    expect(l.todos()).toHaveLength(1);
    expect(l.buscar('/a/x.pdf')?.estado.n).toBe(2);
  });
  it('remover tira da lista (concluído ou descartado)', () => {
    const l = criarTrabalhos<{ n: number }, string>();
    l.guardar(t('/a/x.pdf'));
    l.guardar(t('/a/y.pdf'));
    l.remover('/a/x.pdf');
    expect(l.todos().map((x) => x.caminho)).toEqual(['/a/y.pdf']);
  });
  it('mantém a ordem em que foram abertos', () => {
    const l = criarTrabalhos<{ n: number }, string>();
    l.guardar(t('/a/1.pdf'));
    l.guardar(t('/a/2.pdf'));
    l.guardar(t('/a/1.pdf'));
    expect(l.todos().map((x) => x.caminho)).toEqual(['/a/1.pdf', '/a/2.pdf']);
  });
});
