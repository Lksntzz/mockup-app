import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ConfigDesigner {
  /** Liga as funções só do designer (painel da Pasta 1, qualidade, enviar para aprovar). Desligado por padrão. */
  designer: boolean;
  pasta1?: string;
  pasta2?: string;
}

/** Configuração do Modo designer, num arquivo só desta máquina (nunca vai para o GitHub). */
export function criarConfigDesigner(arquivo: string) {
  async function ler(): Promise<ConfigDesigner> {
    try {
      const b = JSON.parse(await readFile(arquivo, 'utf-8')) as Record<string, unknown>;
      if (typeof b.designer !== 'boolean') return { designer: false };
      const c: ConfigDesigner = { designer: b.designer };
      if (typeof b.pasta1 === 'string') c.pasta1 = b.pasta1;
      if (typeof b.pasta2 === 'string') c.pasta2 = b.pasta2;
      return c;
    } catch {
      return { designer: false };
    }
  }
  return {
    ler,
    async salvar(parcial: Partial<ConfigDesigner>): Promise<ConfigDesigner> {
      const novo = { ...(await ler()), ...parcial };
      await mkdir(dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.tmp`;
      await writeFile(tmp, JSON.stringify(novo, null, 2), 'utf-8');
      await rename(tmp, arquivo);
      return novo;
    },
  };
}
