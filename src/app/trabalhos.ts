/** Um PDF aberto que ainda não foi concluído: guarda as cores escolhidas até o usuário concluir. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Trabalho<E = any, I = any> {
  /** Caminho completo do PDF; identifica o trabalho. */
  caminho: string;
  nome: string;
  estado: E;
  info: I;
}

export function criarTrabalhos<E, I>() {
  const lista: Trabalho<E, I>[] = [];
  const indice = (caminho: string) => lista.findIndex((t) => t.caminho === caminho);
  return {
    guardar(t: Trabalho<E, I>): void {
      const i = indice(t.caminho);
      if (i >= 0) lista[i] = t;
      else lista.push(t);
    },
    buscar: (caminho: string): Trabalho<E, I> | undefined => lista[indice(caminho)],
    remover(caminho: string): void {
      const i = indice(caminho);
      if (i >= 0) lista.splice(i, 1);
    },
    todos: (): readonly Trabalho<E, I>[] => [...lista],
  };
}
