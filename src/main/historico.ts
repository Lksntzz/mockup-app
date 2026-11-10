import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { entradaValida, type EntradaHistorico } from '../app/historico';

const MAXIMO = 300;

/** Nome de operador → nome de pasta: nada que o Windows recuse e nada que suba de pasta ("..", barras). */
export function nomeSeguro(usuario: string): string {
  const n = usuario.replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/\.{2,}/g, '_').replace(/^\.+/, '_').replace(/\.+$/, '_');
  return n.replace(/_/g, '') === '' ? 'usuario' : n;
}

/** Histórico de um operador, guardado num arquivo JSON só dele. */
export function criarHistorico(arquivo: string) {
  async function ler(): Promise<EntradaHistorico[]> {
    try {
      const bruto = JSON.parse(await readFile(arquivo, 'utf-8')) as unknown;
      return Array.isArray(bruto) ? bruto.filter(entradaValida) : [];
    } catch {
      return []; // ainda não existe, ou está corrompido: recomeça vazio
    }
  }
  async function gravar(lista: EntradaHistorico[]): Promise<void> {
    await mkdir(dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.tmp`;
    await writeFile(tmp, JSON.stringify(lista, null, 2), 'utf-8');
    await rename(tmp, arquivo);
  }
  const ordenar = (l: EntradaHistorico[]) => [...l].sort((a, b) => b.data.localeCompare(a.data));

  return {
    async listar(): Promise<EntradaHistorico[]> {
      return ordenar(await ler());
    },
    async salvar(entrada: EntradaHistorico): Promise<void> {
      const resto = (await ler()).filter((e) => e.id !== entrada.id);
      await gravar(ordenar([entrada, ...resto]).slice(0, MAXIMO));
    },
    async remover(id: string): Promise<void> {
      await gravar((await ler()).filter((e) => e.id !== id));
    },
  };
}
