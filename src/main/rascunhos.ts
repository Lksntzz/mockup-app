import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { rascunhoValido, type Rascunho } from '../app/rascunhos';

const MAXIMO = 50;

/** Rascunhos de um operador, num arquivo JSON só dele (um por PDF). */
export function criarRascunhos(arquivo: string) {
  async function ler(): Promise<Rascunho[]> {
    try {
      const bruto = JSON.parse(await readFile(arquivo, 'utf-8')) as unknown;
      return Array.isArray(bruto) ? bruto.filter(rascunhoValido) : [];
    } catch {
      return [];
    }
  }
  async function gravar(lista: Rascunho[]): Promise<void> {
    await mkdir(dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.tmp`;
    await writeFile(tmp, JSON.stringify(lista, null, 2), 'utf-8');
    await rename(tmp, arquivo);
  }
  const ordenar = (l: Rascunho[]) => [...l].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  return {
    async listar(): Promise<Rascunho[]> {
      return ordenar(await ler());
    },
    async salvar(r: Rascunho): Promise<void> {
      const resto = (await ler()).filter((x) => x.caminho !== r.caminho);
      await gravar(ordenar([r, ...resto]).slice(0, MAXIMO));
    },
    async remover(caminho: string): Promise<void> {
      await gravar((await ler()).filter((x) => x.caminho !== caminho));
    },
  };
}
